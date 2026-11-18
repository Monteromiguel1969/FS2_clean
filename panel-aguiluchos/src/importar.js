// Importación tolerante de Excel: lógica pura (sin DOM ni red) para poder probarla.
// Reglas: la primera fila son las cabeceras; se empareja por nombre; lo que falta
// (columna o celda) queda en blanco; las columnas de más se ignoran; nunca se borra
// nada; proyecto y campaña solo se asignan si el fichero trae esas columnas.
import { COLUMNAS, MANEJO } from './columns.js';
import { esPlausible } from './utm.js';

// Texto con «CampaÃ±a» (UTF-8 leído como Latin-1) → «Campaña».
function repararMojibake(t) {
  if (!/[ÃÂ][\u0080-\u00bf]/.test(t)) return t;
  const cods = [...t].map((c) => c.charCodeAt(0));
  if (cods.some((c) => c > 255)) return t;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(cods));
  } catch {
    return t;
  }
}

/** Quita BOM, espacios de ancho cero y otros caracteres invisibles; NBSP pasa a espacio. */
export const limpiar = (s) => repararMojibake(String(s ?? '').replace(/\p{Cf}/gu, '').replace(/[\u00a0\u2007\u202f]/g, ' '));

export const normalizar = (s) =>
  limpiar(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '');

const ALIAS = {
  telefono: 'tlfn', tel: 'tlfn', movil: 'tlfn',
  localizacionesgooglemaps: 'google_maps_url', localizaciongooglemaps: 'google_maps_url',
  googlemaps: 'google_maps_url', enlacegooglemaps: 'google_maps_url', urlgooglemaps: 'google_maps_url', mapa: 'google_maps_url',
  catastro: 'referencia_catastral', refcatastral: 'referencia_catastral',
  localidad: 'municipio', poblacion: 'municipio',
  x: 'coordenada_x', utmx: 'coordenada_x', este: 'coordenada_x', coordenadax: 'coordenada_x',
  y: 'coordenada_y', utmy: 'coordenada_y', norte: 'coordenada_y',
  nhuevosalentrarnido: 'num_huevos_entrada', huevosalentrarnido: 'num_huevos_entrada', huevosentrada: 'num_huevos_entrada',
  pollosmuertosdurantelacosecha: 'pollos_muertos_cosecha', pollosmuertosencosecha: 'pollos_muertos_cosecha',
  pollosnacidos: 'num_pollos_nacidos', pollosvolados: 'num_pollos_volados', pollosmuertos: 'num_pollos_muertos',
  tipodeacciones: 'tipo_acciones_manejo', tipodemanejo: 'tipo_acciones_manejo', manejo: 'tipo_acciones_manejo',
  edad: 'edad_dias', edaddias: 'edad_dias',
  temporada: 'campana', numero: 'numeracion', nido: 'numeracion',
};
const PREFIJOS = [
  ['fechadeeclosion', 'fecha_eclosion'], ['fechadevuelo', 'fecha_vuelo'], ['fechadeincubacion', 'fecha_incubacion'],
  ['fechadecosecha', 'fecha_cosecha'], ['fechadeentrada', 'fecha_entrada_nido'], ['tipodeacciones', 'tipo_acciones_manejo'],
];

function tablaNombres(columnas) {
  const mapa = new Map();
  const poner = (nombre, key) => { if (nombre && !mapa.has(nombre)) mapa.set(nombre, key); };
  for (const c of columnas) { poner(normalizar(c.key), c.key); poner(normalizar(c.label), c.key); }
  const disponibles = new Set(columnas.map((c) => c.key));
  for (const [a, k] of Object.entries(ALIAS)) if (disponibles.has(k)) poner(normalizar(a), k);
  return mapa;
}

function distancia1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [corta, larga] = a.length < b.length ? [a, b] : [b, a];
  return corta.slice(i) === larga.slice(i + 1);
}

