import 'dart:io';

import 'package:aguiluchos/app/aguiluchos_app.dart';
import 'package:aguiluchos/services/database_service.dart';
import 'package:aguiluchos/services/image_storage_service.dart';
import 'package:aguiluchos/services/photo_picker.dart';
import 'package:aguiluchos/services/sync_service.dart';
import 'package:aguiluchos/models/nido_constants.dart';
import 'package:aguiluchos/screens/nido_detail_screen.dart';
import 'package:aguiluchos/app/app_services.dart';
import 'package:aguiluchos/services/export_service.dart';
import 'package:aguiluchos/services/location_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'helpers/fakes.dart';

class _FakePicker implements PhotoPicker {
  _FakePicker(this.file);
  final String file;
  @override
  bool get cameraAvailable => true;
  @override
  Future<String?> tomarFoto() async => file;
  @override
  Future<List<String>> elegirDeGaleria() async => [file];
}

void main() {
  late DatabaseService db;
  late SyncService sync;
  late Directory tmp;

  setUpAll(() async {
    await initializeDateFormatting('es_ES');
    // flutter_map usa path_provider para su caché de teselas.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => Directory.systemTemp.path,
    );
  });

  /// Alterna fotogramas y tiempo real para que avancen cadenas de futuros que
  /// mezclan microtareas (zona falsa) y E/S real (SQLite, ficheros).
  Future<void> esperarIo(WidgetTester tester) async {
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 80)));
    }
    await tester.pump();
    await tester.pump();
  }

  /// Deja que terminen temporizadores (debounce de sync, avisos de sqflite)
  /// y consultas pendientes antes de que acabe el test.
  Future<void> drenar(WidgetTester tester) async {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 150)));
    await tester.pump(const Duration(seconds: 15));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 150)));
    await tester.pump(const Duration(seconds: 15));
  }

  Future<void> arrancar(WidgetTester tester) async {
    await tester.runAsync(() async {
      db = await openTestDb(FakeClock());
      tmp = await Directory.systemTemp.createTemp('widget_test');
    });
    sync = SyncService(db: db);
  }

  tearDown(() async {
    sync.dispose();
    await db.close();
    await tmp.delete(recursive: true);
  });

  Future<void> pumpApp(WidgetTester tester) async {
    await tester.pumpWidget(AguiluchosApp(
      db: db,
      sync: sync,
      images: ImageStorageService(baseDirectory: tmp),
    ));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pump();
  }

  testWidgets('la app arranca offline sin Supabase y muestra Home', (tester) async {
    await arrancar(tester);
    await pumpApp(tester);

    expect(find.text('GREFA - Campaña Aguilucho'), findsOneWidget);
    expect(find.text('Nuevo Nido'), findsOneWidget);
    expect(find.byTooltip('Sincronizar ahora'), findsOneWidget);
    expect(find.byIcon(Icons.cloud_off), findsOneWidget,
        reason: 'sin Supabase configurado el icono avisa modo solo local');
    expect(find.text('Lista'), findsOneWidget);
    expect(find.text('Mapa'), findsOneWidget);
    expect(find.textContaining('Aún no hay nidos'), findsOneWidget);
    await drenar(tester);
  });

  testWidgets('crear un nido: valida, guarda local y aparece en la lista', (tester) async {
    await arrancar(tester);
    await pumpApp(tester);

    await tester.tap(find.text('Nuevo Nido'));
    await tester.pumpAndSettle();
    expect(find.text('Guardar Nido'), findsOneWidget);

    // Sin etiqueta no guarda.
    await tester.tap(find.text('Guardar Nido'));
    await tester.pumpAndSettle();
    expect(find.text('Revisa los datos'), findsOneWidget);
    await tester.tap(find.text('Entendido'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const ValueKey('f-etiqueta')), 'N-77');
    await tester.enterText(find.byKey(const ValueKey('f-municipio')), 'Villalba');
    await tester.tap(find.text('Guardar Nido'));
    await tester.pumpAndSettle();

    final nidos = await tester.runAsync(() => db.consultar());
    expect(nidos!.length, 1);
    expect(nidos.first.etiqueta, 'N-77');
    expect(nidos.first.isSynced, isFalse);

    expect(find.text('N-77'), findsOneWidget);
    expect(find.textContaining('Villalba'), findsWidgets);
    await drenar(tester);
  });

  testWidgets('pestañas: fecha estimada de eclosión, totales y validación de balance', (tester) async {
    await arrancar(tester);
    final nido = nidoDeEjemplo()
      ..fechaIncubacion = DateTime(2026, 5, 1)
      ..numPollosNacidos = 3;
    await tester.runAsync(() => db.guardar(nido));
    await pumpApp(tester);

    await tester.tap(find.text('N-001'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Incubación'));
    await tester.pumpAndSettle();
    expect(find.text('Fecha Estimada de Eclosión'), findsOneWidget);
    expect(find.textContaining('31 de mayo de 2026'), findsOneWidget);

    await tester.tap(find.text('Cosecha y Balance'));
    await tester.pumpAndSettle();
    // +1 en volados pre-cosecha (varias veces) => total refleja la suma.
    final sumar = find.byTooltip('Sumar');
    await tester.ensureVisible(sumar.first);
    await tester.tap(sumar.at(0));
    await tester.pump();
    await tester.tap(sumar.at(0));
    await tester.pump();
    await tester.tap(sumar.at(1));
    await tester.pump();
    final total = tester.widget<TextFormField>(find.byKey(const ValueKey('f-num_pollos_volados')));
    expect(total.controller!.text, '3');
    expect(find.textContaining('Balance: 3 nacidos = 3 volados'), findsOneWidget);

    // Un volado más => incoherente (4 > 3 nacidos): no deja guardar.
    await tester.tap(sumar.at(0));
    await tester.pump();
    expect(find.textContaining('Incoherente'), findsOneWidget);
    await tester.tap(find.text('Guardar Nido'));
    await tester.pumpAndSettle();
    expect(find.textContaining('superan los pollos nacidos'), findsOneWidget);
    await drenar(tester);
  });

  testWidgets('seguimiento: intervención y manejo; la foto se copia y persiste', (tester) async {
    await arrancar(tester);
    final foto = File('${tmp.path}/origen.jpg');
    await tester.runAsync(() => foto.writeAsBytes([0xFF, 0xD8, 0xFF, 0xD9]));
    await tester.pumpWidget(AppServices(
      db: db,
      sync: sync,
      images: ImageStorageService(baseDirectory: tmp),
      location: LocationService(),
      export: ExportService(),
      child: MaterialApp(
        locale: const Locale('es', 'ES'),
        supportedLocales: const [Locale('es', 'ES')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: NidoDetailScreen(photoPicker: _FakePicker(foto.path)),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const ValueKey('f-etiqueta')), 'N-FOTO');
    await tester.tap(find.text('Seguimiento y Manejo'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('manejo-${TiposManejo.dron}')));
    await tester.pump();
    final check = tester.widget<CheckboxListTile>(find.byKey(const ValueKey('f-intervencion')));
    expect(check.value, isTrue, reason: 'elegir un manejo marca la intervención');

    await tester.ensureVisible(find.text('Tomar Fotografía'));
    await tester.tap(find.text('Tomar Fotografía'));
    await esperarIo(tester);
    expect(find.byType(GridView), findsOneWidget);

    await tester.tap(find.text('Guardar Nido'));
    await esperarIo(tester);
    await tester.pumpAndSettle();

    final n = (await tester.runAsync(() => db.consultar()))!.single;
    expect(n.tipoAccionesManejo, ['Dron']);
    expect(n.intervencion, isTrue);
    expect(n.localImagePaths.length, 1);
    final guardada = n.localImagePaths.single;
    expect(guardada, contains('aguiluchos_fotos'));
    expect(File(guardada).uri.pathSegments.last, startsWith('seguimiento_'));
    expect(await tester.runAsync(() => File(guardada).exists()), isTrue);
    await drenar(tester);
  });

  testWidgets('layout ancho (escritorio): panel lateral + mapa y botón de texto', (tester) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await arrancar(tester);
    await tester.runAsync(() => db.guardar(nidoDeEjemplo()));
    await pumpApp(tester);

    expect(find.text('Sincronizar ahora'), findsOneWidget);
    expect(find.byType(SegmentedButton<Object?>), findsNothing);
    expect(find.text('N-001'), findsOneWidget);
    expect(find.textContaining('Ningún nido de la lista tiene coordenadas'), findsOneWidget);
    await drenar(tester);
  });

  testWidgets('filtros de la Home: estado reproductivo y buscador', (tester) async {
    await arrancar(tester);
    await tester.runAsync(() async {
      await db.guardar(nidoDeEjemplo(etiqueta: 'EXITO-1')
        ..resultadoReproductivo = ResultadoReproductivo.exito);
      await db.guardar(nidoDeEjemplo(etiqueta: 'CURSO-1'));
    });
    await pumpApp(tester);
    expect(find.text('EXITO-1'), findsOneWidget);
    expect(find.text('CURSO-1'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, 'curso');
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await tester.pumpAndSettle();
    expect(find.text('EXITO-1'), findsNothing);
    expect(find.text('CURSO-1'), findsOneWidget);
    await drenar(tester);
  });
}
