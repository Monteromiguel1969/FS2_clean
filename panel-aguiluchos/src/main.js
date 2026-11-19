import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';

import {
  configurado, exigeLogin, supabase, cargarNidos, guardarNido, borrarNido, suscribirCambios,
  registrar, recuperarClave, cambiarClave, detectarCampana, tieneCampana, columnasActivas, aplicarImportacion,
} from './api.js';
import { FASES, ESPECIES } from './columns.js';
import { abrirExportarCsvUI } from './exportar_ui.js';
import { crearPresentacionUI } from './presentacion_ui.js';
import { FONDOS, guardarFondo, htmlSelectorFondo, leerFondo } from './fondo.js';
import { abrirImportarUI } from './importar_ui.js';
import { opcionesCascada } from './geo.js';
import { abrirInformesUI } from './informe_ui.js';
import { crearControlador, puntoSemaforo } from './contratos_ui.js';
import { ayudaBtn, iniciarAyuda } from './ayuda.js';
import { FILTROS_CONTRATO, SEMAFORO, grupoSemaforo } from './contratos_logic.js';
import {
  aplicarCambio, estadoReproductivo, filtrar, googleMapsUrl, parseValor, posicion, resumen, validar,
  opcionesProyectoCampana, SIN_VALOR,
  correoPermitido, esAdmin, validarClave, DOMINIO, MIN_CLAVE,
} from './logic.js';

const app = document.getElementById('app');
const estado = {
  sesion: null,
  nidos: [],
  cargando: false,
  error: null,
  filtro: { texto: '', pais: '', comunidad: '', provincia: '', localidad: '', especie: '', proyecto: '', campana: '', estado: '', contrato: '' },
  contratos: null,
  colorMapa: 'resultado',
  fondo: leerFondo(),
  capaBase: null,
  orden: { clave: 'numeracion', asc: true },
  vista: 'tabla',
  mapa: null,
  capa: null,
  intervalo: null,
  // Tiempo real (Supabase Realtime): 'conectando' | 'SUBSCRIBED' | otro = caído.
  vivo: 'conectando',
  cancelarVivo: null,
  pintado: null,
  ciclos: 0,
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
  estado.cancelarVivo?.();
  estado.cancelarVivo = null;
  if (exigeLogin && !estado.sesion) return pintarLogin();
  pintarPanel();
  await recargar();
  iniciarTiempoReal();
  // Red de seguridad: sin tiempo real se relee cada 90 s; con él, cada 6 min
  // (por si se perdió algún evento durante una reconexión).
  estado.ciclos = 0;
  estado.intervalo = setInterval(() => {
    if (document.querySelector('dialog[open]')) return;
    estado.ciclos += 1;
    if (estado.vivo !== 'SUBSCRIBED' || estado.ciclos % 4 === 0) recargar();
  }, 90_000);
}

// ── Tiempo real ─────────────────────────────────────────────────────────────
function iniciarTiempoReal() {
  estado.vivo = 'conectando';
  pintarIndicadorVivo();
  estado.cancelarVivo = suscribirCambios({
    onEvento: (ev) => {
      estado.nidos = aplicarCambio(estado.nidos, ev);
      // Agrupa ráfagas (p. ej. una sincronización de la app con muchos nidos).
      clearTimeout(estado.pintado);
      estado.pintado = setTimeout(() => {
        actualizarCabecera();
        pintarContenido();
      }, 200);
    },
    onEstado: (s) => {
      const recuperado = s === 'SUBSCRIBED' && estado.vivo !== 'conectando' && estado.vivo !== 'SUBSCRIBED';
      estado.vivo = s;
      pintarIndicadorVivo();
      // Tras una caída puede haberse perdido algo: se relee una vez.
      if (recuperado) recargar();
    },
  });
}

function pintarIndicadorVivo() {
  const el = document.getElementById('en-vivo');
  if (!el) return;
  const ok = estado.vivo === 'SUBSCRIBED';
  el.className = `en-vivo ${ok ? 'ok' : estado.vivo === 'conectando' ? 'espera' : 'caido'}`;
  el.textContent = ok ? '● En vivo' : estado.vivo === 'conectando' ? '○ Conectando…' : '○ Sin tiempo real (se actualiza cada 90 s)';
  el.title = ok
    ? 'Los cambios de la app de campo aparecen al instante'
    : 'Realtime no está disponible: el panel relee los datos periódicamente';
}

