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
import { Platform } from 'react-native';
import { formatTeamBookName, getTeamCloudConfig, setTeamCloudConfig, type TeamCloudConfig } from '../storage/teamCloudStorage';
import { notifyUserAppDataChanged } from '../storage/userCloudSync';
import { getActiveFirebaseUid, scopedAccountStorageKey } from './firebaseUserDataService';
import {
  USER_SPREADSHEET_KEY,
  USER_DRIVE_ROOT_FOLDER_KEY,
  USER_DRIVE_FOLDERS_KEY,
} from '../storage/accountStorageScope';
import { formatDateExport, formatDateGlobal, parseToDate, toDisplayDate } from '../utils/dateFormat';
import {
  PERSONAL_FORM_SECTIONS,
  SHEET_BLOQUE_FORMULARIO_PERSONAL,
  defaultPersonalFormSectionIds,
  personalQuestionLabelById,
} from '../utils/personalFormSections';
import { explainValoracionIA } from '../utils/playerRating';
import { collapseRosterRows, indexPlayers, resolvePerson } from '../utils/playerIdentity';
import {
  googleScriptHttpRequest,
  isGoogleScriptWebViewBridgeEnabled,
  waitGoogleScriptBridgeReady,
} from './googleScriptWebViewBridge';

const USER_SPREADSHEET_KEY_BASE = USER_SPREADSHEET_KEY;
const USER_DRIVE_ROOT_FOLDER_KEY_BASE = USER_DRIVE_ROOT_FOLDER_KEY;
const USER_DRIVE_FOLDERS_KEY_BASE = USER_DRIVE_FOLDERS_KEY;

function accountStorageKey(baseKey: string): string {
  return scopedAccountStorageKey(baseKey, getActiveFirebaseUid());
}

type DriveFoldersConfig = {
  rootFolderId?: string;
  fotosFolderId?: string;
  actasFolderId?: string;
};

let activeEquipo = '';
let activeTemporada = '';

/** Contexto activo para resolver libro y carpetas Drive por equipo/temporada. */
export function setActiveTeamCloudContext(equipo: string, temporada: string): void {
  activeEquipo = String(equipo || '').trim();
  activeTemporada = String(temporada || '').trim();
}

