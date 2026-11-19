import { construirCuaderno, serializarCuaderno } from './cuaderno.js';
import { armarDatosCuaderno, nombreCuaderno } from './presentacion.js';

export const URL_COLAB = 'https://colab.research.google.com/';

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

function descargar(texto, nombre) {
  const blob = new Blob([texto], { type: 'application/x-ipynb+json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/**
 * «Presentación»: informe filtrado → cuaderno de Colab → (Ejecutar todo) → .pptx.
 * Descarga el .ipynb con los nidos filtrados incrustados y explica cómo abrirlo en Colab.
 */
export function abrirPresentacionUI({ dlg, lista, geo, filtros, fondo }) {
  if (!lista.length) {
    dlg.innerHTML = `<form method="dialog"><div class="dlg-cab"><h2>Presentación</h2><button type="button" class="btn" id="pres-cerrar">Cerrar</button></div>
      <div class="dlg-cuerpo"><div class="aviso">No hay nidos en la selección actual. Cambia los filtros y vuelve a pulsar Presentación.</div></div></form>`;
    dlg.querySelector('#pres-cerrar').onclick = () => dlg.close();
    dlg.showModal();
    return null;
  }
  const datos = armarDatosCuaderno(lista, { geo, filtros, fondo });
  const texto = serializarCuaderno(construirCuaderno(datos));
  const nombre = nombreCuaderno();
  dlg.innerHTML = `<form method="dialog" id="form-pres">
    <div class="dlg-cab"><h2>Presentación</h2><button type="button" class="btn" id="pres-cerrar">Cerrar</button></div>
    <div class="dlg-cuerpo">
      <p class="info">Cuaderno de Colab con los <b>${datos.nidos.length}</b> nidos filtrados · ${esc(datos.ambito)} (mismo filtro que el informe). Se ha descargado <code>${esc(nombre)}</code>.</p>
      <ol>
        <li>Abre <a href="${URL_COLAB}" target="_blank" rel="noopener">Google Colab</a> → <b>Archivo → Subir cuaderno</b> y elige <code>${esc(nombre)}</code>.</li>
        <li>Menú <b>Entorno de ejecución → Ejecutar todo</b>.</li>
        <li>Al terminar se descarga <code>${esc(datos.nombre_pptx)}</code> con portada, totales, gráficos, mapa, imágenes y tabla.</li>
      </ol>
      <p class="info">El cuaderno lleva los datos incrustados (sin propietarios ni teléfonos) y no pide claves ni contraseñas.</p>
    </div>
    <div class="dlg-pie"><span class="msg"></span>
      <button type="button" class="btn" id="pres-otra">Descargar de nuevo</button>
      <a class="btn primario" href="${URL_COLAB}" target="_blank" rel="noopener" id="pres-colab">Abrir Google Colab</a></div>
  </form>`;
  dlg.querySelector('#pres-cerrar').onclick = () => dlg.close();
  dlg.querySelector('#pres-otra').onclick = () => descargar(texto, nombre);
  dlg.showModal();
  descargar(texto, nombre);
  return { nombre, datos };
}
