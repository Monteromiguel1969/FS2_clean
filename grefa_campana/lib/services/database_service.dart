import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../models/nido_campo.dart';
import '../models/nido_grefa_model.dart';

/// Base de datos local (SQLite) para uso offline en móvil y escritorio.
///
/// En Android/iOS/macOS se usa `sqflite`; en Windows/Linux `sqflite_common_ffi`
/// (ver [DatabaseService.inicializarFactoriaPlataforma]).
class DatabaseService {
  DatabaseService._(this._db);

  final Database _db;

  static const String tabla = 'nidos';
  static const String tablaMeta = 'sync_meta';
  static const int _version = 1;

  static DatabaseFactory? _fabrica;

  /// Debe llamarse una vez al arrancar (antes de [abrir]). Windows y Linux
  /// usan SQLite vía FFI; Android, iOS y macOS usan el plugin nativo de sqflite.
  static void inicializarFactoriaPlataforma() {
    if (Platform.isWindows || Platform.isLinux) usarFabrica(_ffi());
  }

  /// Fuerza la fábrica de BD (p. ej. FFI en tests). No toca la global de sqflite.
  static void usarFabrica(DatabaseFactory fabrica) => _fabrica = fabrica;

  static DatabaseFactory _ffi() {
    sqfliteFfiInit();
    return databaseFactoryFfi;
  }

  /// Abre (o crea) la BD. Con [ruta] == `inMemoryDatabasePath` es efímera
  /// (tests). Sin [ruta] usa el directorio de soporte de la aplicación.
  static Future<DatabaseService> abrir({String? ruta}) async {
    final destino =
        ruta ??
        p.join(
          (await getApplicationSupportDirectory()).path,
          'grefa_campana.db',
        );
    if (ruta == null) {
      await Directory(p.dirname(destino)).create(recursive: true);
    }
    final fabrica = _fabrica ?? databaseFactory;
    final db = await fabrica.openDatabase(
      destino,
      options: OpenDatabaseOptions(
        version: _version,
        onCreate: (db, v) async {
          await db.execute(_sqlCrearTabla());
          await db.execute(
            'CREATE INDEX idx_nidos_synced ON $tabla (is_synced)',
          );
          await db.execute(
            'CREATE TABLE $tablaMeta (clave TEXT PRIMARY KEY, valor TEXT)',
          );
        },
      ),
    );
    return DatabaseService._(db);
  }

  static String _sqlCrearTabla() {
    final cols = <String>[
      'id TEXT PRIMARY KEY',
      for (final c in camposNido) '${c.clave} ${c.tipoSqlite}',
      'updated_at TEXT NOT NULL',
      'is_synced INTEGER NOT NULL DEFAULT 0',
      'has_conflict INTEGER NOT NULL DEFAULT 0',
      "local_image_paths TEXT NOT NULL DEFAULT '[]'",
      "image_urls TEXT NOT NULL DEFAULT '[]'",
      'last_synced_at TEXT',
    ];
    return 'CREATE TABLE $tabla (${cols.join(', ')})';
  }

  Future<void> cerrar() => _db.close();

  /// Guarda o edita un nido por acción del usuario: actualiza `updatedAt` y
  /// marca `isSynced = false` para que la siguiente sincronización lo suba.
  Future<NidoGrefaModel> guardarNido(
    NidoGrefaModel nido, {
    DateTime? ahora,
  }) async {
    nido.updatedAt = (ahora ?? DateTime.now()).toUtc();
    nido.isSynced = false;
    await _db.insert(
      tabla,
      nido.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    return nido;
  }

  /// Aplica una versión remota tal cual (isSynced = true), conservando las
  /// rutas de imágenes locales ya existentes.
  Future<void> guardarDesdeRemoto(
    NidoGrefaModel remoto, {
    bool hasConflict = false,
  }) async {
    final local = await obtenerPorId(remoto.id);
    remoto
      ..isSynced = true
      ..hasConflict = hasConflict || (local?.hasConflict ?? false)
      ..lastSyncedAt = remoto.updatedAt
      ..localImagePaths = local?.localImagePaths ?? <String>[];
    await _db.insert(
      tabla,
      remoto.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Marca como sincronizado el nido [id] solo si no fue editado mientras se
  /// subía (`updatedAt` sigue igual a [versionSubida]). Devuelve `true` si lo
  /// marcó.
  Future<bool> marcarSincronizado(
    String id, {
    required DateTime versionSubida,
    required DateTime versionServidor,
  }) async {
    final actual = await obtenerPorId(id);
    if (actual == null) return false;
    if (actual.updatedAt.toUtc() != versionSubida.toUtc()) {
      // Editado durante la subida: se mantiene pendiente, pero se recuerda la
      // versión del servidor para no detectar un falso conflicto.
      await _db.update(
        tabla,
        {'last_synced_at': versionServidor.toUtc().toIso8601String()},
        where: 'id = ?',
        whereArgs: [id],
      );
      return false;
    }
    await _db.update(
      tabla,
      {
        'is_synced': 1,
        'updated_at': versionServidor.toUtc().toIso8601String(),
        'last_synced_at': versionServidor.toUtc().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [id],
    );
    return true;
  }

  /// Registra una URL pública recién subida sin alterar `updatedAt`. Con
  /// [marcarPendiente] el nido pasa a `isSynced = false` para que la nueva URL
  /// se publique en la tabla remota en el mismo ciclo.
  Future<void> agregarImageUrl(
    String id,
    String url, {
    bool marcarPendiente = false,
  }) async {
    final n = await obtenerPorId(id);
    if (n == null || n.imageUrls.contains(url)) return;
    n.imageUrls = [...n.imageUrls, url];
    await _db.update(
      tabla,
      {
        'image_urls': n.toMap()['image_urls'],
        if (marcarPendiente) 'is_synced': 0,
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> actualizarMarcaConflicto(String id, bool hasConflict) async {
    await _db.update(
      tabla,
      {'has_conflict': hasConflict ? 1 : 0},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> actualizarVersionServidor(String id, DateTime version) async {
    await _db.update(
      tabla,
      {'last_synced_at': version.toUtc().toIso8601String()},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<NidoGrefaModel?> obtenerPorId(String id) async {
    final r = await _db.query(
      tabla,
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    return r.isEmpty ? null : NidoGrefaModel.fromMap(r.first);
  }

  /// Todos los nidos, los modificados más recientemente primero.
  Future<List<NidoGrefaModel>> obtenerTodos() async {
    final r = await _db.query(tabla, orderBy: 'updated_at DESC');
    return r.map(NidoGrefaModel.fromMap).toList();
  }

  /// Nidos con cambios pendientes de subir (`isSynced == false`).
  Future<List<NidoGrefaModel>> obtenerPendientes() async {
    final r = await _db.query(
      tabla,
      where: 'is_synced = 0',
      orderBy: 'updated_at ASC',
    );
    return r.map(NidoGrefaModel.fromMap).toList();
  }

  Future<int> contarPendientes() async {
    final r = await _db.rawQuery(
      'SELECT COUNT(*) c FROM $tabla WHERE is_synced = 0',
    );
    return (r.first['c'] as int?) ?? 0;
  }

  // ---- Metadatos de sincronización ----

  Future<String?> leerMeta(String clave) async {
    final r = await _db.query(
      tablaMeta,
      where: 'clave = ?',
      whereArgs: [clave],
      limit: 1,
    );
    return r.isEmpty ? null : r.first['valor'] as String?;
  }

  Future<void> escribirMeta(String clave, String valor) async {
    await _db.insert(tablaMeta, {
      'clave': clave,
      'valor': valor,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }
}