function normalizeSpreadsheetId(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/\/folders\//i.test(raw)) return '';
  const urlMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (urlMatch?.[1]) return urlMatch[1];
  const beforeGarbage = raw.split(/[/?#&\s]/)[0].trim();
  if (/^[a-zA-Z0-9-_]{20,}$/.test(beforeGarbage)) return beforeGarbage;
  return '';
}

export function normalizeSpreadsheetIdInput(value: string | null | undefined): string {
  return normalizeSpreadsheetId(value);
}

export function normalizeDriveFolderIdInput(value: string | null | undefined): string {
  return normalizeDriveFolderId(value);
}

/** Separa libro y carpeta aunque estén guardados intercambiados o duplicados. */
export function resolveTeamCloudFormFields(
  cfg: TeamCloudConfig | null | undefined,
  options?: { fallbackSpreadsheetId?: string }
): { spreadsheetId: string; driveRootFolderId: string } {
  let spreadsheetId =
    normalizeSpreadsheetId(cfg?.spreadsheetId) || normalizeSpreadsheetId(cfg?.spreadsheetUrl);
  let driveRootFolderId =
    normalizeDriveFolderId(cfg?.driveRootFolderId) || normalizeDriveFolderId(cfg?.parentDriveFolderId);

  const fallbackSheet = normalizeSpreadsheetId(options?.fallbackSpreadsheetId);

  if (spreadsheetId && driveRootFolderId && spreadsheetId === driveRootFolderId) {
    driveRootFolderId = spreadsheetId;
    spreadsheetId = fallbackSheet && fallbackSheet !== driveRootFolderId ? fallbackSheet : '';
  }

  if (spreadsheetId && driveRootFolderId && spreadsheetId === driveRootFolderId) {
    spreadsheetId = '';
  }

  if (!spreadsheetId && fallbackSheet && fallbackSheet !== driveRootFolderId) {
    spreadsheetId = fallbackSheet;
  }

  return { spreadsheetId, driveRootFolderId };
}

function normalizeDriveFolderId(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/\/spreadsheets\//i.test(raw) || /\/file\//i.test(raw)) return '';
  const urlMatch = raw.match(/\/folders\/([a-zA-Z0-9-_]+)/i);
  if (urlMatch?.[1]) return urlMatch[1];
  const beforeGarbage = raw.split(/[/?#&\s]/)[0].trim();
  if (/^[a-zA-Z0-9-_]{10,}$/.test(beforeGarbage)) return beforeGarbage;
  return '';
}

/** Repara IDs guardados con basura (URL /edit, etc.) en el mapa del equipo/temporada. */
async function repairTeamCloudSpreadsheetId(
  equipo: string,
  temporada: string,
  cfg: Awaited<ReturnType<typeof getTeamCloudConfig>>
): Promise<string> {
  if (!cfg) return '';
  const teamId =
    normalizeSpreadsheetId(cfg.spreadsheetId) || normalizeSpreadsheetId(cfg.spreadsheetUrl);
  const storedRaw = String(cfg.spreadsheetId || '').trim();
  if (teamId && storedRaw && storedRaw !== teamId) {
    await setTeamCloudConfig(equipo, temporada, { ...cfg, spreadsheetId: teamId });
  }
  return teamId;
}

/** ID del libro: primero el del equipo/temporada activos, luego config global o por defecto. */
async function getSpreadsheetId(options?: { tryHydrate?: boolean }): Promise<string> {
  const tryHydrate = options?.tryHydrate !== false;
  if (activeEquipo && activeTemporada) {
    try {
      const teamCfg = await getTeamCloudConfig(activeEquipo, activeTemporada);
      let teamId = await repairTeamCloudSpreadsheetId(activeEquipo, activeTemporada, teamCfg);
      if (teamId) return teamId;

      if (tryHydrate) {
        await waitGoogleScriptBridgeReady().catch(() => undefined);
        await hydrateTeamCloudFromRegistry(activeEquipo, activeTemporada);
        const refreshed = await getTeamCloudConfig(activeEquipo, activeTemporada);
        teamId = await repairTeamCloudSpreadsheetId(activeEquipo, activeTemporada, refreshed);
        if (teamId) return teamId;
      }
    } catch {}
    // Si hay contexto de equipo/temporada activo pero no hay libro vinculado,
    // NO debemos caer al libro maestro canónico (SPREADSHEET_ID), porque ese Sheet
    // no contiene las hojas del equipo y provoca errores de sincronización.
    try {
      const id = normalizeSpreadsheetId(await AsyncStorage.getItem(accountStorageKey(USER_SPREADSHEET_KEY_BASE)));
      if (id) return id;
    } catch {}
    return '';
  }
  try {
    const id = normalizeSpreadsheetId(await AsyncStorage.getItem(accountStorageKey(USER_SPREADSHEET_KEY_BASE)));
    if (id) return id;
  } catch {}
  return SPREADSHEET_ID;
}

/** Prepara el libro de la temporada activa (hidrata desde Registro_Libros si hace falta). */
export async function prepareActiveTeamSpreadsheet(): Promise<string> {
  return getSpreadsheetId({ tryHydrate: true });
}

/** Guarda el ID del libro para que export/import usen ese libro. */
export async function setUserSpreadsheetId(id: string | null): Promise<void> {
  const normalized = normalizeSpreadsheetId(id);
  if (!normalized) await AsyncStorage.removeItem(accountStorageKey(USER_SPREADSHEET_KEY_BASE));
  else await AsyncStorage.setItem(accountStorageKey(USER_SPREADSHEET_KEY_BASE), normalized);
  if (activeEquipo && activeTemporada && normalized) {
    const prev = (await getTeamCloudConfig(activeEquipo, activeTemporada)) || {};
    await setTeamCloudConfig(activeEquipo, activeTemporada, {
      ...prev,
      spreadsheetId: normalized,
      bookName: prev.bookName || formatTeamBookName(activeEquipo, activeTemporada),
    });
  }
  notifyUserAppDataChanged();
}

/** Devuelve el ID actual (el configurado o el por defecto) para mostrarlo en la UI. */
export async function getCurrentSpreadsheetId(): Promise<string> {
  return getSpreadsheetId();
}

async function getDriveFoldersConfig(): Promise<DriveFoldersConfig> {
  let global: DriveFoldersConfig = {};
  try {
    const raw = await AsyncStorage.getItem(accountStorageKey(USER_DRIVE_FOLDERS_KEY_BASE));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        global = {
          rootFolderId: normalizeDriveFolderId((parsed as any).rootFolderId),
          fotosFolderId: normalizeDriveFolderId((parsed as any).fotosFolderId),
          actasFolderId: normalizeDriveFolderId((parsed as any).actasFolderId),
        };
      }
    }
  } catch {
    global = {};
  }
  if (activeEquipo && activeTemporada) {
    try {
      const teamCfg = await getTeamCloudConfig(activeEquipo, activeTemporada);
      if (teamCfg) {
        return {
          rootFolderId: normalizeDriveFolderId(teamCfg.driveRootFolderId) || global.rootFolderId,
          fotosFolderId: normalizeDriveFolderId(teamCfg.fotosFolderId) || global.fotosFolderId,
          actasFolderId: normalizeDriveFolderId(teamCfg.actasFolderId) || global.actasFolderId,
        };
      }
    } catch {}
  }
  return global;
}

async function setDriveFoldersConfig(config: DriveFoldersConfig): Promise<void> {
  const safe: DriveFoldersConfig = {
    rootFolderId: normalizeDriveFolderId(config.rootFolderId),
    fotosFolderId: normalizeDriveFolderId(config.fotosFolderId),
    actasFolderId: normalizeDriveFolderId(config.actasFolderId),
  };
  await AsyncStorage.setItem(accountStorageKey(USER_DRIVE_FOLDERS_KEY_BASE), JSON.stringify(safe));
}

export async function setUserDriveRootFolderId(folderId: string | null): Promise<void> {
  const normalized = normalizeDriveFolderId(folderId);
  if (!normalized) {
    await AsyncStorage.removeItem(accountStorageKey(USER_DRIVE_ROOT_FOLDER_KEY_BASE));
  } else {
    await AsyncStorage.setItem(accountStorageKey(USER_DRIVE_ROOT_FOLDER_KEY_BASE), normalized);
  }
  const current = await getDriveFoldersConfig();
  await setDriveFoldersConfig({ ...current, rootFolderId: normalized || undefined });
  if (activeEquipo && activeTemporada && normalized) {
    const prev = (await getTeamCloudConfig(activeEquipo, activeTemporada)) || {};
    await setTeamCloudConfig(activeEquipo, activeTemporada, {
      ...prev,
      driveRootFolderId: normalized,
      bookName: prev.bookName || formatTeamBookName(activeEquipo, activeTemporada),
    });
  }
  notifyUserAppDataChanged();
}

export async function getCurrentDriveRootFolderId(): Promise<string> {
  if (activeEquipo && activeTemporada) {
    try {
      const teamCfg = await getTeamCloudConfig(activeEquipo, activeTemporada);
      const teamRoot = normalizeDriveFolderId(teamCfg?.driveRootFolderId);
      if (teamRoot) return teamRoot;
    } catch {}
  }
  try {
    const raw = await AsyncStorage.getItem(accountStorageKey(USER_DRIVE_ROOT_FOLDER_KEY_BASE));
    return normalizeDriveFolderId(raw);
  } catch {
    return '';
  }
}

export async function ensureDriveWorkspace(
  overrideSpreadsheetId?: string | null,
  overrideRootFolderId?: string
): Promise<{
  success: boolean;
  message: string;
  rootFolderId?: string;
  fotosFolderId?: string;
  actasFolderId?: string;
  spreadsheetId?: string;
}> {
  const spreadsheetId =
    overrideSpreadsheetId !== undefined
      ? normalizeSpreadsheetId(overrideSpreadsheetId)
      : (await getSpreadsheetId({ tryHydrate: true }));
  const rootFolderId =
    overrideRootFolderId !== undefined
      ? normalizeDriveFolderId(overrideRootFolderId)
      : (await getCurrentDriveRootFolderId());

  let parsed = await getGoogleScript({
    action: 'ensureDriveWorkspace',
    spreadsheetId: spreadsheetId || undefined,
    rootFolderId: rootFolderId || undefined,
  });
  if (!parsed.ok || parsed.data?.handledAction !== 'ensureDriveWorkspace') {
    const postFallback = await postGoogleScript({
      action: 'ensureDriveWorkspace',
      spreadsheetId: spreadsheetId || undefined,
      rootFolderId: rootFolderId || undefined,
    });
    if (postFallback.ok) parsed = postFallback;
    else if (!parsed.ok) return { success: false, message: parsed.message };
  }
  const result = parsed.data;
  if (!result?.success) {
    return { success: false, message: result?.message || 'No se pudo preparar la carpeta de Drive.' };
  }
  const nextConfig: DriveFoldersConfig = {
    rootFolderId: normalizeDriveFolderId(result.rootFolderId || rootFolderId),
    fotosFolderId: normalizeDriveFolderId(result.fotosFolderId),
    actasFolderId: normalizeDriveFolderId(result.actasFolderId),
  };
  if (activeEquipo && activeTemporada) {
    const prev = (await getTeamCloudConfig(activeEquipo, activeTemporada)) || {};
    await setTeamCloudConfig(activeEquipo, activeTemporada, {
      ...prev,
      spreadsheetId,
      driveRootFolderId: nextConfig.rootFolderId,
      fotosFolderId: nextConfig.fotosFolderId,
      actasFolderId: nextConfig.actasFolderId,
      bookName: prev.bookName || formatTeamBookName(activeEquipo, activeTemporada),
    });
  } else {
    await setDriveFoldersConfig(nextConfig);
    if (nextConfig.rootFolderId) {
      await AsyncStorage.setItem(accountStorageKey(USER_DRIVE_ROOT_FOLDER_KEY_BASE), nextConfig.rootFolderId);
    }
  }
  return {
    success: true,
    message: result.message || 'Estructura de Google Drive lista.',
    rootFolderId: nextConfig.rootFolderId,
    fotosFolderId: nextConfig.fotosFolderId,
    actasFolderId: nextConfig.actasFolderId,
    spreadsheetId,
  };
}

/** Crea libro copiando plantilla con macros (nombre = Equipo + Temporada). */
export async function createTeamSpreadsheetFromTemplate(
  bookName: string,
  parentDriveFolderId?: string
): Promise<{
  success: boolean;
  message: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  driveRootFolderId?: string;
}> {
  const parsed = await postGoogleScript({
    action: 'createTeamSpreadsheetFromTemplate',
    bookName: String(bookName || '').trim(),
    parentDriveFolderId: normalizeDriveFolderId(parentDriveFolderId) || undefined,
  });
  if (!parsed.ok) return { success: false, message: parsed.message };
  const result = parsed.data;
  if (!result?.success) {
    return { success: false, message: result?.message || 'No se pudo crear el libro.' };
  }
  return {
    success: true,
    message: result.message || 'Libro creado.',
    spreadsheetId: normalizeSpreadsheetId(result.spreadsheetId),
    spreadsheetUrl: String(result.spreadsheetUrl || '').trim() || undefined,
    driveRootFolderId: normalizeDriveFolderId(result.driveRootFolderId),
  };
}

export type RegisteredTeamBook = {
  equipo: string;
  temporada: string;
  bookName: string;
  spreadsheetId: string;
  spreadsheetUrl?: string;
  appAccountEmail?: string;
  parentDriveFolderId?: string;
  teamDriveFolderId?: string;
  fotosFolderId?: string;
  actasFolderId?: string;
  scriptVersion?: string;
  createdAt?: string;
  updatedAt?: string;
};

/** Registra o actualiza un libro en la hoja maestra Registro_Libros (libro canónico). */
export async function registerTeamBookInCatalog(params: {
  equipo: string;
  temporada: string;
  bookName: string;
  spreadsheetId: string;
  spreadsheetUrl?: string;
  appAccountEmail?: string;
  parentDriveFolderId?: string;
  driveRootFolderId?: string;
  fotosFolderId?: string;
  actasFolderId?: string;
}): Promise<{ success: boolean; message: string }> {
  const teamSpreadsheetId = normalizeSpreadsheetId(params.spreadsheetId);
  const teamDriveRoot = normalizeDriveFolderId(params.driveRootFolderId);
  if (!teamSpreadsheetId) {
    return { success: false, message: 'spreadsheetId inválido para registro.' };
  }
  if (teamDriveRoot && teamSpreadsheetId === teamDriveRoot) {
    return {
      success: false,
      message: 'spreadsheetId y carpeta Drive no pueden ser el mismo ID.',
    };
  }
  const parsed = await postGoogleScript({
    action: 'registerTeamBook',
    spreadsheetId: teamSpreadsheetId,
    equipo: String(params.equipo || '').trim(),
    temporada: String(params.temporada || '').trim(),
    bookName: String(params.bookName || '').trim(),
    spreadsheetUrl: params.spreadsheetUrl,
    appAccountEmail: params.appAccountEmail,
    parentDriveFolderId: normalizeDriveFolderId(params.parentDriveFolderId) || undefined,
    teamDriveFolderId: normalizeDriveFolderId(params.driveRootFolderId) || undefined,
    fotosFolderId: normalizeDriveFolderId(params.fotosFolderId) || undefined,
    actasFolderId: normalizeDriveFolderId(params.actasFolderId) || undefined,
  });
  if (!parsed.ok) return { success: false, message: parsed.message };
  const result = parsed.data;
  if (!result?.success) {
    return { success: false, message: result?.message || 'No se pudo registrar el libro.' };
  }
  return { success: true, message: result.message || 'Libro registrado.' };
}

/** Lista libros del registro central (preparación para propagar script a todos). */
export async function listRegisteredTeamBooks(): Promise<{
  success: boolean;
  message: string;
  books?: RegisteredTeamBook[];
  scriptVersion?: string;
}> {
  const parsed = await postGoogleScript({
    action: 'listRegistroLibros',
    spreadsheetId: SPREADSHEET_ID,
  });
  if (!parsed.ok) return { success: false, message: parsed.message };
  const result = parsed.data;
  if (!result?.success) {
    return { success: false, message: result?.message || 'No se pudo leer Registro_Libros.' };
  }
  return {
    success: true,
    message: result.message || 'OK',
    books: (result.books || []) as RegisteredTeamBook[],
    scriptVersion: String(result.scriptVersion || '').trim() || undefined,
  };
}

export type SyncAllBooksResult = {
  success: boolean;
  message: string;
  scriptVersion?: string;
  mode?: string;
  scriptApiWarning?: string;
  updated?: Array<{ spreadsheetId: string; bookName: string; equipo?: string; temporada?: string }>;
  failed?: Array<{ spreadsheetId: string; bookName: string; error: string }>;
  skipped?: Array<{ spreadsheetId: string; bookName: string; reason: string }>;
};

/** Propaga estructura y/o script vinculado a todos los libros de Registro_Libros (admin). */
export async function syncAllBooksFromRegistry(options?: {
  mode?: 'structure' | 'script' | 'both';
  force?: boolean;
}): Promise<SyncAllBooksResult> {
  const controller = new AbortController();
  /** Propagar script+hojas puede tardar varios minutos (Script API + N libros). */
  const timeoutMs = options?.mode === 'structure' ? 90000 : 240000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const parsed = await postGoogleScript(
      {
        action: 'syncAllBooksFromRegistry',
        spreadsheetId: SPREADSHEET_ID,
        mode: options?.mode || 'both',
        force: options?.force === true,
      },
      { signal: controller.signal, timeoutMs }
    );
    if (!parsed.ok) {
      const msg = String(parsed.message || '');
      if (msg.toLowerCase().includes('html') || msg.toLowerCase().includes('agotado')) {
        return {
          success: false,
          message:
            `${msg}\n\n«Propagar todo» es pesado y a menudo Google responde HTML o corta la espera.\n` +
            `Ahora usa «Solo estructura» (crea Calendario_Eventos y el resto de hojas).\n` +
            `La app ya usa el /exec maestro desplegado; el script de cada libro se puede actualizar luego desde el editor Apps Script.`,
        };
      }
      return { success: false, message: parsed.message };
    }
    const result = parsed.data;
    return {
      success: !!result?.success,
      message: result?.message || 'Sync finalizado.',
      scriptVersion: result?.scriptVersion,
      mode: result?.mode,
      scriptApiWarning: result?.scriptApiWarning,
      updated: result?.updated,
      failed: result?.failed,
      skipped: result?.skipped,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Registro_Libros a veces tiene libro y carpeta intercambiados (provoca HTTP 500 al abrir carpeta como Sheet).
 */
function resolveRegistryBookIds(
  match: RegisteredTeamBook | undefined,
  prev: TeamCloudConfig
): {
  spreadsheetId: string;
  driveRootFolderId?: string;
  parentDriveFolderId?: string;
  fotosFolderId?: string;
  actasFolderId?: string;
  wasSwapped: boolean;
} {
  if (!match) {
    return { spreadsheetId: '', wasSwapped: false };
  }

  const localSs =
    normalizeSpreadsheetId(prev.spreadsheetId) || normalizeSpreadsheetId(prev.spreadsheetUrl);
  const localDrive = normalizeDriveFolderId(prev.driveRootFolderId);

  let regSs =
    normalizeSpreadsheetId(match.spreadsheetId) || normalizeSpreadsheetId(match.spreadsheetUrl);
  let regDrive =
    normalizeDriveFolderId(match.teamDriveFolderId) ||
    normalizeDriveFolderId(match.parentDriveFolderId);
  const altSsFromOtherCols =
    normalizeSpreadsheetId(match.teamDriveFolderId) ||
    normalizeSpreadsheetId(match.parentDriveFolderId);

  let wasSwapped = false;

  if (regSs && localDrive && regSs === localDrive && localSs) {
    regSs = localSs;
    regDrive = localDrive;
    wasSwapped = true;
  } else if (regSs && localSs && regSs === localDrive) {
    regSs = localSs;
    regDrive = localDrive || normalizeDriveFolderId(match.spreadsheetId);
    wasSwapped = true;
  } else if (regSs && altSsFromOtherCols && regSs !== altSsFromOtherCols) {
    const folderCandidate = normalizeDriveFolderId(match.spreadsheetId);
    if (folderCandidate && regSs === folderCandidate) {
      regSs = altSsFromOtherCols;
      regDrive = folderCandidate;
      wasSwapped = true;
    }
  }

  if (regSs && localDrive && regSs === localDrive && localSs) {
    regSs = localSs;
    wasSwapped = true;
  }

  return {
    spreadsheetId: regSs || localSs,
    driveRootFolderId: regDrive || localDrive,
    parentDriveFolderId:
      normalizeDriveFolderId(match.parentDriveFolderId) || prev.parentDriveFolderId,
    fotosFolderId: normalizeDriveFolderId(match.fotosFolderId) || prev.fotosFolderId,
    actasFolderId: normalizeDriveFolderId(match.actasFolderId) || prev.actasFolderId,
    wasSwapped,
  };
}

/** Vincula un spreadsheet al equipo/temporada activos (o indicados). */
export async function linkSpreadsheetToActiveTeam(
  equipo: string,
  temporada: string,
  spreadsheetId: string
): Promise<void> {
  const id = normalizeSpreadsheetId(spreadsheetId);
  if (!id) return;
  const prev = (await getTeamCloudConfig(equipo, temporada)) || {};
  await setTeamCloudConfig(equipo, temporada, {
    ...prev,
    spreadsheetId: id,
    bookName: prev.bookName || formatTeamBookName(equipo, temporada),
  });
}

/**
 * Temporadas antiguas suelen tener IDs mal guardados (URL con /edit, etc.).
 * Si falta o está corrupto, recupera el libro desde Registro_Libros del Sheet maestro.
 */
export async function hydrateTeamCloudFromRegistry(equipo: string, temporada: string): Promise<boolean> {
  const eq = String(equipo || '').trim();
  const temp = String(temporada || '').trim();
  if (!eq || !temp) return false;

  const prev = (await getTeamCloudConfig(eq, temp)) || {};
  const localId =
    normalizeSpreadsheetId(prev.spreadsheetId) || normalizeSpreadsheetId(prev.spreadsheetUrl);

  const list = await listRegisteredTeamBooks();
  const eqKey = eq.toLowerCase();
  const tempKey = temp.toLowerCase();
  const match = list.success
    ? (list.books || []).find(
        (b) =>
          String(b.equipo || '').trim().toLowerCase() === eqKey &&
          String(b.temporada || '').trim().toLowerCase() === tempKey
      )
    : undefined;

  const resolved = resolveRegistryBookIds(match, prev);
  const resolvedId = resolved.spreadsheetId || localId;
  if (!resolvedId) return false;

  const nextConfig = {
    ...prev,
    spreadsheetId: resolvedId,
    spreadsheetUrl: match?.spreadsheetUrl || prev.spreadsheetUrl,
    bookName: match?.bookName || prev.bookName || formatTeamBookName(eq, temp),
    parentDriveFolderId: resolved.parentDriveFolderId || prev.parentDriveFolderId,
    driveRootFolderId: resolved.driveRootFolderId || prev.driveRootFolderId,
    fotosFolderId: resolved.fotosFolderId || prev.fotosFolderId,
    actasFolderId: resolved.actasFolderId || prev.actasFolderId,
  };

  const changed =
    resolvedId !== normalizeSpreadsheetId(prev.spreadsheetId) ||
    resolvedId !== String(prev.spreadsheetId || '').trim() ||
    (resolved.spreadsheetId && resolved.spreadsheetId !== localId) ||
    resolved.wasSwapped;

  if (changed || !prev.spreadsheetId) {
    await setTeamCloudConfig(eq, temp, nextConfig);
    if (resolved.wasSwapped && match) {
      void registerTeamBookInCatalog({
        equipo: eq,
        temporada: temp,
        bookName: nextConfig.bookName || formatTeamBookName(eq, temp),
        spreadsheetId: resolvedId,
        spreadsheetUrl: nextConfig.spreadsheetUrl,
        appAccountEmail: match.appAccountEmail || prev.appAccountEmail,
        parentDriveFolderId: nextConfig.parentDriveFolderId,
        driveRootFolderId: nextConfig.driveRootFolderId,
        fotosFolderId: nextConfig.fotosFolderId,
        actasFolderId: nextConfig.actasFolderId,
      }).catch(() => undefined);
    }
    return true;
  }
  return false;
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

function looksLikeGoogleBlockPage(s: string): boolean {
  const t = stripBom(s).trim().slice(0, 2000).toLowerCase();
  return (
    t.includes('ppconfig') ||
    t.includes('window[') && t.includes('productname') ||
    t.includes('accounts.google.com') ||
    t.includes('signin') && t.includes('google')
  );
}

function extractRedirectUrlFromHtml(html: string): string {
  const hrefMatch = stripBom(html).match(/HREF="([^"]+)"/i);
  return hrefMatch?.[1] ? String(hrefMatch[1]).trim() : '';
}

function responseLooksLikeJson(text: string): boolean {
  const t = stripBom(text).trim();
  return t.startsWith('{') || t.startsWith('[');
}

/** Transporte HTTP: WebView Chromium (nativo) → XHR → fetch manual. */
async function requestGoogleScriptHttp(
  url: string,
  init: { method: 'GET' | 'POST'; body?: string; signal?: AbortSignal; timeoutMs?: number }
): Promise<{ status: number; text: string }> {
  if (isGoogleScriptWebViewBridgeEnabled()) {
    try {
      const viaWebView = await googleScriptHttpRequest(url, {
        method: init.method,
        body: init.body,
        signal: init.signal,
        timeoutMs: init.timeoutMs,
      });
      if (responseLooksLikeJson(viaWebView.text) || !looksLikeHtml(viaWebView.text)) {
        return viaWebView;
      }
    } catch {
      /* fallback XHR/fetch */
    }
  }

  if (init.method === 'GET') {
    return fetchGoogleScriptGetFallback(url, init.signal);
  }
  return fetchGoogleScriptPostFallback(url, init.body || '{}', init.signal, init.timeoutMs);
}

async function fetchGoogleScriptPostFallback(
  url: string,
  payload: string,
  signal?: AbortSignal,
  timeoutMs = 45000
): Promise<{ status: number; text: string }> {
  const preferXhr = Platform.OS === 'android' || Platform.OS === 'ios';
  if (preferXhr && typeof XMLHttpRequest !== 'undefined') {
    try {
      const xhrResult = await xhrPostText(url, payload, signal, timeoutMs);
      const preview = stripBom(xhrResult.text).trim();
      if (preview.startsWith('{') || preview.startsWith('[')) {
        return xhrResult;
      }
    } catch {
      /* fallback fetch */
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: payload,
    signal,
    redirect: 'manual',
  });

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('Location') || res.headers.get('location') || '';
    if (location) {
      const follow = await fetch(location, { method: 'GET', signal, redirect: 'follow' });
      return { status: follow.status, text: await follow.text() };
    }
  }

  const text = await res.text();
  if (res.status < 300 && looksLikeHtml(text) && text.toLowerCase().includes('moved temporarily')) {
    const location = extractRedirectUrlFromHtml(text);
    if (location) {
      const follow = await fetch(location, { method: 'GET', signal, redirect: 'follow' });
      return { status: follow.status, text: await follow.text() };
    }
  }

  return { status: res.status, text };
}

function buildGoogleScriptQuery(params: Record<string, string | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    const v = String(value || '').trim();
    if (v) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return parts.join('&');
}

function xhrPostText(
  url: string,
  payload: string,
  signal?: AbortSignal,
  timeoutMs = 45000
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');
    xhr.timeout = timeoutMs;
    const onAbort = () => {
      xhr.abort();
      const err = new Error('AbortError');
      err.name = 'AbortError';
      reject(err);
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    }
    xhr.onload = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve({ status: xhr.status, text: String(xhr.responseText || '') });
    };
    xhr.onerror = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new Error('Error de red (XHR POST)'));
    };
    xhr.ontimeout = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      const err = new Error('AbortError');
      err.name = 'AbortError';
      reject(err);
    };
    xhr.send(payload);
  });
}

