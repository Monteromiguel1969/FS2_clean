import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';
import { ambitoDelFiltro, armarDatosCuaderno, armarPresentacion, formatoFecha, nombreCuaderno, nombrePptx } from '../src/presentacion.js';
import { construirPptx, encajar } from '../src/presentacion_pptx.js';
import { cargarFotos } from '../src/presentacion_ui.js';
import { construirCuaderno, literalPython, serializarCuaderno } from '../src/cuaderno.js';
import { filtrar, SIN_VALOR } from '../src/logic.js';

const nido = (i, extra = {}) => ({ id: `n${i}`, numeracion: String(i), etiqueta: `E${i}`, municipio: 'Toro', provincia: 'Zamora', especie: 'Aguilucho cenizo', propietario: 'Persona Privada', tlfn: '600000000', referencia_catastral: 'REF-SECRETA', ...extra });
const lista = [
  nido(1, { proyecto: 'Aguilucho', campana: '2026', resultado_reproductivo: 'Éxito', num_pollos_nacidos: 4, num_pollos_volados: 3, num_pollos_muertos: 1, imagenes_urls: ['https://x.test/a.jpg', 'ftp://malo', '/storage/privada.jpg'], coordenada_x: 440290, coordenada_y: 4474180 }),
  nido(2, { proyecto: 'Aguilucho', campana: '2026', resultado_reproductivo: 'Fracaso', causas_fracaso: 'Depredación', num_pollos_nacidos: 2 }),
  nido(3, { proyecto: 'Aguilucho', campana: '2026', municipio: '', especie: null }),
];

test('ámbito: proyecto, campaña y nivel geográfico más concreto', () => {
  assert.equal(ambitoDelFiltro({}), 'Todos los nidos');
  assert.equal(ambitoDelFiltro({ proyecto: 'Aguilucho', campana: '2026' }), 'Proyecto Aguilucho · Campaña 2026');
  assert.equal(ambitoDelFiltro({ campana: '2025', comunidad: 'Galicia', provincia: 'Ourense' }), 'Campaña 2025 · Provincia: Ourense');
  assert.equal(ambitoDelFiltro({ proyecto: SIN_VALOR, localidad: 'Toro' }), 'Sin proyecto' + ' · Localidad: Toro');
});

test('datos del cuaderno: ámbito, fecha, fondo, celdas vacías a null y estado calculado', () => {
  const d = armarDatosCuaderno(lista, { geo: { campana: '2026', provincia: 'Zamora' }, filtros: 'provincia: Zamora', fecha: new Date(2026, 10, 19), fondo: 'ortofoto' });
  assert.equal(d.ambito, 'Campaña 2026 · Provincia: Zamora');
  assert.equal(d.fecha, '19/11/2026');
  assert.equal(d.filtros, 'provincia: Zamora');
  assert.equal(d.fondo.id, 'ortofoto');
  assert.match(d.fondo.plantilla, /pnoa-ma.*OI\.OrthoimageCoverage.*GoogleMapsCompatible/);
  assert.equal(d.nidos.length, 3);
  const [a, b, c] = d.nidos;
  assert.deepEqual([a.estado, b.estado, c.estado], ['Éxito', 'Fracaso', 'En curso']);
  assert.equal(a.nacidos, 4);
  assert.equal(b.volados, null);
  assert.equal(c.municipio, null);
  assert.equal(c.especie, null);
  assert.ok(Math.abs(a.lat - 40.4161) < 0.001 && Math.abs(a.lon + 3.7038) < 0.001);
  assert.equal(b.lat, null);
  assert.deepEqual(a.imagenes, ['https://x.test/a.jpg']);
  assert.deepEqual(b.imagenes, []);
  assert.equal(d.nombre_pptx, 'presentacion_aguiluchos_2026-11-19.pptx');
});

test('datos del cuaderno: sin datos personales', () => {
  const texto = JSON.stringify(armarDatosCuaderno(lista));
  assert.ok(!texto.includes('Persona Privada'));
  assert.ok(!texto.includes('600000000'));
  assert.ok(!texto.includes('REF-SECRETA'));
});

