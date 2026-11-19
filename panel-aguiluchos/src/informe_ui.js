// Interfaz de emisión de informes: configuración → borrador editable → PDF / Word.
import {
  SECCIONES, anioCampana, construirInforme, construirInformeNido, documentoHtml, esc, nombreArchivo,
  referenciaPorDefecto, textoConclusiones,
} from './informe.js';
import { crearPresentacionUI } from './presentacion_ui.js';
import { agruparPorNivel } from './geo.js';
import { posicion } from './logic.js';
import { generarMapas, tituloMapaGeneral } from './mapa_img.js';
import { guardarFondo, htmlSelectorFondo, leerFondo } from './fondo.js';
import { ayudaBtn } from './ayuda.js';

const CLAVE_FIRMA = 'aguiluchos.informeFirma';

function leerFirma() {
  try { return JSON.parse(localStorage.getItem(CLAVE_FIRMA) ?? '{}'); } catch { return {}; }
}
function guardarFirma(f) {
  try { localStorage.setItem(CLAVE_FIRMA, JSON.stringify(f)); } catch { /* sin almacenamiento */ }
}

/** Guarda un archivo preguntando dónde (si el navegador lo permite) o lo descarga. */
export async function guardarArchivo(contenido, nombre, mime, ext) {
  const blob = new Blob([contenido], { type: mime });
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const h = await window.showSaveFilePicker({
        suggestedName: nombre,
        types: [{ description: ext.toUpperCase(), accept: { [mime.split(';')[0]]: [`.${ext}`] } }],
      });
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      return h.name;
    } catch (e) {
      if (e?.name === 'AbortError') return null; // el usuario canceló
      // cualquier otro fallo: se cae a la descarga normal
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return nombre;
}

/**
 * Diálogo de configuración del informe técnico; con `formato: 'pptx'` es el mismo cuadro
 * (mismas secciones, mapas y datos de firma) pero descarga directamente una presentación PowerPoint.
 * @param {{dlg:HTMLDialogElement, seleccion:object[], todos:object[], filtros:string, geo?:object, alCambiarFondo?:(id:string)=>void, email:string, nido?:object|null, formato?:'informe'|'pptx'}} ctx
 */