function xhrGetText(url: string, signal?: AbortSignal, timeoutMs = 45000): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = timeoutMs;
    const onAbort = () => {
      xhr.abort();
      const err = new Error('AbortError');
      err.name = 'AbortError';
      reject(err);
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    }
    xhr.onload = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve({ status: xhr.status, text: String(xhr.responseText || '') });
    };
    xhr.onerror = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new Error('Error de red (XHR)'));
    };
    xhr.ontimeout = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new Error('AbortError'));
    };
    xhr.send();
  });
}

/** GET con redirección 302 de GAS; XHR en Android suele ser más fiable que fetch. */
async function fetchGoogleScriptGetFallback(
  url: string,
  signal?: AbortSignal
): Promise<{ status: number; text: string }> {
  const preferXhr = Platform.OS === 'android' || Platform.OS === 'ios';
  if (preferXhr && typeof XMLHttpRequest !== 'undefined') {
    try {
      const xhrResult = await xhrGetText(url, signal);
      const preview = stripBom(xhrResult.text).trim().slice(0, 200).toLowerCase();
      if (preview.startsWith('{') || preview.startsWith('[')) {
        return xhrResult;
      }
      if (preview.includes('moved temporarily')) {
        const location = extractRedirectUrlFromHtml(xhrResult.text);
        if (location) return xhrGetText(location, signal);
      }
    } catch {
      /* fallback fetch */
    }
  }

  const res = await fetch(url, { method: 'GET', signal, redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('Location') || res.headers.get('location') || '';
    if (location) {
      const follow = await fetch(location, { method: 'GET', signal, redirect: 'follow' });
      return { status: follow.status, text: await follow.text() };
    }
  }

  const text = await res.text();
  if (looksLikeHtml(text) && text.toLowerCase().includes('moved temporarily')) {
    const location = extractRedirectUrlFromHtml(text);
    if (location) {
      const follow = await fetch(location, { method: 'GET', signal, redirect: 'follow' });
      return { status: follow.status, text: await follow.text() };
    }
  }

  return { status: res.status, text };
}

/** GET al /exec (acciones ligeras; evita POST+302 roto en Android). */
async function getGoogleScript(
  params: Record<string, string | undefined>,
  options?: { signal?: AbortSignal }
): Promise<{ ok: true; data: any } | { ok: false; message: string }> {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'TU_URL_DE_GOOGLE_APPS_SCRIPT_AQUI') {
    return { ok: false, message: 'Por favor configura GOOGLE_SCRIPT_URL en googleSheetsService.ts' };
  }
  const query = buildGoogleScriptQuery(params);
  const url = query ? `${GOOGLE_SCRIPT_URL}?${query}` : GOOGLE_SCRIPT_URL;
  try {
    const { status, text } = await requestGoogleScriptHttp(url, { method: 'GET', signal: options?.signal });
    return parseGoogleScriptBody(text, status);
  } catch (e) {
    const err = e as Error;
    if (err?.name === 'AbortError') {
      return { ok: false, message: 'Tiempo de espera agotado. Comprueba la conexión.' };
    }
    return { ok: false, message: `Error de red: ${err?.message || String(e)}` };
  }
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
    const snippet = trimmed.slice(0, 180).replace(/\s+/g, ' ').trim();
    const blockHint = looksLikeGoogleBlockPage(trimmed)
      ? '\n\nGoogle devolvió una página de seguridad/bloqueo (no el script). Comprueba que el despliegue web tiene acceso «Cualquiera» y prueba el enlace /exec en Chrome del móvil.'
      : '';
    const httpHint =
      httpStatus >= 500
        ? '\n\nHTTP 500: el script en Google falló antes de devolver JSON. Redespliega el archivo google-apps-script.js COMPLETO (V8, acceso Cualquiera) y comprueba la URL /exec con el navegador.'
        : httpStatus === 405 || httpStatus === 302
          ? '\n\nRedirección del script mal gestionada en el dispositivo. Actualiza a la última APK e inténtalo de nuevo.'
          : '';
    return {
      ok: false,
      message: `Respuesta HTML en lugar de JSON (HTTP ${httpStatus}). ${HTML_JSON_HINT}${blockHint}${httpHint}\n\nInicio de respuesta: ${snippet}`,
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
export async function postGoogleScript(
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<{ ok: true; data: any } | { ok: false; message: string }> {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'TU_URL_DE_GOOGLE_APPS_SCRIPT_AQUI') {
    return { ok: false, message: 'Por favor configura GOOGLE_SCRIPT_URL en googleSheetsService.ts' };
  }
  const actionsRequiringSpreadsheet = new Set([
    'exportPlantilla',
    'importPlantilla',
    'exportPartidos',
    'importPartidos',
    'exportEntrenamientos',
    'importEntrenamientos',
    'generateMatchReport',
    'exportReportToDrive',
    'exportEvaluacionesDI',
    'exportEvaluacionesDIViews',
    'importEvaluacionesDI',
    'exportHistorialCronometro',
    'importHistorialCronometro',
    'exportCalendarioEventos',
    'importCalendarioEventos',
    'exportPartidosActas',
    'importPartidosActas',
    'registerTeamBook',
  ]);
  const action = String(body?.action || '');
  let normalizedSpreadsheet = normalizeSpreadsheetId(String(body?.spreadsheetId || ''));
  if (actionsRequiringSpreadsheet.has(action) && !normalizedSpreadsheet) {
    normalizedSpreadsheet = await getSpreadsheetId({ tryHydrate: true });
  }
  if (actionsRequiringSpreadsheet.has(action) && !normalizedSpreadsheet) {
    return {
      ok: false,
      message:
        'No hay libro vinculado a este equipo/temporada. Abre Gestión de datos, comprueba el Spreadsheet ID o crea el libro desde el asistente.',
    };
  }
  const requestBody = { ...body, spreadsheetId: normalizedSpreadsheet || undefined };
  const heavySyncActions = new Set([
    'exportPlantilla',
    'importPlantilla',
    'exportPartidos',
    'importPartidos',
    'exportEntrenamientos',
    'importEntrenamientos',
    'exportEvaluacionesDI',
    'exportEvaluacionesDIViews',
    'importEvaluacionesDI',
    'exportHistorialCronometro',
    'importHistorialCronometro',
    'exportCalendarioEventos',
    'importCalendarioEventos',
    'exportPartidosActas',
    'importPartidosActas',
  ]);
  const timeoutMs = options?.timeoutMs ?? (heavySyncActions.has(action) ? 120000 : 45000);

  try {
    const payload = JSON.stringify(requestBody);
    const { status, text } = await requestGoogleScriptHttp(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      body: payload,
      signal: options?.signal,
      timeoutMs,
    });
    return parseGoogleScriptBody(text, status);
  } catch (e) {
    const err = e as Error;
    if (err?.name === 'AbortError') {
      return { ok: false, message: 'Tiempo de espera agotado. Comprueba la conexión.' };
    }
    return { ok: false, message: `Error de red: ${err?.message || String(e)}` };
  }
}

/** Manifiesto de versión APK publicada (hoja Version_App en Google Sheets). */
export async function fetchAppVersionManifest(): Promise<
  { ok: true; data: { version?: string; versionCode?: number; apkUrl?: string; changelog?: string } } | { ok: false; message: string }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    // Version_App siempre en el libro canónico del proyecto (no el ID alternativo del usuario).
    const result = await postGoogleScript(
      {
        action: 'getAppVersion',
        spreadsheetId: SPREADSHEET_ID,
      },
      { signal: controller.signal }
    );
    if (!result.ok) return result;
    const payload = result.data;
    if (payload?.success === false) {
      return { ok: false, message: String(payload?.message || 'No se pudo leer la versión remota') };
    }
    return { ok: true, data: payload };
  } finally {
    clearTimeout(timeout);
  }
}

