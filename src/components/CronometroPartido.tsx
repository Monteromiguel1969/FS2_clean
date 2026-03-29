import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, Image, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { activateKeepAwake, deactivateKeepAwake } from 'expo-keep-awake';
import { Audio } from 'expo-av';

export default function CronometroPartido({ config, rotacion, players, onBack, storageKeyBase = '@futsal_lega:default:default' }: { config: unknown; rotacion: unknown; players: unknown[]; onBack: () => void; storageKeyBase?: string }) {
  
  // --- 1. GUARDIA DE SEGURIDAD ---
  if (!config || !rotacion || !players) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: 'white' }}>Cargando datos del partido...</Text>
        <TouchableOpacity onPress={onBack} style={{marginTop: 20}}>
            <Text style={{color: '#00aaff'}}>Volver atrás</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- 2. CONFIGURACIÓN INICIAL ---
  const duracionParte = parseInt(config?.duracionParte || '20', 10) * 60;
  const totalPeriodos = parseInt(config?.numPartes || '2', 10);

  const [seconds, setSeconds] = useState(duracionParte);
  const [isActive, setIsActive] = useState(false);
  const [periodoActual, setPeriodoActual] = useState(1);
  const [showResumen, setShowResumen] = useState(false);
  const [periodoTerminado, setPeriodoTerminado] = useState(false);

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
  const lastAlarmElapsedRef = useRef(-1);
  
  const [tiemposPorPeriodo, setTiemposPorPeriodo] = useState(() => {
    const inicial: any = {};
    (rotacion?.convocados || []).forEach((id: string) => {
      inicial[id] = Array(totalPeriodos).fill(0);
    });
    return inicial;
  });

  // --- 3. LÓGICA DEL RELOJ ---
  useEffect(() => {
    let interval: any;
    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds(s => (s > 0 ? s - 1 : 0));
        setTiemposPorPeriodo(prev => {
          const nuevo = { ...prev };
          enPista.forEach(id => {
            if (nuevo[id]) {
              const copia = [...nuevo[id]];
              copia[periodoActual - 1] = (copia[periodoActual - 1] || 0) + 1;
              nuevo[id] = copia;
            }
          });
          return nuevo;
        });
      }, 1000);
    } else if (seconds === 0 && isActive) {
      setIsActive(false);
      if (periodoActual < totalPeriodos) {
        setPeriodoTerminado(true);
      } else {
        setPeriodoTerminado(false);
        setShowResumen(true); // Abrir directamente el informe al terminar el partido
      }
    }
    return () => clearInterval(interval);
  }, [isActive, seconds, enPista, periodoActual]);

  // Mantener pantalla despierta mientras el cronómetro está en marcha (API síncrona compatible)
  useEffect(() => {
    if (isActive && !showResumen) {
      activateKeepAwake();
    } else {
      deactivateKeepAwake();
    }
    return () => { deactivateKeepAwake(); };
  }, [isActive, showResumen]);

  useEffect(() => {
    let mounted = true;
    const loadAlarmSound = async () => {
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
    loadAlarmSound();
    return () => {
      mounted = false;
      const s = alarmSoundRef.current;
      alarmSoundRef.current = null;
      if (s) s.unloadAsync().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!isActive || !alarmEnabled || seconds <= 0) return;
    const intervalSec = Math.max(1, alarmEveryMin) * 60;
    const elapsed = duracionParte - seconds;
    if (elapsed <= 0 || elapsed % intervalSec !== 0) return;
    if (lastAlarmElapsedRef.current === elapsed) return;
    lastAlarmElapsedRef.current = elapsed;

    Vibration.vibrate([0, 220, 90, 220]);
    const s = alarmSoundRef.current;
    if (s) {
      s.replayAsync().catch(() => {});
    }
  }, [isActive, alarmEnabled, alarmEveryMin, seconds, duracionParte]);

  useEffect(() => {
    if (seconds === duracionParte || !isActive) {
      lastAlarmElapsedRef.current = -1;
    }
  }, [seconds, duracionParte, isActive, periodoActual]);

  // --- 4. FUNCIONES ---
  const formatTime = (totalSec: number) => {
    const sec = Math.max(0, Math.floor(totalSec));
    if (sec >= 3600) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };
  const formatMinSeg = (min: number | undefined, seg: number | undefined) => {
    if (min == null && seg == null) return '-';
    const m = Math.max(0, min ?? 0);
    const s = Math.max(0, Math.min(59, seg ?? 0));
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };
  const tipoLabel = (tipo: string) => (tipo === 'CONTRA' ? 'C' : tipo === 'FAVOR' ? 'F' : tipo);

  const getPlayerData = (id: string) => 
    players?.find((p: any) => p.id === id) || { name: '?', number: '0', photo: null };

  const registrarGol = (idAutor: string | null, esContra = false) => {
    const segundosTranscurridosEnParte = duracionParte - seconds;
    const minutoEnParte = Math.floor(segundosTranscurridosEnParte / 60);
    const segundoEnParte = segundosTranscurridosEnParte % 60;
    const minutoTotal = (periodoActual - 1) * (duracionParte / 60) + minutoEnParte;
    const quintetoEnPista = enPista.map((id: string) => getPlayerData(id).name);

    const nuevoEvento = {
      minuto: Math.floor(minutoTotal),
      segundo: segundoEnParte,
      periodo: periodoActual,
      tipo: esContra ? 'CONTRA' : 'FAVOR',
      autor: esContra ? 'RIVAL' : getPlayerData(idAutor!).name,
      quintetoEnPista: quintetoEnPista.join(', '),
    };

    setEventosGoles(prev => [...prev, nuevoEvento]);
    if (esContra) setGolesContra(g => g + 1);
    else setGolesFavor(g => g + 1);
  };

  const sharingRef = React.useRef(false);
  const exportarYCompartir = async () => {
    if (sharingRef.current) return;
    try {
      sharingRef.current = true;
      const filasTiempos = (rotacion?.convocados || []).map((id: string) => {
        const p = getPlayerData(id);
        const tiempos = (tiemposPorPeriodo[id] || []).slice(0, totalPeriodos);
        const total = tiempos.reduce((a: number, b: number) => a + b, 0);
        const celdasPeriodos = Array.from({ length: totalPeriodos }).map((_, i) => `<td>${formatTime(tiempos[i] || 0)}</td>`).join('');
        return `<tr><td>${p.name}</td>${celdasPeriodos}<td><b>${formatTime(total)}</b></td></tr>`;
      }).join('');

      const formatMinSegHtml = (min: number | undefined, seg: number | undefined) => {
        if (min == null && seg == null) return '-';
        const m = Math.max(0, min ?? 0);
        const s = Math.max(0, Math.min(59, seg ?? 0));
        return `${m}:${s < 10 ? '0' : ''}${s}`;
      };
      const tipoHtml = (t: string) => (t === 'CONTRA' ? 'C' : t === 'FAVOR' ? 'F' : t);
      const filasGoles = eventosGoles.length === 0
        ? '<tr><td colspan="4">Sin goles registrados</td></tr>'
        : eventosGoles.map((ev: any) => `<tr><td>${ev.autor || '-'}</td><td>${formatMinSegHtml(ev.minuto, ev.segundo)}</td><td>${tipoHtml(ev.tipo)}</td><td>${ev.quintetoEnPista || '-'}</td></tr>`).join('');

      const html = `<html><head><meta charset="UTF-8"/></head><body style="font-family:sans-serif;padding:20px;">
        <h1 style="text-align:center">ACTA VS ${config?.rival || 'Rival'}</h1>
        <h2 style="margin-top:24px">PARTE 1 — TIEMPOS DE JUEGO</h2>
        <table border="1" style="width:100%;border-collapse:collapse;text-align:center;margin-bottom:24px">
          <thead><tr><th>Jugador</th>${Array.from({ length: totalPeriodos }).map((_, i) => `<th>P${i + 1}</th>`).join('')}<th>Total</th></tr></thead>
          <tbody>${filasTiempos}</tbody>
        </table>
        <h2>PARTE 2 — DATOS DE GOLES</h2>
        <table border="1" style="width:100%;border-collapse:collapse;text-align:center">
          <thead><tr><th>Autor del gol</th><th>Tiempo (m:ss)</th><th>Tipo</th><th>Quinteto en pista</th></tr></thead>
          <tbody>${filasGoles}</tbody>
        </table>
        <p style="margin-top:16px;font-weight:bold;text-align:center">Resultado: ${golesFavor} - ${golesContra}</p>
      </body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch (e) { Alert.alert("Error", "No se pudo generar el PDF"); }
    finally { sharingRef.current = false; }
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
          fecha: (() => { const d = new Date(); const day = d.getDate().toString().padStart(2, '0'); const month = (d.getMonth() + 1).toString().padStart(2, '0'); const year = d.getFullYear(); return `${day}/${month}/${year}`; })(),
          goles: { favor: golesFavor, contra: golesContra, eventos: eventosGoles },
          tiempos: tiemposPorPeriodo
        };
        await AsyncStorage.setItem(storageKey, JSON.stringify([nuevaSesion, ...historial]));
      } catch (e) { console.log(e); }
    }
    onBack();
  };

  // Al terminar el partido, mostrar directamente la pantalla de informe (no modal)
  if (showResumen) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#001A33' }]}>
        <View style={styles.informePantalla}>
          <Text style={styles.informePantallaTitulo}>INFORME DEL PARTIDO</Text>
          <Text style={styles.informePantallaSub}>vs {config?.rival || 'Rival'}</Text>
          {/* Botones arriba */}
          <View style={styles.informeBotonesRow}>
            <TouchableOpacity style={[styles.btnM, styles.btnExportar]} onPress={exportarYCompartir}>
              <FontAwesome name="share-alt" size={16} color="#FFF" />
              <Text style={styles.btnText}>EXPORTAR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnM, styles.btnGuardar]} onPress={() => finalizarYGuardar(false)}>
              <FontAwesome name="save" size={16} color="#FFF" />
              <Text style={styles.btnText}>GUARDAR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnM, styles.btnSalir]} onPress={() => onBack()}>
              <FontAwesome name="sign-out" size={16} color="#FFF" />
              <Text style={styles.btnText}>SALIR</Text>
            </TouchableOpacity>
          </View>
          {/* Informe en dos partes: tiempos y goles */}
          <ScrollView style={styles.informeScrollPantalla} contentContainerStyle={styles.informeScrollContent} showsVerticalScrollIndicator>
            {/* Parte 1: Tabla de tiempos de juego */}
            <View style={styles.hoja}>
              <Text style={styles.hojaTitulo}>PARTE 1 — TIEMPOS DE JUEGO</Text>
              <View style={styles.tablaTiempos}>
                <View style={styles.tablaFilaHeader}>
                  <Text style={[styles.tablaCelda, styles.tablaCeldaHeader, styles.colJugador]}>Jugador</Text>
                  {Array.from({ length: totalPeriodos }).map((_, i) => (
                    <Text key={i} style={[styles.tablaCelda, styles.tablaCeldaHeader]}>P{i + 1}</Text>
                  ))}
                  <Text style={[styles.tablaCelda, styles.tablaCeldaHeader, styles.colTotal]}>Total</Text>
                </View>
                {(rotacion?.convocados || []).map((id: string) => {
                  const p = getPlayerData(id);
                  const tiempos = (tiemposPorPeriodo[id] || []).slice(0, totalPeriodos);
                  const total = tiempos.reduce((a: number, b: number) => a + b, 0);
                  return (
                    <View key={id} style={styles.tablaFila}>
                      <Text style={[styles.tablaCelda, styles.colJugador]} numberOfLines={1}>{p.name}</Text>
                      {Array.from({ length: totalPeriodos }).map((_, i) => (
                        <Text key={i} style={styles.tablaCelda}>{formatTime(tiempos[i] || 0)}</Text>
                      ))}
                      <Text style={[styles.tablaCelda, styles.colTotal, styles.tablaCeldaBold]}>{formatTime(total)}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
            {/* Parte 2: Tabla de goles (Autor, Min, Seg, Quinteto en pista, Tipo) */}
            <View style={styles.hoja}>
              <Text style={styles.hojaTitulo}>PARTE 2 — DATOS DE GOLES</Text>
              <View style={styles.tablaGoles}>
                <View style={styles.tablaFilaHeader}>
                  <Text style={[styles.tablaCelda, styles.tablaCeldaHeader, styles.colAutor]}>Autor del gol</Text>
                  <Text style={[styles.tablaCelda, styles.tablaCeldaHeader, styles.colTiempo]}>Tiempo (m:ss)</Text>
                  <Text style={[styles.tablaCelda, styles.tablaCeldaHeader]}>Tipo</Text>
                  <Text style={[styles.tablaCelda, styles.tablaCeldaHeader, styles.colQuinteto]}>Quinteto en pista</Text>
                </View>
                {eventosGoles.length === 0 ? (
                  <View style={[styles.tablaFila, styles.tablaFilaEmpty]}>
                    <Text style={styles.tablaCeldaEmpty}>Sin goles registrados</Text>
                  </View>
                ) : (
                  eventosGoles.map((ev: any, i: number) => (
                    <View key={i} style={styles.tablaFila}>
                      <Text style={[styles.tablaCelda, styles.colAutor]} numberOfLines={1}>{ev.autor}</Text>
                      <Text style={[styles.tablaCelda, styles.colTiempo]}>{formatMinSeg(ev.minuto, ev.segundo)}</Text>
                      <Text style={[styles.tablaCelda, ev.tipo === 'CONTRA' ? styles.golContra : styles.golFavor]}>{tipoLabel(ev.tipo)}</Text>
                      <Text style={[styles.tablaCelda, styles.colQuinteto]} numberOfLines={2}>{ev.quintetoEnPista || '-'}</Text>
                    </View>
                  ))
                )}
              </View>
              <View style={styles.resumenResultado}>
                <Text style={styles.resumenResultadoText}>Resultado: {golesFavor} - {golesContra}</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.btnExit} onPress={() => Alert.alert("Salir", "¿Seguro?", [{text:"No"},{text:"Sí", onPress: onBack}])}>
          <FontAwesome name="times-circle" size={26} color="#FF4757" />
        </TouchableOpacity>
        <Text style={styles.headerPeriodo}>PARTE {periodoActual}/{totalPeriodos}</Text>
        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}><Text style={styles.scoreVal}>{golesFavor}</Text><Text style={styles.scoreTeam}>LEGA</Text></View>
          <Text style={styles.timer}>{formatTime(seconds)}</Text>
          <View style={styles.scoreBox}><Text style={[styles.scoreVal, {color:'#FF4757'}]}>{golesContra}</Text><Text style={styles.scoreTeam}>RIVAL</Text></View>
        </View>
        <View style={styles.headerControls}>
          <TouchableOpacity onPress={() => setIsActive(!isActive)} style={[styles.btnH, isActive?styles.bgRed:styles.bgGreen]}><Text style={styles.btnText}>{isActive?'PAUSA':'INICIAR'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => registrarGol(null, true)} style={[styles.btnH, {backgroundColor:'#555'}]}><Text style={styles.btnText}>GOL RIVAL</Text></TouchableOpacity>
        </View>
        <View style={styles.alarmRow}>
          <Text style={styles.alarmLabel}>ALARMA (pitido + vibración)</Text>
          <TouchableOpacity
            onPress={() => setAlarmEnabled((v) => !v)}
            style={[styles.alarmToggle, alarmEnabled ? styles.alarmOn : styles.alarmOff]}
          >
            <Text style={styles.alarmToggleTxt}>{alarmEnabled ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
          <View style={styles.alarmStepRow}>
            <TouchableOpacity
              style={styles.alarmStepBtn}
              onPress={() => setAlarmEveryMin((n) => Math.max(1, n - 1))}
              disabled={alarmEveryMin <= 1}
            >
              <Text style={styles.alarmStepTxt}>-</Text>
            </TouchableOpacity>
            <Text style={styles.alarmValueTxt}>{alarmEveryMin} min</Text>
            <TouchableOpacity
              style={styles.alarmStepBtn}
              onPress={() => setAlarmEveryMin((n) => Math.min(15, n + 1))}
              disabled={alarmEveryMin >= 15}
            >
              <Text style={styles.alarmStepTxt}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scroll}>
        <Text style={styles.sectionTitle}>REGISTRAR GOL</Text>
        <View style={styles.grid}>{enPista.map(id => (
            <TouchableOpacity key={id} style={styles.pItem} onPress={() => registrarGol(id)}>
                <View style={[styles.pPhoto, {borderColor: '#2E7D32', borderWidth: 2}]}>
                    {getPlayerData(id).photo ? <Image source={{uri: getPlayerData(id).photo}} style={styles.img} /> : <Text style={styles.pNum}>{getPlayerData(id).number}</Text>}
                </View>
                <Text style={styles.pName} numberOfLines={1}>{getPlayerData(id).name}</Text>
            </TouchableOpacity>
        ))}</View>

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>CAMBIOS (Toca al que sale y luego al que entra)</Text>
        <View style={styles.grid}>{enPista.map(id => (
            <TouchableOpacity key={id} style={styles.pItem} onPress={() => setJugadorSaliendo(id)}>
                <View style={[styles.pPhoto, {borderColor: jugadorSaliendo===id?'#FFD700':'#2E7D32', borderWidth: 2}]}>
                    {getPlayerData(id).photo ? <Image source={{uri: getPlayerData(id).photo}} style={styles.img} /> : <Text style={styles.pNum}>{getPlayerData(id).number}</Text>}
                </View>
                <Text style={styles.pName} numberOfLines={1}>{getPlayerData(id).name}</Text>
                <Text style={styles.pTime}>{formatTime(tiemposPorPeriodo[id] ? tiemposPorPeriodo[id][periodoActual-1] : 0)}</Text>
            </TouchableOpacity>
        ))}</View>
        
        <View style={styles.divider} />
        <View style={styles.grid}>{enBanquillo.map(id => (
            <TouchableOpacity key={id} style={styles.pItem} onPress={() => {
                if(!jugadorSaliendo) { Alert.alert("Cambio", "Toca primero a quien sale"); return; }
                setEnPista(prev => prev.map(pId => pId === jugadorSaliendo ? id : pId));
                setEnBanquillo(prev => prev.map(bId => bId === id ? jugadorSaliendo : bId));
      {/* MODAL RESUMEN FINAL: botones arriba + informe en dos hojas */}
      <Modal visible={showResumen} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContInforme}>
            <Text style={styles.modalTitle}>PARTIDO FINALIZADO</Text>
            {/* Botones arriba del informe */}
            <View style={styles.informeBotonesRow}>
              <TouchableOpacity style={[styles.btnM, styles.btnGuardar]} onPress={() => finalizarYGuardar(false)}>
                <FontAwesome name="save" size={16} color="#FFF" />
                <Text style={styles.btnText}>GUARDAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnM, styles.btnExportar]} onPress={exportarYCompartir}>
                <FontAwesome name="share-alt" size={16} color="#FFF" />
                <Text style={styles.btnText}>EXPORTAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnM, styles.btnSalir]} onPress={() => onBack()}>
                <FontAwesome name="sign-out" size={16} color="#FFF" />
                <Text style={styles.btnText}>SALIR</Text>
              </TouchableOpacity>
            </View>
            {/* Informe en dos hojas, scrollable */}
            <ScrollView style={styles.informeScroll} contentContainerStyle={styles.informeScrollContent} showsVerticalScrollIndicator>
              {/* Hoja 1: Tiempos de juego de los jugadores */}
              <View style={styles.hoja}>
                <Text style={styles.hojaTitulo}>HOJA 1 — TIEMPOS DE JUEGO</Text>
                <View style={styles.tablaTiempos}>
                  <View style={styles.tablaFilaHeader}>
                    <Text style={[styles.tablaCelda, styles.tablaCeldaHeader, styles.colJugador]}>Jugador</Text>
                    {Array.from({ length: totalPeriodos }).map((_, i) => (
                      <Text key={i} style={[styles.tablaCelda, styles.tablaCeldaHeader]}>P{i + 1}</Text>
                    ))}
                    <Text style={[styles.tablaCelda, styles.tablaCeldaHeader, styles.colTotal]}>Total</Text>
                  </View>
                  {(rotacion?.convocados || []).map((id: string) => {
                    const p = getPlayerData(id);
                    const tiempos = (tiemposPorPeriodo[id] || []).slice(0, totalPeriodos);
                    const total = tiempos.reduce((a: number, b: number) => a + b, 0);
                    return (
                      <View key={id} style={styles.tablaFila}>
                        <Text style={[styles.tablaCelda, styles.colJugador]} numberOfLines={1}>{p.name}</Text>
                        {Array.from({ length: totalPeriodos }).map((_, i) => (
                          <Text key={i} style={styles.tablaCelda}>{formatTime(tiempos[i] || 0)}</Text>
                        ))}
                        <Text style={[styles.tablaCelda, styles.colTotal, styles.tablaCeldaBold]}>{formatTime(total)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              {/* Hoja 2: Datos de goles */}
              <View style={styles.hoja}>
                <Text style={styles.hojaTitulo}>HOJA 2 — GOLES</Text>
                <View style={styles.tablaGoles}>
                  <View style={styles.tablaFilaHeader}>
                    <Text style={[styles.tablaCelda, styles.tablaCeldaHeader, styles.colMinuto]}>Min.</Text>
                    <Text style={[styles.tablaCelda, styles.tablaCeldaHeader]}>Periodo</Text>
                    <Text style={[styles.tablaCelda, styles.tablaCeldaHeader]}>Tipo</Text>
                    <Text style={[styles.tablaCelda, styles.tablaCeldaHeader, styles.colAutor]}>Autor</Text>
                  </View>
                  {eventosGoles.length === 0 ? (
                    <View style={[styles.tablaFila, styles.tablaFilaEmpty]}>
                      <Text style={styles.tablaCeldaEmpty}>Sin goles registrados</Text>
                    </View>
                  ) : (
                    eventosGoles.map((ev: any, i: number) => (
                      <View key={i} style={styles.tablaFila}>
                        <Text style={[styles.tablaCelda, styles.colMinuto]}>{ev.minuto}</Text>
                        <Text style={styles.tablaCelda}>P{ev.periodo}</Text>
                        <Text style={[styles.tablaCelda, ev.tipo === 'CONTRA' ? styles.golContra : styles.golFavor]}>{ev.tipo}</Text>
                        <Text style={[styles.tablaCelda, styles.colAutor]} numberOfLines={1}>{ev.autor}</Text>
                      </View>
                    ))
                  )}
                </View>
                <View style={styles.resumenResultado}>
                  <Text style={styles.resumenResultadoText}>Resultado: {golesFavor} - {golesContra}</Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

                setJugadorSaliendo(null);
            }}>
                <View style={[styles.pPhoto, {borderColor: '#1565C0', borderWidth: 2}]}>
                    {getPlayerData(id).photo ? <Image source={{uri: getPlayerData(id).photo}} style={styles.img} /> : <Text style={styles.pNum}>{getPlayerData(id).number}</Text>}
                </View>
                <Text style={styles.pName} numberOfLines={1}>{getPlayerData(id).name}</Text>
                <Text style={styles.pTime}>{formatTime(tiemposPorPeriodo[id] ? tiemposPorPeriodo[id][periodoActual-1] : 0)}</Text>
            </TouchableOpacity>
        ))}</View>
      </ScrollView>

      {/* MODAL ENTRE PERIODOS */}
      <Modal visible={periodoTerminado} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCont}>
            <Text style={styles.modalTitle}>FIN PERIODO {periodoActual}</Text>
            <TouchableOpacity 
              style={[styles.btnM, {backgroundColor:'#1565C0', width:'100%', marginTop: 20}]} 
              onPress={()=>{setSeconds(duracionParte); setPeriodoActual(p=>p+1); setPeriodoTerminado(false);}}
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
  header: { backgroundColor: '#012E57', padding: 12 },
  btnExit: { position: 'absolute', left: 10, top: 10, zIndex: 10 },
  headerPeriodo: { color: '#00aaff', textAlign: 'center', fontSize: 10, fontWeight: 'bold' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 5 },
  scoreBox: { alignItems: 'center', width: 60 },
  scoreVal: { color: '#FFD700', fontSize: 24, fontWeight: 'bold' },
  scoreTeam: { color: '#FFF', fontSize: 8 },
  timer: { color: '#FFF', fontSize: 32, fontWeight: 'bold' },
  headerControls: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 5 },
  alarmRow: { marginTop: 8, alignItems: 'center', gap: 6 },
  alarmLabel: { color: '#B3E5FC', fontSize: 10, fontWeight: '700' },
  alarmToggle: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, minWidth: 58, alignItems: 'center' },
  alarmOn: { backgroundColor: '#2E7D32' },
  alarmOff: { backgroundColor: '#616161' },
  alarmToggleTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  alarmStepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alarmStepBtn: { backgroundColor: '#0E4A8A', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  alarmStepTxt: { color: '#FFF', fontSize: 18, fontWeight: '900', lineHeight: 20 },
  alarmValueTxt: { color: '#FFF', fontSize: 12, fontWeight: '700', minWidth: 56, textAlign: 'center' },
  btnH: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  bgGreen: { backgroundColor: '#2E7D32' },
  bgRed: { backgroundColor: '#D32F2F' },
  btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  sectionTitle: { color: '#00aaff', fontSize: 10, fontWeight: 'bold', textAlign: 'center', marginVertical: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-evenly' },
  pItem: { width: '19%', alignItems: 'center', marginBottom: 10 },
  pPhoto: { width: 50, height: 60, borderRadius: 12, backgroundColor: '#012E57', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  pNum: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  pName: { color: '#FFF', fontSize: 8, marginTop: 4, textAlign: 'center' },
  pTime: { color: '#FFD700', fontSize: 10, fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#1565C0', marginVertical: 10, opacity: 0.3, width: '100%' },
  scroll: { flex: 1, padding: 10 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalCont: { backgroundColor: '#FFF', width: '85%', padding: 20, borderRadius: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#012E57' },
  btnPdf: { backgroundColor: '#1565C0', padding: 12, borderRadius: 10, flexDirection: 'row', marginTop: 20, width: '100%', justifyContent: 'center', alignItems: 'center' },
  btnM: { padding: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minWidth: 72, flexDirection: 'row', gap: 6 },
  btnGuardar: { backgroundColor: '#2E7D32' },
  btnExportar: { backgroundColor: '#1565C0' },
  btnSalir: { backgroundColor: '#C62828' },
  modalContInforme: { backgroundColor: '#FFF', width: '92%', maxHeight: '90%', borderRadius: 16, padding: 16, alignItems: 'center' },
  informePantalla: { flex: 1, padding: 16, backgroundColor: '#FFF', margin: 12, borderRadius: 12 },
  informePantallaTitulo: { fontSize: 20, fontWeight: 'bold', color: '#012E57', textAlign: 'center', marginBottom: 4 },
  informePantallaSub: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 },
  informeBotonesRow: { flexDirection: 'row', gap: 8, marginBottom: 12, width: '100%', justifyContent: 'space-between' },
  informeScroll: { flex: 1, width: '100%', maxHeight: 420 },
  informeScrollPantalla: { flex: 1, width: '100%' },
  informeScrollContent: { paddingBottom: 24 },
  hoja: { marginBottom: 24, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, overflow: 'hidden' },
  hojaTitulo: { backgroundColor: '#012E57', color: '#FFF', padding: 10, fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  tablaTiempos: { backgroundColor: '#FFF' },
  tablaGoles: { backgroundColor: '#FFF' },
  tablaFilaHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderBottomColor: '#ccc' },
  tablaFila: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tablaFilaEmpty: { padding: 12, alignItems: 'center' },
  tablaCelda: { padding: 8, fontSize: 11, flex: 1 },
  tablaCeldaHeader: { fontWeight: 'bold', fontSize: 11 },
  colJugador: { flex: 1.8, minWidth: 70 },
  colTotal: { flex: 0.8, minWidth: 48, fontWeight: 'bold' },
  tablaCeldaBold: { fontWeight: 'bold' },
  colMinuto: { flex: 0.6, minWidth: 36 },
  colMinSeg: { flex: 0.5, minWidth: 32 },
  colTiempo: { flex: 0.7, minWidth: 48 },
  colAutor: { flex: 1.2, minWidth: 60 },
  colQuinteto: { flex: 2, minWidth: 100 },
  golFavor: { color: '#2E7D32', fontWeight: '600' },
  golContra: { color: '#C62828', fontWeight: '600' },
  tablaCeldaEmpty: { fontSize: 12, color: '#666' },
  resumenResultado: { padding: 12, backgroundColor: '#f5f5f5', alignItems: 'center' },
  resumenResultadoText: { fontSize: 16, fontWeight: 'bold', color: '#012E57' },
});