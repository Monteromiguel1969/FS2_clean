import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';

import { configurado, exigeLogin, supabase, cargarNidos, guardarNido, borrarNido } from './api.js';
import { COLUMNAS, FASES, ESPECIES, PROYECTOS } from './columns.js';
import { aCsv, estadoReproductivo, filtrar, googleMapsUrl, parseValor, posicion, resumen, validar } from './logic.js';

const app = document.getElementById('app');
const estado = {
  sesion: null,
  nidos: [],
  cargando: false,
  error: null,
  filtro: { texto: '', municipio: '', especie: '', proyecto: '', estado: '' },
  orden: { clave: 'numeracion', asc: true },
  vista: 'tabla',
  mapa: null,
  capa: null,
  intervalo: null,
};

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const COLOR = { Éxito: '#2e6b3a', Fracaso: '#c0392b', 'En curso': '#e08a1e' };
const claseEstado = (e) => (e === 'Éxito' ? 'exito' : e === 'Fracaso' ? 'fracaso' : 'curso');

// ── Arranque ────────────────────────────────────────────────────────────────
async function iniciar() {
  if (!configurado) {
    app.innerHTML = `<div class="login"><h1>Panel GREFA</h1>
      <p>Falta configurar Supabase. Define <code>VITE_SUPABASE_URL</code> y
      <code>VITE_SUPABASE_ANON_KEY</code> (ver README) y vuelve a desplegar.</p></div>`;
    return;
  }
  if (exigeLogin) {
    const { data } = await supabase.auth.getSession();
    estado.sesion = data.session;
    supabase.auth.onAuthStateChange((_ev, s) => {
      const cambio = Boolean(estado.sesion) !== Boolean(s);
      estado.sesion = s;
      if (cambio) arrancarPanel();
    });
  }
  await arrancarPanel();
}

async function arrancarPanel() {
  clearInterval(estado.intervalo);
  if (exigeLogin && !estado.sesion) return pintarLogin();
  pintarPanel();
  await recargar();
  estado.intervalo = setInterval(() => !document.querySelector('dialog[open]') && recargar(), 90_000);
}

// ── Login ───────────────────────────────────────────────────────────────────
function pintarLogin(mensaje = '') {
  app.innerHTML = `
    <form class="login" id="form-login">
      <h1>GREFA · Campaña Aguilucho</h1>
      <p>Inicia sesión con tu usuario del panel.</p>
      <input type="email" name="email" placeholder="Correo electrónico" autocomplete="username" required />
      <input type="password" name="password" placeholder="Contraseña" autocomplete="current-password" required />
      <button class="btn primario" type="submit">Entrar</button>
      <p class="info" style="color:var(--rojo)">${esc(mensaje)}</p>
    </form>`;
  document.getElementById('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const { error } = await supabase.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
    if (error) pintarLogin('Correo o contraseña incorrectos.');
  });
}

// ── Datos ───────────────────────────────────────────────────────────────────
async function recargar() {
  estado.cargando = true;
  estado.error = null;
  actualizarCabecera();
  try {
    estado.nidos = await cargarNidos();
  } catch (e) {
    estado.error = `No se pudieron cargar los datos: ${e.message ?? e}`;
  }
  estado.cargando = false;
  actualizarCabecera();
  pintarContenido();
}

const visibles = () => ordenar(filtrar(estado.nidos, estado.filtro));

function ordenar(lista) {
  const { clave, asc } = estado.orden;
  const val = (n) => (clave === 'estado' ? estadoReproductivo(n) : n[clave]);
  return [...lista].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true });
    return asc ? r : -r;
  });
}

