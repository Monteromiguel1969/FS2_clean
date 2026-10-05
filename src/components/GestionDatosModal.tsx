import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import { useScreenMetrics } from '../utils/useScreenMetrics';
import { FontAwesome } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import {
  exportPlantilla,
  importPlantilla,
  exportPartidosSoloNuevos,
  importPartidos,
  exportEntrenamientosSoloNuevos,
  importEntrenamientos,
  exportEvaluacionesDIIA,
  exportEvaluacionesDIPersonal,
  exportEvaluacionesDIPeriodica,
  exportEvaluacionesDIViewsIA,
  exportEvaluacionesDIViewsPersonal,
  importEvaluacionesDIIA,
  importEvaluacionesDIPersonal,
  importEvaluacionesDIPeriodica,
  exportHistorialCronometro,
  importHistorialCronometro,
  exportCalendarioEventos,
  importCalendarioEventos,
  getCurrentSpreadsheetId,
  setUserSpreadsheetId,
  getCurrentDriveRootFolderId,
  setUserDriveRootFolderId,
  ensureDriveWorkspace,
  syncAllBooksFromRegistry,
  normalizeSpreadsheetIdInput,
  normalizeDriveFolderIdInput,
  resolveTeamCloudFormFields,
  hydrateTeamCloudFromRegistry,
  prepareActiveTeamSpreadsheet,
  setActiveTeamCloudContext,
} from '../services/googleSheetsService';
import { waitGoogleScriptBridgeReady } from '../services/googleScriptWebViewBridge';
import { checkForAppUpdatesAndPrompt } from '../services/appUpdateService';
import { normalizePlayerRatings } from '../utils/playerRating';
import { getStorageMode, loadHistorialPartidos, saveHistorialPartidos } from '../storage/localStorage';
import { formatTeamBookName, getTeamCloudConfig, setTeamCloudConfig } from '../storage/teamCloudStorage';
import {
  isReferenceDevice,
  resolveSyncAuthority,
  setReferenceDevice,
  type SyncAuthorityInfo,
} from '../storage/referenceDeviceStorage';
import CrearLibroAsistenteModal from './CrearLibroAsistenteModal';
import { resetUserAppDataToEmpty } from '../services/firebaseUserDataService';
import {
  applyImportedActasToPartidos,
  buildPartidosActasRows,
  exportPartidosActasMerged,
  importPartidosActasMerged,
  syncPartidosActas,
  syncPlayersPhotos,
  attachRemotePhotoLinks,
} from '../services/syncDriveAssetsService';

const PREFIJO = '@Leganes_Amas_B_2025-26:';

