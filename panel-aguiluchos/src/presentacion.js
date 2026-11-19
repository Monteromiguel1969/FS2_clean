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

// ── Presentación PowerPoint (se genera en el navegador) ─────────────────────
export const FILAS_POR_DIAPOSITIVA = 11;
export const MAX_IMAGENES = 12;
export const MAX_CANDIDATAS_IMAGEN = 30;

const COLUMNAS_TABLA = [
  ['numeracion', 'Nº'], ['etiqueta', 'Etiqueta'], ['proyecto', 'Proyecto'], ['campana', 'Campaña'],
  ['municipio', 'Localidad'], ['provincia', 'Provincia'], ['especie', 'Especie'], ['estado', 'Estado'],
  ['nacidos', 'Nacidos'], ['volados', 'Volados'], ['muertos', 'Muertos'],
];
const OPCIONALES = new Set(['proyecto', 'campana']);
const ESTADOS = ['Éxito', 'Fracaso', 'En curso'];
export const COLOR_ESTADO_PPT = { Éxito: '2E6B3A', Fracaso: 'C0392B', 'En curso': 'E08A1E' };

const suma = (nidos, k) => nidos.reduce((a, n) => a + (n[k] ?? 0), 0);

function grafEstados(nidos) {
  const etiquetas = ESTADOS.filter((e) => nidos.some((n) => n.estado === e));
  if (!etiquetas.length) return null;
  return {
    titulo: 'Resultado de la nidificación',
    labels: etiquetas.map((e) => `${e} (${nidos.filter((n) => n.estado === e).length})`),
    values: etiquetas.map((e) => nidos.filter((n) => n.estado === e).length),
    colors: etiquetas.map((e) => COLOR_ESTADO_PPT[e]),
  };
}

function grafTasas(nidos) {
  for (const [clave, nombre] of [['campana', 'campaña'], ['provincia', 'provincia']]) {
    const g = new Map();
    for (const n of nidos) {
      const k = texto(n[clave]) ?? 'Sin indicar';
      const c = g.get(k) ?? { exito: 0, fracaso: 0 };
      if (n.estado === 'Éxito') c.exito += 1;
      if (n.estado === 'Fracaso') c.fracaso += 1;
      g.set(k, c);
    }
    const filas = [...g.entries()]
      .map(([k, c]) => ({ k, cerrados: c.exito + c.fracaso, tasa: c.exito + c.fracaso ? Math.round((100 * c.exito) / (c.exito + c.fracaso)) : null }))
      .filter((f) => f.cerrados > 0);
    if (filas.length >= 2) {
      const top = filas.sort((a, b) => a.tasa - b.tasa || a.k.localeCompare(b.k, 'es')).slice(-10);
      return { titulo: `Tasa de éxito por ${nombre} (% sobre nidos cerrados)`, labels: top.map((f) => `${f.k} (n=${f.cerrados})`), values: top.map((f) => f.tasa) };
    }
  }
  const exito = nidos.filter((n) => n.estado === 'Éxito').length;
  const cerrados = exito + nidos.filter((n) => n.estado === 'Fracaso').length;
  if (!cerrados) return null;
  return { titulo: 'Tasa de éxito (% sobre nidos cerrados)', labels: [`Todos los nidos (n=${cerrados})`], values: [Math.round((100 * exito) / cerrados)] };
}

function grafPollos(nidos) {
  const series = [['Nacidos', 'nacidos'], ['Volados', 'volados'], ['Muertos', 'muertos']];
  if (!series.some(([, k]) => suma(nidos, k) > 0)) return null;
  const grupos = [...new Set(nidos.map((n) => texto(n.campana) ?? 'Total'))].sort();
  return {
    titulo: 'Pollos nacidos, volados y muertos',
    labels: grupos,
    series: series.map(([name, k]) => ({ name, values: grupos.map((g) => suma(nidos.filter((n) => (texto(n.campana) ?? 'Total') === g), k)) })),
    colors: ['4A90C2', COLOR_ESTADO_PPT.Éxito, COLOR_ESTADO_PPT.Fracaso],
  };
}

function grafCausas(nidos) {
  const c = new Map();
  for (const n of nidos.filter((x) => x.estado === 'Fracaso')) {
    const k = texto(n.causas_fracaso) ?? 'Sin causa indicada';
    c.set(k, (c.get(k) ?? 0) + 1);
  }
  if (!c.size) return null;
  const top = [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { titulo: 'Causas de fracaso', labels: top.map(([k]) => k), values: top.map(([, v]) => v) };
}

/**
 * Todo lo que se pinta en el .pptx, salvo el mapa y las fotos (que se capturan aparte).
 * Parte de los datos saneados del cuaderno: sin propietario, teléfono ni ref. catastral.
 * @param {object[]} lista nidos filtrados (visibles(), igual que el informe)
 */
export function armarPresentacion(lista, op = {}) {
  const base = armarDatosCuaderno(lista, op);
  const nidos = base.nidos;
  const cuenta = (e) => nidos.filter((n) => n.estado === e).length;
  const cerrados = cuenta('Éxito') + cuenta('Fracaso');
  const columnas = COLUMNAS_TABLA.filter(([k]) => !OPCIONALES.has(k) || nidos.some((n) => !vacio(n[k])));
  const filas = nidos.map((n) => columnas.map(([k]) => (vacio(n[k]) ? '' : String(n[k]).trim())));
  const por = op.filasPorDiapositiva ?? FILAS_POR_DIAPOSITIVA;
  const paginas = [];
  for (let i = 0; i < filas.length; i += por) paginas.push(filas.slice(i, i + por));
  const causas = grafCausas(nidos);

  return {
    titulo: 'Seguimiento reproductor · Campaña Aguilucho',
    ambito: base.ambito,
    filtros: base.filtros,
    fecha: base.fecha,
    nombre: nombrePptx(op.fecha ?? new Date()),
    fondo: base.fondo,
    total: nidos.length,
    totales: [
      { etiqueta: 'Nidos', valor: String(nidos.length) },
      { etiqueta: 'Con éxito', valor: String(cuenta('Éxito')) },
      { etiqueta: 'Fracaso', valor: String(cuenta('Fracaso')) },
      { etiqueta: 'En curso', valor: String(cuenta('En curso')) },
      { etiqueta: 'Tasa de éxito (cerrados)', valor: cerrados ? `${Math.round((100 * cuenta('Éxito')) / cerrados)} %` : '—' },
      { etiqueta: 'Pollos nacidos', valor: String(suma(nidos, 'nacidos')) },
      { etiqueta: 'Pollos volados', valor: String(suma(nidos, 'volados')) },
      { etiqueta: 'Pollos muertos', valor: String(suma(nidos, 'muertos')) },
    ],
    graficos: { estados: grafEstados(nidos), tasas: grafTasas(nidos), pollos: grafPollos(nidos), causas },
    conCoordenadas: nidos.filter((n) => n.lat != null).length,
    imagenes: nidos
      .filter((n) => n.imagenes.length)
      .slice(0, MAX_CANDIDATAS_IMAGEN)
      .map((n) => ({
        url: n.imagenes[0],
        titulo: `Nido ${n.etiqueta ?? n.numeracion ?? ''} · ${n.municipio ?? ''}`.trim(),
        subtitulo: [n.provincia, n.campana, n.estado].filter(Boolean).join(' · '),
      })),
    tabla: { columnas: columnas.map(([, l]) => l), paginas },
  };
}
