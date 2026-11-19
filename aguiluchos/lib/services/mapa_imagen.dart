import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show consolidateHttpClientResponseBytes;
import 'package:image/image.dart' as img;

import '../models/mapa_fondo.dart';
import '../models/nido_constants.dart';
import '../models/nido_grefa_model.dart';
import '../utils/geografia.dart';

/// Mapas de localización para los informes: imágenes JPEG con los nidos
/// coloreados por resultado, sobre teselas de OpenStreetMap (si hay conexión)
/// o sobre una cuadrícula neutra (sin conexión).

const colorExito = 0x2e6b3a;
const colorFracaso = 0xc0392b;
const colorEnCurso = 0xe08a1e;

const leyendaMapa = 'Leyenda: verde = éxito · rojo = fracaso · naranja = en curso. '
    'Mapa base © colaboradores de OpenStreetMap.';

/// Leyenda al pie del mapa según el fondo elegido.
String leyendaMapaDe(MapaFondo fondo) =>
    fondo == MapaFondo.osm ? leyendaMapa : fondo.leyenda;

class PuntoMapa {
  const PuntoMapa(this.lat, this.lon, this.color, this.etiqueta);
  final double lat;
  final double lon;
  final int color; // 0xRRGGBB
  final String etiqueta;
}

/// Mapa ya generado (listo para incrustar en el informe).
class MapaGenerado {
  const MapaGenerado({
    required this.nivel,
    required this.titulo,
    required this.n,
    required this.bytes,
    this.ancho = 760,
    this.alto = 400,
  });

  /// 'general' | 'comunidad' | 'provincia' | 'localidad'
  final String nivel;
  final String titulo;

  /// Nidos representados (con coordenadas).
  final int n;
  final Uint8List bytes;

  /// Dimensiones en píxeles de la imagen.
  final int ancho;
  final int alto;
}

/// Título del mapa general: el nivel geográfico más concreto que se haya filtrado.
String tituloMapaGeneral({String? pais, String? comunidad, String? provincia, String? localidad}) {
  if (localidad != null) return 'Localidad: $localidad';
  if (provincia != null) return 'Provincia: $provincia';
  if (comunidad != null) return 'Comunidad: $comunidad';
  if (pais != null && pais != 'España') return 'País: $pais';
  return 'Todos los nidos';
}

/// Proyección Web Mercator a píxeles del mundo en el zoom [z] (teselas de 256).
({double x, double y}) proyectar(double lat, double lon, int z) {
  final escala = 256.0 * (1 << z);
  final latR = lat.clamp(-85.05112878, 85.05112878) * math.pi / 180;
  final x = (lon + 180) / 360 * escala;
  final y = (1 - math.log(math.tan(latR) + 1 / math.cos(latR)) / math.pi) / 2 * escala;
  return (x: x, y: y);
}

/// Zoom máximo en el que caben todos los puntos y centro (en píxeles del mundo).
({int z, double cx, double cy}) encuadre(
  List<PuntoMapa> puntos, {
  required int ancho,
  required int alto,
  int margen = 46,
  int zMax = 14,
  int zMin = 3,
}) {
  var zOk = zMin;
  for (var z = zMax; z >= zMin; z--) {
    final p = [for (final q in puntos) proyectar(q.lat, q.lon, z)];
    final w = p.map((e) => e.x).reduce(math.max) - p.map((e) => e.x).reduce(math.min);
    final h = p.map((e) => e.y).reduce(math.max) - p.map((e) => e.y).reduce(math.min);
    if (w <= ancho - 2 * margen && h <= alto - 2 * margen) {
      zOk = z;
      break;
    }
  }
  final p = [for (final q in puntos) proyectar(q.lat, q.lon, zOk)];
  final cx = (p.map((e) => e.x).reduce(math.max) + p.map((e) => e.x).reduce(math.min)) / 2;
  final cy = (p.map((e) => e.y).reduce(math.max) + p.map((e) => e.y).reduce(math.min)) / 2;
  return (z: zOk, cx: cx, cy: cy);
}

PuntoMapa? puntoDe(NidoGrefaModel n) {
  final p = n.latLon;
  if (p == null) return null;
  final color = switch (n.estadoReproductivo) {
    EstadoReproductivo.exito => colorExito,
    EstadoReproductivo.fracaso => colorFracaso,
    _ => colorEnCurso,
  };
  return PuntoMapa(p.lat, p.lon, color, n.etiqueta ?? n.numeracion ?? '');
}

