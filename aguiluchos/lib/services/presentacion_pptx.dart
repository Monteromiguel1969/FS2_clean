import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:archive/archive.dart';

import 'presentacion.dart';

/// Escritor de .pptx (Office Open XML) sin dependencias de PowerPoint: texto,
/// formas, tablas e imágenes estándar, que abren igual en PowerPoint, Keynote,
/// LibreOffice y Google Slides. Los gráficos se dibujan con formas (barras).

const _verde = '2E6B3A';
const _verdeOsc = '1F4A28';
const _gris = 'F3F5F2';
const _texto = '1D2A1F';
const _suave = '5F6D62';
const _borde = 'D9DFD6';
const _fuente = 'Arial';
const _anchoDiapo = 13.333;

const mimePptx = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

int _emu(double pulgadas) => (pulgadas * 914400).round();

/// Texto apto para XML 1.0: escapa y descarta caracteres de control.
String _esc(String s) {
  final b = StringBuffer();
  for (final c in s.runes) {
    final ok = c == 0x9 || c == 0xA || c == 0xD ||
        (c >= 0x20 && c <= 0xD7FF) ||
        (c >= 0xE000 && c <= 0xFFFD) ||
        (c >= 0x10000 && c <= 0x10FFFF);
    if (!ok) continue;
    switch (c) {
      case 0x26:
        b.write('&amp;');
      case 0x3C:
        b.write('&lt;');
      case 0x3E:
        b.write('&gt;');
      case 0x22:
        b.write('&quot;');
      default:
        b.writeCharCode(c);
    }
  }
  return b.toString();
}

class _Imagen {
  _Imagen(this.rId, this.archivo, this.bytes);
  final String rId;
  final String archivo;
  final Uint8List bytes;
}

class _Diapo {
  _Diapo({this.fondo});
  final String? fondo;
  final StringBuffer _formas = StringBuffer();
  final List<_Imagen> imagenes = [];
  int _id = 1;
  int get _nuevoId => ++_id;

  String get xml => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld>'
      '${fondo == null ? '' : '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="$fondo"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'}'
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
      '$_formas</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';

  String get rels => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
      '${imagenes.map((i) => '<Relationship Id="${i.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${i.archivo}"/>').join()}'
      '</Relationships>';

  String _xfrm(double x, double y, double w, double h) =>
      '<a:xfrm><a:off x="${_emu(x)}" y="${_emu(y)}"/><a:ext cx="${_emu(w)}" cy="${_emu(h)}"/></a:xfrm>';

