import 'dart:typed_data';

import 'package:aguiluchos/models/mapa_fondo.dart';
import 'package:aguiluchos/models/nido_grefa_model.dart';
import 'package:aguiluchos/services/fondo_mapa_prefs.dart';
import 'package:aguiluchos/services/mapa_imagen.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

import 'helpers/fakes.dart';

NidoGrefaModel _n(String et, String prov, double x, double y) =>
    nidoDeEjemplo(etiqueta: et)
      ..provincia = prov
      ..coordenadaX = x
      ..coordenadaY = y;

void main() {
  test('URLs de las teselas: Mapa (OSM) y Ortofoto (PNOA)', () {
    expect(MapaFondo.osm.url(10, 495, 385), 'https://tile.openstreetmap.org/10/495/385.png');
    final pnoa = Uri.parse(MapaFondo.pnoa.url(10, 495, 385));
    expect(pnoa.host, 'www.ign.es');
    expect(pnoa.path, '/wmts/pnoa-ma');
    expect(pnoa.queryParameters['Layer'], 'OI.OrthoimageCoverage');
    expect(pnoa.queryParameters['TileMatrixSet'], 'GoogleMapsCompatible');
    expect(pnoa.queryParameters['TileMatrix'], '10');
    expect(pnoa.queryParameters['TileCol'], '495');
    expect(pnoa.queryParameters['TileRow'], '385');
    expect(pnoa.queryParameters['Format'], 'image/jpeg');
  });

  test('desdeId cae en OSM si no se reconoce', () {
    expect(MapaFondo.desdeId('ortofoto'), MapaFondo.pnoa);
    expect(MapaFondo.desdeId('mapa'), MapaFondo.osm);
    expect(MapaFondo.desdeId(null), MapaFondo.osm);
    expect(MapaFondo.desdeId('otro'), MapaFondo.osm);
  });

  test('el fondo elegido se recuerda en la base de datos local', () async {
    final db = await openTestDb(FakeClock());
    addTearDown(db.close);
    expect(await leerFondoMapa(db), MapaFondo.osm);
    await guardarFondoMapa(db, MapaFondo.pnoa);
    expect(await leerFondoMapa(db), MapaFondo.pnoa);
  });

  test('la leyenda cita la atribución del fondo', () {
    expect(leyendaMapaDe(MapaFondo.osm), contains('OpenStreetMap'));
    expect(leyendaMapaDe(MapaFondo.pnoa), contains('PNOA'));
    expect(leyendaMapaDe(MapaFondo.pnoa), isNot(contains('OpenStreetMap')));
  });

  test('el generador pide teselas JPEG al fondo elegido', () async {
    final t = img.Image(width: 256, height: 256);
    img.fill(t, color: img.ColorRgb8(60, 90, 40));
    final jpeg = Uint8List.fromList(img.encodeJpg(t));
    var pedidas = 0;
    final gen = GeneradorMapas(
      fondo: MapaFondo.pnoa,
      descarga: (z, x, y) async {
        pedidas++;
        return jpeg;
      },
    );
    final mapas = await gen.generar(
      [_n('A', 'Toledo', 400000, 4390000), _n('B', 'Toledo', 401000, 4391000)],
      {'general'},
    );
    expect(pedidas, greaterThan(0));
    expect(mapas.single.ancho, 760);
    expect(mapas.single.alto, 400);
    final im = img.decodeJpg(mapas.single.bytes)!;
    expect(im.width, 760);
    // El fondo de ortofoto (verde oscuro) se nota en el centro; con OSM sería gris/crema.
    final c = im.getPixel(380, 60);
    expect(c.g, greaterThan(c.b));
  });

  test('título del mapa general según el filtro geográfico', () {
    expect(tituloMapaGeneral(), 'Todos los nidos');
    expect(tituloMapaGeneral(pais: 'España'), 'Todos los nidos');
    expect(tituloMapaGeneral(pais: 'Portugal'), 'País: Portugal');
    expect(tituloMapaGeneral(comunidad: 'Castilla-La Mancha'), 'Comunidad: Castilla-La Mancha');
    expect(tituloMapaGeneral(comunidad: 'X', provincia: 'Toledo'), 'Provincia: Toledo');
    expect(tituloMapaGeneral(provincia: 'Toledo', localidad: 'Pinto'), 'Localidad: Pinto');
  });
}
