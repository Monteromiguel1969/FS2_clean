import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/models/nido_grefa_model.dart';
import 'package:grefa_campana/screens/nido_detail_screen.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'harness.dart';

void main() {
  setUpAll(() => initializeDateFormatting('es'));

  void pantalla(WidgetTester tester) {
    tester.view.physicalSize = const Size(500, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
  }

  testWidgets('muestra las 4 pestañas y el botón de guardar', (tester) async {
    pantalla(tester);
    final h = await Harness.crear(tester);
    await tester.pumpWidget(h.envolver(const NidoDetailScreen()));
    await tester.pump();

    expect(find.text('🗺️ Ubicación'), findsOneWidget);
    expect(find.text('🪺 Incubación'), findsOneWidget);
    expect(find.text('🐣 Seguimiento y Manejo'), findsOneWidget);
    expect(find.text('🚜 Cosecha y Balance'), findsOneWidget);
    expect(find.text('💾 Guardar Nido'), findsOneWidget);
    expect(find.text('Capturar GPS actual'), findsOneWidget);
    expect(find.text('Abrir en Google Maps'), findsOneWidget);
  });

  testWidgets('Fecha Estimada de Eclosión = incubación + 30 días', (
    tester,
  ) async {
    pantalla(tester);
    final h = await Harness.crear(tester);
    final nido = NidoGrefaModel()
      ..etiqueta = 'E'
      ..fechaIncubacion = DateTime(2026, 5, 1);
    await tester.pumpWidget(h.envolver(NidoDetailScreen(nido: nido)));
    await tester.pump();

    await tester.tap(find.text('🪺 Incubación'));
    await tester.pumpAndSettle();
    expect(find.text('Fecha Estimada de Eclosión'), findsOneWidget);
    final texto = tester.widget<Text>(
      find.byKey(const Key('fecha-estimada-eclosion')),
    );
    expect(texto.data, '31/05/2026');
  });

  testWidgets('sin fecha de incubación pide indicarla', (tester) async {
    pantalla(tester);
    final h = await Harness.crear(tester);
    await tester.pumpWidget(h.envolver(const NidoDetailScreen()));
    await tester.pump();
    await tester.tap(find.text('🪺 Incubación'));
    await tester.pumpAndSettle();
    expect(find.text('Indica la fecha de incubación'), findsOneWidget);
  });

  testWidgets('seguimiento: contadores, multiselect de manejo y fotos', (
    tester,
  ) async {
    pantalla(tester);
    final h = await Harness.crear(tester);
    await tester.pumpWidget(h.envolver(const NidoDetailScreen()));
    await tester.pump();
    await tester.tap(find.text('🐣 Seguimiento y Manejo'));
    await tester.pumpAndSettle();

    expect(find.text('Pollos nacidos'), findsOneWidget);
    expect(find.text('Huevos no eclosionados'), findsOneWidget);
    expect(find.text('Edad (días)'), findsOneWidget);
    expect(find.text('Anilla PVC'), findsOneWidget);
    expect(find.text('Anilla metálica'), findsOneWidget);
    expect(find.text('Dron'), findsOneWidget);
    expect(find.text('Rodal'), findsOneWidget);
    expect(find.text('Compensación'), findsOneWidget);
    expect(find.text('Observaciones I'), findsOneWidget);
    expect(find.text('Observaciones II'), findsOneWidget);
    expect(find.text('📸 Tomar Fotografía'), findsOneWidget);
    expect(find.text('🖼️ Seleccionar de la Galería'), findsOneWidget);

    await tester.tap(find.byTooltip('Sumar uno').first);
    await tester.pump();
    expect(find.text('1'), findsOneWidget);
  });

  testWidgets(
    'cosecha: causas de fracaso solo cuando el resultado es Fracaso',
    (tester) async {
      pantalla(tester);
      final h = await Harness.crear(tester);
      final nido = NidoGrefaModel()
        ..etiqueta = 'F'
        ..resultadoReproductivo = 'Fracaso';
      await tester.pumpWidget(h.envolver(NidoDetailScreen(nido: nido)));
      await tester.pump();
      await tester.tap(find.text('🚜 Cosecha y Balance'));
      await tester.pumpAndSettle();

      expect(find.text('Fecha de vuelo'), findsOneWidget);
      expect(find.text('Fecha de cosecha'), findsOneWidget);
      expect(find.text('Volados pre-cosecha'), findsOneWidget);
      expect(find.text('Volados post-cosecha'), findsOneWidget);
      expect(find.text('Muertos pre-cosecha'), findsOneWidget);
      expect(find.text('Muertos durante cosecha'), findsOneWidget);
      expect(find.text('Muertos post-cosecha'), findsOneWidget);
      expect(find.text('Causas del fracaso'), findsOneWidget);
      expect(find.text('📸 Tomar Fotografía'), findsOneWidget);
    },
  );

  testWidgets('exige etiqueta antes de guardar', (tester) async {
    pantalla(tester);
    final h = await Harness.crear(tester);
    await tester.pumpWidget(h.envolver(const NidoDetailScreen()));
    await tester.pump();

    await tester.tap(find.text('💾 Guardar Nido'));
    await tester.pump();
    expect(find.text('La etiqueta del nido es obligatoria.'), findsOneWidget);
    expect(await tester.runAsync(h.db.contarPendientes), 0);
  });

  testWidgets('guardar persiste en local con isSynced = false y totales', (
    tester,
  ) async {
    pantalla(tester);
    final h = await Harness.crear(tester);
    final inicial = NidoGrefaModel()
      ..etiqueta = 'CEN-9'
      ..pollosVoladosPrecosecha = 1
      ..pollosVoladosPostcosecha = 2;
    await tester.runAsync(() => h.db.guardarNido(inicial));
    await tester.runAsync(h.nidos.cargar);
    await tester.runAsync(
      () => h.db.marcarSincronizado(
        inicial.id,
        versionSubida: inicial.updatedAt,
        versionServidor: inicial.updatedAt,
      ),
    );
    await tester.runAsync(h.nidos.cargar);
    expect(h.nidos.todos.single.isSynced, isTrue);

    await tester.pumpWidget(
      h.envolver(NidoDetailScreen(nido: h.nidos.todos.single)),
    );
    await tester.pump();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Municipio'),
      'Toledo',
    );
    await tester.tap(find.text('💾 Guardar Nido'));
    await esperarIo(tester);

    final guardado = (await tester.runAsync(
      () => h.db.obtenerPorId(inicial.id),
    ))!;
    expect(guardado.municipio, 'Toledo');
    expect(guardado.isSynced, isFalse);
    expect(guardado.numPollosVolados, 3);
    expect(guardado.vuelanPollos, isTrue);
    expect(h.sync.pendientes, 1);
  });

  testWidgets(
    'muestra el aviso de conflicto y permite marcarlo como revisado',
    (tester) async {
      pantalla(tester);
      final nido = NidoGrefaModel()
        ..etiqueta = 'C'
        ..hasConflict = true;
      final h = await Harness.crear(tester, nidos: [nido]);
      await tester.pumpWidget(
        h.envolver(NidoDetailScreen(nido: h.nidos.todos.single)),
      );
      await tester.pump();

      expect(find.textContaining('Last-Write-Wins'), findsOneWidget);
      await tester.tap(find.text('Marcar como revisado'));
      await esperarIo(tester);
      expect(find.textContaining('Last-Write-Wins'), findsNothing);
      final n = (await tester.runAsync(() => h.db.obtenerPorId(nido.id)))!;
      expect(n.hasConflict, isFalse);
    },
  );

  test('sanity: los archivos de plataforma existen', () {
    expect(
      File('android/app/src/main/AndroidManifest.xml').existsSync(),
      isTrue,
    );
  });
}
