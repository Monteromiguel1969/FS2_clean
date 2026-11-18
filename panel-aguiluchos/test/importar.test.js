import test from 'node:test';
import assert from 'node:assert/strict';
import writeExcelFile from 'write-excel-file/universal';
import { leerHoja } from '../src/importar_xlsx.js';
import { mapearCabeceras, planificarImportacion, uuidV5, convertirCelda, parseFecha } from '../src/importar.js';
import { COLUMNAS, COLUMNAS_POR_CLAVE } from '../src/columns.js';

const existente = (extra) => ({ id: 'id-1', numeracion: '1', etiqueta: 'A-1', proyecto: 'Aguilucho', campana: '2026', municipio: 'Zamora', num_pollos_nacidos: 3, especie: 'Aguilucho cenizo', ...extra });

test('cabeceras: por etiqueta, por nombre de campo, con paréntesis y acentos; las de más se ignoran', () => {
  const m = mapearCabeceras(['Nº', 'Etiqueta', 'municipio', 'Coordenada X (Este, UTM m)', 'Edad (30 días)', 'Teléfono', 'Columna rara', 'CAMPAÑA']);
  assert.equal(m.indices.etiqueta, 1);
  assert.equal(m.indices.municipio, 2);
  assert.equal(m.indices.coordenada_x, 3);
  assert.equal(m.indices.edad_dias, 4);
  assert.equal(m.indices.tlfn, 5);
  assert.equal(m.indices.campana, 7);
  assert.deepEqual(m.ignoradas, ['Nº', 'Columna rara']);
  assert.ok(m.sinColumna.includes('Proyecto'));
});

test('uuid v5 coincide con el de la app de campo para el mismo nido', async () => {
  assert.equal(await uuidV5('aguiluchos-2026/nido/1'), 'a3809e25-8b0e-5a2f-9791-bfcbe91d81d5');
});

test('celdas: fechas, números con coma, sí/no, listas y valores inválidos en blanco', () => {
  const c = (k, v) => convertirCelda(COLUMNAS_POR_CLAVE[k], v);
  assert.equal(c('fecha_vuelo', '15/06/2026').valor, '2026-06-15');
  assert.equal(c('fecha_vuelo', new Date(Date.UTC(2026, 5, 15))).valor, '2026-06-15');
  assert.equal(parseFecha('31/02/2026'), null);
  assert.equal(c('coordenada_x', '440290,5').valor, 440290.5);
  assert.equal(c('intervencion', 'Sí').valor, true);
  assert.deepEqual(c('tipo_acciones_manejo', 'Dron, rodal').valor, ['Dron', 'Rodal']);
  assert.equal(c('edad_dias', '21-19-17').valor, 21);
  assert.equal(c('num_pollos_nacidos', 'abc').valor, undefined);
  assert.ok(c('num_pollos_nacidos', 'abc').aviso);
  assert.deepEqual(c('municipio', ''), {});
  assert.deepEqual(c('municipio', 's/d'), {});
  assert.equal(c('especie', 'cenizo').valor, 'Aguilucho cenizo');
});

test('faltan columnas y celdas: se dejan en blanco, sobran columnas: se ignoran, no falla', async () => {
  const filas = [
    ['Numeración', 'Municipio', 'Pollos nacidos', 'Columna de más'],
    ['10', 'Toro', 4, 'x'],
    ['11', null, '', 'y'],
  ];
  const plan = await planificarImportacion(filas, []);
  assert.equal(plan.error, undefined);
  assert.equal(plan.nuevos.length, 2);
  const [a, b] = plan.nuevos.map((n) => n.fila);
  assert.equal(a.municipio, 'Toro');
  assert.equal(a.num_pollos_nacidos, 4);
  assert.equal(b.municipio, null);
  assert.equal(b.num_pollos_nacidos, null);
  assert.equal(a.propietario, null);
  assert.equal(a.proyecto, null);
  assert.equal(a.campana, null);
  assert.deepEqual(plan.cabeceras.ignoradas, ['Columna de más']);
  assert.equal(plan.trae.proyecto, false);
  assert.equal(plan.trae.campana, false);
});

test('proyecto y campaña solo se asignan si vienen en el fichero y nunca se deducen uno del otro', async () => {
  const solo = await planificarImportacion([['Numeración', 'Proyecto'], ['1', 'Aguilucho']], []);
  assert.equal(solo.nuevos[0].fila.proyecto, 'Aguilucho');
  assert.equal(solo.nuevos[0].fila.campana, null);
  const ambas = await planificarImportacion([['Numeración', 'Proyecto', 'Campaña'], ['1', 'Aguilucho', '2027'], ['2', 'Aguilucho', null]], []);
  assert.equal(ambas.nuevos[0].fila.campana, '2027');
  assert.equal(ambas.nuevos[1].fila.campana, null);
});

