import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart' show FilePicker;
import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../app/app_services.dart';

/// Archivo generado (informe, Excel…) pendiente de entregar al usuario.
class ArchivoExportado {
  const ArchivoExportado({
    required this.nombre,
    required this.mime,
    required this.ext,
    required this.bytes,
  });
  final String nombre;
  final String mime;
  final String ext;
  final Uint8List bytes;
}

enum _Entrega { compartir, guardar }

/// Pregunta qué hacer con los archivos generados: guardarlos eligiendo dónde
/// (carpeta y nombre de cada uno) o compartirlos.
Future<void> entregarArchivos(
    BuildContext context, List<ArchivoExportado> archivos) async {
  final choice = await showModalBottomSheet<_Entrega>(
    context: context,
    builder: (ctx) => SafeArea(
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final a in archivos)
            ListTile(
              dense: archivos.length > 1,
              leading: Icon(switch (a.ext) {
                'pdf' => Icons.picture_as_pdf,
                'xlsx' => Icons.table_chart,
                'pptx' => Icons.slideshow,
                _ => Icons.description_outlined,
              }),
              title: Text(a.nombre,
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('${(a.bytes.length / 1024).toStringAsFixed(1)} KB'),
            ),
          const Divider(height: 1),
          ListTile(
            key: const Key('entrega-guardar'),
            leading: const Icon(Icons.save_alt),
            title: const Text('Guardar en…'),
            subtitle: Text(archivos.length > 1
                ? 'Elegirás carpeta y nombre de cada informe'
                : 'Elige carpeta y nombre del informe'),
            onTap: () => Navigator.pop(ctx, _Entrega.guardar),
          ),
          ListTile(
            key: const Key('entrega-compartir'),
            leading: const Icon(Icons.share),
            title: const Text('Compartir'),
            subtitle: const Text('WhatsApp, correo electrónico, Drive…'),
            onTap: () => Navigator.pop(ctx, _Entrega.compartir),
          ),
        ]),
      ),
    ),
  );
  if (choice == null || !context.mounted) return;

  void snack(String m) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  try {
    if (choice == _Entrega.guardar) {
      snack(await _guardarEn(archivos));
    } else {
      await _compartir(context, archivos, snack);
    }
  } catch (e) {
    snack('No se pudo completar la acción: $e');
  }
}

Future<void> _compartir(BuildContext context, List<ArchivoExportado> archivos,
    void Function(String) snack) async {
  final export = AppServices.of(context).export;
  try {
    final xfiles = <XFile>[];
    for (final a in archivos) {
      final f = await export.guardarTemporal(a.bytes, a.nombre);
      xfiles.add(XFile(f.path, mimeType: a.mime, name: a.nombre));
    }
    await SharePlus.instance.share(ShareParams(
      files: xfiles,
      subject: 'Aguiluchos GREFA - ${archivos.map((a) => a.nombre).join(', ')}',
      text: 'Informe de la campaña Aguilucho (GREFA).',
    ));
  } on UnimplementedError {
    snack('Compartir archivos no está disponible en este sistema; elige dónde guardarlo.');
    snack(await _guardarEn(archivos));
  }
}

/// Muestra el selector del sistema para cada archivo (carpeta + nombre).
Future<String> _guardarEn(List<ArchivoExportado> archivos) async {
  final guardados = <String>[];
  for (final a in archivos) {
    final destino = await _elegirDestino(a);
    if (destino == null) break; // cancelado: no se sigue preguntando
    guardados.add(destino);
  }
  if (guardados.isEmpty) return 'Guardado cancelado.';
  return guardados.length == 1
      ? 'Guardado en ${guardados.first}'
      : 'Guardados ${guardados.length} archivos:\n${guardados.join('\n')}';
}

/// Devuelve la ruta/URI donde se guardó o `null` si se canceló.
Future<String?> _elegirDestino(ArchivoExportado a) async {
  if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
    final loc = await getSaveLocation(
      suggestedName: a.nombre,
      acceptedTypeGroups: [
        XTypeGroup(label: a.ext.toUpperCase(), extensions: [a.ext]),
      ],
    );
    if (loc == null) return null;
    await File(loc.path).writeAsBytes(a.bytes, flush: true);
    return loc.path;
  }
  // Android / iOS: selector del sistema (Storage Access Framework).
  final uri = await FilePicker.saveFile(
    fileName: a.nombre,
    bytes: a.bytes,
    mimeType: a.mime,
    dialogTitle: 'Guardar ${a.nombre}',
  );
  return uri == null ? null : (uri.scheme == 'file' ? uri.toFilePath() : a.nombre);
}
