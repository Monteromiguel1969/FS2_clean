/// Fondo de los mapas (pantalla de mapa e imágenes de informes/presentaciones):
/// mapa de OpenStreetMap u ortofoto PNOA del IGN. Mismas fuentes que el panel web.
enum MapaFondo {
  osm(
    id: 'mapa',
    etiqueta: 'Mapa (OSM)',
    plantilla: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '© OpenStreetMap contributors',
    atribucionAscii: '(c) OpenStreetMap contributors',
    jpeg: false,
  ),
  pnoa(
    id: 'ortofoto',
    etiqueta: 'Ortofoto (PNOA)',
    // WMTS KVP del IGN: TileRow = y, TileCol = x (GoogleMapsCompatible = esquema XYZ).
    plantilla:
        'https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0'
        '&Layer=OI.OrthoimageCoverage&Style=default&Format=image/jpeg'
        '&TileMatrixSet=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}',
    atribucion: 'PNOA © Instituto Geográfico Nacional de España',
    atribucionAscii: 'PNOA (c) Instituto Geografico Nacional de Espana',
    jpeg: true,
  );

  const MapaFondo({
    required this.id,
    required this.etiqueta,
    required this.plantilla,
    required this.atribucion,
    required this.atribucionAscii,
    required this.jpeg,
  });

  final String id;
  final String etiqueta;
  final String plantilla;
  final String atribucion;

  /// Atribución sin tildes ni ©, para dibujarla sobre la imagen (fuente de mapa de bits).
  final String atribucionAscii;

  /// Las teselas llegan en JPEG (ortofoto) en lugar de PNG.
  final bool jpeg;

  /// Clave en `sync_meta` donde se recuerda la elección.
  static const claveMeta = 'fondo_mapa';

  String url(int z, int x, int y) => plantilla
      .replaceAll('{z}', '$z')
      .replaceAll('{x}', '$x')
      .replaceAll('{y}', '$y');

  String get leyenda => 'Leyenda: verde = éxito · rojo = fracaso · naranja = en curso. '
      'Mapa base: $atribucion.';

  static MapaFondo desdeId(String? id) =>
      MapaFondo.values.firstWhere((f) => f.id == id, orElse: () => MapaFondo.osm);
}
