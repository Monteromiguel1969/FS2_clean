import test from 'node:test';
import assert from 'node:assert/strict';
import { FONDOS, guardarFondo, leerFondo, urlTesela, htmlSelectorFondo } from '../src/fondo.js';

const memoria = () => {
  const d = new Map();
  return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)) };
};

test('fondo: por defecto mapa; se recuerda la ortofoto y se ignora un valor inválido', () => {
  const s = memoria();
  assert.equal(leerFondo(s), 'mapa');
  assert.equal(guardarFondo('ortofoto', s), true);
  assert.equal(leerFondo(s), 'ortofoto');
  assert.equal(guardarFondo('satelite', s), false);
  assert.equal(leerFondo(s), 'ortofoto');
  s.setItem('aguiluchos.fondo', 'basura');
  assert.equal(leerFondo(s), 'mapa');
  assert.equal(leerFondo(null), 'mapa');
  assert.equal(leerFondo({ getItem() { throw new Error('bloqueado'); } }), 'mapa');
});

test('fondo: teselas OSM y PNOA (WMTS del IGN, OI.OrthoimageCoverage, GoogleMapsCompatible)', () => {
  assert.equal(urlTesela('mapa', 6, 31, 24), 'https://tile.openstreetmap.org/6/31/24.png');
  const u = new URL(urlTesela('ortofoto', 14, 7900, 6100));
  assert.equal(u.origin + u.pathname, 'https://www.ign.es/wmts/pnoa-ma');
  assert.equal(u.searchParams.get('Layer'), 'OI.OrthoimageCoverage');
  assert.equal(u.searchParams.get('TileMatrixSet'), 'GoogleMapsCompatible');
  assert.equal(u.searchParams.get('TileMatrix'), '14');
  assert.equal(u.searchParams.get('TileCol'), '7900');
  assert.equal(u.searchParams.get('TileRow'), '6100');
  assert.equal(u.searchParams.get('Format'), 'image/jpeg');
  assert.match(FONDOS.ortofoto.atribucion, /PNOA/);
  assert.equal(urlTesela('raro', 1, 1, 1), urlTesela('mapa', 1, 1, 1));
});

test('fondo: el selector ofrece Mapa y Ortofoto con la elección marcada', () => {
  const h = htmlSelectorFondo('ortofoto', 'x');
  assert.match(h, /id="x"/);
  assert.match(h, /<option value="mapa" >Mapa/);
  assert.match(h, /<option value="ortofoto" selected>Ortofoto/);
});
