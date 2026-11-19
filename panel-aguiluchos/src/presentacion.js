// Datos de la presentación: los nidos filtrados (los mismos del informe) listos para
// incrustarlos en el cuaderno de Colab. Sin DOM ni red: se prueba en node.
// No se incluyen datos personales (propietario, teléfono, referencia catastral).
import { SIN_VALOR, estadoReproductivo, posicion } from './logic.js';
import { tituloMapaGeneral } from './mapa_img.js';
import { FONDOS, FONDO_DEFECTO } from './fondo.js';

const vacio = (v) => v == null || String(v).trim() === '';
const texto = (v) => (vacio(v) ? null : String(v).trim());
const entero = (v) => (vacio(v) || !Number.isFinite(Number(v)) ? null : Number(v));

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

export const nombrePptx = (fecha = new Date()) => `presentacion_aguiluchos_${fecha.toISOString().slice(0, 10)}.pptx`;
export const nombreCuaderno = (fecha = new Date()) => `presentacion_aguiluchos_${fecha.toISOString().slice(0, 10)}.ipynb`;

const urlsPublicas = (v) => (Array.isArray(v) ? v : []).filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim())).map((u) => u.trim());

/**
 * @param {object[]} lista nidos filtrados (visibles(), igual que el informe)
 * @param {{geo?:object, filtros?:string, fecha?:Date, fondo?:string}} op
 */
export function armarDatosCuaderno(lista, op = {}) {
  const { geo = {}, filtros = '', fecha = new Date(), fondo = FONDO_DEFECTO } = op;
  const f = FONDOS[fondo] ?? FONDOS[FONDO_DEFECTO];
  return {
    ambito: ambitoDelFiltro(geo),
    filtros,
    fecha: formatoFecha(fecha),
    nombre_pptx: nombrePptx(fecha),
    fondo: { id: f.id, nombre: f.etiqueta, plantilla: f.plantilla, atribucion: f.atribucion },
    nidos: lista.map((n) => {
      const p = posicion(n);
      return {
        numeracion: texto(n.numeracion),
        etiqueta: texto(n.etiqueta),
        proyecto: texto(n.proyecto),
        campana: texto(n.campana),
        municipio: texto(n.municipio),
        provincia: texto(n.provincia),
        especie: texto(n.especie),
        estado: estadoReproductivo(n),
        estado_final: texto(n.estado_final),
        causas_fracaso: texto(n.causas_fracaso),
        nacidos: entero(n.num_pollos_nacidos),
        volados: entero(n.num_pollos_volados),
        muertos: entero(n.num_pollos_muertos),
        lat: p ? Number(p.lat.toFixed(6)) : null,
        lon: p ? Number(p.lon.toFixed(6)) : null,
        imagenes: urlsPublicas(n.imagenes_urls),
      };
    }),
  };
}
