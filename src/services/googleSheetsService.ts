/**
 * Servicio de sincronización con Google Sheets
 * Proporciona funciones para exportar e importar datos de Plantilla, Partidos y Entrenamientos.
 *
 * DÓNDE SE GUARDAN LOS EVENTOS EN EL SHEET:
 * - Hoja "Plantilla": jugadores (id, nombreCompleto, nominal, dorsal, posicion, etc.).
 * - Hoja "Partidos": cada fila = un partido (f, fecha, rival, goles_favor, goles_contra, Ubicion,
 *   Tipo_Competicion, autor_gol1..20, quinteto_gol1..20, minuto_Gol1..20, jugador_1..20, asist_1..20).
 * - Hoja "Entrenamientos": filas por asistencia (Fecha, Jugador, Asistencia, FECHA ENTRENAMIENTO).
 * El libro se identifica por SPREADSHEET_ID o por el ID guardado en AsyncStorage (Gestión de datos).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDateExport, formatDateGlobal, parseToDate } from '../utils/dateFormat';
import { explainValoracionIA } from '../utils/playerRating';

const USER_SPREADSHEET_KEY = '@futsal_user_spreadsheet_id';

function normalizeSpreadsheetId(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const urlMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (urlMatch?.[1]) return urlMatch[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) return raw;
  return raw;
}

/** ID del libro: el que guardó el usuario en Gestión de datos o el por defecto. */
async function getSpreadsheetId(): Promise<string> {
  try {
    const id = normalizeSpreadsheetId(await AsyncStorage.getItem(USER_SPREADSHEET_KEY));
    if (id) return id;
  } catch {}
  return normalizeSpreadsheetId(SPREADSHEET_ID);
}

/** Guarda el ID del libro para que export/import usen ese libro. */
export async function setUserSpreadsheetId(id: string | null): Promise<void> {
  const normalized = normalizeSpreadsheetId(id);
  if (!normalized) await AsyncStorage.removeItem(USER_SPREADSHEET_KEY);
  else await AsyncStorage.setItem(USER_SPREADSHEET_KEY, normalized);
}

/** Devuelve el ID actual (el configurado o el por defecto) para mostrarlo en la UI. */
export async function getCurrentSpreadsheetId(): Promise<string> {
  return getSpreadsheetId();
}

const HTML_JSON_HINT =
  'El servidor respondió con una página HTML en lugar de JSON. Suele pasar si: la URL /exec no es la de la última implementación, ' +
  'la app web no está publicada con acceso «Cualquiera», o Google devuelve una página de error. ' +
  'En Apps Script: Implementar → Nueva implementación → Aplicación web → Ejecutar como: tú → Quién tiene acceso: cualquiera. ' +
  'Copia la nueva URL /exec y actualízala en googleSheetsService.ts o en Gestión de datos.';

function stripBom(s: string): string {
  if (!s.length) return s;
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function looksLikeHtml(s: string): boolean {
  const t = stripBom(s).trim().slice(0, 800).toLowerCase();
  return (
    t.startsWith('<!') ||
    t.startsWith('<html') ||
    t.startsWith('<head') ||
    t.startsWith('<body') ||
    t.includes('<!doctype html')
  );
}

/**
 * Cuerpo de respuesta del script: debe ser JSON. Si llega HTML, no llamamos JSON.parse (evita "Unexpected character: <").
 */
function parseGoogleScriptBody(
  text: string,
  httpStatus: number
): { ok: true; data: any } | { ok: false; message: string } {
  const trimmed = stripBom(text).trim();
  if (!trimmed) {
    return { ok: false, message: `Respuesta vacía del servidor (HTTP ${httpStatus}). ${HTML_JSON_HINT}` };
  }
  if (looksLikeHtml(trimmed)) {
    return {
      ok: false,
      message: `Respuesta HTML en lugar de JSON (HTTP ${httpStatus}). ${HTML_JSON_HINT}`,
    };
  }
  const first = trimmed[0];
  if (first !== '{' && first !== '[') {
    return {
      ok: false,
      message: `El servidor no devolvió JSON (HTTP ${httpStatus}). ${HTML_JSON_HINT}`,
    };
  }
  try {
    return { ok: true, data: JSON.parse(trimmed) };
  } catch (e) {
    const em = e instanceof Error ? e.message : String(e);
    if (em.includes('<') || looksLikeHtml(trimmed)) {
      return { ok: false, message: `${HTML_JSON_HINT} (HTTP ${httpStatus})` };
    }
    return {
      ok: false,
      message: `JSON no válido (HTTP ${httpStatus}). ${HTML_JSON_HINT} Detalle: ${em.slice(0, 80)}`,
    };
  }
}

/** POST al script: text/plain evita preflight raro en algunos dispositivos; GAS lee postData.contents igual. */
async function postGoogleScript(
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal }
): Promise<{ ok: true; data: any } | { ok: false; message: string }> {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'TU_URL_DE_GOOGLE_APPS_SCRIPT_AQUI') {
    return { ok: false, message: 'Por favor configura GOOGLE_SCRIPT_URL en googleSheetsService.ts' };
  }
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
    return parseGoogleScriptBody(await response.text(), response.status);
  } catch (e) {
    const err = e as Error;
    if (err?.name === 'AbortError') {
      return { ok: false, message: 'Tiempo de espera agotado. Comprueba la conexión.' };
    }
    return { ok: false, message: `Error de red: ${err?.message || String(e)}` };
  }
}

// ⚠️ CONFIGURACIÓN REQUERIDA: Reemplaza con la URL de tu Google Apps Script
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwxPk0TuWza1MCn036IPRbXoYqjUyVbvBJXsPil4Bny2QMy932HFEEqSVR8TrLcrPB-xQ/exec';

// ID del libro de Google Sheets del que importar / al que exportar
const SPREADSHEET_ID = '1KpaCmUQH5JFjUJ7P26MVH4CRxSkpHpMvYRxZs1RddtQ';

// ID de carpeta de Google Drive para fotos de jugadores
const FOLDER_ID_FOTOS = '1VUPNFNggtYoXAVglFwNfWw8TD1BjmXWt';

// ID de carpeta de Google Drive para actas oficiales de partidos
export const FOLDER_ID_ACTAS = '1kYAmF1v4YgMEooXpmUVFgrnL0rV89-yV';
const FOLDER_NAME_ACTAS = 'Actas Partidos';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface PlantillaRow {
  id: string;
  nombreCompleto: string;
  nominal: string; // Nombre usado en la app
  fechaNacimiento: string;
  numeroLicencia: string;
  dorsal: string;
  posicion: string;
  edad: string;
  foto: string;
  player_json?: string;
}

// Header import/export: f, fecha, rival, goles_favor, goles_contra, Ubicion, Tipo_Competicion, autor_gol[1-20], quinteto_gol[1-20], minuto_Gol[1-20]
export interface PartidoRow {
  f?: string;
  id?: string;
  fecha: string;
  rival: string;
  goles_favor: string;
  goles_contra: string;
  Ubicion?: string;
  Tipo_Competicion?: string;
  [key: string]: string | undefined;
}

export interface EntrenamientoRow {
  Fecha: string;
  Jugador: string;
  Asistencia: 'AS' | 'AV' | 'NA';
  Objetivos?: string;
  'FECHA ENTRENAMIENTO': string;
}