// Formatea fecha a DD/MM/YYYY para export/import
export function formatFechaDDMMYYYY(date: Date | string): string {
  if (typeof date === 'string') {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

interface GestionDatosModalProps {
  visible: boolean;
  onClose: () => void;
  equipo?: string;
  temporada?: string;
  players: any[];
  partidos: any[];
  entrenos: any[];
  eventosCalendario?: any[];
  setPlayers: (data: any[]) => Promise<void>;
  setPartidos: (data: any[]) => Promise<void>;
  setEntrenos: (data: any[]) => Promise<void>;
  setEventosCalendario?: (data: any[]) => Promise<void>;
}

export default function GestionDatosModal({
  visible,
  onClose,
  equipo = '',
  temporada = '',
  players,
  partidos,
  entrenos,
  eventosCalendario = [],
  setPlayers,
  setPartidos,
  setEntrenos,
  setEventosCalendario,
}: GestionDatosModalProps) {
  const screen = useScreenMetrics();
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [driveFolderInput, setDriveFolderInput] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [asistenteLibroVisible, setAsistenteLibroVisible] = useState(false);
  const [refDeviceOn, setRefDeviceOn] = useState(false);
  const [refDeviceInfo, setRefDeviceInfo] = useState<SyncAuthorityInfo | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        if (equipo && temporada) {
          setActiveTeamCloudContext(equipo, temporada);
          await waitGoogleScriptBridgeReady().catch(() => undefined);
          await hydrateTeamCloudFromRegistry(equipo, temporada);
          const cfg = await getTeamCloudConfig(equipo, temporada);
          const fallbackSheet = await prepareActiveTeamSpreadsheet();
          const resolved = resolveTeamCloudFormFields(cfg, { fallbackSpreadsheetId: fallbackSheet });
          if (
            cfg &&
            (resolved.spreadsheetId !== normalizeSpreadsheetIdInput(cfg.spreadsheetId) ||
              resolved.driveRootFolderId !== normalizeDriveFolderIdInput(cfg.driveRootFolderId))
          ) {
            await setTeamCloudConfig(equipo, temporada, {
              ...cfg,
              spreadsheetId: resolved.spreadsheetId || undefined,
              driveRootFolderId: resolved.driveRootFolderId || undefined,
            });
          }
          if (!cancelled) {
            setDriveFolderInput(resolved.driveRootFolderId);
            setSpreadsheetInput(resolved.spreadsheetId);
            const refOn = await isReferenceDevice(equipo, temporada);
            const info = await resolveSyncAuthority(equipo, temporada);
            setRefDeviceOn(refOn || info.isThisDeviceReference);
            setRefDeviceInfo(info);
          }
          return;
        }
        if (!cancelled) {
          const sheet = normalizeSpreadsheetIdInput(await getCurrentSpreadsheetId());
          const drive = normalizeDriveFolderIdInput(await getCurrentDriveRootFolderId());
          const resolved = resolveTeamCloudFormFields(
            { spreadsheetId: sheet, driveRootFolderId: drive },
            { fallbackSpreadsheetId: sheet }
          );
          setDriveFolderInput(resolved.driveRootFolderId);
          setSpreadsheetInput(resolved.spreadsheetId);
          setRefDeviceOn(false);
          setRefDeviceInfo(null);
        }
      } catch {
        if (!cancelled) {
          setSpreadsheetInput('');
          setDriveFolderInput('');
          setRefDeviceOn(false);
          setRefDeviceInfo(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, equipo, temporada]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const mode = await getStorageMode();
        const spreadsheet = await getCurrentSpreadsheetId();
        const driveRoot = await getCurrentDriveRootFolderId();
        if (!cancelled && (mode === 'cloud' || mode === 'both') && (!spreadsheet || !driveRoot)) {
          setShowGuide(true);
        }
      } catch {
        // No bloqueamos la UI por errores de lectura de configuración.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleExportPlantilla = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'No hay plantilla para exportar');
      return;
    }
    setLoading('plantilla');
    try {
      const result = await exportPlantilla(players);
      Alert.alert(result.success ? 'Éxito' : 'Error', result.message);
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportPlantilla = async () => {
    Alert.alert(
      'Importar Plantilla',
      '¿Importar desde Google Sheets? Esto reemplazará los datos actuales.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('plantilla');
            try {
              if (equipo && temporada) {
                await waitGoogleScriptBridgeReady().catch(() => undefined);
                await hydrateTeamCloudFromRegistry(equipo, temporada);
              }
              const result = await importPlantilla();
              if (result.success && result.data) {
                const synced = await syncPlayersPhotos(result.data);
                const withCloud = synced.filter((p) => String(p.photo || '').includes('drive.google') || String(p.photoDriveFileId || '').trim());
                await setPlayers(synced);
                Alert.alert(
                  'Éxito',
                  `${result.message}\nFotos en Drive: ${withCloud.length}/${synced.length}.`
                );
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportPartidos = async () => {
    if (partidos.length === 0) {
      Alert.alert('Aviso', 'No hay partidos para exportar');
      return;
    }
    setLoading('partidos');
    try {
      const result = await exportPartidosSoloNuevos(partidos, players);
      Alert.alert(result.success ? 'Éxito' : 'Error', result.message);
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportPartidos = async () => {
    Alert.alert(
      'Importar Partidos',
      '¿Importar desde Google Sheets? Esto reemplazará los datos actuales.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('partidos');
            try {
              const result = await importPartidos(players);
              if (result.success && result.data) {
                await setPartidos(result.data);
                Alert.alert('Éxito', result.message);
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportEntrenamientos = async () => {
    if (entrenos.length === 0) {
      Alert.alert('Aviso', 'No hay entrenamientos para exportar');
      return;
    }
    setLoading('entrenos');
    try {
      const result = await exportEntrenamientosSoloNuevos(entrenos, players);
      Alert.alert(result.success ? 'Éxito' : 'Error', result.message);
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportEntrenamientos = async () => {
    Alert.alert(
      'Importar Entrenamientos',
      '¿Importar desde Google Sheets? Esto reemplazará los datos actuales.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('entrenos');
            try {
              const result = await importEntrenamientos(players);
              if (result.success && result.data) {
                await setEntrenos(result.data);
                Alert.alert('Éxito', result.message);
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportActas = async () => {
    if (partidos.length === 0) {
      Alert.alert('Aviso', 'No hay partidos; importa o crea partidos antes de exportar actas.');
      return;
    }
    const actasLocales = buildPartidosActasRows(partidos);
    if (actasLocales.length === 0) {
      Alert.alert(
        'Aviso',
        'Ningún partido tiene acta (imagen o PDF). Asigna una acta en Partidos y vuelve a intentarlo.'
      );
      return;
    }
    setLoading('actas');
    try {
      if (equipo && temporada) {
        await waitGoogleScriptBridgeReady().catch(() => undefined);
        await hydrateTeamCloudFromRegistry(equipo, temporada);
      }
      const synced = await syncPartidosActas(partidos);
      const result = await exportPartidosActasMerged(synced);
      if (result.success) {
        await setPartidos(synced);
        const count = buildPartidosActasRows(synced).length;
        Alert.alert('Éxito', `${result.message}\nActas vinculadas: ${count}.`);
      } else {
        Alert.alert('Error', result.message);
      }
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportActas = async () => {
    if (partidos.length === 0) {
      Alert.alert('Aviso', 'Importa primero los partidos; las actas se vinculan por fecha, rival y lugar.');
      return;
    }
    Alert.alert(
      'Importar Actas',
      '¿Traer actas desde la hoja Partidos_Actas y la carpeta de Drive? Se fusionarán con los partidos actuales sin borrar el resto.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('actas');
            try {
              if (equipo && temporada) {
                await waitGoogleScriptBridgeReady().catch(() => undefined);
                await hydrateTeamCloudFromRegistry(equipo, temporada);
              }
              const result = await importPartidosActasMerged();
              if (!result.success) {
                Alert.alert('Error', result.message);
                return;
              }
              let merged = applyImportedActasToPartidos(partidos, result.actas || []);
              merged = await syncPartidosActas(merged);
              await setPartidos(merged);
              const count = buildPartidosActasRows(merged).length;
              Alert.alert(
                'Éxito',
                `${result.message}\nPartidos con acta en este dispositivo: ${count}.`
              );
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportFormularioIA = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'No hay plantilla; añade jugadores antes de exportar la ponderación IA.');
      return;
    }
    setLoading('formIA');
    try {
      const result = await exportEvaluacionesDIIA(players);
      if (!result.success) {
        Alert.alert('Error', result.message);
        return;
      }
      const viewsResult = await exportEvaluacionesDIViewsIA(players);
      if (viewsResult.success) {
        Alert.alert(
          'Éxito',
          `${result.message}\nVista IA actualizada (${viewsResult.iaRows ?? 0} filas).`
        );
      } else {
        Alert.alert(
          'Aviso',
          `${result.message}\nLa vista IA no se pudo actualizar: ${viewsResult.message}`
        );
      }
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportFormularioIA = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'Importa primero la plantilla o crea jugadores en el dispositivo.');
      return;
    }
    Alert.alert(
      'Importar ponderación IA',
      '¿Traer solo evaluaciones de tipo IA desde la hoja Evaluacion_DI? Se actualizarán solo esos registros.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('formIA');
            try {
              const result = await importEvaluacionesDIIA(players);
              if (result.success && result.data) {
                const normalized = result.data.map((p, i) =>
                  normalizePlayerRatings(p, players[i], { partidos, entrenos })
                );
                await setPlayers(normalized);
                Alert.alert('Éxito', result.message);
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportFormularioPersonal = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'No hay plantilla; añade jugadores antes de exportar el formulario personal.');
      return;
    }
    setLoading('formPersonal');
    try {
      const result = await exportEvaluacionesDIPersonal(players);
      if (!result.success) {
        Alert.alert('Error', result.message);
        return;
      }
      const viewsResult = await exportEvaluacionesDIViewsPersonal(players);
      if (viewsResult.success) {
        Alert.alert(
          'Éxito',
          `${result.message}\nVista Personal actualizada (${viewsResult.personalRows ?? 0} filas).`
        );
      } else {
        Alert.alert(
          'Aviso',
          `${result.message}\nLa vista Personal no se pudo actualizar: ${viewsResult.message}`
        );
      }
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportFormularioPersonal = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'Importa primero la plantilla o crea jugadores en el dispositivo.');
      return;
    }
    Alert.alert(
      'Importar formulario personal',
      '¿Traer solo evaluaciones de tipo formulario personal desde la hoja Evaluacion_DI?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('formPersonal');
            try {
              const result = await importEvaluacionesDIPersonal(players);
              if (result.success && result.data) {
                const normalized = result.data.map((p, i) =>
                  normalizePlayerRatings(p, players[i], { partidos, entrenos })
                );
                await setPlayers(normalized);
                Alert.alert('Éxito', result.message);
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportEvalPeriodica = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'No hay plantilla; añade jugadores antes de exportar evaluaciones periódicas.');
      return;
    }
    setLoading('formPeriodica');
    try {
      const result = await exportEvaluacionesDIPeriodica(players);
      Alert.alert(result.success ? 'Éxito' : 'Error', result.message);
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportEvalPeriodica = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'Importa primero la plantilla o crea jugadores en el dispositivo.');
      return;
    }
    Alert.alert(
      'Importar eval. periódica',
      '¿Traer solo evaluaciones periódicas (nota manual DI) desde Evaluacion_DI? Se conservan IA y formulario personal locales.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('formPeriodica');
            try {
              const result = await importEvaluacionesDIPeriodica(players);
              if (result.success && result.data) {
                const normalized = result.data.map((p, i) =>
                  normalizePlayerRatings(p, players[i], { partidos, entrenos })
                );
                await setPlayers(normalized);
                Alert.alert('Éxito', result.message);
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportHistorialCrono = async () => {
    if (!equipo || !temporada) {
      Alert.alert('Aviso', 'Selecciona un equipo y temporada primero.');
      return;
    }
    setLoading('historialCrono');
    try {
      const historial = await loadHistorialPartidos(equipo, temporada);
      if (!historial.length) {
        Alert.alert('Aviso', 'No hay sesiones de cronómetro guardadas en este dispositivo.');
        return;
      }
      const result = await exportHistorialCronometro(equipo, temporada, historial);
      Alert.alert(result.success ? 'Éxito' : 'Error', result.message);
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportHistorialCrono = async () => {
    if (!equipo || !temporada) {
      Alert.alert('Aviso', 'Selecciona un equipo y temporada primero.');
      return;
    }
    Alert.alert(
      'Importar historial cronómetro',
      '¿Traer sesiones del cronómetro desde la hoja Historial_Cronometro? Se fusionarán con las de este dispositivo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('historialCrono');
            try {
              const result = await importHistorialCronometro(equipo, temporada);
              if (!result.success) {
                Alert.alert('Error', result.message);
                return;
              }
              const local = await loadHistorialPartidos(equipo, temporada);
              const map = new Map<string, any>();
              [...(result.historial || []), ...local].forEach((s: any) => {
                const id = String(s?.id ?? '').trim();
                if (id) map.set(id, s);
              });
              const merged = Array.from(map.values()).sort((a, b) => Number(b.id) - Number(a.id));
              await saveHistorialPartidos(equipo, temporada, merged);
              Alert.alert('Éxito', `${result.message}\nSesiones en dispositivo: ${merged.length}.`);
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportFotos = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'No hay plantilla; añade jugadores antes de sincronizar fotos.');
      return;
    }
    setLoading('fotos');
    try {
      if (equipo && temporada) {
        await waitGoogleScriptBridgeReady().catch(() => undefined);
        await hydrateTeamCloudFromRegistry(equipo, temporada);
      }
      const synced = await syncPlayersPhotos(players);
      const withDrive = synced.filter((p) => String(p.photoDriveUrl || '').trim() || String(p.photo || '').includes('drive.google'));
      await setPlayers(synced.map((p, i) => normalizePlayerRatings(p, players[i], { partidos, entrenos })));
      const plantilla = await exportPlantilla(synced as any[]);
      Alert.alert(
        plantilla.success ? 'Éxito' : 'Aviso',
        `Fotos sincronizadas con Drive.\nJugadores con enlace Drive: ${withDrive.length}/${synced.length}.\n${plantilla.message}`
      );
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportFotos = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'Importa primero la plantilla o crea jugadores en el dispositivo.');
      return;
    }
    Alert.alert(
      'Importar fotos',
      '¿Descargar fotos desde Drive y vincularlas a la plantilla local?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('fotos');
            try {
              if (equipo && temporada) {
                await waitGoogleScriptBridgeReady().catch(() => undefined);
                await hydrateTeamCloudFromRegistry(equipo, temporada);
              }
              const imported = await importPlantilla();
              const linked =
                imported.success && imported.data
                  ? attachRemotePhotoLinks(players, imported.data)
                  : players;
              const synced = await syncPlayersPhotos(linked);
              await setPlayers(synced.map((p, i) => normalizePlayerRatings(p, players[i], { partidos, entrenos })));
              const withCloud = synced.filter((p) => String(p.photo || '').includes('drive.google') || String(p.photoDriveFileId || '').trim());
              Alert.alert('Éxito', `Fotos sincronizadas.\nEn Drive: ${withCloud.length}/${synced.length}.`);
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportCalendario = async () => {
    if (!equipo || !temporada) {
      Alert.alert('Aviso', 'Selecciona un equipo y temporada primero.');
      return;
    }
    const locales = Array.isArray(eventosCalendario) ? eventosCalendario : [];
    if (locales.length === 0) {
      Alert.alert('Aviso', 'No hay eventos de calendario en este dispositivo para exportar.');
      return;
    }
    setLoading('calendario');
    try {
      const result = await exportCalendarioEventos(equipo, temporada, locales);
      Alert.alert(result.success ? 'Éxito' : 'Error', result.message);
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportCalendario = async () => {
    if (!equipo || !temporada) {
      Alert.alert('Aviso', 'Selecciona un equipo y temporada primero.');
      return;
    }
    if (!setEventosCalendario) {
      Alert.alert('Error', 'No se puede guardar el calendario en este dispositivo.');
      return;
    }
    Alert.alert(
      'Importar calendario',
      '¿Traer eventos desde la hoja Calendario_Eventos? Se fusionarán con los de este dispositivo (en conflicto gana el del dispositivo).',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('calendario');
            try {
              const result = await importCalendarioEventos(equipo, temporada);
              if (!result.success) {
                Alert.alert('Error', result.message);
                return;
              }
              const map = new Map<string, any>();
              [...(result.eventos || []), ...(Array.isArray(eventosCalendario) ? eventosCalendario : [])].forEach(
                (ev: any) => {
                  const id = String(ev?.id ?? '').trim();
                  if (id) map.set(id, ev);
                }
              );
              const merged = Array.from(map.values()).sort((a, b) =>
                String(a?.dateKey || '').localeCompare(String(b?.dateKey || ''))
              );
              await setEventosCalendario(merged);
              Alert.alert('Éxito', `${result.message}\nEventos en dispositivo: ${merged.length}.`);
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const resetEvaluacionesLocales = (kind: 'ia' | 'personal' | 'all') => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'No hay jugadores para reiniciar.');
      return;
    }
    const titleByKind = {
      ia: 'Reiniciar ponderación IA',
      personal: 'Reiniciar formulario personal',
      all: 'Reiniciar todas las evaluaciones',
    } as const;
    const keyByKind = {
      ia: 'resetIA',
      personal: 'resetPersonal',
      all: 'resetAll',
    } as const;
    const msgByKind = {
      ia: 'Se borrarán solo las evaluaciones IA guardadas en este dispositivo. No afecta partidos/entrenos/plantilla.',
      personal: 'Se borrarán solo los formularios personales guardados en este dispositivo. No afecta partidos/entrenos/plantilla.',
      all: 'Se borrarán todas las evaluaciones (IA + personal) guardadas en este dispositivo.',
    } as const;

    Alert.alert(titleByKind[kind], msgByKind[kind], [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          setLoading(keyByKind[kind]);
          try {
            let removedCount = 0;
            const updated = players.map((p: any, i: number) => {
              const evals = Array.isArray(p?.evaluacionesDI) ? p.evaluacionesDI : [];
              const next =
                kind === 'all'
                  ? []
                  : evals.filter((ev: any) => {
                      const isPersonal = !!(ev?.personalForm && typeof ev.personalForm === 'object');
                      return kind === 'ia' ? isPersonal : !isPersonal;
                    });
              removedCount += Math.max(0, evals.length - next.length);
              return normalizePlayerRatings(
                { ...p, evaluacionesDI: next },
                players[i],
                { partidos, entrenos }
              );
            });
            await setPlayers(updated);
            Alert.alert('Hecho', `Borradas ${removedCount} evaluación(es) en local.`);
          } catch (e) {
            Alert.alert('Error', `Error: ${(e as Error).message}`);
          } finally {
            setLoading(null);
          }
        },
      },
    ]);
  };

  const handleResetFormularioIA = () => resetEvaluacionesLocales('ia');
  const handleResetFormularioPersonal = () => resetEvaluacionesLocales('personal');
  const handleResetFormulariosTodo = () => resetEvaluacionesLocales('all');

  const handleCrearLibroEquipoTemporada = async () => {
    if (!equipo || !temporada) {
      Alert.alert('Equipo requerido', 'Selecciona un equipo y temporada activos desde el menú.');
      return;
    }
    setAsistenteLibroVisible(true);
  };

  const handlePropagARATodosLosLibros = () => {
    Alert.alert(
      'Propagación masiva',
      'Actualiza hojas y/o el script (.gs) en TODOS los libros de Registro_Libros.\n\n' +
        '• Solo estructura: crea/verifica hojas (no requiere permisos extra).\n' +
        '• Todo: también copia el script; requiere autorizar Script API en Apps Script (ver appsscript.json).\n\n¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Solo estructura',
          onPress: () => void runPropagacionLibros('structure'),
        },
        {
          text: 'Todo (script + hojas)',
          onPress: () => void runPropagacionLibros('both'),
        },
      ]
    );
  };

  const runPropagacionLibros = async (mode: 'structure' | 'script' | 'both') => {
    setLoading('syncAllBooks');
    try {
      const result = await syncAllBooksFromRegistry({ mode, force: mode !== 'structure' });
      const detalle = [
        result.message,
        result.scriptApiWarning ? `\n\n${result.scriptApiWarning}` : '',
        result.updated?.length ? `\nOK: ${result.updated.length}` : '',
        result.failed?.length ? `\nErrores: ${result.failed.length}` : '',
        result.skipped?.length ? `\nOmitidos: ${result.skipped.length}` : '',
      ].join('');
      Alert.alert(result.success ? 'Propagación completada' : 'Propagación con avisos', detalle);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const handleGuardarConfigNube = async () => {
    setLoading('cloudConfig');
    try {
      const driveId = normalizeDriveFolderIdInput(driveFolderInput.trim());
      const sheetId = normalizeSpreadsheetIdInput(spreadsheetInput.trim());
      if (driveId && sheetId && driveId === sheetId) {
        Alert.alert(
          'IDs intercambiados',
          'El libro y la carpeta no pueden tener el mismo ID.\n\nArriba: carpeta Drive (.../folders/...)\nAbajo: libro Sheets (.../spreadsheets/d/...).'
        );
        return;
      }
      if (spreadsheetInput.trim() && !sheetId) {
        Alert.alert('Libro incorrecto', 'El campo del libro debe ser un Google Sheet (URL o ID), no una carpeta de Drive.');
        return;
      }
      if (driveFolderInput.trim() && !driveId) {
        Alert.alert('Carpeta incorrecta', 'El campo de carpeta debe ser una carpeta de Drive (.../folders/...), no un libro Sheets.');
        return;
      }
      await setUserDriveRootFolderId(driveId || null);
      await setUserSpreadsheetId(sheetId || null);
      if (equipo && temporada) {
        const prev = (await getTeamCloudConfig(equipo, temporada)) || {};
        await setTeamCloudConfig(equipo, temporada, {
          ...prev,
          spreadsheetId: sheetId || undefined,
          driveRootFolderId: driveId || undefined,
          bookName: prev.bookName || formatTeamBookName(equipo, temporada),
        });
      }
      setDriveFolderInput(driveId);
      setSpreadsheetInput(sheetId);
      Alert.alert('Configuración guardada', equipo && temporada
        ? `Guardado para ${formatTeamBookName(equipo, temporada)}.`
        : 'Se han guardado la carpeta de Drive y el libro de Sheets.');
    } catch (e) {
      Alert.alert('Error', `No se pudo guardar la configuración: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleVerificarEstructuraDrive = async () => {
    setLoading('cloudEnsure');
    try {
      if (equipo && temporada) {
        await waitGoogleScriptBridgeReady().catch(() => undefined);
        await hydrateTeamCloudFromRegistry(equipo, temporada);
      }
      const rootOverride = normalizeDriveFolderIdInput(driveFolderInput.trim());
      if (/\/spreadsheets\//i.test(driveFolderInput.trim())) {
        Alert.alert(
          'Carpeta incorrecta',
          'Has pegado un enlace de libro (Sheets). En "Carpeta raíz Drive" indica una carpeta (.../folders/...).'
        );
        return;
      }
      const spreadsheetOverride = normalizeSpreadsheetIdInput(spreadsheetInput.trim());
      const result = await ensureDriveWorkspace(spreadsheetOverride, rootOverride || undefined);
      if (!result.success) {
        Alert.alert('Error', result.message);
        return;
      }
      const sheetLine = result.spreadsheetId
        ? result.spreadsheetId
        : spreadsheetOverride
          ? '(no se pudo validar el libro indicado)'
          : '(sin libro: normal en usuario/equipo nuevo hasta crear el libro)';
      Alert.alert(
        'Nube preparada',
        `Estructura validada/creada correctamente.\n\nCarpeta raíz: ${result.rootFolderId || '(sin ID)'}\nCarpeta fotos: ${result.fotosFolderId || '(sin ID)'}\nCarpeta actas: ${result.actasFolderId || '(sin ID)'}\nSpreadsheet: ${sheetLine}`,
      );
    } catch (e) {
      Alert.alert('Error', `No se pudo preparar la estructura de Drive: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleBuscarActualizaciones = async () => {
    setLoading('updates');
    try {
      await checkForAppUpdatesAndPrompt({ force: true, interactive: true });
    } finally {
      setLoading(null);
    }
  };

  const handleResetCuenta = () => {
    if (!user?.uid || !user?.email) {
      Alert.alert('Cuenta', 'No hay sesión iniciada.');
      return;
    }
    Alert.alert(
      'Reiniciar cuenta (equipos y nube)',
      'Se borrarán SOLO los datos de esta cuenta (equipos, temporadas y configuración de Gestión de datos) y quedará vacía para crear desde cero.\n\nNo borra tus libros en Google Drive.\n\n¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reiniciar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setLoading('resetAccount');
              try {
                await resetUserAppDataToEmpty(user.uid, user.email);
                Alert.alert('Cuenta reiniciada', 'Listo. Vuelve a “Mis equipos”: ahora debe salir vacío.');
                onClose();
              } catch (e) {
                Alert.alert('Error', (e as Error).message || String(e));
              } finally {
                setLoading(null);
              }
            })();
          },
        },
      ]
    );
  };

  const RowAction = ({
    label,
    loadingKey,
    onExport,
    onImport,
    onReset,
    resetLoadingKey,
  }: {
    label: string;
    loadingKey: string;
    onExport: () => void;
    onImport: () => void;
    onReset?: () => void;
    resetLoadingKey?: string;
  }) => (
    <View style={styles.rowAction}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.btnGroup}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.exportBtn]}
          onPress={onExport}
          disabled={!!loading}
        >
          {loading === loadingKey ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.actionBtnTxt}>EXP</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.importBtn]}
          onPress={onImport}
          disabled={!!loading}
        >
          {loading === loadingKey ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.actionBtnTxt}>IMP</Text>
          )}
        </TouchableOpacity>
        {onReset ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.resetBtn]}
            onPress={onReset}
            disabled={!!loading}
          >
            {loading === (resetLoadingKey || loadingKey) ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.actionBtnTxt}>BORRAR</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <ScrollView
            style={styles.innerScroll}
            contentContainerStyle={styles.innerScrollContent}
            showsVerticalScrollIndicator
          >
            <Text style={styles.title}>GESTIÓN DE DATOS</Text>
            <Text style={styles.subtitle}>Importar / Exportar con Google Sheets</Text>

            <TouchableOpacity
              style={[styles.actionBtn, styles.resetAllBtn, { marginBottom: 10 }]}
              onPress={handleResetCuenta}
              disabled={!!loading}
            >
              {loading === 'resetAccount' ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.actionBtnTxt}>REINICIAR ESTA CUENTA (BORRAR EQUIPOS)</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.guideBtn} onPress={() => setShowGuide(true)}>
              <Text style={styles.guideBtnTxt}>ASISTENTE GUIADO (PASO A PASO)</Text>
            </TouchableOpacity>

            <View style={styles.cloudConfigBox}>
              <Text style={styles.cloudTitle}>CONFIGURACION DE NUBE (GOOGLE DRIVE)</Text>
              {equipo && temporada ? (
                <Text style={styles.cloudHint}>
                  Equipo activo: {formatTeamBookName(equipo, temporada)}
                  {'\n'}Cada temporada tiene su propio libro (Equipo + Temporada).
                </Text>
              ) : (
                <Text style={styles.cloudHint}>
                  Indica la carpeta raíz de tu Drive (URL o ID). La app creará y confirmará las carpetas necesarias.
                </Text>
              )}
              {equipo && temporada ? (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.exportBtn, { marginBottom: 10 }]}
                  onPress={handleCrearLibroEquipoTemporada}
                  disabled={!!loading}
                >
                  {loading === 'createBook' ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.actionBtnTxt}>CREAR LIBRO (EQUIPO + TEMPORADA)</Text>
                  )}
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.actionBtn, styles.importBtn, { marginBottom: 10 }]}
                onPress={handlePropagARATodosLosLibros}
                disabled={!!loading}
              >
                {loading === 'syncAllBooks' ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.actionBtnTxt}>PROPAGAR SCRIPT A TODOS LOS LIBROS</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.fieldLabel}>1. Carpeta raíz de Drive (URL o ID)</Text>
              <TextInput
                style={styles.input}
                placeholder="https://drive.google.com/drive/folders/..."
                placeholderTextColor="#8FA7BF"
                value={driveFolderInput}
                onChangeText={setDriveFolderInput}
                editable={!loading}
              />
              <Text style={styles.fieldLabel}>2. Libro Google Sheets de esta temporada (URL o ID)</Text>
              <TextInput
                style={styles.input}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                placeholderTextColor="#8FA7BF"
                value={spreadsheetInput}
                onChangeText={setSpreadsheetInput}
                editable={!loading}
              />
              <View style={styles.cloudActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.importBtn, styles.flexBtn]}
                  onPress={handleGuardarConfigNube}
                  disabled={!!loading}
                >
                  {loading === 'cloudConfig' ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.actionBtnTxt}>GUARDAR CONFIG</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.exportBtn, styles.flexBtn]}
                  onPress={handleVerificarEstructuraDrive}
                  disabled={!!loading}
                >
                  {loading === 'cloudEnsure' ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.actionBtnTxt}>VERIFICAR ESTRUCTURA</Text>
                  )}
                </TouchableOpacity>
              </View>

              {equipo && temporada ? (
                <View style={styles.refDeviceBox}>
                  <Text style={styles.fieldLabel}>3. Dispositivo referencia (sync)</Text>
                  <Text style={styles.refDeviceHint}>
                    Actívalo solo en el móvil/tablet principal. Ese dispositivo gana en conflictos al sincronizar.
                    Los demás priorizan el Google Sheet.
                  </Text>
                  <View style={styles.refDeviceToggleRow}>
                    <TouchableOpacity
                      style={[styles.refToggleBtn, refDeviceOn && styles.refToggleOn]}
                      disabled={!!loading}
                      onPress={async () => {
                        if (!equipo || !temporada) return;
                        setLoading('refDevice');
                        try {
                          const info = await setReferenceDevice(equipo, temporada, true);
                          setRefDeviceOn(true);
                          setRefDeviceInfo(info);
                          Alert.alert('Dispositivo referencia', info.detail);
                        } catch (e) {
                          Alert.alert('Error', (e as Error).message || 'No se pudo activar');
                        } finally {
                          setLoading(null);
                        }
                      }}
                    >
                      <Text style={styles.refToggleTxt}>SOY LA REFERENCIA</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.refToggleBtn, !refDeviceOn && styles.refToggleOff]}
                      disabled={!!loading}
                      onPress={async () => {
                        if (!equipo || !temporada) return;
                        setLoading('refDevice');
                        try {
                          const info = await setReferenceDevice(equipo, temporada, false);
                          setRefDeviceOn(false);
                          setRefDeviceInfo(info);
                          Alert.alert('Modo satélite', info.detail);
                        } catch (e) {
                          Alert.alert('Error', (e as Error).message || 'No se pudo desactivar');
                        } finally {
                          setLoading(null);
                        }
                      }}
                    >
                      <Text style={styles.refToggleTxt}>NO SOY REFERENCIA</Text>
                    </TouchableOpacity>
                  </View>
                  {loading === 'refDevice' ? <ActivityIndicator color="#90CAF9" style={{ marginTop: 8 }} /> : null}
                  {refDeviceInfo ? (
                    <Text style={styles.refDeviceStatus}>
                      {refDeviceInfo.isThisDeviceReference ? '● Referencia activa' : '○ Satélite'} · {refDeviceInfo.deviceLabel}
                      {refDeviceInfo.cloudReferenceLabel && !refDeviceInfo.isThisDeviceReference
                        ? `\nRef en cuenta: ${refDeviceInfo.cloudReferenceLabel}`
                        : ''}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.actionBtn, styles.importBtn, { marginBottom: 12 }]}
              onPress={handleBuscarActualizaciones}
              disabled={!!loading}
            >
              {loading === 'updates' ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.actionBtnTxt}>BUSCAR ACTUALIZACIONES DE LA APP</Text>
              )}
            </TouchableOpacity>

            <RowAction
              label="Plantilla"
              loadingKey="plantilla"
              onExport={handleExportPlantilla}
              onImport={handleImportPlantilla}
            />
            <RowAction
              label="Partidos"
              loadingKey="partidos"
              onExport={handleExportPartidos}
              onImport={handleImportPartidos}
            />
            <RowAction
              label="Ent"
              loadingKey="entrenos"
              onExport={handleExportEntrenamientos}
              onImport={handleImportEntrenamientos}
            />
            <RowAction
              label="Actas"
              loadingKey="actas"
              onExport={handleExportActas}
              onImport={handleImportActas}
            />
            <RowAction
              label="Ponderacion"
              loadingKey="formIA"
              onExport={handleExportFormularioIA}
              onImport={handleImportFormularioIA}
              onReset={handleResetFormularioIA}
              resetLoadingKey="resetIA"
            />
            <RowAction
              label="Formulario Personal"
              loadingKey="formPersonal"
              onExport={handleExportFormularioPersonal}
              onImport={handleImportFormularioPersonal}
              onReset={handleResetFormularioPersonal}
              resetLoadingKey="resetPersonal"
            />
            <RowAction
              label="Eval. periódica"
              loadingKey="formPeriodica"
              onExport={handleExportEvalPeriodica}
              onImport={handleImportEvalPeriodica}
            />
            <RowAction
              label="Historial crono"
              loadingKey="historialCrono"
              onExport={handleExportHistorialCrono}
              onImport={handleImportHistorialCrono}
            />
            <RowAction
              label="Fotos"
              loadingKey="fotos"
              onExport={handleExportFotos}
              onImport={handleImportFotos}
            />
            <RowAction
              label="Calendario"
              loadingKey="calendario"
              onExport={handleExportCalendario}
              onImport={handleImportCalendario}
            />
            <TouchableOpacity
              style={[styles.closeBtn, styles.resetAllBtn]}
              onPress={handleResetFormulariosTodo}
              disabled={!!loading}
            >
              {loading === 'resetAll' ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.closeBtnTxt}>REINICIAR TODAS LAS EVALUACIONES (LOCAL)</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnTxt}>CERRAR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.closeBtn, styles.exitToMainBtn]} onPress={onClose}>
              <Text style={styles.closeBtnTxt}>SALIR AL MENU PRINCIPAL</Text>
            </TouchableOpacity>
          </ScrollView>

          <Modal visible={showGuide} transparent animationType="fade" onRequestClose={() => setShowGuide(false)}>
            <View style={styles.guideOverlay}>
              <View style={[styles.guideContent, { maxWidth: screen.modalMaxWidth }]}>
                <Text style={styles.guideTitle}>ASISTENTE GUIADO</Text>
                <Text style={styles.guideSub}>Configuración para usuarios sin experiencia</Text>
                <ScrollView style={styles.guideScroll} contentContainerStyle={styles.guideScrollContent}>
                  <View style={styles.guideStep}>
                    <Text style={styles.guideStepTitle}>1) Abre tu Google Sheet</Text>
                    <Text style={styles.guideStepText}>
                      En tu navegador, abre la hoja donde guardarás Plantilla, Partidos y Entrenamientos.
                    </Text>
                  </View>
                  <View style={styles.guideStep}>
                    <Text style={styles.guideStepTitle}>2) Copia la carpeta raíz de Google Drive</Text>
                    <Text style={styles.guideStepText}>
                      Crea o usa una carpeta en Drive para esta app. Copia su URL (.../folders/...) y pégala en el campo 1.
                    </Text>
                  </View>
                  <View style={styles.guideStep}>
                    <Text style={styles.guideStepTitle}>3) Copia el ID del libro (Google Sheets)</Text>
                    <Text style={styles.guideStepText}>
                      En la URL del libro, copia el texto entre /d/ y /edit. Pégalo en el campo 2 (libro de esta temporada).
                    </Text>
                  </View>
                  <View style={styles.guideStep}>
                    <Text style={styles.guideStepTitle}>4) Guarda la configuración</Text>
                    <Text style={styles.guideStepText}>
                      Pulsa "GUARDAR CONFIG". Si no aparece error, la app ya recuerda tu hoja y tu carpeta.
                    </Text>
                  </View>
                  <View style={styles.guideStep}>
                    <Text style={styles.guideStepTitle}>5) Verifica estructura automática</Text>
                    <Text style={styles.guideStepText}>
                      Pulsa "VERIFICAR ESTRUCTURA". La app crea/confirma automáticamente las carpetas y hojas necesarias.
                    </Text>
                  </View>
                  <View style={styles.guideStep}>
                    <Text style={styles.guideStepTitle}>6) Primera sincronización recomendada</Text>
                    <Text style={styles.guideStepText}>
                      Exporta primero Plantilla y después Partidos/Entrenamientos. Luego prueba una importación para validar.
                    </Text>
                  </View>
                  <View style={styles.guideTip}>
                    <Text style={styles.guideTipText}>
                      Si algo falla: revisa conexión, permisos de tu cuenta Google y que el ID pegado sea correcto.
                    </Text>
                  </View>
                </ScrollView>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setShowGuide(false)}>
                  <Text style={styles.closeBtnTxt}>ENTENDIDO</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <CrearLibroAsistenteModal
            visible={asistenteLibroVisible}
            equipo={equipo}
            temporada={temporada}
            onClose={() => setAsistenteLibroVisible(false)}
            onComplete={(result) => {
              if (result.spreadsheetId) setSpreadsheetInput(result.spreadsheetId);
              if (result.driveRootFolderId) setDriveFolderInput(result.driveRootFolderId);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: '#012E57',
    width: '90%',
    maxHeight: '86%',
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  innerScroll: { width: '100%' },
  innerScrollContent: { paddingBottom: 6 },
  title: { color: '#FFF', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  subtitle: { color: '#00aaff', fontSize: 10, textAlign: 'center', marginBottom: 20 },
  guideBtn: {
    backgroundColor: '#0E4A8A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D5A86',
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  guideBtnTxt: { color: '#E3F2FD', fontWeight: '700', fontSize: 11 },
  cloudConfigBox: {
    backgroundColor: '#001A33',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#123E63',
    padding: 10,
    marginBottom: 12,
  },
  cloudTitle: { color: '#B3E5FC', fontSize: 11, fontWeight: '700', marginBottom: 5 },
  cloudHint: { color: '#9FC5E8', fontSize: 10, marginBottom: 8 },
  fieldLabel: { color: '#9FC5E8', fontSize: 10, fontWeight: '600', marginBottom: 4, marginTop: 4 },
  input: {
    backgroundColor: '#0B3556',
    borderWidth: 1,
    borderColor: '#1D5A86',
    color: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    fontSize: 12,
  },
  cloudActions: { flexDirection: 'row', gap: 8 },
  flexBtn: { flex: 1 },
  refDeviceBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#123E63',
  },
  refDeviceHint: { color: '#8FB1D1', fontSize: 10, lineHeight: 14, marginBottom: 8 },
  refDeviceToggleRow: { flexDirection: 'row', gap: 8 },
  refToggleBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    backgroundColor: '#0B3556',
    borderWidth: 1,
    borderColor: '#1D5A86',
  },
  refToggleOn: { backgroundColor: '#2E7D32', borderColor: '#66BB6A' },
  refToggleOff: { backgroundColor: '#546E7A', borderColor: '#90A4AE' },
  refToggleTxt: { color: '#FFF', fontWeight: '800', fontSize: 10, textAlign: 'center' },
  refDeviceStatus: { color: '#B3E5FC', fontSize: 10, marginTop: 8, lineHeight: 14 },
  rowAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#001A33',
  },
  rowLabel: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  btnGroup: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 56,
    alignItems: 'center',
  },
  exportBtn: { backgroundColor: '#2E7D32' },
  importBtn: { backgroundColor: '#1565C0' },
  resetBtn: { backgroundColor: '#B71C1C' },
  actionBtnTxt: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  closeBtn: {
    backgroundColor: '#C62828',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 15,
  },
  exitToMainBtn: { backgroundColor: '#37474F', marginTop: 8 },
  resetAllBtn: { backgroundColor: '#8E24AA', marginTop: 6 },
  closeBtnTxt: { color: '#FFF', fontWeight: 'bold' },
  guideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  guideContent: {
    width: '100%',
    maxHeight: '72%',
    backgroundColor: '#001A33',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1D5A86',
    padding: 14,
  },
  guideScroll: { maxHeight: 360 },
  guideScrollContent: { paddingBottom: 6 },
  guideTitle: { color: '#FFF', fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  guideSub: { color: '#90CAF9', fontSize: 12, textAlign: 'center', marginBottom: 10 },
  guideStep: {
    backgroundColor: '#012E57',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D5A86',
    padding: 10,
    marginBottom: 8,
  },
  guideStepTitle: { color: '#E3F2FD', fontWeight: '700', marginBottom: 4, fontSize: 12 },
  guideStepText: { color: '#B3E5FC', fontSize: 11, lineHeight: 16 },
  guideTip: {
    marginTop: 2,
    backgroundColor: '#123E63',
    borderRadius: 8,
    padding: 8,
  },
  guideTipText: { color: '#E1F5FE', fontSize: 10.5, lineHeight: 14 },
});
