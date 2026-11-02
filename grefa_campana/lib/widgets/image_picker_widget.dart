import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;

import '../models/nido_grefa_model.dart';
import '../services/image_storage_service.dart';
import '../services/sync_service.dart';

/// Etapas con fotos. El nombre del archivo lleva el prefijo `<etapa>_`, de modo
/// que todas las fotos del nido viven en `localImagePaths`/`imageUrls` pero cada
/// pestaña muestra solo las suyas.
abstract final class EtapaFoto {
  static const String seguimiento = 'seguimiento';
  static const String cosecha = 'cosecha';
  static const List<String> todas = [seguimiento, cosecha];

  /// Las fotos sin prefijo conocido (p. ej. subidas desde el panel web) se
  /// muestran en Seguimiento.
  static bool pertenece(String nombreArchivo, String etapa) {
    for (final e in todas) {
      if (nombreArchivo.startsWith('${e}_')) return e == etapa;
    }
    return etapa == seguimiento;
  }
}

class _Foto {
  _Foto({required this.nombre, this.rutaLocal, this.url});

  final String nombre;
  final String? rutaLocal;
  final String? url;

  bool get subida => url != null;
}

/// Captura/selección de fotografías para un nido.
///
/// * "Tomar fotografía": cámara en móvil; en escritorio sin cámara se ofrece
///   directamente el selector de archivos.
/// * "Seleccionar de la galería": galería (móvil) o selector de archivos (PC).
/// * Las imágenes se copian a un directorio persistente y su ruta se añade a
///   `nido.localImagePaths`; la sincronización las sube después.
class ImagePickerWidget extends StatefulWidget {
  const ImagePickerWidget({
    super.key,
    required this.nido,
    required this.etapa,
    required this.almacen,
    required this.onChanged,
    this.picker,
  });

  final NidoGrefaModel nido;
  final String etapa;
  final ImageStorageService almacen;

  /// Se invoca tras añadir o eliminar una foto (para marcar el formulario).
  final VoidCallback onChanged;

  final ImagePicker? picker;

  @override
  State<ImagePickerWidget> createState() => _ImagePickerWidgetState();
}

class _ImagePickerWidgetState extends State<ImagePickerWidget> {
  late final ImagePicker _picker = widget.picker ?? ImagePicker();
  bool _ocupado = false;

  List<_Foto> _fotos() {
    final nido = widget.nido;
    final porNombre = <String, _Foto>{};
    final urls = {
      for (final u in nido.imageUrls) SyncService.nombreDeUrl(u): u,
    };

    for (final ruta in nido.localImagePaths) {
      final nombre = p.basename(ruta);
      if (!EtapaFoto.pertenece(nombre, widget.etapa)) continue;
      final real = widget.almacen.resolverSincrono(ruta);
      final existe = File(real).existsSync();
      if (!existe && !urls.containsKey(nombre)) continue;
      porNombre[nombre] = _Foto(
        nombre: nombre,
        rutaLocal: existe ? real : null,
        url: urls[nombre],
      );
    }
    urls.forEach((nombre, url) {
      if (!EtapaFoto.pertenece(nombre, widget.etapa)) return;
      porNombre.putIfAbsent(nombre, () => _Foto(nombre: nombre, url: url));
    });
    return porNombre.values.toList();
  }

  bool get _escritorio =>
      !kIsWeb && (Platform.isWindows || Platform.isLinux || Platform.isMacOS);