export interface EvaluacionDIExportRow {
  row_id: string;
  jugador_id: string;
  jugador_nombre: string;
  eval_id: string;
  fecha_eval: string;
  fuente: string;
  score_eval: string;
  bloque: string;
  subbloque: string;
  pregunta: string;
  respuesta: string;
  puntuacion: string;
}

type MatrixCell = string | number;
type MatrixData = MatrixCell[][];
type EvaluacionDIKind = 'all' | 'ia' | 'personal';

// Tipos de datos internos de la app
interface Player {
  id: string;
  // nombre visible en la app (equivale a 'nominal' en la hoja)
  name: string;
  // dorsal / número de camiseta
  number: string;
  role: string;
  posicion: string;
  photo: string | null;
  // campos extendidos para sincronizar con Google Sheets (Plantilla)
  nombreCompleto?: string;
  nominal?: string;
  fechaNacimiento?: string;
  numeroLicencia?: string;
  edad?: string;
  evaluacionesDI?: any[];
}

interface Partido {
  id: string;
  rival: string;
  fecha: string;
  lugar: string;
  tipo: string;
  golesFavor: number;
  golesContra: number;
  convocatoria: Array<{
    id: string;
    name: string;
    role: string;
    estado: string;
    goles: number;
    esCapitan: boolean;
    minutos: string;
  }>;
  acta?: any;
  /** Si existe (cronómetro): autor, minuto, segundo, quintetoEnPista por gol */
  eventosGoles?: Array<{ autor?: string; minuto?: number; segundo?: number; tipo?: string; quintetoEnPista?: string }>;
}

interface Entrenamiento {
  id: number | string;
  fecha: string;
  asistencia: Array<{
    id: string;
    name: string;
    role: string;
    estado: 'AS' | 'AV' | 'NA';
  }>;
}

// ============================================================================
// FUNCIONES DE CONVERSIÓN DE DATOS
// ============================================================================

/**
 * Convierte un array de jugadores a formato de filas para Google Sheets (Plantilla)
 */
function convertPlayersToRows(players: Player[]): PlantillaRow[] {
  return players.map(player => ({
    id: player.id || '',
    // si tenemos nombreCompleto almacenado lo usamos, si no, usamos name
    nombreCompleto: player.nombreCompleto || player.name || '',
    // nominal es el nombre visible en la app; usamos 'nominal' o 'name'
    nominal: player.nominal || player.name || '',
    fechaNacimiento: player.fechaNacimiento || '',
    numeroLicencia: player.numeroLicencia || '',
    dorsal: player.number || '',
    posicion: player.posicion || '',
    edad: player.edad || '',
    foto: player.photo || '',
    // Snapshot completo del jugador para preservar ponderación IA y evaluaciones personales.
    player_json: JSON.stringify(player || {})
  }));
}

function parsePlayerJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function formatFechaDdMmAa(dateStr: string): string {
  return dateStr ? (formatDateExport(parseToDate(dateStr)) || dateStr) : '';
}

/**
 * Formato minuto:segundo para exportar (si existen minuto y segundo del gol)
 */
