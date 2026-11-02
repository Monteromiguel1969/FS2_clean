import 'package:geolocator/geolocator.dart';

class LocationException implements Exception {
  LocationException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Captura de la posición GPS actual.
class LocationService {
  Future<Position> posicionActual() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw LocationException('El GPS está desactivado.');
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        throw LocationException('Permiso de ubicación denegado.');
      }
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.best,
          timeLimit: Duration(seconds: 25),
        ),
      );
    } on LocationException {
      rethrow;
    } catch (e) {
      throw LocationException(
          'No se pudo obtener la ubicación en este dispositivo. Introduce las coordenadas a mano. ($e)');
    }
  }
}
