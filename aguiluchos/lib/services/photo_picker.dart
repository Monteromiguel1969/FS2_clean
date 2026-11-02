import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:image_picker/image_picker.dart';

/// Origen de fotos (abstraído para poder sustituirlo en tests).
abstract class PhotoPicker {
  /// `true` si el dispositivo dispone de cámara utilizable desde la app.
  bool get cameraAvailable;

  /// Devuelve la ruta temporal de la foto tomada, o `null` si se cancela.
  Future<String?> tomarFoto();

  /// Devuelve rutas de las imágenes elegidas.
  Future<List<String>> elegirDeGaleria();
}

/// Móvil: `image_picker` (cámara y galería). Escritorio: selector de archivos
/// (no hay API de cámara fiable en Windows/macOS/Linux; el botón de cámara
/// degrada a elegir un archivo).
class DevicePhotoPicker implements PhotoPicker {
  final _picker = ImagePicker();

  static bool get _isMobile => Platform.isAndroid || Platform.isIOS;

  @override
  bool get cameraAvailable => _isMobile;

  @override
  Future<String?> tomarFoto() async {
    if (!_isMobile) {
      final l = await elegirDeGaleria();
      return l.isEmpty ? null : l.first;
    }
    final x = await _picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 2400,
      imageQuality: 85,
    );
    return x?.path;
  }

  @override
  Future<List<String>> elegirDeGaleria() async {
    if (_isMobile) {
      final xs = await _picker.pickMultiImage(maxWidth: 2400, imageQuality: 85);
      return xs.map((x) => x.path).toList();
    }
    final xs = await openFiles(acceptedTypeGroups: const [
      XTypeGroup(
        label: 'Imágenes',
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic'],
        uniformTypeIdentifiers: ['public.image'],
      ),
    ]);
    return xs.map((x) => x.path).toList();
  }
}