function formatMinutoGol(ev: { minuto?: number; segundo?: number }): string {
  const m = ev.minuto ?? 0;
  const s = ev.segundo ?? 0;
  if (m === 0 && s === 0) return '';
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Convierte un array de partidos a formato de filas para Google Sheets.
 * Si se pasa players (plantilla en orden), desde la col 68 se exporta una columna por jugador (nombre en cabecera, valor AS/AV/NA).
 */
function convertPartidosToRows(partidos: Partido[], players?: Player[]): (PartidoRow & { playerAsist?: string[] })[] {
  return partidos.map(partido => {
    const quintetoBase = partido.convocatoria.filter(c => c.estado === 'AS').map(c => c.name).join(', ');
    let goles: Array<{ autor: string; quinteto: string; minuto: string }>;

    const eventosFavor = (partido.eventosGoles || []).filter((ev: any) => ev.tipo === 'FAVOR').slice(0, 20);
    if (eventosFavor.length > 0) {
      goles = eventosFavor.map((ev: any) => ({
        autor: ev.autor || '',
        quinteto: ev.quintetoEnPista || '',
        minuto: formatMinutoGol(ev),
      }));
    } else {
      goles = partido.convocatoria
        .filter(p => (p.goles || 0) > 0)
        .flatMap(p => Array((p.goles || 0)).fill({ autor: p.name, quinteto: '', minuto: '' }))
        .slice(0, 20);
    }

    const row: PartidoRow & { playerAsist?: string[] } = {
      f: partido.id || '',
      id: partido.id || '',
      fecha: formatFechaDdMmAa(partido.fecha || '') || partido.fecha || '',
      rival: partido.rival || '',
      goles_favor: partido.golesFavor?.toString() || '0',
      goles_contra: partido.golesContra?.toString() || '0',
      Ubicion: partido.lugar || 'LOCAL',
      Tipo_Competicion: partido.tipo || 'LIGA',
    };

    for (let i = 1; i <= 20; i++) {
      const g = goles[i - 1];
      (row as any)[`autor_gol${i}`] = g?.autor || '';
      (row as any)[`quinteto_gol${i}`] = g?.quinteto || quintetoBase;
      (row as any)[`minuto_Gol${i}`] = g?.minuto || '';
    }

    if (players && players.length > 0) {
      const conv = partido.convocatoria || [];
      row.playerAsist = players.map(p => {
        const c = conv.find(c => c.id === p.id || (c.name || '').trim() === (p.nominal || p.name || '').trim());
        return (c?.estado && (c.estado === 'AV' || c.estado === 'NA')) ? c.estado : (c ? 'AS' : '');
      });
    } else {
      const conv = partido.convocatoria || [];
      for (let i = 1; i <= 20; i++) {
        const c = conv[i - 1];
        (row as any)[`jugador_${i}`] = c?.name || '';
        (row as any)[`asist_${i}`] = c?.estado || '';
      }
    }

    return row;
  });
}

/**
 * Convierte un array de entrenamientos a formato de filas para Google Sheets
 */
function convertEntrenamientosToRows(entrenamientos: Entrenamiento[]): EntrenamientoRow[] {
  const rows: EntrenamientoRow[] = [];
  
  entrenamientos.forEach(entreno => {
    entreno.asistencia.forEach(asistente => {
      rows.push({
        Fecha: entreno.fecha,
        Jugador: asistente.name,
        Asistencia: asistente.estado,
        Objetivos: (entreno as any).objetivos || '',
        'FECHA ENTRENAMIENTO': entreno.fecha
      });
    });
  });

  return rows;
}

/**
 * Convierte filas de Google Sheets a formato de jugadores de la app
 */
function convertRowsToPlayers(rows: PlantillaRow[]): Player[] {
  return rows.map(row => {
    const snapshot = parsePlayerJson((row as any).player_json);
    const generatedId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    return {
      ...snapshot,
      id: row.id || String((snapshot as any).id || generatedId),
      // en la app usamos 'name' como nominal (nombre visible)
      name: row.nominal || row.nombreCompleto || String((snapshot as any).name || (snapshot as any).nominal || ''),
      number: row.dorsal || String((snapshot as any).number || ''),
      role: String((snapshot as any).role || 'Jugador'),
      posicion: row.posicion || String((snapshot as any).posicion || 'Ala'),
      photo: row.foto || (snapshot as any).photo || null,
      nombreCompleto: row.nombreCompleto || String((snapshot as any).nombreCompleto || ''),
      nominal: row.nominal || row.nombreCompleto || String((snapshot as any).nominal || (snapshot as any).name || ''),
      fechaNacimiento: row.fechaNacimiento || String((snapshot as any).fechaNacimiento || ''),
      numeroLicencia: row.numeroLicencia || String((snapshot as any).numeroLicencia || ''),
      edad: row.edad || String((snapshot as any).edad || ''),
    } as Player;
  });
}

/**
 * Convierte filas de Google Sheets a formato de partidos de la app
 * Header: f, fecha, rival, goles_favor, goles_contra, Ubicion, Tipo_Competicion, autor_gol[1-20], quinteto_gol[1-20], minuto_Gol[1-20]
 * Mapea los 20 slots de goles sin pérdida de datos
 */
function convertRowsToPartidos(rows: PartidoRow[], players: Player[]): Partido[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is PartidoRow => row != null && typeof row === 'object').map(row => {
    let convocatoria: Array<{ id: string; name: string; role: string; estado: string; goles: number; esCapitan: boolean; minutos: string }> = [];

    // Si hay columnas jugador_1..asist_1 rellenadas, usarlas para convocatoria (con asistencia AS/AV/NA)
    const hasAsistencia = Array.from({ length: 20 }, (_, i) => (row as any)[`jugador_${i + 1}`]).some((v: string) => (v || '').trim() !== '');
    if (hasAsistencia) {
      for (let i = 1; i <= 20; i++) {
        const nombre = String((row as any)[`jugador_${i}`] || '').trim();
        if (!nombre) continue;
        const estado = String((row as any)[`asist_${i}`] || 'AS').trim().toUpperCase();
        const asistVal = (estado === 'AV' || estado === 'NA') ? estado : 'AS';
        const player = players.find(p => (p.nominal || p.name || p.nombreCompleto || '').trim() === nombre);
        if (player) {
          convocatoria.push({
            id: player.id,
            name: player.nominal || player.name,
            role: player.role,
            estado: asistVal,
            goles: 0,
            esCapitan: false,
            minutos: '0:00'
          });
        } else {
          convocatoria.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: nombre,
            role: 'Jugador',
            estado: asistVal,
            goles: 0,
            esCapitan: false,
            minutos: '0:00'
          });
        }
      }
    }

    // Si no había columnas de asistencia, reconstruir convocatoria desde autor_gol y quinteto_gol
    if (convocatoria.length === 0) {
      const nombresUsados = new Set<string>();
      for (let i = 1; i <= 20; i++) {
        const autor = String((row as any)[`autor_gol${i}`] || '').trim();
        if (autor) nombresUsados.add(autor);
        const quinteto = String((row as any)[`quinteto_gol${i}`] || '');
        quinteto.split(',').forEach((n: string) => { const t = n.trim(); if (t) nombresUsados.add(t); });
      }
      nombresUsados.forEach(nombre => {
        const player = players.find(p => (p.nominal || p.name || p.nombreCompleto || '').trim() === nombre);
        if (player) {
          convocatoria.push({ id: player.id, name: player.nominal || player.name, role: player.role, estado: 'AS', goles: 0, esCapitan: false, minutos: '0:00' });
        } else {
          convocatoria.push({ id: Date.now().toString() + Math.random().toString(36).substr(2, 9), name: nombre, role: 'Jugador', estado: 'AS', goles: 0, esCapitan: false, minutos: '0:00' });
        }
      });
      if (convocatoria.length === 0) {
        convocatoria = players.map(p => ({ id: p.id, name: p.nominal || p.name, role: p.role, estado: 'AS', goles: 0, esCapitan: false, minutos: '0:00' }));
      }
    }

    // Normalizar nombre para comparar (trim + minúsculas) y buscar en convocatoria
    const norm = (s: string) => String(s || '').trim().toLowerCase();
    const findConvocadoByName = (autorName: string) =>
      convocatoria.find(c => norm(c.name) === norm(autorName));

    // Asegurar que todo autor que marca gol esté en convocatoria (añadir si falta)
    for (let i = 1; i <= 20; i++) {
      const autor = String((row as any)[`autor_gol${i}`] || '').trim();
      if (!autor) continue;
      if (!findConvocadoByName(autor)) {
        const player = players.find(p => norm(p.nominal || p.name || p.nombreCompleto || '') === norm(autor));
        convocatoria.push({
          id: player?.id ?? (Date.now().toString() + Math.random().toString(36).substr(2, 9)),
          name: player ? (player.nominal || player.name) : autor,
          role: player?.role ?? 'Jugador',
          estado: 'AS',
          goles: 0,
          esCapitan: false,
          minutos: '0:00',
        });
      }
    }

    // Contar goles por autor: autor_gol1..20
    const golesPorId: { [id: string]: number } = {};
    for (let i = 1; i <= 20; i++) {
      const autor = String((row as any)[`autor_gol${i}`] || '').trim();
      if (!autor) continue;
      const conv = findConvocadoByName(autor);
      if (conv) {
        golesPorId[conv.id] = (golesPorId[conv.id] || 0) + 1;
      }
    }

    convocatoria.forEach(conv => {
      if (golesPorId[conv.id]) conv.goles = golesPorId[conv.id];
    });

    const lugar = (row.Ubicion || row.lugar || 'LOCAL').toString().toUpperCase();
    const tipo = (row.Tipo_Competicion || row.tipo || 'LIGA').toString().toUpperCase();

    const fechaNormalizada = formatDateGlobal(row.fecha || row.f || '') || String(row.fecha || '');
    const idBase = String(row.f || row.id || `${fechaNormalizada}_${row.rival || 'partido'}`).trim();
    return {
      id: idBase || Date.now().toString(),
      rival: row.rival || '',
      fecha: fechaNormalizada,
      lugar: lugar === 'VISITANTE' ? 'VISITANTE' : 'LOCAL',
      tipo: ['LIGA', 'COPA', 'AMISTOSO', 'OTRO'].includes(tipo) ? tipo : 'LIGA',
      golesFavor: parseInt(row.goles_favor) || 0,
      golesContra: parseInt(row.goles_contra) || 0,
      convocatoria
    };
  });
}

/**
 * Convierte filas de Google Sheets a formato de entrenamientos de la app
 * Mapea correctamente AS, AV, NA al estado de asistencia
 */
function convertRowsToEntrenamientos(rows: any[], players: Player[] = []): Entrenamiento[] {
  const entrenamientosMap: { [fecha: string]: Entrenamiento } = {};

  rows.forEach(row => {
    const fechaKeyRaw = row['FECHA ENTRENAMIENTO'] || row.Fecha || row.fecha;
    const fechaKey = formatDateGlobal(fechaKeyRaw) || String(fechaKeyRaw || '');
    if (!fechaKey) return;

    const jugadorName = String(row.Jugador || row.nombre || row.name || '').trim();
    if (!jugadorName) return;

    // Columna de asistencia: buscar por nombre flexible
    const colAsistencia = Object.keys(row).find(
      k => k.toLowerCase().includes('asistencia')
    ) || Object.keys(row).find(
      k => k.toLowerCase() === 'as' || k.toLowerCase() === 'av' || k.toLowerCase() === 'na'
    ) || (Object.keys(row).length > 2 ? Object.keys(row)[2] : null);

    let estado: 'AS' | 'AV' | 'NA' = 'NA';
    const rawVal = colAsistencia ? String(row[colAsistencia] || '').trim().toUpperCase() : '';
    if (rawVal === 'AS') estado = 'AS';
    else if (rawVal === 'AV') estado = 'AV';
    else if (rawVal === 'NA') estado = 'NA';

    if (!entrenamientosMap[fechaKey]) {
      entrenamientosMap[fechaKey] = {
        id: fechaKey,
        fecha: fechaKey,
        asistencia: []
      };
    }

    const player = players.find(
      p => (p.nominal || p.name || p.nombreCompleto || '').trim() === jugadorName
    );

    entrenamientosMap[fechaKey].asistencia.push({
      id: player?.id || jugadorName,
      name: jugadorName,
      role: player?.role || 'Jugador',
      estado
    });
  });

  return Object.values(entrenamientosMap);
}

