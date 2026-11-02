import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/models/nido_grefa_model.dart';
import 'package:grefa_campana/services/database_service.dart';
import 'package:grefa_campana/services/image_storage_service.dart';
import 'package:grefa_campana/services/sync_service.dart';
import 'package:grefa_campana/state/app_scope.dart';
import 'package:grefa_campana/state/nidos_controller.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../services/fakes.dart';

class Harness {
  Harness._(this.db, this.sync, this.nidos, this.imagenes, this.dir);

  final DatabaseService db;
  final SyncService sync;
  final NidosController nidos;
  final ImageStorageService imagenes;
  final Directory dir;

  static Future<Harness> crear(
    WidgetTester tester, {
    List<NidoGrefaModel> nidos = const [],
  }) async {
    sqfliteFfiInit();
    DatabaseService.usarFabrica(databaseFactoryFfi);
    final h = (await tester.runAsync(() async {
      final db = await DatabaseService.abrir(ruta: inMemoryDatabasePath);
      final dir = await Directory.systemTemp.createTemp('grefa_ui_');
      final sync = SyncService(
        db: db,
        remote: null,
        connectivity: FakeConnectivity(),
        intervaloAutomatico: null,
      );
      final ctrl = NidosController(db: db, sync: sync);
      for (final n in nidos) {
        await db.guardarNido(n);
      }
      await sync.iniciar();
      await ctrl.cargar();
      return Harness._(
        db,
        sync,
        ctrl,
        ImageStorageService(directorio: dir),
        dir,
      );
    }))!;
    addTearDown(() async {
      await tester.runAsync(() async {
        h.sync.dispose();
        h.nidos.dispose();
        await h.db.cerrar();
        if (await h.dir.exists()) await h.dir.delete(recursive: true);
      });
    });
    return h;
  }

  Widget envolver(Widget hijo) => AppScope(
    db: db,
    sync: sync,
    nidos: nidos,
    imagenes: imagenes,
    child: MaterialApp(
      locale: const Locale('es'),
      supportedLocales: const [Locale('es')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: hijo,
    ),
  );
}

/// Deja avanzar E/S real (SQLite, archivos) alternando con el reloj simulado,
/// porque cada paso asíncrono vuelve a la zona de `FakeAsync`.
Future<void> esperarIo(WidgetTester tester, [int iteraciones = 8]) async {
  for (var i = 0; i < iteraciones; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 25)),
    );
    await tester.pump();
  }
}
