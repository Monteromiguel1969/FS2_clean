import 'dart:convert';
import 'dart:io';

import 'package:aguiluchos/app/app_services.dart';
import 'package:aguiluchos/models/mapa_fondo.dart';
import 'package:aguiluchos/models/nido_grefa_model.dart';
import 'package:aguiluchos/screens/informe_tecnico_screen.dart';
import 'package:aguiluchos/services/database_service.dart';
import 'package:aguiluchos/services/export_service.dart';
import 'package:aguiluchos/services/image_storage_service.dart';
import 'package:aguiluchos/services/informe_tecnico.dart';
import 'package:aguiluchos/services/location_service.dart';
import 'package:aguiluchos/services/sync_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'helpers/fakes.dart';

NidoGrefaModel _n(
  String etiqueta, {
  String municipio = 'Toledo',
  String? resultado,
  int? nac,
  int? vol,
  int? mue,
  bool interv = false,
  List<String> manejo = const [],
  String? causa,
  String? estadoFracaso,
  double? x,
  double? y,
}) =>
    nidoDeEjemplo(etiqueta: etiqueta, municipio: municipio)
      ..numeracion = etiqueta.replaceAll(RegExp(r'\D'), '')
      ..provincia = 'Toledo'
      ..fechaIncubacion = DateTime(2026, 5, 1)
      ..resultadoReproductivo = resultado
      ..numPollosNacidos = nac
      ..numPollosVolados = vol
      ..numPollosMuertos = mue
      ..intervencion = interv
      ..tipoAccionesManejo = manejo
      ..causasFracaso = causa
      ..estadoFracaso = estadoFracaso
      ..coordenadaX = x
      ..coordenadaY = y;

List<NidoGrefaModel> _datos() => [
      _n('E1', resultado: 'Éxito', nac: 3, vol: 2, mue: 1, interv: true, manejo: ['Dron'], x: 440000, y: 4400000),
      _n('F1', municipio: 'Madrid', resultado: 'Fracaso', nac: 0, causa: 'Depredación', estadoFracaso: 'Huevos'),
      _n('C1', nac: 2, vol: 2, mue: 1),
    ];

