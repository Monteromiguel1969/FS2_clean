// UTM ETRS89 (GRS80) -> WGS84. Misma lógica que la app Flutter (lib/utils/utm.dart).
const A = 6378137.0;
const F = 1 / 298.257222101;
const K0 = 0.9996;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);

export const EAST_HUSO_29 = 550000;

export function esPlausible(x, y) {
  return x >= 100000 && x <= 900000 && y >= 2900000 && y <= 4900000;
}

export function husoParaEste(x) {
  return x >= EAST_HUSO_29 ? 29 : 30;
}

const deg = (r) => (r * 180) / Math.PI;

export function utmToLatLon(x, y, huso) {
  const zone = huso ?? husoParaEste(x);
  const xx = x - 500000;
  const m = y / K0;
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const p =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(p);
  const c = Math.cos(p);
  const t = Math.tan(p);
  const n1 = A / Math.sqrt(1 - E2 * s * s);
  const t1 = t * t;
  const c1 = EP2 * c * c;
  const r1 = (A * (1 - E2)) / (1 - E2 * s * s) ** 1.5;
  const d = xx / (n1 * K0);
  const lat =
    p -
    ((n1 * t) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6) / 720);
  const lonRad =
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5) / 120) /
    c;
  return { lat: deg(lat), lon: zone * 6 - 183 + deg(lonRad) };
}
