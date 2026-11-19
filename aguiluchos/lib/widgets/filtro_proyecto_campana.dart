import 'package:flutter/material.dart';

import '../models/nido_filter.dart';
import '../models/nido_grefa_model.dart';

/// Valores de proyecto y campaña presentes en [nidos], para los selectores.
///
/// `sinProyecto` / `sinCampana` indican que hay nidos sin ese dato (los nidos
/// anteriores a la campaña como campo propio cuentan como «sin campaña»).
({List<String> proyectos, List<String> campanas, bool sinProyecto, bool sinCampana})
    opcionesProyectoCampana(List<NidoGrefaModel> nidos) {
  final proyectos = <String>{};
  final campanas = <String>{};
  var sinProyecto = false;
  var sinCampana = false;
  for (final n in nidos) {
    final p = (n.proyecto ?? '').trim();
    final c = (n.campana ?? '').trim();
    p.isEmpty ? sinProyecto = true : proyectos.add(p);
    c.isEmpty ? sinCampana = true : campanas.add(c);
  }
  return (
    proyectos: proyectos.toList()..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase())),
    // Campañas más recientes primero (2026, 2025…); las no numéricas, al final.
    campanas: campanas.toList()
      ..sort((a, b) {
        final x = int.tryParse(a);
        final y = int.tryParse(b);
        if (x != null && y != null) return y.compareTo(x);
        if (x != null) return -1;
        if (y != null) return 1;
        return a.toLowerCase().compareTo(b.toLowerCase());
      }),
    sinProyecto: sinProyecto,
    sinCampana: sinCampana,
  );
}

/// Quita de [f] el proyecto o la campaña que ya no existen en [todos].
NidoFilter sanearProyectoCampana(NidoFilter f, List<NidoGrefaModel> todos) {
  if (f.proyecto == null && f.campana == null) return f;
  final o = opcionesProyectoCampana(todos);
  bool existe(String? v, List<String> lista, bool sin) =>
      v == null || (v == NidoFilter.sinValor ? sin : lista.contains(v));
  final proyecto = existe(f.proyecto, o.proyectos, o.sinProyecto) ? f.proyecto : null;
  final campana = existe(f.campana, o.campanas, o.sinCampana) ? f.campana : null;
  if (proyecto == f.proyecto && campana == f.campana) return f;
  return f.conProyectoCampana(proyecto: proyecto, campana: campana);
}

/// Texto de los filtros de proyecto y campaña para describir un informe.
List<String> descripcionProyectoCampana(NidoFilter f) => [
      if (f.proyecto != null)
        'proyecto: ${f.proyecto == NidoFilter.sinValor ? 'sin proyecto' : f.proyecto}',
      if (f.campana != null)
        'campaña: ${f.campana == NidoFilter.sinValor ? 'sin campaña' : f.campana}',
    ];

/// Selectores de proyecto y campaña (campos distintos).
class FiltroProyectoCampana extends StatelessWidget {
  const FiltroProyectoCampana({
    super.key,
    required this.nidos,
    required this.filter,
    required this.onChanged,
  });

  /// Todos los nidos (sin filtrar) para calcular las opciones.
  final List<NidoGrefaModel> nidos;
  final NidoFilter filter;
  final ValueChanged<NidoFilter> onChanged;

  Widget _selector({
    required Key key,
    required String etiqueta,
    required String textoSin,
    required String? valor,
    required List<String> opciones,
    required bool haySin,
    required ValueChanged<String?> alCambiar,
  }) {
    final validos = [...opciones, if (haySin) NidoFilter.sinValor];
    final actual = valor != null && validos.contains(valor) ? valor : null;
    return DropdownButtonFormField<String?>(
      key: key,
      initialValue: actual,
      isExpanded: true,
      decoration: InputDecoration(labelText: etiqueta, isDense: true),
      items: [
        const DropdownMenuItem<String?>(value: null, child: Text('Todas')),
        for (final o in opciones) DropdownMenuItem<String?>(value: o, child: Text(o)),
        if (haySin)
          DropdownMenuItem<String?>(value: NidoFilter.sinValor, child: Text(textoSin)),
      ],
      onChanged: alCambiar,
    );
  }

  @override
  Widget build(BuildContext context) {
    final o = opcionesProyectoCampana(nidos);
    final f = filter;
    return Row(children: [
      Expanded(
        child: _selector(
          key: ValueKey('filtro-proyecto-${f.proyecto}-${o.proyectos.length}-${o.sinProyecto}'),
          etiqueta: 'Proyecto',
          textoSin: 'Sin proyecto',
          valor: f.proyecto,
          opciones: o.proyectos,
          haySin: o.sinProyecto,
          alCambiar: (v) => onChanged(f.conProyectoCampana(proyecto: v, campana: f.campana)),
        ),
      ),
      const SizedBox(width: 8),
      Expanded(
        child: _selector(
          key: ValueKey('filtro-campana-${f.campana}-${o.campanas.length}-${o.sinCampana}'),
          etiqueta: 'Campaña',
          textoSin: 'Sin campaña',
          valor: f.campana,
          opciones: o.campanas,
          haySin: o.sinCampana,
          alCambiar: (v) => onChanged(f.conProyectoCampana(proyecto: f.proyecto, campana: v)),
        ),
      ),
    ]);
  }
}
