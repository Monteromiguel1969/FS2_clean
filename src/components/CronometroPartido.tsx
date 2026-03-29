import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image, Vibration, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';
import { Audio } from 'expo-av';

type MatchConfig = { rival?: string; duracionParte?: string; numPartes?: string };
type MatchRotacion = { convocados?: string[]; enPista?: string[]; cambios?: any[] };

export default function CronometroPartido({
  config,
  rotacion,
  players,
  onBack,
  storageKeyBase = '@futsal_lega:default:default',
}: {
  config: MatchConfig;
  rotacion: MatchRotacion;
  players: unknown[];
  onBack: () => void;
  storageKeyBase?: string;
}) {
  const insets = useSafeAreaInsets();

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
  const [periodoTerminado, setPeriodoTerminado] = useState(false);
  const [showResumen, setShowResumen] = useState(false);
  const [finalWhistleMode, setFinalWhistleMode] = useState(false);
  const [overtimeSeconds, setOvertimeSeconds] = useState(0);

  const [enPista, setEnPista] = useState<string[]>(rotacion?.enPista || []);
  const [enBanquillo, setEnBanquillo] = useState<string[]>(
    (rotacion?.convocados || []).filter((id: string) => !rotacion?.enPista?.includes(id))
  );
  const [jugadorSaliendo, setJugadorSaliendo] = useState<string | null>(null);

  const [golesFavor, setGolesFavor] = useState(0);
  const [golesContra, setGolesContra] = useState(0);
  const [eventosGoles, setEventosGoles] = useState<any[]>([]);

  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [alarmEveryMin, setAlarmEveryMin] = useState(5);
  const alarmSoundRef = useRef<Audio.Sound | null>(null);
  const nextAlarmElapsedRef = useRef<number>(alarmEveryMin * 60);

  const [tiemposPorPeriodo, setTiemposPorPeriodo] = useState(() => {
    const inicial: any = {};
    (rotacion?.convocados || []).forEach((id: string) => {
      inicial[id] = Array(totalPeriodos).fill(0);
    });
    return inicial;
  });

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

  useEffect(() => {
    if (isActive && !showResumen) activateKeepAwake();
    else deactivateKeepAwake();
    return () => deactivateKeepAwake();
  }, [isActive, showResumen]);

  useEffect(() => {
    let mounted = true;
    const prepareAlarm = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
          { shouldPlay: false, volume: 1.0 }
        );
        if (!mounted) {
          await sound.unloadAsync();
          return;
        }
        alarmSoundRef.current = sound;
      } catch {
        alarmSoundRef.current = null;
      }
    };
    prepareAlarm();
    return () => {
      mounted = false;
      if (alarmSoundRef.current) alarmSoundRef.current.unloadAsync().catch(() => {});
      alarmSoundRef.current = null;
    };
  }, []);

  useEffect(() => {
    nextAlarmElapsedRef.current = Math.max(1, alarmEveryMin) * 60;
  }, [alarmEveryMin, periodoActual]);

  useEffect(() => {
    let interval: any;
    if (isActive) {
      interval = setInterval(() => {
        setTiemposPorPeriodo((prev) => {
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
          if (periodoActual < totalPeriodos) {
            setIsActive(false);
            setPeriodoTerminado(true);
            return 0;
          }
          setFinalWhistleMode(true);
          setOvertimeSeconds(1);
          return 0;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, finalWhistleMode, enPista, periodoActual, totalPeriodos]);

  useEffect(() => {
    if (!isActive || !alarmEnabled) return;
    const elapsed = elapsedInMatch();
    const step = Math.max(1, alarmEveryMin) * 60;
    if (elapsed < step) return;
    if (elapsed < nextAlarmElapsedRef.current) return;

    Vibration.vibrate([0, 220, 90, 220]);
    if (alarmSoundRef.current) alarmSoundRef.current.replayAsync().catch(() => {});
    nextAlarmElapsedRef.current += step;
  }, [isActive, alarmEnabled, alarmEveryMin, seconds, overtimeSeconds, finalWhistleMode]);

  const registrarGol = (idAutor: string | null, esContra = false) => {
    const elapsed = duracionParte - Math.max(0, seconds) + (finalWhistleMode ? overtimeSeconds : 0);
    const minutoEnParte = Math.floor(elapsed / 60);
    const segundoEnParte = elapsed % 60;
    const minutoTotal = (periodoActual - 1) * (duracionParte / 60) + minutoEnParte;

    const evento = {
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

  const finalizarYGuardar = async (soloSalir = false) => {
    if (!soloSalir) {
      try {
        const storageKey = `${storageKeyBase}:historial_partidos`;
        const data = await AsyncStorage.getItem(storageKey);
        const historial = data ? JSON.parse(data) : [];
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
        };
        await AsyncStorage.setItem(storageKey, JSON.stringify([nuevaSesion, ...historial]));
      } catch {}
    }
    onBack();
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
        ? eventosGoles.map((ev: any) => `<tr><td>${ev.tipo}</td><td>${ev.autor}</td><td>${ev.minuto}:${String(ev.segundo || 0).padStart(2, '0')}</td><td>${ev.quintetoEnPista || '-'}</td></tr>`).join('')
        : '<tr><td colspan="4">Sin goles registrados</td></tr>';

      const html = `<html><head><meta charset="UTF-8"/></head><body style="font-family:sans-serif;padding:20px;">
      <h1 style="text-align:center">ACTA VS ${config?.rival || 'Rival'}</h1>
      <p style="text-align:center">Resultado: ${golesFavor} - ${golesContra}${overtimeSeconds > 0 ? ` (extra ${formatTime(overtimeSeconds)})` : ''}</p>
      <h2>Tiempos</h2>
      <table border="1" style="width:100%;border-collapse:collapse;text-align:center"><thead><tr><th>Jugador</th>${Array.from({ length: totalPeriodos }).map((_, i) => `<th>P${i + 1}</th>`).join('')}<th>Total</th></tr></thead><tbody>${filas}</tbody></table>
      <h2>Goles y quintetos</h2>
      <table border="1" style="width:100%;border-collapse:collapse;text-align:center"><thead><tr><th>Tipo</th><th>Autor</th><th>Tiempo</th><th>Quinteto</th></tr></thead><tbody>${filasGoles}</tbody></table>
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch {
      Alert.alert('Error', 'No se pudo generar el PDF');
    }
  };

  if (showResumen) {
    const filasTiempos = (rotacion?.convocados || []).map((id: string) => {
      const p = getPlayerData(id);
      const tiempos = (tiemposPorPeriodo[id] || []).slice(0, totalPeriodos);
      const total = tiempos.reduce((a: number, b: number) => a + b, 0);
      return { id, nombre: p.name, total };
    });

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resumenWrapFull}>
          <Text style={styles.resumenTitle}>INFORME DEL PARTIDO</Text>
          <Text style={styles.resumenSub}>vs {config?.rival || 'Rival'}</Text>
          <Text style={styles.resumenScore}>Resultado: {golesFavor} - {golesContra}</Text>

          <ScrollView style={styles.resumenScroll} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 110, 130) }}>
            <Text style={styles.reportSectionTitle}>TIEMPOS DE JUEGO</Text>
            {filasTiempos.map((r: any) => (
              <View key={r.id} style={styles.reportRow}>
                <Text style={styles.reportName} numberOfLines={1}>{r.nombre}</Text>
                <Text style={styles.reportTime}>{formatTime(r.total)}</Text>
              </View>
            ))}

            <Text style={styles.reportSectionTitle}>GOLES Y QUINTETOS</Text>
            {eventosGoles.length === 0 ? (
              <Text style={styles.reportEmpty}>Sin goles registrados.</Text>
            ) : (
              eventosGoles.map((ev: any, i: number) => (
                <View key={`g_${i}`} style={styles.goalCard}>
                  <Text style={styles.goalTitle}>{ev.tipo === 'CONTRA' ? 'Gol en contra' : 'Gol a favor'} · {ev.minuto}:{String(ev.segundo || 0).padStart(2, '0')}</Text>
                  <Text style={styles.goalLine}>Autor: {ev.autor}</Text>
                  <Text style={styles.goalLine}>Quinteto: {ev.quintetoEnPista || '-'}</Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={[styles.resumenFooter, { bottom: Math.max(insets.bottom + 8, 14) }]}>
            <TouchableOpacity style={[styles.btnM, styles.btnGuardar]} onPress={() => finalizarYGuardar(false)}><Text style={styles.btnText}>GUARDAR</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnM, styles.btnExportar]} onPress={exportarYCompartir}><Text style={styles.btnText}>EXPORTAR</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnM, styles.btnSalir]} onPress={onBack}><Text style={styles.btnText}>SALIR</Text></TouchableOpacity>
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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.btnExit} onPress={() => Alert.alert('Salir', 'Seguro?', [{ text: 'No' }, { text: 'Si', onPress: onBack }])}>
          <Text style={{ color: '#FF4757', fontSize: 22, fontWeight: '900' }}>X</Text>
        </TouchableOpacity>

        <Text style={styles.headerPeriodo}>PARTE {periodoActual}/{totalPeriodos}</Text>
        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}><Text style={styles.scoreVal}>{golesFavor}</Text><Text style={styles.scoreTeam}>LEGA</Text></View>
          <Text style={styles.timer}>{timerLabel}</Text>
          <View style={styles.scoreBox}><Text style={[styles.scoreVal, { color: '#FF4757' }]}>{golesContra}</Text><Text style={styles.scoreTeam}>RIVAL</Text></View>
        </View>

        <View style={styles.headerControls}>
          <TouchableOpacity onPress={() => setIsActive((v) => !v)} style={[styles.btnH, isActive ? styles.bgRed : styles.bgGreen]}><Text style={styles.btnText}>{isActive ? 'PAUSA' : 'INICIAR'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => registrarGol(null, true)} style={[styles.btnH, { backgroundColor: '#555' }]}><Text style={styles.btnText}>GOL RIVAL</Text></TouchableOpacity>
          {finalWhistleMode ? (
            <TouchableOpacity onPress={() => { setIsActive(false); setFinalWhistleMode(false); setShowResumen(true); }} style={[styles.btnH, { backgroundColor: '#FF9800' }]}><Text style={styles.btnText}>PITIDO FINAL</Text></TouchableOpacity>
          ) : null}
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
      </View>

      <ScrollView style={styles.scroll}>
        <Text style={styles.sectionTitle}>REGISTRAR GOL</Text>
        <View style={styles.grid}>
          {enPista.map((id) => (
            <TouchableOpacity key={id} style={styles.pItem} onPress={() => registrarGol(id)}>
              <View style={[styles.pPhoto, { borderColor: '#2E7D32', borderWidth: 2 }]}>
                {getPlayerData(id).photo ? <Image source={{ uri: getPlayerData(id).photo }} style={styles.img} /> : <Text style={styles.pNum}>{getPlayerData(id).number}</Text>}
              </View>
              <Text style={styles.pName} numberOfLines={1}>{getPlayerData(id).name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>CAMBIOS</Text>
        <View style={styles.grid}>
          {enPista.map((id) => (
            <TouchableOpacity key={id} style={styles.pItem} onPress={() => setJugadorSaliendo(id)}>
              <View style={[styles.pPhoto, { borderColor: jugadorSaliendo === id ? '#FFD700' : '#2E7D32', borderWidth: 2 }]}>
                {getPlayerData(id).photo ? <Image source={{ uri: getPlayerData(id).photo }} style={styles.img} /> : <Text style={styles.pNum}>{getPlayerData(id).number}</Text>}
              </View>
              <Text style={styles.pName} numberOfLines={1}>{getPlayerData(id).name}</Text>
              <Text style={styles.pTime}>{formatTime(tiemposPorPeriodo[id] ? tiemposPorPeriodo[id][periodoActual - 1] : 0)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.divider} />
        <View style={styles.grid}>
          {enBanquillo.map((id) => (
            <TouchableOpacity key={id} style={styles.pItem} onPress={() => cambiarJugador(id)}>
              <View style={[styles.pPhoto, { borderColor: '#1565C0', borderWidth: 2 }]}>
                {getPlayerData(id).photo ? <Image source={{ uri: getPlayerData(id).photo }} style={styles.img} /> : <Text style={styles.pNum}>{getPlayerData(id).number}</Text>}
              </View>
              <Text style={styles.pName} numberOfLines={1}>{getPlayerData(id).name}</Text>
              <Text style={styles.pTime}>{formatTime(tiemposPorPeriodo[id] ? tiemposPorPeriodo[id][periodoActual - 1] : 0)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Modal visible={periodoTerminado} transparent animationType='fade'>
        <View style={styles.modalBg}>
          <View style={styles.modalCont}>
            <Text style={styles.modalTitle}>FIN PERIODO {periodoActual}</Text>
            <TouchableOpacity
              style={[styles.btnM, { backgroundColor: '#1565C0', width: '100%', marginTop: 20 }]}
              onPress={() => {
                setSeconds(duracionParte);
                setPeriodoActual((p) => p + 1);
                setPeriodoTerminado(false);
                nextAlarmElapsedRef.current = Math.max(1, alarmEveryMin) * 60;
              }}
            >
              <Text style={styles.btnText}>SIGUIENTE PARTE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  timer: { color: '#FFF', fontSize: 28, fontWeight: 'bold' },
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
  btnH: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  bgGreen: { backgroundColor: '#2E7D32' },
  bgRed: { backgroundColor: '#D32F2F' },
  btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  sectionTitle: { color: '#00aaff', fontSize: 10, fontWeight: 'bold', textAlign: 'center', marginVertical: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-evenly' },
  pItem: { width: '19%', alignItems: 'center', marginBottom: 6 },
  pPhoto: { width: 44, height: 52, borderRadius: 10, backgroundColor: '#012E57', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  pNum: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  pName: { color: '#FFF', fontSize: 8, marginTop: 2, textAlign: 'center' },
  pTime: { color: '#FFD700', fontSize: 9, fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#1565C0', marginVertical: 6, opacity: 0.3, width: '100%' },
  scroll: { flex: 1, paddingHorizontal: 8, paddingTop: 6 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalCont: { backgroundColor: '#FFF', width: '85%', padding: 20, borderRadius: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#012E57' },
  resumenWrapFull: { flex: 1, margin: 10, borderRadius: 12, backgroundColor: '#FFF', padding: 12 },
  resumenTitle: { color: '#012E57', textAlign: 'center', fontSize: 18, fontWeight: '800' },
  resumenSub: { color: '#455A64', textAlign: 'center', marginTop: 2 },
  resumenScore: { color: '#012E57', textAlign: 'center', marginTop: 6, fontSize: 16, fontWeight: '800' },
  resumenExtra: { color: '#FF6F00', textAlign: 'center', marginTop: 4, fontWeight: '700' },
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
  btnSalir: { backgroundColor: '#C62828' },
});