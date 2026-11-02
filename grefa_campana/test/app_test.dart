import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/app.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'screens/harness.dart';

void main() {
  setUpAll(() => initializeDateFormatting('es'));

  testWidgets('la app arranca y funciona offline sin Supabase configurado', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final h = await Harness.crear(tester);

    await tester.pumpWidget(
      GrefaApp(db: h.db, sync: h.sync, nidos: h.nidos, imagenes: h.imagenes),
    );
    await tester.pump();

    expect(find.text('GREFA - Campaña Aguilucho'), findsOneWidget);
    expect(h.sync.configurado, isFalse);

    // Crear un nido nuevo y guardarlo sin red.
    await tester.tap(find.text('➕ Nuevo Nido'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Etiqueta *'),
      'CEN-100',
    );
    await tester.tap(find.text('💾 Guardar Nido'));
    await esperarIo(tester);
    await tester.pumpAndSettle();

    expect(find.text('CEN-100'), findsOneWidget);
    expect(h.sync.pendientes, 1);
  });
}
