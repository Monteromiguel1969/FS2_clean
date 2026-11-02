import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:uuid/uuid.dart';

import 'directorios.dart';

/// Copia las fotos elegidas/capturadas a un directorio persistente de la app
/// (las rutas temporales de la cámara o la galería pueden desaparecer).
class ImageStorageService {
  ImageStorageService({Directory? directorio}) : _dir = directorio;

  Directory? _dir;

  Future<Directory> get directorio async {
    final existente = _dir;
    if (existente != null) {
      await existente.create(recursive: true);
      return existente;
    }
    final base = await directorioDocumentos();
    final d = Directory(p.join(base.path, 'fotos_nidos'));
    await d.create(recursive: true);
    return _dir = d;
  }

  /// Copia [origen] al directorio persistente con nombre `<etapa>_<uuid>.<ext>`
  /// y devuelve la ruta nueva.
  Future<String> importar(String origen, {required String etapa}) async {
    final dir = await directorio;
    var ext = p.extension(origen).toLowerCase();
    if (ext.isEmpty) ext = '.jpg';
    final destino = p.join(dir.path, '${etapa}_${const Uuid().v4()}$ext');
    await File(origen).copy(destino);
    return destino;
  }

  /// Si [ruta] ya no existe (p. ej. cambió el contenedor de la app en iOS),
  /// intenta localizar el mismo nombre en el directorio actual.
  String resolverSincrono(String ruta) {
    if (File(ruta).existsSync()) return ruta;
    final d = _dir;
    if (d == null) return ruta;
    final alternativa = p.join(d.path, p.basename(ruta));
    return File(alternativa).existsSync() ? alternativa : ruta;
  }

  Future<void> eliminar(String ruta) async {
    final f = File(resolverSincrono(ruta));
    if (await f.exists()) await f.delete();
  }
}
