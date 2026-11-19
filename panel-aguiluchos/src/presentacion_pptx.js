// Genera el .pptx en el navegador con pptxgenjs (sin servidor). Solo usa elementos
// estándar (texto, formas, gráficos nativos, tablas, imágenes) para que abra igual en
// PowerPoint y en Google Slides.

const VERDE = '2E6B3A';
const VERDE_OSC = '1F4A28';
const GRIS = 'F3F5F2';
const TEXTO = '1D2A1F';
const SUAVE = '5F6D62';
const FUENTE = 'Arial';
const BORDE = { type: 'solid', color: 'D9DFD6', pt: 0.5 };

/** Encaja una imagen de ancho×alto en una caja, centrada y sin deformarla. */
export function encajar(ancho, alto, caja) {
  const r = Math.min(caja.w / ancho, caja.h / alto);
  const w = ancho * r;
  const h = alto * r;
  return { x: caja.x + (caja.w - w) / 2, y: caja.y + (caja.h - h) / 2, w, h };
}

/**
 * Construye la presentación (objeto pptxgenjs) a partir del modelo de `armarPresentacion`.
 */
export async function construirPptx(m) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = m.titulo;
  pres.author = m.elaboradoPor || 'GREFA';
  pres.company = 'GREFA';
  let n = 1;

  const portada = pres.addSlide();
  portada.background = { color: VERDE_OSC };
  portada.addText('GREFA', { x: 0.8, y: 0.6, w: 11.7, h: 0.6, fontFace: FUENTE, fontSize: 24, bold: true, color: 'D9EBDD' });
  portada.addText(m.titulo, { x: 0.8, y: 1.5, w: 11.7, h: 1.6, fontFace: FUENTE, fontSize: 34, bold: true, color: 'FFFFFF', valign: 'top', fit: 'shrink' });
  portada.addText(`${m.ambito} · ${m.total} nido(s)`, { x: 0.8, y: 3.2, w: 11.7, h: 0.6, fontFace: FUENTE, fontSize: 22, color: 'D9EBDD' });
  const meta = [['Referencia', m.referencia], ['Fecha de emisión', m.fecha], ['Elaborado por', m.elaboradoPor], ['Destinatario', m.destinatario], ['Filtros', m.filtros]].filter(([, v]) => v);
  portada.addText(meta.map(([k, v]) => ({ text: `${k}: ${v}`, options: { breakLine: true } })),
    { x: 0.8, y: 4.1, w: 11.7, h: 2.6, fontFace: FUENTE, fontSize: 14, color: 'FFFFFF', valign: 'top', fit: 'shrink', paraSpaceAfter: 4 });

  const nueva = (titulo) => {
    const d = pres.addSlide();
    n += 1;
    d.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: VERDE }, line: { color: VERDE } });
    d.addText(titulo, { x: 0.5, y: 0.1, w: 12.3, h: 0.7, fontFace: FUENTE, fontSize: 22, bold: true, color: 'FFFFFF', valign: 'middle', fit: 'shrink' });
    d.addText(`${m.referencia} · ${n}`, { x: 0.5, y: 7.05, w: 12.3, h: 0.3, fontFace: FUENTE, fontSize: 9, color: SUAVE, align: 'right' });
    return d;
  };

  const area = { x: 0.7, y: 1.1, w: 11.9, h: 5.8 };
  const baseGrafico = { ...area, showTitle: false, catAxisLabelFontFace: FUENTE, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, dataLabelFontSize: 12, dataLabelFontFace: FUENTE };

  const bloqueFicha = (d, bloques, x, w) => {
    let y = 1.05;
    for (const b of bloques) {
      d.addText(b.titulo, { x, y, w, h: 0.3, fontFace: FUENTE, fontSize: 11, bold: true, color: VERDE });
      y += 0.32;
      const filas = b.filas.map(([k, v], i) => [
        { text: k, options: { bold: true, color: SUAVE, fontFace: FUENTE, fontSize: 9, fill: { color: i % 2 ? GRIS : 'FFFFFF' } } },
        { text: v, options: { color: TEXTO, fontFace: FUENTE, fontSize: 9, fill: { color: i % 2 ? GRIS : 'FFFFFF' } } },
      ]);
      d.addTable(filas, { x, y, w, colW: [w * 0.4, w * 0.6], rowH: 0.27, border: BORDE, valign: 'middle', autoPage: false });
      y += filas.length * 0.27 + 0.2;
    }
  };

  for (const s of m.diapositivas) {
    const d = nueva(s.titulo);
    if (s.tipo === 'texto') {
      d.addText(s.texto, { x: 0.7, y: 1.2, w: 11.9, h: 5.6, fontFace: FUENTE, fontSize: 18, color: TEXTO, valign: 'top', fit: 'shrink', paraSpaceAfter: 10 });
    } else if (s.tipo === 'kpis') {
      s.items.forEach((t, i) => {
        const x = 0.5 + (i % 4) * 3.1;
        const y = 1.15 + Math.floor(i / 4) * 1.9;
        d.addShape(pres.ShapeType.rect, { x, y, w: 2.9, h: 1.7, fill: { color: GRIS }, line: { color: 'D9DFD6', width: 1 } });
        d.addText(t.valor, { x, y: y + 0.1, w: 2.9, h: 0.95, fontFace: FUENTE, fontSize: 34, bold: true, color: t.color ?? TEXTO, align: 'center', valign: 'middle', fit: 'shrink' });
        d.addText(t.etiqueta, { x, y: y + 1.05, w: 2.9, h: 0.55, fontFace: FUENTE, fontSize: 12, color: SUAVE, align: 'center', valign: 'middle', fit: 'shrink' });
      });
    } else if (s.tipo === 'grafico') {
      const datos = s.series.map((x) => ({ name: x.name, labels: s.labels, values: x.values }));
      if (s.variante === 'pie') {
        d.addChart(pres.charts.PIE, datos, { ...baseGrafico, chartColors: s.colors, showLegend: true, legendPos: 'r', legendFontSize: 14, showPercent: true, showValue: false, showLabel: false, dataLabelColor: 'FFFFFF', dataLabelFontSize: 16 });
      } else if (s.variante === 'barra-h') {
        d.addChart(pres.charts.BAR, datos, { ...baseGrafico, barDir: 'bar', chartColors: s.colors, valAxisMinVal: 0, ...(s.maximo ? { valAxisMaxVal: s.maximo } : {}), showValue: true, showLegend: false });
      } else {
        d.addChart(pres.charts.BAR, datos, { ...baseGrafico, barDir: 'col', barGrouping: 'clustered', chartColors: s.colors, showValue: true, showLegend: !!s.leyenda, legendPos: 'b', legendFontSize: 13 });
      }
    } else if (s.tipo === 'tabla') {
      const tam = s.compacta ? 9 : 11;
      const cab = s.columnas.map((c) => ({ text: c.t, options: { bold: true, color: 'FFFFFF', fill: { color: VERDE_OSC }, fontFace: FUENTE, fontSize: tam, align: c.num ? 'right' : 'left' } }));
      const cuerpo = s.filas.map((f, k) => f.map((v, j) => ({ text: v, options: { color: TEXTO, fontFace: FUENTE, fontSize: s.compacta ? 9 : 10.5, align: s.columnas[j].num ? 'right' : 'left', fill: { color: k % 2 ? GRIS : 'FFFFFF' } } })));
      const total = s.columnas.reduce((a, c) => a + c.w, 0);
      d.addTable([cab, ...cuerpo], { x: 0.5, y: 1.1, w: 12.3, colW: s.columnas.map((c) => (c.w * 12.3) / total), rowH: s.compacta ? 0.55 : 0.42, border: BORDE, valign: 'middle', autoPage: false });
      if (!s.filas.length) d.addText('Sin datos.', { x: 0.5, y: 2.6, w: 12.3, h: 0.5, fontFace: FUENTE, fontSize: 14, color: SUAVE });
    } else if (s.tipo === 'mapa') {
      d.addImage({ data: s.dataUrl, ...encajar(s.w, s.h, { x: 0.5, y: 1.1, w: 12.33, h: 5.4 }) });
      d.addText(s.pie ?? '', { x: 0.5, y: 6.55, w: 12.3, h: 0.45, fontFace: FUENTE, fontSize: 10, color: SUAVE, valign: 'top', fit: 'shrink' });
    } else if (s.tipo === 'ficha') {
      bloqueFicha(d, s.izquierda, 0.5, 6.0);
      if (s.derecha.length) bloqueFicha(d, s.derecha, 6.85, 6.0);
      if (s.justificacion !== undefined) {
        d.addText('Justificación de conservación', { x: 6.85, y: 1.05, w: 6, h: 0.3, fontFace: FUENTE, fontSize: 11, bold: true, color: VERDE });
        d.addText(s.justificacion, { x: 6.85, y: 1.4, w: 6, h: 1.4, fontFace: FUENTE, fontSize: 11, color: TEXTO, valign: 'top', fit: 'shrink' });
        if (s.foto) d.addImage({ data: s.foto.dataUrl, ...encajar(s.foto.w, s.foto.h, { x: 6.85, y: 2.95, w: 6, h: 3.95 }) });
      }
    }
  }
  return pres;
}

/** Genera el .pptx y lo descarga en el navegador. Devuelve el nombre del archivo. */
export async function descargarPptx(modelo) {
  const pres = await construirPptx(modelo);
  const blob = await pres.write({ outputType: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = modelo.nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return modelo.nombre;
}