// ⚠️ CONFIGURACIÓN REQUERIDA: Reemplaza con la URL de tu Google Apps Script
export const GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyxB-DuipnScntqwHsf0MsKe23eoOcEPnHu5mmnVhfWbKyqmXEp9GW6c9vBkyl65x6PTQ/exec';

// ID del libro de Google Sheets del que importar / al que exportar (libro maestro / plantilla)
export const SPREADSHEET_ID = '1KpaCmUQH5JFjUJ7P26MVH4CRxSkpHpMvYRxZs1RddtQ';

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
type EvaluacionDIKind = 'all' | 'ia' | 'personal' | 'periodica';

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
  return players.map(player => {
    const ph = (player as any)?.photo;
    const photoDriveUrl = String((player as any)?.photoDriveUrl || '').trim();
    const photoStr = typeof ph === 'string' ? ph.trim() : '';
    const fotoStr =
      photoDriveUrl ||
      (photoStr && (photoStr.includes('drive.google.com') || photoStr.includes('docs.google.com')) ? photoStr : '');
    const exportPlayer = {
      ...(player as Record<string, unknown>),
      photo: fotoStr || (photoStr && !photoStr.startsWith('file://') && !photoStr.startsWith('content://') ? photoStr : ''),
      photoDriveUrl: fotoStr || photoDriveUrl || undefined,
    };
    return {
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
      foto: fotoStr,
      // Snapshot completo del jugador para preservar ponderación IA y evaluaciones personales.
      player_json: JSON.stringify(exportPlayer || {}),
    };
  });
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