test('el cuaderno incluye solo los nidos filtrados (mismo filtro que el informe)', () => {
  const muchos = Array.from({ length: 20 }, (_, i) => nido(i + 1, { campana: i < 8 ? '2025' : '2026', provincia: i % 2 ? 'Zamora' : 'León' }));
  const sel = filtrar(muchos, { texto: '', campana: '2026', provincia: 'Zamora' });
  const nb = construirCuaderno(armarDatosCuaderno(sel, { geo: { campana: '2026', provincia: 'Zamora' } }));
  const celdaDatos = nb.cells.map((c) => c.source.join('')).find((s) => s.includes('DATOS_JSON ='));
  const literal = celdaDatos.split('\n').find((l) => l.startsWith('DATOS_JSON = ')).slice('DATOS_JSON = '.length);
  const incrustado = JSON.parse(JSON.parse(literal));
  assert.equal(incrustado.nidos.length, sel.length);
  assert.ok(sel.length > 0 && sel.length < muchos.length);
  const etiquetas = new Set(incrustado.nidos.map((n) => n.etiqueta));
  assert.deepEqual([...etiquetas].sort(), sel.map((n) => n.etiqueta).sort());
  for (const n of incrustado.nidos) assert.equal(n.campana, '2026');
  assert.equal(incrustado.ambito, 'Campaña 2026 · Provincia: Zamora');
});

test('armado del cuaderno: nbformat 4, celdas en orden, instrucciones y datos con caracteres difíciles', () => {
  const raro = nido(1, { etiqueta: 'A"B\\C\'\'\'D\u2028é\n', observaciones: 'x' });
  const nb = construirCuaderno(armarDatosCuaderno([raro, lista[1]], { geo: { proyecto: 'Aguilucho' } }));
  assert.equal(nb.nbformat, 4);
  assert.equal(nb.cells.length, 8);
  assert.deepEqual(nb.cells.map((c) => c.cell_type), ['markdown', ...Array(7).fill('code')]);
  assert.match(nb.cells[0].source.join(''), /Entorno de ejecución → Ejecutar todo/);
  assert.match(nb.cells[0].source.join(''), /presentacion_aguiluchos_\d{4}-\d{2}-\d{2}\.pptx/);
  const codigo = nb.cells.slice(1).map((c) => c.source.join(''));
  assert.match(codigo[0], /pip install -q python-pptx/);
  assert.match(codigo.join('\n'), /files\.download/);
  assert.match(codigo.join('\n'), /mapa_estatico/);
  const json = serializarCuaderno(nb);
  const vuelta = JSON.parse(json);
  const literal = vuelta.cells[2].source.join('').split('\n').find((l) => l.startsWith('DATOS_JSON = ')).slice(13);
  assert.equal(JSON.parse(JSON.parse(literal)).nidos[0].etiqueta, raro.etiqueta.trim());
  assert.equal(literalPython('a"b\\c'), '"a\\"b\\\\c"');
  assert.ok(!json.includes('api_key') && !/password|contraseña:/i.test(json));
  assert.match(nombreCuaderno(new Date('2026-11-19T10:00:00Z')), /^presentacion_aguiluchos_2026-11-19\.ipynb$/);
  assert.equal(nombrePptx(new Date('2026-11-19T10:00:00Z')), 'presentacion_aguiluchos_2026-11-19.pptx');
  assert.equal(formatoFecha(new Date(2026, 0, 5)), '05/01/2026');
});

