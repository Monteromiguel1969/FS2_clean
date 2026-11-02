import { esPlausible, utmToLatLon } from './utm.js';
import { COLUMNAS } from './columns.js';

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

export function filtrar(nidos, f) {
  const q = norm(f.texto).trim();
  return nidos.filter((n) => {
    if (f.municipio && n.municipio !== f.municipio) return false;
    if (f.especie && n.especie !== f.especie) return false;
    if (f.proyecto && n.proyecto !== f.proyecto) return false;
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
