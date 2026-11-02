import 'package:flutter/material.dart';

import '../models/nido_grefa_model.dart';
import '../state/nidos_controller.dart';

/// Búsqueda libre + desplegables de municipio y estado reproductivo.
class FiltrosBar extends StatelessWidget {
  const FiltrosBar({super.key, required this.controller});

  final NidosController controller;

  @override
  Widget build(BuildContext context) {
    final munis = controller.municipios;
    final municipioActual = munis.contains(controller.municipio)
        ? controller.municipio
        : null;
    final busqueda = TextField(
      key: const Key('campo-busqueda'),
      decoration: const InputDecoration(
        prefixIcon: Icon(Icons.search),
        labelText: 'Buscar por etiqueta o propietario',
      ),
      onChanged: controller.setBusqueda,
    );
    final municipio = DropdownButtonFormField<String?>(
      key: ValueKey('mun-$municipioActual-${munis.length}'),
      initialValue: municipioActual,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Municipio'),
      items: [
        const DropdownMenuItem<String?>(value: null, child: Text('Todos')),
        for (final m in munis)
          DropdownMenuItem<String?>(
            value: m,
            child: Text(m, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: controller.setMunicipio,
    );
    final estado = DropdownButtonFormField<EstadoReproductivo?>(
      key: ValueKey('est-${controller.estado}'),
      initialValue: controller.estado,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Estado reproductivo'),
      items: [
        const DropdownMenuItem<EstadoReproductivo?>(
          value: null,
          child: Text('Todos'),
        ),
        for (final e in EstadoReproductivo.values)
          DropdownMenuItem<EstadoReproductivo?>(
            value: e,
            child: Text(e.etiqueta),
          ),
      ],
      onChanged: controller.setEstado,
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: LayoutBuilder(
        builder: (context, c) {
          if (c.maxWidth >= 640) {
            return Row(
              children: [
                Expanded(flex: 3, child: busqueda),
                const SizedBox(width: 8),
                Expanded(flex: 2, child: municipio),
                const SizedBox(width: 8),
                Expanded(flex: 2, child: estado),
              ],
            );
          }
          return Column(
            children: [
              busqueda,
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(child: municipio),
                  const SizedBox(width: 8),
                  Expanded(child: estado),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}