  Future<void> _tomarFoto() async {
    var origen = ImageSource.camera;
    var avisoFallback = false;
    try {
      if (!_picker.supportsImageSource(ImageSource.camera)) {
        origen = ImageSource.gallery;
        avisoFallback = true;
      }
    } catch (_) {
      origen = ImageSource.gallery;
      avisoFallback = true;
    }
    if (avisoFallback && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'No hay cámara disponible en este equipo: elige un archivo.',
          ),
        ),
      );
    }
    await _elegir(origen);
  }

  Future<void> _elegir(ImageSource origen) async {
    if (_ocupado) return;
    setState(() => _ocupado = true);
    try {
      List<XFile> archivos;
      if (origen == ImageSource.gallery) {
        archivos = await _picker.pickMultiImage(
          maxWidth: 2560,
          imageQuality: 85,
        );
      } else {
        final f = await _picker.pickImage(
          source: ImageSource.camera,
          maxWidth: 2560,
          imageQuality: 85,
        );
        archivos = f == null ? [] : [f];
      }
      for (final a in archivos) {
        final ruta = await widget.almacen.importar(a.path, etapa: widget.etapa);
        widget.nido.localImagePaths = [...widget.nido.localImagePaths, ruta];
      }
      if (archivos.isNotEmpty) widget.onChanged();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No se pudo obtener la imagen: $e')),
        );
      }
      if (origen == ImageSource.camera && _escritorio && mounted) {
        // Cámara no operativa en escritorio: se ofrece el selector de archivos.
        setState(() => _ocupado = false);
        return _elegir(ImageSource.gallery);
      }
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  Future<void> _abrir(_Foto foto) async {
    final eliminar = await showDialog<bool>(
      context: context,
      builder: (_) => _VisorFoto(foto: foto),
    );
    if (eliminar != true) return;
    final nido = widget.nido;
    nido.localImagePaths = nido.localImagePaths
        .where((r) => p.basename(r) != foto.nombre)
        .toList();
    nido.imageUrls = nido.imageUrls
        .where((u) => SyncService.nombreDeUrl(u) != foto.nombre)
        .toList();
    if (foto.rutaLocal != null) {
      await widget.almacen.eliminar(foto.rutaLocal!);
    }
    widget.onChanged();
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final fotos = _fotos();
    final pendientes = fotos.where((f) => !f.subida).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.tonal(
              onPressed: _ocupado ? null : _tomarFoto,
              child: const Text('📸 Tomar Fotografía'),
            ),
            FilledButton.tonal(
              onPressed: _ocupado ? null : () => _elegir(ImageSource.gallery),
              child: const Text('🖼️ Seleccionar de la Galería'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (fotos.isEmpty)
          Text(
            'Sin fotografías todavía.',
            style: Theme.of(context).textTheme.bodySmall,
          )
        else ...[
          Text(
            '${fotos.length} foto(s)'
            '${pendientes > 0 ? ' · $pendientes pendiente(s) de subir' : ' · todas subidas'}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 6),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 120,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
            ),
            itemCount: fotos.length,
            itemBuilder: (_, i) {
              final f = fotos[i];
              return InkWell(
                onTap: () => _abrir(f),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: _imagen(f, cacheWidth: 300),
                    ),
                    Positioned(
                      right: 4,
                      top: 4,
                      child: Icon(
                        f.subida
                            ? Icons.cloud_done
                            : Icons.cloud_upload_outlined,
                        size: 18,
                        color: f.subida
                            ? Colors.greenAccent
                            : Colors.orangeAccent,
                        shadows: const [
                          Shadow(blurRadius: 4, color: Colors.black87),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ],
    );
  }
}

Widget _imagen(_Foto f, {int? cacheWidth, BoxFit fit = BoxFit.cover}) {
  Widget roto() => const ColoredBox(
    color: Color(0x11000000),
    child: Center(child: Icon(Icons.broken_image_outlined)),
  );
  if (f.rutaLocal != null) {
    return Image.file(
      File(f.rutaLocal!),
      fit: fit,
      cacheWidth: cacheWidth,
      errorBuilder: (_, _, _) => roto(),
    );
  }
  return Image.network(
    f.url!,
    fit: fit,
    cacheWidth: cacheWidth,
    errorBuilder: (_, _, _) => roto(),
  );
}

class _VisorFoto extends StatelessWidget {
  const _VisorFoto({required this.foto});
  final _Foto foto;

  @override
  Widget build(BuildContext context) {
    return Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: Stack(
        children: [
          Positioned.fill(
            child: InteractiveViewer(
              minScale: 0.5,
              maxScale: 6,
              child: Center(child: _imagen(foto, fit: BoxFit.contain)),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.topCenter,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: 'Cerrar',
                      color: Colors.white,
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context, false),
                    ),
                    const Spacer(),
                    FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.red.shade700,
                      ),
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('Eliminar'),
                      onPressed: () async {
                        final ok = await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text('Eliminar fotografía'),
                            content: const Text('¿Quitar esta foto del nido?'),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(ctx, false),
                                child: const Text('Cancelar'),
                              ),
                              FilledButton(
                                onPressed: () => Navigator.pop(ctx, true),
                                child: const Text('Eliminar'),
                              ),
                            ],
                          ),
                        );
                        if (ok == true && context.mounted) {
                          Navigator.pop(context, true);
                        }
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
