import 'package:geolocator/geolocator.dart';

class UbicacionException implements Exception {
  UbicacionException(this.mensaje);
  final String mensaje;
  @override
  String toString() => mensaje;
}

/// Captura la posición GPS actual gestionando permisos y servicios.
class LocationService {
  Future<Position> posicionActual() async {
    final activo = await Geolocator.isLocationServiceEnabled();
    if (!activo) {
      throw UbicacionException('El servicio de ubicación está desactivado.');
    }
    var permiso = await Geolocator.checkPermission();
    if (permiso == LocationPermission.denied) {
      permiso = await Geolocator.requestPermission();
    }
    if (permiso == LocationPermission.denied ||
        permiso == LocationPermission.deniedForever) {
      throw UbicacionException(
        'Permiso de ubicación denegado. Actívalo en los ajustes del sistema.',
      );
    }
    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 30),
      ),
    );
  }
}
