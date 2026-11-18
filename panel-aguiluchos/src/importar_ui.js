import { leerHoja } from './importar_xlsx.js';
import { planificarImportacion } from './importar.js';

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const MAX_AVISOS = 30;

// Hace visibles los caracteres invisibles de una cabecera (BOM, NBSP…) para poder diagnosticar.
const visible = (t) => [...String(t)].map((c) => (/[\u0000-\u001f\u007f-\u009f\u00a0\u200b-\u200f\u2028\u2029\ufeff]/.test(c) ? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}` : c)).join('');

const lista = (items) => (items.length ? `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '');

function vistaPrevia(plan, archivo, { tieneCampana }) {
  const c = plan.cabeceras;
  const notas = [];
  notas.push(plan.trae.proyecto ? 'El fichero trae <b>Proyecto</b>: se asigna a los nidos que lo indiquen.' : 'El fichero no trae columna <b>Proyecto</b>: no se toca.');
  if (!tieneCampana) notas.push('La tabla aún no tiene la columna <b>campana</b> (falta ejecutar <code>migracion_campana.sql</code> en Supabase): la campaña no se importa.');
  else notas.push(plan.trae.campana ? 'El fichero trae <b>Campaña</b>: se asigna a los nidos que la indiquen.' : 'El fichero no trae columna <b>Campaña</b>: no se toca.');
  const avisos = plan.avisos.slice(0, MAX_AVISOS);
  return `
    <p class="info">Fichero: <b>${esc(archivo.name)}</b> · ${plan.filasLeidas} filas con datos${plan.filasVacias ? ` (${plan.filasVacias} vacías ignoradas)` : ''}.</p>
    <div class="kpis imp-kpis">
      <div class="kpi ok"><b>${plan.nuevos.length}</b><span>Nidos nuevos</span></div>
      <div class="kpi curso"><b>${plan.actualizar.length}</b><span>Nidos a completar</span></div>
      <div class="kpi"><b>${plan.sinCambios}</b><span>Sin cambios</span></div>
    </div>
    <p class="info">Solo se rellenan celdas con valor. Las celdas vacías o las columnas que faltan dejan el campo como está (en blanco si es nuevo). <b>No se borra ningún nido</b> que no venga en el fichero.</p>
    <ul>${notas.map((n) => `<li>${n}</li>`).join('')}</ul>
    ${plan.resultadosDerivados ? `<p class="info">${plan.resultadosDerivados} filas sin «Resultado reproductivo»: se ha deducido del «Estado final».</p>` : ''}
    <details><summary>Columnas reconocidas (${c.reconocidas.length})</summary>${lista(c.reconocidas.map((r) => `${visible(r.cabecera)} → ${r.key}`))}</details>
    <details><summary>Columnas del fichero ignoradas (${c.ignoradas.length})</summary>${lista(c.ignoradas.map(visible))}</details>
    <details><summary>Campos del formulario que el fichero no trae (${c.sinColumna.length})</summary>${lista(c.sinColumna)}</details>
    ${avisos.length ? `<div class="aviso"><b>Avisos (${plan.avisos.length})</b>${lista(avisos)}${plan.avisos.length > MAX_AVISOS ? `<div class="info">… y ${plan.avisos.length - MAX_AVISOS} más.</div>` : ''}</div>` : ''}`;
}

/** Diálogo «Importar Excel»: lee, enseña qué haría y, al confirmar, lo aplica. */
export async function abrirImportarUI({ dlg, archivo, nidos, columnas, tieneCampana, aplicar, alTerminar }) {
  const cerrar = () => dlg.close();
  const marco = (cuerpo, pie = '') => {
    dlg.innerHTML = `<form method="dialog" id="form-imp">
      <div class="dlg-cab"><h2>Importar Excel</h2><button type="button" class="btn" id="imp-cerrar">Cerrar</button></div>
      <div class="dlg-cuerpo" id="imp-cuerpo">${cuerpo}</div>
      <div class="dlg-pie"><span class="msg" id="imp-msg"></span>${pie}</div></form>`;
    dlg.querySelector('#imp-cerrar').onclick = cerrar;
    dlg.querySelector('#form-imp').onsubmit = (ev) => ev.preventDefault();
  };
  marco('<p class="info">Leyendo el fichero…</p>');
  dlg.showModal();

  let plan;
  try {
    const hoja = await leerHoja(archivo);
    plan = await planificarImportacion(hoja, nidos, columnas);
  } catch (e) {
    marco(`<div class="aviso error">No se pudo leer el fichero: ${esc(e.message ?? e)}. Comprueba que es un .xlsx (no .xls ni .csv).</div>`);
    return;
  }
  if (plan.error) {
    marco(`<div class="aviso error">${esc(plan.error)}</div>${lista(plan.cabeceras.ignoradas.map((t) => `Cabecera no reconocida: ${visible(t)}`))}`);
    return;
  }
  const hayTrabajo = plan.nuevos.length + plan.actualizar.length > 0;
  marco(vistaPrevia(plan, archivo, { tieneCampana }),
    `<button type="submit" class="btn primario" id="imp-aplicar" ${hayTrabajo ? '' : 'disabled'}>${hayTrabajo ? 'Importar' : 'Nada que importar'}</button>`);
  const boton = dlg.querySelector('#imp-aplicar');
  boton.onclick = async () => {
    boton.disabled = true;
    const msg = dlg.querySelector('#imp-msg');
    try {
      const res = await aplicar(plan, (h, t) => { msg.textContent = `Importando… ${h}/${t}`; });
      alTerminar();
      dlg.querySelector('#imp-cuerpo').innerHTML = `
        <div class="aviso" style="background:#e3f1e6;border-color:#a8d1b0">Importación terminada: <b>${res.creados}</b> nidos nuevos y <b>${res.actualizados}</b> completados.</div>
        ${res.errores.length ? `<div class="aviso error"><b>${res.errores.length} filas con error</b>${lista(res.errores.slice(0, MAX_AVISOS))}</div>` : ''}`;
      msg.textContent = '';
      boton.remove();
    } catch (e) {
      msg.textContent = `Error: ${e.message ?? e}`;
      boton.disabled = false;
    }
  };
}
