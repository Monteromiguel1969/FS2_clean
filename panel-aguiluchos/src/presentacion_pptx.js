// Genera el .pptx en el navegador con pptxgenjs (sin servidor). Solo usa elementos
// estándar (texto, tablas, imagen) para que abra igual en PowerPoint y Google Slides.
import { nombreArchivoPresentacion } from './presentacion.js';

const VERDE = '2E6B3A';
const VERDE_OSC = '1F4A28';
const GRIS = 'F3F5F2';
const TEXTO = '1D2A1F';
const SUAVE = '5F6D62';
const COLOR_KPI = { 'Con éxito': VERDE, Fracaso: 'C0392B', 'En curso': 'E08A1E' };
const FUENTE = 'Arial';

const ANCHOS = { Nº: 0.6, Etiqueta: 1.2, Proyecto: 1.1, Campaña: 0.9, Localidad: 1.9, Provincia: 1.3, Especie: 1.6, Estado: 0.9, Nacidos: 0.75, Volados: 0.75, Muertos: 0.75 };

function pie(diap, pres, n) {
  diap.addText(`GREFA · Campaña Aguilucho · ${n}`, { x: 0.5, y: 7.05, w: 12.3, h: 0.3, fontFace: FUENTE, fontSize: 9, color: SUAVE, align: 'right' });
}

function titulo(diap, texto) {
  diap.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: VERDE } });
  diap.addText(texto, { x: 0.5, y: 0.1, w: 12.3, h: 0.7, fontFace: FUENTE, fontSize: 22, bold: true, color: 'FFFFFF', valign: 'middle', fit: 'shrink' });
}

/** Construye la presentación (objeto pptxgenjs) a partir de `armarPresentacion`. */
export async function construirPptx(datos) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = `${datos.titulo} · ${datos.ambito}`;
  pres.author = 'GREFA';
  pres.company = 'GREFA';
  let n = 0;

  const portada = pres.addSlide();
  portada.background = { color: VERDE_OSC };
  portada.addText(datos.titulo, { x: 0.8, y: 1.8, w: 11.7, h: 1.2, fontFace: FUENTE, fontSize: 38, bold: true, color: 'FFFFFF' });
  portada.addText(datos.ambito, { x: 0.8, y: 3.1, w: 11.7, h: 0.8, fontFace: FUENTE, fontSize: 26, color: 'D9EBDD' });
  portada.addText(`${datos.total} nidos`, { x: 0.8, y: 3.9, w: 11.7, h: 0.5, fontFace: FUENTE, fontSize: 18, color: 'FFFFFF' });
  if (datos.filtros) portada.addText(`Filtros: ${datos.filtros}`, { x: 0.8, y: 4.6, w: 11.7, h: 0.9, fontFace: FUENTE, fontSize: 13, color: 'D9EBDD', valign: 'top' });
  portada.addText(datos.fecha, { x: 0.8, y: 6.5, w: 11.7, h: 0.4, fontFace: FUENTE, fontSize: 14, color: 'D9EBDD' });

  const totales = pres.addSlide();
  titulo(totales, `Totales · ${datos.ambito}`);
  datos.totales.forEach((t, i) => {
    const col = i % 4;
    const fila = Math.floor(i / 4);
    const x = 0.5 + col * 3.1;
    const y = 1.3 + fila * 1.9;
    totales.addShape('rect', { x, y, w: 2.9, h: 1.65, fill: { color: GRIS }, line: { color: 'D9DFD6', width: 1 } });
    totales.addText(t.valor, { x, y: y + 0.15, w: 2.9, h: 0.9, fontFace: FUENTE, fontSize: 36, bold: true, color: COLOR_KPI[t.etiqueta] ?? TEXTO, align: 'center', valign: 'middle' });
    totales.addText(t.etiqueta, { x, y: y + 1.0, w: 2.9, h: 0.5, fontFace: FUENTE, fontSize: 13, color: SUAVE, align: 'center', valign: 'middle' });
  });
  if (datos.causas.length) {
    totales.addText(`Causas de fracaso: ${datos.causas.map(([k, c]) => `${k} (${c})`).join(' · ')}`,
      { x: 0.5, y: 5.3, w: 12.3, h: 0.9, fontFace: FUENTE, fontSize: 14, color: TEXTO, valign: 'top' });
  }
  pie(totales, pres, ++n);

  if (datos.mapa) {
    const mapa = pres.addSlide();
    titulo(mapa, `Mapa · ${datos.ambito}`);
    mapa.addImage({ data: datos.mapa.dataUrl, x: 0.5, y: 1.1, w: 12.33, h: 5.8, sizing: { type: 'contain', w: 12.33, h: 5.8 } });
    pie(mapa, pres, ++n);
  }

  const { columnas, paginas } = datos.tabla;
  const anchos = columnas.map((c) => ANCHOS[c] ?? 1);
  const escala = 12.3 / anchos.reduce((a, b) => a + b, 0);
  paginas.forEach((filas, i) => {
    const d = pres.addSlide();
    titulo(d, `Nidos (${i + 1}/${paginas.length}) · ${datos.ambito}`);
    const cabecera = columnas.map((c) => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: VERDE_OSC }, fontFace: FUENTE, fontSize: 11 } }));
    const cuerpo = filas.map((f, k) => f.map((v) => ({ text: v, options: { color: TEXTO, fontFace: FUENTE, fontSize: 10.5, fill: { color: k % 2 ? GRIS : 'FFFFFF' } } })));
    d.addTable([cabecera, ...cuerpo], { x: 0.5, y: 1.1, w: 12.3, colW: anchos.map((a) => a * escala), rowH: 0.42, border: { type: 'solid', color: 'D9DFD6', pt: 0.5 }, valign: 'middle' });
    pie(d, pres, ++n);
  });
  if (!paginas.length) {
    const d = pres.addSlide();
    titulo(d, `Nidos · ${datos.ambito}`);
    d.addText('No hay nidos en la selección.', { x: 0.5, y: 1.4, w: 12.3, h: 0.6, fontFace: FUENTE, fontSize: 16, color: SUAVE });
    pie(d, pres, ++n);
  }
  return pres;
}

/** Descarga el .pptx en el navegador. Devuelve el nombre del archivo. */
export async function descargarPptx(datos) {
  const pres = await construirPptx(datos);
  const blob = await pres.write({ outputType: 'blob' });
  const nombre = nombreArchivoPresentacion();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return nombre;
}
