import 'package:flutter/material.dart';

import '../services/sync_service.dart';

/// Icono de nube: verde = sincronizado, naranja = pendiente, spinner = en curso.
class SyncStatusIcon extends StatelessWidget {
  const SyncStatusIcon({super.key, required this.sync});

  final SyncService sync;

  static const verde = Color(0xFF2E7D32);
  static const naranja = Color(0xFFEF6C00);

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: sync,
      builder: (context, _) {
        final s = sync.state;
        late final Widget icon;
        late final String tooltip;
        switch (s.status) {
          case SyncStatus.syncing:
            icon = const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2.5, color: naranja),
            );
            tooltip = 'Sincronizando…';
          case SyncStatus.pending:
            icon = Icon(s.isConfigured ? Icons.cloud_upload : Icons.cloud_off,
                color: naranja);
            tooltip = !s.isConfigured
                ? '${s.pendingCount} pendientes · Supabase no configurado (solo local)'
                : '${s.pendingCount} pendientes de sincronizar'
                    '${s.isOnline ? '' : ' · sin conexión'}'
                    '${s.lastError != null ? '\n${s.lastError}' : ''}';
          case SyncStatus.synced:
            icon = Icon(s.isConfigured ? Icons.cloud_done : Icons.cloud_off,
                color: s.isConfigured ? verde : naranja);
            tooltip = s.isConfigured
                ? 'Todo sincronizado'
                : 'Supabase no configurado (solo local)';
        }
        return Tooltip(
          message: tooltip,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Container(
              padding: const EdgeInsets.all(6),
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
              child: icon,
            ),
          ),
        );
      },
    );
  }
}