/** Id de un archivo de Drive a partir de la URL que devuelve Apps Script o de un id suelto. */
export function extractDriveFileId(value: string): string {
  const v = String(value || '').trim();
  if (!v) return '';
  const fromPath = v.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i) || v.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fromPath?.[1]) return fromPath[1];
  const fromQuery = v.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fromQuery?.[1]) return fromQuery[1];
  if (/^[a-zA-Z0-9_-]{25,}$/.test(v)) return v;
  return '';
}

/** URL corta que la ficha puede mostrar. El archivo sigue en Drive, no en el dispositivo. */
export function drivePhotoDisplayUrl(fileIdOrUrl: string): string {
  const id = extractDriveFileId(fileIdOrUrl);
  if (!id) return '';
  return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
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
function convertEntrenamientosToRows(entrenamientos: Entrenamiento[], players: Player[] = []): EntrenamientoRow[] {
  const rows: EntrenamientoRow[] = [];

  entrenamientos.forEach(entreno => {
    const asistencia = collapseRosterRows(entreno.asistencia || [], players, { preferLast: false });
    asistencia.forEach(asistente => {
      const name = String((asistente as { name?: unknown }).name || '').trim();
      if (!name) return;
      rows.push({
        Fecha: entreno.fecha,
        Jugador: name,
        Asistencia: (asistente as { estado?: string }).estado || 'AS',
        Objetivos: (entreno as any).objetivos || '',
        'FECHA ENTRENAMIENTO': entreno.fecha
      });
    });
  });

  return rows;
}

function playerByLabel(players: Player[], label: string): Player | undefined {
  const canon = resolvePerson(
    { name: label, nominal: label, nombreCompleto: label },
    indexPlayers(players)
  );
  if (!canon) return undefined;
  return players.find((p) => String(p.id) === String(canon.id));
}

/**
 * Convierte filas de Google Sheets a formato de jugadores de la app
 */
function convertRowsToPlayers(rows: PlantillaRow[]): Player[] {
  return rows.map(row => {
    const snapshot = parsePlayerJson((row as any).player_json);
    const generatedId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const foto = String(row.foto || '').trim();
    const snapPhoto = typeof (snapshot as any).photo === 'string' ? String((snapshot as any).photo).trim() : '';
    const snapDrive = String((snapshot as any).photoDriveUrl || '').trim();
    const isDrive = (value: string) =>
      value.includes('drive.google.com') || value.includes('docs.google.com');
    const photoDriveUrl = snapDrive || (foto && isDrive(foto) ? foto : '');
    // file:// y content:// son de otro dispositivo: no sirven aquí. La URL de Drive tampoco
    // se puede pintar en la ficha; syncPlayersPhotos la descarga a un archivo local.
    const usableRemotePhoto =
      snapPhoto &&
      !snapPhoto.startsWith('file://') &&
      !snapPhoto.startsWith('content://') &&
      !isDrive(snapPhoto)
        ? snapPhoto
        : '';
    const photoDriveFileId =
      String((snapshot as any).photoDriveFileId || '').trim() || extractDriveFileId(photoDriveUrl);
    const cloudPhoto = drivePhotoDisplayUrl(photoDriveFileId || photoDriveUrl);
    const fechaNacimiento =
      toDisplayDate(row.fechaNacimiento) || toDisplayDate((snapshot as any).fechaNacimiento);
    const numeroLicencia = sheetCell(row.numeroLicencia) || sheetCell((snapshot as any).numeroLicencia);
    const dorsal = sheetCell(row.dorsal) || sheetCell((snapshot as any).number);
    const posicion = sheetCell(row.posicion) || sheetCell((snapshot as any).posicion) || 'Ala';
    const edad = sheetCell(row.edad) || sheetCell((snapshot as any).edad);
    return {
      ...snapshot,
      id: row.id || String((snapshot as any).id || generatedId),
      // en la app usamos 'name' como nominal (nombre visible)
      name: row.nominal || row.nombreCompleto || String((snapshot as any).name || (snapshot as any).nominal || ''),
      number: dorsal,
      role: String((snapshot as any).role || 'Jugador'),
      posicion,
      photo: cloudPhoto || usableRemotePhoto || null,
      photoDriveUrl: photoDriveUrl || undefined,
      photoDriveFileId: photoDriveFileId || undefined,
      nombreCompleto: row.nombreCompleto || String((snapshot as any).nombreCompleto || ''),
      nominal: row.nominal || row.nombreCompleto || String((snapshot as any).nominal || (snapshot as any).name || ''),
      fechaNacimiento,
      numeroLicencia,
      edad,
    } as Player;
  });
}

function sheetCell(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
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
        const player = playerByLabel(players, nombre);
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
        const player = playerByLabel(players, nombre);
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
        const player = playerByLabel(players, autor);
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
      convocatoria: collapseRosterRows(convocatoria, players, { preferLast: false }),
    };
  });
}

