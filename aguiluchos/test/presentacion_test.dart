// ignore_for_file: depend_on_referenced_packages
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:aguiluchos/models/mapa_fondo.dart';
import 'package:aguiluchos/models/nido_grefa_model.dart';
import 'package:aguiluchos/services/informe_tecnico.dart';
import 'package:aguiluchos/services/mapa_imagen.dart';
import 'package:aguiluchos/services/presentacion.dart';
import 'package:aguiluchos/services/presentacion_pptx.dart';
import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:xml/xml.dart';

import 'helpers/fakes.dart';

NidoGrefaModel _n(
  String etiqueta, {
  String municipio = 'Toledo',
  String provincia = 'Toledo',
  String? resultado,
  int? nac,
  int? vol,
  int? mue,
  bool interv = false,
  List<String> manejo = const [],
  String? causa,
  String? campana,
  double? x,
  double? y,
}) =>
    nidoDeEjemplo(etiqueta: etiqueta, municipio: municipio)
      ..numeracion = etiqueta.replaceAll(RegExp(r'\D'), '')
      ..provincia = provincia
      ..campana = campana
      ..tlfn = '600111222'
      ..referenciaCatastral = 'REFCAT-9988'
      ..fechaIncubacion = DateTime(2026, 5, 1)
      ..resultadoReproductivo = resultado
      ..numPollosNacidos = nac
      ..numPollosVolados = vol
      ..numPollosMuertos = mue
      ..intervencion = interv
      ..tipoAccionesManejo = manejo
      ..causasFracaso = causa
      ..coordenadaX = x
      ..coordenadaY = y;

List<NidoGrefaModel> _datos() => [
      _n('E1', resultado: 'Éxito', nac: 3, vol: 2, mue: 1, interv: true, manejo: ['Dron'], campana: '2026', x: 440000, y: 4400000),
      _n('F1', municipio: 'Pinto', provincia: 'Madrid', resultado: 'Fracaso', nac: 0, causa: 'Depredación', campana: '2025'),
      _n('C1', nac: 2, vol: 2, mue: 1, campana: '2026'),
    ];

InformeBorrador _borrador({
  List<NidoGrefaModel>? nidos,
  Set<SeccionInforme>? secciones,
  List<MapaGenerado> mapas = const [],
  MapaFondo fondo = MapaFondo.osm,
}) =>
    InformeBorrador(
      nidos: nidos ?? _datos(),
      titulo: 'Presentación <de prueba> & más',
      referencia: 'REF-7',
      fecha: DateTime(2026, 11, 2),
      autor: 'Ana',
      cargo: 'Técnica',
      destinatario: 'Consejería',
      secciones: secciones,
    )
      ..mapas = [...mapas]
      ..fondo = fondo;

MapaGenerado _mapa(String nivel, String titulo) {
  final im = img.Image(width: 760, height: 400);
  img.fill(im, color: img.ColorRgb8(180, 200, 180));
  return MapaGenerado(
      nivel: nivel, titulo: titulo, n: 2, bytes: Uint8List.fromList(img.encodeJpg(im)));
}

List<String> _titulos(Presentacion p) => [for (final d in p.diapositivas) d.titulo];

Map<String, String> _textos(Uint8List pptx) {
  final zip = ZipDecoder().decodeBytes(pptx);
  return {
    for (final f in zip.files)
      if (f.isFile && (f.name.endsWith('.xml') || f.name.endsWith('.rels')))
        f.name: utf8.decode(f.content as List<int>),
  };
}

