// Datos de la presentación: los nidos filtrados (los mismos del informe) listos para
// incrustarlos en el cuaderno de Colab. Sin DOM ni red: se prueba en node.
// No se incluyen datos personales (propietario, teléfono, referencia catastral).
import { SIN_VALOR, estadoReproductivo, posicion, resumen } from './logic.js';
import { tituloMapaGeneral } from './mapa_img.js';
import { FONDOS, FONDO_DEFECTO } from './fondo.js';
import { COLUMNAS, FASES } from './columns.js';
import {
  SECCIONES, agrupar, agruparGeo, anioCampana, fechaCorta, fechaLarga, justificacion, num, pct,
  pollosSinDeterminar, referenciaPorDefecto, textoAlcance, textoConclusiones, valorCampo,
} from './informe.js';

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
// Misma configuración que el informe técnico (secciones, mapas, textos); el resultado es una
// lista de diapositivas «descriptivas» que presentacion_pptx.js dibuja con pptxgenjs.
export const FILAS_TABLA = 11;
export const FILAS_RELACION = 8;
export const MAX_FOTOS = 12;
export const MAX_CANDIDATAS_FOTO = 30;
export const LARGO_TEXTO = 900;
const LARGO_CELDA = 160;
export const COLOR_ESTADO_PPT = { Éxito: '2E6B3A', Fracaso: 'C0392B', 'En curso': 'E08A1E' };
const PERSONALES = new Set(['propietario', 'tlfn', 'referencia_catastral']);
const ESTADOS = ['Éxito', 'Fracaso', 'En curso'];

const celda = (v) => (vacio(v) ? '' : String(v).trim());
const corta = (t, max = LARGO_CELDA) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);
const numCelda = (v) => (v == null || Number.isNaN(v) ? '' : String(v));
const pctCelda = (v) => (v == null || Number.isNaN(v) ? '' : pct(v));
const suma = (nidos, k) => nidos.reduce((a, n) => a + (n[k] ?? 0), 0);

/** Ordena como la relación del informe (numeración natural). */
export const ordenarNidos = (lista) =>
  [...lista].sort((a, b) => String(a.numeracion ?? '').localeCompare(String(b.numeracion ?? ''), 'es', { numeric: true }));

/**
 * Parte un texto en trozos de diapositiva: conserva los párrafos y, si uno solo excede el límite,
 * lo separa por frases.
 */
export function trocearTexto(texto, max = LARGO_TEXTO) {
  const unidades = [];
  for (const p of String(texto ?? '').split(/\n+/).map((x) => x.trim()).filter(Boolean)) {
    if (p.length <= max) { unidades.push(p); continue; }
    for (const fr of p.match(/[^.!?]+[.!?]*\s*/g) ?? [p]) {
      for (let k = 0; k < fr.length; k += max) unidades.push(fr.slice(k, k + max).trim());
    }
  }
  const trozos = [];
  let actual = [];
  let largo = 0;
  for (const u of unidades.filter(Boolean)) {
    if (actual.length && largo + u.length + 1 > max) { trozos.push(actual.join('\n')); actual = []; largo = 0; }
    actual.push(u);
    largo += u.length + 1;
  }
  if (actual.length) trozos.push(actual.join('\n'));
  return trozos;
}

function paginar(base, filas, por = FILAS_TABLA) {
  if (!filas.length) return [{ ...base, filas: [] }];
  const n = Math.ceil(filas.length / por);
  return Array.from({ length: n }, (_, i) => ({
    ...base,
    titulo: n > 1 ? `${base.titulo} (${i + 1}/${n})` : base.titulo,
    filas: filas.slice(i * por, (i + 1) * por),
  }));
}

function textos(titulo, texto) {
  const trozos = trocearTexto(texto);
  if (!trozos.length) return [{ tipo: 'texto', titulo, texto: '' }];
  return trozos.map((t, i) => ({ tipo: 'texto', titulo: trozos.length > 1 ? `${titulo} (${i + 1}/${trozos.length})` : titulo, texto: t }));
}

function graficoEstados(s) {
  const et = ESTADOS.filter((e) => s.some((n) => n.estado === e));
  if (!et.length) return null;
  const cuenta = (e) => s.filter((n) => n.estado === e).length;
  return { tipo: 'grafico', variante: 'pie', titulo: 'Resultado de la nidificación', labels: et.map((e) => `${e} (${cuenta(e)})`),
    series: [{ name: 'Nidos', values: et.map(cuenta) }], colors: et.map((e) => COLOR_ESTADO_PPT[e]) };
}

