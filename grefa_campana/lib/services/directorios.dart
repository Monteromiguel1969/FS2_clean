import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Directorio persistente para archivos del usuario (fotos, exportaciones).
/// Si la plataforma no define "Documentos" (p. ej. Linux sin `xdg-user-dirs`)
/// se usa el directorio de soporte de la aplicación.
Future<Directory> directorioDocumentos() async {
  try {
    return await getApplicationDocumentsDirectory();
  } on MissingPlatformDirectoryException {
    return getApplicationSupportDirectory();
  }
}