// ── Pintado ─────────────────────────────────────────────────────────────────
function pintarPanel() {
  app.innerHTML = `
    <header class="top">
      <h1>GREFA · Campaña Aguilucho</h1>
      <span class="usuario" id="usuario"></span>
      <span class="usuario" id="estado-carga"></span>
      <button class="btn" id="btn-recargar" title="Volver a leer los datos">Actualizar</button>
      <button class="btn" id="btn-csv">Exportar CSV</button>
      <button class="btn primario" id="btn-nuevo">+ Nuevo nido</button>
      ${exigeLogin ? '<button class="btn" id="btn-salir">Salir</button>' : ''}
    </header>
    <main>
      <div id="aviso"></div>
      <section class="kpis" id="kpis"></section>
      <section class="filtros" id="filtros"></section>
      <nav class="tabs" id="tabs">
        <button data-vista="tabla">Tabla</button>
        <button data-vista="mapa">Mapa</button>
      </nav>
      <div class="grid2">
        <div id="contenido"></div>
        <aside class="tarjeta causas" id="causas"></aside>
      </div>
    </main>
    <dialog id="dlg"></dialog>`;

  document.getElementById('btn-recargar').onclick = recargar;
  document.getElementById('btn-csv').onclick = exportarCsv;
  document.getElementById('btn-nuevo').onclick = () => abrirFicha(null);
  const salir = document.getElementById('btn-salir');
  if (salir) salir.onclick = () => supabase.auth.signOut();
  document.getElementById('tabs').onclick = (ev) => {
    const v = ev.target.dataset?.vista;
    if (v) { estado.vista = v; pintarContenido(); }
  };
  actualizarCabecera();
}

function actualizarCabecera() {
  const u = document.getElementById('usuario');
  if (u) u.textContent = estado.sesion?.user?.email ?? (exigeLogin ? '' : 'Acceso sin login (piloto)');
  const c = document.getElementById('estado-carga');
  if (c) c.textContent = estado.cargando ? 'Cargando…' : `${estado.nidos.length} nidos`;
}

function pintarContenido() {
  const todos = estado.nidos;
  const lista = visibles();
  const r = resumen(lista);

  document.getElementById('aviso').innerHTML = estado.error
    ? `<div class="aviso error">${esc(estado.error)}</div>`
    : '';

  const tasa = r.tasaExito == null ? '—' : `${Math.round(r.tasaExito * 100)} %`;
  document.getElementById('kpis').innerHTML = [
    ['', r.total, 'Nidos'],
    ['ok', r.exito, 'Con éxito'],
    ['mal', r.fracaso, 'Fracaso'],
    ['curso', r.enCurso, 'En curso'],
    ['', tasa, 'Tasa de éxito (cerrados)'],
    ['', r.nacidos, 'Pollos nacidos'],
    ['ok', r.volados, 'Pollos volados'],
    ['mal', r.muertos, 'Pollos muertos'],
  ].map(([c, v, l]) => `<div class="kpi ${c}"><b>${esc(v)}</b><span>${l}</span></div>`).join('');

  pintarFiltros(todos);

  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === estado.vista));

  document.getElementById('causas').innerHTML = `<h3>Causas de fracaso</h3>${
    r.causas.length
      ? r.causas.map(([k, n]) => `<div class="barra">${esc(k)} · <b>${n}</b><div style="width:${(n / r.causas[0][1]) * 100}%"></div></div>`).join('')
      : '<div class="info">Sin fracasos en la selección.</div>'
  }`;

  if (estado.vista === 'mapa') pintarMapa(lista);
  else pintarTabla(lista);
}