function graficoTasas(s) {
  for (const [clave, nombre] of [['campana', 'campaña'], ['provincia', 'provincia']]) {
    const g = new Map();
    for (const n of s) {
      const k = texto(n[clave]) ?? 'Sin indicar';
      const c = g.get(k) ?? { exito: 0, fracaso: 0 };
      if (n.estado === 'Éxito') c.exito += 1;
      if (n.estado === 'Fracaso') c.fracaso += 1;
      g.set(k, c);
    }
    const filas = [...g.entries()]
      .map(([k, c]) => ({ k, cerrados: c.exito + c.fracaso, tasa: Math.round((100 * c.exito) / (c.exito + c.fracaso || 1)) }))
      .filter((f) => f.cerrados > 0);
    if (filas.length >= 2) {
      const top = filas.sort((a, b) => a.tasa - b.tasa || a.k.localeCompare(b.k, 'es')).slice(-10);
      return { tipo: 'grafico', variante: 'barra-h', titulo: `Tasa de éxito por ${nombre} (% sobre nidos cerrados)`, labels: top.map((f) => `${f.k} (n=${f.cerrados})`),
        series: [{ name: 'Tasa de éxito (%)', values: top.map((f) => f.tasa) }], colors: [COLOR_ESTADO_PPT.Éxito], maximo: 100 };
    }
  }
  return null;
}

function graficoPollos(s) {
  const series = [['Nacidos', 'nacidos'], ['Volados', 'volados'], ['Muertos', 'muertos']];
  if (!series.some(([, k]) => suma(s, k) > 0)) return null;
  const grupos = [...new Set(s.map((n) => texto(n.campana) ?? 'Total'))].sort();
  return { tipo: 'grafico', variante: 'barra-v', titulo: 'Pollos nacidos, volados y muertos', labels: grupos,
    series: series.map(([name, k]) => ({ name, values: grupos.map((g) => suma(s.filter((n) => (texto(n.campana) ?? 'Total') === g), k)) })),
    colors: ['4A90C2', COLOR_ESTADO_PPT.Éxito, COLOR_ESTADO_PPT.Fracaso], leyenda: true };
}

const CABS_GRUPO = (primera) => [
  { t: primera, w: 3.4 }, { t: 'Nidos', w: 0.9, num: true }, { t: 'Éxito', w: 0.9, num: true }, { t: 'Fracaso', w: 0.9, num: true },
  { t: 'En curso', w: 1, num: true }, { t: 'Tasa éxito', w: 1.2, num: true }, { t: 'Nacidos', w: 1, num: true },
  { t: 'Volados', w: 1, num: true }, { t: 'Muertos', w: 1, num: true },
];
const filaGrupo = (g) => [g.nombre, numCelda(g.total), numCelda(g.exito), numCelda(g.fracaso), numCelda(g.enCurso), pctCelda(g.tasaExito), numCelda(g.nacidos), numCelda(g.volados), numCelda(g.muertos)];

function fichas(orden, fotos) {
  const out = [];
  for (const n of orden) {
    const bloque = (id) => {
      const fase = FASES.find((f) => f.id === id);
      return {
        titulo: fase.titulo,
        filas: COLUMNAS.filter((c) => c.fase === id && !PERSONALES.has(c.key))
          .map((c) => [c.label, corta(vacio(n[c.key]) || (Array.isArray(n[c.key]) && !n[c.key].length) ? '' : valorCampo(c, n[c.key]))]),
      };
    };
    const e = estadoReproductivo(n);
    const titulo = `Ficha técnica · ${n.etiqueta || n.numeracion || 'Nido'} · ${e}`;
    out.push({ tipo: 'ficha', titulo: `${titulo} (1/2)`, izquierda: [bloque(1)], derecha: [bloque(2), bloque(3)] });
    out.push({ tipo: 'ficha', titulo: `${titulo} (2/2)`, izquierda: [bloque(4)], derecha: [], justificacion: justificacion(n) === '—' ? '' : justificacion(n), foto: fotos?.get(n) ?? null });
  }
  return out;
}

