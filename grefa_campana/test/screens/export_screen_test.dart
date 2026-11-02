import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/models/nido_grefa_model.dart';
import 'package:grefa_campana/screens/export_screen.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'harness.dart';

void main() {
  setUpAll(() => initializeDateFormatting('es'));

  testWidgets('filtros, 42 columnas por fase y botones de exportación', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(900, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final h = await Harness.crear(
      tester,
      nidos: [
        NidoGrefaModel()
          ..etiqueta = 'A'
          ..municipio = 'Toledo'
          ..resultadoReproductivo = 'Éxito',
        NidoGrefaModel()
          ..etiqueta = 'B'
          ..municipio = 'Ávila'
          ..resultadoReproductivo = 'Fracaso',
        NidoGrefaModel()
          ..etiqueta = 'C'
          ..municipio = 'Toledo',
      ],
    );
    await tester.pumpWidget(h.envolver(const ExportScreen()));
    await tester.pump();

    expect(find.text('3 nido(s) cumplen los filtros'), findsOneWidget);
    expect(find.text('Columnas del Excel (42 de 42)'), findsOneWidget);
    expect(
      find.textContaining('F1 · Ubicación / Hábitat (14/14)'),
      findsOneWidget,
    );
    expect(
      find.textContaining('F2 · Puesta / Incubación (5/5)'),
      findsOneWidget,
    );
    expect(
      find.textContaining('F3 · Seguimiento / Manejo (9/9)'),
      findsOneWidget,
    );
    expect(
      find.textContaining('F4 · Cosecha / Balance (14/14)'),
      findsOneWidget,
    );
    expect(find.text('Exportar a Excel (.xlsx)'), findsOneWidget);
    expect(find.text('Generar Informe PDF'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilterChip, 'Toledo'));
    await tester.pump();
    expect(find.text('2 nido(s) cumplen los filtros'), findsOneWidget);

    await tester.tap(find.text('Fracaso'));
    await tester.pump();
    expect(find.text('0 nido(s) cumplen los filtros'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('btn-excel'))).onPressed,
      isNull,
    );

    await tester.tap(find.text('Todos').first);
    await tester.pump();
    await tester.tap(find.text('Ninguna'));
    await tester.pump();
    expect(find.text('Columnas del Excel (0 de 42)'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.byKey(const Key('btn-excel'))).onPressed,
      isNull,
    );
  });
}
