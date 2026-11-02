import 'package:flutter/widgets.dart';

import '../services/database_service.dart';
import '../services/export_service.dart';
import '../services/image_storage_service.dart';
import '../services/location_service.dart';
import '../services/sync_service.dart';

/// Contenedor de servicios (inyección sencilla vía InheritedWidget).
class AppServices extends InheritedWidget {
  const AppServices({
    super.key,
    required this.db,
    required this.sync,
    required this.images,
    required this.location,
    required this.export,
    required super.child,
  });

  final DatabaseService db;
  final SyncService sync;
  final ImageStorageService images;
  final LocationService location;
  final ExportService export;

  static AppServices of(BuildContext context) {
    final s = context.dependOnInheritedWidgetOfExactType<AppServices>();
    assert(s != null, 'AppServices no encontrado en el árbol de widgets');
    return s!;
  }

  @override
  bool updateShouldNotify(AppServices old) =>
      db != old.db || sync != old.sync || images != old.images;
}
