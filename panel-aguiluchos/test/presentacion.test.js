import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';
import { ambitoDelFiltro, armarDatosCuaderno, armarPresentacion, candidatasFotos, formatoFecha, nombreCuaderno, nombrePptx, trocearTexto } from '../src/presentacion.js';
import { SECCIONES } from '../src/informe.js';
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

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const OP = { fecha: new Date(2026, 10, 19), geo: { campana: '2026', provincia: 'Zamora' }, filtros: 'provincia: Zamora; campaña: 2026', autor: 'Ana', cargo: 'Técnica', destinatario: 'Junta', referencia: 'REF-1' };
const titulos = (m) => m.diapositivas.map((d) => d.titulo);
const SIN_PERSONALES = /Persona Privada|600000000|REF-SECRETA/;

test('presentación: las secciones disponibles son las del informe (misma lista)', () => {
  const m = armarPresentacion(lista, { ...OP, secciones: SECCIONES.map((x) => x.id) });
  const t = titulos(m).join('\n');
  for (const s of ['Objeto y alcance', 'Resumen ejecutivo', 'Resultados por especie', 'Resultados por comunidad autónoma', 'Resultados por provincia', 'Resultados por localidad',
    'Causas de fracaso', 'Intervenciones de conservación', 'Relación de nidos y justificaciones', 'Observaciones y conclusiones', 'Ficha técnica']) {
    assert.ok(t.includes(s), s);
  }
});

test('presentación: solo lleva lo marcado y numera las secciones', () => {
  const m = armarPresentacion(lista, { ...OP, secciones: ['resumen', 'causas'] });
  assert.deepEqual(titulos(m), [
    '1. Resumen ejecutivo', '1. Resumen ejecutivo · Resultado de la nidificación', '1. Resumen ejecutivo · Pollos nacidos, volados y muertos',
    '2. Causas de fracaso', '2. Causas de fracaso · Gráfico',
  ]);
  assert.equal(m.diapositivas.some((d) => d.tipo === 'mapa' || d.tipo === 'ficha'), false);
  const sin = armarPresentacion(lista, { ...OP, secciones: [] });
  assert.deepEqual(sin.diapositivas, []);
  const defecto = armarPresentacion(lista, OP);
  assert.ok(!titulos(defecto).some((x) => x.includes('Ficha técnica')));
});

test('presentación: portada con título, referencia, destinatario, autor, cargo, ámbito y recuento', () => {
  const m = armarPresentacion(lista, { ...OP, titulo: 'Mi título' });
  assert.equal(m.titulo, 'Mi título');
  assert.equal(m.referencia, 'REF-1');
  assert.equal(m.destinatario, 'Junta');
  assert.equal(m.elaboradoPor, 'Ana · Técnica');
  assert.equal(m.fecha, '19 de noviembre de 2026');
  assert.equal(m.ambito, 'Campaña 2026 · Provincia: Zamora');
  assert.equal(m.filtros, 'provincia: Zamora; campaña: 2026');
  assert.equal(m.total, 3);
  assert.equal(m.nombre, 'presentacion_aguiluchos_2026-11-19.pptx');
  const vacia = armarPresentacion(lista, { fecha: OP.fecha });
  assert.equal(vacia.destinatario, '');
  assert.equal(vacia.elaboradoPor, '');
  assert.match(vacia.titulo, /^Presentación de seguimiento reproductor · Campaña Aguilucho 2026$/);
  assert.match(vacia.referencia, /^GREFA-AGU-2026-1119-/);
});

test('presentación: indicadores, gráficos y causas salen de los nidos incluidos', () => {
  const m = armarPresentacion(lista, { ...OP, secciones: ['resumen', 'causas'] });
  const kpis = Object.fromEntries(m.diapositivas[0].items.map((x) => [x.etiqueta, x.valor]));
  assert.deepEqual([kpis['Nidos analizados'], kpis['Nidos con éxito'], kpis['Nidos fracasados'], kpis['Nidos en curso'], kpis['Tasa de éxito'], kpis['Pollos nacidos'], kpis['Pollos volados'], kpis['Pollos muertos']],
    ['3', '1', '1', '1', '50 %', '6', '3', '1']);
  const [, estados, pollos] = m.diapositivas;
  assert.deepEqual(estados.series[0].values, [1, 1, 1]);
  assert.deepEqual(pollos.series.map((x) => [x.name, x.values]), [['Nacidos', [6]], ['Volados', [3]], ['Muertos', [1]]]);
  const causas = m.diapositivas.find((d) => d.tipo === 'tabla');
  assert.deepEqual(causas.filas, [['Depredación', '1', '100 %']]);
  const sinFracasos = armarPresentacion([lista[0]], { ...OP, secciones: ['causas'] });
  assert.equal(sinFracasos.diapositivas[0].tipo, 'texto');
  assert.match(sinFracasos.diapositivas[0].texto, /No constan nidos fracasados/);
});

