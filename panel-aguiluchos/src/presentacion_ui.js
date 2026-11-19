import { agruparPorNivel } from './geo.js';
import { generarMapas, tituloMapaGeneral } from './mapa_img.js';
import { armarPresentacion } from './presentacion.js';
import { descargarPptx } from './presentacion_pptx.js';

/**
 * Presentación PowerPoint con los nidos filtrados (los mismos del informe).
 * `ctx`: { lista, geo, filtros, fondo, aviso(texto) }.
 */
export async function crearPresentacionUI({ lista, geo, filtros, fondo, aviso }) {
  if (!lista.length) { aviso('No hay nidos en la selección actual para crear la presentación.'); return; }
  let mapaDataUrl = null;
  try {
    aviso('Preparando el mapa…');
    const [mapa] = await generarMapas(lista, { general: true }, agruparPorNivel, undefined, tituloMapaGeneral(geo), fondo);
    mapaDataUrl = mapa?.dataUrl ?? null;
  } catch {
    mapaDataUrl = null;
  }
  aviso('Creando la presentación…');
  const nombre = await descargarPptx(armarPresentacion(lista, { geo, filtros, mapaDataUrl }));
  aviso(`Presentación descargada: ${nombre}`);
}
