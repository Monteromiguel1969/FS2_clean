import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../models/nido_constants.dart';
import '../models/nido_filter.dart';
import '../models/nido_grefa_model.dart';

/// Persistencia local (SQLite). Fuente de verdad de la app: todo se lee y
/// escribe aquí, y [SyncService] se encarga de reflejarlo en Supabase.
class DatabaseService {
  DatabaseService({
    this._factory,
    this._databasePath,
    DateTime Function()? clock,
  }) : _clock = clock ?? DateTime.now;

  static const _dbName = 'aguiluchos.db';
  static const _dbVersion = 1;
  static const nidosTable = 'nidos';
  static const metaTable = 'sync_meta';

  final DatabaseFactory? _factory;
  final String? _databasePath;
  final DateTime Function() _clock;

  Database? _db;
  final _changes = StreamController<void>.broadcast();

  /// Emite cada vez que cambia el contenido local (guardado, borrado, sync).
  Stream<void> get changes => _changes.stream;

  /// En Windows/Linux/macOS sqflite no existe de forma nativa: se usa la
  /// implementación FFI. En Android/iOS se usa el plugin nativo.
  static void configureDesktopFactory() {
    if (kIsWeb) return;
    if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    }
  }

  Future<void> init() async {
    if (_db != null) return;
    final factory = _factory ?? databaseFactory;
    final path = _databasePath ?? await _defaultPath();
    _db = await factory.openDatabase(
      path,
      options: OpenDatabaseOptions(
        version: _dbVersion,
        onCreate: (db, v) async {
          final cols = nidoColumns
              .map((c) => '${c.key} ${c.sqliteType}')
              .join(',\n  ');
          await db.execute('''
CREATE TABLE $nidosTable (
  id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  is_synced INTEGER NOT NULL DEFAULT 0,
  has_conflict INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  local_image_paths TEXT NOT NULL DEFAULT '[]',
  remote_image_urls TEXT NOT NULL DEFAULT '[]',
  $cols
)''');
          await db.execute(
              'CREATE INDEX idx_nidos_synced ON $nidosTable(is_synced)');
          await db.execute(
              'CREATE INDEX idx_nidos_municipio ON $nidosTable(municipio)');
          await db.execute(
              'CREATE TABLE $metaTable (key TEXT PRIMARY KEY, value TEXT)');
        },
      ),
    );
  }

  Future<String> _defaultPath() async {
    final dir = await getApplicationDocumentsDirectory();
    return p.join(dir.path, _dbName);
  }

  Database get _database {
    final db = _db;
    if (db == null) {
      throw StateError('DatabaseService.init() no se ha llamado.');
    }
    return db;
  }

  Future<void> close() async {
    await _db?.close();
    _db = null;
    await _changes.close();
  }

  void _notify() {
    if (!_changes.isClosed) _changes.add(null);
  }

  // ── CRUD usado por la UI ─────────────────────────────────────────────────

  /// Inserta o actualiza un nido. Siempre marca `isSynced=false`, refresca
  /// `updatedAt` y limpia `hasConflict` (el usuario ya lo ha revisado).
  Future<NidoGrefaModel> guardar(NidoGrefaModel nido) async {
    nido
      ..updatedAt = _clock().toUtc()
      ..isSynced = false
      ..hasConflict = false;
    await _database.insert(nidosTable, nido.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace);
    _notify();
    return nido;
  }

  /// Alias semántico de [guardar] para ediciones.
  Future<NidoGrefaModel> editar(NidoGrefaModel nido) => guardar(nido);

  Future<NidoGrefaModel?> obtener(String id, {bool incluirBorrados = false}) async {
    final rows = await _database.query(
      nidosTable,
      where: incluirBorrados ? 'id = ?' : 'id = ? AND is_deleted = 0',
      whereArgs: [id],
      limit: 1,
    );
    return rows.isEmpty ? null : NidoGrefaModel.fromMap(rows.first);
  }

  /// Consulta con filtros (excluye los borrados lógicamente). Orden: más
  /// recientes primero.
  Future<List<NidoGrefaModel>> consultar([NidoFilter filter = const NidoFilter()]) async {
    final where = <String>['is_deleted = 0'];
    final args = <Object?>[];

    if (filter.municipios.isNotEmpty) {
      where.add(
          'municipio IN (${List.filled(filter.municipios.length, '?').join(',')})');
      args.addAll(filter.municipios);
    }
    switch (filter.estado) {
      case EstadoReproductivo.todos:
        break;
      case EstadoReproductivo.exito:
        where.add('resultado_reproductivo = ?');
        args.add(ResultadoReproductivo.exito);
      case EstadoReproductivo.fracaso:
        where.add('resultado_reproductivo = ?');
        args.add(ResultadoReproductivo.fracaso);
      case EstadoReproductivo.enCurso:
        where.add(
            "(resultado_reproductivo IS NULL OR resultado_reproductivo = '')");
    }
    const refDate =
        'COALESCE(fecha_entrada_nido, fecha_incubacion, fecha_eclosion, fecha_vuelo)';
    if (filter.fechaDesde != null) {
      where.add('$refDate >= ?');
      args.add(_iso(filter.fechaDesde!));
    }
    if (filter.fechaHasta != null) {
      where.add('$refDate <= ?');
      args.add(_iso(filter.fechaHasta!));
    }

    final rows = await _database.query(
      nidosTable,
      where: where.join(' AND '),
      whereArgs: args,
      orderBy: 'updated_at DESC',
    );
    var nidos = rows.map(NidoGrefaModel.fromMap).toList();

    // La búsqueda libre se hace en Dart: SQLite LIKE no ignora mayúsculas
    // acentuadas (Á/á) y el volumen de datos es pequeño.
    final q = filter.query.trim().toLowerCase();
    if (q.isNotEmpty) {
      nidos = nidos
          .where((n) =>
              (n.etiqueta ?? '').toLowerCase().contains(q) ||
              (n.propietario ?? '').toLowerCase().contains(q))
          .toList();
    }
    return nidos;
  }

  /// Borrado lógico: se conserva una marca (tombstone) pendiente de sync para
  /// que el borrado llegue a Supabase. Tras subirse se elimina físicamente.
  Future<void> borrar(String id) async {
    await _database.update(
      nidosTable,
      {
        'is_deleted': 1,
        'is_synced': 0,
        'has_conflict': 0,
        'updated_at': _clock().toUtc().millisecondsSinceEpoch,
      },
      where: 'id = ?',
      whereArgs: [id],
    );
    _notify();
  }

  Future<List<String>> municipios() async {
    final rows = await _database.rawQuery(
        "SELECT DISTINCT municipio FROM $nidosTable WHERE is_deleted = 0 AND municipio IS NOT NULL AND municipio <> '' ORDER BY municipio COLLATE NOCASE");
    return rows.map((r) => r['municipio'] as String).toList();
  }

  // ── Operaciones usadas por SyncService ───────────────────────────────────

  /// Registros con cambios locales por subir (incluye borrados lógicos).
  Future<List<NidoGrefaModel>> pendientes() async {
    final rows = await _database.query(nidosTable,
        where: 'is_synced = 0', orderBy: 'updated_at ASC');
    return rows.map(NidoGrefaModel.fromMap).toList();
  }

  Future<int> contarPendientes() async {
    final r = await _database
        .rawQuery('SELECT COUNT(*) AS c FROM $nidosTable WHERE is_synced = 0');
    return Sqflite.firstIntValue(r) ?? 0;
  }

  /// Guarda un registro recibido del servidor sin marcarlo como pendiente.
  /// Conserva las rutas de fotos locales del registro existente.
  Future<void> aplicarRemoto(NidoGrefaModel remoto, {bool conflicto = false}) async {
    final existente = await obtener(remoto.id, incluirBorrados: true);
    remoto
      ..isSynced = true
      ..hasConflict = conflicto
      ..localImagePaths = existente?.localImagePaths ?? <String>[];
    await _database.insert(nidosTable, remoto.toMap(),
        conflictAlgorithm: ConflictAlgorithm.replace);
    _notify();
  }

  /// Marca como sincronizado solo si no se editó mientras se subía
  /// (`updated_at` sigue igual). Devuelve `true` si se marcó.
  Future<bool> marcarSincronizado(String id, DateTime updatedAt) async {
    final n = await _database.update(
      nidosTable,
      {'is_synced': 1},
      where: 'id = ? AND updated_at = ?',
      whereArgs: [id, updatedAt.toUtc().millisecondsSinceEpoch],
    );
    if (n > 0) _notify();
    return n > 0;
  }

  /// Actualiza las URLs remotas de fotos sin tocar `updatedAt` ni `isSynced`.
  Future<void> actualizarUrlsRemotas(String id, List<String> urls) async {
    await _database.update(
      nidosTable,
      {'remote_image_urls': jsonEncode(urls)},
      where: 'id = ?',
      whereArgs: [id],
    );
    _notify();
  }

  Future<void> descartarConflicto(String id) async {
    await _database.update(nidosTable, {'has_conflict': 0},
        where: 'id = ?', whereArgs: [id]);
    _notify();
  }

  /// Eliminación física (tombstones ya sincronizados).
  Future<void> purgar(String id) async {
    await _database.delete(nidosTable, where: 'id = ?', whereArgs: [id]);
    _notify();
  }

  Future<String?> leerMeta(String key) async {
    final rows = await _database
        .query(metaTable, where: 'key = ?', whereArgs: [key], limit: 1);
    return rows.isEmpty ? null : rows.first['value'] as String?;
  }

  Future<void> escribirMeta(String key, String value) async {
    await _database.insert(metaTable, {'key': key, 'value': value},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  static String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}