  /// Rectángulo (relleno y borde opcionales).
  void rect(double x, double y, double w, double h, {String? relleno, String? borde}) {
    final id = _nuevoId;
    _formas.write('<p:sp><p:nvSpPr><p:cNvPr id="$id" name="Forma $id"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        '<p:spPr>${_xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
        '${relleno == null ? '<a:noFill/>' : '<a:solidFill><a:srgbClr val="$relleno"/></a:solidFill>'}'
        '${borde == null ? '<a:ln><a:noFill/></a:ln>' : '<a:ln w="9525"><a:solidFill><a:srgbClr val="$borde"/></a:solidFill></a:ln>'}'
        '</p:spPr><p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="es-ES"/></a:p></p:txBody></p:sp>');
  }

  static String _parrafo(String t, double pt, String color, bool negrita, String alin, double? sepDespues) {
    final pPr = '<a:pPr algn="$alin">${sepDespues == null ? '' : '<a:spcAft><a:spcPts val="${(sepDespues * 100).round()}"/></a:spcAft>'}</a:pPr>';
    if (t.isEmpty) return '<a:p>$pPr<a:endParaRPr lang="es-ES" sz="${(pt * 100).round()}"/></a:p>';
    return '<a:p>$pPr<a:r><a:rPr lang="es-ES" sz="${(pt * 100).round()}" b="${negrita ? 1 : 0}" dirty="0">'
        '<a:solidFill><a:srgbClr val="$color"/></a:solidFill><a:latin typeface="$_fuente"/><a:cs typeface="$_fuente"/></a:rPr>'
        '<a:t>${_esc(t)}</a:t></a:r></a:p>';
  }

  /// Cuadro de texto. Los saltos de línea del texto son párrafos distintos.
  void texto(
    double x,
    double y,
    double w,
    double h,
    String t, {
    double pt = 14,
    String color = _texto,
    bool negrita = false,
    String alin = 'l',
    String anclaje = 't',
    double? sepDespues,
  }) {
    final id = _nuevoId;
    final parrafos = t.split('\n').map((l) => _parrafo(l, pt, color, negrita, alin, sepDespues)).join();
    _formas.write('<p:sp><p:nvSpPr><p:cNvPr id="$id" name="Texto $id"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
        '<p:spPr>${_xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
        '<p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="$anclaje"><a:normAutofit/></a:bodyPr>'
        '<a:lstStyle/>$parrafos</p:txBody></p:sp>');
  }

  void imagen(Uint8List bytes, String archivo, double x, double y, double w, double h, String descripcion) {
    final rId = 'rId${imagenes.length + 2}';
    imagenes.add(_Imagen(rId, archivo, bytes));
    final id = _nuevoId;
    _formas.write('<p:pic><p:nvPicPr><p:cNvPr id="$id" name="Imagen $id" descr="${_esc(descripcion)}"/>'
        '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
        '<p:blipFill><a:blip r:embed="$rId"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
        '<p:spPr>${_xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>');
  }

  static String _linea(String lado, String color) =>
      '<a:$lado w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="$color"/></a:solidFill><a:prstDash val="solid"/></a:$lado>';

  /// Tabla nativa. [filas] ya incluye la cabecera como primera fila.
  void tabla(
    double x,
    double y,
    List<double> anchos,
    double altoFila,
    List<List<({String t, bool num, bool cabecera})>> filas, {
    double pt = 10.5,
  }) {
    final id = _nuevoId;
    final w = anchos.fold(0.0, (a, b) => a + b);
    final sb = StringBuffer()
      ..write('<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="$id" name="Tabla $id"/>'
          '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>'
          '<p:xfrm><a:off x="${_emu(x)}" y="${_emu(y)}"/><a:ext cx="${_emu(w)}" cy="${_emu(altoFila * filas.length)}"/></p:xfrm>'
          '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>'
          '<a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>');
    for (final a in anchos) {
      sb.write('<a:gridCol w="${_emu(a)}"/>');
    }
    sb.write('</a:tblGrid>');
    for (var r = 0; r < filas.length; r++) {
      sb.write('<a:tr h="${_emu(altoFila)}">');
      for (final c in filas[r]) {
        final relleno = c.cabecera ? _verdeOsc : (r.isOdd ? 'FFFFFF' : _gris);
        final color = c.cabecera ? 'FFFFFF' : _texto;
        final alin = c.num ? 'r' : 'l';
        final celda = _parrafo(c.t, pt, color, c.cabecera, alin, null);
        sb.write('<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>$celda</a:txBody>'
            '<a:tcPr marL="64008" marR="64008" marT="27432" marB="27432" anchor="ctr">'
            '${_linea('lnL', _borde)}${_linea('lnR', _borde)}${_linea('lnT', _borde)}${_linea('lnB', _borde)}'
            '<a:solidFill><a:srgbClr val="$relleno"/></a:solidFill></a:tcPr></a:tc>');
      }
      sb.write('</a:tr>');
    }
    sb.write('</a:tbl></a:graphicData></a:graphic></p:graphicFrame>');
    _formas.write(sb);
  }
}

/// Encaja una imagen de ancho×alto en una caja, centrada y sin deformarla.
({double x, double y, double w, double h}) encajarImagen(
  double ancho,
  double alto,
  ({double x, double y, double w, double h}) caja,
) {
  final r = math.min(caja.w / ancho, caja.h / alto);
  final w = ancho * r;
  final h = alto * r;
  return (x: caja.x + (caja.w - w) / 2, y: caja.y + (caja.h - h) / 2, w: w, h: h);
}

String _numFmt(num v) =>
    v == v.roundToDouble() ? '${v.round()}' : v.toStringAsFixed(1).replaceAll('.', ',');

/// Genera el contenido del .pptx.
Uint8List construirPptx(Presentacion m) {
  final diapos = <_Diapo>[];
  final medios = <String, Uint8List>{};

  // Portada
  final portada = _Diapo(fondo: _verdeOsc);
  portada.texto(0.8, 0.6, 11.7, 0.6, 'GREFA', pt: 24, negrita: true, color: 'D9EBDD');
  portada.texto(0.8, 1.5, 11.7, 1.6, m.titulo, pt: m.titulo.length > 90 ? 26 : 34, negrita: true, color: 'FFFFFF');
  portada.texto(0.8, 3.2, 11.7, 0.6, '${m.ambito} · ${m.total} nido(s)', pt: 22, color: 'D9EBDD');
  final meta = [
    ('Referencia', m.referencia),
    ('Fecha de emisión', m.fecha),
    ('Elaborado por', m.elaboradoPor),
    ('Destinatario', m.destinatario),
    ('Filtros', m.filtros),
  ].where((e) => e.$2.trim().isNotEmpty);
  portada.texto(0.8, 4.1, 11.7, 2.6, meta.map((e) => '${e.$1}: ${e.$2}').join('\n'),
      pt: 14, color: 'FFFFFF', sepDespues: 4);
  diapos.add(portada);

  var pagina = 1;
  _Diapo nueva(String titulo) {
    final d = _Diapo();
    pagina += 1;
    d.rect(0, 0, _anchoDiapo, 0.9, relleno: _verde);
    final pt = titulo.length > 110 ? 14.0 : titulo.length > 80 ? 17.0 : 22.0;
    d.texto(0.5, 0.1, 12.3, 0.7, titulo, pt: pt, negrita: true, color: 'FFFFFF', anclaje: 'ctr');
    d.texto(0.5, 7.05, 12.3, 0.3, '${m.referencia} · $pagina', pt: 9, color: _suave, alin: 'r');
    diapos.add(d);
    return d;
  }

  void bloquesFicha(_Diapo d, List<BloqueFicha> bloques, double x, double w) {
    final filas = bloques.fold(0, (a, b) => a + b.filas.length);
    final disponible = 5.85 - bloques.length * 0.34;
    final alto = filas == 0 ? 0.27 : math.min(0.27, disponible / filas);
    final pt = alto >= 0.26 ? 9.0 : alto >= 0.22 ? 8.0 : 7.0;
    var y = 1.05;
    for (final b in bloques) {
      d.texto(x, y, w, 0.3, b.titulo, pt: 11, negrita: true, color: _verde);
      y += 0.32;
      d.tabla(
        x,
        y,
        [w * 0.4, w * 0.6],
        alto,
        [
          for (final (k, v) in b.filas)
            [(t: k, num: false, cabecera: false), (t: v, num: false, cabecera: false)],
        ],
        pt: pt,
      );
      y += b.filas.length * alto + 0.2;
    }
  }

  for (final s in m.diapositivas) {
    final d = nueva(s.titulo);
    switch (s) {
      case DiapositivaTexto():
        d.texto(0.7, 1.2, 11.9, 5.6, s.texto, pt: 18, sepDespues: 10);
      case DiapositivaKpis():
        for (var i = 0; i < s.items.length; i++) {
          final t = s.items[i];
          final x = 0.5 + (i % 4) * 3.1;
          final y = 1.15 + (i ~/ 4) * 1.9;
          d.rect(x, y, 2.9, 1.7, relleno: _gris, borde: _borde);
          d.texto(x, y + 0.1, 2.9, 0.95, t.valor,
              pt: 34, negrita: true, color: t.color ?? _texto, alin: 'ctr', anclaje: 'ctr');
          d.texto(x, y + 1.05, 2.9, 0.55, t.etiqueta, pt: 12, color: _suave, alin: 'ctr', anclaje: 'ctr');
        }
      case DiapositivaGrafico():
        _dibujarGrafico(d, s);
      case DiapositivaTabla():
        final total = s.columnas.fold(0.0, (a, c) => a + c.peso);
        final anchos = [for (final c in s.columnas) c.peso * 12.3 / total];
        d.tabla(
          0.5,
          1.1,
          anchos,
          s.compacta ? 0.55 : 0.42,
          [
            [for (final c in s.columnas) (t: c.titulo, num: c.numerica, cabecera: true)],
            for (final f in s.filas)
              [
                for (var j = 0; j < f.length; j++)
                  (t: f[j], num: s.columnas[j].numerica, cabecera: false),
              ],
          ],
          pt: s.compacta ? 9 : 10.5,
        );
        if (s.filas.isEmpty) {
          d.texto(0.5, 2.6, 12.3, 0.5, 'Sin datos.', pt: 14, color: _suave);
        }
      case DiapositivaMapa():
        final c = encajarImagen(s.mapa.ancho.toDouble(), s.mapa.alto.toDouble(),
            (x: 0.5, y: 1.1, w: 12.33, h: 5.4));
        final archivo = 'image${medios.length + 1}.jpeg';
        medios[archivo] = s.mapa.bytes;
        d.imagen(s.mapa.bytes, archivo, c.x, c.y, c.w, c.h, 'Mapa: ${s.mapa.titulo}');
        d.texto(0.5, 6.55, 12.3, 0.45, s.pie, pt: 10, color: _suave);
      case DiapositivaFicha():
        bloquesFicha(d, s.izquierda, 0.5, 6.0);
        if (s.derecha.isNotEmpty) bloquesFicha(d, s.derecha, 6.85, 6.0);
        if (s.justificacion != null) {
          d.texto(6.85, 1.05, 6, 0.3, 'Justificación de conservación', pt: 11, negrita: true, color: _verde);
          d.texto(6.85, 1.4, 6, 3.2, s.justificacion!, pt: 11);
        }
    }
  }

  return _empaquetar(m, diapos, medios);
}

void _dibujarGrafico(_Diapo d, DiapositivaGrafico g) {
  const x0 = 0.7, y0 = 1.2, w = 11.9, h = 5.6;
  if (g.variante == VarianteGrafico.barraHorizontal) {
    final valores = g.series.first.valores;
    final tope = g.maximo ?? math.max<num>(1, valores.fold<num>(0, math.max));
    final fila = math.min(0.6, h / math.max(1, valores.length));
    const anchoEtiqueta = 4.3;
    const anchoMax = 6.2;
    for (var i = 0; i < valores.length; i++) {
      final y = y0 + i * fila;
      final color = g.coloresBarra != null ? g.coloresBarra![i] : g.series.first.color;
      d.texto(x0, y, anchoEtiqueta, fila, g.etiquetas[i],
          pt: fila >= 0.5 ? 12 : 10, alin: 'r', anclaje: 'ctr');
      final bw = math.max(0.02, anchoMax * (valores[i] / tope));
      d.rect(x0 + anchoEtiqueta + 0.15, y + fila * 0.15, bw, fila * 0.7, relleno: color);
      d.texto(x0 + anchoEtiqueta + 0.2 + bw, y, 1.2, fila, '${_numFmt(valores[i])}${g.sufijo}',
          pt: 12, negrita: true, anclaje: 'ctr');
    }
    return;
  }

  final grupos = g.etiquetas.length;
  final nSeries = g.series.length;
  final tope = math.max<num>(
      1, g.series.fold<num>(0, (a, s) => math.max(a, s.valores.fold<num>(0, math.max))));
  const base = y0 + 4.6;
  const altoMax = 3.9;
  final anchoGrupo = w / math.max(1, grupos);
  final anchoBarra = math.min(0.8, anchoGrupo * 0.8 / nSeries);
  for (var i = 0; i < grupos; i++) {
    final gx = x0 + i * anchoGrupo + (anchoGrupo - anchoBarra * nSeries) / 2;
    for (var k = 0; k < nSeries; k++) {
      final v = g.series[k].valores[i];
      final alto = math.max(0.02, altoMax * (v / tope));
      final bx = gx + k * anchoBarra;
      d.rect(bx, base - alto, anchoBarra * 0.92, alto, relleno: g.series[k].color);
      d.texto(bx - 0.2, base - alto - 0.36, anchoBarra * 0.92 + 0.4, 0.34, _numFmt(v),
          pt: 11, negrita: true, alin: 'ctr', anclaje: 'b');
    }
    d.texto(x0 + i * anchoGrupo, base + 0.05, anchoGrupo, 0.4, g.etiquetas[i],
        pt: 12, alin: 'ctr', anclaje: 't');
  }
  d.rect(x0, base, w, 0.012, relleno: _suave);
  if (g.leyenda) {
    var lx = x0 + 3.2;
    for (final s in g.series) {
      d.rect(lx, base + 0.62, 0.22, 0.22, relleno: s.color);
      d.texto(lx + 0.28, base + 0.55, 1.6, 0.36, s.nombre, pt: 12, anclaje: 'ctr');
      lx += 2.1;
    }
  }
}

// ── Paquete OPC ─────────────────────────────────────────────────────────────

const _nsA = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const _nsR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const _nsP = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const _cabecera = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const _relBase = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

Uint8List _empaquetar(Presentacion m, List<_Diapo> diapos, Map<String, Uint8List> medios) {
  final zip = Archive();
  void add(String nombre, String contenido) {
    final b = utf8.encode(contenido);
    zip.addFile(ArchiveFile(nombre, b.length, b));
  }

  add('[Content_Types].xml',
      '$_cabecera<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      '<Default Extension="xml" ContentType="application/xml"/>'
      '${medios.isEmpty ? '' : '<Default Extension="jpeg" ContentType="image/jpeg"/>'}'
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
      '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>'
      '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>'
      '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>'
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      '${[for (var i = 1; i <= diapos.length; i++) '<Override PartName="/ppt/slides/slide$i.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'].join()}'
      '</Types>');

  add('_rels/.rels',
      '$_cabecera<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      '<Relationship Id="rId1" Type="$_relBase/officeDocument" Target="ppt/presentation.xml"/>'
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      '<Relationship Id="rId3" Type="$_relBase/extended-properties" Target="docProps/app.xml"/>'
      '</Relationships>');

  final ahora = DateTime.now().toUtc().toIso8601String().split('.').first;
  add('docProps/core.xml',
      '$_cabecera<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
      'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      '<dc:title>${_esc(m.titulo)}</dc:title><dc:creator>${_esc(m.elaboradoPor.isEmpty ? 'GREFA' : m.elaboradoPor)}</dc:creator>'
      '<dcterms:created xsi:type="dcterms:W3CDTF">${ahora}Z</dcterms:created>'
      '<dcterms:modified xsi:type="dcterms:W3CDTF">${ahora}Z</dcterms:modified></cp:coreProperties>');
  add('docProps/app.xml',
      '$_cabecera<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
      '<Application>GREFA Aguiluchos</Application><Company>GREFA</Company><Slides>${diapos.length}</Slides></Properties>');

  add('ppt/presentation.xml',
      '$_cabecera<p:presentation xmlns:a="$_nsA" xmlns:r="$_nsR" xmlns:p="$_nsP">'
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
      '<p:sldIdLst>${[for (var i = 0; i < diapos.length; i++) '<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>'].join()}</p:sldIdLst>'
      '<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>'
      '<p:defaultTextStyle><a:defPPr><a:defRPr lang="es-ES"/></a:defPPr></p:defaultTextStyle></p:presentation>');
  final n = diapos.length;
  add('ppt/_rels/presentation.xml.rels',
      '$_cabecera<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      '<Relationship Id="rId1" Type="$_relBase/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
      '${[for (var i = 1; i <= n; i++) '<Relationship Id="rId${i + 1}" Type="$_relBase/slide" Target="slides/slide$i.xml"/>'].join()}'
      '<Relationship Id="rId${n + 2}" Type="$_relBase/presProps" Target="presProps.xml"/>'
      '<Relationship Id="rId${n + 3}" Type="$_relBase/viewProps" Target="viewProps.xml"/>'
      '<Relationship Id="rId${n + 4}" Type="$_relBase/theme" Target="theme/theme1.xml"/>'
      '<Relationship Id="rId${n + 5}" Type="$_relBase/tableStyles" Target="tableStyles.xml"/>'
      '</Relationships>');
  add('ppt/presProps.xml', '$_cabecera<p:presentationPr xmlns:a="$_nsA" xmlns:r="$_nsR" xmlns:p="$_nsP"/>');
  add('ppt/viewProps.xml',
      '$_cabecera<p:viewPr xmlns:a="$_nsA" xmlns:r="$_nsR" xmlns:p="$_nsP"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>');
  add('ppt/tableStyles.xml',
      '$_cabecera<a:tblStyleLst xmlns:a="$_nsA" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>');

  const grupoVacio =
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
  add('ppt/slideMasters/slideMaster1.xml',
      '$_cabecera<p:sldMaster xmlns:a="$_nsA" xmlns:r="$_nsR" xmlns:p="$_nsP"><p:cSld>'
      '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>$grupoVacio</p:cSld>'
      '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" '
      'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
      '<p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle>'
      '<p:bodyStyle><a:lvl1pPr marL="0" indent="0"><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle>'
      '<p:otherStyle><a:defPPr><a:defRPr lang="es-ES"/></a:defPPr></p:otherStyle></p:txStyles></p:sldMaster>');
  add('ppt/slideMasters/_rels/slideMaster1.xml.rels',
      '$_cabecera<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      '<Relationship Id="rId1" Type="$_relBase/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
      '<Relationship Id="rId2" Type="$_relBase/theme" Target="../theme/theme1.xml"/></Relationships>');
  add('ppt/slideLayouts/slideLayout1.xml',
      '$_cabecera<p:sldLayout xmlns:a="$_nsA" xmlns:r="$_nsR" xmlns:p="$_nsP" type="blank" preserve="1">'
      '<p:cSld name="En blanco">$grupoVacio</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>');
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      '$_cabecera<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      '<Relationship Id="rId1" Type="$_relBase/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>');
  add('ppt/theme/theme1.xml', _tema);

  for (var i = 0; i < diapos.length; i++) {
    add('ppt/slides/slide${i + 1}.xml', diapos[i].xml);
    add('ppt/slides/_rels/slide${i + 1}.xml.rels', diapos[i].rels);
  }
  medios.forEach((nombre, bytes) => zip.addFile(ArchiveFile('ppt/media/$nombre', bytes.length, bytes)));

  return Uint8List.fromList(ZipEncoder().encode(zip)!);
}

const _tema = '$_cabecera<a:theme xmlns:a="$_nsA" name="GREFA">'
    '<a:themeElements>'
    '<a:clrScheme name="GREFA"><a:dk1><a:srgbClr val="1D2A1F"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>'
    '<a:dk2><a:srgbClr val="1F4A28"/></a:dk2><a:lt2><a:srgbClr val="F3F5F2"/></a:lt2>'
    '<a:accent1><a:srgbClr val="2E6B3A"/></a:accent1><a:accent2><a:srgbClr val="C0392B"/></a:accent2>'
    '<a:accent3><a:srgbClr val="E08A1E"/></a:accent3><a:accent4><a:srgbClr val="4A90C2"/></a:accent4>'
    '<a:accent5><a:srgbClr val="5F6D62"/></a:accent5><a:accent6><a:srgbClr val="D9DFD6"/></a:accent6>'
    '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>'
    '<a:fontScheme name="GREFA"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
    '<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
    '<a:fmtScheme name="GREFA">'
    '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
    '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>'
    '</a:fmtScheme></a:themeElements></a:theme>';
