import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { ambitoDelFiltro, armarPresentacion, formatoFecha, nombreArchivoPresentacion } from '../src/presentacion.js';
import { construirPptx } from '../src/presentacion_pptx.js';
import { filtrar, SIN_VALOR } from '../src/logic.js';

const nido = (i, extra = {}) => ({ id: `n${i}`, numeracion: String(i), etiqueta: `E${i}`, municipio: 'Toro', provincia: 'Zamora', especie: 'Aguilucho cenizo', ...extra });
const lista = [
  nido(1, { proyecto: 'Aguilucho', campana: '2026', resultado_reproductivo: 'Éxito', num_pollos_nacidos: 4, num_pollos_volados: 3, num_pollos_muertos: 1 }),
  nido(2, { proyecto: 'Aguilucho', campana: '2026', resultado_reproductivo: 'Fracaso', causas_fracaso: 'Depredación', num_pollos_nacidos: 2 }),
  nido(3, { proyecto: 'Aguilucho', campana: '2026', municipio: '', especie: null }),
];

test('ámbito: proyecto, campaña y nivel geográfico más concreto', () => {
  assert.equal(ambitoDelFiltro({}), 'Todos los nidos');
  assert.equal(ambitoDelFiltro({ proyecto: 'Aguilucho', campana: '2026' }), 'Proyecto Aguilucho · Campaña 2026');
  assert.equal(ambitoDelFiltro({ campana: '2025', comunidad: 'Galicia', provincia: 'Ourense' }), 'Campaña 2025 · Provincia: Ourense');
  assert.equal(ambitoDelFiltro({ proyecto: SIN_VALOR, localidad: 'Toro' }), 'Sin proyecto · Localidad: Toro');
});

test('armado: título con ámbito, totales, causas y tabla con celdas vacías en blanco', () => {
  const d = armarPresentacion(lista, { geo: { campana: '2026', provincia: 'Zamora' }, filtros: 'provincia: Zamora', fecha: new Date(2026, 10, 19) });
  assert.equal(d.ambito, 'Campaña 2026 · Provincia: Zamora');
  assert.equal(d.fecha, '19/11/2026');
  assert.equal(d.total, 3);
  const t = Object.fromEntries(d.totales.map((x) => [x.etiqueta, x.valor]));
  assert.deepEqual([t.Nidos, t['Con éxito'], t.Fracaso, t['En curso'], t['Tasa de éxito (cerrados)'], t['Pollos nacidos'], t['Pollos volados'], t['Pollos muertos']], ['3', '1', '1', '1', '50 %', '6', '3', '1']);
  assert.deepEqual(d.causas, [['Depredación', 1]]);
  assert.deepEqual(d.tabla.columnas, ['Nº', 'Etiqueta', 'Proyecto', 'Campaña', 'Localidad', 'Provincia', 'Especie', 'Estado', 'Nacidos', 'Volados', 'Muertos']);
  const [f1, f2, f3] = d.tabla.paginas[0];
  assert.deepEqual(f1, ['1', 'E1', 'Aguilucho', '2026', 'Toro', 'Zamora', 'Aguilucho cenizo', 'Éxito', '4', '3', '1']);
  assert.deepEqual(f2.slice(8), ['2', '', '']);
  assert.equal(f3[4], '');
  assert.equal(f3[6], '');
  assert.equal(f3[7], 'En curso');
  assert.equal(d.mapa, null);
});

test('armado: usa el mismo filtro que el informe, pagina la tabla y oculta columnas totalmente vacías', () => {
  const muchos = Array.from({ length: 25 }, (_, i) => nido(i + 1, i < 10 ? { campana: '2025' } : { campana: '2026' }));
  const sel = filtrar(muchos, { texto: '', campana: '2026' });
  const d = armarPresentacion(sel, { geo: { campana: '2026' }, mapaDataUrl: 'data:image/jpeg;base64,AAAA' });
  assert.equal(d.total, 15);
  assert.deepEqual(d.tabla.paginas.map((p) => p.length), [11, 4]);
  assert.ok(!d.tabla.columnas.includes('Proyecto'));
  assert.ok(d.tabla.columnas.includes('Campaña'));
  assert.equal(d.mapa.dataUrl, 'data:image/jpeg;base64,AAAA');
  const vacio = armarPresentacion([], {});
  assert.equal(vacio.total, 0);
  assert.deepEqual(vacio.tabla.paginas, []);
});

test('nombre y fecha', () => {
  assert.equal(formatoFecha(new Date(2026, 0, 5)), '05/01/2026');
  assert.match(nombreArchivoPresentacion(new Date('2026-11-19T10:00:00Z')), /^presentacion_aguiluchos_2026-11-19\.pptx$/);
});

test('el .pptx es un zip válido con portada, totales, mapa y tabla; las celdas vacías no llevan texto', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const d = armarPresentacion(lista, { geo: { campana: '2026' }, mapaDataUrl: png, fecha: new Date(2026, 10, 19) });
  const pres = await construirPptx(d);
  const buf = await pres.write({ outputType: 'nodebuffer' });
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  const zip = await JSZip.loadAsync(buf);
  const diapositivas = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  assert.equal(diapositivas.length, 4);
  assert.ok(zip.file('[Content_Types].xml'));
  assert.ok(Object.keys(zip.files).some((f) => f.startsWith('ppt/media/')));
  const todo = (await Promise.all(diapositivas.map((f) => zip.file(f).async('string')))).join('\n');
  assert.match(todo, /Campaña 2026/);
  assert.match(todo, /Seguimiento reproductor/);
  assert.match(todo, /Tasa de éxito/);
  assert.match(todo, /<a:tbl>/);
});