// ── Login ───────────────────────────────────────────────────────────────────
/** modo: 'entrar' | 'registro' | 'recuperar'. `aviso` (verde) y `mensaje` (rojo) son opcionales. */
function pintarLogin(mensaje = '', modo = 'entrar', aviso = '') {
  const titulos = {
    entrar: 'Inicia sesión con tu usuario del panel.',
    registro: `Crea tu cuenta con tu correo ${DOMINIO}.`,
    recuperar: 'Te enviaremos un enlace para elegir una contraseña nueva.',
  };
  const boton = { entrar: 'Entrar', registro: 'Crear cuenta', recuperar: 'Enviar enlace' }[modo];
  app.innerHTML = `
    <form class="login" id="form-login">
      <h1>GREFA · Campaña Aguilucho</h1>
      <p>${titulos[modo]}</p>
      ${modo === 'registro' ? '<input type="text" name="nombre" placeholder="Nombre completo" autocomplete="name" required />' : ''}
      <input type="email" name="email" placeholder="${modo === 'registro' ? `nombre${DOMINIO}` : 'Correo electrónico'}" autocomplete="username" required />
      ${modo !== 'recuperar' ? `<input type="password" name="password" placeholder="Contraseña${modo === 'registro' ? ` (mínimo ${MIN_CLAVE})` : ''}" autocomplete="${modo === 'registro' ? 'new-password' : 'current-password'}" required />` : ''}
      ${modo === 'registro' ? '<input type="password" name="password2" placeholder="Repite la contraseña" autocomplete="new-password" required />' : ''}
      <button class="btn primario" type="submit">${boton}</button>
      ${modo === 'entrar' ? `
        <button class="btn" type="button" data-modo="recuperar">He olvidado mi contraseña</button>
        <button class="btn" type="button" data-modo="registro">Crear cuenta (${DOMINIO})</button>` : '<button class="btn" type="button" data-modo="entrar">Volver a iniciar sesión</button>'}
      <p class="info" style="color:var(--rojo)">${esc(mensaje)}</p>
      <p class="info" style="color:var(--verde)">${esc(aviso)}</p>
      <button class="btn" type="button" data-ayuda="acceso">? Ayuda para acceder</button>
    </form>`;
  document.querySelectorAll('[data-modo]').forEach((b) => (b.onclick = () => pintarLogin('', b.dataset.modo)));
  document.getElementById('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const email = String(f.get('email') ?? '');
    const clave = String(f.get('password') ?? '');
    const boton = ev.target.querySelector('button[type=submit]');
    try {
      if (modo === 'registro') {
        if (!correoPermitido(email)) return pintarLogin(`Solo se admiten correos ${DOMINIO}.`, modo);
        const errClave = validarClave(clave);
        if (errClave) return pintarLogin(errClave, modo);
        if (clave !== f.get('password2')) return pintarLogin('Las contraseñas no coinciden.', modo);
        boton.disabled = true;
        const conSesion = await registrar({ nombre: String(f.get('nombre')), email, clave });
        if (!conSesion) {
          pintarLogin('', 'entrar', 'Cuenta creada. Te hemos enviado un correo: abre el enlace para confirmarla y después inicia sesión aquí.');
        }
      } else if (modo === 'recuperar') {
        boton.disabled = true;
        await recuperarClave(email);
        pintarLogin('', 'entrar', 'Si el correo tiene cuenta, te hemos enviado un enlace para elegir una contraseña nueva. Revisa también el spam.');
      } else {
        boton.disabled = true;
        const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
        if (error) pintarLogin(/confirm/i.test(error.message) ? 'El correo todavía no está confirmado. Abre el enlace que te enviamos.' : 'Correo o contraseña incorrectos.', modo);
      }
    } catch (e) {
      pintarLogin(e.message ?? String(e), modo);
    }
  });
}