/**
 * Convierte filas de Google Sheets a formato de entrenamientos de la app
 * Mapea correctamente AS, AV, NA al estado de asistencia
 */
function convertRowsToEntrenamientos(rows: any[], players: Player[] = []): Entrenamiento[] {
  const entrenamientosMap: { [fecha: string]: Entrenamiento } = {};
  const playerIndex = indexPlayers(players);

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

    const canon = resolvePerson(
      { name: jugadorName, nominal: jugadorName, nombreCompleto: jugadorName },
      playerIndex
    );
    const player = canon ? players.find((p) => String(p.id) === String(canon.id)) : undefined;
    const asistencia = entrenamientosMap[fechaKey].asistencia;

    asistencia.push({
      id: player?.id || canon?.id || jugadorName,
      name: jugadorName,
      role: player?.role || canon?.role || 'Jugador',
      estado
    });
  });

  return Object.values(entrenamientosMap).map((entreno) => ({
    ...entreno,
    asistencia: collapseRosterRows(entreno.asistencia, players, { preferLast: true }),
  }));
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
        const pf = ev?.personalForm;
        if (pf && typeof pf === 'object' && pf.answers && typeof pf.answers === 'object') {
          const answers = pf.answers as Record<string, unknown>;
          for (const key of Object.keys(answers)) {
            const rawVal = answers[key];
            const rowIdPf = `${jugadorId}__${evalId}__pf__${key}`;
            rows.push({
              row_id: rowIdPf,
              jugador_id: jugadorId,
              jugador_nombre: jugadorNombre,
              eval_id: evalId,
              fecha_eval: fechaEval,
              fuente,
              score_eval: scoreEval,
              bloque: SHEET_BLOQUE_FORMULARIO_PERSONAL,
              subbloque: key,
              pregunta: personalQuestionLabelById(key),
              respuesta: rawVal == null ? '' : String(rawVal).trim(),
              puntuacion: '',
            });
          }
        }
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

function isPersonalFormEvaluation(ev: any): boolean {
  return !!(ev?.personalForm && typeof ev.personalForm === 'object');
}

/** Nota manual DI sin formulario largo ni bloques detallados. */
function isPeriodicaEvaluation(ev: any): boolean {
  return !isIADetailEvaluation(ev) && !isPersonalFormEvaluation(ev);
}

