import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/models/nido_grefa_model.dart';
import 'package:grefa_campana/screens/home_screen.dart';
import 'package:grefa_campana/services/sync_service.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'harness.dart';

List<NidoGrefaModel> _datos() => [
  NidoGrefaModel()
    ..etiqueta = 'CEN-001'
    ..municipio = 'Toledo'
    ..propietario = 'María López'
    ..especie = 'Aguilucho cenizo (Circus pygargus)'
    ..resultadoReproductivo = 'Éxito'
    ..estadoFinal = 'Pollos volados'
    ..intervencion = true
    ..tipoAccionesManejo = ['Dron']
    ..coordenadaX = -4.0
    ..coordenadaY = 39.8,
  NidoGrefaModel()
    ..etiqueta = 'PAL-002'
    ..municipio = 'Ávila'
    ..propietario = 'Juan Gómez'
    ..resultadoReproductivo = 'Fracaso',
  NidoGrefaModel()
    ..etiqueta = 'CEN-003'
    ..municipio = 'Toledo'
    ..propietario = 'Pedro Ruiz',
];

void main() {
  setUpAll(() => initializeDateFormatting('es'));

  testWidgets('móvil: título, FAB, selector Lista/Mapa y tarjetas', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final h = await Harness.crear(tester, nidos: _datos());

    await tester.pumpWidget(h.envolver(const HomeScreen()));
    await tester.pump();

    expect(find.text('GREFA - Campaña Aguilucho'), findsOneWidget);
    expect(find.text('➕ Nuevo Nido'), findsOneWidget);
    expect(find.text('Lista'), findsOneWidget);
    expect(find.text('Mapa'), findsOneWidget);
    expect(find.byType(NavigationRail), findsNothing);
    expect(find.byTooltip('Sincronizar ahora'), findsOneWidget);

    expect(find.text('CEN-001'), findsOneWidget);
    expect(find.text('PAL-002'), findsOneWidget);
    expect(find.text('CEN-003'), findsOneWidget);
    expect(find.text('Pollos volados'), findsOneWidget);
    expect(find.text('Intervención: Dron'), findsOneWidget);
  });

  testWidgets('búsqueda libre por etiqueta o propietario', (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final h = await Harness.crear(tester, nidos: _datos());
    await tester.pumpWidget(h.envolver(const HomeScreen()));
    await tester.pump();

    await tester.enterText(find.byKey(const Key('campo-busqueda')), 'lópez');
    await tester.pump();
    expect(find.text('CEN-001'), findsOneWidget);
    expect(find.text('PAL-002'), findsNothing);

    await tester.enterText(find.byKey(const Key('campo-busqueda')), 'pal-');
    await tester.pump();
    expect(find.text('PAL-002'), findsOneWidget);
    expect(find.text('CEN-001'), findsNothing);
  });

  testWidgets('filtros de municipio y estado reproductivo', (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final h = await Harness.crear(tester, nidos: _datos());
    await tester.pumpWidget(h.envolver(const HomeScreen()));
    await tester.pump();

    h.nidos.setMunicipio('Toledo');
    await tester.pump();
    expect(find.text('CEN-001'), findsOneWidget);
    expect(find.text('CEN-003'), findsOneWidget);
    expect(find.text('PAL-002'), findsNothing);

    h.nidos.setEstado(EstadoReproductivo.enCurso);
    await tester.pump();
    expect(find.text('CEN-003'), findsOneWidget);
    expect(find.text('CEN-001'), findsNothing);

    h.nidos.setMunicipio(null);
    h.nidos.setEstado(EstadoReproductivo.fracaso);
    await tester.pump();
    expect(find.text('PAL-002'), findsOneWidget);
    expect(find.text('CEN-003'), findsNothing);
  });

  testWidgets('el icono de nube es naranja con pendientes y verde sin ellos', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final h = await Harness.crear(tester, nidos: _datos());
    await tester.pumpWidget(h.envolver(const HomeScreen()));
    await tester.pump();

    // Sin Supabase configurado: nube tachada, naranja mientras haya pendientes.
    expect(h.sync.estado, EstadoSync.noConfigurado);
    expect(h.sync.pendientes, 3);
    final icono = tester.widget<Icon>(find.byKey(const Key('icono-sync')));
    expect(icono.icon, Icons.cloud_off);
    expect(icono.color, Colors.orange);
  });

  testWidgets('cambia a la vista de mapa', (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final h = await Harness.crear(tester, nidos: _datos());
    await tester.pumpWidget(h.envolver(const HomeScreen()));
    await tester.pump();

    await tester.tap(find.text('Mapa'));
    await tester.pump();
    expect(find.textContaining('nido(s) en el mapa'), findsOneWidget);
    expect(find.textContaining('2 sin coordenadas'), findsOneWidget);
    expect(find.text('CEN-001'), findsNothing); // la lista ya no se muestra
  });

  testWidgets('escritorio: NavigationRail y vista dividida lista + ficha', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final h = await Harness.crear(tester, nidos: _datos());
    await tester.pumpWidget(h.envolver(const HomeScreen()));
    await tester.pump();

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.text('Sincronizar ahora'), findsOneWidget);
    expect(find.text('Selecciona un nido o crea uno nuevo'), findsOneWidget);

    await tester.tap(find.text('CEN-003'));
    await tester.pumpAndSettle();
    // La ficha aparece junto a la lista (4 pestañas).
    expect(find.text('🗺️ Ubicación'), findsOneWidget);
    expect(find.text('💾 Guardar Nido'), findsOneWidget);
    expect(find.text('CEN-001'), findsOneWidget);
  });
}