export function abrirInformesUI(ctx) {
  const { dlg } = ctx;
  const pptx = ctx.formato === 'pptx';
  const nido = pptx ? null : ctx.nido;
  const firma = leerFirma();
  const hoy = new Date();
  const nombreAutor = firma.autor ?? (ctx.email ? ctx.email.split('@')[0].replace(/[._]/g, ' ') : '');

  const anio = anioCampana(nido ? [nido] : ctx.seleccion, hoy);
  const tituloDef = nido
    ? `Informe técnico del nido ${nido.etiqueta || nido.numeracion || ''}`
    : pptx
      ? `Presentación de seguimiento reproductor · Campaña Aguilucho ${anio}`
      : `Informe técnico de seguimiento reproductor · Campaña Aguilucho ${anio}`;

  const pintarConfig = () => {
    dlg.innerHTML = `<form method="dialog" id="inf-form" class="inf-config">
      <div class="dlg-cab"><h2>${nido ? `Informe del nido ${esc(nido.etiqueta || nido.numeracion || '')}` : pptx ? 'Crear presentación PowerPoint' : 'Emitir informe técnico'}</h2>${ayudaBtn(pptx ? 'presentacion' : 'informes')}
        <button type="button" class="btn" id="inf-cerrar">Cerrar</button></div>
      <div class="dlg-cuerpo">
        <p class="info">${pptx
          ? 'Los datos y cifras se calculan automáticamente. La presentación solo incluye lo que marques abajo y se <b>descarga directamente</b> como archivo .pptx; el texto de observaciones lo puedes editar aquí antes de generarla.'
          : 'Los datos y cifras se calculan automáticamente; el texto es un borrador que podrás <b>editar libremente</b> antes de emitir el informe (PDF o Word).'}</p>
        ${nido ? '' : `
        <div class="campo ancho"><label for="inf-ambito">Nidos incluidos</label>
          <select id="inf-ambito">
            <option value="seleccion">Selección actual del panel (${ctx.seleccion.length} nidos${ctx.filtros ? ` · ${esc(ctx.filtros)}` : ''})</option>
            <option value="todos">Todos los nidos de la campaña (${ctx.todos.length})</option>
          </select></div>`}
        <div class="campos">
          <div class="campo ancho"><label for="inf-titulo">Título</label><input type="text" id="inf-titulo" value="${esc(tituloDef)}" /></div>
          <div class="campo"><label for="inf-ref">Referencia</label><input type="text" id="inf-ref" value="${esc(referenciaPorDefecto(hoy))}" /></div>
          <div class="campo"><label for="inf-dest">Destinatario (opcional)</label><input type="text" id="inf-dest" value="${esc(firma.destinatario ?? '')}" /></div>
          <div class="campo"><label for="inf-autor">Elaborado por</label><input type="text" id="inf-autor" value="${esc(nombreAutor)}" /></div>
          <div class="campo"><label for="inf-cargo">Cargo (opcional)</label><input type="text" id="inf-cargo" value="${esc(firma.cargo ?? '')}" /></div>
        </div>
        ${nido ? '' : `
        <fieldset><legend>${pptx ? 'Secciones de la presentación' : 'Secciones del informe'}</legend>
          <div class="checks">${SECCIONES.map((s) => `<label><input type="checkbox" name="inf-sec" value="${s.id}" ${s.defecto ? 'checked' : ''}/> ${esc(s.label)}</label>`).join('')}</div>
        </fieldset>
        <fieldset><legend>Mapas de localización</legend>
          <div class="checks">
            <label><input type="checkbox" name="inf-mapa" value="general" checked/> General (encuadrado en los nidos del informe)</label>
            <label><input type="checkbox" name="inf-mapa" value="comunidad"/> Por comunidades autónomas</label>
            <label><input type="checkbox" name="inf-mapa" value="provincia"/> Por provincias</label>
            <label><input type="checkbox" name="inf-mapa" value="localidad"/> Por localidades</label>
          </div>
          <div>${htmlSelectorFondo(leerFondo(), 'inf-fondo')}</div>
          <div class="info">Se genera un mapa por grupo, con los nidos coloreados por resultado, sobre el fondo elegido: mapa (OpenStreetMap) u ortofoto (PNOA); con conexión, sin ella solo se dibujan los puntos. Más niveles = más mapas y más tiempo.</div>
        </fieldset>
        ${pptx ? `<div class="campo ancho"><label for="inf-obs">Observaciones y conclusiones (texto editable)</label>
          <textarea id="inf-obs" rows="7">${esc(textoConclusiones(ctx.seleccion))}</textarea></div>` : ''}`}
      </div>
      <div class="dlg-pie">
        <span class="msg" id="inf-msg"></span>
        <button type="submit" class="btn primario" id="inf-generar">${pptx ? 'Descargar PowerPoint' : 'Generar borrador'}</button>
      </div></form>`;
    document.getElementById('inf-cerrar').onclick = () => dlg.close();
    const selFondo = document.getElementById('inf-fondo');
    if (selFondo) selFondo.onchange = () => { guardarFondo(selFondo.value); ctx.alCambiarFondo?.(selFondo.value); };
    const obs = document.getElementById('inf-obs');
    const ambitoSel = document.getElementById('inf-ambito');
    if (obs && ambitoSel) {
      obs.oninput = () => { obs.dataset.editado = '1'; };
      ambitoSel.onchange = () => {
        if (!obs.dataset.editado) obs.value = textoConclusiones(ambitoSel.value === 'todos' ? ctx.todos : ctx.seleccion);
      };
    }
    document.getElementById('inf-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const aviso = (t) => { document.getElementById('inf-msg').textContent = t; };
      const boton = document.getElementById('inf-generar');
      const val = (id) => document.getElementById(id).value.trim();
      const opciones = {
        titulo: val('inf-titulo') || tituloDef,
        referencia: val('inf-ref') || referenciaPorDefecto(hoy),
        destinatario: val('inf-dest'),
        autor: val('inf-autor'),
        cargo: val('inf-cargo'),
        fecha: hoy,
        filtros: ctx.filtros,
      };
      guardarFirma({ autor: opciones.autor, cargo: opciones.cargo, destinatario: opciones.destinatario });
      let cuerpo;
      boton.disabled = true;
      try {
      if (nido) {
        let mapas = [];
        if (posicion(nido)) {
          aviso('Generando el mapa de localización…');
          mapas = await generarMapas([nido], { general: true }, agruparPorNivel, undefined, undefined, leerFondo());
          mapas.forEach((m) => { m.titulo = nido.etiqueta || nido.numeracion || 'Nido'; });
        }
        cuerpo = construirInformeNido(nido, { ...opciones, mapas });
      } else {
        const lista = document.getElementById('inf-ambito').value === 'todos' ? ctx.todos : ctx.seleccion;
        const secciones = [...document.querySelectorAll('input[name="inf-sec"]:checked')].map((i) => i.value);
        if (!secciones.length) {
          document.getElementById('inf-msg').textContent = 'Selecciona al menos una sección.';
          return;
        }
        if (!lista.length) {
          document.getElementById('inf-msg').textContent = 'No hay nidos en el ámbito elegido.';
          return;
        }
        const niveles = Object.fromEntries(
          [...document.querySelectorAll('input[name="inf-mapa"]')].map((i) => [i.value, i.checked]),
        );
        if (pptx) {
          const todos = lista === ctx.todos;
          await crearPresentacionUI({
            lista,
            opciones: { ...opciones, filtros: todos ? '' : ctx.filtros, geo: todos ? {} : ctx.geo, observaciones: document.getElementById('inf-obs').value.trim() },
            secciones,
            niveles,
            fondo: leerFondo(),
            tituloGeneral: todos ? 'Todos los nidos' : tituloMapaGeneral(ctx.geo),
            aviso,
          });
          return;
        }
        let mapas = [];
        if (Object.values(niveles).some(Boolean)) {
          mapas = await generarMapas(lista, niveles, agruparPorNivel, (h, t) => aviso(`Generando mapas de localización (${h}/${t})…`),
            lista === ctx.todos ? 'Todos los nidos' : tituloMapaGeneral(ctx.geo), leerFondo());
        }
        cuerpo = construirInforme(lista, {
          ...opciones,
          filtros: lista === ctx.todos ? '' : ctx.filtros,
          secciones,
          mapas,
          sinCoordenadas: lista.filter((n) => !posicion(n)).length,
        });
      }
      pintarEditor(documentoHtml(cuerpo, opciones.titulo), opciones);
      } catch (e) {
        aviso(`No se pudo generar ${pptx ? 'la presentación' : 'el informe'}: ${e.message ?? e}`);
      } finally {
        boton.disabled = false; // si el editor ya sustituyó el formulario, no tiene efecto
      }
    };
  };

  const pintarEditor = (html, opciones) => pintarEditorHtml(dlg, html, opciones, pintarConfig);

  pintarConfig();
  dlg.showModal();
}