// Segunda pasada, solo para cabeceras que no coinciden exactamente y solo si el
// campo sigue libre: «Campañas», «Año campaña», «Proyecto:», erratas de una letra…
function emparejarAproximado(n, nombres, libre) {
  const contiene = [['campan', 'campana'], ['proyecto', 'proyecto']].find(([t, k]) => n.includes(t) && libre(k));
  if (contiene) return contiene[1];
  if (n.length < 6) return null;
  const cercanos = new Set();
  for (const [nombre, key] of nombres) if (nombre.length >= 6 && libre(key) && distancia1(n, nombre)) cercanos.add(key);
  return cercanos.size === 1 ? [...cercanos][0] : null;
}

/**
 * Empareja la primera fila con las columnas del formulario.
 * Devuelve índices por campo, las cabeceras reconocidas, las ignoradas (columnas de más o
 * repetidas) y los campos del formulario que el fichero no trae.
 */
export function mapearCabeceras(fila, columnas = COLUMNAS) {
  const nombres = tablaNombres(columnas);
  const disponibles = new Set(columnas.map((c) => c.key));
  const indices = {};
  const reconocidas = [];
  const ignoradas = [];
  const pendientes = [];
  (fila ?? []).forEach((cab, i) => {
    const texto = limpiar(cab).trim();
    if (!texto) return;
    const n = normalizar(texto);
    const key = nombres.get(n) ?? PREFIJOS.find(([p, k]) => n.startsWith(p) && disponibles.has(k))?.[1];
    if (!key) { pendientes.push({ i, texto, n }); return; }
    if (key in indices) { ignoradas.push(texto); return; }
    indices[key] = i;
    reconocidas.push({ cabecera: texto, key });
  });
  const libre = (k) => disponibles.has(k) && !(k in indices);
  for (const { i, texto, n } of pendientes) {
    const key = emparejarAproximado(n, nombres, libre);
    if (key) { indices[key] = i; reconocidas.push({ cabecera: texto, key }); } else ignoradas.push(texto);
  }
  const sinColumna = columnas.filter((c) => !(c.key in indices)).map((c) => c.label);
  return { indices, reconocidas, ignoradas, sinColumna };
}

// ── Conversión de celdas ────────────────────────────────────────────────────
const SIN_DATO = new Set(['', '-', '--', 'n/a', 'na', 's/d', 'sd', 'null', 'nan', 'sin dato', 'sin datos']);

function vacia(v) {
  if (v == null) return true;
  if (typeof v === 'number') return Number.isNaN(v);
  return SIN_DATO.has(String(v).trim().toLowerCase());
}

const texto = (v) => (v instanceof Date ? fechaIso(v) : typeof v === 'number' ? String(v) : String(v).trim());

