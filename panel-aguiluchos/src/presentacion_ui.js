import { puntosDe, renderMapa } from './mapa_img.js';
import { MAX_IMAGENES, armarPresentacion } from './presentacion.js';
import { descargarPptx } from './presentacion_pptx.js';

const TIEMPO_FOTO_MS = 6000;
const LADO_MAX_FOTO = 1600;

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

/** Fotos públicas de los nidos; deja de insistir si las primeras no se pueden descargar. */
export async function cargarFotos(candidatas, cargar = cargarFoto, maximo = MAX_IMAGENES) {
  const res = [];
  let fallos = 0;
  for (const c of candidatas) {
    if (res.length >= maximo || (fallos >= 8 && !res.length)) break;
    const f = await cargar(c.url);
    if (f) res.push({ ...f, titulo: c.titulo, subtitulo: c.subtitulo });
    else fallos += 1;
  }
  return res;
}

/**
 * Presentación PowerPoint con los nidos filtrados (visibles(), igual que el informe),
 * generada y descargada en el navegador. `ctx`: { lista, geo, filtros, fondo, aviso(texto) }.
 */
export async function crearPresentacionUI({ lista, geo, filtros, fondo, aviso }) {
  if (!lista.length) { aviso('No hay nidos en la selección actual para crear la presentación.'); return; }
  const datos = armarPresentacion(lista, { geo, filtros, fondo });

  let mapa = null;
  const puntos = puntosDe(lista);
  if (puntos.length) {
    aviso('Preparando el mapa…');
    try {
      const ancho = 1200;
      const alto = 620;
      const dataUrl = await renderMapa(puntos, { ancho, alto, fondo, etiquetar: puntos.length <= 14 });
      if (dataUrl) mapa = { dataUrl, w: ancho, h: alto, pie: `${puntos.length} nidos con coordenadas · fondo: ${datos.fondo.nombre} · verde = éxito, rojo = fracaso, naranja = en curso` };
    } catch {
      mapa = null;
    }
  }
  let imagenes = [];
  if (datos.imagenes.length) {
    aviso('Descargando imágenes de los nidos…');
    imagenes = await cargarFotos(datos.imagenes);
  }
  aviso('Creando la presentación…');
  const nombre = await descargarPptx(datos, { mapa, imagenes });
  aviso(`Presentación descargada: ${nombre}`);
}
