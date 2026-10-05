/**
 * Persistencia local: AsyncStorage con versionado básico.
 * Carga/guarda players, partidos y entrenos por equipo+temporada.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { keysFor, buildLegacyStorageKey, CONFIG_LISTA_EQUIPOS, CONFIG_FIRST_RUN_DONE, CONFIG_STORAGE_MODE } from './storageKeys';
import { notifyUserAppDataChanged } from './userCloudSync';
import { getActiveFirebaseUid, scopedAccountStorageKey } from '../services/firebaseUserDataService';
import { LEGACY_LISTA_EQUIPOS } from './accountStorageScope';

const LEGACY_LISTA_EQUIPOS_GLOBAL = LEGACY_LISTA_EQUIPOS;

export interface StoredData {
  players: unknown[];
  partidos: unknown[];
  entrenos: unknown[];
  eventosCalendario: unknown[];
}

export interface TeamSettings {
  escudoUri?: string | null;
}

const CURRENT_DATA_VERSION = 1;

const parseArray = (json: string | null): unknown[] => {
  if (json == null) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

async function loadByBase(base: string): Promise<StoredData> {
  const [playersJson, partidosJson, entrenosJson, eventosJson] = await Promise.all([
    AsyncStorage.getItem(`${base}:players`),
    AsyncStorage.getItem(`${base}:partidos`),
    AsyncStorage.getItem(`${base}:entrenos`),
    AsyncStorage.getItem(`${base}:eventos_calendario`),
  ]);
  return {
    players: parseArray(playersJson),
    partidos: parseArray(partidosJson),
    entrenos: parseArray(entrenosJson),
    eventosCalendario: parseArray(eventosJson),
  };
}

function scoreData(d: StoredData): number {
  // Priorizamos la base más rica en datos reales.
  return d.players.length * 10 + d.partidos.length * 6 + d.entrenos.length * 4 + d.eventosCalendario.length * 2;
}

async function getStoredVersion(versionKey: string): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(versionKey);
    return v != null ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Carga todos los datos del equipo/temporada.
 * Si no hay datos o versión antigua, devuelve vacío (sin migrar por ahora).
 */
export async function loadLocalData(equipo: string, temporada: string): Promise<StoredData> {
  const k = keysFor(equipo, temporada);
  const legacyBase = buildLegacyStorageKey(equipo, temporada);
  const version = await getStoredVersion(k.version);
  // Nunca vaciar por versión "futura": intentamos cargar igualmente.
  if (version > CURRENT_DATA_VERSION) {
    console.warn('Stored version is newer, loading data in compatibility mode');
  }

  // Carga estricta por equipo/temporada para evitar mezclar datos entre equipos.
  const baseCandidates = Array.from(new Set([
    k.base,         // formato actual @futsal_lega:Equipo:Temporada
    legacyBase,     // compatibilidad con builds previas del mismo equipo/temporada
  ]));

  let bestLoaded: StoredData = { players: [], partidos: [], entrenos: [], eventosCalendario: [] };
  let bestBase = '';
  let bestScore = -1;

  for (const base of baseCandidates) {
    const loaded = await loadByBase(base);
    const score = scoreData(loaded);
    if (score > bestScore) {
      bestScore = score;
      bestLoaded = loaded;
      bestBase = base;
    }
  }

  // Migración silenciosa al formato actual para próximas cargas.
  const hasPrimaryData = await Promise.all([
    AsyncStorage.getItem(k.players),
    AsyncStorage.getItem(k.partidos),
    AsyncStorage.getItem(k.entrenos),
    AsyncStorage.getItem(k.eventosCalendario),
  ]);
  const primaryEmpty = hasPrimaryData.every((v) => v == null || v === '[]' || v === 'null');
  if (primaryEmpty && (bestLoaded.players.length || bestLoaded.partidos.length || bestLoaded.entrenos.length || bestLoaded.eventosCalendario.length)) {
    console.log(`Migrando datos desde base detectada: ${bestBase || 'desconocida'}`);
    await Promise.all([
      AsyncStorage.setItem(k.players, JSON.stringify(bestLoaded.players)),
      AsyncStorage.setItem(k.partidos, JSON.stringify(bestLoaded.partidos)),
      AsyncStorage.setItem(k.entrenos, JSON.stringify(bestLoaded.entrenos)),
      AsyncStorage.setItem(k.eventosCalendario, JSON.stringify(bestLoaded.eventosCalendario)),
      AsyncStorage.setItem(k.version, String(CURRENT_DATA_VERSION)),
    ]);
  }

  return bestLoaded;
}

/**
 * Guarda players y escribe versión.
 */
export async function savePlayers(equipo: string, temporada: string, players: unknown[]): Promise<void> {
  const k = keysFor(equipo, temporada);
  await Promise.all([
    AsyncStorage.setItem(k.players, JSON.stringify(players)),
    AsyncStorage.setItem(k.version, String(CURRENT_DATA_VERSION)),
  ]);
}