List<PuntoMapa> puntosDe(Iterable<NidoGrefaModel> nidos) =>
    [for (final n in nidos) ?puntoDe(n)];

/// Descarga una tesela; `null` si no se puede (sin red, bloqueo, etc.).
typedef DescargaTesela = Future<Uint8List?> Function(int z, int x, int y);

/// Descarga de teselas OSM con la identificación que exige su política de uso.
class DescargadorOsm {
  DescargadorOsm()
      : _cliente = HttpClient()
          ..connectionTimeout = const Duration(seconds: 6)
          ..maxConnectionsPerHost = 6
          ..userAgent = 'GREFA-Aguiluchos/1.5 (informes tecnicos de campana; aquilagestion@grefa.org)';

  final HttpClient _cliente;

  Future<Uint8List?> call(int z, int x, int y, [MapaFondo fondo = MapaFondo.osm]) async {
    try {
      final req = await _cliente
          .getUrl(Uri.parse(fondo.url(z, x, y)))
          .timeout(const Duration(seconds: 8));
      final resp = await req.close().timeout(const Duration(seconds: 12));
      if (resp.statusCode != 200) {
        await resp.drain<void>();
        return null;
      }
      return await consolidateHttpClientResponseBytes(resp)
          .timeout(const Duration(seconds: 15));
    } catch (_) {
      return null;
    }
  }

  void cerrar() => _cliente.close(force: true);
}

String _ascii(String s, [int max = 14]) {
  final t = s.replaceAll(RegExp(r'[^\x20-\x7E]'), '').trim();
  return t.length > max ? t.substring(0, max) : t;
}

/// Genera los mapas de un informe.
class GeneradorMapas {
  /// [descarga] es inyectable (pruebas / sin conexión). Por defecto usa OSM.
  GeneradorMapas({DescargaTesela? descarga, this.fondo = MapaFondo.osm})
      : _propio = descarga == null ? DescargadorOsm() : null {
    _descarga = descarga ?? ((z, x, y) => _propio!.call(z, x, y, fondo));
  }

  /// Fondo de los mapas: OpenStreetMap u ortofoto PNOA.
  final MapaFondo fondo;

  final DescargadorOsm? _propio;
  late final DescargaTesela _descarga;
  final Map<String, Future<img.Image?>> _cache = {};
  int _aciertos = 0;
  int _fallos = 0;

  /// Tras varios fallos seguidos y ningún acierto, se deja de intentar la red.
  bool get _sinRed => _aciertos == 0 && _fallos >= 4;

  Future<img.Image?> _tesela(int z, int x, int y) {
    final n = 1 << z;
    if (y < 0 || y >= n) return Future.value(null);
    final xx = ((x % n) + n) % n;
    return _cache.putIfAbsent('$z/$xx/$y', () async {
      if (_sinRed) return null;
      final bytes = await _descarga(z, xx, y);
      if (bytes == null) {
        _fallos++;
        return null;
      }
      _aciertos++;
      try {
        return img.decodeImage(bytes);
      } catch (_) {
        return null;
      }
    });
  }