function convertEvaluacionesDIToRows(players: Player[]): EvaluacionDIExportRow[] {
  const rows: EvaluacionDIExportRow[] = [];
  players.forEach((p) => {
    const evals = Array.isArray((p as any)?.evaluacionesDI) ? (p as any).evaluacionesDI : [];
    evals.forEach((ev: any, evIdx: number) => {
      const evalId = String(ev?.id || `ev-${evIdx}`);
      const jugadorId = String(p.id || '');
      const jugadorNombre = String((p as any).nominal || p.name || '').trim();
      const fechaEval = String(ev?.fecha || '');
      const fuente = String(ev?.fuente || 'apk');
      const scoreEval = String(ev?.score ?? '');
      const bloques = Array.isArray(ev?.bloques) ? ev.bloques : [];

      if (!bloques.length) {
        const rowId = `${jugadorId}__${evalId}__root`;
        rows.push({
          row_id: rowId,
          jugador_id: jugadorId,
          jugador_nombre: jugadorNombre,
          eval_id: evalId,
          fecha_eval: fechaEval,
          fuente,
          score_eval: scoreEval,
          bloque: '',
          subbloque: '',
          pregunta: '',
          respuesta: '',
          puntuacion: '',
        });
        return;
      }

      bloques.forEach((b: any, bIdx: number) => {
        const bloque = String(b?.bloque || '');
        const subbloque = String(b?.subbloque || '');
        const preguntas = Array.isArray(b?.preguntas) ? b.preguntas : [];
        if (!preguntas.length) {
          const rowId = `${jugadorId}__${evalId}__${bIdx}__root`;
          rows.push({
            row_id: rowId,
            jugador_id: jugadorId,
            jugador_nombre: jugadorNombre,
            eval_id: evalId,
            fecha_eval: fechaEval,
            fuente,
            score_eval: scoreEval,
            bloque,
            subbloque,
            pregunta: '',
            respuesta: '',
            puntuacion: String(b?.media ?? ''),
          });
          return;
        }
        preguntas.forEach((q: any, qIdx: number) => {
          const rowId = `${jugadorId}__${evalId}__${bIdx}__${qIdx}`;
          rows.push({
            row_id: rowId,
            jugador_id: jugadorId,
            jugador_nombre: jugadorNombre,
            eval_id: evalId,
            fecha_eval: fechaEval,
            fuente,
            score_eval: scoreEval,
            bloque,
            subbloque,
            pregunta: String(q?.pregunta || ''),
            respuesta: String(q?.respuesta || ''),
            puntuacion: String(q?.puntuacion ?? ''),
          });
        });
      });
    });
  });
  return rows;
}

function isIADetailEvaluation(ev: any): boolean {
  return Array.isArray(ev?.bloques) && ev.bloques.length > 0;
}

function shouldKeepEvalByKind(ev: any, kind: EvaluacionDIKind): boolean {
  if (kind === 'all') return true;
  const isIA = isIADetailEvaluation(ev);
  return kind === 'ia' ? isIA : !isIA;
}

function convertEvaluacionesDIToRowsByKind(players: Player[], kind: EvaluacionDIKind): EvaluacionDIExportRow[] {
  if (kind === 'all') return convertEvaluacionesDIToRows(players);
  const filteredPlayers = players.map((p: any) => ({
    ...p,
    evaluacionesDI: (Array.isArray(p?.evaluacionesDI) ? p.evaluacionesDI : []).filter((ev: any) =>
      shouldKeepEvalByKind(ev, kind)
    ),
  }));
  return convertEvaluacionesDIToRows(filteredPlayers as Player[]);
}

