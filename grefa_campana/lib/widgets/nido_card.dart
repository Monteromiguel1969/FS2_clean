import 'package:flutter/material.dart';

import '../models/nido_grefa_model.dart';

Color colorEstado(EstadoReproductivo e) => switch (e) {
  EstadoReproductivo.exito => Colors.green.shade700,
  EstadoReproductivo.fracaso => Colors.red.shade700,
  EstadoReproductivo.enCurso => Colors.orange.shade800,
};

/// Tarjeta de la lista: etiqueta, municipio, especie, estado final e intervención.
class NidoCard extends StatelessWidget {
  const NidoCard({
    super.key,
    required this.nido,
    required this.onTap,
    this.seleccionado = false,
  });

  final NidoGrefaModel nido;
  final VoidCallback onTap;
  final bool seleccionado;

  @override
  Widget build(BuildContext context) {
    final estado = nido.estadoReproductivo;
    final color = colorEstado(estado);
    final tema = Theme.of(context);
    final estadoFinal = (nido.estadoFinal ?? '').trim();
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      color: seleccionado ? tema.colorScheme.secondaryContainer : null,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                backgroundColor: color.withValues(alpha: 0.15),
                child: Icon(Icons.egg_alt, color: color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            nido.titulo,
                            style: tema.textTheme.titleMedium,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (nido.hasConflict)
                          const Tooltip(
                            message: 'Edición concurrente: revisa este nido',
                            child: Icon(
                              Icons.warning_amber_rounded,
                              color: Colors.orange,
                              size: 20,
                            ),
                          ),
                        if (!nido.isSynced)
                          const Tooltip(
                            message: 'Pendiente de sincronizar',
                            child: Padding(
                              padding: EdgeInsets.only(left: 4),
                              child: Icon(
                                Icons.cloud_upload_outlined,
                                color: Colors.orange,
                                size: 20,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if ((nido.municipio ?? '').isNotEmpty) nido.municipio!,
                        if ((nido.especie ?? '').isNotEmpty) nido.especie!,
                      ].join(' · '),
                      style: tema.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        Chip(
                          visualDensity: VisualDensity.compact,
                          label: Text(
                            estadoFinal.isEmpty ? estado.etiqueta : estadoFinal,
                          ),
                          avatar: Icon(Icons.flag, size: 16, color: color),
                          side: BorderSide(color: color.withValues(alpha: 0.5)),
                        ),
                        Chip(
                          visualDensity: VisualDensity.compact,
                          label: Text(
                            nido.intervencion
                                ? 'Intervención${nido.tipoAccionesManejo.isEmpty ? '' : ': ${nido.tipoAccionesManejo.join(', ')}'}'
                                : 'Sin intervención',
                          ),
                          avatar: Icon(
                            nido.intervencion
                                ? Icons.build_circle
                                : Icons.visibility,
                            size: 16,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
