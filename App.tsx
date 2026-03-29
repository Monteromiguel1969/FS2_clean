import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, StatusBar, Text, TouchableOpacity, Alert, BackHandler, Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadLocalData, savePlayers as persistPlayers, savePartidos as persistPartidos, saveEntrenos as persistEntrenos, saveEventosCalendario as persistEventosCalendario, getFirstRunDone, setFirstRunDone, setStorageMode } from './src/storage/localStorage';
import { buildStorageKey } from './src/storage/storageKeys';

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
  const [screen, setScreen] = useState('SELECTOR');
  const [isLoaded, setIsLoaded] = useState(false);
  const [players, setPlayers] = useState<unknown[]>([]);
  const [partidos, setPartidos] = useState<unknown[]>([]);
  const [entrenos, setEntrenos] = useState<unknown[]>([]);
  const [eventosCalendario, setEventosCalendario] = useState<unknown[]>([]);
  const [editItem, setEditItem] = useState<unknown>(null);
  const [equipo, setEquipo] = useState('');
  const [temporada, setTemporada] = useState('');
  const [activeMatchData, setActiveMatchData] = useState<{ config: unknown; rotacion: unknown } | null>(null);
  const ensureArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const keepActaLinks = (nextPartidos: unknown[], prevPartidos: unknown[]): unknown[] => {
    const prevById = new Map<string, any>();
    ensureArray(prevPartidos).forEach((p: any) => {
      const id = String(p?.id || '').trim();
      if (id) prevById.set(id, p);
    });
    return ensureArray(nextPartidos).map((p: any) => {
      const id = String(p?.id || '').trim();
      const prev = id ? prevById.get(id) : null;
      if (!prev?.acta) return p;
      const hasActaNow = !!p?.acta;
      if (hasActaNow) return p;
      return { ...p, acta: prev.acta };
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
    setEquipo(eq);
    setTemporada(temp);
    setScreen('MENU');
  };

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    getFirstRunDone().then((done) => {
      if (cancelled || done) return;
      Alert.alert(
        '¿Dónde desea guardar los datos?',
        'Elija cómo quiere usar la aplicación.',
        [
          { text: 'Solo en el teléfono', onPress: () => { setStorageMode('local'); setFirstRunDone(); } },
          { text: 'Solo en la nube', onPress: () => { setStorageMode('cloud'); setFirstRunDone(); Alert.alert('Información', 'Exporte e importe desde Menú → Gestión de datos con su cuenta de Google Sheets.'); } },
          { text: 'Ambos', onPress: () => { setStorageMode('both'); setFirstRunDone(); Alert.alert('Información', 'Los datos se guardan en el teléfono y puede sincronizar con Google Sheets desde Gestión de datos.'); } },
        ]
      );
    });
    return () => { cancelled = true; };
  }, [isLoaded]);

  useEffect(() => {
    if (!equipo || !temporada) return;
    let cancelled = false;
    loadLocalData(equipo, temporada).then((data) => {
      if (cancelled) return;
      setPlayers(ensureArray(data.players));
      setPartidos(ensureArray(data.partidos));
      setEntrenos(ensureArray(data.entrenos));
      setEventosCalendario(ensureArray(data.eventosCalendario ?? []));
    }).catch((e) => {
      if (!cancelled) console.warn('Error loading local data', e);
    });
    return () => { cancelled = true; };
  }, [equipo, temporada]);

  const savePlayers = useCallback(async (newPlayers: unknown[] | ((prev: unknown[]) => unknown[])) => {
    setPlayers((prev) => {
      const next = resolveNextArray(newPlayers, prev);
      persistPlayers(equipo, temporada, next).catch((e) => console.warn('savePlayers error', e));
      return next;
    });
  }, [equipo, temporada]);

  const savePartidos = useCallback(async (newPartidos: unknown[] | ((prev: unknown[]) => unknown[])) => {
    setPartidos((prev) => {
      const nextRaw = resolveNextArray(newPartidos, prev);
      const next = keepActaLinks(nextRaw, prev);
      persistPartidos(equipo, temporada, next).catch((e) => console.warn('savePartidos error', e));
      return next;
    });
  }, [equipo, temporada]);

  const saveEntrenos = useCallback(async (newEntrenos: unknown[] | ((prev: unknown[]) => unknown[])) => {
    setEntrenos((prev) => {
      const next = resolveNextArray(newEntrenos, prev);
      persistEntrenos(equipo, temporada, next).catch((e) => console.warn('saveEntrenos error', e));
      return next;
    });
  }, [equipo, temporada]);

  const saveEventosCalendario = useCallback(async (newEventos: unknown[] | ((prev: unknown[]) => unknown[])) => {
    setEventosCalendario((prev) => {
      const next = resolveNextArray(newEventos, prev);
      persistEventosCalendario(equipo, temporada, next).catch((e) => console.warn('saveEventos error', e));
      return next;
    });
  }, [equipo, temporada]);

  if (!isLoaded) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <View style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="#012E57" />
          
          {screen === 'SELECTOR' && (
            <SelectorEquipo onConfirm={({ equipo: eq, temporada: temp }) => switchEquipoTemporada(eq, temp)} />
          )}

          {screen === 'MENU' && (
            <MenuPrincipal
              equipoNombre={equipo}
              temporadaNombre={temporada}
              onSelect={setScreen}
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
              />
            </ScreenErrorBoundary>
          )}

          {screen === 'ENTRENAMIENTOS' && (
            <Entrenamientos
              players={players}
              entrenos={entrenos}
              setEntrenos={saveEntrenos}
              editItem={editItem}
              onBack={() => { setEditItem(null); setScreen('MENU'); }}
            />
          )}

          {(screen === 'PARTIDOS' || screen === 'NUEVO_PARTIDO') && (
            <Partidos
              players={players}
              partidos={partidos}
              setPartidos={savePartidos}
              editItem={editItem}
              storageKeyBase={buildStorageKey(equipo, temporada)}
              onBack={() => { setEditItem(null); setScreen('MENU'); }}
            />
          )}

          {screen === 'PIZARRA' && (
            <Pizarra players={players} setPlayers={savePlayers} onBack={() => setScreen('MENU')} />
          )}

          {screen === 'STATS' && (
            <Stats
              players={players}
              partidos={partidos}
              entrenos={entrenos}
              onBack={() => setScreen('MENU')}
              onEditSession={(item, tipo) => {
                setEditItem(item);
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

          {screen === 'CALENDARIO' && (
            <Calendario
              partidos={partidos}
              setPartidos={savePartidos}
              eventosCalendario={eventosCalendario}
              setEventosCalendario={saveEventosCalendario}
              players={players}
              onBack={() => setScreen('MENU')}
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
  btn: { marginTop: 20, padding: 10, backgroundColor: '#D32F2F', borderRadius: 5 }
});