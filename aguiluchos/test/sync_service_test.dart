import 'dart:async';
import 'dart:io';

import 'package:aguiluchos/models/nido_grefa_model.dart';
import 'package:aguiluchos/services/database_service.dart';
import 'package:aguiluchos/services/remote_nidos_gateway.dart';
import 'package:aguiluchos/services/sync_service.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/fakes.dart';

void main() {
  late FakeClock clock;
  late DatabaseService db;
  late FakeGateway gw;
  late StreamController<bool> conn;
  late SyncService sync;
  late Directory tmp;

  Future<void> settle() async {
    for (var i = 0; i < 20; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 5));
      if (sync.state.status != SyncStatus.syncing) {
        await Future<void>.delayed(const Duration(milliseconds: 5));
        if (sync.state.status != SyncStatus.syncing) return;
      }
    }
  }

  Future<void> arrancar({bool online = true, RemoteNidosGateway? gateway}) async {
    sync = SyncService(
      db: db,
      gateway: gateway ?? gw,
      connectivityStream: conn.stream,
      initialConnectivity: () async => online,
      clock: clock.call,
      pageSize: 2,
      periodicInterval: const Duration(hours: 1),
    );
    await sync.start();
    await settle();
  }

  setUp(() async {
    clock = FakeClock();
    db = await openTestDb(clock);
    gw = FakeGateway();
    conn = StreamController<bool>.broadcast();
    tmp = await Directory.systemTemp.createTemp('sync_test');
  });

  tearDown(() async {
    sync.dispose();
    await conn.close();
    await db.close();
    await tmp.delete(recursive: true);
  });

  test('sin gateway (Supabase sin configurar) no sincroniza y lo indica', () async {
    sync = SyncService(db: db, connectivityStream: conn.stream, initialConnectivity: () async => true);
    await sync.start();
    await db.guardar(nidoDeEjemplo());
    await settle();
    final r = await sync.syncNow();
    expect(r.skippedReason, contains('no está configurado'));
    expect(sync.state.isConfigured, isFalse);
    expect(sync.state.status, SyncStatus.pending);
    expect(sync.state.pendingCount, 1);
  });

  test('sin conexión no llama al servidor y queda pendiente', () async {
    await arrancar(online: false);
    await db.guardar(nidoDeEjemplo());
    await settle();
    final r = await sync.syncNow();
    expect(r.skippedReason, 'Sin conexión');
    expect(gw.upsertCalls, 0);
    expect(sync.state.status, SyncStatus.pending);
  });

  test('push: sube registros pendientes y los marca como sincronizados', () async {
    await arrancar();
    final n = nidoDeEjemplo();
    await db.guardar(n);
    final r = await sync.syncNow();

    expect(r.ok, isTrue);
    expect(r.pushed, 1);
    expect(gw.rows[n.id]!.etiqueta, 'N-001');
    expect((await db.obtener(n.id))!.isSynced, isTrue);
    expect(sync.state.status, SyncStatus.synced);
    expect(sync.state.pendingCount, 0);
    expect(sync.state.lastSyncAt, isNotNull);
  });

  test('al recuperar la conexión sincroniza automáticamente', () async {
    await arrancar(online: false);
    final n = nidoDeEjemplo();
    await db.guardar(n);
    await settle();
    expect(sync.state.status, SyncStatus.pending);

    conn.add(true);
    await settle();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(gw.rows.containsKey(n.id), isTrue);
    expect(sync.state.status, SyncStatus.synced);
  });

  test('el stream de estado emite pendiente -> sincronizando -> sincronizado', () async {
    await arrancar();
    final estados = <SyncStatus>[];
    final sub = sync.stateStream.listen((s) => estados.add(s.status));
    await db.guardar(nidoDeEjemplo());
    await settle();
    await sync.syncNow();
    await Future<void>.delayed(const Duration(milliseconds: 20));
    await sub.cancel();
    expect(estados, contains(SyncStatus.pending));
    expect(estados, contains(SyncStatus.syncing));
    expect(estados.last, SyncStatus.synced);
  });

  test('fallo de red: se mantiene pendiente con error y reintenta después', () async {
    await arrancar();
    final n = nidoDeEjemplo();
    await db.guardar(n);
    gw.failNetwork = true;
    final r = await sync.syncNow();
    expect(r.ok, isFalse);
    expect(sync.state.lastError, isNotNull);
    expect(sync.state.status, SyncStatus.pending);

    gw.failNetwork = false;
    final r2 = await sync.syncNow();
    expect(r2.ok, isTrue);
    expect(sync.state.lastError, isNull);
    expect(sync.state.status, SyncStatus.synced);
  });

  group('Last-Write-Wins', () {
    test('local más reciente que el remoto: gana la local, sin conflicto', () async {
      await arrancar();
      final id = 'aaaaaaaa-0000-4000-8000-000000000001';
      gw.remoteWrite(nidoDeEjemplo(id: id, etiqueta: 'REMOTO', updatedAt: DateTime.utc(2026, 5, 1, 9)));

      clock.now = DateTime.utc(2026, 5, 1, 12);
      await db.guardar(nidoDeEjemplo(id: id, etiqueta: 'LOCAL'));
      final r = await sync.syncNow();

      expect(r.conflicts, 0);
      expect(gw.rows[id]!.etiqueta, 'LOCAL');
      final l = (await db.obtener(id))!;
      expect(l.etiqueta, 'LOCAL');
      expect(l.hasConflict, isFalse);
      expect(l.isSynced, isTrue);
    });

    test('remoto más reciente que una edición local pendiente: gana el remoto y hasConflict=true', () async {
      await arrancar();
      final id = 'aaaaaaaa-0000-4000-8000-000000000002';
      clock.now = DateTime.utc(2026, 5, 1, 9);
      await db.guardar(nidoDeEjemplo(id: id, etiqueta: 'LOCAL-OFFLINE'));

      gw.remoteWrite(nidoDeEjemplo(id: id, etiqueta: 'PANEL-WEB', updatedAt: DateTime.utc(2026, 5, 1, 12)));
      final r = await sync.syncNow();

      expect(r.conflicts, 1);
      final l = (await db.obtener(id))!;
      expect(l.etiqueta, 'PANEL-WEB');
      expect(l.hasConflict, isTrue);
      expect(l.isSynced, isTrue);
      expect(gw.rows[id]!.etiqueta, 'PANEL-WEB');
      expect(await db.contarPendientes(), 0);
    });

    test('carrera en el push: el servidor conserva una versión más reciente -> conflicto', () async {
      // Pull no ve el cambio remoto (cursor ya pasó), pero el servidor lo tiene
      // cuando llega el upsert: el trigger descarta nuestra escritura.
      await arrancar();
      final id = 'aaaaaaaa-0000-4000-8000-000000000003';
      clock.now = DateTime.utc(2026, 5, 1, 9);
      await db.guardar(nidoDeEjemplo(id: id, etiqueta: 'LOCAL'));
      final racing = _RacingGateway(gw, () {
        gw.remoteWrite(nidoDeEjemplo(id: id, etiqueta: 'OTRO', updatedAt: DateTime.utc(2026, 5, 1, 11)));
      });
      sync.dispose();
      await arrancar(gateway: racing);
      await sync.syncNow();

      final l = (await db.obtener(id))!;
      expect(l.etiqueta, 'OTRO');
      expect(l.hasConflict, isTrue);
    });
  });

  group('Pull incremental', () {
    test('descarga registros nuevos de otros operarios (paginado)', () async {
      for (var i = 0; i < 5; i++) {
        gw.remoteWrite(nidoDeEjemplo(
            id: 'bbbbbbbb-0000-4000-8000-00000000000$i',
            etiqueta: 'R-$i',
            updatedAt: DateTime.utc(2026, 4, 1, i)));
      }
      await arrancar();
      expect((await db.consultar()).length, 5);
      expect((await db.consultar()).every((n) => n.isSynced), isTrue);
      expect(await db.contarPendientes(), 0);
    });

    test('usa cursor server_updated_at: solo trae lo posterior', () async {
      gw.remoteWrite(nidoDeEjemplo(id: 'cccccccc-0000-4000-8000-000000000001', etiqueta: 'viejo'));
      await arrancar();
      expect(await db.leerMeta('last_pull_server_updated_at'), isNotNull);

      final pedidos = <DateTime?>[];
      final espia = _SpyGateway(gw, pedidos.add);
      sync.dispose();
      await arrancar(gateway: espia);
      // el cursor es inclusivo (gte): el último registro puede repetirse, pero
      // nunca se pide desde el principio.
      expect(pedidos, isNotEmpty);
      expect(pedidos.every((s) => s != null), isTrue);

      gw.remoteWrite(nidoDeEjemplo(id: 'cccccccc-0000-4000-8000-000000000002', etiqueta: 'nuevo'));
      await sync.syncNow();
      expect((await db.consultar()).map((n) => n.etiqueta).toSet(), {'viejo', 'nuevo'});
    });

    test('un registro editado offline (updatedAt antiguo) y subido tarde lo ven otros dispositivos', () async {
      // Operario A guarda offline a las 09:00 y sube a las 15:00. El dispositivo B
      // ya había sincronizado a las 12:00: sin cursor de servidor no lo vería.
      final id = 'dddddddd-0000-4000-8000-000000000001';
      await arrancar();
      gw.remoteWrite(nidoDeEjemplo(id: 'dddddddd-0000-4000-8000-000000000009', etiqueta: 'otro'));
      await sync.syncNow();

      gw.remoteWrite(nidoDeEjemplo(id: id, etiqueta: 'subido-tarde', updatedAt: DateTime.utc(2026, 5, 1, 9)));
      await sync.syncNow();
      expect((await db.obtener(id))?.etiqueta, 'subido-tarde');
    });

    test('un borrado remoto elimina el registro local sincronizado', () async {
      final id = 'eeeeeeee-0000-4000-8000-000000000001';
      await arrancar();
      await db.guardar(nidoDeEjemplo(id: id));
      await sync.syncNow();
      expect(await db.obtener(id), isNotNull);

      gw.remoteWrite(nidoDeEjemplo(id: id, updatedAt: DateTime.utc(2030))..isDeleted = true);
      await sync.syncNow();
      expect(await db.obtener(id, incluirBorrados: true), isNull);
    });

    test('el eco de nuestro propio push no genera conflictos', () async {
      await arrancar();
      await db.guardar(nidoDeEjemplo());
      await sync.syncNow();
      final r = await sync.syncNow();
      expect(r.conflicts, 0);
      expect(r.pushed, 0);
    });
  });

  test('borrado local se propaga como tombstone y se purga tras subirse', () async {
    await arrancar();
    final n = nidoDeEjemplo();
    await db.guardar(n);
    await sync.syncNow();
    clock.advance(const Duration(minutes: 1));
    await db.borrar(n.id);
    await sync.syncNow();

    expect(gw.rows[n.id]!.isDeleted, isTrue);
    expect(await db.obtener(n.id, incluirBorrados: true), isNull);
    expect(await db.contarPendientes(), 0);
  });

  group('Imágenes', () {
    Future<File> foto(String nombre) async {
      final f = File('${tmp.path}/$nombre');
      await f.writeAsBytes([1, 2, 3]);
      return f;
    }

    test('sube localImagePaths y guarda las URLs públicas', () async {
      await arrancar();
      final f1 = await foto('seguimiento_aaa.jpg');
      final f2 = await foto('cosecha_bbb.jpg');
      final n = nidoDeEjemplo()..localImagePaths = [f1.path, f2.path];
      await db.guardar(n);
      final r = await sync.syncNow();

      expect(r.imagesUploaded, 2);
      final l = (await db.obtener(n.id))!;
      expect(l.remoteImageUrls.length, 2);
      expect(l.remoteImageUrls.first, endsWith('/${n.id}/seguimiento_aaa.jpg'));
      expect(l.localImagePaths.length, 2, reason: 'las copias locales se conservan');
      expect(gw.rows[n.id]!.remoteImageUrls, l.remoteImageUrls);
      expect(l.isSynced, isTrue);
    });

    test('no vuelve a subir fotos ya subidas', () async {
      await arrancar();
      final f1 = await foto('seguimiento_aaa.jpg');
      final n = nidoDeEjemplo()..localImagePaths = [f1.path];
      await db.guardar(n);
      await sync.syncNow();
      gw.uploaded.clear();

      final f2 = await foto('cosecha_nueva.jpg');
      await db.guardar((await db.obtener(n.id))!..localImagePaths = [f1.path, f2.path]);
      await sync.syncNow();
      expect(gw.uploaded, ['${n.id}/cosecha_nueva.jpg']);
    });

    test('si falla la subida el nido sigue pendiente y reintenta', () async {
      await arrancar();
      final f1 = await foto('seguimiento_aaa.jpg');
      final n = nidoDeEjemplo()..localImagePaths = [f1.path];
      await db.guardar(n);
      gw.failUploads = true;
      final r = await sync.syncNow();
      expect(r.ok, isFalse);
      expect((await db.obtener(n.id))!.isSynced, isFalse);

      gw.failUploads = false;
      final r2 = await sync.syncNow();
      expect(r2.ok, isTrue);
      expect((await db.obtener(n.id))!.isSynced, isTrue);
      expect((await db.obtener(n.id))!.remoteImageUrls.length, 1);
    });
  });
}

class _RacingGateway extends FakeGateway {
  _RacingGateway(this.inner, this.beforeUpsert);
  final FakeGateway inner;
  final void Function() beforeUpsert;
  bool _done = false;

  @override
  Future<List<RemoteChange>> fetchChanges(
          {DateTime? since, required int offset, required int limit}) =>
      inner.fetchChanges(since: since, offset: offset, limit: limit);

  @override
  Future<NidoGrefaModel> upsert(NidoGrefaModel nido) {
    if (!_done) {
      _done = true;
      beforeUpsert();
    }
    return inner.upsert(nido);
  }
}

class _SpyGateway extends FakeGateway {
  _SpyGateway(this.inner, this.onFetch);
  final FakeGateway inner;
  final void Function(DateTime?) onFetch;

  @override
  Future<List<RemoteChange>> fetchChanges(
      {DateTime? since, required int offset, required int limit}) {
    onFetch(since);
    return inner.fetchChanges(since: since, offset: offset, limit: limit);
  }

  @override
  Future<NidoGrefaModel> upsert(NidoGrefaModel nido) => inner.upsert(nido);
}
