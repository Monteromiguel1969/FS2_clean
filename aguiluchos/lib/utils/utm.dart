import 'dart:math' as math;

/// Par latitud/longitud WGS84 en grados decimales.
class LatLon {
  const LatLon(this.lat, this.lon);
  final double lat;
  final double lon;

  @override
  String toString() => 'LatLon($lat, $lon)';
}

/// Coordenadas UTM (elipsoide GRS80 / ETRS89, equivalente a WGS84 a efectos de
/// campo) usadas en `coordenada_x` (Este, m) y `coordenada_y` (Norte, m).
///
/// Los datos históricos de GREFA no guardan el huso. Se infiere del Este:
/// * huso 29 (meridiano central -9°) si `x >= 550000` (Zamora, Salamanca, Galicia)
/// * huso 30 (meridiano central -3°) en caso contrario (Madrid, Toledo, Guadalajara)
///
/// Es válido para el área de campaña (longitud aprox. entre -8,4° y -0,5°).
abstract final class Utm {
  static const _a = 6378137.0;
  static const _f = 1 / 298.257222101;
  static const _k0 = 0.9996;
  static final _e2 = _f * (2 - _f);
  static final _ep2 = _e2 / (1 - _e2);

  /// Este a partir del cual se asume huso 29.
  static const double eastingHuso29 = 550000;

  /// Rangos plausibles de Este/Norte en España (incluye Canarias en Norte).
  static const double minEasting = 100000;
  static const double maxEasting = 900000;
  static const double minNorthing = 2900000;
  static const double maxNorthing = 4900000;

  static bool esPlausible(double x, double y) =>
      x >= minEasting &&
      x <= maxEasting &&
      y >= minNorthing &&
      y <= maxNorthing;

  static int husoParaEste(double x) => x >= eastingHuso29 ? 29 : 30;

  /// UTM (hemisferio norte) a WGS84. Si [huso] es null se infiere del Este.
  static LatLon toLatLon(double x, double y, {int? huso}) {
    final zone = huso ?? husoParaEste(x);
    final xx = x - 500000;
    final m = y / _k0;
    final mu = m /
        (_a * (1 - _e2 / 4 - 3 * _e2 * _e2 / 64 - 5 * _e2 * _e2 * _e2 / 256));
    final e1 = (1 - math.sqrt(1 - _e2)) / (1 + math.sqrt(1 - _e2));
    final p = mu +
        (3 * e1 / 2 - 27 * math.pow(e1, 3) / 32) * math.sin(2 * mu) +
        (21 * e1 * e1 / 16 - 55 * math.pow(e1, 4) / 32) * math.sin(4 * mu) +
        (151 * math.pow(e1, 3) / 96) * math.sin(6 * mu) +
        (1097 * math.pow(e1, 4) / 512) * math.sin(8 * mu);
    final s = math.sin(p);
    final c = math.cos(p);
    final t = math.tan(p);
    final n1 = _a / math.sqrt(1 - _e2 * s * s);
    final t1 = t * t;
    final c1 = _ep2 * c * c;
    final r1 = _a * (1 - _e2) / math.pow(1 - _e2 * s * s, 1.5);
    final d = xx / (n1 * _k0);
    final lat = p -
        (n1 * t / r1) *
            (d * d / 2 -
                (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * _ep2) *
                    math.pow(d, 4) /
                    24 +
                (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * _ep2 - 3 * c1 * c1) *
                    math.pow(d, 6) /
                    720);
    final lonRad = (d -
            (1 + 2 * t1 + c1) * math.pow(d, 3) / 6 +
            (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * _ep2 + 24 * t1 * t1) *
                math.pow(d, 5) /
                120) /
        c;
    return LatLon(_deg(lat), (zone * 6 - 183) + _deg(lonRad));
  }

  /// WGS84 a UTM. Usa huso 29 para longitudes < -6° y 30 en el resto, de modo
  /// que [toLatLon] recupere el mismo punto con la inferencia por Este.
  static ({double x, double y, int huso}) fromLatLon(double lat, double lon) {
    final huso = lon < -6 ? 29 : 30;
    final lon0 = _rad((huso * 6 - 183).toDouble());
    final phi = _rad(lat);
    final lam = _rad(lon);
    final s = math.sin(phi);
    final c = math.cos(phi);
    final t = math.tan(phi);
    final n = _a / math.sqrt(1 - _e2 * s * s);
    final t2 = t * t;
    final c2 = _ep2 * c * c;
    final aa = c * (lam - lon0);
    final m = _a *
        ((1 - _e2 / 4 - 3 * _e2 * _e2 / 64 - 5 * math.pow(_e2, 3) / 256) * phi -
            (3 * _e2 / 8 + 3 * _e2 * _e2 / 32 + 45 * math.pow(_e2, 3) / 1024) *
                math.sin(2 * phi) +
            (15 * _e2 * _e2 / 256 + 45 * math.pow(_e2, 3) / 1024) *
                math.sin(4 * phi) -
            (35 * math.pow(_e2, 3) / 3072) * math.sin(6 * phi));
    final x = _k0 *
            n *
            (aa +
                (1 - t2 + c2) * math.pow(aa, 3) / 6 +
                (5 - 18 * t2 + t2 * t2 + 72 * c2 - 58 * _ep2) *
                    math.pow(aa, 5) /
                    120) +
        500000;
    final y = _k0 *
        (m +
            n *
                t *
                (aa * aa / 2 +
                    (5 - t2 + 9 * c2 + 4 * c2 * c2) * math.pow(aa, 4) / 24 +
                    (61 - 58 * t2 + t2 * t2 + 600 * c2 - 330 * _ep2) *
                        math.pow(aa, 6) /
                        720));
    return (x: x, y: y, huso: huso);
  }

  static double _rad(double d) => d * math.pi / 180;
  static double _deg(double r) => r * 180 / math.pi;
}