function abrirCambioClave() {
  const dlg = document.getElementById('dlg');
  dlg.innerHTML = `<form method="dialog" id="form-clave" style="padding:20px;min-width:300px">
    <h2>Cambiar contraseña ${ayudaBtn('cambiar-clave')}</h2>
    <div class="campo"><label for="clave-nueva">Contraseña nueva (mínimo ${MIN_CLAVE})</label><input type="password" id="clave-nueva" autocomplete="new-password" required /></div>
    <div class="campo"><label for="clave-repite">Repite la contraseña</label><input type="password" id="clave-repite" autocomplete="new-password" required /></div>
    <p class="info" id="clave-msg" style="color:var(--rojo)"></p>
    <div class="dlg-pie"><button type="button" class="btn" id="clave-cancelar">Cancelar</button>
      <button type="submit" class="btn primario" id="clave-guardar">Cambiar</button></div></form>`;
  const msg = (t, ok = false) => {
    const el = document.getElementById('clave-msg');
    el.style.color = ok ? 'var(--verde)' : 'var(--rojo)';
    el.textContent = t;
  };
  document.getElementById('clave-cancelar').onclick = () => dlg.close();
  document.getElementById('form-clave').onsubmit = async (ev) => {
    ev.preventDefault();
    const nueva = document.getElementById('clave-nueva').value;
    const err = validarClave(nueva);
    if (err) return msg(err);
    if (nueva !== document.getElementById('clave-repite').value) return msg('Las contraseñas no coinciden.');
    document.getElementById('clave-guardar').disabled = true;
    try {
      await cambiarClave(nueva);
      msg('Contraseña cambiada correctamente.', true);
      setTimeout(() => dlg.close(), 1200);
    } catch (e) {
      msg(e.message ?? String(e));
      document.getElementById('clave-guardar').disabled = false;
    }
  };
  dlg.showModal();
}

/** El panel sin login (piloto) no distingue usuarios; con login solo el administrador elimina. */
const puedeEliminar = () => !exigeLogin || esAdmin(estado.sesion?.user?.email);

// ── Datos ───────────────────────────────────────────────────────────────────
async function recargar() {
  estado.cargando = true;
  estado.error = null;
  actualizarCabecera();
  const cargaContratos = estado.contratos?.cargar();
  try {
    await detectarCampana();
    estado.nidos = await cargarNidos();
  } catch (e) {
    estado.error = `No se pudieron cargar los datos: ${e.message ?? e}`;
  }
  await cargaContratos;
  estado.cargando = false;
  actualizarCabecera();
  pintarContenido();
}

const contratosActivos = () => Boolean(estado.contratos?.disponible);

function visibles() {
  let lista = filtrar(estado.nidos, estado.filtro);
  if (estado.filtro.contrato && contratosActivos()) {
    const est = estado.contratos.estados();
    lista = lista.filter((n) => grupoSemaforo(est.get(n.id)?.codigo) === estado.filtro.contrato);
  }
  return ordenar(lista);
}

