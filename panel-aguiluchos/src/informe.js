// Generación de informes técnicos (HTML autocontenido y editable).
// Los datos se calculan a partir de los nidos; el texto redactado es un borrador
// que la persona que firma puede modificar libremente antes de emitir el informe.
import { COLUMNAS, FASES } from './columns.js';
import { estadoReproductivo, googleMapsUrl, posicion, resumen } from './logic.js';
import { agruparPorNivel, ubicacion } from './geo.js';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export const SECCIONES = [
  { id: 'alcance', label: 'Objeto y alcance', defecto: true },
  { id: 'resumen', label: 'Resumen ejecutivo (indicadores)', defecto: true },
  { id: 'especies', label: 'Resultados por especie', defecto: true },
  { id: 'comunidades', label: 'Resultados por comunidad autónoma', defecto: true },
  { id: 'provincias', label: 'Resultados por provincia', defecto: true },
  { id: 'municipios', label: 'Resultados por localidad', defecto: true },
  { id: 'causas', label: 'Causas de fracaso', defecto: true },
  { id: 'intervenciones', label: 'Intervenciones de conservación', defecto: true },
  { id: 'relacion', label: 'Relación de nidos y justificaciones', defecto: true },
  { id: 'conclusiones', label: 'Observaciones y conclusiones', defecto: true },
  { id: 'fichas', label: 'Anexo: fichas técnicas individuales (una por nido)', defecto: false },
];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fechaCorta(d) {
  const x = d instanceof Date ? d : new Date(`${String(d).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(x.getTime())) return '—';
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
}
export const fechaLarga = (d) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

export const pct = (v, dec = 0) => (v == null || Number.isNaN(v) ? 'n/d' : `${(v * 100).toFixed(dec).replace('.', ',')} %`);
export const num = (v, dec = 2) => (v == null || Number.isNaN(v) ? 'n/d' : v.toFixed(dec).replace('.', ','));
const n0 = (v) => (v == null ? 0 : Number(v) || 0);

/** Referencia por defecto del informe: GREFA-AGU-AAAA-MMDD-HHMM. */
export function referenciaPorDefecto(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `GREFA-AGU-${d.getFullYear()}-${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Año de campaña: el de la fecha de incubación más frecuente (o el actual). */
export function anioCampana(nidos, hoy = new Date()) {
  const cuenta = {};
  for (const n of nidos) {
    const y = String(n.fecha_incubacion ?? '').slice(0, 4);
    if (/^\d{4}$/.test(y)) cuenta[y] = (cuenta[y] || 0) + 1;
  }
  const orden = Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
  return orden.length ? orden[0][0] : String(hoy.getFullYear());
}

/** Texto de justificación de conservación de un nido (idéntico al de la app). */
export function justificacion(n) {
  const partes = [];
  if (n.intervencion) {
    const tipos = (n.tipo_acciones_manejo ?? []).length ? n.tipo_acciones_manejo.join(', ') : 'sin especificar';
    partes.push(`Intervención de conservación (${tipos})`);
  }
  if (estadoReproductivo(n) === 'Fracaso') {
    const causa = n.causas_fracaso || 'causa no indicada';
    const est = n.estado_fracaso ? ` (${n.estado_fracaso})` : '';
    partes.push(`Fracaso${est}: ${causa}`);
  }
  const obs = String(n.observaciones_i ?? '').trim();
  if (obs) partes.push(obs.length > 140 ? `${obs.slice(0, 137)}...` : obs);
  return partes.length ? partes.join('. ') : '—';
}

/** Estadísticas agrupadas por una clave (especie, municipio…). */
export function agrupar(nidos, clave) {
  const mapa = new Map();
  for (const n of nidos) {
    const k = n[clave] || 'Sin indicar';
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(n);
  }
  return [...mapa.entries()]
    .map(([nombre, lista]) => ({ nombre, ...resumen(lista) }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Estadísticas por nivel geográfico ('comunidad' | 'provincia' | 'localidad'). */
export function agruparGeo(nidos, nivel) {
  return agruparPorNivel(nidos, nivel).map(([nombre, lista]) => ({ nombre, ...resumen(lista) }));
}

/** Pollos nacidos que no constan ni como volados ni como muertos (nido a nido). */
export function pollosSinDeterminar(nidos) {
  return nidos.reduce((a, n) => (n.num_pollos_nacidos == null
    ? a
    : a + Math.max(0, n.num_pollos_nacidos - n0(n.num_pollos_volados) - n0(n.num_pollos_muertos))), 0);
}

/** Incidencias de calidad del dato que conviene que conozca quien firma. */
export function incidencias(nidos) {
  const out = [];
  const sinCoord = nidos.filter((n) => !posicion(n)).length;
  if (sinCoord) out.push(`${sinCoord} nido(s) sin coordenadas UTM válidas.`);
  const incoherentes = nidos.filter((n) => n.num_pollos_nacidos != null
    && n0(n.num_pollos_volados) + n0(n.num_pollos_muertos) > n.num_pollos_nacidos);
  if (incoherentes.length) {
    out.push(`${incoherentes.length} nido(s) con volados + muertos superiores a los nacidos (${incoherentes.map((n) => n.etiqueta || n.numeracion).slice(0, 8).join(', ')}${incoherentes.length > 8 ? '…' : ''}).`);
  }
  const sinResultado = nidos.filter((n) => estadoReproductivo(n) === 'En curso').length;
  if (sinResultado) out.push(`${sinResultado} nido(s) sin resultado reproductivo cerrado (en curso o pendientes de registrar).`);
  const sinEspecie = nidos.filter((n) => !n.especie).length;
  if (sinEspecie) out.push(`${sinEspecie} nido(s) sin especie indicada.`);
  return out;
}

// ── Bloques de texto (borradores editables) ────────────────────────────────

export function textoAlcance(nidos, o) {
  const especies = [...new Set(nidos.map((n) => n.especie).filter(Boolean))];
  const municipios = [...new Set(nidos.map((n) => n.municipio).filter(Boolean))];
  const ubic = nidos.map(ubicacion);
  const comunidades = [...new Set(ubic.map((u) => u.comunidad).filter((c) => c !== 'Sin indicar'))];
  const provincias = [...new Set(ubic.map((u) => u.provincia).filter((p) => p !== 'Sin indicar'))];
  const filtros = o.filtros ? ` Filtros aplicados: ${o.filtros}.` : ' Sin filtros adicionales (conjunto completo de la campaña).';
  return `El presente informe recoge los resultados del seguimiento reproductor de aguiluchos de la campaña ${o.anio}, desarrollado por GREFA (Grupo para la Rehabilitación de la Fauna Autóctona y su Hábitat), `
    + `a partir de los registros de campo de la base de datos de la campaña, con fecha de corte ${fechaLarga(o.fecha)}. `
    + `Se analizan ${nidos.length} nido(s)${especies.length ? ` de ${especies.join(', ')}` : ''}, localizados en ${municipios.length} localidad(es)${provincias.length ? `, ${provincias.length} provincia(s) (${provincias.join(', ')})` : ''}${comunidades.length ? ` y ${comunidades.length} comunidad(es) autónoma(s) (${comunidades.join(', ')})` : ''}.${filtros}`;
}

export function textoConclusiones(nidos) {
  if (!nidos.length) return 'No hay nidos en el conjunto analizado.';
  const r = resumen(nidos);
  const cerrados = r.exito + r.fracaso;
  const partes = [];
  partes.push(`De los ${r.total} nido(s) analizados, ${r.exito} finalizaron con éxito, ${r.fracaso} fracasaron y ${r.enCurso} no tienen resultado cerrado. `
    + `${cerrados ? `La tasa de éxito sobre nidos con resultado cerrado (${cerrados}) es del ${pct(r.tasaExito)}.` : 'No hay nidos con resultado cerrado, por lo que la tasa de éxito no puede calcularse.'}`);
  if (r.nacidos) {
    partes.push(`Se registraron ${r.nacidos} pollo(s) nacidos, de los que ${r.volados} volaron (${pct(r.volados / r.nacidos)}) y ${r.muertos} murieron (${pct(r.muertos / r.nacidos)}); ${pollosSinDeterminar(nidos)} no constan ni como volados ni como muertos.`);
  }
  if (cerrados) partes.push(`La productividad media es de ${num(r.volados / cerrados)} pollos volados por nido con resultado cerrado.`);
  if (r.causas.length) {
    const [causa, n] = r.causas[0];
    partes.push(`La principal causa de fracaso registrada es «${causa}» (${n} de ${r.fracaso} nidos fracasados, ${pct(n / r.fracaso)}).`);
  }
  const interv = nidos.filter((n) => n.intervencion).length;
  if (interv) {
    const exitoInterv = nidos.filter((n) => n.intervencion && estadoReproductivo(n) === 'Éxito').length;
    partes.push(`Se realizaron actuaciones de conservación en ${interv} nido(s) (${pct(interv / r.total)} del total), ${exitoInterv} de los cuales alcanzaron el éxito reproductivo.`);
  }
  const inc = incidencias(nidos);
  if (inc.length) partes.push(`Calidad del dato: ${inc.join(' ')}`);
  return partes.join(' ');
}

// ── Utilidades HTML ────────────────────────────────────────────────────────

const tabla = (cabs, filas, clases = []) => `<table class="t"><thead><tr>${cabs.map((c, i) => `<th class="${clases[i] ?? ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${
  filas.map((f) => `<tr>${f.map((c, i) => `<td class="${clases[i] ?? ''}">${c ?? ''}</td>`).join('')}</tr>`).join('')
}</tbody></table>`;

const parrafo = (t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`;

function membrete(o) {
  return `<header class="membrete">
    <div><div class="marca">GREFA</div><div class="sub">Grupo para la Rehabilitación de la Fauna Autóctona y su Hábitat</div></div>
    <div class="campana">Campaña Aguilucho cenizo y pálido ${esc(o.anio)}</div>
  </header>`;
}

function portada(o, subtitulo = '') {
  const filas = [
    ['Referencia', o.referencia],
    ['Fecha de emisión', fechaLarga(o.fecha)],
    ['Elaborado por', [o.autor, o.cargo].filter(Boolean).join(' · ') || '—'],
    ['Destinatario', o.destinatario || '—'],
  ];
  return `${membrete(o)}
  <h1>${esc(o.titulo)}</h1>
  ${subtitulo ? `<p class="subtitulo">${esc(subtitulo)}</p>` : ''}
  <table class="meta">${filas.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
}

const seccion = (num_, titulo, cuerpo) => `<section><h2>${num_}. ${esc(titulo)}</h2>${cuerpo}</section>`;

// ── Secciones de datos ─────────────────────────────────────────────────────

function filaGrupo(g) {
  return [esc(g.nombre), g.total, g.exito, g.fracaso, g.enCurso, pct(g.tasaExito), g.nacidos, g.volados, g.muertos];
}
const CABS_GRUPO = (primera) => [primera, 'Nidos', 'Éxito', 'Fracaso', 'En curso', 'Tasa éxito', 'Nacidos', 'Volados', 'Muertos'];
const CLASES_GRUPO = ['', 'n', 'n', 'n', 'n', 'n', 'n', 'n', 'n'];

function seccionResumen(nidos) {
  const r = resumen(nidos);
  const cerrados = r.exito + r.fracaso;
  const interv = nidos.filter((n) => n.intervencion).length;
  const filas = [
    ['Nidos analizados', r.total, 'Nidos del conjunto seleccionado.'],
    ['Nidos con éxito', r.exito, 'Resultado reproductivo «Éxito».'],
    ['Nidos fracasados', r.fracaso, 'Resultado reproductivo «Fracaso».'],
    ['Nidos en curso', r.enCurso, 'Sin resultado reproductivo registrado.'],
    ['Tasa de éxito', pct(r.tasaExito), 'Éxito / (éxito + fracaso); solo nidos con resultado cerrado.'],
    ['Pollos nacidos', r.nacidos, 'Suma de pollos nacidos por nido.'],
    ['Pollos volados', r.volados, 'Suma de pollos volados (incluye pre y post cosecha).'],
    ['Pollos muertos', r.muertos, 'Suma de pollos muertos (pre-cosecha, cosecha y post-cosecha).'],
    ['Pollos sin determinar', pollosSinDeterminar(nidos), 'Nacidos − volados − muertos, nido a nido (mínimo 0).'],
    ['Supervivencia a vuelo', r.nacidos ? pct(r.volados / r.nacidos) : 'n/d', 'Pollos volados / pollos nacidos.'],
    ['Productividad', cerrados ? num(r.volados / cerrados) : 'n/d', 'Pollos volados por nido con resultado cerrado.'],
    ['Nidos con intervención', interv, 'Nidos con actuaciones de conservación (dron, rodal, compensación).'],
  ];
  return tabla(['Indicador', 'Valor', 'Definición'], filas.map(([a, b, c]) => [esc(a), `<b>${esc(b)}</b>`, esc(c)]), ['', 'n', '']);
}

function seccionCausas(nidos) {
  const r = resumen(nidos);
  if (!r.causas.length) return '<p>No constan nidos fracasados en el conjunto analizado.</p>';
  return tabla(['Causa de fracaso', 'Nidos', '% sobre fracasos'],
    r.causas.map(([k, n]) => [esc(k), n, pct(n / r.fracaso)]), ['', 'n', 'n']);
}

function seccionIntervenciones(nidos) {
  const lista = nidos.filter((n) => n.intervencion);
  if (!lista.length) return '<p>No constan intervenciones de conservación en el conjunto analizado.</p>';
  const tipos = {};
  for (const n of lista) for (const t of (n.tipo_acciones_manejo ?? [])) tipos[t] = (tipos[t] || 0) + 1;
  const resumenTipos = Object.entries(tipos).map(([k, v]) => `${k}: ${v}`).join(' · ');
  const filas = lista.map((n) => [
    esc(n.etiqueta || n.numeracion), esc(n.municipio), esc((n.tipo_acciones_manejo ?? []).join(', ') || 'sin especificar'),
    esc(estadoReproductivo(n)), esc(String(n.observaciones_i ?? '').trim().slice(0, 220) || '—'),
  ]);
  return `${parrafo(`${lista.length} nido(s) con intervención${resumenTipos ? ` — ${resumenTipos}` : ''}.`)}${
    tabla(['Nido', 'Municipio', 'Tipo de manejo', 'Resultado', 'Observaciones'], filas)}`;
}

const LEYENDA_MAPA = '<p class="leyenda"><span class="pt" style="background:#2e6b3a"></span> Éxito &nbsp; <span class="pt" style="background:#c0392b"></span> Fracaso &nbsp; <span class="pt" style="background:#e08a1e"></span> En curso</p>';

/**
 * Mapas de localización ya renderizados (imágenes PNG en data URL).
 * @param {{nivel:string, titulo:string, n:number, dataUrl:string}[]} mapas
 */
export function seccionMapas(mapas, sinCoordenadas = 0) {
  const fig = (m) => `<figure class="mapa"><img src="${esc(m.dataUrl)}" alt="${esc(m.titulo)}"><figcaption>${esc(m.titulo)} · ${m.n} nido(s)</figcaption></figure>`;
  const general = mapas.filter((m) => m.nivel === 'general');
  const resto = mapas.filter((m) => m.nivel !== 'general');
  const niveles = [['comunidad', 'Por comunidad autónoma'], ['provincia', 'Por provincia'], ['localidad', 'Por localidad']];
  let html = LEYENDA_MAPA;
  for (const m of general) html += fig(m);
  for (const [nivel, titulo] of niveles) {
    const del = resto.filter((m) => m.nivel === nivel);
    if (!del.length) continue;
    html += `<h3>${titulo}</h3><table class="mapas">`;
    for (let k = 0; k < del.length; k += 2) {
      html += `<tr><td>${fig(del[k])}</td><td>${del[k + 1] ? fig(del[k + 1]) : ''}</td></tr>`;
    }
    html += '</table>';
  }
  if (sinCoordenadas > 0) html += `<p class="nota">${sinCoordenadas} nido(s) sin coordenadas válidas no aparecen en los mapas.</p>`;
  return html;
}

function seccionRelacion(nidos) {
  const filas = nidos.map((n) => [
    esc(n.numeracion), `<b>${esc(n.etiqueta)}</b>`, esc(n.municipio), esc(n.especie),
    esc(n.fecha_incubacion ? fechaCorta(n.fecha_incubacion) : '—'),
    n0(n.num_pollos_nacidos), n0(n.num_pollos_volados), n0(n.num_pollos_muertos),
    esc(estadoReproductivo(n)), esc(justificacion(n)),
  ]);
  return tabla(['Nº', 'Etiqueta', 'Municipio', 'Especie', 'Incubación', 'Nac.', 'Vol.', 'Muer.', 'Resultado', 'Justificación de conservación'],
    filas, ['', '', '', '', '', 'n', 'n', 'n', '', 'just']);
}

// ── Ficha técnica individual ───────────────────────────────────────────────

export function valorCampo(c, v) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return c.tipo === 'bool' ? 'No' : '—';
  if (c.tipo === 'bool') return v ? 'Sí' : 'No';
  if (c.tipo === 'list') return v.join(', ');
  if (c.tipo === 'date') return fechaCorta(v);
  return String(v);
}

export function fichaHtml(n, { nivel = 2 } = {}) {
  const h = `h${nivel}`;
  const p = posicion(n);
  const gm = googleMapsUrl(n);
  const e = estadoReproductivo(n);
  const inc = n.fecha_incubacion ? new Date(`${n.fecha_incubacion}T00:00:00`) : null;
  if (inc) inc.setDate(inc.getDate() + 30);
  const nac = n.num_pollos_nacidos;
  const bloques = FASES.map((f) => {
    const filas = COLUMNAS.filter((c) => c.fase === f.id).map((c) => [esc(c.label), esc(valorCampo(c, n[c.key]))]);
    let extra = '';
    if (f.id === 1 && p) extra = `<p class="nota">Posición WGS84: ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}${gm ? ` · ${esc(gm)}` : ''}</p>`;
    if (f.id === 2 && inc) extra = `<p class="nota">Fecha estimada de eclosión (incubación + 30 días): ${fechaCorta(inc)}.</p>`;
    if (f.id === 4 && nac != null) {
      extra = `<p class="nota">Balance: ${nac} nacidos = ${n0(n.num_pollos_volados)} volados + ${n0(n.num_pollos_muertos)} muertos + ${Math.max(0, nac - n0(n.num_pollos_volados) - n0(n.num_pollos_muertos))} sin determinar.</p>`;
    }
    return `<h3>${esc(f.titulo)}</h3>${tabla(['Campo', 'Valor'], filas)}${extra}`;
  }).join('');
  return `<article class="ficha">
    <${h}>Ficha técnica · ${esc(n.etiqueta || n.numeracion || 'Nido')} <span class="chip ${e === 'Éxito' ? 'exito' : e === 'Fracaso' ? 'fracaso' : 'curso'}">${esc(e)}</span></${h}>
    ${bloques}
    <h3>Justificación de conservación</h3>${parrafo(justificacion(n))}
  </article>`;
}

export function textoConclusionesNido(n) {
  const e = estadoReproductivo(n);
  const partes = [`El nido ${n.etiqueta || n.numeracion || ''}${n.especie ? ` de ${n.especie}` : ''}${n.municipio ? ` (${n.municipio}${n.provincia ? `, ${n.provincia}` : ''})` : ''} presenta resultado reproductivo «${e}».`];
  if (n.num_pollos_nacidos != null) {
    partes.push(`Nacieron ${n.num_pollos_nacidos} pollo(s): ${n0(n.num_pollos_volados)} volaron y ${n0(n.num_pollos_muertos)} murieron.`);
  }
  if (e === 'Fracaso') partes.push(`Causa del fracaso: ${n.causas_fracaso || 'no indicada'}${n.estado_fracaso ? ` (${n.estado_fracaso})` : ''}.`);
  if (n.intervencion) partes.push(`Se realizaron actuaciones de conservación: ${(n.tipo_acciones_manejo ?? []).join(', ') || 'sin especificar'}.`);
  return partes.join(' ');
}

// ── Informe completo ───────────────────────────────────────────────────────

/**
 * Cuerpo HTML del informe de campaña.
 * @param {object[]} nidos
 * @param {{titulo:string, referencia:string, fecha:Date, autor?:string, cargo?:string, destinatario?:string,
 *          filtros?:string, anio?:string, secciones?:string[]}} o
 */
export function construirInforme(nidos, o) {
  const opts = { anio: anioCampana(nidos, o.fecha), ...o };
  const activas = new Set(o.secciones ?? SECCIONES.filter((s) => s.defecto).map((s) => s.id));
  const orden = [...nidos].sort((a, b) => String(a.numeracion ?? '').localeCompare(String(b.numeracion ?? ''), 'es', { numeric: true }));
  let i = 0;
  const bloques = [];
  const add = (id, titulo, cuerpo) => { if (activas.has(id)) bloques.push(seccion(++i, titulo, cuerpo)); };

  add('alcance', 'Objeto y alcance', parrafo(textoAlcance(nidos, opts)));
  add('resumen', 'Resumen ejecutivo', seccionResumen(nidos));
  if (o.mapas?.length) bloques.push(seccion(++i, 'Mapas de localización', seccionMapas(o.mapas, o.sinCoordenadas)));
  add('especies', 'Resultados por especie', tabla(CABS_GRUPO('Especie'), agrupar(nidos, 'especie').map(filaGrupo), CLASES_GRUPO));
  add('comunidades', 'Resultados por comunidad autónoma', tabla(CABS_GRUPO('Comunidad autónoma'), agruparGeo(nidos, 'comunidad').map(filaGrupo), CLASES_GRUPO));
  add('provincias', 'Resultados por provincia', tabla(CABS_GRUPO('Provincia'), agruparGeo(nidos, 'provincia').map(filaGrupo), CLASES_GRUPO));
  add('municipios', 'Resultados por localidad', tabla(CABS_GRUPO('Localidad'), agruparGeo(nidos, 'localidad').map(filaGrupo), CLASES_GRUPO));
  add('causas', 'Causas de fracaso', seccionCausas(nidos));
  add('intervenciones', 'Intervenciones de conservación', seccionIntervenciones(nidos));
  add('relacion', 'Relación de nidos y justificaciones', nidos.length ? seccionRelacion(orden) : '<p>No hay nidos que cumplan los filtros seleccionados.</p>');
  add('conclusiones', 'Observaciones y conclusiones', parrafo(textoConclusiones(nidos)));
  if (activas.has('fichas')) {
    bloques.push(`<section class="anexo"><h2>Anexo. Fichas técnicas individuales</h2>${orden.map((n) => fichaHtml(n, { nivel: 3 })).join('')}</section>`);
  }
  const firma = `<div class="firma"><div>${esc(opts.autor || '')}</div><div class="cargo">${esc(opts.cargo || '')}</div><div class="linea">Firma y sello</div></div>`;
  return `${portada(opts, `${nidos.length} nido(s) analizados`)}${bloques.join('')}${firma}`;
}

/** Cuerpo HTML del informe individual de un nido. */
export function construirInformeNido(n, o) {
  const opts = { anio: anioCampana([n], o.fecha), ...o };
  const cuerpo = `${portada(opts, `Nido ${n.etiqueta || n.numeracion || ''}`)}
    ${o.mapas?.length ? `<h2>Mapa de localización</h2>${seccionMapas(o.mapas)}` : ''}
    ${fichaHtml(n)}
    ${seccion(1, 'Observaciones y conclusiones', parrafo(textoConclusionesNido(n)))}
    <div class="firma"><div>${esc(opts.autor || '')}</div><div class="cargo">${esc(opts.cargo || '')}</div><div class="linea">Firma y sello</div></div>`;
  return cuerpo;
}

export const INFORME_CSS = `
@page { size: A4; margin: 16mm 14mm 18mm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 8pt; color: #555; } }
* { box-sizing: border-box; }
body { font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.4; color: #1d2b22; margin: 0; }
@media screen { body { background: #e6eae7; padding: 18px; } .hoja { background: #fff; max-width: 210mm; margin: 0 auto; padding: 16mm 14mm; box-shadow: 0 2px 14px rgba(0,0,0,.25); } }
.membrete { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #2e5e3a; padding-bottom: 6px; margin-bottom: 14px; }
.marca { font-size: 26pt; font-weight: 700; color: #2e5e3a; line-height: 1; }
.sub { font-size: 7.5pt; color: #333; }
.campana { font-size: 11pt; font-weight: 700; text-align: right; }
h1 { font-size: 17pt; color: #1d3f26; margin: 6px 0 2px; }
.subtitulo { margin: 0 0 8px; color: #555; }
h2 { font-size: 13pt; color: #2e5e3a; border-bottom: 1px solid #c9d6cc; padding-bottom: 2px; margin: 18px 0 8px; break-after: avoid; }
h3 { font-size: 11pt; color: #2e5e3a; margin: 12px 0 4px; break-after: avoid; }
p { margin: 4px 0 8px; text-align: justify; }
.nota { font-size: 9pt; color: #444; margin: 4px 0 8px; text-align: left; }
table { border-collapse: collapse; width: 100%; margin: 4px 0 10px; }
table.meta { width: auto; min-width: 60%; }
table.meta th { text-align: left; padding: 2px 14px 2px 0; color: #555; font-weight: 600; }
table.meta td { padding: 2px 0; }
table.t th { background: #2e5e3a; color: #fff; font-size: 8.5pt; padding: 4px 6px; text-align: left; }
table.t td { border-bottom: 1px solid #d5ddd7; padding: 3px 6px; font-size: 9pt; vertical-align: top; }
table.t tbody tr:nth-child(even) td { background: #f3f6f4; }
th.n, td.n { text-align: right; white-space: nowrap; }
td.just { min-width: 36%; }
tr { break-inside: avoid; }
thead { display: table-header-group; }
.chip { display: inline-block; font-size: 8.5pt; padding: 0 8px; border-radius: 10px; color: #fff; vertical-align: middle; }
.chip.exito { background: #2e6b3a; } .chip.fracaso { background: #c0392b; } .chip.curso { background: #e08a1e; }
.anexo .ficha { break-before: page; }
figure.mapa { margin: 6px 0 10px; break-inside: avoid; }
figure.mapa img { width: 100%; height: auto; border: 1px solid #c9d6cc; }
figure.mapa figcaption { font-size: 8.5pt; color: #444; text-align: center; }
table.mapas { table-layout: fixed; }
table.mapas td { width: 50%; padding: 2px 4px; vertical-align: top; }
.leyenda { font-size: 9pt; text-align: left; }
.pt { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
.firma { margin-top: 36px; width: 55%; break-inside: avoid; }
.firma .cargo { color: #555; font-size: 9.5pt; }
.firma .linea { margin-top: 38px; border-top: 1px solid #333; padding-top: 2px; font-size: 8.5pt; color: #555; }
`;

/** Documento HTML autocontenido (estilos incluidos) listo para editar, imprimir o descargar. */
export function documentoHtml(cuerpo, titulo) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${INFORME_CSS}</style></head><body><div class="hoja">${cuerpo}</div></body></html>`;
}

/** Nombre de archivo seguro a partir de la referencia. */
export function nombreArchivo(referencia, ext) {
  return `${String(referencia || 'informe').replace(/[^\w.-]+/g, '_')}.${ext}`;
}
