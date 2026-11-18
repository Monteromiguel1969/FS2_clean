import test from 'node:test';
import assert from 'node:assert/strict';
import { utmToLatLon, esPlausible, husoParaEste } from '../src/utm.js';
import { correoPermitido, esAdmin, validarClave, aCsv, aplicarCambio, estadoReproductivo, filtrar, parseValor, posicion, resumen, validar } from '../src/logic.js';
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

test('43 columnas en 4 fases (15/5/9/14)', () => {
  assert.equal(COLUMNAS.length, 43);
  assert.deepEqual(FASES.map((f) => COLUMNAS.filter((c) => c.fase === f.id).length), [15, 5, 9, 14]);
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

test('tiempo real: aplicarCambio inserta, actualiza, respeta LWW y borra', () => {
  const a = { id: 'a', etiqueta: 'A', updated_at: '2026-11-02T10:00:00+00:00' };
  let l = aplicarCambio([a], { eventType: 'INSERT', new: { id: 'b', etiqueta: 'B', updated_at: '2026-11-02T10:01:00+00:00', tipo_acciones_manejo: '{Dron,Rodal}' } });
  assert.equal(l.length, 2);
  assert.deepEqual(l[1].tipo_acciones_manejo, ['Dron', 'Rodal']);
  // Actualización más reciente: se aplica.
  l = aplicarCambio(l, { eventType: 'UPDATE', new: { id: 'a', etiqueta: 'A2', updated_at: '2026-11-02T11:00:00+00:00' } });
  assert.equal(l.find((n) => n.id === 'a').etiqueta, 'A2');
  // Evento desordenado más antiguo: se ignora (Last-Write-Wins).
  const igual = aplicarCambio(l, { eventType: 'UPDATE', new: { id: 'a', etiqueta: 'VIEJO', updated_at: '2026-11-02T09:00:00+00:00' } });
  assert.equal(igual.find((n) => n.id === 'a').etiqueta, 'A2');
  // Borrado lógico y DELETE físico quitan el nido.
  l = aplicarCambio(l, { eventType: 'UPDATE', new: { id: 'b', is_deleted: true, updated_at: '2026-11-02T12:00:00+00:00' } });
  assert.deepEqual(l.map((n) => n.id), ['a']);
  l = aplicarCambio(l, { eventType: 'DELETE', old: { id: 'a' }, new: {} });
  assert.equal(l.length, 0);
  // Evento sin fila: no hace nada.
  assert.equal(aplicarCambio(l, { eventType: 'UPDATE', new: {} }), l);
});


test('cuentas: solo @grefa.org, un único administrador y clave mínima', () => {
  assert.equal(correoPermitido('ana@grefa.org'), true);
  assert.equal(correoPermitido(' Ana.Lopez@GREFA.ORG '), true);
  for (const mal of ['ana@gmail.com', 'ana@gref.org', 'ana@grefa.org.evil.com', 'x@evil.com@grefa.org', '@grefa.org', '', null]) {
    assert.equal(correoPermitido(mal), false, String(mal));
  }
  assert.equal(esAdmin('AquilaGestion@grefa.org'), true);
  assert.equal(esAdmin('ana@grefa.org'), false);
  assert.equal(esAdmin(undefined), false);
  assert.equal(validarClave('corta'), 'La contraseña debe tener al menos 8 caracteres.');
  assert.equal(validarClave('suficiente1'), null);
});

test('filtros de proyecto y campaña son independientes y admiten «sin valor»', async () => {
  const { filtrar, opcionesProyectoCampana, SIN_VALOR } = await import('../src/logic.js');
  const nidos = [
    { id: 1, proyecto: 'Aguilucho', campana: '2026' },
    { id: 2, proyecto: 'Aguilucho', campana: '2027' },
    { id: 3, proyecto: 'Otro', campana: '2026' },
    { id: 4, proyecto: null, campana: null },
  ];
  const ids = (f) => filtrar(nidos, f).map((n) => n.id);
  assert.deepEqual(ids({ proyecto: 'Aguilucho' }), [1, 2]);
  assert.deepEqual(ids({ campana: '2026' }), [1, 3]);
  assert.deepEqual(ids({ proyecto: 'Aguilucho', campana: '2027' }), [2]);
  assert.deepEqual(ids({ proyecto: SIN_VALOR }), [4]);
  assert.deepEqual(ids({ campana: SIN_VALOR }), [4]);
  const o = opcionesProyectoCampana(nidos, { proyecto: 'Aguilucho' });
  assert.deepEqual(o.proyectos.valores, ['Aguilucho', 'Otro']);
  assert.equal(o.proyectos.sin, true);
  assert.deepEqual(o.campanas.valores, ['2026', '2027']);
  assert.equal(o.campanas.sin, false);
});

test('CSV con campos elegidos: solo esas columnas, en el orden de la tabla', () => {
  const cols = COLUMNAS.filter((c) => ['campana', 'numeracion', 'proyecto'].includes(c.key));
  const csv = aCsv([{ numeracion: '1', proyecto: 'A', campana: '2026' }], cols);
  assert.equal(csv, '\ufeffNumeración;Proyecto;Campaña\r\n1;A;2026');
});