test('presentación: tasa de éxito por campaña cuando hay varias; pollos solo si hay datos', () => {
  const muchos = Array.from({ length: 12 }, (_, i) => nido(i + 1, { campana: i < 6 ? '2025' : '2026', resultado_reproductivo: i % 2 ? 'Éxito' : 'Fracaso' }));
  const m = armarPresentacion(muchos, { ...OP, secciones: ['resumen'] });
  const tasas = m.diapositivas.find((d) => d.titulo.includes('Tasa de éxito por campaña'));
  assert.deepEqual(tasas.labels, ['2025 (n=6)', '2026 (n=6)']);
  assert.equal(m.diapositivas.some((d) => d.titulo.includes('Pollos nacidos, volados')), false);
});

test('presentación: tablas por especie, comunidad, provincia y localidad con los totales del informe', () => {
  const m = armarPresentacion(lista, { ...OP, secciones: ['especies', 'provincias', 'municipios'] });
  const [esp, prov, loc] = m.diapositivas;
  assert.deepEqual(esp.columnas.map((c) => c.t), ['Especie', 'Nidos', 'Éxito', 'Fracaso', 'En curso', 'Tasa éxito', 'Nacidos', 'Volados', 'Muertos']);
  assert.deepEqual(esp.filas[0], ['Aguilucho cenizo', '2', '1', '1', '0', '50 %', '6', '3', '1']);
  assert.deepEqual(esp.filas[1].slice(0, 2), ['Sin indicar', '1']);
  assert.equal(prov.filas[0][0], 'Zamora');
  assert.deepEqual(loc.filas.map((f) => f[0]).sort(), ['Sin indicar', 'Toro']);
});

test('presentación: celdas vacías en blanco en la relación e intervenciones, y paginación', () => {
  const muchos = Array.from({ length: 20 }, (_, i) => nido(i + 1, i === 4 ? { intervencion: true, tipo_acciones_manejo: ['Dron'], observaciones_i: 'Nota' } : {}));
  const m = armarPresentacion(muchos, { ...OP, secciones: ['relacion', 'intervenciones'] });
  const rel = m.diapositivas.filter((d) => d.titulo.includes('Relación'));
  assert.deepEqual(rel.map((d) => d.filas.length), [8, 8, 4]);
  assert.match(rel[0].titulo, /\(1\/3\)/);
  assert.deepEqual(rel[0].filas[0], ['1', 'E1', 'Toro', 'Aguilucho cenizo', '', '', '', '', 'En curso', '']);
  const inter = m.diapositivas.find((d) => d.titulo.includes('Intervenciones'));
  assert.deepEqual(inter.filas, [['E5', 'Toro', 'Dron', 'En curso', 'Nota']]);
  const ninguna = armarPresentacion(lista, { ...OP, secciones: ['intervenciones'] });
  assert.match(ninguna.diapositivas[0].texto, /No constan intervenciones/);
});

test('presentación: mapas marcados, ordenados por nivel, con su título y dimensiones', () => {
  const mapas = [
    { nivel: 'provincia', titulo: 'Zamora', n: 2, dataUrl: PNG, ancho: 896, alto: 528 },
    { nivel: 'general', titulo: 'Provincia: Zamora', n: 2, dataUrl: PNG, ancho: 1216, alto: 640 },
  ];
  const m = armarPresentacion(lista, { ...OP, secciones: ['resumen'], mapas, sinCoordenadas: 1 });
  const ms = m.diapositivas.filter((d) => d.tipo === 'mapa');
  assert.deepEqual(ms.map((d) => d.titulo), ['2. Mapas de localización · General', '2. Mapas de localización · Provincia: Zamora']);
  assert.deepEqual([ms[0].w, ms[0].h], [1216, 640]);
  assert.match(ms[0].pie, /fondo: Mapa.*1 nido\(s\) sin coordenadas/);
  assert.equal(armarPresentacion(lista, { ...OP, secciones: ['resumen'] }).diapositivas.some((d) => d.tipo === 'mapa'), false);
  const orto = armarPresentacion(lista, { ...OP, secciones: [], mapas, fondo: 'ortofoto' });
  assert.match(orto.diapositivas[0].pie, /fondo: Ortofoto/);
});

test('presentación: observaciones editables y troceadas en varias diapositivas', () => {
  const m = armarPresentacion(lista, { ...OP, secciones: ['conclusiones'], observaciones: 'Texto editado por la persona.\nSegundo párrafo.' });
  assert.equal(m.diapositivas.length, 1);
  assert.equal(m.diapositivas[0].texto, 'Texto editado por la persona.\nSegundo párrafo.');
  const largo = Array.from({ length: 10 }, (_, i) => `Párrafo ${i} ${'x'.repeat(300)}.`).join('\n');
  const t = trocearTexto(largo, 900);
  assert.ok(t.length >= 3 && t.every((x) => x.length <= 1000));
  assert.equal(t.join('\n').split('\n').length, 10);
  const una = trocearTexto(`${'Frase larga número uno. '.repeat(80)}`, 900);
  assert.ok(una.length >= 2 && una.every((x) => x.length <= 900));
  const por = armarPresentacion(lista, { ...OP, secciones: ['conclusiones'] });
  assert.match(por.diapositivas[0].texto, /De los 3 nido\(s\) analizados/);
  const vacio = armarPresentacion(lista, { ...OP, secciones: ['conclusiones'], observaciones: '' });
  assert.equal(vacio.diapositivas[0].texto, '');
});

