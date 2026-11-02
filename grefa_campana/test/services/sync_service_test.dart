import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/models/nido_grefa_model.dart';
import 'package:grefa_campana/services/database_service.dart';
import 'package:grefa_campana/services/sync_service.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'fakes.dart';

void main() {
  late DatabaseService db;
  late FakeRemote remote;
  late FakeConnectivity red;
  late SyncService sync;
  late Directory tmp;

  setUpAll(() {
    sqfliteFfiInit();
    DatabaseService.usarFabrica(databaseFactoryFfi);
  });

  setUp(() async {
    db = await DatabaseService.abrir(ruta: inMemoryDatabasePath);
    remote = FakeRemote();
    red = FakeConnectivity();
    sync = SyncService(
      db: db,
      remote: remote,
      connectivity: red,
      intervaloAutomatico: null,
    );
    tmp = await Directory.systemTemp.createTemp('grefa_sync_');
  });

  tearDown(() async {
    sync.dispose();
    await db.cerrar();
    if (await tmp.exists()) await tmp.delete(recursive: true);
  });

  Future<NidoGrefaModel> crearLocal(String etiqueta, {DateTime? t}) async {
    final n = NidoGrefaModel()..etiqueta = etiqueta;
    await db.guardarNido(n, ahora: t);
    return n;
  }

  test('sube los pendientes (upsert) y los marca sincronizados', () async {
    final n = await crearLocal('A');
    final r = await sync.sincronizar();

    expect(r.ok, isTrue);
    expect(r.subidos, 1);
    expect(remote.filas[n.id]!['etiqueta'], 'A');
    expect(remote.filas[n.id]!.containsKey('is_synced'), isFalse);
    final local = (await db.obtenerPorId(n.id))!;
    expect(local.isSynced, isTrue);
    expect(local.lastSyncedAt, local.updatedAt);
    expect(sync.pendientes, 0);
    expect(sync.estado, EstadoSync.inactivo);
    expect(sync.ultimaSync, isNotNull);
  });

  test('descarga registros nuevos de otros operarios', () async {
    final otro =
        NidoGrefaModel(id: 'remoto-1', updatedAt: DateTime.utc(2026, 5, 1))
          ..etiqueta = 'Panel web'
          ..municipio = 'Toledo';
    remote.filas['remoto-1'] = otro.toJson();

    final r = await sync.sincronizar();
    expect(r.descargados, 1);
    final local = (await db.obtenerPorId('remoto-1'))!;
    expect(local.etiqueta, 'Panel web');
    expect(local.isSynced, isTrue);
    expect(local.hasConflict, isFalse);
  });

  test('segunda sincronización sin cambios no vuelve a subir nada', () async {
    await crearLocal('A');
    await sync.sincronizar();
    remote.llamadas.clear();
    final r = await sync.sincronizar();
    expect(r.subidos, 0);
    expect(r.descargados, 0);
    expect(remote.llamadas.where((l) => l.startsWith('upsert')), isEmpty);
  });

  test(
    'LWW: el remoto más reciente reemplaza al local ya sincronizado',
    () async {
      final n = await crearLocal('v1', t: DateTime.utc(2026, 5, 1));
      await sync.sincronizar();

      remote.editarRemoto(n.id, {
        'etiqueta': 'v2-web',
      }, DateTime.utc(2026, 5, 2));
      final r = await sync.sincronizar();
      expect(r.descargados, 1);
      expect(r.conflictos, 0);
      final local = (await db.obtenerPorId(n.id))!;
      expect(local.etiqueta, 'v2-web');
      expect(local.hasConflict, isFalse);
    },
  );

  test('conflicto: remoto más reciente que la edición local pendiente gana y marca hasConflict', () async {
    final n = await crearLocal('v1', t: DateTime.utc(2026, 5, 1));
    await sync.sincronizar();

    // El operario edita offline a las 10:00; otro edita en el panel web a las 12:00.
    final editado = (await db.obtenerPorId(n.id))!..etiqueta = 'local-offline';
    await db.guardarNido(editado, ahora: DateTime.utc(2026, 5, 3, 10));
    remote.editarRemoto(n.id, {
      'etiqueta': 'web-12h',
    }, DateTime.utc(2026, 5, 3, 12));

    final r = await sync.sincronizar();
    expect(r.conflictos, 1);
    final local = (await db.obtenerPorId(n.id))!;
    expect(local.etiqueta, 'web-12h');
    expect(local.hasConflict, isTrue);
    expect(local.isSynced, isTrue);
    expect(remote.filas[n.id]!['etiqueta'], 'web-12h');
  });

  test('conflicto: la edición local más reciente gana, se sube y marca hasConflict', () async {
    final n = await crearLocal('v1', t: DateTime.utc(2026, 5, 1));
    await sync.sincronizar();

    remote.editarRemoto(n.id, {
      'etiqueta': 'web-10h',
    }, DateTime.utc(2026, 5, 3, 10));
    final editado = (await db.obtenerPorId(n.id))!..etiqueta = 'local-12h';
    await db.guardarNido(editado, ahora: DateTime.utc(2026, 5, 3, 12));

    final r = await sync.sincronizar();
    expect(r.conflictos, 1);
    expect(remote.filas[n.id]!['etiqueta'], 'local-12h');
    final local = (await db.obtenerPorId(n.id))!;
    expect(local.hasConflict, isTrue);
    expect(local.isSynced, isTrue);
  });

  test(
    'sin edición concurrente la edición local se sube sin conflicto',
    () async {
      final n = await crearLocal('v1', t: DateTime.utc(2026, 5, 1));
      await sync.sincronizar();
      final editado = (await db.obtenerPorId(n.id))!..etiqueta = 'v2';
      await db.guardarNido(editado, ahora: DateTime.utc(2026, 5, 4));
      final r = await sync.sincronizar();
      expect(r.conflictos, 0);
      expect(remote.filas[n.id]!['etiqueta'], 'v2');
      expect((await db.obtenerPorId(n.id))!.hasConflict, isFalse);
    },
  );

  test('si el servidor rechaza por antigüedad se adopta la versión remota con conflicto', () async {
    final n = await crearLocal('v1', t: DateTime.utc(2026, 5, 1));
    await sync.sincronizar();
    // Remoto avanza, pero el cursor local ya lo "vio" (caso límite): se simula
    // forzando que el pull no lo reciba y el push sea rechazado.
    final editado = (await db.obtenerPorId(n.id))!..etiqueta = 'local-viejo';
    await db.guardarNido(editado, ahora: DateTime.utc(2026, 5, 2));
    remote.editarRemoto(n.id, {
      'etiqueta': 'remoto-nuevo',
    }, DateTime.utc(2026, 5, 9));
    await db.escribirMeta(
      'cursor_remoto',
      DateTime.utc(2026, 5, 20).toIso8601String(),
    );

    final r = await sync.sincronizar();
    expect(r.conflictos, 1);
    final local = (await db.obtenerPorId(n.id))!;
    expect(local.etiqueta, 'remoto-nuevo');
    expect(local.hasConflict, isTrue);
    expect(local.isSynced, isTrue);
  });

  test(
    'sube las imágenes de localImagePaths y registra las URLs públicas',
    () async {
      final foto = File(p.join(tmp.path, 'seguimiento_abc.jpg'))
        ..writeAsBytesSync([1, 2, 3]);
      final foto2 = File(p.join(tmp.path, 'cosecha_def.jpg'))
        ..writeAsBytesSync([4, 5]);
      final n = NidoGrefaModel()
        ..etiqueta = 'Con fotos'
        ..localImagePaths = [foto.path, foto2.path];
      await db.guardarNido(n);

      final r = await sync.sincronizar();
      expect(r.ok, isTrue);
      expect(r.imagenesSubidas, 2);
      expect(remote.archivos['${n.id}/seguimiento_abc.jpg'], [1, 2, 3]);

      final local = (await db.obtenerPorId(n.id))!;
      expect(local.imageUrls, hasLength(2));
      expect(local.imageUrls.first, startsWith('https://fake.supabase.co/'));
      expect(local.localImagePaths, [foto.path, foto2.path]);
      expect(local.isSynced, isTrue);
      expect((remote.filas[n.id]!['image_urls'] as List), hasLength(2));
      expect(SyncService.imagenesPendientes(local), isEmpty);

      // No se vuelven a subir en la siguiente sincronización.
      remote.llamadas.clear();
      await sync.sincronizar();
      expect(remote.llamadas.where((l) => l.startsWith('imagen')), isEmpty);
    },
  );

  test('fallo en una imagen: el resto continúa y queda pendiente', () async {
    final foto = File(p.join(tmp.path, 'seguimiento_x.jpg'))
      ..writeAsBytesSync([1]);
    final n = NidoGrefaModel()..localImagePaths = [foto.path];
    await db.guardarNido(n);
    remote.fallarImagenes = true;

    final r = await sync.sincronizar();
    expect(r.ok, isFalse);
    expect(sync.estado, EstadoSync.error);
    expect(SyncService.imagenesPendientes((await db.obtenerPorId(n.id))!), [
      foto.path,
    ]);

    remote.fallarImagenes = false;
    final r2 = await sync.sincronizar();
    expect(r2.ok, isTrue);
    expect(r2.imagenesSubidas, 1);
  });

  test(
    'fallo de red al subir: el nido sigue pendiente y se reintenta',
    () async {
      final n = await crearLocal('A');
      remote.fallarUpsert = true;
      final r = await sync.sincronizar();
      expect(r.ok, isFalse);
      expect(sync.estado, EstadoSync.error);
      expect(sync.pendientes, 1);
      expect((await db.obtenerPorId(n.id))!.isSynced, isFalse);

      remote.fallarUpsert = false;
      final r2 = await sync.sincronizar();
      expect(r2.ok, isTrue);
      expect(sync.pendientes, 0);
    },
  );

  test('sin conexión no llama al servidor y conserva los pendientes', () async {
    await crearLocal('A');
    red.online = false;
    final r = await sync.sincronizar();
    expect(r.ok, isFalse);
    expect(sync.estado, EstadoSync.sinConexion);
    expect(remote.llamadas, isEmpty);
    await sync.refrescarPendientes();
    expect(sync.pendientes, 1);
  });

  test('al recuperar conexión sincroniza automáticamente', () async {
    red.online = false;
    final n = await crearLocal('A');
    await sync.iniciar();
    expect(sync.estado, EstadoSync.sinConexion);

    red.emitir(true);
    await Future<void>.delayed(const Duration(milliseconds: 300));
    expect(remote.filas.containsKey(n.id), isTrue);
    expect(sync.pendientes, 0);
  });

  test('sin Supabase configurado la app queda en modo local', () async {
    final local = SyncService(
      db: db,
      remote: null,
      connectivity: red,
      intervaloAutomatico: null,
    );
    await crearLocal('A');
    await local.iniciar();
    expect(local.configurado, isFalse);
    expect(local.estado, EstadoSync.noConfigurado);
    expect(local.pendientes, 1);
    final r = await local.sincronizar();
    expect(r.ok, isFalse);
    expect(await db.contarPendientes(), 1);
    local.dispose();
  });

  test('imagenesPendientes compara por nombre de archivo', () {
    final n = NidoGrefaModel()
      ..localImagePaths = ['/a/seguimiento_1.jpg', '/a/cosecha_2.jpg']
      ..imageUrls = [
        'https://h/storage/v1/object/public/b/id/seguimiento_1.jpg',
      ];
    expect(SyncService.imagenesPendientes(n), ['/a/cosecha_2.jpg']);
  });
}
