import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:uuid/uuid.dart';

import 'app_directories.dart';

/// Categorías de foto; se codifican como prefijo del nombre de archivo para
/// poder repartir una única lista (`localImagePaths`) entre pestañas.
abstract final class FotoCategoria {
  static const seguimiento = 'seguimiento';
  static const cosecha = 'cosecha';
}

/// Copia las fotos al directorio de documentos de la app, de modo que
/// sobrevivan a la limpieza de la caché de la cámara/galería.
class ImageStorageService {
  ImageStorageService({Directory? baseDirectory}) : _base = baseDirectory;

  final Directory? _base;

  Future<Directory> _directory() async {
    final root = _base ?? await appDataDirectory();
    final dir = Directory(p.join(root.path, 'aguiluchos_fotos'));
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  /// Copia [sourcePath] y devuelve la ruta persistente.
  Future<String> importar(String sourcePath, {required String categoria}) async {
    final dir = await _directory();
    var ext = p.extension(sourcePath).toLowerCase();
    if (ext.isEmpty) ext = '.jpg';
    final dest = p.join(dir.path, '${categoria}_${const Uuid().v4()}$ext');
    await File(sourcePath).copy(dest);
    return dest;
  }

  Future<void> eliminar(String path) async {
    final f = File(path);
    if (await f.exists()) await f.delete();
  }

  /// Categoría a partir del nombre de archivo o de la URL remota.
  static String? categoriaDe(String pathOrUrl) {
    final name = pathOrUrl.split(RegExp(r'[\\/]')).last;
    final i = name.indexOf('_');
    return i > 0 ? name.substring(0, i) : null;
  }
}