/**
 * Editor de un documento HTML (edición libre en pantalla; PDF por impresión, Word y HTML).
 * lVolver es opcional: si se indica, aparece el botón «Volver».
 */
export function pintarEditorHtml(dlg, html, opciones, alVolver = null) {
  dlg.innerHTML = `<div class="inf-editor">
    <div class="dlg-cab"><h2>${esc(opciones.titulo)}</h2>${ayudaBtn(opciones.ayuda ?? 'informe-editor')}<button type="button" class="btn" id="inf-cerrar">Cerrar</button></div>
    <div class="inf-barra">
      <span class="grupo">
        <button type="button" class="btn" data-cmd="bold" title="Negrita"><b>N</b></button>
        <button type="button" class="btn" data-cmd="italic" title="Cursiva"><i>K</i></button>
        <button type="button" class="btn" data-cmd="underline" title="Subrayado"><u>S</u></button>
        <button type="button" class="btn" data-cmd="insertUnorderedList" title="Lista con viñetas">• Lista</button>
        <button type="button" class="btn" data-cmd="undo" title="Deshacer">↶</button>
        <button type="button" class="btn" data-cmd="redo" title="Rehacer">↷</button>
      </span>
      <span class="grupo">
        ${alVolver ? '<button type="button" class="btn" id="inf-volver" title="Volver atrás (se perderán las ediciones)">← Volver</button>' : ''}
        <button type="button" class="btn primario" id="inf-pdf" title="Abre el diálogo de impresión: elige «Guardar como PDF»">Imprimir / PDF</button>
        <button type="button" class="btn" id="inf-word" title="Documento editable en Word / LibreOffice">Descargar Word</button>
        <button type="button" class="btn" id="inf-html" title="Archivo HTML autocontenido">Descargar HTML</button>
      </span>
    </div>
    <div class="inf-ayuda">Haz clic en cualquier parte del documento para editarlo (textos, tablas, justificaciones, conclusiones).</div>
    <iframe id="inf-frame" title="Borrador del informe"></iframe>
    <div class="dlg-pie"><span class="msg ok" id="inf-msg"></span></div>
  </div>`;
  const frame = document.getElementById('inf-frame');
  const msg = (t, error = false) => {
    const el = document.getElementById('inf-msg');
    el.textContent = t;
    el.classList.toggle('ok', !error);
  };
  frame.srcdoc = html;
  frame.addEventListener('load', () => { frame.contentDocument.designMode = 'on'; }, { once: true });

  const doc = () => frame.contentDocument;
  const htmlActual = () => `<!DOCTYPE html>${doc().documentElement.outerHTML}`;

  document.getElementById('inf-cerrar').onclick = () => dlg.close();
  const volver = document.getElementById('inf-volver');
if (volver) volver.onclick = () => {
    if (confirm('Volverás atrás y se perderán las ediciones hechas en este borrador. ¿Continuar?')) alVolver();
  };
  dlg.querySelectorAll('[data-cmd]').forEach((b) => {
    b.onmousedown = (ev) => ev.preventDefault(); // no pierde la selección del iframe
    b.onclick = () => { frame.contentWindow.focus(); doc().execCommand(b.dataset.cmd); };
  });
  document.getElementById('inf-pdf').onclick = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };
  document.getElementById('inf-word').onclick = async () => {
    const inner = doc().documentElement.innerHTML;
    const word = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">${inner}</html>`;
    const r = await guardarArchivo(`\ufeff${word}`, nombreArchivo(opciones.referencia, 'doc'), 'application/msword', 'doc');
    if (r) msg(`Guardado: ${r}`);
  };
  document.getElementById('inf-html').onclick = async () => {
    const r = await guardarArchivo(htmlActual(), nombreArchivo(opciones.referencia, 'html'), 'text/html;charset=utf-8', 'html');
    if (r) msg(`Guardado: ${r}`);
  };
}
