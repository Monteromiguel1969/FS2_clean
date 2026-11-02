import 'package:flutter/material.dart';

import '../models/nido_constants.dart';
import '../models/nido_grefa_model.dart';

Color colorEstado(EstadoReproductivo e) => switch (e) {
      EstadoReproductivo.exito => const Color(0xFF2E7D32),
      EstadoReproductivo.fracaso => const Color(0xFFC62828),
      _ => const Color(0xFF1565C0),
    };

class NidoCard extends StatelessWidget {
  const NidoCard({
    super.key,
    required this.nido,
    required this.onTap,
    this.selected = false,
  });

  final NidoGrefaModel nido;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final estado = nido.estadoReproductivo;
    final color = colorEstado(estado);
    final theme = Theme.of(context);
    return Card(
      elevation: selected ? 4 : 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
            color: selected ? theme.colorScheme.primary : Colors.transparent,
            width: 2),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
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
                    Text(
                      (nido.etiqueta ?? '').isEmpty ? '(sin etiqueta)' : nido.etiqueta!,
                      style: theme.textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        if ((nido.municipio ?? '').isNotEmpty) nido.municipio!,
                        if ((nido.especie ?? '').isNotEmpty) nido.especie!,
                      ].join(' · '),
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 6),
                    Wrap(spacing: 6, runSpacing: 4, children: [
                      _chip(
                        (nido.estadoFinal ?? '').isEmpty
                            ? estado.etiqueta
                            : nido.estadoFinal!,
                        color,
                      ),
                      if (nido.intervencion)
                        _chip('Intervención', const Color(0xFF6A1B9A),
                            icon: Icons.medical_services_outlined),
                    ]),
                  ],
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (nido.hasConflict)
                    const Tooltip(
                      message: 'Conflicto: se aplicaron cambios remotos más recientes',
                      child: Icon(Icons.warning_amber, color: Color(0xFFEF6C00)),
                    ),
                  Tooltip(
                    message: nido.isSynced ? 'Sincronizado' : 'Pendiente de sincronizar',
                    child: Icon(
                      nido.isSynced ? Icons.cloud_done_outlined : Icons.cloud_upload_outlined,
                      size: 20,
                      color: nido.isSynced ? const Color(0xFF2E7D32) : const Color(0xFFEF6C00),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip(String text, Color color, {IconData? icon}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 14, color: color), const SizedBox(width: 4)],
          Text(text, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600)),
        ]),
      );
}
