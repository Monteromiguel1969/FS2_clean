import 'package:flutter/widgets.dart';

import '../services/database_service.dart';
import '../services/image_storage_service.dart';
import '../services/sync_service.dart';
import 'nidos_controller.dart';

/// Contenedor de dependencias de la app (inyección simple vía árbol).
class AppScope extends InheritedWidget {
  const AppScope({
    super.key,
    required this.db,
    required this.sync,
    required this.nidos,
    required this.imagenes,
    required super.child,
  });

  final DatabaseService db;
  final SyncService sync;
  final NidosController nidos;
  final ImageStorageService imagenes;

  static AppScope of(BuildContext context) {
    final s = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(s != null, 'AppScope no encontrado en el árbol de widgets');
    return s!;
  }

  @override
  bool updateShouldNotify(AppScope old) =>
      db != old.db ||
      sync != old.sync ||
      nidos != old.nidos ||
      imagenes != old.imagenes;
}
