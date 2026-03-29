type BlockName = 'technique' | 'tactic' | 'physical' | 'mental';
type BlockWeights = Record<BlockName, number>;
type RatingContext = { partidos?: any[]; entrenos?: any[] };
type EvalDI = {
  fecha?: string;
  edad?: number;
  experienciaFS?: number;
  score?: number;
  observaciones?: string;
};

const BLOCK_KEYS: Record<BlockName, string[]> = {
  technique: ['control', 'pase'],
  tactic: ['lecturaJuego', 'tomaDecision'],
  physical: ['velocidad', 'resistencia'],
  mental: ['concentracion', 'competitividad'],
};

const LEGACY_TECH_KEYS = [
  'tiro',
  'regate',
  'vision',
  'visión',
  'defensa',
  'finalizacion',
  'finalización',
  'tecnica',
];
const LEGACY_TACTIC_KEYS = ['tactica', 'táctica'];
const LEGACY_PHYS_KEYS = [
  'fuerza',
  'aceleracion',
  'aceleración',
  'agilidad',
  'salto',
  'fisico',
  'físico',
];

const POSITION_WEIGHTS: Record<string, BlockWeights> = {
  portero: { technique: 0.25, tactic: 0.25, physical: 0.2, mental: 0.3 },
  cierre: { technique: 0.25, tactic: 0.3, physical: 0.2, mental: 0.25 },
  ala: { technique: 0.3, tactic: 0.2, physical: 0.3, mental: 0.2 },
  pivot: { technique: 0.35, tactic: 0.2, physical: 0.25, mental: 0.2 },
};
const DEFAULT_WEIGHTS: BlockWeights = { technique: 0.3, tactic: 0.25, physical: 0.25, mental: 0.2 };

function toNumber(value: any): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function extractRatings(player: any, keys: string[]): number[] {
  return keys
    .map((k) => toNumber(player?.[k]))
    .filter((v): v is number => v != null)
    .map((v) => clamp(v, 1, 5));
}

