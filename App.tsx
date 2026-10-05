import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, StatusBar, Text, TouchableOpacity, Alert, BackHandler, Platform, ScrollView, ActivityIndicator } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadLocalData, savePlayers as persistPlayers, savePartidos as persistPartidos, saveEntrenos as persistEntrenos, saveEventosCalendario as persistEventosCalendario, getFirstRunDone, setFirstRunDone, setStorageMode, getTeamSettings, setTeamSettings, getStorageMode, getListaEquipos, setLastSuccessfulSyncAt } from './src/storage/localStorage';
import { buildStorageKey } from './src/storage/storageKeys';
import { formatTeamBookName, getTeamCloudConfig, setTeamCloudConfig } from './src/storage/teamCloudStorage';
import { formatDateGlobal, parseToDate } from './src/utils/dateFormat';
import { ensurePlayerIds, rebindEntrenos, rebindPartidos, type PersonLike } from './src/utils/playerIdentity';
import { checkForAppUpdatesAndPrompt } from './src/services/appUpdateService';
import { sincronizarTodo } from './src/services/syncAllService';
import { getCurrentSpreadsheetId, setActiveTeamCloudContext, GOOGLE_SCRIPT_URL, hydrateTeamCloudFromRegistry, normalizeSpreadsheetIdInput } from './src/services/googleSheetsService';
import { GoogleScriptBridgeHost, waitGoogleScriptBridgeReady } from './src/services/googleScriptWebViewBridge';

import MenuPrincipal from './src/components/MenuPrincipal';
import Plantilla from './src/components/Plantilla';
import Pizarra from './src/components/Pizarra';
import Partidos from './src/components/Partidos';
import Stats from './src/components/Stats';
import SelectorEquipo from './src/components/SelectorEquipo';
import Entrenamientos from './src/components/Entrenamientos';
import ConfigurarPartido from './src/components/ConfigurarPartido';
import CronometroPartido from './src/components/CronometroPartido';
import Calendario from './src/components/Calendario';
import Ayuda from './src/components/Ayuda';
import Biblioteca from './src/components/Biblioteca';
import AuthScreen from './src/components/AuthScreen';
import PendingApprovalScreen from './src/components/PendingApprovalScreen';
import { AuthProvider, useAuth } from './src/context/AuthContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

