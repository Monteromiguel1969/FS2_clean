import 'dart:io';

import 'package:aguiluchos/models/nido_grefa_model.dart';
import 'package:aguiluchos/services/database_service.dart';
import 'package:aguiluchos/services/remote_nidos_gateway.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Reloj controlable para tests deterministas.
class FakeClock {
  FakeClock([DateTime? start]) : _now = start ?? DateTime.utc(2026, 5, 1, 10);
  DateTime _now;
  DateTime call() => _now;
  void advance(Duration d) => _now = _now.add(d);
  set now(DateTime v) => _now = v;
}

Future<DatabaseService> openTestDb(FakeClock clock) async {
  sqfliteFfiInit();
  final db = DatabaseService(
    factory: databaseFactoryFfi,
    databasePath: inMemoryDatabasePath,
    clock: clock.call,
  );
  await db.init();
  return db;
}

/// Backend en memoria que imita a Supabase, incluido el trigger de servidor
/// que descarta escrituras con `updated_at` anterior al almacenado.
class FakeGateway implements RemoteNidosGateway {
  final Map<String, NidoGrefaModel> rows = {};
  final Map<String, DateTime> serverTimes = {};
  DateTime _serverClock = DateTime.utc(2026, 1, 1);
  bool failNetwork = false;
  bool failUploads = false;
  final List<String> uploaded = [];
  int upsertCalls = 0;

  DateTime _tick() => _serverClock = _serverClock.add(const Duration(seconds: 1));

  /// Simula una edición hecha por otro operario / panel web.
  void remoteWrite(NidoGrefaModel n) {
    rows[n.id] = NidoGrefaModel.fromJson(n.toJson());
    serverTimes[n.id] = _tick();
  }

  @override
  Future<List<RemoteChange>> fetchChanges({
    DateTime? since,
    required int offset,
    required int limit,
  }) async {
    if (failNetwork) throw const SocketException('sin red');
    final items = rows.keys
        .where((id) => since == null || !serverTimes[id]!.isBefore(since))
        .toList()
      ..sort((a, b) => serverTimes[a]!.compareTo(serverTimes[b]!));
    return items
        .skip(offset)
        .take(limit)
        .map((id) => RemoteChange(rows[id]!, serverTimes[id]!))
        .toList();
  }

  @override
  Future<NidoGrefaModel> upsert(NidoGrefaModel nido) async {
    if (failNetwork) throw const SocketException('sin red');
    upsertCalls++;
    final existing = rows[nido.id];
    if (existing != null && nido.updatedAt.isBefore(existing.updatedAt)) {
      return NidoGrefaModel.fromJson(existing.toJson());
    }
    remoteWrite(nido);
    return NidoGrefaModel.fromJson(rows[nido.id]!.toJson());
  }

  @override
  Future<String> uploadImage({required String nidoId, required File file}) async {
    if (failUploads) throw const SocketException('fallo subida');
    final name = file.uri.pathSegments.last;
    uploaded.add('$nidoId/$name');
    return 'https://proyecto.supabase.co/storage/v1/object/public/nidos-fotos/$nidoId/$name';
  }
}

NidoGrefaModel nidoDeEjemplo({
  String? id,
  String etiqueta = 'N-001',
  String municipio = 'Villalba',
  DateTime? updatedAt,
}) =>
    NidoGrefaModel(id: id, updatedAt: updatedAt)
      ..etiqueta = etiqueta
      ..municipio = municipio
      ..especie = 'Aguilucho cenizo'
      ..propietario = 'Juan Pérez';