/**
 * Guarda partidos y actualiza versión.
 */
export async function savePartidos(equipo: string, temporada: string, partidos: unknown[]): Promise<void> {
  const k = keysFor(equipo, temporada);
  await Promise.all([
    AsyncStorage.setItem(k.partidos, JSON.stringify(partidos)),
    AsyncStorage.setItem(k.version, String(CURRENT_DATA_VERSION)),
  ]);
}

/**
 * Guarda entrenos y actualiza versión.
 */
export async function saveEntrenos(equipo: string, temporada: string, entrenos: unknown[]): Promise<void> {
  const k = keysFor(equipo, temporada);
  await Promise.all([
    AsyncStorage.setItem(k.entrenos, JSON.stringify(entrenos)),
    AsyncStorage.setItem(k.version, String(CURRENT_DATA_VERSION)),
  ]);
}

/**
 * Guarda eventos del calendario (creados manualmente al pulsar un día).
 */
export async function saveEventosCalendario(equipo: string, temporada: string, eventos: unknown[]): Promise<void> {
  const k = keysFor(equipo, temporada);
  await Promise.all([
    AsyncStorage.setItem(k.eventosCalendario, JSON.stringify(eventos)),
    AsyncStorage.setItem(k.version, String(CURRENT_DATA_VERSION)),
  ]);
}

/**
 * Comprueba si existe algún dato guardado para este equipo/temporada.
 */
export async function hasLocalData(equipo: string, temporada: string): Promise<boolean> {
  const k = keysFor(equipo, temporada);
  const legacyBase = buildLegacyStorageKey(equipo, temporada);
  const [p, pa, e, lp, lpa, le] = await Promise.all([
    AsyncStorage.getItem(k.players),
    AsyncStorage.getItem(k.partidos),
    AsyncStorage.getItem(k.entrenos),
    AsyncStorage.getItem(`${legacyBase}:players`),
    AsyncStorage.getItem(`${legacyBase}:partidos`),
    AsyncStorage.getItem(`${legacyBase}:entrenos`),
  ]);
  const has = (s: string | null) => s != null && s !== '[]' && s !== 'null';
  if (has(p) || has(pa) || has(e) || has(lp) || has(lpa) || has(le)) return true;

  return false;
}

/**
 * Lista de equipos guardada (compatibilidad con SelectorEquipo).
 */