/** Nidos con foto pública, en el orden de las fichas: candidatas a descargar. */
export function candidatasFotos(lista) {
  return ordenarNidos(lista)
    .map((n) => ({ nido: n, url: urlsPublicas(n.imagenes_urls)[0] }))
    .filter((c) => c.url)
    .slice(0, MAX_CANDIDATAS_FOTO)
    .map((c) => ({ nido: c.nido, url: c.url, titulo: `Nido ${c.nido.etiqueta || c.nido.numeracion || ''}` }));
}

/**
 * Modelo de la presentación: solo las secciones y los mapas marcados.
 * @param {object[]} lista nidos incluidos (selección del panel o todos)
 * @param {{titulo?:string, referencia?:string, destinatario?:string, autor?:string, cargo?:string, fecha?:Date,
 *          geo?:object, filtros?:string, secciones?:string[], observaciones?:string, mapas?:object[],
 *          sinCoordenadas?:number, fotos?:Map<object,object>, fondo?:string}} op
 */
export function armarPresentacion(lista, op = {}) {
  const fecha = op.fecha ?? new Date();
  const anio = anioCampana(lista, fecha);
  const activas = new Set(op.secciones ?? SECCIONES.filter((s) => s.defecto).map((s) => s.id));
  const base = armarDatosCuaderno(lista, { geo: op.geo, filtros: op.filtros, fecha, fondo: op.fondo });
  const s = base.nidos;
  const r = resumen(lista);
  const orden = ordenarNidos(lista);
  const diapositivas = [];
  let i = 0;
  const titulo = (t) => `${++i}. ${t}`;
  const add = (id, t, fn) => { if (activas.has(id)) diapositivas.push(...fn(titulo(t))); };

  add('alcance', 'Objeto y alcance', (t) => textos(t, textoAlcance(lista, { anio, fecha, filtros: op.filtros ?? '' })));

  add('resumen', 'Resumen ejecutivo', (t) => {
    const cerrados = r.exito + r.fracaso;
    const kpi = (etiqueta, valor, color) => ({ etiqueta, valor: String(valor), color });
    const slides = [{ tipo: 'kpis', titulo: t, items: [
      kpi('Nidos analizados', r.total), kpi('Nidos con éxito', r.exito, COLOR_ESTADO_PPT.Éxito), kpi('Nidos fracasados', r.fracaso, COLOR_ESTADO_PPT.Fracaso),
      kpi('Nidos en curso', r.enCurso, COLOR_ESTADO_PPT['En curso']), kpi('Tasa de éxito', pct(r.tasaExito)), kpi('Pollos nacidos', r.nacidos),
      kpi('Pollos volados', r.volados), kpi('Pollos muertos', r.muertos), kpi('Pollos sin determinar', pollosSinDeterminar(lista)),
      kpi('Supervivencia a vuelo', r.nacidos ? pct(r.volados / r.nacidos) : ''), kpi('Productividad', cerrados ? num(r.volados / cerrados) : ''),
      kpi('Nidos con intervención', lista.filter((n) => n.intervencion).length),
    ] }];
    for (const g of [graficoEstados(s), graficoPollos(s), graficoTasas(s)]) if (g) slides.push({ ...g, titulo: `${t} · ${g.titulo}` });
    return slides;
  });

  if (op.mapas?.length) {
    const t = titulo('Mapas de localización');
    const nivelTxt = { general: 'General', comunidad: 'Comunidad autónoma', provincia: 'Provincia', localidad: 'Localidad' };
    const orden_ = ['general', 'comunidad', 'provincia', 'localidad'];
    for (const m of [...op.mapas].sort((a, b) => orden_.indexOf(a.nivel) - orden_.indexOf(b.nivel))) {
      diapositivas.push({
        tipo: 'mapa', titulo: `${t} · ${nivelTxt[m.nivel] ?? m.nivel}${m.nivel === 'general' ? '' : `: ${m.titulo}`}`,
        dataUrl: m.dataUrl, w: m.ancho ?? 760, h: m.alto ?? 400,
        pie: `${m.titulo} · ${m.n} nido(s) · fondo: ${base.fondo.nombre} · verde = éxito, rojo = fracaso, naranja = en curso${op.sinCoordenadas ? ` · ${op.sinCoordenadas} nido(s) sin coordenadas válidas no aparecen` : ''}`,
      });
    }
  }

  const grupo = (id, t, primera, grupos) => add(id, t, (tt) => paginar({ tipo: 'tabla', titulo: tt, columnas: CABS_GRUPO(primera) }, grupos.map(filaGrupo)));
  grupo('especies', 'Resultados por especie', 'Especie', agrupar(lista, 'especie'));
  grupo('comunidades', 'Resultados por comunidad autónoma', 'Comunidad autónoma', agruparGeo(lista, 'comunidad'));
  grupo('provincias', 'Resultados por provincia', 'Provincia', agruparGeo(lista, 'provincia'));
  grupo('municipios', 'Resultados por localidad', 'Localidad', agruparGeo(lista, 'localidad'));

  add('causas', 'Causas de fracaso', (t) => {
    if (!r.causas.length) return textos(t, 'No constan nidos fracasados en el conjunto analizado.');
    const tabla = paginar({ tipo: 'tabla', titulo: t, columnas: [{ t: 'Causa de fracaso', w: 6 }, { t: 'Nidos', w: 1.5, num: true }, { t: '% sobre fracasos', w: 2, num: true }] },
      r.causas.map(([k, n]) => [k, String(n), pct(n / r.fracaso)]));
    const top = r.causas.slice(0, 8);
    return [...tabla, { tipo: 'grafico', variante: 'barra-h', titulo: `${t} · Gráfico`, labels: top.map(([k]) => k), series: [{ name: 'Nidos', values: top.map(([, n]) => n) }], colors: [COLOR_ESTADO_PPT.Fracaso] }];
  });

  add('intervenciones', 'Intervenciones de conservación', (t) => {
    const con = orden.filter((n) => n.intervencion);
    if (!con.length) return textos(t, 'No constan intervenciones de conservación en el conjunto analizado.');
    return paginar({ tipo: 'tabla', titulo: t, columnas: [{ t: 'Nido', w: 1.3 }, { t: 'Localidad', w: 2.2 }, { t: 'Tipo de manejo', w: 2.4 }, { t: 'Resultado', w: 1.1 }, { t: 'Observaciones', w: 5.3 }] },
      con.map((n) => [celda(n.etiqueta || n.numeracion), celda(n.municipio), (n.tipo_acciones_manejo ?? []).join(', '), estadoReproductivo(n), corta(celda(n.observaciones_i))]), FILAS_RELACION);
  });

  add('relacion', 'Relación de nidos y justificaciones', (t) => paginar({ tipo: 'tabla', titulo: t, compacta: true, columnas: [
    { t: 'Nº', w: 0.5 }, { t: 'Etiqueta', w: 0.9 }, { t: 'Localidad', w: 1.4 }, { t: 'Especie', w: 1.3 }, { t: 'Incub.', w: 0.9 },
    { t: 'Nac.', w: 0.5, num: true }, { t: 'Vol.', w: 0.5, num: true }, { t: 'Muer.', w: 0.5, num: true }, { t: 'Resultado', w: 0.9 }, { t: 'Justificación de conservación', w: 5 },
  ] }, orden.map((n) => {
    const j = justificacion(n);
    return [celda(n.numeracion), celda(n.etiqueta), celda(n.municipio), celda(n.especie), n.fecha_incubacion ? fechaCorta(n.fecha_incubacion) : '',
      numCelda(n.num_pollos_nacidos), numCelda(n.num_pollos_volados), numCelda(n.num_pollos_muertos), estadoReproductivo(n), j === '—' ? '' : corta(j)];
  }), FILAS_RELACION));

  add('conclusiones', 'Observaciones y conclusiones', (t) => textos(t, op.observaciones ?? textoConclusiones(lista)));

  if (activas.has('fichas')) diapositivas.push(...fichas(orden, op.fotos));

  return {
    titulo: op.titulo || `Presentación de seguimiento reproductor · Campaña Aguilucho ${anio}`,
    referencia: op.referencia || referenciaPorDefecto(fecha),
    destinatario: celda(op.destinatario),
    elaboradoPor: [celda(op.autor), celda(op.cargo)].filter(Boolean).join(' · '),
    fecha: fechaLarga(fecha),
    ambito: base.ambito,
    filtros: op.filtros ?? '',
    total: lista.length,
    fondo: base.fondo,
    nombre: nombrePptx(fecha),
    diapositivas,
  };
}
