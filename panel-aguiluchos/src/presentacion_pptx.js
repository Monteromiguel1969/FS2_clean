// Genera el .pptx en el navegador con pptxgenjs (sin servidor). Solo usa elementos
// estándar (texto, formas, gráficos nativos, tablas, imágenes) para que abra igual en
// PowerPoint y en Google Slides.

const VERDE = '2E6B3A';
const VERDE_OSC = '1F4A28';
const GRIS = 'F3F5F2';
const TEXTO = '1D2A1F';
const SUAVE = '5F6D62';
const COLOR_KPI = { 'Con éxito': VERDE, Fracaso: 'C0392B', 'En curso': 'E08A1E' };
const FUENTE = 'Arial';
const ANCHOS = { Nº: 0.6, Etiqueta: 1.2, Proyecto: 1.1, Campaña: 0.9, Localidad: 1.9, Provincia: 1.3, Especie: 1.6, Estado: 0.9, Nacidos: 0.75, Volados: 0.75, Muertos: 0.75 };

/** Encaja una imagen de ancho×alto en una caja, centrada. */
export function encajar(ancho, alto, caja) {
  const r = Math.min(caja.w / ancho, caja.h / alto);
  const w = ancho * r;
  const h = alto * r;
  return { x: caja.x + (caja.w - w) / 2, y: caja.y + (caja.h - h) / 2, w, h };
}

/**
 * Construye la presentación (objeto pptxgenjs).
 * @param {object} datos resultado de `armarPresentacion`
 * @param {{mapa?:{dataUrl:string,w:number,h:number,pie?:string}|null, imagenes?:{dataUrl:string,w:number,h:number,titulo:string,subtitulo:string}[]}} extra
 */