type GuardState = { hasError: boolean; errorText?: string };
class ScreenErrorBoundary extends React.Component<{ children: React.ReactNode; fallbackText?: string }, GuardState> {
  constructor(props: { children: React.ReactNode; fallbackText?: string }) {
    super(props);
    this.state = { hasError: false, errorText: '' };
  }
  static getDerivedStateFromError(): GuardState {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('ScreenErrorBoundary', error);
    const msg = error instanceof Error ? error.message : String(error || '');
    this.setState({ errorText: msg });
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.center}>
          <Text style={{ color: 'white', textAlign: 'center', paddingHorizontal: 20 }}>
            {this.props.fallbackText || 'Se produjo un error en esta pantalla.'}
          </Text>
          {!!this.state.errorText && (
            <Text style={{ color: '#90CAF9', textAlign: 'center', paddingHorizontal: 20, marginTop: 8, fontSize: 12 }}>
              {this.state.errorText}
            </Text>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <GoogleScriptBridgeHost scriptUrl={GOOGLE_SCRIPT_URL} />
      <AppMain />
    </AuthProvider>
  );
}

function AppMain() {
  const { user, loading: authLoading, syncing: authSyncing, authChecking, isAuthorized, canEdit } = useAuth();
  const [screen, setScreen] = useState('SELECTOR');
  const prevAuthUidRef = useRef<string | null>(null);
  const [bibliotecaReturnScreen, setBibliotecaReturnScreen] = useState('MENU');
  const [editReturnScreen, setEditReturnScreen] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [players, setPlayers] = useState<unknown[]>([]);
  const [partidos, setPartidos] = useState<unknown[]>([]);
  const [entrenos, setEntrenos] = useState<unknown[]>([]);
  const [eventosCalendario, setEventosCalendario] = useState<unknown[]>([]);
  const [editItem, setEditItem] = useState<unknown>(null);
  const [equipo, setEquipo] = useState('');
  const [temporada, setTemporada] = useState('');
  const [escudoUri, setEscudoUri] = useState<string | null>(null);
  const [activeMatchData, setActiveMatchData] = useState<{ config: unknown; rotacion: unknown } | null>(null);
  const updateCheckDoneRef = useRef(false);
  const autoSyncDoneRef = useRef('');
  const storagePromptShownRef = useRef(false);
  const [lastSyncTick, setLastSyncTick] = useState(0);
  const syncDataRef = useRef({
    players: [] as unknown[],
    partidos: [] as unknown[],
    entrenos: [] as unknown[],
    eventosCalendario: [] as unknown[],
  });
  const ensureArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

  syncDataRef.current = { players, partidos, entrenos, eventosCalendario };

  /** Acta con objeto vacío u sin uri/drive sigue sin enlace útil (el Sheet no trae acta). */
  const actaHasLink = (acta: unknown): boolean => {
    if (acta == null || typeof acta !== 'object') return false;
    const a = acta as Record<string, unknown>;
    const uri = String(a.uri ?? '').trim();
    const driveUrl = String(a.driveUrl ?? '').trim();
    const driveFileId = String(a.driveFileId ?? '').trim();
    return !!(uri || driveUrl || driveFileId);
  };

  const partidoMatchKey = (p: Record<string, unknown>): string => {
    const rawFecha = String(p?.fecha ?? '').trim();
    const d = parseToDate(rawFecha);
    const fecha = d ? formatDateGlobal(d) : rawFecha.toLowerCase();
    const rival = String(p?.rival ?? '').trim().toLowerCase();
    const lugar = String(p?.lugar ?? '').trim().toLowerCase();
    const tipo = String(p?.tipo ?? '').trim().toLowerCase();
    return `${fecha}|${rival}|${lugar}|${tipo}`;
  };

  const keepActaLinks = (nextPartidos: unknown[], prevPartidos: unknown[]): unknown[] => {
    const prevById = new Map<string, Record<string, unknown>>();
    const prevByKey = new Map<string, Record<string, unknown>>();
    ensureArray(prevPartidos).forEach((raw) => {
      const p = raw as Record<string, unknown>;
      const id = String(p?.id ?? '').trim();
      if (id) prevById.set(id, p);
      prevByKey.set(partidoMatchKey(p), p);
    });
    return ensureArray(nextPartidos).map((raw) => {
      const p = raw as Record<string, unknown>;
      const id = String(p?.id ?? '').trim();
      let source: Record<string, unknown> | undefined;
      if (id) {
        const byId = prevById.get(id);
        if (byId && actaHasLink(byId.acta)) source = byId;
      }
      if (!source) {
        const byKey = prevByKey.get(partidoMatchKey(p));
        if (byKey && actaHasLink(byKey.acta)) source = byKey;
      }
      if (!source || actaHasLink(p.acta)) return p;
      return { ...p, acta: source.acta };
    });
  };
  const resolveNextArray = (
    incoming: unknown[] | ((prev: unknown[]) => unknown[]),
    prev: unknown[]
  ): unknown[] => {
    if (typeof incoming === 'function') {
      try {
        return ensureArray((incoming as (p: unknown[]) => unknown[])(prev));
      } catch {
        return prev;
      }
    }
    return ensureArray(incoming);
  };
  const switchEquipoTemporada = (eq: string, temp: string) => {
    // Limpiamos estado inmediatamente para no arrastrar datos visuales del equipo anterior.
    setPlayers([]);
    setPartidos([]);
    setEntrenos([]);
    setEventosCalendario([]);
    setEditItem(null);
    setActiveMatchData(null);
    setEscudoUri(null);
    setActiveTeamCloudContext(eq, temp);
    autoSyncDoneRef.current = '';
    setEquipo(eq);
    setTemporada(temp);
    setScreen('MENU');
  };

  const resetSessionEquipoState = useCallback(() => {
    setScreen('SELECTOR');
    setEquipo('');
    setTemporada('');
    setPlayers([]);
    setPartidos([]);
    setEntrenos([]);
    setEventosCalendario([]);
    setEditItem(null);
    setActiveMatchData(null);
    setEscudoUri(null);
    setActiveTeamCloudContext('', '');
    autoSyncDoneRef.current = '';
  }, []);

  useEffect(() => {
    const uid = user?.uid ?? null;
    if (prevAuthUidRef.current === uid) return;
    prevAuthUidRef.current = uid;
    resetSessionEquipoState();
  }, [user?.uid, resetSessionEquipoState]);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || showIntro || !isLoaded) return;
    if (!user || !isAuthorized || authSyncing || authChecking) return;
    if (updateCheckDoneRef.current) return;
    updateCheckDoneRef.current = true;
    const timer = setTimeout(() => {
      void checkForAppUpdatesAndPrompt().catch((e) => console.warn('checkForAppUpdates', e));
    }, 1200);
    return () => clearTimeout(timer);
  }, [showIntro, isLoaded, user, isAuthorized, authSyncing, authChecking]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const applyOrientation = async () => {
      try {
        if (!showIntro && screen === 'PIZARRA') {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        } else {
          await ScreenOrientation.unlockAsync();
        }
      } catch (e) {
        console.warn('ScreenOrientation', e);
      }
    };
    applyOrientation();
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, [screen, showIntro]);

  useEffect(() => {
    if (!isLoaded || authLoading || authChecking || authSyncing || !user?.uid || !isAuthorized) return;
    let cancelled = false;
    getFirstRunDone().then((done) => {
      if (cancelled || done || storagePromptShownRef.current) return;
      storagePromptShownRef.current = true;
      Alert.alert(
        '¿Dónde desea guardar los datos?',
        'Elija cómo quiere usar la aplicación. Esta pregunta solo se muestra la primera vez.',
        [
          { text: 'Solo en el teléfono', onPress: () => { void setStorageMode('local').then(() => setFirstRunDone()); } },
          {
            text: 'Solo en la nube',
            onPress: () => {
              void setStorageMode('cloud').then(() => setFirstRunDone()).then(() => {
                Alert.alert('Informacion', 'Abre Menu > Gestion de datos > Asistente guiado. Sigue los pasos y pulsa Verificar estructura.');
              });
            },
          },
          {
            text: 'Ambos',
            onPress: () => {
              void setStorageMode('both').then(() => setFirstRunDone()).then(() => {
                Alert.alert('Informacion', 'Abre Menu > Gestion de datos > Asistente guiado para configurar la nube sin errores.');
              });
            },
          },
        ]
      );
    });
    return () => { cancelled = true; };
  }, [isLoaded, authLoading, authChecking, authSyncing, user?.uid, isAuthorized]);

  useEffect(() => {
    if (!equipo || !temporada) return;
    let cancelled = false;
    loadLocalData(equipo, temporada).then((data) => {
      if (cancelled) return;
      const nextPlayers = ensurePlayerIds(ensureArray(data.players) as PersonLike[]);
      const nextEntrenos = rebindEntrenos(ensureArray(data.entrenos), nextPlayers);
      const nextPartidos = rebindPartidos(ensureArray(data.partidos), nextPlayers);
      setPlayers(nextPlayers);
      setPartidos(nextPartidos);
      setEntrenos(nextEntrenos);
      setEventosCalendario(ensureArray(data.eventosCalendario ?? []));
      persistPlayers(equipo, temporada, nextPlayers).catch(() => {});
      persistEntrenos(equipo, temporada, nextEntrenos).catch(() => {});
      persistPartidos(equipo, temporada, nextPartidos).catch(() => {});
    }).catch((e) => {
      if (!cancelled) console.warn('Error loading local data', e);
    });
    return () => { cancelled = true; };
  }, [equipo, temporada]);

  useEffect(() => {
    if (!equipo || !temporada) return;
    setActiveTeamCloudContext(equipo, temporada);
    let cancelled = false;
    void (async () => {
      try {
        await waitGoogleScriptBridgeReady().catch(() => undefined);
        await hydrateTeamCloudFromRegistry(equipo, temporada);
        if (cancelled) return;
        const cfg = await getTeamCloudConfig(equipo, temporada);
        if (cfg?.spreadsheetId) return;
        const lista = await getListaEquipos();
        if (lista.length !== 1 || cancelled) return;
        const globalId = normalizeSpreadsheetIdInput(await getCurrentSpreadsheetId());
        if (!globalId || cancelled) return;
        await setTeamCloudConfig(equipo, temporada, {
          spreadsheetId: globalId,
          bookName: formatTeamBookName(equipo, temporada),
        });
      } catch {
        /* migración opcional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [equipo, temporada]);

  useEffect(() => {
    if (screen !== 'MENU' || !equipo || !temporada) return;
    const syncKey = `${equipo}||${temporada}`;
    if (autoSyncDoneRef.current === syncKey) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const mode = await getStorageMode();
          if (mode !== 'cloud' && mode !== 'both') return;
          await waitGoogleScriptBridgeReady().catch(() => undefined);
          await hydrateTeamCloudFromRegistry(equipo, temporada);
          const sheet = await getCurrentSpreadsheetId();
          if (!sheet || cancelled) return;
          autoSyncDoneRef.current = syncKey;
          const snapshot = syncDataRef.current;
          const result = await sincronizarTodo({
            equipo,
            temporada,
            players: snapshot.players,
            partidos: snapshot.partidos,
            entrenos: snapshot.entrenos,
            eventosCalendario: snapshot.eventosCalendario,
          });
          if (cancelled || !result.success) return;
          await setLastSuccessfulSyncAt(equipo, temporada);
          setLastSyncTick((t) => t + 1);
          if (result.players) {
            setPlayers((prev) => {
              const next = ensureArray(result.players);
              persistPlayers(equipo, temporada, next).catch(() => {});
              return next;
            });
          }
          if (result.partidos) {
            setPartidos((prev) => {
              const next = keepActaLinks(ensureArray(result.partidos), prev);
              persistPartidos(equipo, temporada, next).catch(() => {});
              return next;
            });
          }
          if (result.entrenos) {
            setEntrenos((prev) => {
              const next = ensureArray(result.entrenos);
              persistEntrenos(equipo, temporada, next).catch(() => {});
              return next;
            });
          }
          if (result.eventosCalendario) {
            setEventosCalendario((prev) => {
              const next = ensureArray(result.eventosCalendario);
              persistEventosCalendario(equipo, temporada, next).catch(() => {});
              return next;
            });
          }
        } catch {
          /* sync silencioso al abrir */
        }
      })();
    }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [screen, equipo, temporada]);

  useEffect(() => {
    if (!equipo || !temporada) return;
    let cancelled = false;
    getTeamSettings(equipo, temporada)
      .then((settings) => {
        if (!cancelled) setEscudoUri(settings.escudoUri || null);
      })
      .catch(() => {
        if (!cancelled) setEscudoUri(null);
      });
    return () => {
      cancelled = true;
    };
  }, [equipo, temporada]);

  const savePlayers = useCallback(async (newPlayers: unknown[] | ((prev: unknown[]) => unknown[])) => {
    if (!canEdit) {
      Alert.alert('Solo lectura', 'Tu cuenta no puede modificar la plantilla.');
      return;
    }
    setPlayers((prev) => {
      const nextPlayers = ensurePlayerIds(resolveNextArray(newPlayers, prev) as PersonLike[]);
      const reboundEntrenos = rebindEntrenos(syncDataRef.current.entrenos, nextPlayers);
      const reboundPartidos = rebindPartidos(syncDataRef.current.partidos, nextPlayers);
      persistPlayers(equipo, temporada, nextPlayers).catch((e) => console.warn('savePlayers error', e));
      persistEntrenos(equipo, temporada, reboundEntrenos).catch((e) => console.warn('saveEntrenos error', e));
      persistPartidos(equipo, temporada, reboundPartidos).catch((e) => console.warn('savePartidos error', e));
      setEntrenos(reboundEntrenos);
      setPartidos(reboundPartidos);
      return nextPlayers;
    });
  }, [equipo, temporada, canEdit]);

  const savePartidos = useCallback(async (newPartidos: unknown[] | ((prev: unknown[]) => unknown[])) => {
    if (!canEdit) {
      Alert.alert('Solo lectura', 'Tu cuenta no puede modificar partidos.');
      return;
    }
    setPartidos((prev) => {
      const nextRaw = rebindPartidos(resolveNextArray(newPartidos, prev), ensurePlayerIds(syncDataRef.current.players as PersonLike[]));
      const next = keepActaLinks(nextRaw, prev);
      persistPartidos(equipo, temporada, next).catch((e) => console.warn('savePartidos error', e));
      return next;
    });
  }, [equipo, temporada, canEdit]);

  const saveEntrenos = useCallback(async (newEntrenos: unknown[] | ((prev: unknown[]) => unknown[])) => {
    if (!canEdit) {
      Alert.alert('Solo lectura', 'Tu cuenta no puede modificar entrenamientos.');
      return;
    }
    setEntrenos((prev) => {
      const next = rebindEntrenos(resolveNextArray(newEntrenos, prev), ensurePlayerIds(syncDataRef.current.players as PersonLike[]));
      persistEntrenos(equipo, temporada, next).catch((e) => console.warn('saveEntrenos error', e));
      return next;
    });
  }, [equipo, temporada, canEdit]);

  const saveEventosCalendario = useCallback(async (newEventos: unknown[] | ((prev: unknown[]) => unknown[])) => {
    if (!canEdit) {
      Alert.alert('Solo lectura', 'Tu cuenta no puede modificar el calendario.');
      return;
    }
    setEventosCalendario((prev) => {
      const next = resolveNextArray(newEventos, prev);
      persistEventosCalendario(equipo, temporada, next).catch((e) => console.warn('saveEventos error', e));
      return next;
    });
  }, [equipo, temporada, canEdit]);

  const openBibliotecaFrom = useCallback((fromScreen: string) => {
    setBibliotecaReturnScreen(fromScreen || 'MENU');
    setScreen('BIBLIOTECA');
  }, []);

  const handleMenuSelect = useCallback((target: string) => {
    if (target === 'BIBLIOTECA') {
      openBibliotecaFrom('MENU');
      return;
    }
    setEditItem(null);
    setEditReturnScreen(null);
    setScreen(target);
  }, [openBibliotecaFrom]);

  if (!isLoaded) return null;
  if (showIntro) {
    return (
      <SafeAreaProvider>
        <ScrollView
          style={styles.introScroll}
          contentContainerStyle={styles.introContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <Text style={styles.introText}>
            Aplicación creada por Miguel Montero para Leganés Amas
          </Text>
        </ScrollView>
      </SafeAreaProvider>
    );
  }

  if (authLoading || authChecking || (user && authSyncing)) {
    return (
      <SafeAreaProvider>
        <View style={[styles.center, { backgroundColor: '#001A33', flex: 1 }]}>
          <ActivityIndicator color="#4CC9F0" size="large" />
          <Text style={{ color: '#8FA7BF', marginTop: 12 }}>
            {authChecking ? 'Comprobando autorización...' : 'Sincronizando tu cuenta...'}
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <AuthScreen />
      </SafeAreaProvider>
    );
  }

  if (!isAuthorized) {
    return (
      <SafeAreaProvider>
        <PendingApprovalScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <View style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#012E57" />
          
          {screen === 'SELECTOR' && (
            <SelectorEquipo
              key={user.uid}
              onConfirm={({ equipo: eq, temporada: temp }) => switchEquipoTemporada(eq, temp)}
            />
          )}

          {screen === 'MENU' && (
            <MenuPrincipal
              equipoNombre={equipo}
              temporadaNombre={temporada}
              onSelect={handleMenuSelect}
              onExit={() => {
                if (Platform.OS === 'android') {
                  BackHandler.exitApp();
                } else {
                  Alert.alert('Salir', 'En iOS, desliza hacia arriba desde la parte inferior para cerrar la app.', [{ text: 'Entendido' }]);
                }
              }}
              players={players}
              partidos={partidos}
              entrenos={entrenos}
              eventosCalendario={eventosCalendario}
              savePlayers={savePlayers}
              savePartidos={savePartidos}
              saveEntrenos={saveEntrenos}
              saveEventosCalendario={saveEventosCalendario}
              escudoUri={escudoUri}
              lastSyncTick={lastSyncTick}
              onUpdateEscudo={(uri: string | null) => {
                setEscudoUri(uri);
                setTeamSettings(equipo, temporada, { escudoUri: uri }).catch((e) => {
                  console.warn('saveTeamSettings error', e);
                });
              }}
              onCambioEquipo={({ equipo: eq, temporada: temp }) => switchEquipoTemporada(eq, temp)}
            />
          )}

          {screen === 'PLANTILLA' && (
            <ScreenErrorBoundary fallbackText="Error al abrir Plantilla. Vuelve al menú e inténtalo de nuevo.">
              <Plantilla
                players={players}
                partidos={partidos}
                entrenos={entrenos}
                setPlayers={savePlayers}
                onBack={() => setScreen('MENU')}
                onOpenBiblioteca={() => openBibliotecaFrom('PLANTILLA')}
                escudoUri={escudoUri}
                equipoNombre={equipo}
                temporadaNombre={temporada}
              />
            </ScreenErrorBoundary>
          )}

          {screen === 'ENTRENAMIENTOS' && (
            <Entrenamientos
              players={players}
              entrenos={entrenos}
              setEntrenos={saveEntrenos}
              editItem={editItem}
              onBack={() => {
                const back = editReturnScreen || 'MENU';
                setEditItem(null);
                setEditReturnScreen(null);
                setScreen(back);
              }}
            />
          )}

          {(screen === 'PARTIDOS' || screen === 'NUEVO_PARTIDO') && (
            <Partidos
              players={players}
              partidos={partidos}
              setPartidos={savePartidos}
              editItem={editItem}
              escudoUri={escudoUri}
              storageKeyBase={buildStorageKey(equipo, temporada)}
              onSelectPartidoToEdit={(p) => setEditItem(p)}
              onBack={() => {
                const back = editReturnScreen || 'MENU';
                setEditItem(null);
                setEditReturnScreen(null);
                setScreen(back);
              }}
            />
          )}

          {screen === 'PIZARRA' && (
            <ScreenErrorBoundary fallbackText="Error al abrir Pizarra. Vuelve al menú e inténtalo de nuevo.">
              <Pizarra players={players} setPlayers={savePlayers} onBack={() => setScreen('MENU')} onOpenBiblioteca={() => openBibliotecaFrom('PIZARRA')} />
            </ScreenErrorBoundary>
          )}

          {screen === 'STATS' && (
            <Stats
              players={players}
              partidos={partidos}
              entrenos={entrenos}
              onBack={() => setScreen('MENU')}
              onOpenBiblioteca={() => openBibliotecaFrom('STATS')}
              escudoUri={escudoUri}
              equipoNombre={equipo}
              temporadaNombre={temporada}
              onEditSession={(item, tipo) => {
                setEditItem(item);
                setEditReturnScreen('STATS');
                setScreen(tipo === 'ENT' ? 'ENTRENAMIENTOS' : 'NUEVO_PARTIDO');
              }}
              onDeleteSession={(id, tipo) => {
                if (tipo === 'ENT') saveEntrenos(entrenos.filter((e) => e.id !== id));
                else savePartidos(partidos.filter((p) => p.id !== id));
              }}
            />
          )}

          {screen === 'AYUDA' && (
            <Ayuda onBack={() => setScreen('MENU')} />
          )}

          {screen === 'BIBLIOTECA' && (
            <ScreenErrorBoundary fallbackText="Error al abrir la Biblioteca. Vuelve al menú e inténtalo de nuevo.">
              <Biblioteca
                equipo={equipo}
                temporada={temporada}
                onBack={() => setScreen(bibliotecaReturnScreen || 'MENU')}
              />
            </ScreenErrorBoundary>
          )}

          {screen === 'CALENDARIO' && (
            <Calendario
              partidos={partidos}
              setPartidos={savePartidos}
              eventosCalendario={eventosCalendario}
              setEventosCalendario={saveEventosCalendario}
              players={players}
              onBack={() => setScreen('MENU')}
              onOpenBiblioteca={() => openBibliotecaFrom('CALENDARIO')}
              onVerPartido={(id) => {
                if (String(id).startsWith('ev_')) return;
                const p = partidos.find((x) => String(x?.id) === id);
                setEditItem(p ?? null);
                setScreen('NUEVO_PARTIDO');
              }}
            />
          )}

          {screen === 'CONFIG_PARTIDO' && (
            <ConfigurarPartido 
              players={players} 
              onBack={() => setScreen('MENU')}
              onStartMatch={(config, rotacion) => {
                setActiveMatchData({ config, rotacion });
                setScreen('CRONOMETRO');
              }}
            />
          )}

          {/* CRONÓMETRO CON PROTECCIÓN TOTAL */}
          {screen === 'CRONOMETRO' && (
            activeMatchData ? (
              <CronometroPartido 
                config={activeMatchData.config}
                rotacion={activeMatchData.rotacion}
                players={players}
                escudoUri={escudoUri}
                storageKeyBase={buildStorageKey(equipo, temporada)}
                onBack={() => {
                  setActiveMatchData(null);
                  setScreen('MENU');
                }}
              />
            ) : (
              <View style={styles.center}>
                <Text style={{color: 'white'}}>Error de datos. Reiniciando...</Text>
                <TouchableOpacity onPress={() => setScreen('MENU')} style={styles.btn}>
                  <Text style={{color: 'white'}}>VOLVER</Text>
                </TouchableOpacity>
              </View>
            )
          )}
        </View>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btn: { marginTop: 20, padding: 10, backgroundColor: '#D32F2F', borderRadius: 5 },
  introScroll: { flex: 1, backgroundColor: '#001A33' },
  introContainer: {
    flexGrow: 1,
    backgroundColor: '#001A33',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  introText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 30,
  },
});