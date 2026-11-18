import { FASES } from './columns.js';
import { aCsv } from './logic.js';

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export const nombreCsv = (fecha = new Date()) => `nidos_aguiluchos_${fecha.toISOString().slice(0, 10)}.csv`;

/** Columnas marcadas, siempre en el orden de la tabla. */
export const elegidas = (columnas, marcadas) => columnas.filter((c) => marcadas.has(c.key));

function descargar(contenido, nombre) {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Diálogo «Exportar CSV»: se marcan los campos de cada fase (todos por defecto). */
export function abrirExportarCsvUI({ dlg, lista, columnas, filtros }) {
  const marcadas = new Set(columnas.map((c) => c.key));
  dlg.innerHTML = `<form method="dialog" id="form-csv">
    <div class="dlg-cab"><h2>Exportar CSV</h2><button type="button" class="btn" id="csv-cerrar">Cerrar</button></div>
    <div class="dlg-cuerpo">
      <p class="info">Se exportan <b>${lista.length}</b> nidos${filtros ? ` (filtros: ${esc(filtros)})` : ' (sin filtros)'}.
      Marca los campos que quieres incluir.</p>
      <div class="csv-global">
        <button type="button" class="btn" id="csv-todos">Marcar todos</button>
        <button type="button" class="btn" id="csv-ninguno">Quitar todos</button>
      </div>
      ${FASES.map((f) => {
        const cols = columnas.filter((c) => c.fase === f.id);
        return `<fieldset data-fase="${f.id}"><legend>${esc(f.titulo)}</legend>
          <div class="csv-fase"><button type="button" class="btn" data-marcar="${f.id}">Marcar fase</button>
          <button type="button" class="btn" data-quitar="${f.id}">Quitar fase</button></div>
          <div class="csv-campos">${cols.map((c) => `<label><input type="checkbox" name="csv-col" value="${esc(c.key)}" checked /> ${esc(c.label)}</label>`).join('')}</div>
        </fieldset>`;
      }).join('')}
    </div>
    <div class="dlg-pie"><span class="msg" id="csv-msg"></span>
      <button type="submit" class="btn primario" id="csv-descargar">Descargar CSV</button></div>
  </form>`;

  const cajas = () => [...dlg.querySelectorAll('input[name="csv-col"]')];
  const actualizar = () => {
    marcadas.clear();
    for (const c of cajas()) if (c.checked) marcadas.add(c.value);
    dlg.querySelector('#csv-msg').textContent = `${marcadas.size} de ${columnas.length} campos`;
    dlg.querySelector('#csv-descargar').disabled = marcadas.size === 0;
  };
  const poner = (valor, fase) => {
    for (const c of cajas()) if (!fase || c.closest('fieldset').dataset.fase === String(fase)) c.checked = valor;
    actualizar();
  };
  dlg.querySelector('#csv-cerrar').onclick = () => dlg.close();
  dlg.querySelector('#csv-todos').onclick = () => poner(true);
  dlg.querySelector('#csv-ninguno').onclick = () => poner(false);
  dlg.querySelectorAll('[data-marcar]').forEach((b) => { b.onclick = () => poner(true, b.dataset.marcar); });
  dlg.querySelectorAll('[data-quitar]').forEach((b) => { b.onclick = () => poner(false, b.dataset.quitar); });
  dlg.onchange = (ev) => { if (ev.target.name === 'csv-col') actualizar(); };
  dlg.querySelector('#form-csv').onsubmit = (ev) => {
    ev.preventDefault();
    if (!marcadas.size) return;
    descargar(aCsv(lista, elegidas(columnas, marcadas)), nombreCsv());
    dlg.close();
  };
  actualizar();
  dlg.showModal();
}
