/**
 * Persistencia local: AsyncStorage con versionado básico.
 * Carga/guarda players, partidos y entrenos por equipo+temporada.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { keysFor, buildLegacyStorageKey, CONFIG_LISTA_EQUIPOS, CONFIG_FIRST_RUN_DONE, CONFIG_STORAGE_MODE } from './storageKeys';

const LEGACY_LISTA_EQUIPOS = '@config_lista_equipos_v3';

export interface StoredData {
  players: unknown[];
  partidos: unknown[];
  entrenos: unknown[];
  eventosCalendario: unknown[];
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
export async function getListaEquipos(): Promise<Array<{ id: number; nombre: string; temporada: string }>> {
  try {
    let json = await AsyncStorage.getItem(CONFIG_LISTA_EQUIPOS);
    if (!json) json = await AsyncStorage.getItem(LEGACY_LISTA_EQUIPOS);
    if (!json) return [{ id: 1, nombre: 'Leganés Amas B', temporada: '2025-26' }];
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [{ id: 1, nombre: 'Leganés Amas B', temporada: '2025-26' }];
  }
}

export async function setListaEquipos(lista: Array<{ id: number; nombre: string; temporada: string }>): Promise<void> {
  await AsyncStorage.setItem(CONFIG_LISTA_EQUIPOS, JSON.stringify(lista));
  await AsyncStorage.setItem(LEGACY_LISTA_EQUIPOS, JSON.stringify(lista));
}

export type StorageMode = 'local' | 'cloud' | 'both';

export async function getStorageMode(): Promise<StorageMode> {
  const v = await AsyncStorage.getItem(CONFIG_STORAGE_MODE);
  if (v === 'cloud' || v === 'both') return v;
  return 'local';
}

export async function setStorageMode(mode: StorageMode): Promise<void> {
  await AsyncStorage.setItem(CONFIG_STORAGE_MODE, mode);
}

export async function getFirstRunDone(): Promise<boolean> {
  return (await AsyncStorage.getItem(CONFIG_FIRST_RUN_DONE)) === '1';
}

export async function setFirstRunDone(): Promise<void> {
  await AsyncStorage.setItem(CONFIG_FIRST_RUN_DONE, '1');
}
