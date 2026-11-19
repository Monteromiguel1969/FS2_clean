// Mapas de localización como imagen PNG (data URL) para incrustarlos en los
// informes: teselas del fondo elegido (OpenStreetMap u ortofoto PNOA, si hay conexión) + nidos coloreados por
// resultado. Sin teselas se dibuja igualmente sobre un fondo neutro con cuadrícula.
import { estadoReproductivo, posicion } from './logic.js';
import { FONDOS, FONDO_DEFECTO, urlTesela } from './fondo.js';

export const COLOR_ESTADO = { Éxito: '#2e6b3a', Fracaso: '#c0392b', 'En curso': '#e08a1e' };
const TILE = 256;

/** Proyección Web Mercator: píxel «mundo» para un zoom. */
export function proyectar(lat, lon, z) {
  const n = 2 ** z * TILE;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
}

/**
 * Zoom y centro para que todos los puntos quepan en ancho×alto con margen.
 * @param {{lat:number, lon:number}[]} puntos
 */
export const ZOOM_DETALLE = 14;

export function encuadre(puntos, { ancho, alto, margen = 46, zMin = 3, zMax = 15 }) {
  let z = zMax;
  const unico = puntos.every((q) => q.lat === puntos[0].lat && q.lon === puntos[0].lon);
  if (unico) z = Math.min(zMax, ZOOM_DETALLE);
  for (; !unico && z > zMin; z--) {
    const p = puntos.map((q) => proyectar(q.lat, q.lon, z));
    const w = Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x));
    const h = Math.max(...p.map((q) => q.y)) - Math.min(...p.map((q) => q.y));
    if (w <= ancho - 2 * margen && h <= alto - 2 * margen) break;
  }
  const p = puntos.map((q) => proyectar(q.lat, q.lon, z));
  const cx = (Math.max(...p.map((q) => q.x)) + Math.min(...p.map((q) => q.x))) / 2;
  const cy = (Math.max(...p.map((q) => q.y)) + Math.min(...p.map((q) => q.y))) / 2;
  return { z, cx, cy };
}

/** Título del mapa general: el nivel geográfico más concreto que esté filtrado. */
export function tituloMapaGeneral(geo = {}) {
  if (geo.localidad) return `Localidad: ${geo.localidad}`;
  if (geo.provincia) return `Provincia: ${geo.provincia}`;
  if (geo.comunidad) return `Comunidad: ${geo.comunidad}`;
  if (geo.pais && geo.pais !== 'España') return `País: ${geo.pais}`;
  return 'Todos los nidos';
}

/** Puntos con coordenadas válidas de una lista de nidos. */
export function puntosDe(nidos) {
  const out = [];
  for (const n of nidos) {
    const p = posicion(n);
    if (!p) continue;
    out.push({ lat: p.lat, lon: p.lon, color: COLOR_ESTADO[estadoReproductivo(n)], etiqueta: n.etiqueta || n.numeracion || '' });
  }
  return out;
}

const cache = new Map();
function cargarTesela(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const t = setTimeout(() => resolve(null), 9000);
      img.onload = () => { clearTimeout(t); resolve(img); };
      img.onerror = () => { clearTimeout(t); resolve(null); };
      img.src = url;
    }));
  }
  return cache.get(url);
}

function dibujar(ctx, puntos, { ancho, alto, titulo, etiquetar, fondo }, teselas, enc) {
  const { z, cx, cy } = enc;
  const ox = cx - ancho / 2;
  const oy = cy - alto / 2;
  ctx.fillStyle = '#e9efe9';
  ctx.fillRect(0, 0, ancho, alto);
  if (!teselas) {
    ctx.strokeStyle = '#d3dcd3';
    ctx.lineWidth = 1;
    for (let x = 0; x < ancho; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, alto); ctx.stroke(); }
    for (let y = 0; y < alto; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ancho, y); ctx.stroke(); }
  } else {
    for (const t of teselas) if (t.img) ctx.drawImage(t.img, t.x * TILE - ox, t.y * TILE - oy, TILE, TILE);
  }
  ctx.font = '12px Arial, sans-serif';
  const colocadas = [];
  for (const q of puntos) {
    const p = proyectar(q.lat, q.lon, z);
    const px = p.x - ox;
    const py = p.y - oy;
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fillStyle = q.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.stroke();
    if (etiquetar && q.etiqueta) {
      // Evita rotular encima de otra etiqueta ya colocada.
      const w = ctx.measureText(q.etiqueta).width;
      const caja = { x: px + 10, y: py - 7, w, h: 14 };
      if (!colocadas.some((c) => caja.x < c.x + c.w && caja.x + caja.w > c.x && caja.y < c.y + c.h && caja.y + caja.h > c.y)) {
        colocadas.push(caja);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.strokeText(q.etiqueta, caja.x, py + 4);
        ctx.fillStyle = '#1d2b22';
        ctx.fillText(q.etiqueta, caja.x, py + 4);
      }
    }
  }
  // Título y atribución
  if (titulo) {
    ctx.font = 'bold 13px Arial, sans-serif';
    const w = ctx.measureText(titulo).width + 16;
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fillRect(8, 8, w, 24);
    ctx.fillStyle = '#1d3f26';
    ctx.fillText(titulo, 16, 25);
  }
  ctx.font = '10px Arial, sans-serif';
  const atrib = teselas ? (FONDOS[fondo] ?? FONDOS[FONDO_DEFECTO]).atribucion : 'Sin mapa base (sin conexión)';
  const wa = ctx.measureText(atrib).width + 8;
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillRect(ancho - wa, alto - 15, wa, 15);
  ctx.fillStyle = '#333';
  ctx.fillText(atrib, ancho - wa + 4, alto - 4);
}

