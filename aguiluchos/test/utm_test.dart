import 'package:aguiluchos/models/nido_grefa_model.dart';
import 'package:aguiluchos/utils/utm.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('UTM huso 30 -> WGS84 (Puerta del Sol, Madrid)', () {
    // Valores de referencia calculados con pyproj (EPSG:25830 -> EPSG:4326).
    final p = Utm.toLatLon(440290, 4474180);
    expect(p.lat, closeTo(40.41610287, 1e-6));
    expect(p.lon, closeTo(-3.70379813, 1e-6));
  });

  test('ida y vuelta WGS84 <-> UTM con error < 1 cm', () {
    for (final (lat, lon) in [
      (40.4168, -3.7038), // Madrid (huso 30)
      (39.86, -4.02), // Toledo
      (41.5, -6.4), // Zamora (huso 29)
      (42.1, -7.5), // Galicia (huso 29)
      (40.9, -3.0), // Guadalajara
    ]) {
      final u = Utm.fromLatLon(lat, lon);
      final back = Utm.toLatLon(u.x, u.y);
      expect(back.lat, closeTo(lat, 1e-7), reason: '$lat,$lon');
      expect(back.lon, closeTo(lon, 1e-7), reason: '$lat,$lon');
    }
  });

  test('huso inferido por el Este: Zamora/Galicia -> 29, Madrid/Toledo -> 30', () {
    expect(Utm.husoParaEste(587601), 29); // Galicia
    expect(Utm.husoParaEste(678320), 29); // Zamora
    expect(Utm.husoParaEste(423856), 30); // Madrid
    expect(Utm.husoParaEste(376485), 30); // Toledo
    // pyproj EPSG:25829: (678982, 4667281) -> 42.13721221, -6.83423492
    final zamora = Utm.toLatLon(678982, 4667281);
    expect(zamora.lat, closeTo(42.13721221, 1e-6));
    expect(zamora.lon, closeTo(-6.83423492, 1e-6));
  });

  test('plausibilidad de coordenadas', () {
    expect(Utm.esPlausible(423856, 4454212), isTrue);
    expect(Utm.esPlausible(604768, 466791), isFalse); // falta un dígito en Y
    expect(Utm.esPlausible(-3.7, 40.4), isFalse); // lat/lon por error
  });

  test('setLatLon guarda UTM en metros enteros y latLon lo recupera', () {
    final n = NidoGrefaModel()..setLatLon(40.4168, -3.7038);
    expect(n.coordenadaX, n.coordenadaX!.roundToDouble());
    expect(n.latLon!.lat, closeTo(40.4168, 0.0001));
    expect(n.latLon!.lon, closeTo(-3.7038, 0.0001));
    expect(n.tieneCoordenadas, isTrue);
  });
}