test('el código Python de todas las celdas es sintácticamente válido', (t) => {
  const py = spawnSync('python3', ['-c', 'import sys'], { encoding: 'utf8' });
  if (py.status !== 0) return t.skip('python3 no disponible');
  const nb = construirCuaderno(armarDatosCuaderno(lista, { geo: {} }));
  const fuente = nb.cells.filter((c) => c.cell_type === 'code').map((c) => c.source.join('').replace(/^%pip.*$/m, 'pass')).join('\n\n');
  const r = spawnSync('python3', ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: fuente, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('presentación: totales, gráficos con datos, imágenes públicas y celdas vacías en blanco', () => {
  const d = armarPresentacion(lista, { geo: { campana: '2026', provincia: 'Zamora' }, filtros: 'provincia: Zamora', fecha: new Date(2026, 10, 19), fondo: 'ortofoto' });
  assert.equal(d.ambito, 'Campaña 2026 · Provincia: Zamora');
  assert.equal(d.nombre, 'presentacion_aguiluchos_2026-11-19.pptx');
  assert.equal(d.fondo.id, 'ortofoto');
  const t = Object.fromEntries(d.totales.map((x) => [x.etiqueta, x.valor]));
  assert.deepEqual([t.Nidos, t['Con éxito'], t.Fracaso, t['En curso'], t['Tasa de éxito (cerrados)'], t['Pollos nacidos'], t['Pollos volados'], t['Pollos muertos']], ['3', '1', '1', '1', '50 %', '6', '3', '1']);
  assert.deepEqual(d.graficos.estados.values, [1, 1, 1]);
  assert.deepEqual(d.graficos.estados.labels, ['Éxito (1)', 'Fracaso (1)', 'En curso (1)']);
  assert.deepEqual(d.graficos.tasas.values, [50]);
  assert.deepEqual(d.graficos.pollos.series.map((s) => [s.name, s.values]), [['Nacidos', [6]], ['Volados', [3]], ['Muertos', [1]]]);
  assert.deepEqual(d.graficos.causas.labels, ['Depredación']);
  assert.equal(d.conCoordenadas, 1);
  assert.deepEqual(d.imagenes.map((i) => i.url), ['https://x.test/a.jpg']);
  const [f1, f2, f3] = d.tabla.paginas[0];
  assert.deepEqual(f1, ['1', 'E1', 'Aguilucho', '2026', 'Toro', 'Zamora', 'Aguilucho cenizo', 'Éxito', '4', '3', '1']);
  assert.deepEqual(f2.slice(8), ['2', '', '']);
  assert.equal(f3[4], '');
  assert.equal(f3[6], '');
  assert.ok(!JSON.stringify(d).match(/Persona Privada|600000000|REF-SECRETA/));
});

test('presentación: gráficos solo si hay datos; tasa por campaña con varias campañas; pagina y filtra como el informe', () => {
  const sinDatos = armarPresentacion([nido(1), nido(2)], {});
  assert.equal(sinDatos.graficos.tasas, null);
  assert.equal(sinDatos.graficos.pollos, null);
  assert.equal(sinDatos.graficos.causas, null);
  assert.deepEqual(sinDatos.graficos.estados.values, [2]);
  const muchos = Array.from({ length: 25 }, (_, i) => nido(i + 1, { campana: i < 10 ? '2025' : '2026', resultado_reproductivo: i % 2 ? 'Éxito' : 'Fracaso' }));
  const todas = armarPresentacion(muchos, {});
  assert.match(todas.graficos.tasas.titulo, /por campaña/);
  assert.equal(todas.graficos.tasas.labels.length, 2);
  const sel = filtrar(muchos, { texto: '', campana: '2026' });
  const d = armarPresentacion(sel, { geo: { campana: '2026' } });
  assert.equal(d.total, 15);
  assert.deepEqual(d.tabla.paginas.map((p) => p.length), [11, 4]);
  assert.ok(!d.tabla.columnas.includes('Proyecto'));
  assert.ok(d.tabla.columnas.includes('Campaña'));
  const vacio = armarPresentacion([], {});
  assert.equal(vacio.total, 0);
  assert.deepEqual(vacio.tabla.paginas, []);
});

test('fotos: se descargan solo las que cargan, con tope, y se abandona si las primeras fallan', async () => {
  const c = Array.from({ length: 6 }, (_, i) => ({ url: `u${i}`, titulo: `T${i}`, subtitulo: '' }));
  const f = await cargarFotos(c, async (u) => (u === 'u1' || u === 'u3' ? null : { dataUrl: `d-${u}`, w: 10, h: 5 }), 3);
  assert.deepEqual(f.map((x) => x.titulo), ['T0', 'T2', 'T4']);
  let intentos = 0;
  const nada = await cargarFotos(Array.from({ length: 40 }, (_, i) => ({ url: `x${i}` })), async () => { intentos += 1; return null; });
  assert.equal(nada.length, 0);
  assert.equal(intentos, 8);
});

test('encajar centra la imagen en la caja sin deformarla', () => {
  const r = encajar(1200, 600, { x: 0, y: 0, w: 10, h: 10 });
  assert.deepEqual([r.w, r.h, r.x, r.y], [10, 5, 0, 2.5]);
});

test('el .pptx se genera en el cliente: zip válido con portada, totales, gráficos nativos, mapa, fotos y tabla', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const d = armarPresentacion(lista, { geo: { campana: '2026' }, fecha: new Date(2026, 10, 19) });
  const pres = await construirPptx(d, { mapa: { dataUrl: png, w: 1200, h: 620, pie: 'pie' }, imagenes: [{ dataUrl: png, w: 4, h: 3, titulo: 'Nido E1', subtitulo: 'Zamora' }] });
  const buf = await pres.write({ outputType: 'nodebuffer' });
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  const zip = await JSZip.loadAsync(buf);
  const nombres = Object.keys(zip.files);
  const slides = nombres.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  assert.equal(slides.length, 1 + 1 + 4 + 1 + 1 + 1);
  assert.ok(nombres.filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f)).length >= 4);
  assert.ok(nombres.some((f) => f.startsWith('ppt/media/')));
  const todo = (await Promise.all(slides.map((f) => zip.file(f).async('string')))).join('\n');
  assert.match(todo, /Campaña 2026/);
  assert.match(todo, /Tasa de éxito/);
  assert.match(todo, /<a:tbl>/);
  assert.ok(!todo.match(/Persona Privada|600000000|REF-SECRETA/));
  const sinNada = await construirPptx(armarPresentacion([], {}), {});
  assert.equal(Object.keys((await JSZip.loadAsync(await sinNada.write({ outputType: 'nodebuffer' }))).files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length, 3);
});