void main() {
  group('modelo', () {
    test('solo lleva las secciones marcadas', () {
      final p = armarPresentacion(_borrador(secciones: {SeccionInforme.alcance, SeccionInforme.causas}));
      expect(_titulos(p).any((t) => t.contains('Objeto y alcance')), isTrue);
      expect(_titulos(p).any((t) => t.contains('Causas de fracaso')), isTrue);
      expect(_titulos(p).any((t) => t.contains('Resumen ejecutivo')), isFalse);
      expect(_titulos(p).any((t) => t.contains('Relación de nidos')), isFalse);
      expect(_titulos(p).any((t) => t.contains('Ficha técnica')), isFalse);
      expect(p.diapositivas.whereType<DiapositivaMapa>(), isEmpty);
    });

    test('las secciones se numeran correlativamente', () {
      final p = armarPresentacion(_borrador(secciones: {SeccionInforme.alcance, SeccionInforme.conclusiones}));
      expect(_titulos(p), ['1. Objeto y alcance', '2. Observaciones y conclusiones']);
    });

    test('el texto editable del informe es el de la presentación', () {
      final b = _borrador(secciones: {SeccionInforme.alcance, SeccionInforme.conclusiones})
        ..alcance = 'Alcance editado a mano'
        ..conclusiones = 'Observación editada';
      final p = armarPresentacion(b);
      expect(p.diapositivas.whereType<DiapositivaTexto>().map((d) => d.texto),
          ['Alcance editado a mano', 'Observación editada']);
    });

    test('portada: título, referencia, destinatario y elaborado por', () {
      final p = armarPresentacion(_borrador(), ambito: 'Provincia: Toledo');
      expect(p.titulo, contains('de prueba'));
      expect(p.referencia, 'REF-7');
      expect(p.destinatario, 'Consejería');
      expect(p.elaboradoPor, 'Ana · Técnica');
      expect(p.ambito, 'Provincia: Toledo');
      expect(p.total, 3);
      expect(p.nombre, 'presentacion_aguiluchos_2026-11-02.pptx');
    });

    test('resumen: indicadores y gráficos con datos; en blanco lo que no se puede calcular', () {
      final p = armarPresentacion(_borrador(secciones: {SeccionInforme.resumen}));
      final kpis = p.diapositivas.whereType<DiapositivaKpis>().single;
      expect(kpis.items.firstWhere((k) => k.etiqueta == 'Nidos analizados').valor, '3');
      expect(kpis.items.firstWhere((k) => k.etiqueta == 'Tasa de éxito').valor, '50 %');
      final graficos = p.diapositivas.whereType<DiapositivaGrafico>().toList();
      expect(graficos.any((g) => g.titulo.contains('Resultado de la nidificación')), isTrue);
      expect(graficos.any((g) => g.titulo.contains('Pollos nacidos')), isTrue);
      expect(graficos.any((g) => g.titulo.contains('Tasa de éxito por campaña')), isTrue);

      final vacia = armarPresentacion(
          _borrador(nidos: [_n('Z1')], secciones: {SeccionInforme.resumen}));
      final k = vacia.diapositivas.whereType<DiapositivaKpis>().single.items;
      expect(k.firstWhere((e) => e.etiqueta == 'Tasa de éxito').valor, '');
      expect(k.firstWhere((e) => e.etiqueta == 'Productividad').valor, '');
      expect(vacia.diapositivas.whereType<DiapositivaGrafico>().where((g) => g.titulo.contains('Pollos')), isEmpty);
    });

    test('mapas: una diapositiva por mapa ordenadas, con el fondo y su atribución', () {
      final p = armarPresentacion(
        _borrador(
          secciones: {SeccionInforme.alcance},
          mapas: [_mapa('provincia', 'Toledo'), _mapa('general', 'Todos los nidos')],
          fondo: MapaFondo.pnoa,
        ),
        sinCoordenadas: 2,
      );
      final m = p.diapositivas.whereType<DiapositivaMapa>().toList();
      expect(m.length, 2);
      expect(m.first.titulo, contains('General'));
      expect(m.last.titulo, contains('Provincia: Toledo'));
      expect(m.first.pie, contains('Ortofoto (PNOA)'));
      expect(m.first.pie, contains('PNOA © Instituto Geográfico Nacional'));
      expect(m.first.pie, contains('2 nido(s) sin coordenadas'));
      expect(p.fondo, MapaFondo.pnoa);
    });

    test('tablas por grupo, causas, intervenciones y relación (celdas vacías en blanco)', () {
      final p = armarPresentacion(_borrador(secciones: {
        SeccionInforme.provincias,
        SeccionInforme.causas,
        SeccionInforme.intervenciones,
        SeccionInforme.relacion,
      }));
      final tablas = p.diapositivas.whereType<DiapositivaTabla>().toList();
      final prov = tablas.firstWhere((t) => t.titulo.contains('provincia'));
      expect(prov.filas.map((f) => f.first).toSet(), {'Toledo', 'Madrid'});
      final causas = tablas.firstWhere((t) => t.titulo.contains('Causas'));
      expect(causas.filas.single, ['Depredación', '1', '100 %']);
      final interv = tablas.firstWhere((t) => t.titulo.contains('Intervenciones'));
      expect(interv.filas.single[2], 'Dron');
      final rel = tablas.firstWhere((t) => t.titulo.contains('Relación'));
      final c1 = rel.filas.firstWhere((f) => f[1] == 'C1');
      expect(c1[4], '01/05/2026');
      final todas = [for (final t in tablas) for (final f in t.filas) ...f];
      expect(todas.where((c) => c == '—' || c == 'n/d'), isEmpty);
      expect(rel.filas.firstWhere((f) => f[1] == 'F1')[9], isNot('—'));
    });

    test('relación e intervenciones se paginan', () {
      final muchos = [for (var i = 1; i <= 20; i++) _n('N$i', resultado: 'Éxito', nac: 1, vol: 1, interv: true)];
      final p = armarPresentacion(_borrador(
          nidos: muchos, secciones: {SeccionInforme.relacion, SeccionInforme.intervenciones}));
      final rel = p.diapositivas.whereType<DiapositivaTabla>().where((t) => t.titulo.contains('Relación')).toList();
      expect(rel.length, 3);
      expect(rel.first.titulo, endsWith('(1/3)'));
      expect(rel.first.filas.length, 8);
      expect(rel.expand((t) => t.filas).length, 20);
      expect(rel.first.filas.first[1], 'N1', reason: 'orden por numeración');
    });

    test('fichas: dos diapositivas por nido y sin datos personales', () {
      final p = armarPresentacion(_borrador(secciones: {SeccionInforme.fichas}));
      final fichas = p.diapositivas.whereType<DiapositivaFicha>().toList();
      expect(fichas.length, 6);
      final campos = [
        for (final f in fichas) for (final b in [...f.izquierda, ...f.derecha]) for (final r in b.filas) r.$1,
      ];
      expect(campos, isNot(contains('Propietario')));
      expect(campos, isNot(contains('Teléfono')));
      expect(campos, isNot(contains('Referencia catastral')));
      expect(campos, contains('Campaña'));
      expect(campos, contains('Proyecto'));
      expect(fichas.where((f) => f.justificacion != null).length, 3);
    });

    test('trocearTexto conserva párrafos y parte los largos', () {
      expect(trocearTexto(''), isEmpty);
      expect(trocearTexto('Uno.\nDos.'), ['Uno.\nDos.']);
      final largo = List.filled(40, 'Una frase de prueba bastante larga.').join(' ');
      final t = trocearTexto(largo, 200);
      expect(t.length, greaterThan(3));
      expect(t.every((x) => x.length <= 200), isTrue);
    });

    test('ámbito: proyecto, campaña y nivel geográfico más concreto', () {
      expect(ambitoPresentacion(sinValor: 'S'), 'Todos los nidos');
      expect(
          ambitoPresentacion(
              proyecto: 'LIFE', campana: '2026', provincia: 'Toledo', localidad: 'Pinto', sinValor: 'S'),
          'Proyecto LIFE · Campaña 2026 · Localidad: Pinto');
      expect(ambitoPresentacion(campana: 'S', sinValor: 'S'), 'Sin campaña');
    });
  });

  group('archivo .pptx', () {
    late Presentacion completa;
    late Uint8List bytes;

    setUp(() {
      completa = armarPresentacion(
        _borrador(
          secciones: {for (final s in SeccionInforme.values) s},
          mapas: [_mapa('general', 'Todos los nidos'), _mapa('provincia', 'Toledo')],
          fondo: MapaFondo.pnoa,
        ),
        ambito: 'Campaña 2026',
      );
      bytes = construirPptx(completa);
    });

    test('es un zip OPC con todas las partes y XML bien formado', () {
      final partes = _textos(bytes);
      for (final n in [
        '[Content_Types].xml',
        '_rels/.rels',
        'ppt/presentation.xml',
        'ppt/_rels/presentation.xml.rels',
        'ppt/slideMasters/slideMaster1.xml',
        'ppt/slideLayouts/slideLayout1.xml',
        'ppt/theme/theme1.xml',
        'docProps/core.xml',
      ]) {
        expect(partes.containsKey(n), isTrue, reason: n);
      }
      for (final e in partes.entries) {
        expect(() => XmlDocument.parse(e.value), returnsNormally, reason: e.key);
      }
      final diapos = partes.keys.where((k) => RegExp(r'^ppt/slides/slide\d+\.xml$').hasMatch(k)).length;
      expect(diapos, completa.diapositivas.length + 1, reason: 'portada + diapositivas');
      final zip = ZipDecoder().decodeBytes(bytes);
      expect(zip.files.where((f) => f.name.startsWith('ppt/media/')).length, 2);
      expect(partes['[Content_Types].xml'], contains('image/jpeg'));
      expect(partes['ppt/presentation.xml'], contains('cx="12192000"'));
    });

    test('cada relación apunta a una parte que existe', () {
      final zip = ZipDecoder().decodeBytes(bytes);
      final nombres = {for (final f in zip.files) f.name};
      for (final f in zip.files.where((f) => f.name.endsWith('.rels'))) {
        final base = f.name.replaceFirst('_rels/', '').replaceFirst(RegExp(r'\.rels$'), '');
        final dir = base.contains('/') ? base.substring(0, base.lastIndexOf('/') + 1) : '';
        final doc = XmlDocument.parse(utf8.decode(f.content as List<int>));
        for (final r in doc.findAllElements('Relationship')) {
          final destino = Uri.parse('/$dir${r.getAttribute('Target')}').normalizePath().path.substring(1);
          expect(nombres, contains(destino), reason: '${f.name} -> $destino');
        }
      }
    });

    test('los identificadores de forma son únicos en cada diapositiva', () {
      for (final e in _textos(bytes).entries.where((e) => e.key.startsWith('ppt/slides/slide'))) {
        final doc = XmlDocument.parse(e.value);
        final ids = [for (final c in doc.findAllElements('cNvPr')) c.getAttribute('id')];
        expect(ids.toSet().length, ids.length, reason: e.key);
      }
    });

    test('lleva el título (con caracteres especiales escapados) y los datos de la portada', () {
      final plano = _textos(bytes)
          .entries
          .where((e) => e.key.startsWith('ppt/slides/slide') && e.key.endsWith('.xml'))
          .expand((e) => XmlDocument.parse(e.value).findAllElements('a:t').map((t) => t.innerText))
          .join('|');
      expect(plano, contains('Presentación <de prueba> & más'));
      expect(plano, contains('Referencia: REF-7'));
      expect(plano, contains('Destinatario: Consejería'));
      expect(plano, contains('Elaborado por: Ana · Técnica'));
      expect(plano, contains('Campaña 2026 · 3 nido(s)'));
    });

    test('no contiene propietario, teléfono ni referencia catastral', () {
      final todo = _textos(bytes).values.join();
      expect(todo, isNot(contains('Juan Pérez')));
      expect(todo, isNot(contains('600111222')));
      expect(todo, isNot(contains('REFCAT-9988')));
      expect(todo, isNot(contains('Propietario')));
      expect(todo, isNot(contains('Referencia catastral')));
    });

    test('sin mapas marcados no hay imágenes y sin secciones no hay sus diapositivas', () {
      final solo = construirPptx(armarPresentacion(_borrador(secciones: {SeccionInforme.alcance})));
      final zip = ZipDecoder().decodeBytes(solo);
      expect(zip.files.where((f) => f.name.startsWith('ppt/media/')), isEmpty);
      final partes = _textos(solo);
      expect(partes.keys.where((k) => RegExp(r'^ppt/slides/slide\d+\.xml$').hasMatch(k)).length, 2);
      expect(partes['[Content_Types].xml'], isNot(contains('image/jpeg')));
    });

    test('presentación vacía (sin nidos) se genera sin fallar', () {
      final b = _borrador(nidos: [], secciones: {for (final s in SeccionInforme.values) s});
      final pptx = construirPptx(armarPresentacion(b));
      expect(pptx.length, greaterThan(1000));
    });

    test('se puede volcar a disco (inspección manual)', () {
      final f = File('${Directory.systemTemp.path}/presentacion_prueba.pptx')..writeAsBytesSync(bytes);
      expect(f.lengthSync(), bytes.length);
    });
  });
}
