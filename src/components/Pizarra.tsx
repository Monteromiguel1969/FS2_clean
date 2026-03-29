import React, { useRef, useState, useEffect } from "react";
import {
  View, Dimensions, StyleSheet, Animated, Text, TouchableOpacity,
  ScrollView, FlatList, PanResponder, Modal, Alert, TextInput, Image
} from "react-native";
import Svg, { Rect, Line, Circle, Path } from "react-native-svg";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { getPlayerCompositeScore, normalizePlayerRatings } from '../utils/playerRating';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const BENCH_W = 75;
const FIELD_W = SCREEN_W - BENCH_W - 20;
const FIELD_H = SCREEN_H * 0.64;
const m = FIELD_W / 20;
const FIELD_AREA_W = SCREEN_W - BENCH_W;
const FIELD_X_OFFSET = (FIELD_AREA_W - FIELD_W) / 2;
const COURT_LENGTH_M = 40;
const GK_OFFSET_NORM = 1.5 / COURT_LENGTH_M; // 1.5 m respecto a línea de gol
const FIELD_TOP_OFFSET = 20; // Offset visual del campo dibujado en el SVG
const FIELD_TOP_OFFSET_NORM = FIELD_TOP_OFFSET / FIELD_H;
const toFieldX = (xNorm: number) => FIELD_X_OFFSET + xNorm * FIELD_W;
const toFieldY = (yNorm: number) => yNorm * FIELD_H;
const GOAL_CENTER_X = toFieldX(0.5);
const GOAL_DRAW_WIDTH = 30 * 1.2;
const GOAL_DRAW_DEPTH = 10 * 1.5;

const SEIS_METROS = 6 * m;
const DIEZ_METROS = 10 * m;
const OCHO_METROS = 8 * m;

// --- DATA: 11 SISTEMAS DE JUEGO --- [cite: 2026-01-01]
const SISTEMAS_POS: any = {
  "1-3-1 (Rombo)": {
    situacion: "Ataque posicional clásico.",
    estructura: "1 cierre, 2 alas, 1 pívot.",
    roles: "Cierres: 1. Alas: 2. Pívots: 1.",
    cuando: "Para dominar la posesión. Contra defensa media o baja. Ideal si tienes pívot dominante.",
    reaccion: "Si el rival usa 1-3-1, defiende en 2-2 con ayudas al pívot: niega pase interior, orienta por banda y salta al cierre cuando reciba de cara.",
    coords: { p:[{x:0.5,y:0.9},{x:0.5,y:0.7},{x:0.2,y:0.6},{x:0.8,y:0.6},{x:0.5,y:0.35}], r:[{x:0.5,y:0.1},{x:0.5,y:0.3},{x:0.3,y:0.45},{x:0.7,y:0.45},{x:0.5,y:0.6}] }
  },
  "1-4-0 (Línea)": {
    situacion: "Ataque dinámico sin referencia fija.",
    estructura: "1 cierre, 3–4 alas móviles. Sin pívot fijo.",
    roles: "Cierres: 1. Alas: 3–4. Pívots: 0.",
    cuando: "Para generar desajustes. Contra defensas cerradas. Requiere alta comprensión táctica.",
    reaccion: "Ante un 1-4-0 rival, protege carril central y vigila cruces: mantén bloque medio, cambios de marca comunicados y evita perseguir lejos de zona.",
    coords: { p:[{x:0.5,y:0.9},{x:0.2,y:0.6},{x:0.4,y:0.6},{x:0.6,y:0.6},{x:0.8,y:0.6}], r:[{x:0.5,y:0.1},{x:0.2,y:0.4},{x:0.4,y:0.4},{x:0.6,y:0.4},{x:0.8,y:0.4}] }
  },
  "1-2-2 (Cuadrado)": {
    situacion: "Salida de presión organizada.",
    estructura: "2 jugadores base, 2 jugadores avanzados.",
    roles: "Cierres: 1–2. Alas: 1–2. Pívots: 0–1.",
    cuando: "Ante presión alta rival. Para progresar por pases cortos. Muy estable tácticamente.",
    reaccion: "Si te atacan en 1-2-2, presiona su primer pase para romper el cuadrado: tapa línea interior y obliga a jugar fuera para robar en banda.",
    coords: { p:[{x:0.5,y:0.9},{x:0.3,y:0.8},{x:0.7,y:0.8},{x:0.3,y:0.55},{x:0.7,y:0.55}], r:[{x:0.5,y:0.1},{x:0.3,y:0.35},{x:0.7,y:0.35},{x:0.3,y:0.6},{x:0.7,y:0.6}] }
  },
  "2-1-1 (Triángulo)": {
    situacion: "Seguridad defensiva y contraataque.",
    estructura: "2 cierres, 1 ala/conector, 1 pívot.",
    roles: "Cierres: 2. Alas: 1. Pívots: 1.",
    cuando: "Proteger marcador. Contra rivales superiores. Ideal para transiciones rápidas.",
    reaccion: "Contra 2-1-1 rival, mueve rápido de lado a lado: fija al conector y castiga el lado débil con diagonal al segundo palo.",
    coords: { p:[{x:0.5,y:0.9},{x:0.35,y:0.8},{x:0.65,y:0.8},{x:0.5,y:0.65},{x:0.5,y:0.4}], r:[{x:0.5,y:0.1},{x:0.35,y:0.25},{x:0.65,y:0.25},{x:0.5,y:0.45},{x:0.5,y:0.7}] }
  },
  "Y de Salida": {
    situacion: "Saque de meta bajo presión.",
    estructura: "Portero + 2 alas abiertos + 1 apoyo + 1 pívot.",
    roles: "Cierres: 0–1. Alas: 2. Pívots: 1.",
    cuando: "Para atraer presión y superarla. Si el portero juega bien con los pies.",
    reaccion: "Si el rival sale en Y, bloquea pase al apoyo central y coordina salto del ala al portero para forzar envío largo y segunda jugada.",
    coords: { p:[{x:0.5,y:0.95},{x:0.5,y:0.85},{x:0.15,y:0.75},{x:0.85,y:0.75},{x:0.5,y:0.5}], r:[{x:0.5,y:0.1},{x:0.5,y:0.65},{x:0.2,y:0.6},{x:0.8,y:0.6},{x:0.5,y:0.4}] }
  },
  "Defensa en I": {
    situacion: "Defensa específica del carril central.",
    estructura: "4 jugadores alineados en eje central.",
    roles: "Cierres: 2. Alas: 2. Pívots: 0.",
    cuando: "Contra equipos con buen tiro exterior. Para obligar a jugar por banda.",
    reaccion: "Frente a una defensa en I, acelera circulación exterior-interior y usa bloqueos en banda para atacar espalda del último defensor.",
    coords: { p:[{x:0.5,y:0.9},{x:0.5,y:0.8},{x:0.5,y:0.65},{x:0.5,y:0.5},{x:0.5,y:0.35}], r:[{x:0.5,y:0.1},{x:0.3,y:0.3},{x:0.7,y:0.3},{x:0.2,y:0.6},{x:0.8,y:0.6}] }
  },
  "Embudo Defensivo": {
    situacion: "Defensa de resultado.",
    estructura: "Bloque bajo muy cerrado.",
    roles: "Cierres: 2. Alas: 2. Pívots: 0.",
    cuando: "Últimos minutos con ventaja. Requiere concentración máxima.",
    reaccion: "Si el rival hace embudo defensivo, evita precipitarte: remate exterior con pantalla, rebote atacado y cambio de orientación constante.",
    coords: { p:[{x:0.5,y:0.95},{x:0.3,y:0.9},{x:0.7,y:0.9},{x:0.4,y:0.8},{x:0.6,y:0.8}], r:[{x:0.5,y:0.1},{x:0.2,y:0.5},{x:0.8,y:0.5},{x:0.4,y:0.65},{x:0.6,y:0.65}] }
  },
  "5v4 (Portero-Jugador)": {
    situacion: "Inferioridad en el marcador.",
    estructura: "1 portero-jugador, 3 alas, 1 pívot.",
    roles: "Cierres: 0. Alas: 3. Pívots: 1.",
    cuando: "Últimos minutos perdiendo. Alto riesgo / alta recompensa.",
    reaccion: "Ante 5v4 rival, defiende en rombo corto: protege centro y segundo palo, bascula en bloque y busca robo para tiro inmediato a portería vacía.",
    coords: { p:[{x:0.5,y:0.55},{x:0.1,y:0.45},{x:0.9,y:0.45},{x:0.3,y:0.2},{x:0.7,y:0.2}], r:[{x:0.5,y:0.1},{x:0.5,y:0.25},{x:0.35,y:0.35},{x:0.65,y:0.35},{x:0.5,y:0.45}] }
  },
  "Presión 2-2": {
    situacion: "Robo en campo rival.",
    estructura: "2 presionan, 2 anticipan.",
    roles: "Cierres: 1. Alas: 2. Pívots: 1.",
    cuando: "Tras saque rival. Para forzar errores en salida.",
    reaccion: "Si te presionan en 2-2, genera línea de pase diagonal al tercer hombre y usa apoyo del portero para superioridad en primera línea.",
    coords: { p:[{x:0.5,y:0.95},{x:0.3,y:0.35},{x:0.7,y:0.35},{x:0.3,y:0.15},{x:0.7,y:0.15}], r:[{x:0.5,y:0.05},{x:0.25,y:0.2},{x:0.75,y:0.2},{x:0.35,y:0.35},{x:0.65,y:0.35}] }
  },
  "Doble Pívot": {
    situacion: "Juego directo.",
    estructura: "2 pívots, 2 jugadores de apoyo, 1 cierre.",
    roles: "Cierres: 1. Alas: 1–2. Pívots: 2.",
    cuando: "Contra presión alta. Si tienes pívots físicos dominantes.",
    reaccion: "Contra doble pívot, prioriza duelo y cobertura: uno fija, otro barre caída; evita giro frontal y anticipa segundas jugadas.",
    coords: { p:[{x:0.5,y:0.9},{x:0.3,y:0.7},{x:0.7,y:0.7},{x:0.3,y:0.35},{x:0.7,y:0.35}], r:[{x:0.5,y:0.1},{x:0.4,y:0.25},{x:0.6,y:0.25},{x:0.3,y:0.5},{x:0.7,y:0.5}] }
  },
  "Caja Estática": {
    situacion: "Defensa zonal pasiva.",
    estructura: "Bloque en cuadrado.",
    roles: "Cierres: 2. Alas: 2. Pívots: 0.",
    cuando: "Para enfriar el partido. Contra equipos impacientes.",
    reaccion: "Si el rival defiende en caja estática, ataca intervalos entre líneas con paredes cortas y finaliza rápido antes de su reajuste.",
    coords: { p:[{x:0.5,y:0.9},{x:0.2,y:0.7},{x:0.8,y:0.7},{x:0.2,y:0.45},{x:0.8,y:0.45}], r:[{x:0.5,y:0.1},{x:0.5,y:0.3},{x:0.2,y:0.5},{x:0.8,y:0.5},{x:0.5,y:0.6}] }
  }
};

