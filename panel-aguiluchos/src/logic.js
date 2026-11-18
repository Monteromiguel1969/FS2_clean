import { esPlausible, utmToLatLon } from './utm.js';
import { COLUMNAS } from './columns.js';
import { ubicacion } from './geo.js';

export function estadoReproductivo(n) {
  if (n.resultado_reproductivo === 'Éxito') return 'Éxito';
  if (n.resultado_reproductivo === 'Fracaso') return 'Fracaso';
  return 'En curso';
}

export function posicion(n) {
  const x = Number(n.coordenada_x);
  const y = Number(n.coordenada_y);
  if (n.coordenada_x == null || n.coordenada_y == null) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !esPlausible(x, y)) return null;
  return utmToLatLon(x, y);
}

export function googleMapsUrl(n) {
  if (n.google_maps_url) return n.google_maps_url;
  const p = posicion(n);
  return p ? `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lon.toFixed(6)}` : null;
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Valor del selector que representa «sin proyecto» / «sin campaña». */
export const SIN_VALOR = '__sin__';

const vacio = (v) => v == null || String(v).trim() === '';
const coincide = (valor, sel) => (sel === SIN_VALOR ? vacio(valor) : String(valor ?? '').trim() === sel);

/** Valores distintos de un campo (ordenados) y si hay nidos sin valor. */
export function valoresDistintos(nidos, clave) {
  const set = new Set();
  let sin = false;
  for (const n of nidos) {
    if (vacio(n[clave])) sin = true;
    else set.add(String(n[clave]).trim());
  }
  return { valores: [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })), sin };
}

/** Opciones de los selectores: la campaña solo ofrece las del proyecto elegido. */
export function opcionesProyectoCampana(nidos, f) {
  const proyectos = valoresDistintos(nidos, 'proyecto');
  const deProyecto = f.proyecto ? nidos.filter((n) => coincide(n.proyecto, f.proyecto)) : nidos;
  return { proyectos, campanas: valoresDistintos(deProyecto, 'campana') };
}

export function filtrar(nidos, f) {
  const q = norm(f.texto).trim();
  return nidos.filter((n) => {
    if (f.municipio && n.municipio !== f.municipio) return false;
    if (f.pais || f.comunidad || f.provincia || f.localidad) {
      const u = ubicacion(n);
      if (f.pais && u.pais !== f.pais) return false;
      if (f.comunidad && u.comunidad !== f.comunidad) return false;
      if (f.provincia && u.provincia !== f.provincia) return false;
      if (f.localidad && u.localidad !== f.localidad) return false;
    }
    if (f.especie && n.especie !== f.especie) return false;
    if (f.proyecto && !coincide(n.proyecto, f.proyecto)) return false;
    if (f.campana && !coincide(n.campana, f.campana)) return false;
    if (f.estado && estadoReproductivo(n) !== f.estado) return false;
    if (q && !norm(`${n.etiqueta} ${n.numeracion} ${n.propietario} ${n.municipio}`).includes(q)) return false;
    return true;
  });
}

const suma = (nidos, k) => nidos.reduce((a, n) => a + (Number(n[k]) || 0), 0);

export function resumen(nidos) {
  const exito = nidos.filter((n) => estadoReproductivo(n) === 'Éxito').length;
  const fracaso = nidos.filter((n) => estadoReproductivo(n) === 'Fracaso').length;
  const cerrados = exito + fracaso;
  const causas = {};
  for (const n of nidos) {
    if (estadoReproductivo(n) === 'Fracaso') {
      const k = n.causas_fracaso || 'Sin causa indicada';
      causas[k] = (causas[k] || 0) + 1;
    }
  }
  return {
    total: nidos.length,
    exito,
    fracaso,
    enCurso: nidos.length - cerrados,
    tasaExito: cerrados ? exito / cerrados : null,
    nacidos: suma(nidos, 'num_pollos_nacidos'),
    volados: suma(nidos, 'num_pollos_volados'),
    muertos: suma(nidos, 'num_pollos_muertos'),
    causas: Object.entries(causas).sort((a, b) => b[1] - a[1]),
  };
}