function normalizePosition(raw: any): string {
  const first = String(raw || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return first
    .replace(/[íìï]/g, 'i')
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u');
}

function inferMentalFromStatus(player: any): number | null {
  const dispo = String(player?.disponibilidad || '').toLowerCase();
  const fisico = String(player?.estadoFisico || '').toLowerCase();
  const vals: number[] = [];

  if (dispo.includes('garantizado')) vals.push(4);
  else if (dispo.includes('duda')) vals.push(3);
  else if (dispo.includes('no disponible')) vals.push(2);

  if (fisico.includes('ok')) vals.push(4);
  else if (fisico.includes('cargado')) vals.push(3);
  else if (fisico.includes('lesionado')) vals.push(2);

  return vals.length ? avg(vals) : null;
}

function resolveBlockValue(player: any, block: BlockName): number {
  const direct = extractRatings(player, BLOCK_KEYS[block]);
  if (direct.length) return avg(direct);

  if (block === 'technique') {
    const legacy = extractRatings(player, LEGACY_TECH_KEYS);
    if (legacy.length) return avg(legacy);
  }
  if (block === 'tactic') {
    const legacy = extractRatings(player, LEGACY_TACTIC_KEYS);
    if (legacy.length) return avg(legacy);
  }
  if (block === 'physical') {
    const legacy = extractRatings(player, LEGACY_PHYS_KEYS);
    if (legacy.length) return avg(legacy);
  }
  if (block === 'mental') {
    const inferred = inferMentalFromStatus(player);
    if (inferred != null) return inferred;
  }

  const staff = toNumber(player?.valoracionStaff);
  return clamp(staff ?? 3, 1, 5);
}

function resolveWeights(player: any): BlockWeights {
  const pos = normalizePosition(player?.posicionPrincipal || player?.posicion);
  return POSITION_WEIGHTS[pos] || DEFAULT_WEIGHTS;
}

export function explainValoracionIA(player: any, context: RatingContext = {}): {
  score: number;
  rawScore: number;
  position: string;
  blocks: Record<BlockName, number>;
  weights: BlockWeights;
  context: {
    entrenosPct: number;
    partidosPct: number;
    goles: number;
    minutos: number;
    favorContraPct: number;
    evaluacionDIScore: number | null;
    staffScore: number;
    fichaPonderacionScore: number;
    contextScore: number;
  };
  formula: string;
} {
  const weights = resolveWeights(player);
  const blocks: Record<BlockName, number> = {
    technique: resolveBlockValue(player, 'technique'),
    tactic: resolveBlockValue(player, 'tactic'),
    physical: resolveBlockValue(player, 'physical'),
    mental: resolveBlockValue(player, 'mental'),
  };

  const weighted =
    blocks.technique * weights.technique +
    blocks.tactic * weights.tactic +
    blocks.physical * weights.physical +
    blocks.mental * weights.mental;
  const skillsScore = clamp(weighted, 1, 5);
  const staffScore = clamp(toNumber(player?.valoracionStaff) ?? 3, 1, 5);

  const playerId = String(player?.id || '');
  const partidos = Array.isArray(context?.partidos) ? context.partidos : [];
  const entrenos = Array.isArray(context?.entrenos) ? context.entrenos : [];

  const totalEntrenos = entrenos.length;
  const entrenosAs = entrenos.reduce((acc, e: any) => {
    const st = (e?.asistencia || []).find((a: any) => String(a?.id) === playerId);
    return acc + (st?.estado === 'AS' ? 1 : 0);
  }, 0);
  const entrenosPct = totalEntrenos > 0 ? entrenosAs / totalEntrenos : 0.5;

  let partidosAs = 0;
  let goles = 0;
  let minutos = 0;
  let gf = 0;
  let gc = 0;
  partidos.forEach((pa: any) => {
    const reg = (pa?.convocatoria || []).find((c: any) => String(c?.id) === playerId);
    if (reg?.estado === 'AS') {
      partidosAs += 1;
      goles += Number(reg?.goles || 0);
      const t = String(reg?.minutos || '0:00').split(':').map(Number);
      minutos += (Math.max(0, t[0] || 0) * 60) + Math.max(0, t[1] || 0);
      gf += Number(pa?.golesFavor || 0);
      gc += Number(pa?.golesContra || 0);
    }
  });
  const partidosPct = partidos.length > 0 ? partidosAs / partidos.length : 0.5;
  const golesPerMatch = partidosAs > 0 ? goles / partidosAs : 0;
  const golesNorm = clamp(golesPerMatch / 2, 0, 1);
  const minPerMatch = partidosAs > 0 ? minutos / partidosAs : 0;
  const minutosNorm = clamp(minPerMatch / 20, 0, 1);
  const favorContraPct = (gf + gc) > 0 ? gf / (gf + gc) : 0.5;
  const evals: EvalDI[] = Array.isArray(player?.evaluacionesDI) ? player.evaluacionesDI : [];
  const evalScored = evals
    .map((e) => clamp(Number(e?.score || 0), 1, 5))
    .filter((n) => Number.isFinite(n) && n > 0);
  const evaluacionDIScore = evalScored.length ? avg(evalScored) : null;
  const contextParts = [entrenosPct, partidosPct, golesNorm, minutosNorm, favorContraPct];
  if (evaluacionDIScore != null) contextParts.push((evaluacionDIScore - 1) / 4);
  const contextNorm = avg(contextParts);
  const contextScore = clamp(1 + 4 * contextNorm, 1, 5);
  const hasPersonal = evaluacionDIScore != null;
  const personalScore = hasPersonal ? clamp(evaluacionDIScore, 1, 5) : 0;

  // Cuando hay formulario personal: 45% IA + 15% Staff + 20% Personal + 20% Contexto
  // Sin formulario personal: el 20% se reparte proporcionalmente → 56.25% IA + 18.75% Staff + 25% Contexto
  const wSkills   = hasPersonal ? 0.45   : 0.5625;
  const wStaff    = hasPersonal ? 0.15   : 0.1875;
  const wPersonal = hasPersonal ? 0.20   : 0;
  const wContext  = hasPersonal ? 0.20   : 0.25;

  const rawScore = round1(
    skillsScore * wSkills +
    staffScore * wStaff +
    personalScore * wPersonal +
    contextScore * wContext
  );
  const score = clamp(Math.round(rawScore), 1, 5);

  const pctSkills = Math.round(wSkills * 100);
  const pctStaff = Math.round(wStaff * 100);
  const pctPersonal = Math.round(wPersonal * 100);
  const pctContext = Math.round(wContext * 100);

  const formula =
    `Tec ${round1(blocks.technique)}x${Math.round(weights.technique * 100)}% + ` +
    `Tac ${round1(blocks.tactic)}x${Math.round(weights.tactic * 100)}% + ` +
    `Fis ${round1(blocks.physical)}x${Math.round(weights.physical * 100)}% + ` +
    `Men ${round1(blocks.mental)}x${Math.round(weights.mental * 100)}%` +
    ` | IA=${round1(skillsScore)} (${pctSkills}%) + Staff ${round1(staffScore)} (${pctStaff}%)` +
    (hasPersonal
      ? ` + Form. personal ${round1(personalScore)} (${pctPersonal}%)`
      : '') +
    ` + Contexto ${round1(contextScore)} (${pctContext}%)`;

  return {
    score,
    rawScore,
    position: normalizePosition(player?.posicionPrincipal || player?.posicion || 'ala'),
    blocks: {
      technique: round1(blocks.technique),
      tactic: round1(blocks.tactic),
      physical: round1(blocks.physical),
      mental: round1(blocks.mental),
    },
    weights,
    context: {
      entrenosPct: round1(entrenosPct * 100),
      partidosPct: round1(partidosPct * 100),
      goles,
      minutos,
      favorContraPct: round1(favorContraPct * 100),
      evaluacionDIScore: evaluacionDIScore == null ? null : round1(evaluacionDIScore),
      staffScore: round1(staffScore),
      fichaPonderacionScore: round1(skillsScore),
      contextScore: round1(contextScore),
    },
    formula,
  };
}

export function calculateValoracionIA(player: any, context: RatingContext = {}): number {
  return explainValoracionIA(player, context).score;
}

function updateIAHistory(history: any, score: number): Array<{ ts: string; score: number }> {
  const safe = Array.isArray(history)
    ? history.filter((x) => x && Number.isFinite(Number(x.score)))
    : [];
  const next = [...safe];
  const last = next[next.length - 1];
  const ts = new Date().toISOString();

  if (!last || Math.abs(Number(last.score) - score) >= 0.1) {
    next.push({ ts, score });
  } else {
    next[next.length - 1] = { ...last, ts, score };
  }

  return next.slice(-30);
}

export function getIATrend(player: any): { delta: number; label: string } {
  const hist = Array.isArray(player?.iaHistory) ? player.iaHistory : [];
  if (hist.length < 2) return { delta: 0, label: 'estable' };
  const last = Number(hist[hist.length - 1]?.score ?? 0);
  const prev = Number(hist[hist.length - 2]?.score ?? 0);
  const delta = round1(last - prev);
  if (delta > 0.1) return { delta, label: 'sube' };
  if (delta < -0.1) return { delta, label: 'baja' };
  return { delta, label: 'estable' };
}

export function normalizePlayerRatings(player: any, previousPlayer?: any, context: RatingContext = {}): any {
  const staff = clamp(Math.round(toNumber(player?.valoracionStaff) ?? 3), 1, 5);
  const explain = explainValoracionIA({ ...player, valoracionStaff: staff }, context);
  const ia = explain.score;
  const priorHistory = previousPlayer?.iaHistory ?? player?.iaHistory;
  return {
    ...player,
    valoracionStaff: staff,
    valoracionIA: ia,
    valoracionIADetalle: explain.formula,
    iaHistory: updateIAHistory(priorHistory, ia),
  };
}

export function getPlayerCompositeScore(player: any): number {
  const staff = clamp(Math.round(toNumber(player?.valoracionStaff) ?? 3), 1, 5);
  const ia = clamp(Math.round(toNumber(player?.valoracionIA) ?? calculateValoracionIA(player)), 1, 5);
  return staff * 10 + ia * 6;
}