const ESTRATEGIAS_FULL = [
  {
    name: "Córner Corto",
    situacion: "Saque de esquina ofensivo en campo rival.",
    estructura: "1 sacador, 1 apoyo cercano, 1 cierre de seguridad, 1 pívot, 1 segundo palo.",
    roles: "Cierres: 1. Alas: 2. Pívots: 1.",
    cuando: "Contra defensas zonales o si el rival protege en exceso el primer palo.",
    coords: { p:[{x:0.95,y:0.05},{x:0.85,y:0.15},{x:0.5,y:0.2},{x:0.3,y:0.4},{x:0.5,y:0.9}], r:[{x:0.5,y:0.02},{x:0.88,y:0.08},{x:0.7,y:0.18},{x:0.5,y:0.3},{x:0.3,y:0.4}] }
  },
  {
    name: "Saque de Banda",
    situacion: "Banda ofensiva en campo rival.",
    estructura: "1 sacador, 1 bloqueador, 1 receptor lejano, 1 apoyo interior, 1 cierre.",
    roles: "Cierres: 1. Alas: 2–3. Pívots: 0–1.",
    cuando: "Para desorganizar marcas individuales y defensas agresivas.",
    coords: { p:[{x:0.98,y:0.5},{x:0.8,y:0.4},{x:0.8,y:0.6},{x:0.5,y:0.3},{x:0.5,y:0.9}], r:[{x:0.5,y:0.12},{x:0.8,y:0.45},{x:0.8,y:0.55},{x:0.6,y:0.4},{x:0.6,y:0.6}] }
  },
  {
    name: "Falta de 10 metros (Barrera)",
    situacion: "Falta directa o indirecta tras 5ª falta.",
    estructura: "1 ejecutor, 2 para engaño, 1 segundo palo, 1 portero atento.",
    roles: "Cierres: 1. Alas: 1–2. Pívots: 1.",
    cuando: "Si tienes especialista en golpeo. Útil para forzar rechaces.",
    coords: { p:[{x:0.5,y:0.35},{x:0.3,y:0.2},{x:0.7,y:0.2},{x:0.5,y:0.55},{x:0.5,y:0.9}], r:[{x:0.5,y:0.1},{x:0.45,y:0.22},{x:0.55,y:0.22},{x:0.3,y:0.28},{x:0.7,y:0.28}] }
  },
  {
    name: "Falta Frontal (Barrera de 3)",
    situacion: "Falta frontal cercana al área con barrera amplia.",
    estructura: "1 ejecutor, 2 señuelos, 1 bloqueador, 1 cierre.",
    roles: "Cierres: 1. Alas: 2. Pívots: 1.",
    cuando: "Jugadas de laboratorio. Ideal con pívot fuerte para pantalla.",
    coords: { p:[{x:0.5,y:0.28},{x:0.4,y:0.3},{x:0.6,y:0.3},{x:0.5,y:0.5},{x:0.5,y:0.9}], r:[{x:0.5,y:0.02},{x:0.4,y:0.18},{x:0.5,y:0.18},{x:0.6,y:0.18},{x:0.2,y:0.3}] }
  },
  {
    name: "Salida 3-1",
    situacion: "Inicio de juego ante presión alta.",
    estructura: "1 pívot alto, 3 jugadores por detrás escalonados.",
    roles: "Cierres: 1–2. Alas: 1–2. Pívots: 1.",
    cuando: "Superar presión individual. Requiere cierre con calidad de pase.",
    coords: { p:[{x:0.5,y:0.95},{x:0.15,y:0.8},{x:0.85,y:0.8},{x:0.5,y:0.7},{x:0.5,y:0.4}], r:[{x:0.5,y:0.1},{x:0.3,y:0.6},{x:0.7,y:0.6},{x:0.3,y:0.45},{x:0.7,y:0.45}] }
  },
  {
    name: "Presión Total",
    situacion: "Defensa adelantada en todo el campo.",
    estructura: "Marca individual pura. Ajustes constantes.",
    roles: "Cierres: 1. Alas: 2. Pívots: 1 (primer defensor).",
    cuando: "Tras pérdida o necesidad de robar rápido. Riesgosa ante balones largos.",
    coords: { 
      p:[{x:0.5,y:0.75},{x:0.2,y:0.3},{x:0.8,y:0.3},{x:0.3,y:0.15},{x:0.7,y:0.15}], 
      r:[{x:0.5,y:0.08},{x:0.2,y:0.12},{x:0.8,y:0.12},{x:0.5,y:0.25},{x:0.5,y:0.4}] 
    }
  }
];

const DEFAULT_SYSTEM = "1-2-2 (Cuadrado)";
const PORTERO_PROPIO_Y = 1 - GK_OFFSET_NORM; // simetría exacta con portero rival
const PORTERO_RIVAL_Y = FIELD_TOP_OFFSET_NORM + GK_OFFSET_NORM; // asegura portero rival dentro de campo, delante de línea de gol

type RoleBase = 'portero' | 'cierre' | 'ala' | 'pivot';
type SystemSlot = { key: string; roleBase: RoleBase; profile: string; coord: { x: number; y: number } };
type DrawPoint = { x: number; y: number };
type DrawKind = 'draw' | 'arrow' | 'line' | 'curve';
type DrawItem = { points: DrawPoint[]; color: string; kind: DrawKind };

function baseRoleFromProfile(profile: string): RoleBase {
  if (profile.startsWith('portero')) return 'portero';
  if (profile.startsWith('pivot')) return 'pivot';
  if (profile.startsWith('cierre')) return 'cierre';
  return 'ala';
}

function roleLabel(role: RoleBase): string {
  if (role === 'portero') return 'Portero';
  if (role === 'cierre') return 'Cierre';
  if (role === 'ala') return 'Ala';
  return 'Pívot';
}