InformeBorrador _borrador({List<NidoGrefaModel>? nidos, bool individual = false}) => InformeBorrador(
      nidos: nidos ?? _datos(),
      titulo: 'Informe <prueba>',
      referencia: 'REF-1',
      fecha: DateTime(2026, 11, 2),
      autor: 'Ana',
      individual: individual,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await initializeDateFormatting('es_ES');
  });

  group('estadísticas y textos', () {
    test('indicadores exactos', () {
      final r = EstadisticasInforme(_datos());
      expect(r.total, 3);
      expect(r.exito, 1);
      expect(r.fracaso, 1);
      expect(r.enCurso, 1);
      expect(r.tasaExito, 0.5);
      expect(r.nacidos, 5);
      expect(r.volados, 4);
      expect(r.muertos, 2);
      expect(r.sinDeterminar, 0);
      expect(r.productividad, 2.0);
      expect(r.causas.single.key, 'Depredación');
    });

    test('justificación y conclusiones citan cifras y datos incoherentes', () {
      final d = _datos();
      expect(justificacionPorDefecto(d[0]), 'Intervención de conservación (Dron)');
      expect(justificacionPorDefecto(d[1]), 'Fracaso (Huevos): Depredación');
      expect(justificacionPorDefecto(d[2]), '—');
      final b = _borrador();
      expect(b.conclusiones, contains('3 nido(s) analizados, 1 finalizaron con éxito, 1 fracasaron y 1 no tienen'));
      expect(b.conclusiones, contains('50 %'));
      expect(b.conclusiones, contains('volados + muertos superiores'));
      expect(b.alcance, contains('campaña 2026'));
    });

    test('agrupación por municipio', () {
      final g = agruparNidos(_datos(), (n) => n.municipio);
      expect(g.first.nombre, 'Toledo');
      expect(g.first.stats.total, 2);
    });
  });

  group('documento', () {
    test('secciones seleccionadas y edición de textos', () {
      final b = _borrador()
        ..secciones = {SeccionInforme.resumen, SeccionInforme.relacion}
        ..justificaciones[_datos().first.id] = 'x';
      b.conclusiones = 'Conclusión editada';
      final html = InformeRender.html(InformeTecnico.construir(b));
      expect(html, contains('Informe &lt;prueba&gt;'));
      expect(html, contains('1. Resumen ejecutivo'));
      expect(html, contains('2. Relación de nidos'));
      expect(html, isNot(contains('Causas de fracaso')));
      expect(html, isNot(contains('Conclusión editada'))); // sección no incluida
      expect(html, contains('Firma y sello'));
    });

    test('la justificación editada aparece en la relación', () {
      final nidos = _datos();
      final b = _borrador(nidos: nidos)..secciones = {SeccionInforme.relacion};
      b.justificaciones[nidos[0].id] = 'Texto manual del técnico';
      final html = InformeRender.html(InformeTecnico.construir(b));
      expect(html, contains('Texto manual del técnico'));
      expect(html, contains('Fracaso (Huevos): Depredación'));
    });

    test('anexo de fichas y ficha individual', () {
      final b = _borrador()..secciones = {SeccionInforme.fichas};
      final htmlAnexo = InformeRender.html(InformeTecnico.construir(b));
      expect('Ficha técnica ·'.allMatches(htmlAnexo).length, 3);
      expect(htmlAnexo, contains('Fase 4 · Cosecha y balance'));

      final ind = _borrador(nidos: [_datos().first], individual: true);
      final html = InformeRender.html(InformeTecnico.construir(ind));
      expect(html, contains('Posición WGS84'));
      expect(html, contains('Fecha estimada de eclosión'));
      expect(html, contains('31/05/2026'));
      expect(html, contains('Balance: 3 nacidos = 2 volados + 1 muertos + 0 sin determinar.'));
    });

    test('Word lleva el espacio de nombres de Office', () {
      final w = InformeRender.word(InformeTecnico.construir(_borrador()));
      expect(w, contains('urn:schemas-microsoft-com:office:word'));
    });

    test('PDF se genera con todas las secciones y fichas', () async {
      final b = _borrador()..secciones = {...SeccionInforme.values};
      final bytes = await InformeRender.pdf(InformeTecnico.construir(b));
      expect(utf8.decode(bytes.sublist(0, 5)), '%PDF-');
      expect(bytes.length, greaterThan(5000));
    });

    test('nombre de archivo seguro', () {
      expect(nombreArchivoInforme('GREFA/AGU 1', 'pdf'), 'GREFA_AGU_1.pdf');
    });
  });

  group('pantalla', () {
    late DatabaseService db;
    late SyncService sync;
    late Directory tmp;

    tearDown(() async {
      sync.dispose();
      await db.close();
      await tmp.delete(recursive: true);
    });

    testWidgets('editar texto, desmarcar sección y ver los botones de emisión', (tester) async {
      tester.view.physicalSize = const Size(800, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.runAsync(() async {
        db = await openTestDb(FakeClock());
        tmp = await Directory.systemTemp.createTemp('informe_test');
      });
      sync = SyncService(db: db);
      final nidos = _datos();

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
          home: InformeTecnicoScreen(nidos: nidos, filtros: 'municipio: Toledo'),
        ),
      ));
      await tester.pump();

      expect(find.byKey(const Key('inf-pdf')), findsOneWidget);
      expect(find.byKey(const Key('inf-word')), findsOneWidget);
      expect(find.byKey(const Key('inf-pptx')), findsOneWidget);
      expect(find.text('PowerPoint (.pptx)'), findsOneWidget);
      expect(find.byKey(const Key('sec-fichas')), findsOneWidget);
      final fondo = find.byKey(const Key('inf-fondo'));
      await tester.scrollUntilVisible(fondo, 200, scrollable: find.byType(Scrollable).first);
      expect(find.text('Mapa (OSM)'), findsOneWidget);
      expect(find.text('Ortofoto (PNOA)'), findsOneWidget);
      expect(tester.widget<SegmentedButton<MapaFondo>>(fondo).selected, {MapaFondo.osm});
      await tester.tap(find.text('Ortofoto (PNOA)'));
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
      await tester.pump();
      expect(tester.widget<SegmentedButton<MapaFondo>>(fondo).selected, {MapaFondo.pnoa});
      await tester.scrollUntilVisible(find.byKey(const Key('inf-titulo')), -200,
          scrollable: find.byType(Scrollable).first);
      expect(find.textContaining('Filtros aplicados: municipio: Toledo'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('inf-conclusiones')), 'Conclusión a medida');
      await tester.tap(find.byKey(const Key('sec-causas')));
      await tester.pump();
      expect(find.text('Conclusión a medida'), findsOneWidget);
      final cb = tester.widget<CheckboxListTile>(find.byKey(const Key('sec-causas')));
      expect(cb.value, isFalse);
    });
  });
}
