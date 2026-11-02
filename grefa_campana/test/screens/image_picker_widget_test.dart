import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:grefa_campana/models/nido_grefa_model.dart';
import 'package:grefa_campana/widgets/image_picker_widget.dart';
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
import 'package:path/path.dart' as p;

import 'harness.dart';

class _FakePicker extends ImagePickerPlatform {
  _FakePicker({required this.archivos, this.camara = true});

  final List<String> archivos;
  final bool camara;
  int llamadasCamara = 0;

  @override
  bool supportsImageSource(ImageSource source) =>
      source != ImageSource.camera || camara;

  @override
  Future<XFile?> getImageFromSource({
    required ImageSource source,
    ImagePickerOptions options = const ImagePickerOptions(),
  }) async {
    if (source == ImageSource.camera) llamadasCamara++;
    return archivos.isEmpty ? null : XFile(archivos.first);
  }

  @override
  Future<List<XFile>> getMultiImageWithOptions({
    MultiImagePickerOptions options = const MultiImagePickerOptions(),
  }) async => archivos.map(XFile.new).toList();
}

void main() {
  testWidgets(
    'galería y cámara copian la foto al almacén y la añaden a localImagePaths',
    (tester) async {
      tester.view.physicalSize = const Size(500, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final h = await Harness.crear(tester);

      final origen = Directory.systemTemp.createTempSync('grefa_orig_');
      addTearDown(() => origen.deleteSync(recursive: true));
      // PNG válido de 1x1 píxel.
      final png = [
        0x89,
        0x50,
        0x4E,
        0x47,
        0x0D,
        0x0A,
        0x1A,
        0x0A,
        0x00,
        0x00,
        0x00,
        0x0D,
        0x49,
        0x48,
        0x44,
        0x52,
        0x00,
        0x00,
        0x00,
        0x01,
        0x00,
        0x00,
        0x00,
        0x01,
        0x08,
        0x06,
        0x00,
        0x00,
        0x00,
        0x1F,
        0x15,
        0xC4,
        0x89,
        0x00,
        0x00,
        0x00,
        0x0D,
        0x49,
        0x44,
        0x41,
        0x54,
        0x78,
        0x9C,
        0x63,
        0xF8,
        0xFF,
        0xFF,
        0x3F,
        0x00,
        0x05,
        0xFE,
        0x02,
        0xFE,
        0xA7,
        0x35,
        0x81,
        0x84,
        0x00,
        0x00,
        0x00,
        0x00,
        0x49,
        0x45,
        0x4E,
        0x44,
        0xAE,
        0x42,
        0x60,
        0x82,
      ];
      final foto = File(p.join(origen.path, 'IMG_1.png'))
        ..writeAsBytesSync(png);

      final fake = _FakePicker(archivos: [foto.path]);
      ImagePickerPlatform.instance = fake;

      final nido = NidoGrefaModel();
      var cambios = 0;
      await tester.pumpWidget(
        h.envolver(
          Scaffold(
            body: SingleChildScrollView(
              child: ImagePickerWidget(
                nido: nido,
                etapa: EtapaFoto.seguimiento,
                almacen: h.imagenes,
                onChanged: () => cambios++,
              ),
            ),
          ),
        ),
      );

      expect(find.text('Sin fotografías todavía.'), findsOneWidget);

      await tester.tap(find.text('🖼️ Seleccionar de la Galería'));
      await esperarIo(tester);
      expect(nido.localImagePaths, hasLength(1));
      expect(
        p.basename(nido.localImagePaths.first),
        startsWith('seguimiento_'),
      );
      expect(p.dirname(nido.localImagePaths.first), h.dir.path);
      expect(File(nido.localImagePaths.first).existsSync(), isTrue);
      expect(cambios, 1);

      await tester.tap(find.text('📸 Tomar Fotografía'));
      await esperarIo(tester);
      expect(fake.llamadasCamara, 1);
      expect(nido.localImagePaths, hasLength(2));

      await tester.pump();
      expect(find.byType(GridView), findsOneWidget);
      expect(
        find.textContaining('2 foto(s) · 2 pendiente(s) de subir'),
        findsOneWidget,
      );
    },
  );

  testWidgets('sin cámara (escritorio) cae a la galería/selector de archivos', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(500, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final h = await Harness.crear(tester);
    final origen = Directory.systemTemp.createTempSync('grefa_orig_');
    addTearDown(() => origen.deleteSync(recursive: true));
    final foto = File(p.join(origen.path, 'a.jpg'))
      ..writeAsBytesSync([1, 2, 3]);
    final fake = _FakePicker(archivos: [foto.path], camara: false);
    ImagePickerPlatform.instance = fake;

    final nido = NidoGrefaModel();
    await tester.pumpWidget(
      h.envolver(
        Scaffold(
          body: ImagePickerWidget(
            nido: nido,
            etapa: EtapaFoto.cosecha,
            almacen: h.imagenes,
            onChanged: () {},
          ),
        ),
      ),
    );
    await tester.tap(find.text('📸 Tomar Fotografía'));
    await esperarIo(tester);

    expect(fake.llamadasCamara, 0);
    expect(nido.localImagePaths, hasLength(1));
    expect(p.basename(nido.localImagePaths.first), startsWith('cosecha_'));
    expect(find.textContaining('No hay cámara disponible'), findsOneWidget);
  });

  testWidgets(
    'cada pestaña solo muestra las fotos de su etapa y se pueden eliminar',
    (tester) async {
      tester.view.physicalSize = const Size(500, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final h = await Harness.crear(tester);
      final a = File(p.join(h.dir.path, 'seguimiento_1.jpg'))
        ..writeAsBytesSync([1]);
      final b = File(p.join(h.dir.path, 'cosecha_2.jpg'))
        ..writeAsBytesSync([2]);
      final nido = NidoGrefaModel()
        ..localImagePaths = [a.path, b.path]
        ..imageUrls = [
          'https://h/storage/v1/object/public/nidos-fotos/x/cosecha_remota.jpg',
        ];

      var cambios = 0;
      await tester.pumpWidget(
        h.envolver(
          Scaffold(
            body: ImagePickerWidget(
              nido: nido,
              etapa: EtapaFoto.cosecha,
              almacen: h.imagenes,
              onChanged: () => cambios++,
            ),
          ),
        ),
      );
      await tester.pump();
      expect(
        find.textContaining('2 foto(s)'),
        findsOneWidget,
      ); // cosecha_2 + remota
      expect(find.byIcon(Icons.cloud_done), findsOneWidget);
      expect(find.byIcon(Icons.cloud_upload_outlined), findsOneWidget);

      // Abrir en pantalla completa y eliminar la foto local.
      await tester.tap(find.byIcon(Icons.cloud_upload_outlined));
      await tester.pumpAndSettle();
      expect(find.text('Eliminar'), findsOneWidget);
      await tester.tap(find.text('Eliminar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Eliminar').last);
      await esperarIo(tester);

      expect(nido.localImagePaths, [a.path]);
      expect(cambios, 1);
      expect(b.existsSync(), isFalse);
      expect(find.textContaining('1 foto(s)'), findsOneWidget);
    },
  );

  test('EtapaFoto.pertenece asigna fotos sin prefijo a seguimiento', () {
    expect(EtapaFoto.pertenece('seguimiento_a.jpg', 'seguimiento'), isTrue);
    expect(EtapaFoto.pertenece('cosecha_a.jpg', 'seguimiento'), isFalse);
    expect(EtapaFoto.pertenece('web_upload.jpg', 'seguimiento'), isTrue);
    expect(EtapaFoto.pertenece('web_upload.jpg', 'cosecha'), isFalse);
  });
}
