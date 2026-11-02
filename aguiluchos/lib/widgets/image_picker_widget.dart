import 'dart:io';

import 'package:flutter/material.dart';

import '../app/app_services.dart';
import '../services/image_storage_service.dart';
import '../services/photo_picker.dart';

/// Galería de fotos de una pestaña (Seguimiento o Cosecha).
///
/// Trabaja sobre las listas completas `localImagePaths`/`remoteImageUrls` del
/// nido y solo muestra las de su [categoria] (prefijo del nombre de archivo).
/// Las fotos nuevas se copian al directorio de documentos de la app; la
/// subida a Supabase la hace [SyncService] en la siguiente sincronización.
/// El borrado físico de ficheros lo decide quien guarda el formulario.
class ImagePickerWidget extends StatefulWidget {
  const ImagePickerWidget({
    super.key,
    required this.categoria,
    required this.localPaths,
    required this.remoteUrls,
    required this.onLocalChanged,
    required this.onRemoteChanged,
    this.picker,
  });

  final String categoria;
  final List<String> localPaths;
  final List<String> remoteUrls;
  final ValueChanged<List<String>> onLocalChanged;
  final ValueChanged<List<String>> onRemoteChanged;
  final PhotoPicker? picker;

  @override
  State<ImagePickerWidget> createState() => _ImagePickerWidgetState();
}

class _Foto {
  const _Foto({this.localPath, this.url});
  final String? localPath;
  final String? url;
}

class _ImagePickerWidgetState extends State<ImagePickerWidget> {
  late final PhotoPicker _picker = widget.picker ?? DevicePhotoPicker();
  bool _busy = false;

  String _name(String s) => s.split(RegExp(r'[\\/]')).last;

  List<_Foto> get _fotos {
    final locales = widget.localPaths
        .where((p) => ImageStorageService.categoriaDe(p) == widget.categoria)
        .toList();
    final nombresLocales = locales.map(_name).toSet();
    final remotas = widget.remoteUrls
        .where((u) => ImageStorageService.categoriaDe(u) == widget.categoria)
        .where((u) => !nombresLocales.contains(_name(Uri.parse(u).path)));
    return [
      for (final l in locales) _Foto(localPath: l),
      for (final u in remotas) _Foto(url: u),
    ];
  }

  Future<void> _importar(List<String> origenes) async {
    if (origenes.isEmpty) return;
    final storage = AppServices.of(context).images;
    setState(() => _busy = true);
    try {
      final nuevas = <String>[];
      for (final o in origenes) {
        nuevas.add(await storage.importar(o, categoria: widget.categoria));
      }
      widget.onLocalChanged([...widget.localPaths, ...nuevas]);
    } catch (e) {
      _snack('No se pudo guardar la foto: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _tomarFoto() async {
    try {
      if (!_picker.cameraAvailable) {
        _snack('Este equipo no tiene cámara accesible: elige un archivo de imagen.');
      }
      final path = await _picker.tomarFoto();
      if (path != null) await _importar([path]);
    } catch (e) {
      _snack('No se pudo abrir la cámara: $e');
    }
  }

  Future<void> _galeria() async {
    try {
      await _importar(await _picker.elegirDeGaleria());
    } catch (e) {
      _snack('No se pudo abrir la galería: $e');
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  void _eliminar(_Foto f) {
    final nombre = f.localPath != null ? _name(f.localPath!) : _name(Uri.parse(f.url!).path);
    widget.onLocalChanged(
        widget.localPaths.where((p) => _name(p) != nombre).toList());
    widget.onRemoteChanged(widget.remoteUrls
        .where((u) => _name(Uri.parse(u).path) != nombre)
        .toList());
  }

  Future<void> _abrir(_Foto f) async {
    final eliminar = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => _FotoPantallaCompleta(foto: f)),
    );
    if (eliminar == true) _eliminar(f);
  }

  @override
  Widget build(BuildContext context) {
    final fotos = _fotos;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(spacing: 8, runSpacing: 8, children: [
          FilledButton.tonalIcon(
            onPressed: _busy ? null : _tomarFoto,
            icon: const Icon(Icons.photo_camera),
            label: const Text('Tomar Fotografía'),
          ),
          FilledButton.tonalIcon(
            onPressed: _busy ? null : _galeria,
            icon: const Icon(Icons.photo_library),
            label: const Text('Seleccionar de la Galería'),
          ),
        ]),
        const SizedBox(height: 10),
        if (_busy) const LinearProgressIndicator(),
        if (fotos.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('Sin fotografías todavía.'),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 130,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
            ),
            itemCount: fotos.length,
            itemBuilder: (context, i) {
              final f = fotos[i];
              return GestureDetector(
                onTap: () => _abrir(f),
                child: Stack(fit: StackFit.expand, children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: _FotoImagen(foto: f, fit: BoxFit.cover),
                  ),
                  if (f.localPath != null)
                    const Positioned(
                      right: 4,
                      bottom: 4,
                      child: Tooltip(
                        message: 'Pendiente de subir',
                        child: Icon(Icons.cloud_upload,
                            size: 18, color: Colors.white),
                      ),
                    ),
                ]),
              );
            },
          ),
      ],
    );
  }
}

class _FotoImagen extends StatelessWidget {
  const _FotoImagen({required this.foto, this.fit = BoxFit.contain});
  final _Foto foto;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final broken = ColoredBox(
      color: Colors.black12,
      child: const Center(child: Icon(Icons.broken_image)),
    );
    if (foto.localPath != null) {
      return Image.file(File(foto.localPath!),
          fit: fit, errorBuilder: (_, _, _) => broken);
    }
    return Image.network(foto.url!,
        fit: fit, errorBuilder: (_, _, _) => broken);
  }
}

class _FotoPantallaCompleta extends StatelessWidget {
  const _FotoPantallaCompleta({required this.foto});
  final _Foto foto;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Fotografía'),
        actions: [
          IconButton(
            tooltip: 'Eliminar',
            icon: const Icon(Icons.delete_outline),
            onPressed: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('¿Eliminar fotografía?'),
                  content: const Text('Se quitará de este nido al guardar.'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(ctx, false),
                        child: const Text('Cancelar')),
                    FilledButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text('Eliminar')),
                  ],
                ),
              );
              if (ok == true && context.mounted) Navigator.pop(context, true);
            },
          ),
        ],
      ),
      body: Center(
        child: InteractiveViewer(
          maxScale: 6,
          child: _FotoImagen(foto: foto),
        ),
      ),
    );
  }
}