function pintarFiltros(todos) {
  const el = document.getElementById('filtros');
  if (el.dataset.listo && document.activeElement?.closest('#filtros')) return;
  const municipios = [...new Set(todos.map((n) => n.municipio).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const opts = (vals, sel) => `<option value="">Todos</option>${vals.map((v) => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;
  const f = estado.filtro;
  el.innerHTML = `
    <input type="search" id="f-texto" placeholder="Buscar etiqueta, propietario, municipio…" value="${esc(f.texto)}" />
    <select id="f-municipio" title="Municipio">${opts(municipios, f.municipio).replace('Todos', 'Municipio: todos')}</select>
    <select id="f-especie" title="Especie">${opts(ESPECIES, f.especie).replace('Todos', 'Especie: todas')}</select>
    <select id="f-proyecto" title="Proyecto">${opts(PROYECTOS, f.proyecto).replace('Todos', 'Proyecto: todos')}</select>
    <select id="f-estado" title="Estado reproductivo">${opts(['Éxito', 'Fracaso', 'En curso'], f.estado).replace('Todos', 'Estado: todos')}</select>
    <button class="btn" id="f-limpiar">Limpiar</button>`;
  el.dataset.listo = '1';
  const enlazar = (id, clave, evento = 'change') =>
    (document.getElementById(id).addEventListener(evento, (ev) => { estado.filtro[clave] = ev.target.value; pintarContenido(); }));
  enlazar('f-texto', 'texto', 'input');
  enlazar('f-municipio', 'municipio');
  enlazar('f-especie', 'especie');
  enlazar('f-proyecto', 'proyecto');
  enlazar('f-estado', 'estado');
  document.getElementById('f-limpiar').onclick = () => {
    estado.filtro = { texto: '', municipio: '', especie: '', proyecto: '', estado: '' };
    el.dataset.listo = '';
    pintarContenido();
  };
}

const TABLA_COLS = [
  ['numeracion', 'Nº'], ['etiqueta', 'Etiqueta'], ['municipio', 'Municipio'], ['especie', 'Especie'],
  ['estado_final', 'Estado final'], ['estado', 'Estado'], ['num_pollos_nacidos', 'Nac.'],
  ['num_pollos_volados', 'Vol.'], ['num_pollos_muertos', 'Muer.'], ['intervencion', 'Interv.'],
];

function pintarTabla(lista) {
  destruirMapa();
  const cont = document.getElementById('contenido');
  if (!lista.length) {
    cont.innerHTML = `<div class="tarjeta vacio">${estado.cargando ? 'Cargando…' : 'No hay nidos con estos filtros.'}</div>`;
    return;
  }
  const flecha = (k) => (estado.orden.clave === k ? (estado.orden.asc ? ' ▲' : ' ▼') : '');
  const filas = lista.slice(0, 1500).map((n) => {
    const e = estadoReproductivo(n);
    return `<tr data-id="${esc(n.id)}">
      <td>${esc(n.numeracion)}</td><td><b>${esc(n.etiqueta)}</b></td><td>${esc(n.municipio)}</td>
      <td>${esc(n.especie)}</td><td>${esc(n.estado_final)}</td>
      <td><span class="chip ${claseEstado(e)}">${e}</span></td>
      <td class="num">${esc(n.num_pollos_nacidos)}</td><td class="num">${esc(n.num_pollos_volados)}</td>
      <td class="num">${esc(n.num_pollos_muertos)}</td>
      <td>${n.intervencion ? '<span class="chip interv">Sí</span>' : ''}</td></tr>`;
  }).join('');
  cont.innerHTML = `<div class="tarjeta tabla-wrap"><table>
    <thead><tr>${TABLA_COLS.map(([k, l]) => `<th data-k="${k}">${l}${flecha(k)}</th>`).join('')}</tr></thead>
    <tbody>${filas}</tbody></table></div>`;
  cont.querySelector('thead').onclick = (ev) => {
    const k = ev.target.dataset?.k;
    if (!k) return;
    estado.orden = { clave: k, asc: estado.orden.clave === k ? !estado.orden.asc : true };
    pintarContenido();
  };
  cont.querySelector('tbody').onclick = (ev) => {
    const id = ev.target.closest('tr')?.dataset.id;
    if (id) abrirFicha(estado.nidos.find((n) => n.id === id));
  };
}

function destruirMapa() {
  if (estado.mapa) { estado.mapa.remove(); estado.mapa = null; }
}

function pintarMapa(lista) {
  const cont = document.getElementById('contenido');
  if (!document.getElementById('mapa')) {
    destruirMapa();
    cont.innerHTML = '<div id="mapa"></div>';
  }
  if (!estado.mapa) {
    estado.mapa = L.map('mapa').setView([40.4, -4.0], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(estado.mapa);
    estado.capa = L.layerGroup().addTo(estado.mapa);
    estado.mapa.on('popupopen', (ev) => {
      ev.popup.getElement()?.querySelector('[data-editar]')?.addEventListener('click', (e) => {
        abrirFicha(estado.nidos.find((n) => n.id === e.target.dataset.editar));
      });
    });
  }
  estado.capa.clearLayers();
  const puntos = [];
  for (const n of lista) {
    const p = posicion(n);
    if (!p) continue;
    const e = estadoReproductivo(n);
    const gm = googleMapsUrl(n);
    L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 2, fillColor: COLOR[e], fillOpacity: 0.95 })
      .bindPopup(`<b>${esc(n.etiqueta || n.numeracion)}</b><br>${esc(n.municipio)} · ${esc(n.especie)}<br>
        <span class="chip ${claseEstado(e)}">${e}</span><br>
        ${gm ? `<a href="${esc(gm)}" target="_blank" rel="noopener">Abrir en Google Maps</a><br>` : ''}
        <a href="#" data-editar="${esc(n.id)}" onclick="return false">Ver ficha</a>`)
      .addTo(estado.capa);
    puntos.push([p.lat, p.lon]);
  }
  if (puntos.length) estado.mapa.fitBounds(puntos, { padding: [30, 30], maxZoom: 12 });
  setTimeout(() => estado.mapa?.invalidateSize(), 50);
}

// ── Ficha (crear / editar) ──────────────────────────────────────────────────
function campoHtml(c, valor) {
  const id = `c-${c.key}`;
  const v = valor ?? '';
  let ctl;
  switch (c.tipo) {
    case 'bool':
      ctl = `<label><input type="checkbox" id="${id}" ${valor ? 'checked' : ''} /> Sí</label>`;
      break;
    case 'list':
      ctl = `<div class="checks">${c.opciones.map((o) => `<label><input type="checkbox" name="${c.key}" value="${esc(o)}" ${(valor ?? []).includes(o) ? 'checked' : ''}/> ${esc(o)}</label>`).join('')}</div>`;
      break;
    case 'select': {
      const extra = v && !c.opciones.includes(v) ? [v] : [];
      ctl = `<select id="${id}"><option value=""></option>${[...c.opciones, ...extra].map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      break;
    }
    case 'area':
      ctl = `<textarea id="${id}">${esc(v)}</textarea>`;
      break;
    case 'int':
      ctl = `<input type="number" min="0" step="1" id="${id}" value="${esc(v)}" />`;
      break;
    case 'num':
      ctl = `<input type="number" step="any" id="${id}" value="${esc(v)}" />`;
      break;
    case 'date':
      ctl = `<input type="date" id="${id}" value="${esc(v)}" />`;
      break;
    default:
      ctl = `<input type="text" id="${id}" value="${esc(v)}" />`;
  }
  const ancho = c.tipo === 'area' || c.tipo === 'list' ? ' ancho' : '';
  return `<div class="campo${ancho}"><label for="${id}">${esc(c.label)}</label>${ctl}</div>`;
}

function leerFormulario(base) {
  const n = { ...base };
  for (const c of COLUMNAS) {
    if (c.tipo === 'list') {
      n[c.key] = [...document.querySelectorAll(`input[name="${c.key}"]:checked`)].map((i) => i.value);
    } else {
      const el = document.getElementById(`c-${c.key}`);
      n[c.key] = parseValor(c, c.tipo === 'bool' ? el.checked : el.value);
    }
  }
  return n;
}

function abrirFicha(nido) {
  const esNuevo = !nido;
  const base = nido ?? { id: crypto.randomUUID(), intervencion: false, vuelan_pollos: false, tipo_acciones_manejo: [] };
  const dlg = document.getElementById('dlg');
  const p = posicion(base);
  dlg.innerHTML = `<form method="dialog" id="form-ficha">
    <div class="dlg-cab"><h2>${esNuevo ? 'Nuevo nido' : `Nido ${esc(base.etiqueta || base.numeracion || '')}`}</h2>
      <button type="button" class="btn" id="dlg-cerrar">Cerrar</button></div>
    <div class="dlg-cuerpo">
      ${FASES.map((f) => `<fieldset><legend>${f.titulo}</legend><div class="campos">
        ${COLUMNAS.filter((c) => c.fase === f.id).map((c) => campoHtml(c, base[c.key])).join('')}</div>
        ${f.id === 1 && p ? `<div class="info">Posición WGS84: ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)} · <a target="_blank" rel="noopener" href="${esc(googleMapsUrl(base))}">Abrir en Google Maps</a></div>` : ''}
        ${f.id === 2 ? '<div class="info" id="eclosion-est"></div>' : ''}
        ${f.id === 4 ? '<div class="info" id="balance"></div>' : ''}
      </fieldset>`).join('')}
    </div>
    <div class="dlg-pie">
      <span class="msg" id="msg"></span>
      ${esNuevo ? '' : '<button type="button" class="btn peligro" id="dlg-borrar">Eliminar</button>'}
      <button type="submit" class="btn primario" id="dlg-guardar">Guardar nido</button>
    </div></form>`;

  const msg = (t) => (document.getElementById('msg').textContent = t);
  const refrescarCalculos = () => {
    const n = leerFormulario(base);
    const inc = n.fecha_incubacion ? new Date(`${n.fecha_incubacion}T00:00:00`) : null;
    if (inc) inc.setDate(inc.getDate() + 30);
    document.getElementById('eclosion-est').textContent = inc
      ? `Fecha estimada de eclosión (incubación + 30 días): ${inc.toLocaleDateString('es-ES', { dateStyle: 'full' })}`
      : '';
    const nac = n.num_pollos_nacidos;
    document.getElementById('balance').textContent = nac == null ? '' :
      `Balance: ${nac} nacidos = ${n.num_pollos_volados ?? 0} volados + ${n.num_pollos_muertos ?? 0} muertos + ${Math.max(0, nac - (n.num_pollos_volados ?? 0) - (n.num_pollos_muertos ?? 0))} sin determinar.`;
  };
  dlg.querySelector('.dlg-cuerpo').addEventListener('input', refrescarCalculos);
  refrescarCalculos();

  document.getElementById('dlg-cerrar').onclick = () => dlg.close();
  const borrar = document.getElementById('dlg-borrar');
  if (borrar) borrar.onclick = async () => {
    if (!confirm('¿Eliminar este nido? Se marcará como borrado y desaparecerá de la app tras sincronizar.')) return;
    try { await borrarNido(base.id); dlg.close(); await recargar(); } catch (e) { msg(`No se pudo eliminar: ${e.message ?? e}`); }
  };
  document.getElementById('form-ficha').onsubmit = async (ev) => {
    ev.preventDefault();
    const n = leerFormulario(base);
    const errores = validar(n);
    if (errores.length) return msg(errores.join(' '));
    document.getElementById('dlg-guardar').disabled = true;
    try {
      const { descartado } = await guardarNido(n, esNuevo);
      if (descartado) alert('Otro operario había guardado una versión más reciente de este nido: se conserva la suya (Last-Write-Wins).');
      dlg.close();
      await recargar();
    } catch (e) {
      msg(`No se pudo guardar: ${e.message ?? e}`);
      document.getElementById('dlg-guardar').disabled = false;
    }
  };
  dlg.showModal();
}

// ── Exportación ─────────────────────────────────────────────────────────────
function exportarCsv() {
  const lista = visibles();
  const blob = new Blob([aCsv(lista)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nidos_aguiluchos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

iniciar();