function ordenar(lista) {
  const { clave, asc } = estado.orden;
  const est = clave === 'contrato' && contratosActivos() ? estado.contratos.estados() : null;
  const val = (n) => (clave === 'estado' ? estadoReproductivo(n) : est ? (est.get(n.id)?.codigo ?? 'zz') : n[clave]);
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
  estado.contratos = crearControlador({
    obtenerNidos: () => estado.nidos,
    email: estado.sesion?.user?.email ?? '',
    esAdmin: puedeEliminar(),
    alCambiar: () => pintarContenido(),
  });
  app.innerHTML = `
    <header class="top">
      <h1>GREFA · Campaña Aguilucho</h1>
      <span class="usuario" id="usuario"></span>
      <span class="usuario" id="estado-carga"></span>
      <span class="en-vivo espera" id="en-vivo"></span>
      <button class="btn" id="btn-recargar" title="Volver a leer los datos">Actualizar</button>
      <button class="btn" id="btn-mapa" title="Ver todos los nidos en el mapa; al pinchar uno se abre su tarjeta">Mapa de nidos</button>
      ${htmlSelectorFondo(estado.fondo, 'sel-fondo')}
      <button class="btn" id="btn-csv" title="Elegir los campos y descargar los nidos de la selección">Exportar CSV</button>
      <button class="btn" id="btn-importar" title="Importar nidos desde un Excel (.xlsx): cabeceras en la primera fila">Importar Excel</button>
      <input type="file" id="archivo-excel" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden />
      <button class="btn" id="btn-informes" title="Emitir informes técnicos editables (PDF / Word)">Informes</button>
      <button class="btn" id="btn-presentacion" title="Descargar una presentación PowerPoint (.pptx) con los nidos filtrados">Presentación</button>
      <button class="btn" id="btn-contratos" title="Parcelas, propietarios y convenios firmados">Contratos</button>
      <button class="btn primario" id="btn-nuevo">+ Nuevo nido</button>
      <button class="btn" id="btn-ayuda" data-ayuda="inicio" title="Manual de ayuda (tecla F1)">Ayuda</button>
      ${exigeLogin ? '<button class="btn" id="btn-clave">Cambiar contraseña</button><button class="btn" id="btn-salir">Salir</button>' : ''}
    </header>
    <main>
      <div id="aviso"></div>
      <section class="kpis" id="kpis"></section>
      <section class="filtros" id="filtros"></section>
      <nav class="tabs" id="tabs">
        <button data-vista="tabla">Tabla</button>
        <button data-vista="mapa">Mapa</button>
        <span class="tabs-ayuda" id="tabs-ayuda"></span>
      </nav>
      <div class="grid2">
        <div id="contenido"></div>
        <aside class="tarjeta causas" id="causas"></aside>
      </div>
    </main>
    <dialog id="dlg"></dialog>
    <dialog id="dlg-informe" class="informe-dlg"></dialog>`;

  document.getElementById('btn-recargar').onclick = recargar;
  document.getElementById('sel-fondo').onchange = (ev) => aplicarFondo(ev.target.value);
  document.getElementById('btn-csv').onclick = exportarCsv;
  const selector = document.getElementById('archivo-excel');
  document.getElementById('btn-importar').onclick = () => selector.click();
  selector.onchange = () => {
    const archivo = selector.files[0];
    selector.value = '';
    if (archivo) importarExcel(archivo);
  };
  document.getElementById('btn-informes').onclick = () => abrirInformes();
  document.getElementById('btn-presentacion').onclick = presentacion;
  document.getElementById('btn-contratos').onclick = () => estado.contratos.abrir();
  document.getElementById('btn-mapa').onclick = () => {
    estado.vista = 'mapa';
    pintarContenido();
    document.getElementById('contenido')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  document.getElementById('btn-nuevo').onclick = () => abrirFicha(null);
  const salir = document.getElementById('btn-salir');
  if (salir) salir.onclick = () => supabase.auth.signOut();
  const clave = document.getElementById('btn-clave');
  if (clave) clave.onclick = abrirCambioClave;
  document.getElementById('tabs').onclick = (ev) => {
    const v = ev.target.dataset?.vista;
    if (v) { estado.vista = v; pintarContenido(); }
  };
  actualizarCabecera();
  pintarIndicadorVivo();
}

function actualizarCabecera() {
  const u = document.getElementById('usuario');
  if (u) {
    const mail = estado.sesion?.user?.email;
    u.textContent = mail ? `${mail}${esAdmin(mail) ? ' · administrador' : ''}` : (exigeLogin ? '' : 'Acceso sin login (piloto)');
  }
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
  ].map(([c, v, l]) => `<div class="kpi ${c}"><b>${esc(v)}</b><span>${l}</span></div>`).join('')
    + `<span class="ayuda-flot">${ayudaBtn('indicadores')}</span>`;
  document.getElementById('tabs-ayuda').innerHTML = ayudaBtn(estado.vista === 'mapa' ? 'mapa' : 'tabla');

  pintarFiltros(todos);

  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === estado.vista));

  document.getElementById('causas').innerHTML = `<h3>Causas de fracaso ${ayudaBtn('causas')}</h3>${
    r.causas.length
      ? r.causas.map(([k, n]) => `<div class="barra">${esc(k)} · <b>${n}</b><div style="width:${(n / r.causas[0][1]) * 100}%"></div></div>`).join('')
      : '<div class="info">Sin fracasos en la selección.</div>'
  }`;

  if (estado.vista === 'mapa') pintarMapa(lista);
  else pintarTabla(lista);
}

const FILTRO_VACIO = { texto: '', pais: '', comunidad: '', provincia: '', localidad: '', especie: '', proyecto: '', campana: '', estado: '', contrato: '' };