  /// Dibuja un mapa con [puntos] (debe haber al menos uno).
  Future<Uint8List> renderizar(
    List<PuntoMapa> puntos, {
    int ancho = 760,
    int alto = 380,
    bool etiquetar = false,
    bool conTeselas = true,
  }) async {
    final lienzo = img.Image(width: ancho, height: alto);
    img.fill(lienzo, color: img.ColorRgb8(0xe9, 0xef, 0xe9));
    final enc = encuadre(puntos, ancho: ancho, alto: alto);
    final x0 = enc.cx - ancho / 2;
    final y0 = enc.cy - alto / 2;

    var dibujoTeselas = false;
    if (conTeselas) {
      final tx0 = (x0 / 256).floor();
      final tx1 = ((x0 + ancho) / 256).floor();
      final ty0 = (y0 / 256).floor();
      final ty1 = ((y0 + alto) / 256).floor();
      final pedidas = <(int, int, Future<img.Image?>)>[
        for (var ty = ty0; ty <= ty1; ty++)
          for (var tx = tx0; tx <= tx1; tx++) (tx, ty, _tesela(enc.z, tx, ty)),
      ];
      for (final (tx, ty, f) in pedidas) {
        final t = await f;
        if (t == null) continue;
        img.compositeImage(lienzo, t,
            dstX: (tx * 256 - x0).round(), dstY: (ty * 256 - y0).round());
        dibujoTeselas = true;
      }
    }
    if (!dibujoTeselas) {
      // Sin mapa base: cuadrícula neutra.
      final gris = img.ColorRgb8(0xd3, 0xdd, 0xd5);
      for (var x = 0; x < ancho; x += 64) {
        img.drawLine(lienzo, x1: x, y1: 0, x2: x, y2: alto - 1, color: gris);
      }
      for (var y = 0; y < alto; y += 64) {
        img.drawLine(lienzo, x1: 0, y1: y, x2: ancho - 1, y2: y, color: gris);
      }
    }

    for (final p in puntos) {
      final q = proyectar(p.lat, p.lon, enc.z);
      final px = (q.x - x0).round();
      final py = (q.y - y0).round();
      final c = img.ColorRgb8((p.color >> 16) & 0xff, (p.color >> 8) & 0xff, p.color & 0xff);
      img.fillCircle(lienzo, x: px, y: py, radius: 8, color: img.ColorRgb8(255, 255, 255), antialias: true);
      img.fillCircle(lienzo, x: px, y: py, radius: 6, color: c, antialias: true);
      if (etiquetar && p.etiqueta.isNotEmpty) {
        final t = _ascii(p.etiqueta);
        if (t.isNotEmpty) {
          img.drawString(lienzo, t,
              font: img.arial14, x: px + 11, y: py - 7, color: img.ColorRgb8(255, 255, 255));
          img.drawString(lienzo, t,
              font: img.arial14, x: px + 10, y: py - 8, color: img.ColorRgb8(0x1d, 0x2b, 0x22));
        }
      }
    }

    // Atribución.
    final atrib = fondo.atribucionAscii;
    if (dibujoTeselas) {
      final w = atrib.length * 7 + 8;
      img.fillRect(lienzo,
          x1: ancho - w, y1: alto - 18, x2: ancho, y2: alto,
          color: img.ColorRgba8(255, 255, 255, 215));
      img.drawString(lienzo, atrib,
          font: img.arial14, x: ancho - w + 4, y: alto - 17, color: img.ColorRgb8(0x33, 0x33, 0x33));
    }
    return Uint8List.fromList(img.encodeJpg(lienzo, quality: 85));
  }

  /// Genera un mapa general y/o uno por cada grupo de los niveles pedidos
  /// ('general', 'comunidad', 'provincia', 'localidad'). Los grupos sin
  /// ningún nido con coordenadas se omiten.
  Future<List<MapaGenerado>> generar(
    List<NidoGrefaModel> nidos,
    Set<String> niveles, {
    void Function(int hecho, int total)? progreso,
    String tituloGeneral = 'Todos los nidos',
  }) async {
    final trabajos = <(String, String, List<NidoGrefaModel>)>[];
    if (niveles.contains('general')) trabajos.add(('general', tituloGeneral, nidos));
    for (final nivel in const ['comunidad', 'provincia', 'localidad']) {
      if (!niveles.contains(nivel)) continue;
      for (final g in agruparPorNivel(nidos, nivel)) {
        trabajos.add((nivel, g.key, g.value));
      }
    }
    final out = <MapaGenerado>[];
    var hecho = 0;
    try {
      for (final (nivel, titulo, lista) in trabajos) {
        final puntos = puntosDe(lista);
        if (puntos.isNotEmpty) {
          final general = nivel == 'general';
          final bytes = await renderizar(
            puntos,
            ancho: general ? 760 : 560,
            alto: general ? 400 : 330,
            etiquetar: !general && puntos.length <= 14,
          );
          out.add(MapaGenerado(
            nivel: nivel,
            titulo: titulo,
            n: puntos.length,
            bytes: bytes,
            ancho: general ? 760 : 560,
            alto: general ? 400 : 330,
          ));
        }
        progreso?.call(++hecho, trabajos.length);
        await Future<void>.delayed(Duration.zero); // deja respirar a la interfaz
      }
    } finally {
      _propio?.cerrar();
    }
    return out;
  }
}
