import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Directorio de datos de la app (base de datos, fotos, exportaciones).
///
/// Usa el directorio de documentos de la app; en escritorio Linux puede no
/// existir (sin `xdg-user-dirs`), en cuyo caso se usa el directorio de soporte.
Future<Directory> appDataDirectory() async {
  try {
    return await getApplicationDocumentsDirectory();
  } on MissingPlatformDirectoryException {
    return getApplicationSupportDirectory();
  }
}
