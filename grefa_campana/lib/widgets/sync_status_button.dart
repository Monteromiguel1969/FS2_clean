import 'package:flutter/material.dart';

import '../services/sync_service.dart';

/// Icono de nube con el estado de sincronización: verde (todo sincronizado),
/// naranja (hay cambios pendientes), gris (sin configurar / sin conexión) y
/// rojo (último intento fallido).
class SyncStatusIcon extends StatelessWidget {
  const SyncStatusIcon({super.key, required this.sync});

  final SyncService sync;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: sync,
      builder: (context, _) {
        final (icono, color, texto) = _estado();
        final cargando = sync.estado == EstadoSync.sincronizando;
        return Tooltip(
          message: texto,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: cargando
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5),
                  )
                : Icon(icono, color: color, key: const Key('icono-sync')),
          ),
        );
      },
    );
  }

  (IconData, Color, String) _estado() {
    final pend = sync.pendientes;
    final sufijo = pend > 0 ? ' ($pend pendiente${pend == 1 ? '' : 's'})' : '';
    switch (sync.estado) {
      case EstadoSync.noConfigurado:
        return (
          Icons.cloud_off,
          pend > 0 ? Colors.orange : Colors.grey,
          'Supabase sin configurar: modo solo local$sufijo',
        );
      case EstadoSync.sinConexion:
        return (
          Icons.cloud_off,
          pend > 0 ? Colors.orange : Colors.grey,
          'Sin conexión$sufijo',
        );
      case EstadoSync.error:
        return (
          Icons.cloud_sync,
          Colors.red,
          'Error de sincronización: ${sync.ultimoError ?? ''}$sufijo',
        );
      case EstadoSync.sincronizando:
        return (Icons.cloud_sync, Colors.blue, 'Sincronizando...');
      case EstadoSync.inactivo:
        return pend > 0
            ? (Icons.cloud_upload, Colors.orange, 'Pendiente de subir$sufijo')
            : (Icons.cloud_done, Colors.green, 'Todo sincronizado');
    }
  }
}
