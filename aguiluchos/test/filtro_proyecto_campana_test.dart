import 'package:aguiluchos/models/nido_filter.dart';
import 'package:aguiluchos/models/nido_grefa_model.dart';
import 'package:aguiluchos/widgets/filtro_proyecto_campana.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

NidoGrefaModel _n(String? proyecto, String? campana) => NidoGrefaModel()
  ..proyecto = proyecto
  ..campana = campana;

void main() {
  final nidos = [
    _n('LIFE', '2025'),
    _n('LIFE', '2026'),
    _n('USANOS', '2026'),
    _n(null, null),
    _n('LIFE', ''),
  ];

  test('opciones: campañas recientes primero y «sin» si hay nidos sin dato', () {
    final o = opcionesProyectoCampana(nidos);
    expect(o.proyectos, ['LIFE', 'USANOS']);
    expect(o.campanas, ['2026', '2025']);
    expect(o.sinProyecto, isTrue);
    expect(o.sinCampana, isTrue);
    final sin = opcionesProyectoCampana([_n('LIFE', '2026')]);
    expect(sin.sinProyecto, isFalse);
    expect(sin.sinCampana, isFalse);
  });

  test('sanear quita lo que ya no existe', () {
    final f = const NidoFilter(proyecto: 'LIFE', campana: '1999');
    final s = sanearProyectoCampana(f, nidos);
    expect(s.proyecto, 'LIFE');
    expect(s.campana, isNull);
    expect(sanearProyectoCampana(const NidoFilter(campana: NidoFilter.sinValor), [_n('LIFE', '2026')]).campana,
        isNull);
  });

  test('descripción para los informes', () {
    expect(descripcionProyectoCampana(const NidoFilter()), isEmpty);
    expect(descripcionProyectoCampana(const NidoFilter(proyecto: 'LIFE', campana: '2026')),
        ['proyecto: LIFE', 'campaña: 2026']);
    expect(descripcionProyectoCampana(const NidoFilter(campana: NidoFilter.sinValor)),
        ['campaña: sin campaña']);
  });

  testWidgets('elegir una campaña avisa con el filtro nuevo; «Sin campaña» disponible', (tester) async {
    NidoFilter? ultimo;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: StatefulBuilder(
          builder: (context, setState) => FiltroProyectoCampana(
            nidos: nidos,
            filter: ultimo ?? const NidoFilter(),
            onChanged: (f) => setState(() => ultimo = f),
          ),
        ),
      ),
    ));
    expect(find.text('Proyecto'), findsOneWidget);
    expect(find.text('Campaña'), findsOneWidget);

    await tester.tap(find.byWidgetPredicate(
        (w) => w is DropdownButtonFormField<String?> && w.key.toString().contains('filtro-campana')));
    await tester.pumpAndSettle();
    expect(find.text('Sin campaña'), findsOneWidget);
    await tester.tap(find.text('2025').last);
    await tester.pumpAndSettle();
    expect(ultimo!.campana, '2025');
    expect(ultimo!.proyecto, isNull);
  });
}