function toNum(v: unknown): number | null {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function clampRange(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function avgNumbers(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function normalizeFechaForSort(raw: unknown): number {
  const s = String(raw ?? '').trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : 0;
}

function getRosterPlayers(players: Player[]): Player[] {
  const base = (players || []).filter((p) => p && typeof p === 'object');
  const onlyPlayers = base.filter((p: any) => String((p as any).role || '').toLowerCase() === 'jugador');
  return onlyPlayers.length ? onlyPlayers : base;
}

function getNominal(player: any): string {
  return String(player?.nominal || player?.name || player?.nombreCompleto || player?.id || '').trim();
}

function resolveIAScore(player: any): number {
  const current = toNum(player?.valoracionIA);
  if (current != null) return clampRange(current, 1, 5);
  return clampRange(explainValoracionIA(player).score, 1, 5);
}

function computeAdjustment(baseScore: number, teamAvg: number): number {
  const delta = (baseScore - teamAvg) * 0.1;
  return round2(clampRange(delta, -0.05, 0.05));
}

function buildIAMatrix(players: Player[]): MatrixData {
  const roster = getRosterPlayers(players);
  const names = roster.map((p, idx) => getNominal(p) || `Jugador ${idx + 1}`);
  const matrix: MatrixData = [['Pregunta', ...names, 'Resultado valoracion']];
  const iaRows: Array<{ label: string; key: string }> = [
    { label: 'Control', key: 'control' },
    { label: 'Pase', key: 'pase' },
    { label: 'Lectura de juego', key: 'lecturaJuego' },
    { label: 'Toma de decision', key: 'tomaDecision' },
    { label: 'Velocidad', key: 'velocidad' },
    { label: 'Resistencia', key: 'resistencia' },
    { label: 'Concentracion', key: 'concentracion' },
    { label: 'Competitividad', key: 'competitividad' },
  ];

  matrix.push(['BLOQUE TECNICO', ...names.map(() => ''), '']);
  iaRows.slice(0, 2).forEach((rowDef) => {
    const nums = roster.map((p: any) => toNum(p?.[rowDef.key]));
    const rowNums = nums.filter((n): n is number => n != null).map((n) => clampRange(n, 1, 5));
    const rowAvg = avgNumbers(rowNums);
    matrix.push([rowDef.label, ...nums.map((n) => (n == null ? '' : round2(clampRange(n, 1, 5)))), rowAvg == null ? '' : round2(rowAvg)]);
  });
  matrix.push(['BLOQUE TACTICO', ...names.map(() => ''), '']);
  iaRows.slice(2, 4).forEach((rowDef) => {
    const nums = roster.map((p: any) => toNum(p?.[rowDef.key]));
    const rowNums = nums.filter((n): n is number => n != null).map((n) => clampRange(n, 1, 5));
    const rowAvg = avgNumbers(rowNums);
    matrix.push([rowDef.label, ...nums.map((n) => (n == null ? '' : round2(clampRange(n, 1, 5)))), rowAvg == null ? '' : round2(rowAvg)]);
  });
  matrix.push(['BLOQUE FISICO', ...names.map(() => ''), '']);
  iaRows.slice(4, 6).forEach((rowDef) => {
    const nums = roster.map((p: any) => toNum(p?.[rowDef.key]));
    const rowNums = nums.filter((n): n is number => n != null).map((n) => clampRange(n, 1, 5));
    const rowAvg = avgNumbers(rowNums);
    matrix.push([rowDef.label, ...nums.map((n) => (n == null ? '' : round2(clampRange(n, 1, 5)))), rowAvg == null ? '' : round2(rowAvg)]);
  });
  matrix.push(['BLOQUE MENTAL', ...names.map(() => ''), '']);
  iaRows.slice(6).forEach((rowDef) => {
    const nums = roster.map((p: any) => toNum(p?.[rowDef.key]));
    const rowNums = nums.filter((n): n is number => n != null).map((n) => clampRange(n, 1, 5));
    const rowAvg = avgNumbers(rowNums);
    matrix.push([rowDef.label, ...nums.map((n) => (n == null ? '' : round2(clampRange(n, 1, 5)))), rowAvg == null ? '' : round2(rowAvg)]);
  });

  const baseScores = roster.map((p) => resolveIAScore(p));
  const teamAvg = avgNumbers(baseScores) ?? 0;
  const adjustments = baseScores.map((s) => computeAdjustment(s, teamAvg));
  const finalScores = baseScores.map((s, i) => round2(clampRange(s + adjustments[i], 1, 5)));

  matrix.push(['RESULTADO IA BASE (0-5)', ...baseScores.map((s) => round2(s)), teamAvg ? round2(teamAvg) : '']);
  matrix.push(['VALORACION GLOBAL EQUIPO (0-5)', ...baseScores.map(() => (teamAvg ? round2(teamAvg) : '')), teamAvg ? round2(teamAvg) : '']);
  matrix.push(['AJUSTE POR EQUIPO', ...adjustments.map((a) => round2(a)), 0]);
  matrix.push(['RESULTADO IA FINAL AJUSTADO (0-5)', ...finalScores.map((s) => round2(s)), teamAvg ? round2(teamAvg) : '']);
  return matrix;
}

function getLatestPersonalEval(player: any): any {
  const evals = Array.isArray(player?.evaluacionesDI) ? player.evaluacionesDI : [];
  const personal = evals.filter((ev: any) => ev?.personalForm && typeof ev.personalForm === 'object');
  if (!personal.length) return null;
  const sorted = [...personal].sort((a, b) => normalizeFechaForSort(a?.fecha) - normalizeFechaForSort(b?.fecha));
  return sorted[sorted.length - 1];
}

function buildPersonalMatrix(players: Player[]): MatrixData {
  const roster = getRosterPlayers(players);
  const names = roster.map((p, idx) => getNominal(p) || `Jugador ${idx + 1}`);
  const latestByPlayer = roster.map((p) => getLatestPersonalEval(p));
  const allKeys = new Set<string>();
  latestByPlayer.forEach((ev) => {
    const answers = ev?.personalForm?.answers;
    if (answers && typeof answers === 'object') {
      Object.keys(answers).forEach((k) => allKeys.add(k));
    }
  });

  const questionKeys = Array.from(allKeys.values()).sort((a, b) => a.localeCompare(b));
  const matrix: MatrixData = [['Pregunta', ...names, 'Resultado valoracion']];
  matrix.push(['FORMULARIO PERSONAL', ...names.map(() => ''), '']);
  questionKeys.forEach((k) => {
    const values = latestByPlayer.map((ev: any) => String(ev?.personalForm?.answers?.[k] ?? '').trim());
    const numericValues = values.map((v) => toNum(v)).filter((n): n is number => n != null).map((n) => clampRange(n, 0, 5));
    const rowAvg = avgNumbers(numericValues);
    matrix.push([k, ...values, rowAvg == null ? '' : round2(rowAvg)]);
  });

  const baseScores = latestByPlayer.map((ev: any) => {
    const n = toNum(ev?.score);
    return n == null ? null : clampRange(n, 1, 5);
  });
  const baseOnly = baseScores.filter((n): n is number => n != null);
  const teamAvg = avgNumbers(baseOnly) ?? 0;
  const adjustments = baseScores.map((s) => (s == null ? '' : computeAdjustment(s, teamAvg)));
  const finalScores = baseScores.map((s, idx) => (s == null ? '' : round2(clampRange(s + Number(adjustments[idx] || 0), 1, 5))));

  matrix.push(['RESULTADO PERSONAL BASE (0-5)', ...baseScores.map((s) => (s == null ? '' : round2(s))), teamAvg ? round2(teamAvg) : '']);
  matrix.push(['VALORACION GLOBAL EQUIPO (0-5)', ...baseScores.map((s) => (s == null ? '' : round2(teamAvg))), teamAvg ? round2(teamAvg) : '']);
  matrix.push(['AJUSTE POR EQUIPO', ...adjustments, 0]);
  matrix.push(['RESULTADO PERSONAL FINAL AJUSTADO (0-5)', ...finalScores, teamAvg ? round2(teamAvg) : '']);
  return matrix;
}

function buildHistoricoEvaluacionesMatrix(players: Player[]): MatrixData {
  const roster = getRosterPlayers(players);
  const names = roster.map((p, idx) => getNominal(p) || `Jugador ${idx + 1}`);
  const byDateAndPlayer = new Map<string, number>();
  const datesSet = new Set<string>();

  roster.forEach((p) => {
    const nominal = getNominal(p);
    const evals = Array.isArray((p as any)?.evaluacionesDI) ? (p as any).evaluacionesDI : [];
    evals.forEach((ev: any) => {
      const fecha = String(ev?.fecha || '').trim();
      const score = toNum(ev?.score);
      if (!fecha || score == null) return;
      const safeScore = round2(clampRange(score, 1, 5));
      datesSet.add(fecha);
      byDateAndPlayer.set(`${fecha}\u0000${nominal}`, safeScore);
    });
  });

  const dates = Array.from(datesSet.values()).sort((a, b) => normalizeFechaForSort(a) - normalizeFechaForSort(b));
  const matrix: MatrixData = [['Fecha evaluacion', ...names]];
  dates.forEach((fecha) => {
    const row: MatrixCell[] = [fecha];
    names.forEach((n) => row.push(byDateAndPlayer.get(`${fecha}\u0000${n}`) ?? ''));
    matrix.push(row);
  });
  return matrix;
}

function groupEvaluacionDIRows<T extends { jugador_id?: string; eval_id?: string }>(
  rows: T[],
  keyFn: (row: T) => string
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

function parseEvalScoreCell(s: string): number {
  const n = Number(String(s ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Reconstruye un objeto evaluación a partir de filas planas de la hoja Evaluacion_DI. */
function rebuildEvalFromSheetRows(evalId: string, evRows: EvaluacionDIExportRow[]): Record<string, unknown> {
  const sorted = [...evRows].sort((a, b) => String(a.row_id).localeCompare(String(b.row_id)));
  const first = sorted[0];
  const allRoot = sorted.every(
    (r) =>
      !String(r.bloque || '').trim() &&
      !String(r.subbloque || '').trim() &&
      !String(r.pregunta || '').trim()
  );
  if (allRoot) {
    return {
      id: evalId,
      fecha: String(first.fecha_eval || ''),
      score: parseEvalScoreCell(String(first.score_eval)),
      fuente: String(first.fuente || 'sheet'),
      observaciones: '',
      edad: 0,
      experienciaFS: 0,
    };
  }

  type Blk = {
    bloque: string;
    subbloque: string;
    preguntas: Array<{ pregunta: string; respuesta: string; puntuacion: number }>;
    media: number;
  };
  const bloqueMap = new Map<string, Blk>();
  for (const r of sorted) {
    const bloque = String(r.bloque || '');
    const subbloque = String(r.subbloque || '');
    const key = `${bloque}\0${subbloque}`;
    if (!bloqueMap.has(key)) {
      bloqueMap.set(key, { bloque, subbloque, preguntas: [], media: 0 });
    }
    const e = bloqueMap.get(key)!;
    const pq = String(r.pregunta || '').trim();
    if (pq) {
      e.preguntas.push({
        pregunta: String(r.pregunta || ''),
        respuesta: String(r.respuesta || ''),
        puntuacion: parseEvalScoreCell(String(r.puntuacion)),
      });
    } else if (String(r.puntuacion || '').trim() !== '') {
      e.media = parseEvalScoreCell(String(r.puntuacion));
    }
  }

  const bloques = Array.from(bloqueMap.values()).map((b) => {
    let media = b.media;
    if (b.preguntas.length > 0) {
      const nums = b.preguntas.map((q) => q.puntuacion).filter((n) => Number.isFinite(n));
      if (nums.length > 0) {
        media = nums.reduce((a, x) => a + x, 0) / nums.length;
      }
    }
    return {
      bloque: b.bloque,
      subbloque: b.subbloque,
      preguntas: b.preguntas,
      media: Math.round(media * 10) / 10,
    };
  });

  return {
    id: evalId,
    fecha: String(first.fecha_eval || ''),
    score: parseEvalScoreCell(String(first.score_eval)),
    fuente: String(first.fuente || 'sheet'),
    bloques,
  };
}

function isRootOnlyEvaluationRows(evRows: EvaluacionDIExportRow[]): boolean {
  return evRows.every(
    (r) =>
      !String(r.bloque || '').trim() &&
      !String(r.subbloque || '').trim() &&
      !String(r.pregunta || '').trim()
  );
}

/** Sustituye evaluacionesDI en cada jugador que tenga filas en el sheet; el resto no cambia. */
function applyImportedEvaluacionesDIToPlayers(players: Player[], rows: EvaluacionDIExportRow[], kind: EvaluacionDIKind = 'all'): Player[] {
  if (!Array.isArray(rows) || rows.length === 0) return players;
  const byPlayer = groupEvaluacionDIRows(rows, (r) => String(r.jugador_id || '').trim());

  return players.map((p) => {
    const jid = String(p.id || '').trim();
    const prows = byPlayer.get(jid);
    if (!prows?.length) return p;

    const byEval = groupEvaluacionDIRows(prows, (r) => String(r.eval_id || '').trim());
    const evals: Record<string, unknown>[] = [];
    for (const [eid, evRows] of byEval) {
      if (!eid) continue;
      const isRootOnly = isRootOnlyEvaluationRows(evRows as EvaluacionDIExportRow[]);
      if (kind === 'ia' && isRootOnly) continue;
      if (kind === 'personal' && !isRootOnly) continue;
      evals.push(rebuildEvalFromSheetRows(eid, evRows));
    }
    evals.sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
    return { ...p, evaluacionesDI: evals } as Player;
  });
}

// ============================================================================
// FUNCIONES DE EXPORTACIÓN
// ============================================================================

/**
 * Exporta la plantilla de jugadores a Google Sheets
 */
export async function exportPlantilla(players: Player[]): Promise<{ success: boolean; message: string }> {
  try {
    const rows = convertPlayersToRows(players);
    const parsed = await postGoogleScript({
      action: 'exportPlantilla',
      spreadsheetId: await getSpreadsheetId(),
      data: rows,
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    return result.success 
      ? { success: true, message: 'Plantilla exportada correctamente' }
      : { success: false, message: result.message || 'Error al exportar plantilla' };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${(error as Error).message}` };
  }
}

/**
 * Exporta los partidos a Google Sheets.
 * Si se pasa players (plantilla en orden), la columna 68 en adelante será una por jugador (incl. staff) con AS/AV/NA.
 */
export async function exportPartidos(partidos: Partido[], players?: Player[]): Promise<{ success: boolean; message: string }> {
  try {
    const rows = convertPartidosToRows(partidos, players);
    const parsed = await postGoogleScript({
      action: 'exportPartidos',
      spreadsheetId: await getSpreadsheetId(),
      data: rows,
      players: players ? players.map(p => ({ id: p.id, name: p.name, nominal: p.nominal })) : undefined,
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    return result.success 
      ? { success: true, message: result.message || 'Partidos exportados correctamente' }
      : { success: false, message: result.message || 'Error al exportar partidos' };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${(error as Error).message}` };
  }
}

/**
 * Exporta solo los partidos que aún no están en el Sheet (evita duplicados).
 * Compara por id o por combinación fecha + rival. Maneja errores de red.
 */
export async function exportPartidosSoloNuevos(
  partidos: Partido[],
  players: Player[] = []
): Promise<{ success: boolean; message: string; exportedCount?: number }> {
  try {
    const existing = await importPartidos(players);
    if (!existing.success || !existing.data) {
      return { success: false, message: existing.message || 'No se pudo leer el Sheet' };
    }
    const existingKeys = new Set<string>();
    existing.data.forEach((p: Partido) => {
      if (p.id) existingKeys.add(String(p.id));
      const key = `${(p.fecha || '').trim()}_${(p.rival || '').trim()}`;
      if (key !== '_') existingKeys.add(key);
    });
    const nuevos = partidos.filter((p: Partido) => {
      if (p.id && existingKeys.has(String(p.id))) return false;
      const key = `${(p.fecha || '').trim()}_${(p.rival || '').trim()}`;
      return key === '_' || !existingKeys.has(key);
    });
    if (nuevos.length === 0) {
      return { success: true, message: 'No hay partidos nuevos para exportar.', exportedCount: 0 };
    }
    const rows = convertPartidosToRows(nuevos, players);
    const parsed = await postGoogleScript({
      action: 'exportPartidos',
      spreadsheetId: await getSpreadsheetId(),
      data: rows,
      appendOnly: true,
      players: players.length ? players.map(p => ({ id: p.id, name: p.name, nominal: p.nominal })) : undefined,
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    if (result.success) {
      return { success: true, message: result.message || `Exportados ${nuevos.length} partido(s) nuevo(s).`, exportedCount: nuevos.length };
    }
    return { success: false, message: result.message || 'Error al exportar' };
  } catch (error) {
    return { success: false, message: `Error de red: ${(error as Error).message}` };
  }
}

/**
 * Exporta los entrenamientos a Google Sheets
 */
export async function exportEntrenamientos(entrenamientos: Entrenamiento[]): Promise<{ success: boolean; message: string }> {
  try {
    const rows = convertEntrenamientosToRows(entrenamientos);
    const parsed = await postGoogleScript({
      action: 'exportEntrenamientos',
      spreadsheetId: await getSpreadsheetId(),
      data: rows,
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    return result.success 
      ? { success: true, message: 'Entrenamientos exportados correctamente' }
      : { success: false, message: result.message || 'Error al exportar entrenamientos' };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${(error as Error).message}` };
  }
}

/**
 * Exporta solo las sesiones de entrenamiento que no están ya en el Sheet (por fecha).
 * Evita duplicados y maneja errores de red.
 */
export async function exportEntrenamientosSoloNuevos(
  entrenamientos: Entrenamiento[],
  players: Player[] = []
): Promise<{ success: boolean; message: string; exportedCount?: number }> {
  try {
    const existing = await importEntrenamientos(players);
    if (!existing.success || !existing.data) {
      return { success: false, message: existing.message || 'No se pudo leer el Sheet' };
    }
    const existingFechas = new Set<string>();
    existing.data.forEach((e: Entrenamiento) => existingFechas.add(String(e.fecha || '').trim()));
    const nuevos = entrenamientos.filter((e: Entrenamiento) => !existingFechas.has(String(e.fecha || '').trim()));
    if (nuevos.length === 0) {
      return { success: true, message: 'No hay entrenamientos nuevos para exportar.', exportedCount: 0 };
    }
    const rows = convertEntrenamientosToRows(nuevos);
    const parsed = await postGoogleScript({
      action: 'exportEntrenamientos',
      spreadsheetId: await getSpreadsheetId(),
      data: rows,
      appendOnly: true,
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    if (result.success) {
      return { success: true, message: result.message || `Exportadas ${nuevos.length} sesión(es) nueva(s).`, exportedCount: nuevos.length };
    }
    return { success: false, message: result.message || 'Error al exportar' };
  } catch (error) {
    return { success: false, message: `Error de red: ${(error as Error).message}` };
  }
}

/**
 * Exporta evaluaciones D.I. a la pestaña Evaluacion_DI (autocreada por el GAS).
 * Deduplicación por row_id en servidor.
 */
export async function exportEvaluacionesDI(players: Player[]): Promise<{ success: boolean; message: string; inserted?: number }> {
  return exportEvaluacionesDIByKind(players, 'all');
}

async function exportEvaluacionesDIByKind(
  players: Player[],
  kind: EvaluacionDIKind
): Promise<{ success: boolean; message: string; inserted?: number }> {
  try {
    const rows = convertEvaluacionesDIToRowsByKind(players, kind);
    if (!rows.length) return { success: true, message: 'Sin evaluaciones D.I. para exportar', inserted: 0 };

    const parsed = await postGoogleScript({
      action: 'exportEvaluacionesDI',
      spreadsheetId: await getSpreadsheetId(),
      data: rows,
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    if (result.success) {
      return { success: true, message: result.message || 'Evaluaciones D.I. exportadas', inserted: Number(result.inserted || 0) };
    }
    return { success: false, message: result.message || 'Error al exportar Evaluacion_DI' };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${(error as Error).message}` };
  }
}

export async function exportEvaluacionesDIIA(players: Player[]): Promise<{ success: boolean; message: string; inserted?: number }> {
  return exportEvaluacionesDIByKind(players, 'ia');
}

export async function exportEvaluacionesDIPersonal(players: Player[]): Promise<{ success: boolean; message: string; inserted?: number }> {
  return exportEvaluacionesDIByKind(players, 'personal');
}

async function exportEvaluacionesDIViewsByKind(
  players: Player[],
  kind: 'ia' | 'personal' | 'all'
): Promise<{ success: boolean; message: string; iaRows?: number; personalRows?: number; players?: number }> {
  try {
    const body: Record<string, unknown> = {
      action: 'exportEvaluacionesDIViews',
      spreadsheetId: await getSpreadsheetId(),
      updateIA: kind !== 'personal',
      updatePersonal: kind !== 'ia',
      updateHistorico: true,
      historicoMatrix: buildHistoricoEvaluacionesMatrix(players),
    };
    if (kind !== 'personal') body.iaMatrix = buildIAMatrix(players);
    if (kind !== 'ia') body.personalMatrix = buildPersonalMatrix(players);

    const parsed = await postGoogleScript(body);
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    if (result.success) {
      return {
        success: true,
        message: result.message || 'Vistas D.I. exportadas',
        iaRows: Number(result.iaRows || 0),
        personalRows: Number(result.personalRows || 0),
        players: Number(result.players || 0),
      };
    }
    return { success: false, message: result.message || 'Error al exportar vistas D.I.' };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${(error as Error).message}` };
  }
}

export async function exportEvaluacionesDIViews(
  players: Player[]
): Promise<{ success: boolean; message: string; iaRows?: number; personalRows?: number; players?: number }> {
  return exportEvaluacionesDIViewsByKind(players, 'all');
}

export async function exportEvaluacionesDIViewsIA(
  players: Player[]
): Promise<{ success: boolean; message: string; iaRows?: number; personalRows?: number; players?: number }> {
  return exportEvaluacionesDIViewsByKind(players, 'ia');
}

export async function exportEvaluacionesDIViewsPersonal(
  players: Player[]
): Promise<{ success: boolean; message: string; iaRows?: number; personalRows?: number; players?: number }> {
  return exportEvaluacionesDIViewsByKind(players, 'personal');
}

/**
 * Importa la hoja Evaluacion_DI y fusiona en la plantilla actual (solo jugadores con filas en el sheet).
 */
export async function importEvaluacionesDI(players: Player[]): Promise<{
  success: boolean;
  data?: Player[];
  message: string;
  jugadoresActualizados?: number;
}> {
  return importEvaluacionesDIByKind(players, 'all');
}

async function importEvaluacionesDIByKind(
  players: Player[],
  kind: EvaluacionDIKind
): Promise<{
  success: boolean;
  data?: Player[];
  message: string;
  jugadoresActualizados?: number;
}> {
  try {
    const parsed = await postGoogleScript({
      action: 'importEvaluacionesDI',
      spreadsheetId: await getSpreadsheetId(),
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data as { success?: boolean; data?: unknown; message?: string };
    if (!result.success) {
      return { success: false, message: result.message || 'Error al importar Evaluacion_DI' };
    }
    const raw = result.data;
    if (!Array.isArray(raw) || raw.length === 0) {
      return {
        success: true,
        data: players,
        message: 'La hoja Evaluacion_DI está vacía; la plantilla no se modificó.',
        jugadoresActualizados: 0,
      };
    }
    const rows = raw as EvaluacionDIExportRow[];
    const sheetJugadorIds = new Set(rows.map((r) => String(r.jugador_id || '').trim()).filter(Boolean));
    const merged = applyImportedEvaluacionesDIToPlayers(players, rows, kind);
    const actualizados = players.filter((p) => sheetJugadorIds.has(String(p.id || '').trim())).length;
    return {
      success: true,
      data: merged,
      message: `Formularios D.I. importados (${rows.length} filas). Jugadores actualizados: ${actualizados}.`,
      jugadoresActualizados: actualizados,
    };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${(error as Error).message}` };
  }
}

export async function importEvaluacionesDIIA(players: Player[]) {
  return importEvaluacionesDIByKind(players, 'ia');
}

export async function importEvaluacionesDIPersonal(players: Player[]) {
  return importEvaluacionesDIByKind(players, 'personal');
}

// ============================================================================
// FUNCIONES DE IMPORTACIÓN
// ============================================================================

/**
 * Importa la plantilla desde Google Sheets
 */
export async function importPlantilla(): Promise<{ success: boolean; data?: Player[]; message: string }> {
  try {
    const parsed = await postGoogleScript({
      action: 'importPlantilla',
      spreadsheetId: await getSpreadsheetId(),
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    if (result.success && result.data) {
      const players = convertRowsToPlayers(result.data);
      return { success: true, data: players, message: 'Plantilla importada correctamente' };
    }
    return { success: false, message: result.message || 'Error al importar plantilla' };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${(error as Error).message}` };
  }
}

const FETCH_TIMEOUT_MS = 20000;

/**
 * Importa los partidos desde Google Sheets.
 * Acepta plantilla vacía; la convocatoria se rellenará desde la hoja o quedará vacía.
 */
export async function importPartidos(players: Player[] = []): Promise<{ success: boolean; data?: Partido[]; message: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const bodyParsed = await postGoogleScript(
      {
        action: 'importPartidos',
        spreadsheetId: await getSpreadsheetId(),
      },
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!bodyParsed.ok) return { success: false, message: bodyParsed.message };
    const result = bodyParsed.data as { success?: boolean; data?: unknown; message?: string };

    if (result.success) {
      const rawData = result.data;
      if (!Array.isArray(rawData)) {
        return { success: true, data: [], message: 'No hay partidos para importar' };
      }
      try {
        const partidos = convertRowsToPartidos(rawData as PartidoRow[], players);
        return { success: true, data: partidos, message: 'Partidos importados correctamente' };
      } catch (convertError) {
        return { success: false, message: convertError instanceof Error ? convertError.message : 'Error al transformar datos' };
      }
    }
    return { success: false, message: result.message || 'Error al importar partidos' };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { success: false, message: 'Tiempo de espera agotado. Comprueba la conexión.' };
      }
      return { success: false, message: `Error de conexión: ${error.message}` };
    }
    return { success: false, message: 'Error de conexión' };
  }
}

/**
 * Importa los entrenamientos desde Google Sheets
 * @param players Lista de jugadores para mapear nombres a IDs (requerido para AS/AV/NA correcto)
 */
export async function importEntrenamientos(players: Player[] = []): Promise<{ success: boolean; data?: Entrenamiento[]; message: string }> {
  try {
    const parsed = await postGoogleScript({
      action: 'importEntrenamientos',
      spreadsheetId: await getSpreadsheetId(),
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    if (result.success && result.data) {
      const entrenamientos = convertRowsToEntrenamientos(result.data, players);
      return { success: true, data: entrenamientos, message: 'Entrenamientos importados correctamente' };
    }
    return { success: false, message: result.message || 'Error al importar entrenamientos' };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${(error as Error).message}` };
  }
}

// ============================================================================
// FUNCIONES DE GENERACIÓN DE INFORMES
// ============================================================================

/**
 * Genera un informe completo de un partido específico
 * Incluye cronómetro, goles, autores y quinteto en pista
 */
export async function getMatchReport(partidoId: string): Promise<{ success: boolean; report?: string; message: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const bodyParsed = await postGoogleScript(
      {
        action: 'generateMatchReport',
        partidoId,
        spreadsheetId: await getSpreadsheetId(),
      },
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!bodyParsed.ok) return { success: false, message: bodyParsed.message };
    const result = bodyParsed.data as { success?: boolean; report?: unknown; message?: string };

    if (result.success) {
      if (typeof result.report === 'string') {
        return { success: true, report: result.report, message: 'Informe generado correctamente' };
      }
      return { success: false, message: 'El informe generado no tiene formato válido.' };
    }
    return { success: false, message: result.message || 'Error al generar informe' };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { success: false, message: 'Tiempo de espera agotado. Comprueba la conexión.' };
      }
      return { success: false, message: `Error de conexión: ${error.message}` };
    }
    return { success: false, message: 'Error de conexión' };
  }
}

/**
 * Exporta un informe de partido a Google Drive
 */
export async function exportReportToDrive(partidoId: string): Promise<{ success: boolean; url?: string; message: string }> {
  try {
    const parsed = await postGoogleScript({
      action: 'exportReportToDrive',
      partidoId,
      spreadsheetId: await getSpreadsheetId(),
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    if (result.success) {
      return { success: true, url: result.url, message: 'Informe exportado a Drive correctamente' };
    }
    return { success: false, message: result.message || 'Error al exportar informe' };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${(error as Error).message}` };
  }
}

/**
 * Sube una foto de jugador a Google Drive
 * Usa carpeta 1VUPNFNggtYoXAVglFwNfWw8TD1BjmXWt
 * Nombra el archivo con el nombre del jugador y sustituye si ya existe
 */
export async function uploadPhotoToDrive(
  base64Data: string,
  playerName: string
): Promise<{ success: boolean; url?: string; message: string }> {
  try {
    const fileName = (playerName || 'jugador').replace(/[^a-zA-Z0-9\s-_]/g, '').trim() || 'jugador';

    const parsed = await postGoogleScript({
      action: 'uploadPhotoToDrive',
      folderId: FOLDER_ID_FOTOS,
      fileName: fileName + '.jpg',
      base64Data: base64Data,
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    if (result.success && result.url) {
      return { success: true, url: result.url, message: 'Foto subida correctamente' };
    }
    return { success: false, message: result.message || 'Error al subir foto' };
  } catch (error) {
    return { success: false, message: `Error: ${(error as Error).message}` };
  }
}

/**
 * Sube un acta oficial de partido (PDF o imagen) a Google Drive
 * Carpeta: 1kYAmF1v4YgMEooXpmUVFgrnL0rV89-yV
 * Nombre: [Fecha] [Rival] (ej: 20-02-2025 Atletico Madrid)
 * Sustituye archivo si ya existe con el mismo nombre
 */
export async function uploadActaToDrive(
  base64Data: string,
  fileName: string,
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf'
): Promise<{ success: boolean; url?: string; fileId?: string; folderId?: string; message: string }> {
  try {
    const parsed = await postGoogleScript({
      action: 'uploadActaToDrive',
      folderId: FOLDER_ID_ACTAS,
      folderName: FOLDER_NAME_ACTAS,
      fileName,
      base64Data,
      mimeType,
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    if (result.success && result.url) {
      return {
        success: true,
        url: result.url,
        fileId: result.fileId,
        folderId: result.folderId,
        message: result.message || 'Acta subida a Drive correctamente'
      };
    }
    return { success: false, message: result.message || 'Error al subir acta' };
  } catch (error) {
    return { success: false, message: `Error: ${(error as Error).message}` };
  }
}

/**
 * Lista actas disponibles en Drive.
 * Si la carpeta no existe, el backend la crea automáticamente.
 */
export async function listActasFromDrive(): Promise<{
  success: boolean;
  files: Array<{ id: string; name: string; url: string; mimeType?: string; createdTime?: string }>;
  folderId?: string;
  message: string;
}> {
  try {
    const parsed = await postGoogleScript({
      action: 'listActasDrive',
      folderId: FOLDER_ID_ACTAS,
      folderName: FOLDER_NAME_ACTAS,
    });
    if (!parsed.ok) return { success: false, files: [], message: parsed.message };
    const result = parsed.data;
    if (result.success) {
      return {
        success: true,
        files: Array.isArray(result.files) ? result.files : [],
        folderId: result.folderId,
        message: result.message || 'Actas listadas correctamente'
      };
    }
    return { success: false, files: [], message: result.message || 'No se pudieron listar las actas' };
  } catch (error) {
    return { success: false, files: [], message: `Error: ${(error as Error).message}` };
  }
}
