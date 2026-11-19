// Armado de datos de la presentación (sin DOM ni librerías): lo que se pinta en las
// diapositivas sale de aquí para poder probarlo. Mismo conjunto de nidos que el informe.
import { SIN_VALOR, estadoReproductivo, resumen } from './logic.js';
import { tituloMapaGeneral } from './mapa_img.js';

export const FILAS_POR_DIAPOSITIVA = 11;

const COLUMNAS_TABLA = [
  ['numeracion', 'Nº'], ['etiqueta', 'Etiqueta'], ['proyecto', 'Proyecto'], ['campana', 'Campaña'],
  ['municipio', 'Localidad'], ['provincia', 'Provincia'], ['especie', 'Especie'], ['estado', 'Estado'],
  ['num_pollos_nacidos', 'Nacidos'], ['num_pollos_volados', 'Volados'], ['num_pollos_muertos', 'Muertos'],
];
const OPCIONALES = new Set(['proyecto', 'campana']);

const vacio = (v) => v == null || String(v).trim() === '';
const celda = (v) => (vacio(v) ? '' : String(v).trim());

export const formatoFecha = (d) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/** Texto del ámbito: proyecto, campaña y el nivel geográfico más concreto filtrado. */
export function ambitoDelFiltro(f = {}) {
  const partes = [];
  if (f.proyecto) partes.push(f.proyecto === SIN_VALOR ? 'Sin proyecto' : `Proyecto ${f.proyecto}`);
  if (f.campana) partes.push(f.campana === SIN_VALOR ? 'Sin campaña' : `Campaña ${f.campana}`);
  const geo = tituloMapaGeneral(f);
  if (geo !== 'Todos los nidos') partes.push(geo);
  return partes.length ? partes.join(' · ') : 'Todos los nidos';
}

export function nombreArchivoPresentacion(fecha = new Date()) {
  return `presentacion_aguiluchos_${fecha.toISOString().slice(0, 10)}.pptx`;
}

/**
 * @param {object[]} lista nidos filtrados (los mismos que entran en el informe)
 * @param {{geo?:object, filtros?:string, fecha?:Date, mapaDataUrl?:string|null, filasPorDiapositiva?:number}} op
 */
export function armarPresentacion(lista, op = {}) {
  const { geo = {}, filtros = '', fecha = new Date(), mapaDataUrl = null, filasPorDiapositiva = FILAS_POR_DIAPOSITIVA } = op;
  const r = resumen(lista);
  const ambito = ambitoDelFiltro(geo);
  const tasa = r.tasaExito == null ? '—' : `${Math.round(r.tasaExito * 100)} %`;

  const columnas = COLUMNAS_TABLA.filter(([k]) => !OPCIONALES.has(k) || lista.some((n) => !vacio(n[k])));
  const filas = lista.map((n) => columnas.map(([k]) => (k === 'estado' ? estadoReproductivo(n) : celda(n[k]))));
  const paginas = [];
  for (let i = 0; i < filas.length; i += filasPorDiapositiva) paginas.push(filas.slice(i, i + filasPorDiapositiva));

  return {
    titulo: 'Seguimiento reproductor · Campaña Aguilucho',
    ambito,
    filtros,
    fecha: formatoFecha(fecha),
    total: lista.length,
    totales: [
      { etiqueta: 'Nidos', valor: String(r.total) },
      { etiqueta: 'Con éxito', valor: String(r.exito) },
      { etiqueta: 'Fracaso', valor: String(r.fracaso) },
      { etiqueta: 'En curso', valor: String(r.enCurso) },
      { etiqueta: 'Tasa de éxito (cerrados)', valor: tasa },
      { etiqueta: 'Pollos nacidos', valor: String(r.nacidos) },
      { etiqueta: 'Pollos volados', valor: String(r.volados) },
      { etiqueta: 'Pollos muertos', valor: String(r.muertos) },
    ],
    causas: r.causas.slice(0, 5),
    mapa: mapaDataUrl ? { dataUrl: mapaDataUrl } : null,
    tabla: { columnas: columnas.map(([, l]) => l), paginas },
  };
}