const fechaValida = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
    ? `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;
};

function fechaIso(d) {
  return Number.isNaN(d.getTime()) ? null : fechaValida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function parseFecha(v) {
  if (v instanceof Date) return fechaIso(v);
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    return fechaIso(new Date(Math.round((v - 25569) * 86400000)));
  }
  const s = String(v);
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return fechaValida(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/);
  if (m) return fechaValida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

function parseNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

function parseEntero(v, key) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && Number.isInteger(v) ? v : null;
  const s = String(v).trim();
  if (/^\d+([.,]0+)?$/.test(s)) return Number.parseInt(s, 10);
  if (key === 'edad_dias') {
    const nums = s.match(/\d+/g)?.map(Number);
    if (nums?.length) return Math.max(...nums);
  }
  return null;
}

function parseBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  const s = normalizar(v);
  if (['si', 's', 'true', 'verdadero', 'x', 'yes', '1'].includes(s)) return true;
  if (['no', 'n', 'false', 'falso', '0'].includes(s)) return false;
  return null;
}

function parseLista(v) {
  const n = normalizar(texto(v));
  const res = MANEJO.filter((o) => n.includes(normalizar(o).slice(0, 5)));
  return res.length ? res : null;
}

const REGLAS_SELECT = {
  especie: [['cenizo', 'Aguilucho cenizo'], ['palido', 'Aguilucho pálido'], ['lagunero', 'Aguilucho lagunero']],
  resultado_reproductivo: [['exito', 'Éxito'], ['fracaso', 'Fracaso']],
};

function parseSelect(col, v) {
  const t = texto(v);
  const n = normalizar(t);
  const exacta = col.opciones.find((o) => normalizar(o) === n);
  if (exacta) return exacta;
  const regla = REGLAS_SELECT[col.key]?.find(([k]) => n.includes(k));
  return regla ? regla[1] : t;
}

/** Convierte una celda al tipo del campo. Devuelve { valor } o { aviso } (campo en blanco). */
export function convertirCelda(col, raw) {
  if (vacia(raw)) return {};
  const ko = () => ({ aviso: `«${col.label}»: valor no válido (${texto(raw)}); se deja en blanco` });
  switch (col.tipo) {
    case 'int': {
      const n = parseEntero(raw, col.key);
      return n == null ? ko() : { valor: n };
    }
    case 'num': {
      const n = parseNumero(raw);
      return n == null ? ko() : { valor: n };
    }
    case 'date': {
      const f = parseFecha(raw);
      return f == null ? ko() : { valor: f };
    }
    case 'bool': {
      const b = parseBool(raw);
      return b == null ? ko() : { valor: b };
    }
    case 'list': {
      const l = parseLista(raw);
      return l == null ? ko() : { valor: l };
    }
    case 'select': {
      const s = parseSelect(col, raw);
      if (col.key === 'resultado_reproductivo' && !col.opciones.includes(s)) return ko();
      return s ? { valor: s } : {};
    }
    default: {
      const s = texto(raw);
      if (col.key === 'google_maps_url' && !/^https?:\/\//i.test(s)) return ko();
      return s ? { valor: s } : {};
    }
  }
}

// ── Plan de importación ─────────────────────────────────────────────────────
const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

/** UUID v5 (SHA-1). Coincide con el que genera la app de campo para el mismo nido. */
export async function uuidV5(nombre, namespace = NAMESPACE_URL) {
  const ns = namespace.replace(/-/g, '').match(/../g).map((h) => Number.parseInt(h, 16));
  const nom = new TextEncoder().encode(nombre);
  const datos = new Uint8Array(ns.length + nom.length);
  datos.set(ns);
  datos.set(nom, ns.length);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', datos)).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const blanco = (v) => v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
const clave = (v) => normalizar(v);

const igual = (a, b) => {
  if (blanco(a) || blanco(b)) return blanco(a) && blanco(b);
  if (Array.isArray(a) || Array.isArray(b)) return [...(a ?? [])].sort().join('|') === [...(b ?? [])].sort().join('|');
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a ?? '').trim() === String(b ?? '').trim();
};

function filaBase(columnas) {
  const f = {};
  for (const c of columnas) f[c.key] = c.tipo === 'list' ? [] : c.tipo === 'bool' ? false : null;
  return f;
}

function identidad(v) {
  if (!blanco(v.numeracion)) return { campo: 'numeracion', valor: clave(v.numeracion) };
  if (!blanco(v.etiqueta)) return { campo: 'etiqueta', valor: clave(v.etiqueta) };
  return null;
}

const compatible = (a, b) => blanco(a) || blanco(b) || clave(a) === clave(b);

function buscar(registros, v, ident) {
  const candidatos = registros.filter((r) => {
    if (clave(r.datos[ident.campo]) !== ident.valor) return false;
    return compatible(r.datos.proyecto, v.proyecto) && compatible(r.datos.campana, v.campana);
  });
  const exacto = candidatos.find((r) => !blanco(v.campana) && clave(r.datos.campana) === clave(v.campana));
  return exacto ?? candidatos[0] ?? null;
}

function derivarResultado(v) {
  if (v.resultado_reproductivo !== undefined || !v.estado_final) return false;
  const n = normalizar(v.estado_final);
  if (n.includes('sinexito')) v.resultado_reproductivo = 'Fracaso';
  else if (n.includes('conexito')) v.resultado_reproductivo = 'Éxito';
  else return false;
  return true;
}

/**
 * Lee las filas de la hoja (array de arrays) y decide qué hacer con cada una.
 * `existentes`: nidos actuales del panel. `columnas`: campos disponibles en la tabla.
 * No toca nada: devuelve el plan { nuevos, actualizar, sinCambios, avisos, cabeceras… }.
 */
export async function planificarImportacion(filas, existentes, columnas = COLUMNAS) {
  const hoja = Array.isArray(filas) ? filas : [];
  const cab = mapearCabeceras(hoja[0], columnas);
  const porClave = Object.fromEntries(columnas.map((c) => [c.key, c]));
  const plan = {
    cabeceras: cab, filasLeidas: 0, filasVacias: 0, nuevos: [], actualizar: [], sinCambios: 0, avisos: [],
    resultadosDerivados: 0, trae: { proyecto: 'proyecto' in cab.indices, campana: 'campana' in cab.indices },
  };
  if (!hoja.length || !cab.reconocidas.length) {
    plan.error = 'No se reconoció ninguna columna en la primera fila. Comprueba que la primera fila tiene los nombres de los campos.';
    return plan;
  }

  const registros = existentes.map((e) => ({ id: e.id, datos: { ...e }, cambios: {}, nuevo: false, tocado: false }));
  const idsUsados = new Set(existentes.map((e) => e.id));
  const base = filaBase(columnas);

  for (let i = 1; i < hoja.length; i += 1) {
    const celdas = hoja[i] ?? [];
    const numFila = i + 1;
    const v = {};
    for (const [key, idx] of Object.entries(cab.indices)) {
      const r = convertirCelda(porClave[key], celdas[idx]);
      if (r.aviso) plan.avisos.push(`Fila ${numFila}: ${r.aviso}`);
      if (r.valor !== undefined) v[key] = r.valor;
    }
    if (Object.keys(v).length === 0) { plan.filasVacias += 1; continue; }
    plan.filasLeidas += 1;

    if (v.coordenada_x !== undefined || v.coordenada_y !== undefined) {
      const ok = v.coordenada_x !== undefined && v.coordenada_y !== undefined && esPlausible(v.coordenada_x, v.coordenada_y);
      if (!ok) {
        plan.avisos.push(`Fila ${numFila}: coordenadas UTM incompletas o fuera de España; se dejan en blanco`);
        delete v.coordenada_x;
        delete v.coordenada_y;
      }
    }
    if (derivarResultado(v)) plan.resultadosDerivados += 1;

    const ident = identidad(v);
    let reg = ident ? buscar(registros, v, ident) : null;
    let id;
    if (!reg) {
      const campana = blanco(v.campana) ? '2026' : String(v.campana).trim();
      const semilla = ident
        ? `aguiluchos-${campana}/${ident.campo === 'numeracion' ? 'nido' : 'etiqueta'}/${String(v[ident.campo]).trim()}`
        : `aguiluchos-${campana}/fila/${JSON.stringify(v)}`;
      id = await uuidV5(semilla);
      if (!ident) reg = registros.find((r) => r.id === id) ?? null;
      else if (idsUsados.has(id)) id = crypto.randomUUID();
    }
    if (!reg) {
      idsUsados.add(id);
      reg = { id, datos: { ...base }, cambios: {}, nuevo: true, tocado: true, filaExcel: numFila };
      registros.push(reg);
    }
    reg.tocado = true;
    reg.filaExcel ??= numFila;
    for (const [key, val] of Object.entries(v)) {
      if (igual(reg.datos[key], val)) continue;
      reg.datos[key] = val;
      reg.cambios[key] = val;
    }
  }

  for (const r of registros) {
    if (!r.tocado) continue;
    if (r.nuevo) plan.nuevos.push({ id: r.id, fila: r.datos, filaExcel: r.filaExcel });
    else if (Object.keys(r.cambios).length) plan.actualizar.push({ id: r.id, cambios: r.cambios, filaExcel: r.filaExcel });
    else plan.sinCambios += 1;
  }
  return plan;
}
