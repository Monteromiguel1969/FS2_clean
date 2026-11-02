import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/models/nido_grefa_model.dart';
import 'package:grefa_campana/services/database_service.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../helpers.dart';

void main() {
  late DatabaseService db;

  setUpAll(() {
    sqfliteFfiInit();
    DatabaseService.usarFabrica(databaseFactoryFfi);
  });

  setUp(() async {
    db = await DatabaseService.abrir(ruta: inMemoryDatabasePath);
  });

  tearDown(() => db.cerrar());

  test('guardarNido persiste los 42 campos y marca isSynced = false', () async {
    final n = nidoCompleto()..isSynced = true;
    await db.guardarNido(n, ahora: DateTime.utc(2026, 6, 1, 8));
    expect(n.isSynced, isFalse);
    expect(n.updatedAt, DateTime.utc(2026, 6, 1, 8));

    final leido = (await db.obtenerPorId(n.id))!;
    expect(leido.isSynced, isFalse);
    expect(leido.toJson(), n.toJson());
    expect(leido.localImagePaths, n.localImagePaths);
    expect(leido.tipoAccionesManejo, ['Dron', 'Rodal']);
  });

  test('editar un nido sincronizado lo vuelve pendiente', () async {
    final n = NidoGrefaModel()..etiqueta = 'A';
    await db.guardarNido(n);
    await db.marcarSincronizado(
      n.id,
      versionSubida: n.updatedAt,
      versionServidor: n.updatedAt,
    );
    expect((await db.obtenerPorId(n.id))!.isSynced, isTrue);
    expect(await db.contarPendientes(), 0);

    final editado = (await db.obtenerPorId(n.id))!..etiqueta = 'B';
    await db.guardarNido(editado);
    expect(await db.contarPendientes(), 1);
    expect((await db.obtenerPorId(n.id))!.etiqueta, 'B');
  });

  test(
    'obtenerPendientes devuelve solo isSynced = false, más antiguos primero',
    () async {
      final a = NidoGrefaModel()..etiqueta = 'a';
      final b = NidoGrefaModel()..etiqueta = 'b';
      final c = NidoGrefaModel()..etiqueta = 'c';
      await db.guardarNido(a, ahora: DateTime.utc(2026, 1, 3));
      await db.guardarNido(b, ahora: DateTime.utc(2026, 1, 1));
      await db.guardarNido(c, ahora: DateTime.utc(2026, 1, 2));
      await db.marcarSincronizado(
        c.id,
        versionSubida: c.updatedAt,
        versionServidor: c.updatedAt,
      );
      final pend = await db.obtenerPendientes();
      expect(pend.map((n) => n.etiqueta), ['b', 'a']);
      expect(await db.contarPendientes(), 2);
    },
  );

  test('obtenerTodos ordena por modificación descendente', () async {
    final a = NidoGrefaModel()..etiqueta = 'a';
    final b = NidoGrefaModel()..etiqueta = 'b';
    await db.guardarNido(a, ahora: DateTime.utc(2026, 1, 1));
    await db.guardarNido(b, ahora: DateTime.utc(2026, 1, 2));
    expect((await db.obtenerTodos()).map((n) => n.etiqueta), ['b', 'a']);
  });

  test('marcarSincronizado no marca si se editó durante la subida', () async {
    final n = NidoGrefaModel()..etiqueta = 'x';
    await db.guardarNido(n, ahora: DateTime.utc(2026, 1, 1));
    final subida = n.updatedAt;
    await db.guardarNido(
      n,
      ahora: DateTime.utc(2026, 1, 2),
    ); // edición concurrente
    final ok = await db.marcarSincronizado(
      n.id,
      versionSubida: subida,
      versionServidor: DateTime.utc(2026, 1, 1, 0, 0, 1),
    );
    expect(ok, isFalse);
    final leido = (await db.obtenerPorId(n.id))!;
    expect(leido.isSynced, isFalse);
    expect(leido.lastSyncedAt, DateTime.utc(2026, 1, 1, 0, 0, 1));
  });

  test('guardarDesdeRemoto conserva las rutas locales de imágenes', () async {
    final local = NidoGrefaModel(id: 'n1')
      ..localImagePaths = ['/a/seguimiento_1.jpg']
      ..etiqueta = 'local';
    await db.guardarNido(local);
    final remoto = NidoGrefaModel(id: 'n1', updatedAt: DateTime.utc(2030))
      ..etiqueta = 'remoto';
    await db.guardarDesdeRemoto(remoto, hasConflict: true);
    final r = (await db.obtenerPorId('n1'))!;
    expect(r.etiqueta, 'remoto');
    expect(r.isSynced, isTrue);
    expect(r.hasConflict, isTrue);
    expect(r.localImagePaths, ['/a/seguimiento_1.jpg']);
    expect(r.lastSyncedAt, DateTime.utc(2030));
  });

  test('metadatos clave/valor', () async {
    expect(await db.leerMeta('k'), isNull);
    await db.escribirMeta('k', 'v1');
    await db.escribirMeta('k', 'v2');
    expect(await db.leerMeta('k'), 'v2');
  });
}
