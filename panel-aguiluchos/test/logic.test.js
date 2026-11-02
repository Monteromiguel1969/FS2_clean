import test from 'node:test';
import assert from 'node:assert/strict';
import { utmToLatLon, esPlausible, husoParaEste } from '../src/utm.js';
import { aCsv, estadoReproductivo, filtrar, parseValor, posicion, resumen, validar } from '../src/logic.js';
import { COLUMNAS, FASES } from '../src/columns.js';

const cerca = (a, b, tol) => assert.ok(Math.abs(a - b) < tol, `${a} !~ ${b}`);

test('UTM coincide con pyproj (mismos valores que la app Flutter)', () => {
  const m = utmToLatLon(440290, 4474180);
  cerca(m.lat, 40.41610287, 1e-6);
  cerca(m.lon, -3.70379813, 1e-6);
  const z = utmToLatLon(678982, 4667281);
  cerca(z.lat, 42.13721221, 1e-6);
  cerca(z.lon, -6.83423492, 1e-6);
  assert.equal(husoParaEste(587601), 29);
  assert.equal(husoParaEste(423856), 30);
  assert.equal(esPlausible(604768, 466791), false);
});

test('42 columnas en 4 fases (14/5/9/14)', () => {
  assert.equal(COLUMNAS.length, 42);
  assert.deepEqual(FASES.map((f) => COLUMNAS.filter((c) => c.fase === f.id).length), [14, 5, 9, 14]);
});

test('estado reproductivo, filtros y resumen', () => {
  const nidos = [
    { id: 1, etiqueta: 'A', municipio: 'Toro', resultado_reproductivo: 'Éxito', num_pollos_nacidos: 3, num_pollos_volados: 3 },
    { id: 2, etiqueta: 'B', municipio: 'Toro', resultado_reproductivo: 'Fracaso', causas_fracaso: 'Cosecha', num_pollos_nacidos: 2, num_pollos_muertos: 2 },
    { id: 3, etiqueta: 'C', municipio: 'Ávila', propietario: 'José Pérez' },
  ];
  assert.equal(estadoReproductivo(nidos[2]), 'En curso');
  assert.equal(filtrar(nidos, { texto: 'jose' }).length, 1);
  assert.equal(filtrar(nidos, { municipio: 'Toro', estado: 'Fracaso' }).length, 1);
  const r = resumen(nidos);
  assert.deepEqual([r.total, r.exito, r.fracaso, r.enCurso, r.nacidos, r.volados, r.muertos], [3, 1, 1, 1, 5, 3, 2]);
  assert.equal(r.tasaExito, 0.5);
  assert.deepEqual(r.causas, [['Cosecha', 1]]);
});

test('posición y validación', () => {
  assert.equal(posicion({ coordenada_x: null, coordenada_y: 1 }), null);
  assert.ok(posicion({ coordenada_x: 440290, coordenada_y: 4474180 }));
  assert.equal(posicion({ coordenada_x: 12, coordenada_y: 34 }), null);
  assert.deepEqual(validar({ etiqueta: 'X', num_pollos_nacidos: 2, num_pollos_volados: 2, num_pollos_muertos: 1 }).length, 1);
  assert.equal(validar({ numeracion: '1' }).length, 0);
  assert.equal(validar({}).length, 1);
});

test('parseValor y CSV', () => {
  const col = (k) => COLUMNAS.find((c) => c.key === k);
  assert.equal(parseValor(col('num_pollos_nacidos'), '3'), 3);
  assert.equal(parseValor(col('num_pollos_nacidos'), '-1'), null);
  assert.equal(parseValor(col('coordenada_x'), '440290,5'), 440290.5);
  assert.equal(parseValor(col('etiqueta'), '  '), null);
  const csv = aCsv([{ etiqueta: 'A;"B"', intervencion: true, tipo_acciones_manejo: ['Dron', 'Rodal'] }]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"A;""B"""'));
  assert.ok(csv.includes('Dron; Rodal'));
});