export async function getListaEquipos(forUid?: string | null): Promise<Array<{ id: number; nombre: string; temporada: string }>> {
  try {
    const uid = forUid !== undefined ? forUid : getActiveFirebaseUid();
    const scopedKey = scopedAccountStorageKey(CONFIG_LISTA_EQUIPOS, uid);
    let json = await AsyncStorage.getItem(scopedKey);
    if (!json && !uid) {
      json = await AsyncStorage.getItem(LEGACY_LISTA_EQUIPOS_GLOBAL);
      if (!json) json = await AsyncStorage.getItem(CONFIG_LISTA_EQUIPOS);
    }
    if (!json) return [];
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function setListaEquipos(
  lista: Array<{ id: number; nombre: string; temporada: string }>,
  forUid?: string | null
): Promise<void> {
  const uid = forUid !== undefined ? forUid : getActiveFirebaseUid();
  const scopedKey = scopedAccountStorageKey(CONFIG_LISTA_EQUIPOS, uid);
  await AsyncStorage.setItem(scopedKey, JSON.stringify(lista));
  await AsyncStorage.setItem(scopedAccountStorageKey(LEGACY_LISTA_EQUIPOS_GLOBAL, uid), JSON.stringify(lista));
  notifyUserAppDataChanged();
}

export type StorageMode = 'local' | 'cloud' | 'both';

export async function getStorageMode(forUid?: string | null): Promise<StorageMode> {
  const uid = forUid !== undefined ? forUid : getActiveFirebaseUid();
  const v = await AsyncStorage.getItem(scopedAccountStorageKey(CONFIG_STORAGE_MODE, uid));
  if (v === 'cloud' || v === 'both') return v;
  return 'local';
}

export async function setStorageMode(mode: StorageMode): Promise<void> {
  const uid = getActiveFirebaseUid();
  await AsyncStorage.setItem(scopedAccountStorageKey(CONFIG_STORAGE_MODE, uid), mode);
  notifyUserAppDataChanged();
}

export async function getFirstRunDone(forUid?: string | null): Promise<boolean> {
  const uid = forUid !== undefined ? forUid : getActiveFirebaseUid();
  return (await AsyncStorage.getItem(scopedAccountStorageKey(CONFIG_FIRST_RUN_DONE, uid))) === '1';
}

export async function setFirstRunDone(forUid?: string | null): Promise<void> {
  const uid = forUid !== undefined ? forUid : getActiveFirebaseUid();
  await AsyncStorage.setItem(scopedAccountStorageKey(CONFIG_FIRST_RUN_DONE, uid), '1');
  notifyUserAppDataChanged();
}

export async function getTeamSettings(equipo: string, temporada: string): Promise<TeamSettings> {
  const k = keysFor(equipo, temporada);
  try {
    const raw = await AsyncStorage.getItem(`${k.base}:team_settings`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      escudoUri: typeof parsed.escudoUri === 'string' ? parsed.escudoUri : null,
    };
  } catch {
    return {};
  }
}

export async function setTeamSettings(equipo: string, temporada: string, settings: TeamSettings): Promise<void> {
  const k = keysFor(equipo, temporada);
  const safe: TeamSettings = {
    escudoUri: settings?.escudoUri ? String(settings.escudoUri) : null,
  };
  await AsyncStorage.setItem(`${k.base}:team_settings`, JSON.stringify(safe));
}

/** ISO de la última sincronización Sheet exitosa (por equipo+temporada). */
export async function getLastSuccessfulSyncAt(equipo: string, temporada: string): Promise<string | null> {
  const k = keysFor(equipo, temporada);
  try {
    const raw = await AsyncStorage.getItem(`${k.base}:last_sheet_sync_at`);
    const v = String(raw || '').trim();
    return v || null;
  } catch {
    return null;
  }
}

export async function setLastSuccessfulSyncAt(
  equipo: string,
  temporada: string,
  iso?: string | null
): Promise<void> {
  const k = keysFor(equipo, temporada);
  const value = String(iso || new Date().toISOString()).trim();
  await AsyncStorage.setItem(`${k.base}:last_sheet_sync_at`, value);
}

export interface BibliotecaImage {
  id: string;
  uri: string;
  /** Etiqueta libre asignada por el usuario para encontrarla rápidamente. */
  titulo: string;
  /** ISO timestamp para ordenación por antigüedad. */
  createdAt: string;
}

export interface BibliotecaNote {
  id: string;
  titulo: string;
  texto: string;
  createdAt: string;
  updatedAt: string;
}

export interface BibliotecaContents {
  imagenes: BibliotecaImage[];
  notas: BibliotecaNote[];
}

const EMPTY_BIBLIOTECA: BibliotecaContents = { imagenes: [], notas: [] };

function bibliotecaKey(equipo: string, temporada: string): string {
  const k = keysFor(equipo, temporada);
  return `${k.base}:biblioteca`;
}

export async function loadBiblioteca(equipo: string, temporada: string): Promise<BibliotecaContents> {
  try {
    const raw = await AsyncStorage.getItem(bibliotecaKey(equipo, temporada));
    if (!raw) return { ...EMPTY_BIBLIOTECA };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_BIBLIOTECA };
    return {
      imagenes: Array.isArray(parsed.imagenes) ? parsed.imagenes : [],
      notas: Array.isArray(parsed.notas) ? parsed.notas : [],
    };
  } catch {
    return { ...EMPTY_BIBLIOTECA };
  }
}

export async function saveBiblioteca(equipo: string, temporada: string, contents: BibliotecaContents): Promise<void> {
  const safe: BibliotecaContents = {
    imagenes: Array.isArray(contents?.imagenes) ? contents.imagenes : [],
    notas: Array.isArray(contents?.notas) ? contents.notas : [],
  };
  await AsyncStorage.setItem(bibliotecaKey(equipo, temporada), JSON.stringify(safe));
}

export type HistorialCronometroSession = {
  id: string;
  rival?: string;
  fecha?: string;
  goles?: { favor?: number; contra?: number; eventos?: unknown[] };
  tiempos?: Record<string, number[]>;
  extraTimeSeconds?: number;
};

export async function loadHistorialPartidos(equipo: string, temporada: string): Promise<HistorialCronometroSession[]> {
  try {
    const k = keysFor(equipo, temporada);
    const raw = await AsyncStorage.getItem(k.historialPartidos);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveHistorialPartidos(
  equipo: string,
  temporada: string,
  historial: HistorialCronometroSession[]
): Promise<void> {
  const k = keysFor(equipo, temporada);
  const safe = Array.isArray(historial) ? historial : [];
  await AsyncStorage.setItem(k.historialPartidos, JSON.stringify(safe));
}

/** Elimina todos los datos locales de un equipo/temporada (plantilla, partidos, config, etc.). */
export async function deleteEquipoTemporadaData(equipo: string, temporada: string): Promise<void> {
  const k = keysFor(equipo, temporada);
  const legacyBase = buildLegacyStorageKey(equipo, temporada);
  const keysToRemove = [
    k.players,
    k.partidos,
    k.entrenos,
    k.eventosCalendario,
    k.version,
    k.historialPartidos,
    `${k.base}:team_settings`,
    `${k.base}:biblioteca`,
    `${legacyBase}:players`,
    `${legacyBase}:partidos`,
    `${legacyBase}:entrenos`,
    `${legacyBase}:eventos_calendario`,
    `${legacyBase}:team_settings`,
    `${legacyBase}:biblioteca`,
  ];
  await AsyncStorage.multiRemove(keysToRemove);
}
