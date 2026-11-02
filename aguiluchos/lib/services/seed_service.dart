import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'database_service.dart';
import 'excel_import_service.dart';

/// Carga inicial de los datos de campaña empaquetados en la APK
/// (`assets/seed/datos_campana.xlsx`). Es opcional: si el asset no existe
/// (p. ej. en el repositorio público) no hace nada. Se ejecuta una sola vez
/// por instalación y es idempotente (los ids se derivan de la numeración).
class SeedService {
  SeedService({AssetBundle? bundle, this.assetPath = defaultAsset})
    : _bundle = bundle ?? rootBundle;

  static const defaultAsset = 'assets/seed/datos_campana.xlsx';
  static const metaKey = 'seed_datos_campana_v1';

  final AssetBundle _bundle;
  final String assetPath;

  Future<ImportReport?> cargarSiProcede(DatabaseService db) async {
    if (await db.leerMeta(metaKey) != null) return null;
    final ByteData data;
    try {
      data = await _bundle.load(assetPath);
    } catch (_) {
      return null;
    }
    try {
      final bytes = data.buffer.asUint8List(
        data.offsetInBytes,
        data.lengthInBytes,
      );
      final report = await ExcelImportService().importar(db, bytes);
      await db.escribirMeta(metaKey, DateTime.now().toUtc().toIso8601String());
      debugPrint('Datos iniciales: ${report.nuevos} nidos importados.');
      return report;
    } catch (e) {
      debugPrint('No se pudieron cargar los datos iniciales: $e');
      return null;
    }
  }
}