test('presentación: ficha técnica por nido (2 diapositivas), vacíos en blanco, sin datos personales y con foto si hay', () => {
  const fotos = new Map([[lista[0], { dataUrl: PNG, w: 4, h: 3 }]]);
  const m = armarPresentacion(lista, { ...OP, secciones: ['fichas'], fotos });
  const f = m.diapositivas;
  assert.equal(f.length, 6);
  assert.equal(f[0].titulo, 'Ficha técnica · E1 · Éxito (1/2)');
  const fase1 = f[0].izquierda[0];
  assert.ok(!fase1.filas.some(([k]) => /Propietario|Teléfono|catastral/.test(k)));
  assert.deepEqual(fase1.filas.find(([k]) => k === 'Especie'), ['Especie', 'Aguilucho cenizo']);
  assert.deepEqual(fase1.filas.find(([k]) => k === 'Proyecto'), ['Proyecto', 'Aguilucho']);
  assert.deepEqual(fase1.filas.find(([k]) => k === 'Territorio'), ['Territorio', '']);
  assert.equal(f[1].foto.w, 4);
  assert.equal(f[3].foto, null);
  assert.ok(!SIN_PERSONALES.test(JSON.stringify(m)));
});

test('presentación: ningún dato personal en ninguna sección', () => {
  const m = armarPresentacion(lista, { ...OP, secciones: SECCIONES.map((x) => x.id) });
  assert.ok(!SIN_PERSONALES.test(JSON.stringify(m)));
});

test('fotos: candidatas públicas por nido y descarga con tope y abandono si las primeras fallan', async () => {
  const c = candidatasFotos(lista);
  assert.deepEqual(c.map((x) => [x.url, x.titulo]), [['https://x.test/a.jpg', 'Nido E1']]);
  const cand = Array.from({ length: 6 }, (_, i) => ({ nido: { i }, url: `u${i}` }));
  const f = await cargarFotos(cand, async (u) => (u === 'u1' || u === 'u3' ? null : { dataUrl: u, w: 10, h: 5 }), 3);
  assert.deepEqual([...f.values()].map((x) => x.dataUrl), ['u0', 'u2', 'u4']);
  let intentos = 0;
  const nada = await cargarFotos(Array.from({ length: 40 }, (_, i) => ({ nido: { i }, url: `x${i}` })), async () => { intentos += 1; return null; });
  assert.equal(nada.size, 0);
  assert.equal(intentos, 8);
});

test('encajar centra la imagen en la caja sin deformarla', () => {
  const r = encajar(1200, 600, { x: 0, y: 0, w: 10, h: 10 });
  assert.deepEqual([r.w, r.h, r.x, r.y], [10, 5, 0, 2.5]);
});

async function leerPptx(modelo) {
  const pres = await construirPptx(modelo);
  const buf = await pres.write({ outputType: 'nodebuffer' });
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  const zip = await JSZip.loadAsync(buf);
  const nombres = Object.keys(zip.files);
  const slides = nombres.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  const xml = (await Promise.all(slides.map((f) => zip.file(f).async('string')))).join('\n');
  return { nombres, slides, xml };
}

test('el .pptx se genera en el cliente con todo lo marcado: portada, gráficos nativos, mapas, tablas y fichas con foto', async () => {
  const mapas = [{ nivel: 'general', titulo: 'Zamora', n: 2, dataUrl: PNG, ancho: 1216, alto: 640 }];
  const fotos = new Map([[lista[0], { dataUrl: PNG, w: 4, h: 3 }]]);
  const m = armarPresentacion(lista, { ...OP, secciones: SECCIONES.map((x) => x.id), mapas, fotos });
  const { nombres, slides, xml } = await leerPptx(m);
  assert.equal(slides.length, 1 + m.diapositivas.length);
  assert.ok(nombres.filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f)).length >= 3);
  assert.ok(nombres.some((f) => f.startsWith('ppt/media/')));
  assert.match(xml, /REF-1/);
  assert.match(xml, /Ana · Técnica/);
  assert.match(xml, /<a:tbl>/);
  assert.match(xml, /Ficha técnica · E1/);
  assert.ok(!SIN_PERSONALES.test(xml));
});

test('el .pptx solo lleva las secciones marcadas (portada + una)', async () => {
  const m = armarPresentacion(lista, { ...OP, secciones: ['alcance'] });
  const { slides, xml, nombres } = await leerPptx(m);
  assert.equal(slides.length, 2);
  assert.match(xml, /1\. Objeto y alcance/);
  assert.equal(nombres.filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f)).length, 0);
  const nada = await leerPptx(armarPresentacion([], { ...OP, secciones: SECCIONES.map((x) => x.id) }));
  assert.ok(nada.slides.length >= 2);
});
