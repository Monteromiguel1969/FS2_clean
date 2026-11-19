import { agruparPorNivel } from './geo.js';
import { posicion } from './logic.js';
import { generarMapas, tituloMapaGeneral } from './mapa_img.js';
import { MAX_FOTOS, armarPresentacion, candidatasFotos } from './presentacion.js';
import { descargarPptx } from './presentacion_pptx.js';

const TIEMPO_FOTO_MS = 6000;
const LADO_MAX_FOTO = 1600;
const ESCALA_MAPA = 1.6;

/** Descarga una foto pública y la reduce a JPEG; null si no se puede (CORS, 404, no es imagen…). */
async function cargarFoto(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIEMPO_FOTO_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, mode: 'cors' });
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const k = Math.min(1, LADO_MAX_FOTO / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return { dataUrl: c.toDataURL('image/jpeg', 0.85), w, h };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Fotos públicas (clave: el nido); deja de insistir si las primeras no se pueden descargar. */
export async function cargarFotos(candidatas, cargar = cargarFoto, maximo = MAX_FOTOS) {
  const res = new Map();
  let fallos = 0;
  for (const c of candidatas) {
    if (res.size >= maximo || (fallos >= 8 && !res.size)) break;
    const f = await cargar(c.url);
    if (f) res.set(c.nido, f);
    else fallos += 1;
  }
  return res;
}

/**
 * Genera y descarga el .pptx con lo marcado en el diálogo (igual que el informe).
 * @param {{lista:object[], opciones:object, secciones:string[], niveles:object, fondo:string, geo?:object, tituloGeneral?:string, aviso:(t:string)=>void}} p
 */
export async function crearPresentacionUI({ lista, opciones, secciones, niveles, fondo, tituloGeneral, aviso }) {
  let mapas = [];
  if (Object.values(niveles).some(Boolean)) {
    mapas = await generarMapas(lista, niveles, agruparPorNivel, (h, t) => aviso(`Generando mapas de localización (${h}/${t})…`), tituloGeneral ?? tituloMapaGeneral(opciones.geo), fondo, ESCALA_MAPA);
  }
  let fotos = new Map();
  if (secciones.includes('fichas')) {
    const candidatas = candidatasFotos(lista);
    if (candidatas.length) {
      aviso('Descargando imágenes de los nidos…');
      fotos = await cargarFotos(candidatas);
    }
  }
  aviso('Creando la presentación…');
  const modelo = armarPresentacion(lista, {
    ...opciones, secciones, mapas, fotos, fondo,
    sinCoordenadas: lista.filter((n) => !posicion(n)).length,
  });
  const nombre = await descargarPptx(modelo);
  aviso(`Presentación descargada: ${nombre}`);
}
