import '../models/nido_grefa_model.dart';

/// URL de Google Maps para un nido: la guardada en la ficha o, en su defecto,
/// una búsqueda por coordenadas. `null` si no hay datos suficientes.
Uri? urlGoogleMaps(NidoGrefaModel n) {
  final guardada = n.googleMapsUrl?.trim();
  if (guardada != null && guardada.isNotEmpty) {
    final conEsquema = guardada.startsWith(RegExp(r'https?://'))
        ? guardada
        : 'https://$guardada';
    final uri = Uri.tryParse(conEsquema);
    if (uri != null && uri.host.isNotEmpty) return uri;
  }
  if (n.tieneCoordenadas) {
    return urlGoogleMapsCoordenadas(n.coordenadaY!, n.coordenadaX!);
  }
  return null;
}

Uri urlGoogleMapsCoordenadas(double lat, double lon) => Uri.https(
  'www.google.com',
  '/maps/search/',
  {'api': '1', 'query': '${lat.toStringAsFixed(6)},${lon.toStringAsFixed(6)}'},
);
