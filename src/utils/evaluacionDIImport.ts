type QuestionItem = {
  pregunta: string;
  respuesta: string;
  puntuacion: number;
};

type BlockItem = {
  bloque: string;
  subbloque: string;
  preguntas: QuestionItem[];
  media: number;
};

type EvaluacionImportada = {
  id: string;
  fecha: string;
  fuente: string;
  score: number;
  bloques: BlockItem[];
};

type ImportResult = {
  updatedPlayers: any[];
  conDatos: string[];
  sinDatos: string[];
  enLibroNoEnPlantilla: string[];
};

const SHEET_GVIZ_URL =
  'https://docs.google.com/spreadsheets/d/1A_Dg5_HnbjFD9EYC8HyznYX89VVJMh8ecbu1HsBUHeU/gviz/tq?tqx=out:json&sheet=Hoja%202';

const DEFAULT_TARGETS = [
  'IVAN DEL MAZO GUERRA',
  'RUBEN GARCIA ESPADA',
  'SEBASTIN ALEXANDER OÑATE RIOS',
  'DANIEL CHUTI',
  'SALGADO SANCHEZ, YEISON FELIPE',
];

function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function normalizeText(raw: any): string {
  const base = String(raw || '');
  const normalized = typeof (base as any).normalize === 'function'
    ? base.normalize('NFD')
    : base;
  return normalized
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\[\]]/g, '')
    .replace(/[.,;:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function tokenSet(name: string): Set<string> {
  const skip = new Set(['DE', 'DEL', 'LA', 'EL', 'Y', 'LOS', 'LAS']);
  return new Set(
    normalizeText(name)
      .split(' ')
      .map((t) => t.trim())
      .filter((t) => t && !skip.has(t))
  );
}

function namesMatch(a: string, b: string): boolean {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (!aa || !bb) return false;
  if (aa === bb) return true;
  if (aa.includes(bb) || bb.includes(aa)) return true;
  const ta = tokenSet(aa);
  const tb = tokenSet(bb);
  let common = 0;
  ta.forEach((t) => {
    if (tb.has(t)) common += 1;
  });
  const minLen = Math.min(ta.size, tb.size);
  return minLen > 0 && common >= Math.max(2, Math.floor(minLen * 0.6));
}

function scoreFromAnswer(answer: string): number {
  const a = normalizeText(answer).toLowerCase();
  if (!a) return 3;
  if (a.includes('siempre')) return 5;
  if (a.includes('frecuentemente')) return 4;
  if (a.includes('a veces')) return 3;
  if (a.includes('neutral')) return 3;
  if (a.includes('parcialmente')) return 2;
  if (a.includes('poco relacionadas')) return 2;
  if (a.includes('algunas')) return 3;
  if (a.includes('facilmente')) return 4;
  if (a.includes('positiva')) return 4;
  if (a.includes('bien')) return 4;
  if (a.includes('verbal')) return 4;
  if (a.includes('combinacion de los anteriores')) return 5;
  return 3;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function parseGvizJson(raw: string): any {
  const t = String(raw || '').trim();
  if (t.startsWith('<') || t.toLowerCase().includes('<!doctype')) {
    throw new Error(
      'La hoja devolvió HTML en lugar de datos. Comprueba que el enlace de publicación sea correcto y que la hoja sea accesible.'
    );
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Respuesta inválida de Google Sheets (no es JSON de visualización).');
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`No se pudo leer Hoja 2: ${msg}`);
  }
}

function getCell(row: any, idx: number): string {
  return String(row?.c?.[idx]?.v ?? '').trim();
}

function buildEvaluacionForColumn(rows: any[], colIdx: number): EvaluacionImportada {
  const byBlock = new Map<string, BlockItem>();
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const bloque = getCell(row, 0);
    const subbloque = getCell(row, 1);
    const pregunta = getCell(row, 2);
    const respuesta = getCell(row, colIdx);
    if (!pregunta || !respuesta) continue;
    const key = `${bloque}||${subbloque}`;
    if (!byBlock.has(key)) {
      byBlock.set(key, { bloque, subbloque, preguntas: [], media: 0 });
    }
    const item = byBlock.get(key)!;
    item.preguntas.push({
      pregunta,
      respuesta,
      puntuacion: scoreFromAnswer(respuesta),
    });
  }

  const bloques = Array.from(byBlock.values()).map((b) => {
    const media =
      b.preguntas.length > 0
        ? round1(b.preguntas.reduce((acc, q) => acc + q.puntuacion, 0) / b.preguntas.length)
        : 3;
    return { ...b, media };
  });
  // Evitamos flatMap por compatibilidad con algunos motores JS en Android.
  const allScores = bloques.reduce((acc: number[], b) => {
    b.preguntas.forEach((q) => acc.push(q.puntuacion));
    return acc;
  }, []);
  const score = allScores.length ? round1(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 3;

  return {
    id: `di-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    fecha: todayDDMMYYYY(),
    fuente: 'hoja2-evaluacion',
    score,
    bloques,
  };
}

export async function importEvaluacionesHoja2ToPlayers(players: any[], targetNames: string[] = DEFAULT_TARGETS): Promise<ImportResult> {
  const res = await fetch(SHEET_GVIZ_URL);
  if (!res.ok) throw new Error(`No se pudo leer Hoja 2 (HTTP ${res.status}).`);
  const txt = await res.text();
  const parsed = parseGvizJson(txt);
  const rows: any[] = Array.isArray(parsed?.table?.rows) ? parsed.table.rows : [];
  if (!rows.length) throw new Error('La Hoja 2 no devolvió filas.');

  const header = rows[0];
  const colsCount = Array.isArray(header?.c) ? header.c.length : 0;
  const headers: Array<{ colIdx: number; nombreLibro: string }> = [];
  for (let c = 3; c < colsCount; c += 1) {
    const nombreLibro = getCell(header, c);
    if (nombreLibro) headers.push({ colIdx: c, nombreLibro });
  }

  const targetsNorm = targetNames.map((n) => normalizeText(n));
  const selectedHeaders = headers.filter((h) => targetsNorm.some((t) => namesMatch(h.nombreLibro, t)));
  const enLibroNoEnPlantilla: string[] = [];
  const conDatos: string[] = [];
  const sinDatos: string[] = [];
  const updatedPlayers = [...players];

  for (const h of selectedHeaders) {
    const evalData = buildEvaluacionForColumn(rows, h.colIdx);
    const idx = updatedPlayers.findIndex((p: any) => namesMatch(p?.name || p?.nominal || '', h.nombreLibro));
    if (idx < 0) {
      enLibroNoEnPlantilla.push(h.nombreLibro);
      continue;
    }
    const p = updatedPlayers[idx];
    const prev = Array.isArray(p?.evaluacionesDI) ? p.evaluacionesDI : [];
    updatedPlayers[idx] = { ...p, evaluacionesDI: [...prev, evalData].slice(-30) };
    conDatos.push(p?.name || p?.nominal || h.nombreLibro);
  }

  for (const target of targetNames) {
    const matched = conDatos.some((n) => namesMatch(n, target));
    if (!matched) sinDatos.push(target);
  }

  return { updatedPlayers, conDatos, sinDatos, enLibroNoEnPlantilla };
}

export const EVAL_DI_TARGET_PLAYERS = DEFAULT_TARGETS;