test('importar sobre nidos existentes solo cambia celdas con valor y no borra nada', async () => {
  const ex = [existente(), existente({ id: 'id-2', numeracion: '2', etiqueta: 'A-2' })];
  const plan = await planificarImportacion(
    [['Numeración', 'Municipio', 'Pollos nacidos', 'Especie'], ['1', 'Toro', '', 'cenizo']],
    ex,
  );
  assert.equal(plan.nuevos.length, 0);
  assert.equal(plan.actualizar.length, 1);
  assert.deepEqual(plan.actualizar[0].cambios, { municipio: 'Toro' });
  assert.equal(plan.actualizar[0].id, 'id-1');
  assert.ok(!('borrar' in plan));
});

test('mismo nido en otra campaña es un nido nuevo; sin campaña en el fichero se empareja', async () => {
  const ex = [existente()];
  const otra = await planificarImportacion([['Numeración', 'Campaña', 'Municipio'], ['1', '2027', 'Toro']], ex);
  assert.equal(otra.nuevos.length, 1);
  assert.equal(otra.nuevos[0].fila.campana, '2027');
  assert.notEqual(otra.nuevos[0].id, 'id-1');
  const misma = await planificarImportacion([['Numeración', 'Municipio'], ['1', 'Toro']], ex);
  assert.equal(misma.nuevos.length, 0);
  assert.equal(misma.actualizar.length, 1);
});

test('reimportar el mismo fichero no cambia nada ni duplica', async () => {
  const filas = [['Numeración', 'Municipio', 'Fecha vuelo'], ['5', 'Toro', '10/06/2026']];
  const uno = await planificarImportacion(filas, []);
  const creado = { ...uno.nuevos[0].fila, id: uno.nuevos[0].id };
  const dos = await planificarImportacion(filas, [creado]);
  assert.equal(dos.nuevos.length, 0);
  assert.equal(dos.actualizar.length, 0);
  assert.equal(dos.sinCambios, 1);
});

test('filas repetidas en el fichero se fusionan en un solo nido', async () => {
  const plan = await planificarImportacion([['Numeración', 'Municipio', 'Propietario'], ['7', 'Toro', ''], ['7', '', 'Pepe']], []);
  assert.equal(plan.nuevos.length, 1);
  assert.equal(plan.nuevos[0].fila.municipio, 'Toro');
  assert.equal(plan.nuevos[0].fila.propietario, 'Pepe');
});

test('campo sin columna en la tabla (campana) no se importa si no está disponible', async () => {
  const sinCampana = COLUMNAS.filter((c) => c.key !== 'campana');
  const plan = await planificarImportacion([['Numeración', 'Campaña'], ['1', '2026']], [], sinCampana);
  assert.ok(!('campana' in plan.nuevos[0].fila));
  assert.ok(plan.cabeceras.ignoradas.includes('Campaña'));
});

test('hoja sin cabeceras reconocibles: error claro y nada que importar', async () => {
  const plan = await planificarImportacion([['foo', 'bar'], [1, 2]], []);
  assert.ok(plan.error);
  assert.equal(plan.nuevos.length, 0);
});

test('lee un .xlsx real (con fechas, números y columnas que faltan) y lo planifica', async () => {
  const datos = [
    ['Numeración', 'Proyecto', 'Campaña', 'Fecha vuelo', 'Pollos nacidos', 'Coordenada X (Este, UTM m)', 'Coordenada Y (Norte, UTM m)', 'Notas'],
    ['21', 'Aguilucho', 2026, { value: new Date(Date.UTC(2026, 5, 15)), format: 'dd/mm/yyyy' }, 3, 440290, 4474180, 'ignorar'],
    ['22', 'Aguilucho', 2026, null, null, null, null, null],
  ];
  const blob = await writeExcelFile(datos).toBlob();
  const hoja = await leerHoja(blob);
  const plan = await planificarImportacion(hoja, []);
  assert.equal(plan.nuevos.length, 2);
  const [a, b] = plan.nuevos.map((n) => n.fila);
  assert.equal(a.campana, '2026');
  assert.equal(a.fecha_vuelo, '2026-06-15');
  assert.equal(a.num_pollos_nacidos, 3);
  assert.equal(a.coordenada_x, 440290);
  assert.equal(b.fecha_vuelo, null);
  assert.equal(b.coordenada_x, null);
  assert.deepEqual(plan.cabeceras.ignoradas, ['Notas']);
});