function csvCell(v) {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join('; ') : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con BOM y separador ';' para que Excel (es_ES) lo abra directamente. */
export function aCsv(nidos, columnas = COLUMNAS) {
  const cab = columnas.map((c) => csvCell(c.label)).join(';');
  const filas = nidos.map((n) => columnas.map((c) => csvCell(n[c.key])).join(';'));
  return '\ufeff' + [cab, ...filas].join('\r\n');
}

/** Convierte el valor de un formulario al tipo de la columna (null si vacío). */
export function parseValor(col, raw) {
  if (col.tipo === 'bool') return Boolean(raw);
  if (col.tipo === 'list') return Array.isArray(raw) ? raw : [];
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  if (col.tipo === 'int') {
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (col.tipo === 'num') {
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return s;
}

export function validar(n) {
  const errores = [];
  if (!n.etiqueta && !n.numeracion) errores.push('Indica al menos la etiqueta o la numeración.');
  const nac = n.num_pollos_nacidos;
  if (nac != null) {
    const sal = (n.num_pollos_volados ?? 0) + (n.num_pollos_muertos ?? 0);
    if (sal > nac) errores.push(`Volados + muertos (${sal}) superan a los nacidos (${nac}).`);
  }
  if (n.coordenada_x != null && n.coordenada_y != null && !esPlausible(n.coordenada_x, n.coordenada_y)) {
    errores.push('Las coordenadas UTM no son plausibles para España.');
  }
  return errores;
}

/** Convierte arrays que Realtime pudiera entregar como texto Postgres ("{a,b}"). */
function listaPg(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return [];
  const s = v.trim();
  if (s === '' || s === '{}') return [];
  if (s.startsWith('[')) {
    try { return JSON.parse(s); } catch { return []; }
  }
  return s.replace(/^\{|\}$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '').trim()).filter(Boolean);
}

/**
 * Aplica a la lista en memoria un evento de Supabase Realtime (`postgres_changes`).
 * - Borrado lógico (`is_deleted`) o DELETE: el nido desaparece de la lista.
 * - Last-Write-Wins: un evento con `updated_at` anterior al que ya se tiene se ignora.
 * Devuelve una lista nueva (o la misma si no hay cambios).
 */
export function aplicarCambio(nidos, evento) {
  if (evento.eventType === 'DELETE') {
    const id = evento.old?.id;
    return id ? nidos.filter((n) => n.id !== id) : nidos;
  }
  const nueva = evento.new;
  if (!nueva?.id) return nidos;
  if (nueva.is_deleted) return nidos.filter((n) => n.id !== nueva.id);
  const fila = {
    ...nueva,
    tipo_acciones_manejo: listaPg(nueva.tipo_acciones_manejo),
    imagenes_urls: listaPg(nueva.imagenes_urls),
  };
  const i = nidos.findIndex((n) => n.id === fila.id);
  if (i < 0) return [...nidos, fila];
  const actual = nidos[i];
  if (actual.updated_at && fila.updated_at && new Date(fila.updated_at) < new Date(actual.updated_at)) return nidos;
  const copia = [...nidos];
  copia[i] = fila;
  return copia;
}

// ── Cuentas ─────────────────────────────────────────────────────────────────
export const DOMINIO = '@grefa.org';
export const ADMIN_EMAIL = 'aquilagestion@grefa.org';
export const MIN_CLAVE = 8;

/** Correo del dominio de GREFA (nombre@grefa.org). */
export function correoPermitido(email) {
  const e = String(email ?? '').trim().toLowerCase();
  return e.length > DOMINIO.length && e.endsWith(DOMINIO) && !/\s/.test(e) && e.indexOf('@') === e.length - DOMINIO.length;
}

/** Único administrador de la campaña (el único que puede eliminar nidos). */
export function esAdmin(email) {
  return String(email ?? '').trim().toLowerCase() === ADMIN_EMAIL;
}

export function validarClave(clave) {
  return String(clave ?? '').length >= MIN_CLAVE ? null : `La contraseña debe tener al menos ${MIN_CLAVE} caracteres.`;
}