/**
 * Renderiza un mapa PNG con los puntos dados. Devuelve una data URL, o `null`
 * si no hay puntos.
 * @param {{lat:number, lon:number, color:string, etiqueta?:string}[]} puntos
 */
export async function renderMapa(puntos, { ancho = 760, alto = 380, titulo = '', etiquetar = false, conTeselas = true, fondo = FONDO_DEFECTO } = {}) {
  if (!puntos.length) return null;
  const opciones = { ancho, alto, titulo, etiquetar, fondo };
  const enc = encuadre(puntos, { ancho, alto });
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');

  let teselas = null;
  if (conTeselas) {
    const n = 2 ** enc.z;
    const x0 = Math.floor((enc.cx - ancho / 2) / TILE);
    const x1 = Math.floor((enc.cx + ancho / 2) / TILE);
    const y0 = Math.max(0, Math.floor((enc.cy - alto / 2) / TILE));
    const y1 = Math.min(n - 1, Math.floor((enc.cy + alto / 2) / TILE));
    const peticiones = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const xm = ((x % n) + n) % n;
        peticiones.push(cargarTesela(urlTesela(fondo, enc.z, xm, y)).then((img) => ({ x, y, img })));
      }
    }
    teselas = await Promise.all(peticiones);
    if (!teselas.some((t) => t.img)) teselas = null;
  }
  dibujar(ctx, puntos, opciones, teselas, enc);
  try {
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    // Lienzo «contaminado» por teselas sin CORS: se repite sin mapa base.
    dibujar(ctx, puntos, opciones, null, enc);
    return canvas.toDataURL('image/jpeg', 0.85);
  }
}

/**
 * Mapas pedidos para un informe: general + uno por grupo en cada nivel elegido.
 * @param {object[]} nidos
 * @param {{general?:boolean, comunidad?:boolean, provincia?:boolean, localidad?:boolean}} niveles
 * @param {(hecho:number, total:number) => void} [progreso]
 */
export async function generarMapas(nidos, niveles, agruparPorNivel, progreso = () => {}, tituloGeneral = 'Todos los nidos', fondo = FONDO_DEFECTO, escala = 1) {
  const trabajos = [];
  if (niveles.general) trabajos.push({ nivel: 'general', titulo: tituloGeneral, lista: nidos });
  for (const nivel of ['comunidad', 'provincia', 'localidad']) {
    if (!niveles[nivel]) continue;
    for (const [nombre, lista] of agruparPorNivel(nidos, nivel)) trabajos.push({ nivel, titulo: nombre, lista });
  }
  const mapas = [];
  let hecho = 0;
  for (const t of trabajos) {
    const puntos = puntosDe(t.lista);
    if (puntos.length) {
      const etiquetar = t.nivel === 'localidad' || t.nivel === 'provincia' ? puntos.length <= 14 : t.nivel === 'general' ? false : puntos.length <= 14;
      const ancho = Math.round((t.nivel === 'general' ? 760 : 560) * escala);
      const alto = Math.round((t.nivel === 'general' ? 400 : 330) * escala);
      const dataUrl = await renderMapa(puntos, {
        ancho,
        alto,
        titulo: t.titulo,
        etiquetar,
        fondo,
      });
      mapas.push({ nivel: t.nivel, titulo: t.titulo, n: puntos.length, dataUrl, ancho, alto });
    }
    progreso(++hecho, trabajos.length);
  }
  return mapas;
}
