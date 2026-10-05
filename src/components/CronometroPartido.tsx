import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image, Vibration, useWindowDimensions, Pressable, Share } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { FontAwesome } from '@expo/vector-icons';
import { useTextZoom, PinchTextZoomArea } from './ZoomableImage';
import { useCronometroVoice } from '../hooks/useCronometroVoice';
import type { VoiceCommand } from '../utils/cronometroVoiceCommands';
import { buildReportHeaderHtml, REPORT_BRAND } from '../utils/reportBranding';

type MatchConfig = { rival?: string; duracionParte?: string; numPartes?: string };
type MatchRotacion = { convocados?: string[]; enPista?: string[]; cambios?: any[] };

type GoalEvent = {
  minuto: number;
  segundo: number;
  periodo: number;
  tipo: 'FAVOR' | 'CONTRA';
  autor: string;
  quintetoEnPista: string;
};

/**
 * Genera (la primera vez) un WAV de un pitido tipo árbitro y devuelve el URI.
 * Tono ~2700 Hz con envolvente y un pequeño armónico para que suene a silbato.
 * Se guarda en cacheDirectory y se reusa en sucesivas reproducciones.
 */
let cachedWhistleUri: string | null = null;
async function ensureWhistleAsset(): Promise<string | null> {
  try {
    if (cachedWhistleUri) return cachedWhistleUri;
    const dir = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}` : '';
    if (!dir) return null;
    const target = `${dir}whistle_arbitro_v1.wav`;
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) {
      cachedWhistleUri = target;
      return target;
    }
    const sampleRate = 22050;
    const seconds = 0.55;
    const numSamples = Math.floor(sampleRate * seconds);
    const baseFreq = 2700;
    const harmFreq = 3850;
    const buf = new Uint8Array(44 + numSamples * 2);
    /** Cabecera RIFF/WAVE 16-bit mono PCM. */
    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) buf[offset + i] = str.charCodeAt(i);
    };
    const writeU32 = (offset: number, v: number) => {
      buf[offset] = v & 0xff; buf[offset + 1] = (v >> 8) & 0xff; buf[offset + 2] = (v >> 16) & 0xff; buf[offset + 3] = (v >> 24) & 0xff;
    };
    const writeU16 = (offset: number, v: number) => {
      buf[offset] = v & 0xff; buf[offset + 1] = (v >> 8) & 0xff;
    };
    writeStr(0, 'RIFF');
    writeU32(4, 36 + numSamples * 2);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    writeU32(16, 16);
    writeU16(20, 1);
    writeU16(22, 1);
    writeU32(24, sampleRate);
    writeU32(28, sampleRate * 2);
    writeU16(32, 2);
    writeU16(34, 16);
    writeStr(36, 'data');
    writeU32(40, numSamples * 2);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      /** Envolvente: ataque corto, sostenido, release suave. */
      const attack = Math.min(1, t / 0.025);
      const release = Math.min(1, (seconds - t) / 0.06);
      const env = Math.max(0, Math.min(attack, release));
      const wave = Math.sin(2 * Math.PI * baseFreq * t) * 0.78 + Math.sin(2 * Math.PI * harmFreq * t) * 0.18;
      const sample = Math.max(-1, Math.min(1, wave * env));
      const intSample = Math.round(sample * 32000);
      const off = 44 + i * 2;
      writeU16(off, intSample < 0 ? intSample + 0x10000 : intSample);
    }
    /** Convertir Uint8Array a base64 sin dependencias externas. */
    let binary = '';
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    /** btoa puede no estar disponible en RN; uso polyfill manual. */
    const base64 = uint8ToBase64(buf);
    await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
    cachedWhistleUri = target;
    return target;
  } catch (_e) {
    return null;
  }
}

function uint8ToBase64(arr: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let i = 0;
  while (i < arr.length) {
    const b1 = arr[i++] | 0;
    const b2 = i < arr.length ? arr[i++] | 0 : -1;
    const b3 = i < arr.length ? arr[i++] | 0 : -1;
    const c1 = b1 >> 2;
    const c2 = ((b1 & 0x03) << 4) | (b2 >= 0 ? (b2 >> 4) : 0);
    const c3 = b2 < 0 ? 64 : (((b2 & 0x0f) << 2) | (b3 >= 0 ? (b3 >> 6) : 0));
    const c4 = b3 < 0 ? 64 : (b3 & 0x3f);
    output += chars.charAt(c1) + chars.charAt(c2) + (c3 === 64 ? '=' : chars.charAt(c3)) + (c4 === 64 ? '=' : chars.charAt(c4));
  }
  return output;
}

let lastWhistleSound: Audio.Sound | null = null;
async function playWhistle(): Promise<void> {
  try {
    const uri = await ensureWhistleAsset();
    if (!uri) return;
    /** Liberamos el sonido anterior si seguía cargado. */
    if (lastWhistleSound) {
      try { await lastWhistleSound.unloadAsync(); } catch {}
      lastWhistleSound = null;
    }
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    const { sound } = await Audio.Sound.createAsync({ uri }, { volume: 1.0 });
    lastWhistleSound = sound;
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        if (lastWhistleSound === sound) lastWhistleSound = null;
      }
    });
  } catch (_e) {
    /** Silencioso: la vibración sigue funcionando aunque falle el audio. */
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reproduce varios pitidos cortos seguidos (por defecto 3). */
async function playWhistleBurst(times = 3, gapMs = 230): Promise<void> {
  const count = Math.max(1, Math.floor(times));
  for (let i = 0; i < count; i++) {
    await playWhistle();
    if (i < count - 1) await sleepMs(gapMs);
  }
}

export default function CronometroPartido({
  config,
  rotacion,
  players,
  escudoUri = null,
  onBack,
  storageKeyBase = '@futsal_lega:default:default',
}: {
  config: MatchConfig;
  rotacion: MatchRotacion;
  players: unknown[];
  escudoUri?: string | null;
  onBack: () => void;
  storageKeyBase?: string;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const horizontalPad = Math.max(8, Math.min(24, Math.round(width * 0.042)));
  const timerFont = Math.min(34, Math.max(20, Math.round(width * 0.075)));
  /** Una fila de 5: foto proporcional al hueco, con margen mínimo entre jugadores */
  const fiveSlotMetrics = useMemo(() => {
    const inner = Math.max(0, width - horizontalPad * 2 - 8);
    const slot = inner / 5;
    const photo = Math.max(32, Math.min(50, Math.floor(slot - 1)));
    return { photoW: photo, photoH: Math.round(photo * 1.15) };
  }, [width, horizontalPad]);

  if (!config || !rotacion || !players) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: 'white' }}>Cargando datos del partido...</Text>
        <TouchableOpacity onPress={onBack} style={{ marginTop: 20 }}>
          <Text style={{ color: '#00aaff' }}>Volver atras</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const duracionParte = Math.max(60, parseInt(config?.duracionParte || '20', 10) * 60);
  const totalPeriodos = Math.max(1, parseInt(config?.numPartes || '2', 10));

  const [seconds, setSeconds] = useState(duracionParte);
  const [isActive, setIsActive] = useState(false);
  const [periodoActual, setPeriodoActual] = useState(1);
  const [showResumen, setShowResumen] = useState(false);
  /** showPeriodReport: el árbitro ha pitado el final de un período (no del partido). */
  const [showPeriodReport, setShowPeriodReport] = useState(false);
  /**
   * finalWhistleMode: el cronómetro reglamentario llegó a 0 pero el partido/período sigue
   * hasta que el árbitro pite. Aplica tanto al final de cada período como al final del partido.
   */
  const [finalWhistleMode, setFinalWhistleMode] = useState(false);
  const [overtimeSeconds, setOvertimeSeconds] = useState(0);
  const reportZoom = useTextZoom(1);

  const [enPista, setEnPista] = useState<string[]>(rotacion?.enPista || []);
  const [enBanquillo, setEnBanquillo] = useState<string[]>(
    (rotacion?.convocados || []).filter((id: string) => !rotacion?.enPista?.includes(id))
  );
  const [jugadorSaliendo, setJugadorSaliendo] = useState<string | null>(null);

  const [golesFavor, setGolesFavor] = useState(0);
  const [golesContra, setGolesContra] = useState(0);
  const [eventosGoles, setEventosGoles] = useState<GoalEvent[]>([]);
  /** Faltas de equipo de la parte actual (se reinician en cada parte). */
  const [faltasNos, setFaltasNos] = useState(0);
  const [faltasRival, setFaltasRival] = useState(0);
  /** Tiempos muertos restantes esta parte (1 por equipo y parte). */
  const [tmNos, setTmNos] = useState(1);
  const [tmRival, setTmRival] = useState(1);
  const [faltasPorPeriodo, setFaltasPorPeriodo] = useState<Array<{ nos: number; rival: number }>>([]);
  const [tmUsadosPorPeriodo, setTmUsadosPorPeriodo] = useState<Array<{ nos: number; rival: number }>>([]);

  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [alarmEveryMin, setAlarmEveryMin] = useState(5);
  const nextAlarmElapsedRef = useRef<number>(alarmEveryMin * 60);

  const [tiemposPorPeriodo, setTiemposPorPeriodo] = useState(() => {
    const inicial: any = {};
    (rotacion?.convocados || []).forEach((id: string) => {
      inicial[id] = Array(totalPeriodos).fill(0);
    });
    return inicial;
  });

  const voicePlayers = useMemo(
    () =>
      (players as any[]).map((p) => ({
        id: String(p?.id ?? ''),
        name: String(p?.name || p?.nombre || '?'),
        number: String(p?.number ?? p?.dorsal ?? '0'),
      })),
    [players]
  );

  const matchStateRef = useRef({
    jugadorSaliendo: null as string | null,
    isActive: false,
    finalWhistleMode: false,
    isLastPeriod: false,
    showPeriodReport: false,
    showResumen: false,
    enPista: [] as string[],
    enBanquillo: [] as string[],
  });

  matchStateRef.current = {
    jugadorSaliendo,
    isActive,
    finalWhistleMode,
    isLastPeriod: periodoActual >= totalPeriodos,
    showPeriodReport,
    showResumen,
    enPista,
    enBanquillo,
  };

  const aplicarCambioDirecto = useCallback((playerOutId: string, playerInId: string) => {
    setEnPista((prev) => prev.map((pId) => (pId === playerOutId ? playerInId : pId)));
    setEnBanquillo((prev) => prev.map((bId) => (bId === playerInId ? playerOutId : bId)));
    setJugadorSaliendo(null);
  }, []);

  const actionsRef = useRef({
    registrarGol: (_id: string | null, _esContra?: boolean) => {},
    cerrarPeriodo: () => {},
    cerrarPartido: () => {},
    continuarParte: () => {},
  });

  const handleVoiceCommand = useCallback((cmd: VoiceCommand) => {
    const st = matchStateRef.current;
    const act = actionsRef.current;
    switch (cmd.type) {
      case 'gol_favor':
        act.registrarGol(cmd.playerId, false);
        break;
      case 'gol_contra':
        act.registrarGol(null, true);
        break;
      case 'pausa':
        if (st.isActive) setIsActive(false);
        break;
      case 'iniciar':
        if (!st.isActive && !st.showResumen && !st.showPeriodReport) setIsActive(true);
        break;
      case 'fin_periodo':
        if (st.finalWhistleMode && !st.isLastPeriod) act.cerrarPeriodo();
        break;
      case 'fin_partido':
        if (st.finalWhistleMode && st.isLastPeriod) act.cerrarPartido();
        break;
      case 'inicio_periodo':
        if (st.showPeriodReport) act.continuarParte();
        break;
      case 'cambio':
        if (st.enPista.includes(cmd.playerOutId) && st.enBanquillo.includes(cmd.playerInId)) {
          aplicarCambioDirecto(cmd.playerOutId, cmd.playerInId);
        }
        break;
      case 'cambio_sale':
        if (st.enPista.includes(cmd.playerId)) setJugadorSaliendo(cmd.playerId);
        break;
      case 'cambio_entra':
        if (st.jugadorSaliendo && st.enBanquillo.includes(cmd.playerId)) {
          aplicarCambioDirecto(st.jugadorSaliendo, cmd.playerId);
        }
        break;
      default:
        break;
    }
  }, [aplicarCambioDirecto]);

  const voiceActive = !showResumen && !showPeriodReport;
  const voice = useCronometroVoice({
    active: voiceActive,
    players: voicePlayers,
    onCommand: handleVoiceCommand,
  });

  useEffect(() => {
    voice.setConvocadosIds((rotacion?.convocados || []).map(String));
  }, [rotacion?.convocados, voice.setConvocadosIds]);

  const getPlayerData = (id: string) => {
    const pid = String(id);
    const p = (players as any[])?.find((x: any) => String(x?.id) === pid) || {};
    return {
      name: p?.name || p?.nombre || '?',
      number: p?.number ?? p?.dorsal ?? '0',
      photo: p?.photo || p?.foto || p?.image || p?.imagen || null,
    };
  };

  const formatTime = (totalSec: number) => {
    const sec = Math.max(0, Math.floor(totalSec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const elapsedInMatch = () => {
    const reg = duracionParte - Math.max(0, seconds);
    return reg + (finalWhistleMode ? overtimeSeconds : 0);
  };

  const timerLabel = finalWhistleMode ? `+${formatTime(overtimeSeconds)}` : formatTime(seconds);
  const isLastPeriod = periodoActual >= totalPeriodos;

  useEffect(() => {
    if (isActive && !showResumen && !showPeriodReport) void activateKeepAwake();
    else void deactivateKeepAwake();
    return () => {
      void deactivateKeepAwake();
    };
  }, [isActive, showResumen, showPeriodReport]);

  useEffect(() => {
    nextAlarmElapsedRef.current = Math.max(1, alarmEveryMin) * 60;
  }, [alarmEveryMin, periodoActual]);

  useEffect(() => {
    let interval: any;
    if (isActive) {
      interval = setInterval(() => {
        setTiemposPorPeriodo((prev: any) => {
          const nuevo = { ...prev };
          enPista.forEach((id) => {
            if (nuevo[id]) {
              const copia = [...nuevo[id]];
              copia[periodoActual - 1] = (copia[periodoActual - 1] || 0) + 1;
              nuevo[id] = copia;
            }
          });
          return nuevo;
        });

        if (finalWhistleMode) {
          setOvertimeSeconds((v) => v + 1);
          return;
        }

        setSeconds((s) => {
          if (s > 0) return s - 1;
          /**
           * Llegó a 0 (tanto en períodos intermedios como en el último): entramos en
           * "tiempo añadido" hasta que el usuario pulse PITIDO FINAL (DE PARTE).
           */
          setFinalWhistleMode(true);
          setOvertimeSeconds(1);
          /** Avisamos con vibración + pitido al llegar al fin reglamentario. */
          Vibration.vibrate([0, 600, 200, 600]);
          playWhistleBurst(3);
          return 0;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, finalWhistleMode, enPista, periodoActual]);

  useEffect(() => {
    if (!isActive || !alarmEnabled) return;
    const elapsed = elapsedInMatch();
    const step = Math.max(1, alarmEveryMin) * 60;
    if (elapsed < step) return;
    if (elapsed < nextAlarmElapsedRef.current) return;

    /** Aviso programado: vibración continua 5s + 3 pitidos de árbitro. */
    Vibration.vibrate([0, 5000]);
    playWhistleBurst(3);
    nextAlarmElapsedRef.current += step;
  }, [isActive, alarmEnabled, alarmEveryMin, seconds, overtimeSeconds, finalWhistleMode]);

  const registrarGol = (idAutor: string | null, esContra = false) => {
    const elapsed = duracionParte - Math.max(0, seconds) + (finalWhistleMode ? overtimeSeconds : 0);
    const minutoEnParte = Math.floor(elapsed / 60);
    const segundoEnParte = elapsed % 60;
    const minutoTotal = (periodoActual - 1) * (duracionParte / 60) + minutoEnParte;

    const evento: GoalEvent = {
      minuto: Math.floor(minutoTotal),
      segundo: segundoEnParte,
      periodo: periodoActual,
      tipo: esContra ? 'CONTRA' : 'FAVOR',
      autor: esContra ? 'RIVAL' : getPlayerData(idAutor!).name,
      quintetoEnPista: enPista.map((id: string) => getPlayerData(id).name).join(', '),
    };

    setEventosGoles((prev) => [...prev, evento]);
    if (esContra) setGolesContra((g) => g + 1);
    else setGolesFavor((g) => g + 1);
  };

  /** Toque = gol inmediato (sin Alert). Mantener pulsado = deshacer último gol de ese jugador/rival. */
  const golFavorToque = (idJugador: string) => {
    registrarGol(idJugador, false);
  };

  const deshacerUltimoGol = (filtro: { tipo: 'FAVOR' | 'CONTRA'; autor?: string }) => {
    setEventosGoles((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        const ev = prev[i];
        if (ev.tipo !== filtro.tipo) continue;
        if (filtro.autor && ev.autor !== filtro.autor) continue;
        idx = i;
        break;
      }
      if (idx < 0) return prev;
      const ev = prev[idx];
      if (ev.tipo === 'FAVOR') setGolesFavor((g) => Math.max(0, g - 1));
      else setGolesContra((g) => Math.max(0, g - 1));
      return prev.filter((_, i) => i !== idx);
    });
  };

  const usarTiempoMuerto = (equipo: 'nos' | 'rival') => {
    if (equipo === 'nos') {
      if (tmNos <= 0) {
        Alert.alert('Tiempo muerto', 'Ya no quedan tiempos muertos propios en esta parte.');
        return;
      }
      setTmNos((n) => n - 1);
    } else {
      if (tmRival <= 0) {
        Alert.alert('Tiempo muerto', 'El rival ya no tiene tiempos muertos en esta parte.');
        return;
      }
      setTmRival((n) => n - 1);
    }
    setIsActive(false);
  };

  const archivarContadoresParte = () => {
    setFaltasPorPeriodo((prev) => [...prev, { nos: faltasNos, rival: faltasRival }]);
    setTmUsadosPorPeriodo((prev) => [...prev, { nos: 1 - tmNos, rival: 1 - tmRival }]);
    setFaltasNos(0);
    setFaltasRival(0);
    setTmNos(1);
    setTmRival(1);
  };

  const finalizarYGuardar = async (soloSalir = false) => {
    if (!soloSalir) {
      try {
        const storageKey = `${storageKeyBase}:historial_partidos`;
        const data = await AsyncStorage.getItem(storageKey);
        const historial = data ? JSON.parse(data) : [];
        const faltasFinal = [...faltasPorPeriodo, { nos: faltasNos, rival: faltasRival }];
        const tmFinal = [...tmUsadosPorPeriodo, { nos: 1 - tmNos, rival: 1 - tmRival }];
        const nuevaSesion = {
          id: Date.now().toString(),
          rival: config?.rival,
          fecha: (() => {
            const d = new Date();
            const day = d.getDate().toString().padStart(2, '0');
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            const year = d.getFullYear();
            return `${day}/${month}/${year}`;
          })(),
          goles: { favor: golesFavor, contra: golesContra, eventos: eventosGoles },
          tiempos: tiemposPorPeriodo,
          extraTimeSeconds: overtimeSeconds,
          faltasPorPeriodo: faltasFinal,
          tiemposMuertosPorPeriodo: tmFinal,
          convocatoriaIds: rotacion?.convocados || [],
        };
        await AsyncStorage.setItem(storageKey, JSON.stringify([nuevaSesion, ...historial]));
      } catch {}
    }
    onBack();
  };

  const buildWhatsAppResumen = () => {
    const goleadores = eventosGoles
      .filter((e) => e.tipo === 'FAVOR')
      .map((e) => `• ${e.autor} (${e.minuto}:${String(e.segundo || 0).padStart(2, '0')})`)
      .join('\n');
    return [
      `⚽ Futsal Amas Lega vs ${config?.rival || 'Rival'}`,
      `Resultado: ${golesFavor} - ${golesContra}`,
      goleadores ? `\nGoleadores:\n${goleadores}` : '\nSin goles a favor registrados.',
      `\nFaltas (última parte): nosotros ${faltasNos} · rival ${faltasRival}`,
    ].join('\n');
  };

  const compartirTextoWhatsApp = async () => {
    try {
      await Share.share({ message: buildWhatsAppResumen() });
    } catch {
      Alert.alert('Error', 'No se pudo abrir compartir.');
    }
  };

  const exportarYCompartir = async () => {
    try {
      const filas = (rotacion?.convocados || []).map((id: string) => {
        const p = getPlayerData(id);
        const tiempos = (tiemposPorPeriodo[id] || []).slice(0, totalPeriodos);
        const total = tiempos.reduce((a: number, b: number) => a + b, 0);
        return `<tr><td>${p.name}</td>${Array.from({ length: totalPeriodos }).map((_, i) => `<td>${formatTime(tiempos[i] || 0)}</td>`).join('')}<td><b>${formatTime(total)}</b></td></tr>`;
      }).join('');

      const filasGoles = eventosGoles.length
        ? eventosGoles.map((ev) => `<tr><td>${ev.tipo}</td><td>${ev.autor}</td><td>${ev.minuto}:${String(ev.segundo || 0).padStart(2, '0')}</td><td>${ev.quintetoEnPista || '-'}</td></tr>`).join('')
        : '<tr><td colspan="4">Sin goles registrados</td></tr>';
      const faltasFinal = [...faltasPorPeriodo, { nos: faltasNos, rival: faltasRival }];
      const filasFaltas = faltasFinal
        .map((f, i) => `<tr><td>P${i + 1}</td><td>${f.nos}</td><td>${f.rival}</td></tr>`)
        .join('');
      const headerHtml = buildReportHeaderHtml({
        title: `ACTA VS ${config?.rival || 'Rival'}`,
        escudoUri,
        brandLabel: REPORT_BRAND.appName,
      });

      const html = `<html><head><meta charset="UTF-8"/></head><body style="font-family:sans-serif;padding:20px;">
      ${headerHtml}
      <p style="text-align:center">Resultado: ${golesFavor} - ${golesContra}${overtimeSeconds > 0 ? ` (extra ${formatTime(overtimeSeconds)})` : ''}</p>
      <h2 style="color:${REPORT_BRAND.navy}">Faltas de equipo</h2>
      <table border="1" style="width:100%;border-collapse:collapse;text-align:center"><thead><tr><th style="background:${REPORT_BRAND.navy};color:#fff">Parte</th><th style="background:${REPORT_BRAND.navy};color:#fff">Nosotros</th><th style="background:${REPORT_BRAND.navy};color:#fff">Rival</th></tr></thead><tbody>${filasFaltas || '<tr><td colspan="3">-</td></tr>'}</tbody></table>
      <h2 style="color:${REPORT_BRAND.navy}">Tiempos</h2>
      <table border="1" style="width:100%;border-collapse:collapse;text-align:center"><thead><tr><th style="background:${REPORT_BRAND.navy};color:#fff">Jugador</th>${Array.from({ length: totalPeriodos }).map((_, i) => `<th style="background:${REPORT_BRAND.navy};color:#fff">P${i + 1}</th>`).join('')}<th style="background:${REPORT_BRAND.navy};color:#fff">Total</th></tr></thead><tbody>${filas}</tbody></table>
      <h2 style="color:${REPORT_BRAND.navy}">Goles y quintetos</h2>
      <table border="1" style="width:100%;border-collapse:collapse;text-align:center"><thead><tr><th style="background:${REPORT_BRAND.navy};color:#fff">Tipo</th><th style="background:${REPORT_BRAND.navy};color:#fff">Autor</th><th style="background:${REPORT_BRAND.navy};color:#fff">Tiempo</th><th style="background:${REPORT_BRAND.navy};color:#fff">Quinteto</th></tr></thead><tbody>${filasGoles}</tbody></table>
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch {
      Alert.alert('Error', 'No se pudo generar el PDF');
    }
  };

  /** Acción al pulsar PITIDO FINAL DE PARTE: cerrar el período y abrir informe parcial. */
  const cerrarPeriodoYMostrarInforme = () => {
    setIsActive(false);
    setFinalWhistleMode(false);
    setShowPeriodReport(true);
  };

  /** Continuar al siguiente período desde el informe parcial. */
  const continuarSiguienteParte = () => {
    archivarContadoresParte();
    setShowPeriodReport(false);
    setSeconds(duracionParte);
    setOvertimeSeconds(0);
    setPeriodoActual((p) => p + 1);
    nextAlarmElapsedRef.current = Math.max(1, alarmEveryMin) * 60;
  };

  /** Acción al pulsar PITIDO FINAL en el último período: ir al resumen total. */
  const cerrarPartidoYMostrarResumen = () => {
    setIsActive(false);
    setFinalWhistleMode(false);
    setShowResumen(true);
  };

  actionsRef.current = {
    registrarGol,
    cerrarPeriodo: cerrarPeriodoYMostrarInforme,
    cerrarPartido: cerrarPartidoYMostrarResumen,
    continuarParte: continuarSiguienteParte,
  };

  /** Resumen del partido completo. */
  if (showResumen) {
    const filasTiempos = (rotacion?.convocados || []).map((id: string) => {
      const p = getPlayerData(id);
      const tiempos = (tiemposPorPeriodo[id] || []).slice(0, totalPeriodos);
      const total = tiempos.reduce((a: number, b: number) => a + b, 0);
      return { id, nombre: p.name, total };
    });

    const z = reportZoom.scale;
    return (
      <SafeAreaView style={[styles.container, { paddingHorizontal: horizontalPad }]}>
        <View style={styles.resumenWrapFull}>
          <Text style={[styles.resumenTitle, { fontSize: 18 * z }]}>INFORME DEL PARTIDO</Text>
          <Text style={[styles.resumenSub, { fontSize: 13 * z }]}>vs {config?.rival || 'Rival'}</Text>
          <Text style={[styles.resumenScore, { fontSize: 16 * z }]}>Resultado: {golesFavor} - {golesContra}</Text>
          <Text style={styles.resumenZoomHint}>Pellizca con dos dedos para ampliar</Text>

          <PinchTextZoomArea
            scale={reportZoom.scale}
            onScaleChange={reportZoom.setContinuous}
            style={styles.resumenPinchWrap}
          >
            <ScrollView style={styles.resumenScroll} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 110, 130) }}>
              <Text style={[styles.reportSectionTitle, { fontSize: 13 * z }]}>TIEMPOS DE JUEGO</Text>
              {filasTiempos.map((r: any) => (
                <View key={r.id} style={styles.reportRow}>
                  <Text style={[styles.reportName, { fontSize: 13 * z }]} numberOfLines={1}>{r.nombre}</Text>
                  <Text style={[styles.reportTime, { fontSize: 13 * z }]}>{formatTime(r.total)}</Text>
                </View>
              ))}

              <Text style={[styles.reportSectionTitle, { fontSize: 13 * z }]}>FALTAS DE EQUIPO</Text>
              {[...faltasPorPeriodo, { nos: faltasNos, rival: faltasRival }].map((f, i) => (
                <View key={`faltas_${i}`} style={styles.reportRow}>
                  <Text style={[styles.reportName, { fontSize: 13 * z }]}>Parte {i + 1}</Text>
                  <Text style={[styles.reportTime, { fontSize: 13 * z }]}>Nos {f.nos} · Rival {f.rival}</Text>
                </View>
              ))}

              <Text style={[styles.reportSectionTitle, { fontSize: 13 * z }]}>GOLES Y QUINTETOS</Text>
              {eventosGoles.length === 0 ? (
                <Text style={[styles.reportEmpty, { fontSize: 13 * z }]}>Sin goles registrados.</Text>
              ) : (
                eventosGoles.map((ev, i) => (
                  <View key={`g_${i}`} style={styles.goalCard}>
                    <Text style={[styles.goalTitle, { fontSize: 13 * z }]}>{ev.tipo === 'CONTRA' ? 'Gol en contra' : 'Gol a favor'} · {ev.minuto}:{String(ev.segundo || 0).padStart(2, '0')}</Text>
                    <Text style={[styles.goalLine, { fontSize: 12 * z }]}>Autor: {ev.autor}</Text>
                    <Text style={[styles.goalLine, { fontSize: 12 * z }]}>Quinteto: {ev.quintetoEnPista || '-'}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </PinchTextZoomArea>

          <View style={[styles.resumenFooter, { bottom: Math.max(insets.bottom + 8, 14) }]}>
            <TouchableOpacity style={[styles.btnM, styles.btnGuardar]} onPress={() => finalizarYGuardar(false)}><Text style={styles.btnText}>GUARDAR</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnM, styles.btnExportar]} onPress={exportarYCompartir}><Text style={styles.btnText}>PDF</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnM, styles.btnWhatsApp]} onPress={compartirTextoWhatsApp}><Text style={styles.btnText}>WHATSAPP</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnM, styles.btnSalir]} onPress={onBack}><Text style={styles.btnText}>SALIR</Text></TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /** Informe parcial al final de un período (P1, P2, ...): mismas secciones que el final del partido pero filtrado por período. */
  if (showPeriodReport) {
    const filasTiempos = (rotacion?.convocados || []).map((id: string) => {
      const p = getPlayerData(id);
      const periodoSec = (tiemposPorPeriodo[id] || [])[periodoActual - 1] || 0;
      return { id, nombre: p.name, total: periodoSec };
    });
    const golesPeriodo = eventosGoles.filter((ev) => ev.periodo === periodoActual);
    const favorPeriodo = golesPeriodo.filter((ev) => ev.tipo === 'FAVOR').length;
    const contraPeriodo = golesPeriodo.filter((ev) => ev.tipo === 'CONTRA').length;

    const z = reportZoom.scale;
    return (
      <SafeAreaView style={[styles.container, { paddingHorizontal: horizontalPad }]}>
        <View style={styles.resumenWrapFull}>
          <Text style={[styles.resumenTitle, { fontSize: 18 * z }]}>INFORME PARCIAL · PARTE {periodoActual}/{totalPeriodos}</Text>
          <Text style={[styles.resumenSub, { fontSize: 13 * z }]}>vs {config?.rival || 'Rival'}</Text>
          <Text style={[styles.resumenScore, { fontSize: 16 * z }]}>Parcial parte {periodoActual}: {favorPeriodo} - {contraPeriodo}</Text>
          <Text style={[styles.resumenSub, { fontSize: 13 * z }]}>Acumulado: {golesFavor} - {golesContra}</Text>
          <Text style={styles.resumenZoomHint}>Pellizca con dos dedos para ampliar</Text>

          <PinchTextZoomArea
            scale={reportZoom.scale}
            onScaleChange={reportZoom.setContinuous}
            style={styles.resumenPinchWrap}
          >
            <ScrollView style={styles.resumenScroll} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 110, 130) }}>
              <Text style={[styles.reportSectionTitle, { fontSize: 13 * z }]}>TIEMPOS EN ESTE PERÍODO</Text>
              {filasTiempos.map((r: any) => (
                <View key={r.id} style={styles.reportRow}>
                  <Text style={[styles.reportName, { fontSize: 13 * z }]} numberOfLines={1}>{r.nombre}</Text>
                  <Text style={[styles.reportTime, { fontSize: 13 * z }]}>{formatTime(r.total)}</Text>
                </View>
              ))}

              <Text style={[styles.reportSectionTitle, { fontSize: 13 * z }]}>FALTAS DE ESTA PARTE</Text>
              <View style={styles.reportRow}>
                <Text style={[styles.reportName, { fontSize: 13 * z }]}>Nosotros / Rival</Text>
                <Text style={[styles.reportTime, { fontSize: 13 * z }]}>{faltasNos} · {faltasRival}</Text>
              </View>

              <Text style={[styles.reportSectionTitle, { fontSize: 13 * z }]}>GOLES DEL PERÍODO</Text>
              {golesPeriodo.length === 0 ? (
                <Text style={[styles.reportEmpty, { fontSize: 13 * z }]}>Sin goles en este período.</Text>
              ) : (
                golesPeriodo.map((ev, i) => (
                  <View key={`gp_${i}`} style={styles.goalCard}>
                    <Text style={[styles.goalTitle, { fontSize: 13 * z }]}>{ev.tipo === 'CONTRA' ? 'Gol en contra' : 'Gol a favor'} · {ev.minuto}:{String(ev.segundo || 0).padStart(2, '0')}</Text>
                    <Text style={[styles.goalLine, { fontSize: 12 * z }]}>Autor: {ev.autor}</Text>
                    <Text style={[styles.goalLine, { fontSize: 12 * z }]}>Quinteto: {ev.quintetoEnPista || '-'}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </PinchTextZoomArea>

          <View style={[styles.resumenFooter, { bottom: Math.max(insets.bottom + 8, 14) }]}>
            <TouchableOpacity style={[styles.btnM, styles.btnGuardar]} onPress={continuarSiguienteParte}>
              <Text style={styles.btnText}>SIGUIENTE PARTE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const cambiarJugador = (entraId: string) => {
    if (!jugadorSaliendo) {
      Alert.alert('Cambio', 'Toca primero a quien sale');
      return;
    }
    setEnPista((prev) => prev.map((pId) => (pId === jugadorSaliendo ? entraId : pId)));
    setEnBanquillo((prev) => prev.map((bId) => (bId === entraId ? jugadorSaliendo : bId)));
    setJugadorSaliendo(null);
  };

  return (
    <SafeAreaView style={[styles.container, { paddingHorizontal: horizontalPad }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.btnExit} onPress={() => Alert.alert('Salir', 'Seguro?', [{ text: 'No' }, { text: 'Si', onPress: onBack }])}>
          <Text style={{ color: '#FF4757', fontSize: 22, fontWeight: '900' }}>X</Text>
        </TouchableOpacity>

        <Text style={styles.headerPeriodo}>PARTE {periodoActual}/{totalPeriodos}</Text>
        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}><Text style={styles.scoreVal}>{golesFavor}</Text><Text style={styles.scoreTeam}>LEGA</Text></View>
          <Text style={[styles.timer, { fontSize: timerFont }]}>{timerLabel}</Text>
          <View style={styles.scoreBox}><Text style={[styles.scoreVal, { color: '#FF4757' }]}>{golesContra}</Text><Text style={styles.scoreTeam}>RIVAL</Text></View>
        </View>

        <View style={styles.headerControls}>
          <TouchableOpacity onPress={() => setIsActive((v) => !v)} style={[styles.btnH, isActive ? styles.bgRed : styles.bgGreen]}><Text style={styles.btnText}>{isActive ? 'PAUSA' : 'INICIAR'}</Text></TouchableOpacity>
          <TouchableOpacity
            onPress={() => registrarGol(null, true)}
            onLongPress={() => deshacerUltimoGol({ tipo: 'CONTRA' })}
            delayLongPress={450}
            style={[styles.btnH, { backgroundColor: '#555' }]}
          >
            <Text style={styles.btnText}>GOL RIVAL</Text>
          </TouchableOpacity>
          {finalWhistleMode ? (
            isLastPeriod ? (
              <TouchableOpacity onPress={cerrarPartidoYMostrarResumen} style={[styles.btnH, { backgroundColor: '#FF9800' }]}>
                <Text style={styles.btnText}>PITIDO FINAL</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={cerrarPeriodoYMostrarInforme} style={[styles.btnH, { backgroundColor: '#FF9800' }]}>
                <Text style={styles.btnText}>PITIDO FINAL DE PARTE</Text>
              </TouchableOpacity>
            )
          ) : null}
        </View>

        <View style={styles.matchStatsRow}>
          <View style={styles.matchStatBlock}>
            <Text style={styles.matchStatLabel}>FALTAS</Text>
            <View style={styles.matchStatControls}>
              <TouchableOpacity style={styles.matchStatBtn} onPress={() => setFaltasNos((n) => Math.max(0, n - 1))}><Text style={styles.matchStatBtnTxt}>-</Text></TouchableOpacity>
              <Text style={styles.matchStatVal}>{faltasNos}</Text>
              <TouchableOpacity style={styles.matchStatBtn} onPress={() => setFaltasNos((n) => n + 1)}><Text style={styles.matchStatBtnTxt}>+</Text></TouchableOpacity>
              <Text style={styles.matchStatSep}>·</Text>
              <TouchableOpacity style={styles.matchStatBtn} onPress={() => setFaltasRival((n) => Math.max(0, n - 1))}><Text style={styles.matchStatBtnTxt}>-</Text></TouchableOpacity>
              <Text style={[styles.matchStatVal, { color: '#FF8A80' }]}>{faltasRival}</Text>
              <TouchableOpacity style={styles.matchStatBtn} onPress={() => setFaltasRival((n) => n + 1)}><Text style={styles.matchStatBtnTxt}>+</Text></TouchableOpacity>
            </View>
          </View>
          <View style={styles.matchStatBlock}>
            <Text style={styles.matchStatLabel}>TM</Text>
            <View style={styles.matchStatControls}>
              <TouchableOpacity
                style={[styles.tmBtn, tmNos <= 0 && styles.tmBtnUsed]}
                onPress={() => usarTiempoMuerto('nos')}
                disabled={tmNos <= 0}
              >
                <Text style={styles.tmBtnTxt}>LEGA {tmNos}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tmBtn, tmRival <= 0 && styles.tmBtnUsed]}
                onPress={() => usarTiempoMuerto('rival')}
                disabled={tmRival <= 0}
              >
                <Text style={styles.tmBtnTxt}>RIVAL {tmRival}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.alarmRowInline}>
          <Text style={styles.alarmLabel}>ALARMA</Text>
          <TouchableOpacity onPress={() => setAlarmEnabled((v) => !v)} style={[styles.alarmToggle, alarmEnabled ? styles.alarmOn : styles.alarmOff]}>
            <Text style={styles.alarmToggleTxt}>{alarmEnabled ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
          <View style={styles.alarmStepRow}>
            <TouchableOpacity style={styles.alarmStepBtn} onPress={() => setAlarmEveryMin((n) => Math.max(1, n - 1))}><Text style={styles.alarmStepTxt}>-</Text></TouchableOpacity>
            <Text style={styles.alarmValueTxt}>{alarmEveryMin} min</Text>
            <TouchableOpacity style={styles.alarmStepBtn} onPress={() => setAlarmEveryMin((n) => Math.min(15, n + 1))}><Text style={styles.alarmStepTxt}>+</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.voiceRow}>
          <Text style={styles.alarmLabel}>VOZ</Text>
          <TouchableOpacity
            onPress={voice.toggleVoiceEnabled}
            style={[styles.alarmToggle, voice.settings.voiceEnabled ? styles.alarmOn : styles.alarmOff]}
          >
            <Text style={styles.alarmToggleTxt}>{voice.settings.voiceEnabled ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={voice.toggleVolumeUpTrigger}
            style={[styles.voiceVolBtn, voice.settings.volumeUpTrigger ? styles.voiceVolOn : styles.voiceVolOff]}
          >
            <Text style={styles.voiceVolTxt}>VOL+</Text>
          </TouchableOpacity>
          {voice.settings.voiceEnabled && voice.speechAvailable ? (
            <Pressable
              onPressIn={voice.startListening}
              onPressOut={voice.stopListening}
              style={[styles.voiceMicBtn, voice.listening ? styles.voiceMicActive : null]}
            >
              <FontAwesome name="microphone" size={16} color="#FFF" />
            </Pressable>
          ) : null}
        </View>

        {voice.settings.voiceEnabled ? (
          <View style={styles.voiceFeedbackBox}>
            <Text style={[styles.voiceFeedbackLine, voice.listening ? styles.voiceListening : null]}>
              {voice.listening ? 'Escuchando...' : voice.settings.volumeUpTrigger ? 'Mantén VOL+ o el micrófono' : 'Mantén el micrófono'}
            </Text>
            {voice.interimText ? (
              <Text style={styles.voiceInterim} numberOfLines={2}>{voice.interimText}</Text>
            ) : null}
            {voice.lastFeedback ? (
              <Text style={styles.voiceLastCmd} numberOfLines={2}>{voice.lastFeedback}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <ScrollView style={[styles.scroll, { paddingHorizontal: Math.max(4, horizontalPad - 4) }]}>
        <Text style={styles.sectionTitle}>REGISTRAR GOL (toque = gol · mantener = deshacer)</Text>
        <View style={styles.rowFive}>
          {enPista.map((id) => (
            <TouchableOpacity
              key={id}
              style={styles.pItemFive}
              activeOpacity={0.85}
              onPress={() => golFavorToque(id)}
              onLongPress={() => deshacerUltimoGol({ tipo: 'FAVOR', autor: getPlayerData(id).name })}
              delayLongPress={450}
            >
              <View style={[styles.pPhoto, styles.pPhotoFive, { width: fiveSlotMetrics.photoW, height: fiveSlotMetrics.photoH, borderColor: '#2E7D32', borderWidth: 2 }]}>
                {getPlayerData(id).photo ? <Image source={{ uri: getPlayerData(id).photo }} style={styles.img} /> : <Text style={[styles.pNum, styles.pNumFive]}>{getPlayerData(id).number}</Text>}
              </View>
              <Text style={styles.pNameFive} numberOfLines={1}>{getPlayerData(id).name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>CAMBIOS</Text>
        <Text style={styles.subSectionHint}>En pista (toca quien sale)</Text>
        <View style={styles.rowFive}>
          {enPista.map((id) => (
            <TouchableOpacity
              key={id}
              style={styles.pItemFive}
              activeOpacity={0.85}
              onPress={() => setJugadorSaliendo(id)}
            >
              <View style={[styles.pPhoto, styles.pPhotoFive, { width: fiveSlotMetrics.photoW, height: fiveSlotMetrics.photoH, borderColor: jugadorSaliendo === id ? '#FFD700' : '#2E7D32', borderWidth: 2 }]}>
                {getPlayerData(id).photo ? <Image source={{ uri: getPlayerData(id).photo }} style={styles.img} /> : <Text style={[styles.pNum, styles.pNumFive]}>{getPlayerData(id).number}</Text>}
              </View>
              <Text style={styles.pNameFive} numberOfLines={1}>{getPlayerData(id).name}</Text>
              <Text style={styles.pTimeFive}>{formatTime(tiemposPorPeriodo[id] ? tiemposPorPeriodo[id][periodoActual - 1] : 0)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.dividerStrong} />
        <Text style={styles.subSectionHint}>Banquillo (toca quien entra)</Text>
        {Array.from({ length: Math.ceil(enBanquillo.length / 5) || 0 }, (_, rowIdx) => {
          const rowIds = enBanquillo.slice(rowIdx * 5, rowIdx * 5 + 5);
          return (
            <View key={`bench_${rowIdx}`} style={[styles.rowFive, rowIdx > 0 ? styles.rowFiveBenchGap : null]}>
              {rowIds.map((id) => (
                <TouchableOpacity key={id} style={styles.pItemFive} activeOpacity={0.85} onPress={() => cambiarJugador(id)}>
                  <View style={[styles.pPhoto, styles.pPhotoFive, { width: fiveSlotMetrics.photoW, height: fiveSlotMetrics.photoH, borderColor: '#1565C0', borderWidth: 2 }]}>
                    {getPlayerData(id).photo ? <Image source={{ uri: getPlayerData(id).photo }} style={styles.img} /> : <Text style={[styles.pNum, styles.pNumFive]}>{getPlayerData(id).number}</Text>}
                  </View>
                  <Text style={styles.pNameFive} numberOfLines={1}>{getPlayerData(id).name}</Text>
                  <Text style={styles.pTimeFive}>{formatTime(tiemposPorPeriodo[id] ? tiemposPorPeriodo[id][periodoActual - 1] : 0)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33' },
  header: { backgroundColor: '#012E57', padding: 10 },
  btnExit: { position: 'absolute', left: 10, top: 8, zIndex: 10 },
  headerPeriodo: { color: '#00aaff', textAlign: 'center', fontSize: 10, fontWeight: 'bold' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 4 },
  scoreBox: { alignItems: 'center', width: 60 },
  scoreVal: { color: '#FFD700', fontSize: 22, fontWeight: 'bold' },
  scoreTeam: { color: '#FFF', fontSize: 8 },
  timer: { color: '#FFF', fontWeight: 'bold' },
  headerControls: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  alarmRowInline: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  alarmLabel: { color: '#B3E5FC', fontSize: 10, fontWeight: '700' },
  alarmToggle: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 54, alignItems: 'center' },
  alarmOn: { backgroundColor: '#2E7D32' },
  alarmOff: { backgroundColor: '#616161' },
  alarmToggleTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  alarmStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alarmStepBtn: { backgroundColor: '#0E4A8A', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  alarmStepTxt: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  alarmValueTxt: { color: '#FFF', fontSize: 11, fontWeight: '700', minWidth: 52, textAlign: 'center' },
  voiceRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  voiceVolBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 48, alignItems: 'center' },
  voiceVolOn: { backgroundColor: '#1565C0' },
  voiceVolOff: { backgroundColor: '#616161' },
  voiceVolTxt: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  voiceMicBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#455A64', alignItems: 'center', justifyContent: 'center' },
  voiceMicActive: { backgroundColor: '#C62828' },
  voiceFeedbackBox: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.2)' },
  voiceFeedbackLine: { color: '#B3E5FC', fontSize: 9, textAlign: 'center', fontWeight: '600' },
  voiceListening: { color: '#FF8A80', fontWeight: '800' },
  voiceInterim: { color: '#E1F5FE', fontSize: 10, textAlign: 'center', marginTop: 2, fontStyle: 'italic' },
  voiceLastCmd: { color: '#FFD700', fontSize: 10, textAlign: 'center', marginTop: 2, fontWeight: '700' },
  btnH: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  bgGreen: { backgroundColor: '#2E7D32' },
  bgRed: { backgroundColor: '#D32F2F' },
  btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  sectionTitle: { color: '#00aaff', fontSize: 10, fontWeight: 'bold', textAlign: 'center', marginTop: 6, marginBottom: 4 },
  subSectionHint: { color: '#90CAF9', fontSize: 8, fontWeight: '600', textAlign: 'center', marginBottom: 3, marginTop: 2 },
  /** Cinco jugadores en una sola línea; flex igual reparte el ancho sin huecos grandes */
  rowFive: { flexDirection: 'row', width: '100%', alignItems: 'flex-start' },
  rowFiveBenchGap: { marginTop: 4 },
  pItemFive: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 0.5, marginBottom: 1 },
  pPhotoFive: { borderRadius: 8 },
  pNumFive: { fontSize: 13 },
  pNameFive: { color: '#FFF', fontSize: 7, marginTop: 1, textAlign: 'center', width: '100%', paddingHorizontal: 0 },
  pTimeFive: { color: '#FFD700', fontSize: 8, fontWeight: 'bold', marginTop: 0 },
  pPhoto: { borderRadius: 10, backgroundColor: '#012E57', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  pNum: { color: '#FFF', fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#1565C0', marginVertical: 6, opacity: 0.3, width: '100%' },
  dividerStrong: { height: 1.5, backgroundColor: '#FFFFFF', marginVertical: 6, opacity: 0.9, width: '100%' },
  scroll: { flex: 1, paddingTop: 6 },
  resumenWrapFull: { flex: 1, margin: 10, borderRadius: 12, backgroundColor: '#FFF', padding: 12 },
  resumenTitle: { color: '#012E57', textAlign: 'center', fontSize: 18, fontWeight: '800' },
  resumenZoomHint: { color: '#90CAF9', fontSize: 10, fontStyle: 'italic', marginBottom: 4, textAlign: 'center' },
  resumenPinchWrap: { flex: 1, minHeight: 0 },
  resumenSub: { color: '#455A64', textAlign: 'center', marginTop: 2 },
  resumenScore: { color: '#012E57', textAlign: 'center', marginTop: 6, fontSize: 16, fontWeight: '800' },
  resumenScroll: { flex: 1, marginTop: 10 },
  reportSectionTitle: { color: '#0D47A1', fontWeight: '800', marginBottom: 6, marginTop: 8 },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  reportName: { color: '#263238', flex: 1, marginRight: 8 },
  reportTime: { color: '#0D47A1', fontWeight: '700' },
  reportEmpty: { color: '#607D8B', marginBottom: 10 },
  goalCard: { backgroundColor: '#F5F5F5', borderRadius: 8, padding: 8, marginBottom: 8 },
  goalTitle: { color: '#1A237E', fontWeight: '700', marginBottom: 4 },
  goalLine: { color: '#37474F', fontSize: 12 },
  resumenFooter: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  btnM: { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnGuardar: { backgroundColor: '#2E7D32' },
  btnExportar: { backgroundColor: '#1565C0' },
  btnWhatsApp: { backgroundColor: '#128C7E' },
  btnSalir: { backgroundColor: '#C62828' },
  matchStatsRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  matchStatBlock: {
    flex: 1,
    minWidth: 140,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  matchStatLabel: { color: '#B3E5FC', fontSize: 9, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  matchStatControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' },
  matchStatBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0E4A8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchStatBtnTxt: { color: '#FFF', fontSize: 14, fontWeight: '900' },
  matchStatVal: { color: '#FFD700', fontSize: 14, fontWeight: '800', minWidth: 18, textAlign: 'center' },
  matchStatSep: { color: '#90CAF9', marginHorizontal: 2, fontWeight: '700' },
  tmBtn: {
    backgroundColor: '#1565C0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 64,
    alignItems: 'center',
  },
  tmBtnUsed: { backgroundColor: '#455A64', opacity: 0.7 },
  tmBtnTxt: { color: '#FFF', fontSize: 10, fontWeight: '800' },
});
