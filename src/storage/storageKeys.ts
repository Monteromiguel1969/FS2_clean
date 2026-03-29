/**
 * Claves de persistencia local.
 * Todas las claves por equipo/temporada se construyen aquí para evitar conflictos.
 */

const PREFIX = '@futsal_lega';
const CONFIG_LISTA_EQUIPOS = `${PREFIX}_lista_equipos`;
const CONFIG_STORAGE_MODE = `${PREFIX}_storage_mode`; // 'local' | 'cloud' | 'both'
const CONFIG_FIRST_RUN_DONE = `${PREFIX}_first_run_done`;
const CONFIG_DRIVE_FOLDER_IDS = `${PREFIX}_drive_folders`; // JSON map

/**
 * Genera clave de almacenamiento para un equipo/temporada.
 * Ej: "Leganés Amas B" + "2025-26" -> @futsal_lega:Leganes_Amas_B:2025-26
 */
export function buildStorageKey(equipo: string, temporada: string): string {
  const safe = (s: string) => String(s || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  // Formato histórico estable para evitar pérdida de datos en actualizaciones.
  return `${PREFIX}:${safe(equipo)}:${safe(temporada)}`;
}

export function buildLegacyStorageKey(equipo: string, temporada: string): string {
  const safe = (s: string) => String(s || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
  return `${PREFIX}:${safe(equipo)}:${safe(temporada)}`;
}

/**
 * Claves concretas para players, partidos, entrenos y versión.
 */
export function keysFor(equipo: string, temporada: string) {
  const base = buildStorageKey(equipo, temporada);
  return {
    base,
    players: `${base}:players`,
    partidos: `${base}:partidos`,
    entrenos: `${base}:entrenos`,
    eventosCalendario: `${base}:eventos_calendario`,
    version: `${base}:version`,
    historialPartidos: `${base}:historial_partidos`,
  };
}

export {
  CONFIG_LISTA_EQUIPOS,
  CONFIG_STORAGE_MODE,
  CONFIG_FIRST_RUN_DONE,
  CONFIG_DRIVE_FOLDER_IDS,
};