export async function construirPptx(datos, extra = {}) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = `${datos.titulo} · ${datos.ambito}`;
  pres.author = 'GREFA';
  pres.company = 'GREFA';
  let n = 0;

  const titulo = (d, texto) => {
    d.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: VERDE }, line: { color: VERDE } });
    d.addText(texto, { x: 0.5, y: 0.1, w: 12.3, h: 0.7, fontFace: FUENTE, fontSize: 22, bold: true, color: 'FFFFFF', valign: 'middle', fit: 'shrink' });
  };
  const nueva = (texto) => {
    const d = pres.addSlide();
    titulo(d, texto);
    n += 1;
    d.addText(`GREFA · Campaña Aguilucho · ${n}`, { x: 0.5, y: 7.05, w: 12.3, h: 0.3, fontFace: FUENTE, fontSize: 9, color: SUAVE, align: 'right' });
    return d;
  };

  const portada = pres.addSlide();
  portada.background = { color: VERDE_OSC };
  portada.addText(datos.titulo, { x: 0.8, y: 1.8, w: 11.7, h: 1.2, fontFace: FUENTE, fontSize: 38, bold: true, color: 'FFFFFF' });
  portada.addText(datos.ambito, { x: 0.8, y: 3.1, w: 11.7, h: 0.8, fontFace: FUENTE, fontSize: 26, color: 'D9EBDD' });
  portada.addText(`${datos.total} nidos`, { x: 0.8, y: 3.9, w: 11.7, h: 0.5, fontFace: FUENTE, fontSize: 18, color: 'FFFFFF' });
  if (datos.filtros) portada.addText(`Filtros: ${datos.filtros}`, { x: 0.8, y: 4.6, w: 11.7, h: 0.9, fontFace: FUENTE, fontSize: 13, color: 'D9EBDD', valign: 'top' });
  portada.addText(datos.fecha, { x: 0.8, y: 6.5, w: 11.7, h: 0.4, fontFace: FUENTE, fontSize: 14, color: 'D9EBDD' });

  const totales = nueva(`Totales · ${datos.ambito}`);
  datos.totales.forEach((t, i) => {
    const x = 0.5 + (i % 4) * 3.1;
    const y = 1.3 + Math.floor(i / 4) * 1.9;
    totales.addShape(pres.ShapeType.rect, { x, y, w: 2.9, h: 1.65, fill: { color: GRIS }, line: { color: 'D9DFD6', width: 1 } });
    totales.addText(t.valor, { x, y: y + 0.15, w: 2.9, h: 0.9, fontFace: FUENTE, fontSize: 36, bold: true, color: COLOR_KPI[t.etiqueta] ?? TEXTO, align: 'center', valign: 'middle' });
    totales.addText(t.etiqueta, { x, y: y + 1.0, w: 2.9, h: 0.5, fontFace: FUENTE, fontSize: 13, color: SUAVE, align: 'center', valign: 'middle' });
  });

  const g = datos.graficos;
  const area = { x: 0.7, y: 1.1, w: 11.9, h: 5.8 };
  const base = { ...area, showTitle: false, catAxisLabelFontFace: FUENTE, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, dataLabelFontSize: 12, dataLabelFontFace: FUENTE };
  if (g.estados) {
    const d = nueva(`${g.estados.titulo} · ${datos.ambito}`);
    d.addChart(pres.charts.PIE, [{ name: g.estados.titulo, labels: g.estados.labels, values: g.estados.values }],
      { ...base, chartColors: g.estados.colors, showLegend: true, legendPos: 'r', legendFontSize: 14, showPercent: true, showValue: false, showLabel: false, dataLabelColor: 'FFFFFF', dataLabelFontSize: 16 });
  }
  if (g.tasas) {
    const d = nueva(`${g.tasas.titulo} · ${datos.ambito}`);
    d.addChart(pres.charts.BAR, [{ name: 'Tasa de éxito (%)', labels: g.tasas.labels, values: g.tasas.values }],
      { ...base, barDir: 'bar', chartColors: [VERDE], valAxisMinVal: 0, valAxisMaxVal: 100, showValue: true, showLegend: false });
  }
  if (g.pollos) {
    const d = nueva(`${g.pollos.titulo} · ${datos.ambito}`);
    d.addChart(pres.charts.BAR, g.pollos.series.map((s) => ({ name: s.name, labels: g.pollos.labels, values: s.values })),
      { ...base, barDir: 'col', barGrouping: 'clustered', chartColors: g.pollos.colors, showValue: true, showLegend: true, legendPos: 'b', legendFontSize: 13 });
  }
  if (g.causas) {
    const d = nueva(`${g.causas.titulo} · ${datos.ambito}`);
    d.addChart(pres.charts.BAR, [{ name: 'Nidos', labels: g.causas.labels, values: g.causas.values }],
      { ...base, barDir: 'bar', chartColors: [COLOR_KPI.Fracaso], showValue: true, showLegend: false, valAxisMinVal: 0 });
  }

  if (extra.mapa) {
    const d = nueva(`Mapa de los nidos · ${datos.ambito}`);
    const r = encajar(extra.mapa.w, extra.mapa.h, { x: 0.5, y: 1.1, w: 12.33, h: 5.4 });
    d.addImage({ data: extra.mapa.dataUrl, ...r });
    d.addText(extra.mapa.pie ?? '', { x: 0.5, y: 6.55, w: 12.3, h: 0.4, fontFace: FUENTE, fontSize: 10, color: SUAVE });
  }

  for (const im of extra.imagenes ?? []) {
    const d = nueva(im.titulo);
    d.addImage({ data: im.dataUrl, ...encajar(im.w, im.h, { x: 0.5, y: 1.1, w: 12.33, h: 5.4 }) });
    d.addText(im.subtitulo ?? '', { x: 0.5, y: 6.55, w: 12.3, h: 0.4, fontFace: FUENTE, fontSize: 11, color: SUAVE });
  }

  const { columnas, paginas } = datos.tabla;
  const anchos = columnas.map((c) => ANCHOS[c] ?? 1);
  const escala = 12.3 / anchos.reduce((a, b) => a + b, 0);
  paginas.forEach((filas, i) => {
    const d = nueva(`Nidos (${i + 1}/${paginas.length}) · ${datos.ambito}`);
    const cabecera = columnas.map((c) => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: VERDE_OSC }, fontFace: FUENTE, fontSize: 11 } }));
    const cuerpo = filas.map((f, k) => f.map((v) => ({ text: v, options: { color: TEXTO, fontFace: FUENTE, fontSize: 10.5, fill: { color: k % 2 ? GRIS : 'FFFFFF' } } })));
    d.addTable([cabecera, ...cuerpo], { x: 0.5, y: 1.1, w: 12.3, colW: anchos.map((a) => a * escala), rowH: 0.42, border: { type: 'solid', color: 'D9DFD6', pt: 0.5 }, valign: 'middle' });
  });
  if (!paginas.length) {
    nueva(`Nidos · ${datos.ambito}`).addText('No hay nidos en la selección.', { x: 0.5, y: 1.4, w: 12.3, h: 0.6, fontFace: FUENTE, fontSize: 16, color: SUAVE });
  }
  return pres;
}

/** Genera el .pptx y lo descarga en el navegador. Devuelve el nombre del archivo. */
export async function descargarPptx(datos, extra) {
  const pres = await construirPptx(datos, extra);
  const blob = await pres.write({ outputType: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = datos.nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return datos.nombre;
}