function shouldKeepEvalByKind(ev: any, kind: EvaluacionDIKind): boolean {
  if (kind === 'all') return true;
  if (kind === 'ia') return isIADetailEvaluation(ev);
  if (kind === 'personal') return isPersonalFormEvaluation(ev);
  if (kind === 'periodica') return isPeriodicaEvaluation(ev);
  return true;
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

function toTenScale(n: number): number {
  return round2(n * 2);
}

function normalizeScoreTo10(raw: unknown): number | null {
  const n = toNum(raw);
  if (n == null) return null;
  const scaled = n <= 5 ? n * 2 : n;
  return round2(clampRange(scaled, 1, 10));
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

function computeAdjustment10(baseScore: number, teamAvg: number): number {
  const delta = (baseScore - teamAvg) * 0.1;
  return round2(clampRange(delta, -0.1, 0.1));
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
    const nums = roster.map((p: any) => normalizeScoreTo10(p?.[rowDef.key]));
    const rowNums = nums.filter((n): n is number => n != null);
    const rowAvg = avgNumbers(rowNums);
    matrix.push([rowDef.label, ...nums.map((n) => (n == null ? '' : round2(n))), rowAvg == null ? '' : round2(rowAvg)]);
  });
  matrix.push(['BLOQUE TACTICO', ...names.map(() => ''), '']);
  iaRows.slice(2, 4).forEach((rowDef) => {
    const nums = roster.map((p: any) => normalizeScoreTo10(p?.[rowDef.key]));
    const rowNums = nums.filter((n): n is number => n != null);
    const rowAvg = avgNumbers(rowNums);
    matrix.push([rowDef.label, ...nums.map((n) => (n == null ? '' : round2(n))), rowAvg == null ? '' : round2(rowAvg)]);
  });
  matrix.push(['BLOQUE FISICO', ...names.map(() => ''), '']);
  iaRows.slice(4, 6).forEach((rowDef) => {
    const nums = roster.map((p: any) => normalizeScoreTo10(p?.[rowDef.key]));
    const rowNums = nums.filter((n): n is number => n != null);
    const rowAvg = avgNumbers(rowNums);
    matrix.push([rowDef.label, ...nums.map((n) => (n == null ? '' : round2(n))), rowAvg == null ? '' : round2(rowAvg)]);
  });
  matrix.push(['BLOQUE MENTAL', ...names.map(() => ''), '']);
  iaRows.slice(6).forEach((rowDef) => {
    const nums = roster.map((p: any) => normalizeScoreTo10(p?.[rowDef.key]));
    const rowNums = nums.filter((n): n is number => n != null);
    const rowAvg = avgNumbers(rowNums);
    matrix.push([rowDef.label, ...nums.map((n) => (n == null ? '' : round2(n))), rowAvg == null ? '' : round2(rowAvg)]);
  });

  const baseScores = roster.map((p) => normalizeScoreTo10(resolveIAScore(p))).filter((n): n is number => n != null);
  const baseScoresByPlayer = roster.map((p) => normalizeScoreTo10(resolveIAScore(p)));
  const teamAvg = avgNumbers(baseScores) ?? 0;
  const adjustments = baseScoresByPlayer.map((s) => (s == null ? '' : computeAdjustment10(s, teamAvg)));
  const finalScores = baseScoresByPlayer.map((s, i) => (s == null ? '' : round2(clampRange(s + Number(adjustments[i] || 0), 1, 10))));

  matrix.push(['RESULTADO IA BASE (0-10)', ...baseScoresByPlayer.map((s) => (s == null ? '' : round2(s))), teamAvg ? round2(teamAvg) : '']);
  matrix.push(['VALORACION GLOBAL EQUIPO (0-10)', ...baseScoresByPlayer.map((s) => (s == null ? '' : round2(teamAvg))), teamAvg ? round2(teamAvg) : '']);
  matrix.push(['AJUSTE POR EQUIPO', ...adjustments, 0]);
  matrix.push(['RESULTADO IA FINAL AJUSTADO (0-10)', ...finalScores, teamAvg ? round2(teamAvg) : '']);
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
  const adjustments05 = baseScores.map((s) => (s == null ? '' : computeAdjustment(s, teamAvg)));
  const finalScores05 = baseScores.map((s, idx) => (s == null ? '' : round2(clampRange(s + Number(adjustments05[idx] || 0), 1, 5))));

  const baseScores10 = baseScores.map((s) => (s == null ? '' : toTenScale(s)));
  const teamAvg10 = teamAvg ? toTenScale(teamAvg) : '';
  const adjustments10 = adjustments05.map((a) => (a === '' ? '' : toTenScale(Number(a))));
  const finalScores10 = finalScores05.map((s) => (s === '' ? '' : toTenScale(Number(s))));

  matrix.push(['RESULTADO PERSONAL BASE (0-10)', ...baseScores10, teamAvg10]);
  matrix.push(['VALORACION GLOBAL EQUIPO (0-10)', ...baseScores.map((s) => (s == null ? '' : teamAvg10)), teamAvg10]);
  matrix.push(['AJUSTE POR EQUIPO', ...adjustments10, 0]);
  matrix.push(['RESULTADO PERSONAL FINAL AJUSTADO (0-10)', ...finalScores10, teamAvg10]);
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

function hasPersonalFormDetailRows(evRows: EvaluacionDIExportRow[]): boolean {
  return (evRows || []).some((r) => String(r.bloque || '').trim() === SHEET_BLOQUE_FORMULARIO_PERSONAL);
}

/** Importable como formulario personal: debe tener filas FORMULARIO_PERSONAL. */
function isPersonalEvalImportableRows(rows: EvaluacionDIExportRow[]): boolean {
  if (!hasPersonalFormDetailRows(rows)) return false;
  return rows.some((r) => !String(r.bloque || '').trim() && !String(r.pregunta || '').trim());
}

/** Importable como evaluación periódica: solo fila(s) raíz sin detalle. */
function isPeriodicaEvalImportableRows(rows: EvaluacionDIExportRow[]): boolean {
  return isRootOnlyEvaluationRows(rows);
}

function rebuildPersonalFormEvalFromSheetRows(evalId: string, sorted: EvaluacionDIExportRow[]): Record<string, unknown> {
  const root =
    sorted.find((r) => !String(r.bloque || '').trim() && !String(r.pregunta || '').trim()) ?? sorted[0];
  const answers: Record<string, string> = {};
  for (const r of sorted) {
    if (String(r.bloque || '').trim() !== SHEET_BLOQUE_FORMULARIO_PERSONAL) continue;
    const qid = String(r.subbloque || '').trim();
    if (!qid) continue;
    answers[qid] = String(r.respuesta ?? '').trim();
  }
  const sections = PERSONAL_FORM_SECTIONS.map((s) => s.id).filter((sid) => {
    const sec = PERSONAL_FORM_SECTIONS.find((x) => x.id === sid);
    return sec?.questions.some((q) => Object.prototype.hasOwnProperty.call(answers, q.id));
  });
  return {
    id: evalId,
    fecha: String(root.fecha_eval || ''),
    score: parseEvalScoreCell(String(root.score_eval)),
    fuente: String(root.fuente || 'sheet'),
    observaciones: '',
    edad: 0,
    experienciaFS: 0,
    personalForm: {
      sections: sections.length > 0 ? sections : defaultPersonalFormSectionIds(),
      answers,
    },
  };
}

/** Reconstruye un objeto evaluación a partir de filas planas de la hoja Evaluacion_DI. */
function rebuildEvalFromSheetRows(evalId: string, evRows: EvaluacionDIExportRow[]): Record<string, unknown> {
  const sorted = [...evRows].sort((a, b) => String(a.row_id).localeCompare(String(b.row_id)));
  if (hasPersonalFormDetailRows(sorted as EvaluacionDIExportRow[])) {
    return rebuildPersonalFormEvalFromSheetRows(evalId, sorted as EvaluacionDIExportRow[]);
  }
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

/**
 * Aplica evaluacionesDI desde el sheet.
 * - kind === 'all': sustituye todas las evaluaciones del jugador con datos en sheet.
 * - kind parcial: conserva las de otros tipos y solo sustituye las del tipo pedido.
 */
function applyImportedEvaluacionesDIToPlayers(players: Player[], rows: EvaluacionDIExportRow[], kind: EvaluacionDIKind = 'all'): Player[] {
  if (!Array.isArray(rows) || rows.length === 0) return players;
  const byPlayer = groupEvaluacionDIRows(rows, (r) => String(r.jugador_id || '').trim());

  return players.map((p) => {
    const jid = String(p.id || '').trim();
    const prows = byPlayer.get(jid);
    if (!prows?.length) return p;

    const byEval = groupEvaluacionDIRows(prows, (r) => String(r.eval_id || '').trim());
    const imported: Record<string, unknown>[] = [];
    for (const [eid, evRows] of byEval) {
      if (!eid) continue;
      const rowsCast = evRows as EvaluacionDIExportRow[];
      if (kind === 'ia' && (isRootOnlyEvaluationRows(rowsCast) || hasPersonalFormDetailRows(rowsCast))) continue;
      if (kind === 'personal' && !isPersonalEvalImportableRows(rowsCast)) continue;
      if (kind === 'periodica' && !isPeriodicaEvalImportableRows(rowsCast)) continue;
      imported.push(rebuildEvalFromSheetRows(eid, evRows));
    }

    const prev = Array.isArray((p as any).evaluacionesDI) ? ((p as any).evaluacionesDI as any[]) : [];
    const evals =
      kind === 'all'
        ? imported
        : [...prev.filter((ev) => !shouldKeepEvalByKind(ev, kind)), ...imported];

    evals.sort((a, b) => String((a as any)?.fecha || '').localeCompare(String((b as any)?.fecha || '')));
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
export async function exportEntrenamientos(
  entrenamientos: Entrenamiento[],
  players: Player[] = []
): Promise<{ success: boolean; message: string }> {
  try {
    const rows = convertEntrenamientosToRows(entrenamientos, players);
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
    const fechaKey = (fecha: unknown) => {
      const raw = String(fecha || '').trim();
      const d = parseToDate(raw);
      return d ? formatDateGlobal(d) : raw;
    };
    const existingFechas = new Set<string>();
    existing.data.forEach((e: Entrenamiento) => existingFechas.add(fechaKey(e.fecha)));
    const nuevos = entrenamientos.filter((e: Entrenamiento) => {
      const key = fechaKey(e.fecha);
      return !!key && !existingFechas.has(key);
    });
    if (nuevos.length === 0) {
      return { success: true, message: 'No hay entrenamientos nuevos para exportar.', exportedCount: 0 };
    }
    const rows = convertEntrenamientosToRows(nuevos, players);
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
  /** Exportar todas: evita que un export parcial deje la hoja Evaluacion_DI sin el resto (según script desplegado). */
  return exportEvaluacionesDIByKind(players, 'all');
}

export async function exportEvaluacionesDIPersonal(players: Player[]): Promise<{ success: boolean; message: string; inserted?: number }> {
  return exportEvaluacionesDIByKind(players, 'personal');
}

export async function exportEvaluacionesDIPeriodica(players: Player[]): Promise<{ success: boolean; message: string; inserted?: number }> {
  return exportEvaluacionesDIByKind(players, 'periodica');
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
      /** Siempre adjuntar ambas matrices: el GAS solo escribe las que marquen updateIA/updatePersonal. */
      iaMatrix: buildIAMatrix(players),
      personalMatrix: buildPersonalMatrix(players),
    };

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

export async function importEvaluacionesDIPeriodica(players: Player[]) {
  return importEvaluacionesDIByKind(players, 'periodica');
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

const FETCH_TIMEOUT_MS = 120000;

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
      { signal: controller.signal, timeoutMs: FETCH_TIMEOUT_MS }
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
      { signal: controller.signal, timeoutMs: FETCH_TIMEOUT_MS }
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
): Promise<{ success: boolean; url?: string; fileId?: string; message: string }> {
  try {
    const fileName = (playerName || 'jugador').replace(/[^a-zA-Z0-9\s-_]/g, '').trim() || 'jugador';
    const cfg = await getDriveFoldersConfig();
    const folderId = cfg.fotosFolderId || FOLDER_ID_FOTOS;

    const parsed = await postGoogleScript({
      action: 'uploadPhotoToDrive',
      folderId,
      rootFolderId: cfg.rootFolderId || undefined,
      folderName: 'Fotos jugadores',
      fileName: fileName + '.jpg',
      base64Data: base64Data,
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    if (result.success && (result.url || result.imageUrl || result.fileId)) {
      const fileId =
        String(result.fileId || '').trim() ||
        extractDriveFileId(String(result.imageUrl || result.url || ''));
      const imageUrl = String(result.imageUrl || '').trim() || drivePhotoDisplayUrl(fileId);
      return {
        success: true,
        url: imageUrl || String(result.url || ''),
        fileId: fileId || undefined,
        message: 'Foto subida correctamente',
      };
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
    const cfg = await getDriveFoldersConfig();
    const folderId = cfg.actasFolderId || FOLDER_ID_ACTAS;
    const parsed = await postGoogleScript({
      action: 'uploadActaToDrive',
      folderId,
      rootFolderId: cfg.rootFolderId || undefined,
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
    const cfg = await getDriveFoldersConfig();
    const folderId = cfg.actasFolderId || FOLDER_ID_ACTAS;
    const parsed = await postGoogleScript({
      action: 'listActasDrive',
      folderId,
      rootFolderId: cfg.rootFolderId || undefined,
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

/** Importa historial de sesiones del cronómetro (hoja Historial_Cronometro). */
export async function importHistorialCronometro(
  equipo: string,
  temporada: string
): Promise<{ success: boolean; historial: unknown[]; message: string }> {
  try {
    const parsed = await postGoogleScript({
      action: 'importHistorialCronometro',
      spreadsheetId: await getSpreadsheetId(),
      equipo,
      temporada,
    });
    if (!parsed.ok) return { success: false, historial: [], message: parsed.message };
    const result = parsed.data;
    if (result?.success) {
      const historial = Array.isArray(result.historial) ? result.historial : [];
      return { success: true, historial, message: 'Historial del cronómetro importado' };
    }
    return { success: false, historial: [], message: result?.message || 'Error al importar historial' };
  } catch (error) {
    return { success: false, historial: [], message: `Error de conexión: ${(error as Error).message}` };
  }
}

/** Exporta historial de sesiones del cronómetro a la hoja Historial_Cronometro. */
export async function exportHistorialCronometro(
  equipo: string,
  temporada: string,
  historial: unknown[]
): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = await postGoogleScript({
      action: 'exportHistorialCronometro',
      spreadsheetId: await getSpreadsheetId(),
      equipo,
      temporada,
      historial: Array.isArray(historial) ? historial : [],
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    return result?.success
      ? { success: true, message: result.message || 'Historial exportado' }
      : { success: false, message: result?.message || 'Error al exportar historial' };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${(error as Error).message}` };
  }
}

/** Importa eventos del calendario (hoja Calendario_Eventos). */
export async function importCalendarioEventos(
  equipo: string,
  temporada: string
): Promise<{ success: boolean; eventos: unknown[]; message: string }> {
  try {
    const parsed = await postGoogleScript({
      action: 'importCalendarioEventos',
      spreadsheetId: await getSpreadsheetId(),
      equipo,
      temporada,
    });
    if (!parsed.ok) return { success: false, eventos: [], message: parsed.message };
    const result = parsed.data;
    if (result?.success) {
      const eventos = Array.isArray(result.eventos) ? result.eventos : [];
      return { success: true, eventos, message: 'Calendario importado' };
    }
    return { success: false, eventos: [], message: result?.message || 'Error al importar calendario' };
  } catch (error) {
    return { success: false, eventos: [], message: `Error de conexión: ${(error as Error).message}` };
  }
}

/** Exporta eventos del calendario a la hoja Calendario_Eventos. */
export async function exportCalendarioEventos(
  equipo: string,
  temporada: string,
  eventos: unknown[]
): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = await postGoogleScript({
      action: 'exportCalendarioEventos',
      spreadsheetId: await getSpreadsheetId(),
      equipo,
      temporada,
      eventos: Array.isArray(eventos) ? eventos : [],
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    return result?.success
      ? { success: true, message: result.message || 'Calendario exportado' }
      : { success: false, message: result?.message || 'Error al exportar calendario' };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${(error as Error).message}` };
  }
}

export type PartidoActaMetaRow = {
  partidoKey: string;
  fecha?: string;
  rival?: string;
  lugar?: string;
  acta: Record<string, unknown>;
};

/** Lista fotos de jugadores en la carpeta de Drive configurada. */
export async function listPhotosFromDrive(): Promise<{
  success: boolean;
  files: Array<{ id: string; name: string; url: string; mimeType?: string; createdTime?: string }>;
  folderId?: string;
  message: string;
}> {
  try {
    const cfg = await getDriveFoldersConfig();
    const folderId = cfg.fotosFolderId || FOLDER_ID_FOTOS;
    const parsed = await postGoogleScript({
      action: 'listPhotosDrive',
      folderId,
      rootFolderId: cfg.rootFolderId || undefined,
      folderName: 'Fotos jugadores',
    });
    if (!parsed.ok) return { success: false, files: [], message: parsed.message };
    const result = parsed.data;
    if (result.success) {
      return {
        success: true,
        files: Array.isArray(result.files) ? result.files : [],
        folderId: result.folderId,
        message: result.message || 'Fotos listadas correctamente',
      };
    }
    return { success: false, files: [], message: result.message || 'No se pudieron listar las fotos' };
  } catch (error) {
    return { success: false, files: [], message: `Error: ${(error as Error).message}` };
  }
}

/** Descarga un archivo de Drive como base64 (tamaño limitado en el servidor). */
export async function getDriveFileBase64(
  fileId: string,
  maxBytes?: number
): Promise<{
  success: boolean;
  base64?: string;
  mimeType?: string;
  name?: string;
  url?: string;
  tooLarge?: boolean;
  message: string;
}> {
  try {
    const parsed = await postGoogleScript({
      action: 'getDriveFileBase64',
      fileId,
      maxBytes,
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    if (result.success && result.base64) {
      return {
        success: true,
        base64: result.base64,
        mimeType: result.mimeType,
        name: result.name,
        url: result.url,
        message: result.message || 'Archivo descargado',
      };
    }
    return {
      success: false,
      tooLarge: !!result.tooLarge,
      message: result.message || 'No se pudo descargar el archivo',
    };
  } catch (error) {
    return { success: false, message: `Error: ${(error as Error).message}` };
  }
}

/** Importa metadatos de actas (hoja Partidos_Actas). */
export async function importPartidosActas(): Promise<{
  success: boolean;
  actas: PartidoActaMetaRow[];
  message: string;
}> {
  try {
    const parsed = await postGoogleScript({
      action: 'importPartidosActas',
      spreadsheetId: await getSpreadsheetId(),
    });
    if (!parsed.ok) return { success: false, actas: [], message: parsed.message };
    const result = parsed.data;
    if (result?.success) {
      return {
        success: true,
        actas: Array.isArray(result.actas) ? result.actas : [],
        message: result.message || 'Actas importadas',
      };
    }
    return { success: false, actas: [], message: result?.message || 'Error al importar actas' };
  } catch (error) {
    return { success: false, actas: [], message: `Error de conexión: ${(error as Error).message}` };
  }
}

/** Exporta metadatos de actas a la hoja Partidos_Actas. */
export async function exportPartidosActas(
  actas: PartidoActaMetaRow[]
): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = await postGoogleScript({
      action: 'exportPartidosActas',
      spreadsheetId: await getSpreadsheetId(),
      actas: Array.isArray(actas) ? actas : [],
    });
    if (!parsed.ok) return { success: false, message: parsed.message };
    const result = parsed.data;
    return result?.success
      ? { success: true, message: result.message || 'Actas exportadas' }
      : { success: false, message: result?.message || 'Error al exportar actas' };
  } catch (error) {
    return { success: false, message: `Error de conexión: ${(error as Error).message}` };
  }
}