function pintarFiltros(todos) {
  const el = document.getElementById('filtros');
  if (el.dataset.listo && document.activeElement?.closest('#filtros')) return;
  const f = estado.filtro;
  const cas = opcionesCascada(todos, f);
  // Si la selección de un nivel ya no existe tras cambiar el superior, se limpia.
  if (f.comunidad && !cas.comunidades.includes(f.comunidad)) f.comunidad = '';
  if (f.provincia && !cas.provincias.includes(f.provincia)) f.provincia = '';
  if (f.localidad && !cas.localidades.includes(f.localidad)) f.localidad = '';
  const opts = (vals, sel, todosTxt) => `<option value="">${todosTxt}</option>${vals.map((v) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('')}`;
  const pc = opcionesProyectoCampana(todos, f);
  if (f.campana && f.campana !== SIN_VALOR && !pc.campanas.valores.includes(f.campana)) f.campana = '';
  const optsSin = ({ valores, sin }, sel, todosTxt, sinTxt) =>
    opts(valores, sel, todosTxt) + (sin ? `<option value="${SIN_VALOR}" ${sel === SIN_VALOR ? 'selected' : ''}>${sinTxt}</option>` : '');
  el.innerHTML = `
    <input type="search" id="f-texto" placeholder="Buscar etiqueta, propietario, localidad…" value="${esc(f.texto)}" />
    <select id="f-pais" title="País">${opts(cas.paises, f.pais, 'País: todos')}</select>
    <select id="f-comunidad" title="Comunidad autónoma">${opts(cas.comunidades, f.comunidad, 'Comunidad: todas')}</select>
    <select id="f-provincia" title="Provincia">${opts(cas.provincias, f.provincia, 'Provincia: todas')}</select>
    <select id="f-localidad" title="Localidad">${opts(cas.localidades, f.localidad, 'Localidad: todas')}</select>
    <select id="f-especie" title="Especie">${opts(ESPECIES, f.especie, 'Especie: todas')}</select>
    <select id="f-proyecto" title="Proyecto (línea de trabajo)">${optsSin(pc.proyectos, f.proyecto, 'Proyecto: todos', 'Sin proyecto')}</select>
    ${tieneCampana() ? `<select id="f-campana" title="Campaña (tanda dentro del proyecto)">${optsSin(pc.campanas, f.campana, 'Campaña: todas', 'Sin campaña')}</select>` : ''}
    <select id="f-estado" title="Estado reproductivo">${opts(['Éxito', 'Fracaso', 'En curso'], f.estado, 'Estado: todos')}</select>
    ${contratosActivos() ? `<select id="f-contrato" title="Contrato de la parcela (campaña del nido)"><option value="">Contrato: todos</option>${Object.entries(FILTROS_CONTRATO).map(([k, l]) => `<option value="${k}" ${k === f.contrato ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
    <button class="btn" id="f-limpiar">Limpiar</button>${ayudaBtn('filtros')}`;
  el.dataset.listo = '1';
  // Al cambiar un nivel geográfico se reinician los inferiores y se repinta la cascada.
  const NIVELES = ['pais', 'comunidad', 'provincia', 'localidad'];
  const enlazar = (id, clave, evento = 'change') =>
    (document.getElementById(id).addEventListener(evento, (ev) => {
      estado.filtro[clave] = ev.target.value;
      if (clave === 'proyecto') {
        estado.filtro.campana = '';
        el.dataset.listo = '';
      }
      const i = NIVELES.indexOf(clave);
      if (i >= 0) {
        for (const inferior of NIVELES.slice(i + 1)) estado.filtro[inferior] = '';
        el.dataset.listo = '';
      }
      pintarContenido();
    }));
  enlazar('f-texto', 'texto', 'input');
  for (const n of NIVELES) enlazar(`f-${n}`, n);
  enlazar('f-especie', 'especie');
  enlazar('f-proyecto', 'proyecto');
  if (document.getElementById('f-campana')) enlazar('f-campana', 'campana');
  enlazar('f-estado', 'estado');
  if (document.getElementById('f-contrato')) enlazar('f-contrato', 'contrato');
  document.getElementById('f-limpiar').onclick = () => {
    estado.filtro = { ...FILTRO_VACIO };
    el.dataset.listo = '';
    pintarContenido();
  };
}
const TABLA_COLS = [
  ['numeracion', 'Nº'], ['etiqueta', 'Etiqueta'], ['municipio', 'Localidad'], ['provincia', 'Provincia'], ['especie', 'Especie'],
  ['estado_final', 'Estado final'], ['estado', 'Estado'], ['num_pollos_nacidos', 'Nac.'],
  ['num_pollos_volados', 'Vol.'], ['num_pollos_muertos', 'Muer.'], ['intervencion', 'Interv.'],
];

function columnasTabla() {
  return TABLA_COLS.flatMap((c) => (c[0] === 'estado' && contratosActivos() ? [c, ['contrato', 'Contrato']] : [c]));
}

function pintarTabla(lista) {
  destruirMapa();
  const cont = document.getElementById('contenido');
  const est = contratosActivos() ? estado.contratos.estados() : null;
  if (!lista.length) {
    cont.innerHTML = `<div class="tarjeta vacio">${estado.cargando ? 'Cargando…' : 'No hay nidos con estos filtros.'}</div>`;
    return;
  }
  const flecha = (k) => (estado.orden.clave === k ? (estado.orden.asc ? ' ▲' : ' ▼') : '');
  const filas = lista.slice(0, 1500).map((n) => {
    const e = estadoReproductivo(n);
    return `<tr data-id="${esc(n.id)}">
      <td>${esc(n.numeracion)}</td><td><b>${esc(n.etiqueta)}</b></td><td>${esc(n.municipio)}</td><td>${esc(n.provincia)}</td>
      <td>${esc(n.especie)}</td><td>${esc(n.estado_final)}</td>
      <td><span class="chip ${claseEstado(e)}">${e}</span></td>${est ? `<td>${puntoSemaforo(est.get(n.id)?.codigo)}</td>` : ''}
      <td class="num">${esc(n.num_pollos_nacidos)}</td><td class="num">${esc(n.num_pollos_volados)}</td>
      <td class="num">${esc(n.num_pollos_muertos)}</td>
      <td>${n.intervencion ? '<span class="chip interv">Sí</span>' : ''}</td></tr>`;
  }).join('');
  cont.innerHTML = `<div class="tarjeta tabla-wrap"><table>
    <thead><tr>${columnasTabla().map(([k, l]) => `<th data-k="${k}">${l}${flecha(k)}</th>`).join('')}</tr></thead>
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

function ponerCapaBase() {
  if (!estado.mapa) return;
  const f = FONDOS[estado.fondo];
  if (estado.capaBase) estado.mapa.removeLayer(estado.capaBase);
  estado.capaBase = L.tileLayer(f.plantilla, { maxZoom: f.zoomMax, attribution: f.atribucion }).addTo(estado.mapa);
  estado.capaBase.bringToBack();
}

/** Cambia el fondo (Mapa / Ortofoto) del mapa del panel y de los informes, y lo recuerda. */
function aplicarFondo(id) {
  if (!guardarFondo(id) && !FONDOS[id]) return;
  estado.fondo = id;
  for (const sel of ['sel-fondo', 'inf-fondo']) {
    const el = document.getElementById(sel);
    if (el) el.value = id;
  }
  ponerCapaBase();
}

function destruirMapa() {
  if (estado.mapa) { estado.mapa.remove(); estado.mapa = null; }
  estado.huellaMapa = '';
}

function pintarMapa(lista) {
  const cont = document.getElementById('contenido');
  if (!document.getElementById('mapa')) {
    destruirMapa();
    cont.innerHTML = `<div class="mapa-barra"><span class="info" id="mapa-info"></span>
      <label id="mapa-color-w" class="info" hidden>Color: <select id="mapa-color"><option value="resultado">Resultado de la nidificación</option><option value="contrato">Contrato de la parcela</option></select></label></div><div id="mapa"></div>`;
  }
  if (!estado.mapa) {
    estado.mapa = L.map('mapa').setView([40.4, -4.0], 6);
    estado.capaBase = null;
    ponerCapaBase();
    estado.capa = L.layerGroup().addTo(estado.mapa);
  }
  estado.capa.clearLayers();
  const puntos = [];
  const est = contratosActivos() ? estado.contratos.estados() : null;
  if (!est) estado.colorMapa = 'resultado';
  const porContrato = estado.colorMapa === 'contrato';
  const selColor = document.getElementById('mapa-color');
  document.getElementById('mapa-color-w').hidden = !est;
  selColor.value = estado.colorMapa;
  selColor.onchange = () => { estado.colorMapa = selColor.value; pintarContenido(); };
  for (const n of lista) {
    const p = posicion(n);
    if (!p) continue;
    const e = estadoReproductivo(n);
    // Al pinchar un nido se abre directamente su tarjeta completa (ficha).
    const cod = est?.get(n.id)?.codigo;
    const color = porContrato && cod ? SEMAFORO[cod].color : COLOR[e];
    L.circleMarker([p.lat, p.lon], { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 })
      .bindTooltip(`<b>${esc(n.etiqueta || n.numeracion || 'Nido')}</b><br>${esc(n.municipio)} · ${esc(n.especie)} · ${e}${cod ? `<br>${esc(SEMAFORO[cod].etiqueta)}` : ''}`, { direction: 'top' })
      .on('click', () => abrirFicha(estado.nidos.find((x) => x.id === n.id)))
      .addTo(estado.capa);
    puntos.push([p.lat, p.lon]);
  }
  const info = document.getElementById('mapa-info');
  if (info) {
    const sin = lista.length - puntos.length;
    info.textContent = `${puntos.length} nidos ubicados en el mapa${sin > 0 ? ` · ${sin} sin coordenadas` : ''}. Pincha en uno para abrir su tarjeta completa.${porContrato ? ' Color: verde = contrato firmado, naranja = pendiente o a punto de caducar, rojo = sin contrato, gris = sin parcela.' : ''}`;
  }
  // Solo se reencuadra cuando cambia el conjunto de puntos (no en cada refresco en vivo).
  const huella = puntos.length ? `${puntos.length}|${lista.map((n) => n.id).join(',')}` : '';
  if (puntos.length && huella !== estado.huellaMapa) {
    estado.huellaMapa = huella;
    estado.mapa.fitBounds(puntos, { padding: [30, 30], maxZoom: puntos.length === 1 ? 14 : 13 });
  }
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
  for (const c of columnasActivas()) {
    if (c.tipo === 'list') {
      n[c.key] = [...document.querySelectorAll(`input[name="${c.key}"]:checked`)].map((i) => i.value);
    } else {
      const el = document.getElementById(`c-${c.key}`);
      n[c.key] = parseValor(c, c.tipo === 'bool' ? el.checked : el.value);
    }
  }
  return n;
}

const CLAVE_MODO_FICHA = 'aguiluchos.fichaModo';
function leerModoFicha() {
  try { return localStorage.getItem(CLAVE_MODO_FICHA) === 'fases' ? 'fases' : 'completa'; } catch { return 'completa'; }
}
function guardarModoFicha(m) {
  try { localStorage.setItem(CLAVE_MODO_FICHA, m); } catch { /* almacenamiento no disponible */ }
}

function abrirFicha(nido) {
  const esNuevo = !nido;
  const base = nido ?? { id: crypto.randomUUID(), intervencion: false, vuelan_pollos: false, tipo_acciones_manejo: [] };
  const dlg = document.getElementById('dlg');
  const p = posicion(base);
  dlg.innerHTML = `<form method="dialog" id="form-ficha">
    <div class="dlg-cab"><h2>${esNuevo ? 'Nuevo nido' : `Nido ${esc(base.etiqueta || base.numeracion || '')}`}</h2>
      ${ayudaBtn(esNuevo ? 'nuevo-nido' : 'ficha')}<button type="button" class="btn" id="dlg-cerrar">Cerrar</button></div>
    <div class="dlg-vista" id="dlg-vista">
      <span>Presentación:</span>
      <button type="button" data-modo="completa">Completa</button>
      <button type="button" data-modo="fases">Por fases</button>
    </div>
    <div class="fase-tabs" id="fase-tabs">
      ${FASES.map((f) => `<button type="button" data-fase="${f.id}">${esc(f.titulo)}</button>`).join('')}
    </div>
    ${esNuevo ? '' : '<div class="bloque-contrato" id="bloque-contrato" hidden></div>'}
    <div class="dlg-cuerpo" id="dlg-cuerpo">
      ${FASES.map((f) => `<fieldset data-fase="${f.id}"><legend>${f.titulo}</legend><div class="campos">
        ${columnasActivas().filter((c) => c.fase === f.id).map((c) => campoHtml(c, base[c.key])).join('')}</div>
        ${f.id === 1 && p ? `<div class="info">Posición WGS84: ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)} · <a target="_blank" rel="noopener" href="${esc(googleMapsUrl(base))}">Abrir en Google Maps</a></div>` : ''}
        ${f.id === 2 ? '<div class="info" id="eclosion-est"></div>' : ''}
        ${f.id === 4 ? '<div class="info" id="balance"></div>' : ''}
      </fieldset>`).join('')}
    </div>
    <div class="dlg-pie">
      <span class="msg" id="msg"></span>
      ${esNuevo ? '' : '<button type="button" class="btn" id="dlg-informe-nido" title="Emitir informe técnico editable de este nido">Informe del nido</button>'}
      ${esNuevo || !puedeEliminar() ? '' : '<button type="button" class="btn peligro" id="dlg-borrar">Eliminar</button>'}
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

  // Presentación: toda la ficha seguida ("completa") o una pestaña por fase.
  // Todos los campos permanecen en el DOM, así que guardar funciona igual en ambos modos.
  let modo = leerModoFicha();
  let faseActiva = FASES[0].id;
  const pintarVista = () => {
    const cuerpo = document.getElementById('dlg-cuerpo');
    cuerpo.classList.toggle('modo-fases', modo === 'fases');
    document.getElementById('fase-tabs').hidden = modo !== 'fases';
    document.querySelectorAll('#dlg-vista button').forEach((b) => b.classList.toggle('activa', b.dataset.modo === modo));
    document.querySelectorAll('#fase-tabs button').forEach((b) => b.classList.toggle('activa', Number(b.dataset.fase) === faseActiva));
    cuerpo.querySelectorAll('fieldset').forEach((fs) => fs.classList.toggle('activa', Number(fs.dataset.fase) === faseActiva));
    cuerpo.scrollTop = 0;
  };
  document.getElementById('dlg-vista').onclick = (ev) => {
    const m = ev.target.dataset?.modo;
    if (!m) return;
    modo = m;
    guardarModoFicha(m);
    pintarVista();
  };
  document.getElementById('fase-tabs').onclick = (ev) => {
    const f = Number(ev.target.dataset?.fase);
    if (!f) return;
    faseActiva = f;
    pintarVista();
  };
  pintarVista();
  const bloque = document.getElementById('bloque-contrato');
  if (bloque && contratosActivos()) {
    bloque.hidden = false;
    estado.contratos.bloqueFicha(bloque, base);
  }

  document.getElementById('dlg-cerrar').onclick = () => dlg.close();
  const informeNido = document.getElementById('dlg-informe-nido');
  if (informeNido) informeNido.onclick = () => { dlg.close(); abrirInformes({ nido: base }); };
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

// ── Informes técnicos editables ─────────────────────────────────────────────
function describirFiltros() {
  const f = estado.filtro;
  return [
    f.texto && `texto «${f.texto}»`,
    f.pais && `país: ${f.pais}`,
    f.comunidad && `comunidad: ${f.comunidad}`,
    f.provincia && `provincia: ${f.provincia}`,
    f.localidad && `localidad: ${f.localidad}`,
    f.especie && `especie: ${f.especie}`,
    f.proyecto && `proyecto: ${f.proyecto === SIN_VALOR ? 'sin proyecto' : f.proyecto}`,
    f.campana && `campaña: ${f.campana === SIN_VALOR ? 'sin campaña' : f.campana}`,
    f.estado && `estado: ${f.estado}`,
    f.contrato && `contrato: ${FILTROS_CONTRATO[f.contrato]}`,
  ].filter(Boolean).join('; ');
}

async function presentacion() {
  const boton = document.getElementById('btn-presentacion');
  const msg = document.getElementById('estado-carga');
  boton.disabled = true;
  try {
    await crearPresentacionUI({
      lista: visibles(),
      geo: estado.filtro,
      filtros: describirFiltros(),
      fondo: estado.fondo,
      aviso: (t) => { msg.textContent = t; },
    });
  } catch (e) {
    msg.textContent = `No se pudo crear la presentación: ${e.message ?? e}`;
    return;
  } finally {
    boton.disabled = false;
  }
  setTimeout(() => { if (msg.isConnected) actualizarCabecera(); }, 6000);
}

function abrirInformes(op = {}) {
  abrirInformesUI({
    dlg: document.getElementById('dlg-informe'),
    seleccion: visibles(),
    todos: estado.nidos,
    filtros: describirFiltros(),
    geo: estado.filtro,
    alCambiarFondo: aplicarFondo,
    email: estado.sesion?.user?.email ?? '',
    nido: op.nido ?? null,
  });
}

// ── Exportación ─────────────────────────────────────────────────────────────
function exportarCsv() {
  abrirExportarCsvUI({
    dlg: document.getElementById('dlg'),
    lista: visibles(),
    columnas: columnasActivas(),
    filtros: describirFiltros(),
  });
}

function importarExcel(archivo) {
  abrirImportarUI({
    dlg: document.getElementById('dlg'),
    archivo,
    nidos: estado.nidos,
    columnas: columnasActivas(),
    tieneCampana: tieneCampana(),
    aplicar: aplicarImportacion,
    alTerminar: recargar,
  });
}

iniciarAyuda();
iniciar();