function normalizeText(v: any): string {
  return String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getPlayerPrimaryPosition(player: any): string {
  const explicit = player?.posicionPrincipal || player?.positionPrincipal || player?.position;
  if (explicit) return normalizeText(explicit);
  const raw = String(player?.posicion || '').split(',')[0]?.trim();
  return normalizeText(raw || 'ala');
}

function getPlayerPreferredSide(player: any): string {
  const explicit = player?.ladoPreferido || player?.sidePreference;
  if (explicit) return normalizeText(explicit);
  if (Array.isArray(player?.ladosJuego) && player.ladosJuego.length) return normalizeText(player.ladosJuego[0]);
  return 'centro';
}

function getSlotProfile(systemName: string, idx: number, coord: { x: number; y: number }, outfieldCoords: Array<{ x: number; y: number }>) {
  if (idx === 0) return 'portero';
  if (systemName === DEFAULT_SYSTEM) {
    // 1-2-2: dos jugadores base y dos avanzados con sesgo por banda.
    if (idx === 1) return 'cierre_izquierda';
    if (idx === 2) return 'cierre_derecha';
    if (idx === 3) return 'ala_izquierda';
    return 'pivot_derecha';
  }

  const sortedY = [...outfieldCoords].map(c => c.y).sort((a, b) => b - a);
  const defensiveThreshold = sortedY[Math.max(0, Math.floor(sortedY.length / 2) - 1)] ?? coord.y;
  const offensive = coord.y < defensiveThreshold;
  const side = coord.x < 0.45 ? 'izquierda' : coord.x > 0.55 ? 'derecha' : 'centro';
  if (offensive && side === 'centro') return 'pivot_centro';
  if (offensive) return `ala_${side}`;
  if (side === 'centro') return 'cierre_centro';
  return `cierre_${side}`;
}

function fitScoreForProfile(player: any, profile: string): number {
  const pos = getPlayerPrimaryPosition(player);
  const side = getPlayerPreferredSide(player);
  let fit = 0;

  if (profile.startsWith('portero')) {
    if (pos.includes('portero')) fit += 100;
    else fit -= 80;
  } else if (profile.startsWith('cierre')) {
    if (pos.includes('cierre')) fit += 70;
    if (pos.includes('ala')) fit += 20;
  } else if (profile.startsWith('pivot')) {
    if (pos.includes('pivot') || pos.includes('pivot') || pos.includes('pívot')) fit += 75;
    if (pos.includes('ala')) fit += 15;
  } else if (profile.startsWith('ala')) {
    if (pos.includes('ala')) fit += 70;
    if (pos.includes('cierre')) fit += 15;
  }

  if (profile.includes('izquierda') && side.includes('izquierda')) fit += 20;
  if (profile.includes('derecha') && side.includes('derecha')) fit += 20;
  if (profile.includes('centro') && side.includes('centro')) fit += 15;
  if (!side || side === 'centro') fit += 5;

  return fit;
}

function systemRequirements(slots: SystemSlot[]) {
  return slots.reduce(
    (acc, s) => {
      acc[s.roleBase] += 1;
      return acc;
    },
    { portero: 0, cierre: 0, ala: 0, pivot: 0 } as Record<RoleBase, number>
  );
}

export default function PizarraPro({ players, setPlayers, onBack }: any) {
  const insets = useSafeAreaInsets();
  // --- SEGURIDAD: Evitar errores de carga inicial ---
  if (!players || players.length === 0) {
    return (
      <View style={[styles.mainContainer, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#FFF', marginBottom: 20 }}>Cargando plantilla...</Text>
        <TouchableOpacity style={styles.btnAction} onPress={onBack}><Text style={styles.btnText}>VOLVER</Text></TouchableOpacity>
      </View>
    );
  }
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [sisModal, setSisModal] = useState(false);
  const [stratModal, setStratModal] = useState(false);
  const [frames, setFrames] = useState<any[]>([]);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [nombreJugada, setNombreJugada] = useState('');
  const [saveModal, setSaveModal] = useState(false);
  const [biblioModal, setBiblioModal] = useState(false);
  const [modoReproduccion, setModoReproduccion] = useState(false);
  const [bucle, setBucle] = useState(false);
  const [jugadasGuardadas, setJugadasGuardadas] = useState<any[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [pausado, setPausado] = useState(false);
  const pausadoRef = useRef(false);
  const abortarRef = useRef(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const initializedDefaultRef = useRef(false);
  const [velocidad, setVelocidad] = useState(1);
  const [systemConfigModal, setSystemConfigModal] = useState(false);
  const [systemToConfigure, setSystemToConfigure] = useState<string | null>(null);
  const [selectedSystemName, setSelectedSystemName] = useState<string>(DEFAULT_SYSTEM);
  const [manualBySlot, setManualBySlot] = useState<Record<string, string>>({});
  const [drawMode, setDrawMode] = useState<'none' | 'draw' | 'arrow'>('none');
  const [drawColor, setDrawColor] = useState('#FFD54F');
  const [drawItems, setDrawItems] = useState<DrawItem[]>([]);
  const [showSequenceTrails, setShowSequenceTrails] = useState(true);
  const [activeDraw, setActiveDraw] = useState<{ points: DrawPoint[] } | null>(null);
  const drawModeRef = useRef(drawMode);
  const drawColorRef = useRef(drawColor);
  const modoReproduccionRef = useRef(modoReproduccion);

  useEffect(() => {
    // Pizarra siempre fija en vertical para evitar rotaciones accidentales.
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  useEffect(() => {
    drawColorRef.current = drawColor;
  }, [drawColor]);

  useEffect(() => {
    modoReproduccionRef.current = modoReproduccion;
  }, [modoReproduccion]);

  const pos = useRef<any>({
    ball: new Animated.ValueXY({ x: FIELD_W / 2, y: FIELD_H / 2 }),
    rival0: new Animated.ValueXY({ x: 20, y: 20 }),
    rival1: new Animated.ValueXY({ x: 60, y: 20 }),
    rival2: new Animated.ValueXY({ x: 100, y: 20 }),
    rival3: new Animated.ValueXY({ x: 140, y: 20 }),
    rival4: new Animated.ValueXY({ x: 180, y: 20 }),
  });

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const clampDrawPoint = (x: number, y: number) => ({
    x: clamp(x, 0, FIELD_W),
    y: clamp(y, 0, FIELD_H + 40),
  });

  const getTouchPoint = (evt: any) => {
    const native = evt?.nativeEvent;
    if (!native) return null;
    const x =
      typeof native.locationX === 'number'
        ? native.locationX
        : typeof native.pageX === 'number'
        ? native.pageX - FIELD_X_OFFSET
        : null;
    const y =
      typeof native.locationY === 'number'
        ? native.locationY
        : typeof native.pageY === 'number'
        ? native.pageY
        : null;
    if (x === null || y === null) return null;
    return clampDrawPoint(x, y);
  };

  const linePathFromPoints = (points: DrawPoint[]) => {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    return points.reduce((d, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${d} L ${p.x} ${p.y}`), '');
  };

  const compactPoints = (points: DrawPoint[], minStep = 3) => {
    if (points.length <= 2) return points;
    const out: DrawPoint[] = [points[0]];
    for (let i = 1; i < points.length - 1; i += 1) {
      const prev = out[out.length - 1];
      const p = points[i];
      if (Math.hypot(p.x - prev.x, p.y - prev.y) >= minStep) out.push(p);
    }
    out.push(points[points.length - 1]);
    return out;
  };

  const renderDrawItemPath = (item: DrawItem) => {
    if (item.kind === 'arrow') {
      const first = item.points[0];
      const last = item.points[item.points.length - 1];
      return first && last ? linePathFromPoints([first, last]) : '';
    }
    return linePathFromPoints(item.points);
  };

  const drawPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => drawModeRef.current !== 'none' && !modoReproduccionRef.current,
      onMoveShouldSetPanResponder: () => drawModeRef.current !== 'none' && !modoReproduccionRef.current,
      onPanResponderGrant: (evt) => {
        const p = getTouchPoint(evt);
        if (!p) return;
        setActiveDraw({ points: [p] });
      },
      onPanResponderMove: (evt) => {
        const p = getTouchPoint(evt);
        if (!p) return;
        setActiveDraw((prev) => {
          if (!prev) return prev;
          const last = prev.points[prev.points.length - 1];
          if (!last || Math.hypot(p.x - last.x, p.y - last.y) < 2) return prev;
          return { points: [...prev.points, p] };
        });
      },
      onPanResponderRelease: () => {
        setActiveDraw((prev) => {
          if (!prev || prev.points.length < 2) return null;
          const first = prev.points[0];
          const last = prev.points[prev.points.length - 1];
          const dx = last.x - first.x;
          const dy = last.y - first.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 8 && drawModeRef.current !== 'none') {
            const points =
              drawModeRef.current === 'arrow'
                ? [first, last]
                : compactPoints(prev.points, 2);
            setDrawItems((items) => [
              ...items,
              {
                points,
                color: drawColorRef.current,
                kind: drawModeRef.current === 'arrow' ? 'arrow' : 'draw',
              },
            ]);
          }
          return null;
        });
      },
      onPanResponderTerminate: () => setActiveDraw(null),
    })
  );

  const arrowHeadPath = (x1: number, y1: number, x2: number, y2: number) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 10;
    const spread = Math.PI / 7;
    const xA = x2 - len * Math.cos(angle - spread);
    const yA = y2 - len * Math.sin(angle - spread);
    const xB = x2 - len * Math.cos(angle + spread);
    const yB = y2 - len * Math.sin(angle + spread);
    return `M ${xA} ${yA} L ${x2} ${y2} L ${xB} ${yB}`;
  };

  const endpointsFromPoints = (points: DrawPoint[]) => {
    if (!points.length) return null;
    return { start: points[0], end: points[points.length - 1] };
  };

  const sequenceTrails = (() => {
    const trails: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }> = [];
    if (!showSequenceTrails || frames.length < 2) return trails;
    const maxStep = modoReproduccion ? Math.min(frameIndex, frames.length - 1) : frames.length - 1;
    if (maxStep <= 0) return trails;
    for (let i = 0; i < maxStep; i += 1) {
      const from = frames[i] || {};
      const to = frames[i + 1] || {};
      Object.keys(from).forEach((id) => {
        const a = from[id];
        const b = to[id];
        if (!a || !b) return;
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        if (Math.hypot(dx, dy) < 6) return;
        let color = 'rgba(255,255,255,0.38)';
        if (id === 'ball') color = 'rgba(255,235,59,0.65)';
        else if (id.startsWith('rival')) color = 'rgba(244,67,54,0.52)';
        else color = 'rgba(33,150,243,0.52)';
        trails.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color });
      });
    }
    return trails;
  })();
  const VELOCIDADES = [0.25, 0.5, 0.75, 1, 1.25, 1.5];
  const formatVelocidad = (v: number) => `x${String(v).replace('.', ',')}`;

  useEffect(() => {
    const cargarTodo = async () => {
      try {
        const res = await AsyncStorage.getItem('plays_v4');
        if (res) setJugadasGuardadas(JSON.parse(res));
      } catch (e) { console.log(e); }
    };
    cargarTodo();
  }, []);

  useEffect(() => {
    const normalized = players.map((p: any) => normalizePlayerRatings(p));
    const changed = normalized.some((p: any, i: number) => (
      p.valoracionIA !== players[i]?.valoracionIA || p.valoracionStaff !== players[i]?.valoracionStaff
    ));
    if (changed) {
      setPlayers(normalized);
    }
  }, [players, setPlayers]);

    const resetPizarra = () => {
    setFrames([]);
    setFrameIndex(0);
    setDrawItems([]);
    setActiveDraw(null);
    setShowSequenceTrails(true);
    Animated.spring(pos.current['ball'], {
      toValue: { x: toFieldX(0.5), y: toFieldY(0.5) },
      useNativeDriver: false
    }).start();
    aplicarSistemaAutomatico(DEFAULT_SYSTEM);
  };

  const eliminarJugada = (nombre: string) => {
    Alert.alert("Eliminar", `¿Borrar "${nombre}"?`, [
      { text: "No" },
      { text: "Sí", onPress: async () => {
          const nueva = jugadasGuardadas.filter(j => j.nombre !== nombre);
          await AsyncStorage.setItem('plays_v4', JSON.stringify(nueva));
          setJugadasGuardadas(nueva);
      }}
    ]);
  };

   const playJugada = () => {
  return new Promise(async (resolve) => {
    // Si no hay pasos guardados, no hace nada
    if (frames.length === 0) return resolve(true);

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      if (abortarRef.current) return resolve(false);

      // Si el usuario pulsa pausa, esperamos aquí
      while (pausadoRef.current) {
        if (abortarRef.current) return resolve(false);
        await new Promise(r => setTimeout(r, 100)); 
      }

      const anims = Object.keys(frame).map(id => {
        if (pos.current[id]) {
          return Animated.timing(pos.current[id], {
            toValue: { x: frame[id].x, y: frame[id].y },
            duration: 1000 / velocidad,
            useNativeDriver: false,
          });
        }
        return null;
      }).filter(a => a !== null);

      if (anims.length > 0) {
        await new Promise(r => Animated.parallel(anims).start(r));
        if (abortarRef.current) return resolve(false);
        await new Promise(r => setTimeout(r, 200 / velocidad));
      }
    }
    resolve(true);
  });
};

  const aplicarFrame = (frame: any) => {
    if (!frame) return;
    Object.keys(frame).forEach(id => {
      if (pos.current[id]) {
        pos.current[id].setValue({ x: frame[id].x, y: frame[id].y });
      }
    });
  };

  // Función mejorada para renderizar la ficha con foto o número
useEffect(() => {
    players.forEach((p: any) => {
      if (!pos.current[p.id]) {
        pos.current[p.id] = new Animated.ValueXY({ x: 30, y: FIELD_H + 10 });
        offset.current[p.id] = { x: 0, y: 0 };
      }
    });
  }, [players]);
  const offset = useRef<any>({});
  const renderFicha = (p: any, size = 40, rival = false) => (
    <View style={[styles.fichaBase, {
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: rival ? '#B71C1C' : '#1565C0',
          borderWidth: 2, borderColor: '#FFF',
        }]}>
      {!rival && p.photo ? (
        <Image 
          source={{ uri: p.photo }} 
          style={{ width: '100%', height: '100%', borderRadius: size / 2 }} 
        />
      ) : (
        <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: size * 0.4 }}>
          {rival ? 'R' : p.number ?? p.idx ?? ''}
        </Text>
      )}
    </View>
  );

  // PanResponder mejorado para un arrastre más fino y natural
  const createPan = (id: string) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      const val: any = pos.current[id];
      val.setOffset({ x: val.x._value, y: val.y._value });
      val.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: Animated.event(
      [null, { dx: pos.current[id].x, dy: pos.current[id].y }],
      { useNativeDriver: false }
    ),
    onPanResponderRelease: () => {
      pos.current[id].flattenOffset();
      
    }
  });

  const capturarFrame = () => {
    const frame: any = {};
    Object.keys(pos.current).forEach(id => {
      frame[id] = { x: pos.current[id].x._value, y: pos.current[id].y._value };
    });
    setFrames(prev => [...prev, frame]);
  };

  const guardarEnBiblioteca = async () => {
    if (!nombreJugada) { 
      Alert.alert("Error", "Pon un nombre"); 
      return; 
    }
    const persistedDrawItems = drawItems.map((d) => ({
      ...d,
      kind: d.kind === 'arrow' ? 'arrow' : 'draw',
    }));
    const nueva = { nombre: nombreJugada, frames, drawItems: persistedDrawItems };
    const nuevaLista = [...jugadasGuardadas, nueva];
    
    // Guardamos sin etiquetas de texto extra
    await AsyncStorage.setItem('plays_v4', JSON.stringify(nuevaLista));
    
    setJugadasGuardadas(nuevaLista);
    setSaveModal(false);
    setNombreJugada('');
    setFrames([]); // Reinicia el contador de pasos a 0
    setDrawItems([]);
    Alert.alert("Éxito", "Jugada guardada. El contador se ha reiniciado.");
  };

  const getSystemSlots = (systemName: string): { slots: SystemSlot[]; coords: any } => {
    const sistema = SISTEMAS_POS[systemName];
    const coords = sistema?.coords;
    if (!coords?.p?.length) return { slots: [], coords: null };
    const outfieldCoords = coords.p.slice(1);
    const slots: SystemSlot[] = [
      { key: 'portero-1', roleBase: 'portero', profile: 'portero', coord: { x: 0.5, y: PORTERO_PROPIO_Y } },
      ...outfieldCoords.map((coord: any, idx: number) => {
        const profile = getSlotProfile(systemName, idx + 1, coord, outfieldCoords);
        return { key: `${baseRoleFromProfile(profile)}-${idx + 1}`, roleBase: baseRoleFromProfile(profile), profile, coord };
      }),
    ];
    return { slots, coords };
  };

  const jugadoresDisponibles = () =>
    players
      .filter((p: any) => p?.role === 'Jugador' && p?.disponibilidad !== 'No disponible')
      .map((p: any) => normalizePlayerRatings(p));

  const candidatesForRole = (role: RoleBase, source: any[]) => {
    return source
      .filter((p: any) => {
        const pos = getPlayerPrimaryPosition(p);
        if (role === 'portero') return pos.includes('portero');
        if (role === 'cierre') return pos.includes('cierre') || pos.includes('ala');
        if (role === 'ala') return pos.includes('ala') || pos.includes('cierre');
        return pos.includes('pivot') || pos.includes('pivot') || pos.includes('ala');
      })
      .sort((a: any, b: any) => getPlayerCompositeScore(b) - getPlayerCompositeScore(a));
  };

  const applySelectedToBoard = (selected: Array<{ player: any; coord: { x: number; y: number } }>, coords: any) => {
    const selectedIds = new Set(selected.map((x) => x.player.id));
    setPlayers(players.map((p: any) => ({ ...p, onCourt: selectedIds.has(p.id) })));

    selected.forEach((entry: any) => {
      const isGoalkeeper = getPlayerPrimaryPosition(entry.player).includes('portero');
      const targetY = isGoalkeeper ? toFieldY(PORTERO_PROPIO_Y) : toFieldY(entry.coord.y);
      const targetX = isGoalkeeper ? GOAL_CENTER_X : toFieldX(entry.coord.x);
      if (pos.current[entry.player.id]) {
        Animated.spring(pos.current[entry.player.id], {
          toValue: { x: targetX, y: targetY },
          useNativeDriver: false,
        }).start();
      }
    });

    coords.r.forEach((c: any, i: number) => {
      const id = `rival${i}`;
      if (pos.current[id]) {
        Animated.spring(pos.current[id], {
          toValue: {
            x: i === 0 ? GOAL_CENTER_X : toFieldX(c.x),
            y: i === 0 ? toFieldY(PORTERO_RIVAL_Y) : toFieldY(c.y),
          },
          useNativeDriver: false,
        }).start();
      }
    });

    setMenuAbierto(false);
    setSisModal(false);
    setStratModal(false);
    setSystemConfigModal(false);
  };

  const aplicarSistemaAutomatico = (systemName: string) => {
    const { slots, coords } = getSystemSlots(systemName);
    if (!slots.length) return;
    const available = jugadoresDisponibles();
    const usedIds = new Set<string>();
    const selected: Array<{ player: any; coord: { x: number; y: number } }> = [];

    const porteroCandidates = candidatesForRole('portero', available);
    if (!porteroCandidates.length) {
      Alert.alert('Sin portero', 'No hay portero disponible. El sistema no se puede aplicar.');
      return;
    }

    slots.forEach((slot) => {
      const rolePool = candidatesForRole(slot.roleBase, available).filter((p: any) => !usedIds.has(p.id));
      const best = rolePool
        .map((p: any) => ({ player: p, score: getPlayerCompositeScore(p) + fitScoreForProfile(p, slot.profile) }))
        .sort((a: any, b: any) => b.score - a.score)[0]?.player || null;
      if (best) {
        usedIds.add(best.id);
        selected.push({ player: best, coord: slot.coord });
      }
    });

    applySelectedToBoard(selected, coords);
  };

  const abrirConfiguracionSistema = (systemName: string) => {
    const { slots } = getSystemSlots(systemName);
    if (!slots.length) return;
    setSelectedSystemName(systemName);
    setSystemToConfigure(systemName);

    // Precarga selección manual con la opción automática para acelerar ajustes.
    const available = jugadoresDisponibles();
    const preload: Record<string, string> = {};
    const usedIds = new Set<string>();
    slots.forEach((slot) => {
      const rolePool = candidatesForRole(slot.roleBase, available).filter((p: any) => !usedIds.has(p.id));
      const best = rolePool
        .map((p: any) => ({ player: p, score: getPlayerCompositeScore(p) + fitScoreForProfile(p, slot.profile) }))
        .sort((a: any, b: any) => b.score - a.score)[0]?.player || null;
      if (best) {
        preload[slot.key] = best.id;
        usedIds.add(best.id);
      }
    });
    setManualBySlot(preload);
    setSisModal(false);
    setSystemConfigModal(true);
  };

  const aplicarSistemaManual = () => {
    if (!systemToConfigure) return;
    const { slots, coords } = getSystemSlots(systemToConfigure);
    const available = jugadoresDisponibles();
    const availableById = new Map(available.map((p: any) => [p.id, p]));
    const selected: Array<{ player: any; coord: { x: number; y: number } }> = [];
    const usedIds = new Set<string>();

    for (const slot of slots) {
      const chosenId = manualBySlot[slot.key];
      if (!chosenId) continue;
      if (usedIds.has(chosenId)) {
        Alert.alert('Selección inválida', 'Un jugador no puede ocupar dos plazas.');
        return;
      }
      const p = availableById.get(chosenId);
      if (!p) continue;
      if (slot.roleBase === 'portero' && !getPlayerPrimaryPosition(p).includes('portero')) {
        Alert.alert('Portería inválida', 'En portería solo puede ir un portero.');
        return;
      }
      usedIds.add(chosenId);
      selected.push({ player: p, coord: slot.coord });
    }

    const hasGoalkeeper = selected.some((s) => getPlayerPrimaryPosition(s.player).includes('portero'));
    if (!hasGoalkeeper) {
      Alert.alert('Sin portero', 'Debes seleccionar un portero para la portería.');
      return;
    }

    applySelectedToBoard(selected, coords);
  };

  const aplicarPosicionesLibres = (coords: any) => {
    const jugadoresEnCampo = players.filter((p: any) => p.onCourt);
    const portero = jugadoresEnCampo.find((p: any) => getPlayerPrimaryPosition(p).includes('portero'));
    const resto = jugadoresEnCampo.filter((p: any) => p.id !== portero?.id);

    if (portero && pos.current[portero.id]) {
      Animated.spring(pos.current[portero.id], {
        toValue: { x: GOAL_CENTER_X, y: toFieldY(PORTERO_PROPIO_Y) },
        useNativeDriver: false,
      }).start();
    }

    const campoCoords = (coords?.p || []).slice(1); // reserva p[0] para portero anclado
    resto.forEach((p: any, i: number) => {
      const c = campoCoords[i] || coords.p[i + 1];
      if (c && pos.current[p.id]) {
        Animated.spring(pos.current[p.id], {
          toValue: { x: toFieldX(c.x), y: toFieldY(c.y) },
          useNativeDriver: false,
        }).start();
      }
    });
    coords.r.forEach((c: any, i: number) => {
      const id = `rival${i}`;
      if (pos.current[id]) {
        Animated.spring(pos.current[id], {
          toValue: {
            x: i === 0 ? GOAL_CENTER_X : toFieldX(c.x),
            y: i === 0 ? toFieldY(PORTERO_RIVAL_Y) : toFieldY(c.y),
          },
          useNativeDriver: false,
        }).start();
      }
    });
    setMenuAbierto(false);
    setSisModal(false);
    setStratModal(false);
  };

  useEffect(() => {
    if (!initializedDefaultRef.current && players.length > 0) {
      initializedDefaultRef.current = true;
      aplicarSistemaAutomatico(DEFAULT_SYSTEM);
    }
  }, [players]);
  // --- LÓGICA DE REPRODUCCIÓN CORREGIDA ---

  const iniciarReproduccion = async () => {
    if (frames.length === 0) { Alert.alert("Aviso", "No hay pasos grabados"); return; }
    
    setModoReproduccion(true); // Asegura que se vean los botones
    setReproduciendo(true);
    setPausado(false);
    pausadoRef.current = false;
    abortarRef.current = false;

    // Si estamos al final, reiniciamos
    let inicio = frameIndex;
    if (frameIndex >= frames.length - 1) {
      inicio = 0;
      setFrameIndex(0);
      aplicarFrame(frames[0]);
      await new Promise(r => setTimeout(r, 500)); // Pequeña espera visual
    }

    do {
      for (let i = inicio; i < frames.length; i++) {
        // Chequeo de Stop/Salida
        if (abortarRef.current) break;

        setFrameIndex(i); // Actualiza el contador visual
        
        // Lógica de PAUSA
        while (pausadoRef.current) {
          if (abortarRef.current) break;
          await new Promise(r => setTimeout(r, 200));
        }

        const frame = frames[i];
        
        // Animación suave hacia el siguiente paso
        const anims = Object.keys(frame).map(id => {
          if (pos.current[id]) {
            return Animated.timing(pos.current[id], {
              toValue: { x: frame[id].x, y: frame[id].y },
              duration: 1000 / velocidad, // Ajusta la velocidad aquí
              useNativeDriver: false
            });
          }
          return null;
        }).filter(Boolean);

        if (anims.length > 0) {
          // Ejecutar animación y esperar a que termine
          await new Promise(r => Animated.parallel(anims).start(r));
        }
      }
      
      // Si el bucle está activado y no se ha dado a STOP, repetir desde 0
      if (bucle && !abortarRef.current) {
        inicio = 0;
        setFrameIndex(0);
        aplicarFrame(frames[0]);
      }
      
    } while (bucle && !abortarRef.current);

    setReproduciendo(false);
  };

  const pausarJugada = () => {
    setPausado(true);
    pausadoRef.current = true;
    setReproduciendo(false); // Para cambiar el icono a Play
  };

  const siguientePasoManual = () => {
    // Si no estamos en modo reproducción, entramos para ver los controles
    if (!modoReproduccion) setModoReproduccion(true);

    if (frameIndex < frames.length - 1) {
      const next = frameIndex + 1;
      setFrameIndex(next);
      // Mueve las fichas instantáneamente (sin animación lenta) para paso a paso
      Animated.parallel(
        Object.keys(frames[next]).map(id => {
           if (pos.current[id]) {
             return Animated.spring(pos.current[id], {
               toValue: frames[next][id],
               useNativeDriver: false
             });
           }
           return null;
        }).filter((x): x is Animated.CompositeAnimation => x !== null)
      ).start();
    } else {
      Alert.alert("Fin", "Último paso alcanzado");
    }
  };

  const detenerDefinitivamente = () => {
    abortarRef.current = true;
    pausadoRef.current = false;
    setReproduciendo(false);
    setPausado(false);
    setFrameIndex(0);
    if (frames.length > 0) aplicarFrame(frames[0]);
  };

  const salirReproduccion = () => {
    detenerDefinitivamente();
    setModoReproduccion(false); // Oculta los botones de play/pause
    resetPizarra(); // Vuelve a la posición inicial
  };
  // --- LÓGICA DE PERSISTENCIA AL CAMBIAR ESTADO 'onCourt' [cite: 2025-12-26] ---
  const togglePlayerOnCourt = (id: string) => {
    const updatedPlayers = players.map((p: any) => {
      if (p.id === id) {
        if (p.disponibilidad === 'No disponible') {
          Alert.alert("No disponible", "Este jugador está marcado como no disponible.");
          return p;
        }
        // Lógica de máximo 5 jugadores en pista para los 11 sistemas [cite: 2026-01-01]
        const count = players.filter((x: any) => x.onCourt).length;
        if (!p.onCourt && count >= 5) {
          Alert.alert("Límite", "Solo puede haber 5 jugadores en pista");
          return p;
        }
        return { ...p, onCourt: !p.onCourt };
      }
      return p;
    });
    setPlayers(updatedPlayers); // Esto guarda en AsyncStorage vía App.tsx
  };

  const openDisponibilidadSelector = (playerId: string) => {
    Alert.alert(
      'Disponibilidad del jugador',
      'Selecciona el estado para este jugador',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Disponible',
          onPress: () => {
            setPlayers(players.map((p: any) => (
              p.id === playerId ? { ...p, disponibilidad: 'Garantizado' } : p
            )));
          }
        },
        {
          text: 'No disponible',
          style: 'destructive',
          onPress: () => {
            setPlayers(players.map((p: any) => (
              p.id === playerId ? { ...p, disponibilidad: 'No disponible', onCourt: false } : p
            )));
          }
        },
      ]
    );
  };

  const configuredSystem = systemToConfigure ? SISTEMAS_POS[systemToConfigure] : null;
  const configuredSlots = systemToConfigure ? getSystemSlots(systemToConfigure).slots : [];
  const configuredRequirements = systemRequirements(configuredSlots);
  const configuredPlayers = jugadoresDisponibles();
  const availableByRole = {
    portero: candidatesForRole('portero', configuredPlayers),
    cierre: candidatesForRole('cierre', configuredPlayers),
    ala: candidatesForRole('ala', configuredPlayers),
    pivot: candidatesForRole('pivot', configuredPlayers),
  };
  const activeDrawEnds = activeDraw ? endpointsFromPoints(activeDraw.points) : null;
  return (
    <SafeAreaView style={styles.mainContainer}>
      <View style={styles.sideBench}>
        <TouchableOpacity style={styles.btnAction} onPress={() => setMenuAbierto(true)}>
          <Text style={styles.btnText}>MENU</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnAction} onPress={resetPizarra}>
          <Text style={styles.btnText}>LIMPIAR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnAction, { backgroundColor: '#D32F2F' }]} onPress={onBack}>
          <Text style={styles.btnText}>◀</Text>
        </TouchableOpacity>
        <ScrollView>
          {players.map((p: any) => (
            <TouchableOpacity
              key={p.id}
              style={styles.benchItem}
              onLongPress={() => openDisponibilidadSelector(p.id)}
              delayLongPress={350}
              onPress={() => {
                if (p.disponibilidad === 'No disponible') {
                  Alert.alert("No disponible", "Este jugador no puede salir a pista.");
                  return;
                }
                const count = players.filter((x: any) => x.onCourt).length;
                if (!p.onCourt && count >= 5) return;
                setPlayers(players.map((x: any) => (x.id === p.id ? { ...x, onCourt: !x.onCourt } : x)));
              }}
            >
              <View style={p.disponibilidad === 'No disponible' ? styles.unavailableFrame : undefined}>
                {renderFicha(p, 35)}
                {p.onCourt && <View style={styles.onCourtDot} />}
              </View>
              <Text style={[styles.benchName, p.disponibilidad === 'No disponible' && styles.benchNameUnavailable]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.fieldArea}>
        <Svg width={FIELD_W} height={FIELD_H + 40}>
          <Rect y={FIELD_TOP_OFFSET} width={FIELD_W} height={FIELD_H} fill="#1B5E20" stroke="#FFF" strokeWidth={2} />
          <Rect x={FIELD_W / 2 - GOAL_DRAW_WIDTH / 2} y={FIELD_TOP_OFFSET - GOAL_DRAW_DEPTH} width={GOAL_DRAW_WIDTH} height={GOAL_DRAW_DEPTH} fill="none" stroke="#FFF" strokeWidth={2} />
          <Path d={`M ${FIELD_W/2 - SEIS_METROS} ${FIELD_TOP_OFFSET} A ${SEIS_METROS} ${SEIS_METROS} 0 0 0 ${FIELD_W/2 + SEIS_METROS} ${FIELD_TOP_OFFSET}`} fill="none" stroke="#FFF" strokeWidth={2} />
          <Circle cx={FIELD_W/2} cy={FIELD_TOP_OFFSET + SEIS_METROS} r={2} fill="#FFF" />
          <Circle cx={FIELD_W/2} cy={FIELD_TOP_OFFSET + DIEZ_METROS} r={2} fill="#FFF" />
          
          <Line x1={0} y1={FIELD_TOP_OFFSET + OCHO_METROS} x2={FIELD_W} y2={FIELD_TOP_OFFSET + OCHO_METROS} stroke="rgba(255,255,255,0.5)" strokeDasharray="5,5" strokeWidth={2} />

          <Rect x={FIELD_W / 2 - GOAL_DRAW_WIDTH / 2} y={FIELD_H + FIELD_TOP_OFFSET} width={GOAL_DRAW_WIDTH} height={GOAL_DRAW_DEPTH} fill="none" stroke="#FFF" strokeWidth={2} />
          <Path d={`M ${FIELD_W/2 - SEIS_METROS} ${FIELD_H + FIELD_TOP_OFFSET} A ${SEIS_METROS} ${SEIS_METROS} 0 0 1 ${FIELD_W/2 + SEIS_METROS} ${FIELD_H + FIELD_TOP_OFFSET}`} fill="none" stroke="#FFF" strokeWidth={2} />
          <Circle cx={FIELD_W/2} cy={FIELD_H + FIELD_TOP_OFFSET - SEIS_METROS} r={2} fill="#FFF" />
          <Circle cx={FIELD_W/2} cy={FIELD_H + FIELD_TOP_OFFSET - DIEZ_METROS} r={2} fill="#FFF" />

          <Line x1={0} y1={FIELD_H + FIELD_TOP_OFFSET - OCHO_METROS} x2={FIELD_W} y2={FIELD_H + FIELD_TOP_OFFSET - OCHO_METROS} stroke="rgba(255,255,255,0.5)" strokeDasharray="5,5" strokeWidth={2} />
          <Line x1={0} y1={FIELD_H / 2 + FIELD_TOP_OFFSET} x2={FIELD_W} y2={FIELD_H / 2 + FIELD_TOP_OFFSET} stroke="#FFF" strokeWidth={2} />
          <Circle cx={FIELD_W / 2} cy={FIELD_H / 2 + FIELD_TOP_OFFSET} r={3 * m} fill="none" stroke="#FFF" strokeWidth={2} />

        </Svg>
        <View
          style={styles.fieldTouchLayer}
          pointerEvents={drawMode === 'none' ? 'none' : 'auto'}
          {...drawPanResponder.current.panHandlers}
        />

        
{/* 1. Jugadores del equipo - PROTECCIÓN TOTAL */}
{players && players.filter((p: any) => p && p.onCourt).map((p: any) => {
  // Verificamos que el jugador tenga una posición asignada en el objeto de animaciones
  if (!pos.current || !pos.current[p.id]) return null;

  return (
    <Animated.View 
      key={`player-node-${p.id}`} 
      {...createPan(p.id).panHandlers} 
      style={[
        styles.pNode, 
        { transform: pos.current[p.id].getTranslateTransform() }
      ]}
    >
      {renderFicha(p, 40)}
    </Animated.View>
  );
})}

{/* 2. Rivales (Asegúrate de que también tengan validación) */}
{Array.from({ length: 5 }).map((_, i) => {
  const id = `rival${i}`;
  if (!pos.current[id]) return null;

  return (
    <Animated.View 
      key={`rival-node-${i}`} 
      {...createPan(id).panHandlers} 
      style={[styles.pNode, { transform: pos.current[id].getTranslateTransform() }]}
    >
      {renderFicha({ idx: i }, 24, true)}
    </Animated.View>
  );
})}

        {pos.current['ball'] && (
          <Animated.View {...createPan('ball').panHandlers} style={[styles.pNode, { transform: pos.current['ball'].getTranslateTransform() }]}>
            <Text style={{ fontSize: 18 }}>⚽</Text>
          </Animated.View>
        )}

        <Svg style={styles.drawOverlay} width={FIELD_W} height={FIELD_H + 40} pointerEvents="none">
          {sequenceTrails.map((t, i) => (
            <Line
              key={`trail-${i}`}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.color}
              strokeWidth={4}
              strokeLinecap="round"
            />
          ))}
          {drawItems.map((d, i) => {
            const path = renderDrawItemPath(d);
            const ends = endpointsFromPoints(d.points);
            return (
              <React.Fragment key={`draw-${i}`}>
                <Path d={path} fill="none" stroke={d.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                {d.kind === 'arrow' && ends ? (
                  <Path
                    d={arrowHeadPath(ends.start.x, ends.start.y, ends.end.x, ends.end.y)}
                    fill="none"
                    stroke={d.color}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
              </React.Fragment>
            );
          })}
          {activeDraw ? (
            <>
              <Path
                d={drawMode === 'arrow' ? linePathFromPoints([activeDraw.points[0], activeDraw.points[activeDraw.points.length - 1]]) : linePathFromPoints(activeDraw.points)}
                fill="none"
                stroke={drawColor}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {drawMode === 'arrow' && activeDrawEnds ? (
                <Path
                  d={arrowHeadPath(activeDrawEnds.start.x, activeDrawEnds.start.y, activeDrawEnds.end.x, activeDrawEnds.end.y)}
                  fill="none"
                  stroke={drawColor}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </>
          ) : null}
        </Svg>
      </View>

      <View style={[styles.compactControls, { bottom: Math.max(insets.bottom + 8, 16) }]}>
        <View style={styles.actionRow}>
          {/* MODO EDICIÓN: Capturar, Guardar y PROBAR */}
          {!modoReproduccion ? (
            <>
              <TouchableOpacity style={styles.cBtn} onPress={capturarFrame}>
                <Text style={styles.cText}>📸 ({frames.length})</Text>
              </TouchableOpacity>
              
              {/* NUEVO BOTÓN PARA ENTRAR A REPRODUCIR LO QUE ACABAS DE HACER */}
              <TouchableOpacity 
                style={[styles.cBtn, { backgroundColor: frames.length > 0 ? '#4CAF50' : '#333' }]} 
                onPress={() => {
                   if(frames.length > 0) {
                     setModoReproduccion(true);
                     aplicarFrame(frames[0]);
                   } else {
                     Alert.alert("Vacío", "Graba algún paso primero");
                   }
                }}
              >
                <Text style={styles.cText}>▶ PROBAR</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.cBtn, { backgroundColor: frames.length > 0 ? '#FF9800' : '#333' }]} 
                onPress={() => frames.length > 0 && setSaveModal(true)}
              >
                <Text style={styles.cText}>💾 GUARDAR</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* MODO REPRODUCCIÓN: Play/Pause, Stop, Paso, Salir */
            <>
              {/* Botón PLAY / PAUSA */}
              <TouchableOpacity 
                style={[styles.cBtn, { backgroundColor: reproduciendo ? '#FFC107' : '#4CAF50', minWidth: 72 }]} 
                onPress={reproduciendo ? pausarJugada : iniciarReproduccion}
              >
                <Text style={[styles.cText, { fontSize: 16 }]}>{reproduciendo ? '⏸' : '▶'}</Text>
              </TouchableOpacity>

              {/* Botón STOP (Reinicia al paso 0) */}
              <TouchableOpacity style={[styles.cBtn, { backgroundColor: '#D32F2F', minWidth: 50 }]} onPress={detenerDefinitivamente}>
                <Text style={styles.cText}>⏹</Text>
              </TouchableOpacity>

              {/* Botón PASO A PASO */}
              <TouchableOpacity style={[styles.cBtn, { backgroundColor: '#2196F3', minWidth: 50 }]} onPress={siguientePasoManual}>
                <Text style={styles.cText}>⏭ (+1)</Text>
              </TouchableOpacity>
              
              {/* Botón BUCLE */}
              <TouchableOpacity 
                style={[styles.cBtn, { backgroundColor: bucle ? '#E91E63' : '#444', minWidth: 40 }]} 
                onPress={() => setBucle(!bucle)}
              >
                <Text style={styles.cText}>🔄</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        {!modoReproduccion ? (
          <View style={styles.actionRowSecondary}>
            <TouchableOpacity
              style={[styles.cBtnSmall, drawMode === 'draw' && styles.cBtnSmallActive]}
              onPress={() => setDrawMode(drawMode === 'draw' ? 'none' : 'draw')}
            >
              <Text style={styles.cText}>DIBUJO</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cBtnSmall, drawMode === 'arrow' && styles.cBtnSmallActive]}
              onPress={() => setDrawMode(drawMode === 'arrow' ? 'none' : 'arrow')}
            >
              <Text style={[styles.cText, { fontSize: 14, fontWeight: '900', lineHeight: 16 }]}>↗</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cBtnSmall, { backgroundColor: '#FFD54F' }, drawColor === '#FFD54F' && styles.colorBtnActive]}
              onPress={() => setDrawColor('#FFD54F')}
            >
              <Text style={[styles.cText, { color: '#111' }]}>AM</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cBtnSmall, { backgroundColor: '#4DA3FF' }, drawColor === '#4DA3FF' && styles.colorBtnActive]}
              onPress={() => setDrawColor('#4DA3FF')}
            >
              <Text style={styles.cText}>AZ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cBtnSmall, { backgroundColor: '#EF5350' }, drawColor === '#EF5350' && styles.colorBtnActive]}
              onPress={() => setDrawColor('#EF5350')}
            >
              <Text style={styles.cText}>RO</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cBtnSmall}
              onPress={() => setDrawItems((prev) => prev.slice(0, -1))}
            >
              <Text style={styles.cText}>ULTIMA</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cBtnSmall, { backgroundColor: '#D32F2F' }]}
              onPress={() => {
                setDrawItems([]);
                setActiveDraw(null);
              }}
            >
              <Text style={styles.cText}>BORRAR TODO</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {modoReproduccion ? (
          <>
            <View style={[styles.actionRowSecondary, { marginTop: 2 }]}>
              {VELOCIDADES.map((v) => (
                <TouchableOpacity
                  key={`spd-${v}`}
                  style={[styles.cBtnSpeed, velocidad === v && styles.cBtnSmallActive]}
                  onPress={() => setVelocidad(v)}
                >
                  <Text style={styles.cText}>{formatVelocidad(v)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.actionRowTertiary, { marginTop: 2 }]}>
              <TouchableOpacity
                style={[styles.cBtnTertiary, { backgroundColor: '#6D4C41' }]}
                onPress={() => setShowSequenceTrails((v) => !v)}
              >
                <Text style={styles.cText}>{showSequenceTrails ? 'RASTRO OFF' : 'RASTRO ON'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cBtnTertiary, { backgroundColor: '#333' }]} onPress={salirReproduccion}>
                <Text style={styles.cText}>SALIR</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
        
        {/* Barra de progreso visual opcional */}
        {modoReproduccion && frames.length > 0 && (
           <View style={{ width: '100%', height: 4, backgroundColor: '#333', marginTop: 10, borderRadius: 2 }}>
             <View style={{ 
               width: `${((frameIndex + 1) / frames.length) * 100}%`, 
               height: '100%', 
               backgroundColor: '#2196F3' 
             }} />
           </View>
        )}
      </View>

      {/* MODALES */}
      <Modal visible={menuAbierto} transparent>
        <View style={styles.overlay}>
          <View style={styles.mContent}>
            <Text style={styles.mT}>MENÚ</Text>
            <TouchableOpacity style={styles.btnC} onPress={() => { setSelectedSystemName(DEFAULT_SYSTEM); setSisModal(true); setMenuAbierto(false); }}><Text style={{ color: '#FFF' }}>SISTEMAS</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnC} onPress={() => { setStratModal(true); setMenuAbierto(false); }}><Text style={{ color: '#FFF' }}>ESTRATEGIAS</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnC} onPress={() => { setBiblioModal(true); setMenuAbierto(false); }}><Text style={{ color: '#FFF' }}>BIBLIOTECA</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnC, { backgroundColor: '#D32F2F' }]} onPress={() => setMenuAbierto(false)}><Text style={{ color: '#FFF' }}>CERRAR</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={sisModal} transparent animationType="slide">
        <View style={[styles.sisModalContainer, { paddingTop: Math.max(insets.top + 6, 12), paddingBottom: Math.max(insets.bottom + 8, 14) }]}>
          <View style={styles.sisContent}>
            <Text style={styles.mT}>SISTEMAS DE JUEGO</Text>
            <View style={styles.systemsListBox}>
              <FlatList
                style={{ width: '100%' }}
                data={Object.keys(SISTEMAS_POS)}
                keyExtractor={(item) => item}
                contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 2 }}
                showsVerticalScrollIndicator
                nestedScrollEnabled
                renderItem={({ item: k }) => (
                  <TouchableOpacity
                    style={[styles.cardDetalle, selectedSystemName === k && styles.cardDetalleSelected]}
                    onPress={() => abrirConfiguracionSistema(k)}
                  >
                    <Text style={styles.cardTituloPrincipal}>{k}</Text>
                    <Text style={styles.infoText}><Text style={styles.infoLabel}>Situación: </Text>{SISTEMAS_POS[k].situacion}</Text>
                    <Text style={styles.infoText}><Text style={styles.infoLabel}>Estructura: </Text>{SISTEMAS_POS[k].estructura}</Text>
                    <Text style={styles.infoText}><Text style={styles.infoLabel}>Roles: </Text>{SISTEMAS_POS[k].roles}</Text>
                    <Text style={[styles.infoText, { color: '#4CAF50', fontWeight: 'bold' }]}>{SISTEMAS_POS[k].cuando}</Text>
                    <Text style={styles.infoReact}>{SISTEMAS_POS[k].reaccion}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
            <View style={{ width: '100%', paddingTop: 8, paddingBottom: Math.max(insets.bottom, 4) }}>
              <TouchableOpacity style={[styles.btnC, { backgroundColor: '#D32F2F', width: '100%', marginTop: 0 }]} onPress={() => setSisModal(false)}>
                <Text style={{ color: '#FFF' }}>CERRAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={systemConfigModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.systemConfigShell}>
            <View style={styles.systemConfigBox}>
              <Text style={styles.mT}>CONFIGURAR {systemToConfigure || 'SISTEMA'}</Text>
              {configuredSystem ? (
                <ScrollView
                  style={styles.systemConfigScroll}
                  contentContainerStyle={styles.systemConfigScrollContent}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                  scrollEnabled
                  alwaysBounceVertical
                >
                  <Text style={[styles.infoText, { marginBottom: 6 }]}>
                    <Text style={styles.infoLabel}>Alineación ideal: </Text>
                    {systemToConfigure || '-'}
                  </Text>
                  <Text style={styles.infoText}>
                    <Text style={styles.infoLabel}>Necesidades: </Text>
                    {`Portero ${configuredRequirements.portero} · Cierre ${configuredRequirements.cierre} · Ala ${configuredRequirements.ala} · Pívot ${configuredRequirements.pivot}`}
                  </Text>
                  <Text style={[styles.infoText, { marginBottom: 10 }]}>
                    Puedes elegir manualmente cada plaza o aplicar asignación automática por valoración.
                  </Text>

                  {(Object.keys(availableByRole) as RoleBase[]).map((role) => (
                    <View key={`avail-${role}`} style={styles.availabilityBox}>
                      <Text style={styles.infoLabel}>{roleLabel(role)}s disponibles:</Text>
                      <Text style={styles.availabilityTxt}>
                        {availableByRole[role].length
                          ? availableByRole[role].map((p: any) => `${p.name} (S${p.valoracionStaff ?? 3}/I${p.valoracionIA ?? 3})`).join(' · ')
                          : 'Ninguno'}
                      </Text>
                    </View>
                  ))}

                  {configuredSlots.map((slot, idx) => {
                    const list = availableByRole[slot.roleBase];
                    return (
                      <View key={`slot-${idx}-${slot.key}`} style={styles.slotCard}>
                        <Text style={styles.infoLabel}>
                          {`Plaza ${idx + 1}: ${roleLabel(slot.roleBase)} (${slot.profile.replace('_', ' ')})`}
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                          {list.map((p: any) => {
                            const active = manualBySlot[slot.key] === p.id;
                            return (
                              <TouchableOpacity
                                key={`pick-${slot.key}-${p.id}`}
                                style={[styles.pickChip, active && styles.pickChipActive]}
                                onPress={() =>
                                  setManualBySlot((prev) => ({
                                    ...prev,
                                    [slot.key]: prev[slot.key] === p.id ? '' : p.id,
                                  }))
                                }
                              >
                                <Text style={[styles.pickChipTxt, active && styles.pickChipTxtActive]}>
                                  {`${p.name} (${p.valoracionStaff ?? 3}/${p.valoracionIA ?? 3})`}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={styles.infoText}>No hay datos del sistema seleccionado.</Text>
                </View>
              )}
            </View>
            <View style={[styles.systemConfigActionsBar, { paddingBottom: Math.max(insets.bottom + 8, 14) }]}> 
              <TouchableOpacity
                style={[styles.btnC, { backgroundColor: '#2E7D32', width: '100%', marginTop: 0 }]}
                onPress={() => systemToConfigure && aplicarSistemaAutomatico(systemToConfigure)}
              >
                <Text style={{ color: '#FFF' }}>AUTOASIGNAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnC, { backgroundColor: '#1565C0', width: '100%' }]}
                onPress={aplicarSistemaManual}
              >
                <Text style={{ color: '#FFF' }}>APLICAR MANUAL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnC, { backgroundColor: '#D32F2F', width: '100%' }]}
                onPress={() => setSystemConfigModal(false)}
              >
                <Text style={{ color: '#FFF' }}>CERRAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={stratModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.mContentFull}>
            <Text style={styles.mT}>ESTRATEGIAS (ABP)</Text>
            <ScrollView style={{ marginBottom: 10 }}>
              {ESTRATEGIAS_FULL.map((e, i) => (
                <TouchableOpacity key={i} style={[styles.cardDetalle, { borderColor: '#FF9800' }]} onPress={() => aplicarPosicionesLibres(e.coords)}>
                  <Text style={[styles.cardTituloPrincipal, { color: '#FF9800' }]}>{e.name}</Text>
                  <Text style={styles.infoText}><Text style={styles.infoLabel}>Situación: </Text>{e.situacion}</Text>
                  <Text style={styles.infoText}><Text style={styles.infoLabel}>Roles: </Text>{e.roles}</Text>
                  <Text style={[styles.infoText, { color: '#4CAF50' }]}>{e.cuando}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.btnC, { backgroundColor: '#D32F2F', width: '100%' }]} onPress={() => setStratModal(false)}><Text style={{ color: '#FFF' }}>VOLVER</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={biblioModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.mContentFull}>
            <Text style={styles.mT}>MIS JUGADAS GUARDADAS</Text>
            <ScrollView style={{ width: '100%' }}>
              {jugadasGuardadas.map((j, index) => (
                <View key={`jugada-${index}`} style={styles.cardJugada}>
                  <TouchableOpacity 
  style={{ flex: 1 }} 
 onPress={() => {
  // Reset TOTAL
  abortarRef.current = false;
  pausadoRef.current = false;

  setFrames(j.frames);
  setDrawItems(Array.isArray(j.drawItems) ? j.drawItems : []);
  setFrameIndex(0);

  setReproduciendo(false);
  setPausado(false);
  setModoReproduccion(true);

  setBiblioModal(false);

  // Colocar primer frame
  if (j.frames?.length > 0) {
    aplicarFrame(j.frames[0]);
  }
}}

>
  <Text style={styles.cardT}>{j.nombre}</Text>
  <Text style={{ color: '#888', fontSize: 10 }}>{j.frames?.length || 0} pasos</Text>
</TouchableOpacity>
                  <TouchableOpacity style={styles.btnEliminar} onPress={() => eliminarJugada(j.nombre)}><Text style={{ color: '#FFF' }}>×</Text></TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.btnC, { marginTop: 10, width: '100%' }]} onPress={() => setBiblioModal(false)}><Text style={{ color: '#FFF' }}>CERRAR</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={saveModal} transparent>
        <View style={styles.overlay}>
          <View style={styles.mContent}>
            <Text style={styles.mT}>GUARDAR JUGADA</Text>
            <TextInput value={nombreJugada} onChangeText={setNombreJugada} placeholder="Nombre" placeholderTextColor="#AAA" style={styles.input} />
            <TouchableOpacity style={styles.btnC} onPress={guardarEnBiblioteca}><Text style={{ color: '#FFF' }}>GUARDAR</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnC} onPress={() => setSaveModal(false)}><Text style={{ color: '#FFF' }}>CANCELAR</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#000', flexDirection: 'row' },
  sideBench: { width: BENCH_W, backgroundColor: '#111', alignItems: 'center', paddingTop: 10 },
  fieldArea: { flex: 1, justifyContent: 'flex-start', alignItems: 'center', paddingTop: 2 },
  fieldTouchLayer: { position: 'absolute', top: 20, left: FIELD_X_OFFSET, width: FIELD_W, height: FIELD_H + 40, zIndex: 40 },
  drawOverlay: { position: 'absolute', top: 0, left: FIELD_X_OFFSET, zIndex: 30 },
  btnAction: { backgroundColor: '#444', width: 55, height: 30, justifyContent: 'center', alignItems: 'center', borderRadius: 5, marginBottom: 10 },
  btnText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  benchItem: { marginBottom: 15, alignItems: 'center' },
  benchName: { color: '#AAA', fontSize: 8, width: 60, textAlign: 'center' },
  benchNameUnavailable: { color: '#FF8A80' },
  unavailableFrame: {
    backgroundColor: '#B71C1C',
    borderWidth: 2,
    borderColor: '#FFCDD2',
    borderRadius: 4,
    padding: 2,
  },
  fichaBase: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  onCourtDot: { position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#4CAF50' },
  pNode: { position: 'absolute', width: 40, height: 40, left: -20, top: -20, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  compactControls: {
    backgroundColor: 'rgba(20,20,20,0.95)', 
    borderRadius: 15, 
    paddingHorizontal: 6,
    paddingVertical: 6,
    position: 'absolute', 
    bottom: 4,
    left: BENCH_W + 4,
    right: 8,
    borderWidth: 1,
    borderColor: '#444',
    elevation: 5 // Para que resalte sobre el campo
  },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', flexWrap: 'wrap' },
  actionRowSecondary: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  actionRowTertiary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  cBtn: { backgroundColor: '#2196F3', paddingVertical: 5, paddingHorizontal: 6, borderRadius: 6, minWidth: 44, alignItems: 'center', marginBottom: 4, marginRight: 4 },
  cBtnSmall: { backgroundColor: '#333', paddingVertical: 5, paddingHorizontal: 6, borderRadius: 6, minWidth: 42, alignItems: 'center', marginBottom: 4, marginRight: 4 },
  cBtnSpeed: { backgroundColor: '#333', paddingVertical: 4, paddingHorizontal: 5, borderRadius: 6, minWidth: 34, alignItems: 'center', marginBottom: 4, marginRight: 3 },
  cBtnTertiary: { flex: 1, backgroundColor: '#333', paddingVertical: 5, borderRadius: 6, alignItems: 'center', marginBottom: 4, marginHorizontal: 2 },
  cBtnSmallActive: { backgroundColor: '#2E7D32' },
  colorBtnActive: { borderWidth: 2, borderColor: '#FFF' },
  cText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  sisModalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', paddingHorizontal: 10 },
  sisContent: { width: '100%', flex: 1, backgroundColor: '#1A1A1A', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  systemsListBox: { width: '100%', height: Math.max(306, Math.min(SCREEN_H * 0.51, 440)) },
  mContent: { width: '85%', backgroundColor: '#1A1A1A', borderRadius: 20, padding: 25, borderWidth: 1, borderColor: '#333' },
  mContentFull: { width: '92%', height: '92%', backgroundColor: '#1A1A1A', borderRadius: 20, paddingHorizontal: 20, paddingTop: 20, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  systemConfigShell: { width: '92%', height: '86%', alignItems: 'center' },
  systemConfigBox: { width: '100%', height: '46%', backgroundColor: '#1A1A1A', borderRadius: 20, paddingHorizontal: 18, paddingTop: 14, borderWidth: 1, borderColor: '#333' },
  systemConfigScroll: { width: '100%', flex: 1, minHeight: 0 },
  systemConfigScrollContent: { paddingBottom: 140 },
  systemConfigActionsBar: { width: '100%', height: '34%', marginTop: 8, backgroundColor: '#1A1A1A', borderRadius: 12, paddingHorizontal: 12, paddingTop: 8, borderWidth: 1, borderColor: '#333', justifyContent: 'flex-start' },
  mT: { color: '#FFF', fontWeight: 'bold', marginBottom: 15, textAlign: 'center', fontSize: 16 },
  btnC: { backgroundColor: '#2196F3', paddingVertical: 10, borderRadius: 8, marginTop: 10, alignItems: 'center', width: '100%' },
  input: { backgroundColor: '#111', borderRadius: 8, padding: 10, color: '#FFF', marginBottom: 10 },
  cardDetalle: { backgroundColor: '#262626', borderRadius: 10, padding: 12, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#2196F3', width: '100%' },
  cardDetalleSelected: { borderColor: '#4CAF50', borderWidth: 1.5, borderLeftColor: '#4CAF50' },
  cardTituloPrincipal: { color: '#2196F3', fontSize: 14, fontWeight: 'bold', marginBottom: 5 },
  infoLabel: { color: '#AAA', fontSize: 11, fontWeight: 'bold' },
  infoText: { color: '#EEE', fontSize: 11, marginBottom: 2 },
  infoReact: { color: '#4DA3FF', fontSize: 11, marginTop: 4, fontWeight: '700' },
  availabilityBox: { backgroundColor: '#202020', borderRadius: 8, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#333' },
  availabilityTxt: { color: '#CFCFCF', fontSize: 11, marginTop: 4 },
  slotCard: { backgroundColor: '#1F1F1F', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#2C2C2C' },
  pickChip: { backgroundColor: '#303030', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, marginRight: 8 },
  pickChipActive: { backgroundColor: '#2E7D32' },
  pickChipTxt: { color: '#E0E0E0', fontSize: 10, fontWeight: '600' },
  pickChipTxtActive: { color: '#FFF' },
  cardJugada: { flexDirection: 'row', width: '100%', backgroundColor: '#262626', borderRadius: 8, padding: 12, marginBottom: 8, alignItems: 'center', borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  cardT: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  btnEliminar: { backgroundColor: '#D32F2F', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});
