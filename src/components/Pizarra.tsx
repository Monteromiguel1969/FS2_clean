import React, { useRef, useState, useEffect, useMemo } from "react";
import {
  View, Dimensions, StyleSheet, Animated, Text, TouchableOpacity,
  ScrollView, PanResponder, Modal, Alert, TextInput, Image
} from "react-native";
import Svg, { Rect, Line, Circle, Path } from "react-native-svg";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPlayerCompositeScore, normalizePlayerRatings } from '../utils/playerRating';
import { availabilityScorePenalty, isPlayerBlocked, isPlayerDoubt } from '../utils/playerAvailability';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const BENCH_W = 96;
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
const PLAYER_SIZE_FIELD = 46;
const PLAYER_SIZE_BENCH = 30;
const PLAYER_SIZE_RIVAL = 28;
const PLAYER_RADIUS_FACTOR = 0.55;
const GENERIC_SLOT_KEYS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'];

type RoleBase = 'portero' | 'cierre' | 'ala' | 'pivot';
type SystemSlot = { key: string; roleBase: RoleBase; profile: string; coord: { x: number; y: number } };
type DrawPoint = { x: number; y: number };
type DrawKind = 'draw' | 'arrow' | 'line' | 'curve';
type DrawItem = { points: DrawPoint[]; color: string; kind: DrawKind };
type PlayTagContext = {
  tipo: string;
  momento: string;
  escenario: string;
  presionRival: string;
};

const PLAY_TYPE_OPTIONS = ['saque banda', 'saque esquina', 'falta', '5v4', 'transicion', 'ataque posicional'];
const PLAY_MOMENT_OPTIONS = ['inicio', 'mitad', 'ultimos 5', 'ultimos 2'];
const PLAY_SCENARIO_OPTIONS = ['ganando', 'empatando', 'perdiendo'];
const PLAY_PRESSURE_OPTIONS = ['alta', 'media', 'baja'];
const DEFAULT_PLAY_TAGS: PlayTagContext = {
  tipo: 'ataque posicional',
  momento: 'mitad',
  escenario: 'empatando',
  presionRival: 'media',
};
const TAG_OPTIONS_BY_FIELD: Record<keyof PlayTagContext, string[]> = {
  tipo: PLAY_TYPE_OPTIONS,
  momento: PLAY_MOMENT_OPTIONS,
  escenario: PLAY_SCENARIO_OPTIONS,
  presionRival: PLAY_PRESSURE_OPTIONS,
};
const TAG_LABEL_BY_FIELD: Record<keyof PlayTagContext, string> = {
  tipo: 'Tipo',
  momento: 'Momento',
  escenario: 'Escenario',
  presionRival: 'Presion',
};

function nextOptionValue(options: string[], current: string): string {
  const idx = options.indexOf(current);
  if (idx < 0 || idx >= options.length - 1) return options[0];
  return options[idx + 1];
}

function scorePlayByContext(play: any, context: PlayTagContext): number {
  const tags = play?.tags || {};
  let score = 0;
  if (tags.tipo === context.tipo) score += 4;
  if (tags.momento === context.momento) score += 3;
  if (tags.escenario === context.escenario) score += 3;
  if (tags.presionRival === context.presionRival) score += 2;
  if ((play?.frames?.length || 0) > 0) score += 1;
  const feedback = play?.feedback || {};
  const total = Number(feedback.total || 0);
  if (total > 0) {
    const ok = Number(feedback.ok || 0);
    const parcial = Number(feedback.parcial || 0);
    const no = Number(feedback.no || 0);
    const quality = (ok * 1 + parcial * 0.4 - no * 0.8) / total;
    score += quality * 4;
  }
  return score;
}

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

function normalizeWeightInput(v: string): string {
  const clean = String(v || '').replace(/[^\d]/g, '');
  if (!clean) return '';
  const n = Math.max(0, Math.min(100, Number(clean)));
  return String(n);
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

export default function PizarraPro({ players = [], setPlayers, onBack, onOpenBiblioteca }: any) {
  const insets = useSafeAreaInsets();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [sisModal, setSisModal] = useState(false);
  const [stratModal, setStratModal] = useState(false);
  const [frames, setFrames] = useState<any[]>([]);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [nombreJugada, setNombreJugada] = useState('');
  const [saveModal, setSaveModal] = useState(false);
  const [biblioModal, setBiblioModal] = useState(false);
  const [modoReproduccion, setModoReproduccion] = useState(false);
  const [mostrarRivales, setMostrarRivales] = useState(true);
  const [mostrarFotosJugadores, setMostrarFotosJugadores] = useState(true);
  const [submenuActivo, setSubmenuActivo] = useState<'jugada' | 'dibujo' | null>('jugada');
  const [bucle, setBucle] = useState(false);
  const [jugadasGuardadas, setJugadasGuardadas] = useState<any[]>([]);
  const [biblioSearch, setBiblioSearch] = useState('');
  const [biblioTipoFilter, setBiblioTipoFilter] = useState<string | null>(null);
  const [playTagsDraft, setPlayTagsDraft] = useState<PlayTagContext>(DEFAULT_PLAY_TAGS);
  const [suggestContext, setSuggestContext] = useState<PlayTagContext>(DEFAULT_PLAY_TAGS);
  const [suggestModal, setSuggestModal] = useState(false);
  const [genericRecordingMode, setGenericRecordingMode] = useState(false);
  const [tagPickerField, setTagPickerField] = useState<keyof PlayTagContext | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [pausado, setPausado] = useState(false);
  const pausadoRef = useRef(false);
  const abortarRef = useRef(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const initializedDefaultRef = useRef(false);
  const [velocidad, setVelocidad] = useState(1);
  const [systemConfigModal, setSystemConfigModal] = useState(false);
  const [systemToConfigure, setSystemToConfigure] = useState<string | null>(null);
  const [manualBySlot, setManualBySlot] = useState<Record<string, string>>({});
  const [autoWeights, setAutoWeights] = useState({ ia: '45', staff: '35', encaje: '20' });
  const [playbackMap, setPlaybackMap] = useState<Record<string, string>>({});
  const [drawMode, setDrawMode] = useState<'none' | 'draw' | 'arrow'>('none');
  const [drawColor, setDrawColor] = useState('#FFD54F');
  const [drawItems, setDrawItems] = useState<DrawItem[]>([]);
  const [showSequenceTrails, setShowSequenceTrails] = useState(true);

  const [activeDraw, setActiveDraw] = useState<{ points: DrawPoint[] } | null>(null);
  const drawModeRef = useRef(drawMode);
  const drawColorRef = useRef(drawColor);
  const modoReproduccionRef = useRef(modoReproduccion);

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
  const VELOCIDADES = [0.5, 0.75, 1, 1.25, 1.5];
  const formatVelocidad = (v: number) => `x${String(v).replace('.', ',')}`;

  useEffect(() => {
    const cargarTodo = async () => {
      try {
        const res = await AsyncStorage.getItem('plays_v5');
        const legacy = await AsyncStorage.getItem('plays_v4');
        const raw = res || legacy;
        if (raw) {
          const parsed = JSON.parse(raw);
          const normalized = Array.isArray(parsed)
            ? parsed.map((p: any) => ({
                ...p,
                tags: {
                  ...DEFAULT_PLAY_TAGS,
                  ...(p?.tags || {}),
                },
              }))
            : [];
          setJugadasGuardadas(normalized);
          // Si solo había plays_v4, copia a v5 sin borrar el legacy (migración aditiva).
          if (!res && legacy && normalized.length > 0) {
            await AsyncStorage.setItem('plays_v5', JSON.stringify(normalized));
          }
        }
      } catch (e) { console.log(e); }
    };
    cargarTodo();
  }, []);

  const persistJugadas = async (lista: any[]) => {
    // Nunca reescribe objetos quitando campos desconocidos: se guarda el array tal cual.
    await AsyncStorage.setItem('plays_v5', JSON.stringify(lista));
    setJugadasGuardadas(lista);
  };

  const jugadasFiltradas = useMemo(() => {
    const q = biblioSearch.trim().toLowerCase();
    let list = jugadasGuardadas.map((j, index) => ({ j, index }));
    if (q) {
      list = list.filter(({ j }) => String(j?.nombre || '').toLowerCase().includes(q));
    }
    if (biblioTipoFilter) {
      list = list.filter(({ j }) => String(j?.tags?.tipo || '') === biblioTipoFilter);
    }
    list.sort((a, b) => {
      const fa = a.j?.favorite ? 1 : 0;
      const fb = b.j?.favorite ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return a.index - b.index;
    });
    return list;
  }, [jugadasGuardadas, biblioSearch, biblioTipoFilter]);

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

  /** Borra solo por índice (no por nombre) para no eliminar homónimos. */
  const eliminarJugadaPorIndice = (index: number) => {
    const j = jugadasGuardadas[index];
    if (!j) return;
    const nombre = String(j.nombre || 'Jugada');
    Alert.alert('Eliminar', `¿Borrar solo esta jugada «${nombre}»? Las demás se conservan.`, [
      { text: 'No' },
      {
        text: 'Sí',
        style: 'destructive',
        onPress: async () => {
          const nueva = jugadasGuardadas.filter((_, i) => i !== index);
          await persistJugadas(nueva);
        },
      },
    ]);
  };

  const toggleFavoritoJugada = async (index: number) => {
    const nuevaLista = jugadasGuardadas.map((j: any, i: number) =>
      i === index ? { ...j, favorite: !j?.favorite } : j
    );
    await persistJugadas(nuevaLista);
  };

  const duplicarJugadaPorIndice = async (index: number) => {
    const original = jugadasGuardadas[index];
    if (!original) return;
    const copia = {
      ...JSON.parse(JSON.stringify(original)),
      id: `play_${Date.now()}_copy`,
      nombre: `${String(original.nombre || 'Jugada')} (copia)`,
      favorite: false,
      feedback: { ok: 0, parcial: 0, no: 0, total: 0 },
    };
    // Append: no sustituye ni borra la original.
    await persistJugadas([...jugadasGuardadas, copia]);
    Alert.alert('Duplicada', `Se ha creado «${copia.nombre}». La original sigue guardada.`);
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

  const aplicarFrame = (frame: any, mapOverride?: Record<string, string>) => {
    if (!frame) return;
    const resolved = resolveFrameForPlayback(frame, mapOverride);
    Object.keys(resolved).forEach(id => {
      if (pos.current[id]) {
        pos.current[id].setValue({ x: resolved[id].x, y: resolved[id].y });
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
  const jugadoresEnPistaIds = useMemo(
    () => players.filter((p: any) => p?.onCourt && String(p?.role || '').toLowerCase() === 'jugador').map((p: any) => p.id),
    [players]
  );
  const buildPlaybackMap = (framesToMap: any[]) => {
    if (!Array.isArray(framesToMap) || framesToMap.length === 0) return {};
    const firstFrame = framesToMap[0] || {};
    const idsGrabados = Object.keys(firstFrame).filter((id) => id !== 'ball' && !id.startsWith('rival'));
    const idsActuales = [...jugadoresEnPistaIds];
    const map: Record<string, string> = {};
    const libres = [...idsActuales];

    idsGrabados.forEach((id) => {
      if (idsActuales.includes(id)) {
        map[id] = id;
      }
    });
    Object.values(map).forEach((used) => {
      const idx = libres.indexOf(used);
      if (idx >= 0) libres.splice(idx, 1);
    });
    idsGrabados.forEach((id) => {
      if (!map[id] && libres.length > 0) {
        map[id] = libres.shift() as string;
      }
    });
    return map;
  };
  const resolveFrameForPlayback = (frame: any, mapOverride?: Record<string, string>) => {
    const effectiveMap = mapOverride || playbackMap;
    const out: any = {};
    Object.keys(frame || {}).forEach((id) => {
      const mappedId = effectiveMap[id] || id;
      if (!out[mappedId]) out[mappedId] = frame[id];
    });
    return out;
  };
  const renderFicha = (p: any, size = 40, rival = false, usarToggleFotos = true, genericToken = false) => (
    <View style={[styles.fichaBase, {
          width: size, height: size, borderRadius: size * PLAYER_RADIUS_FACTOR,
          backgroundColor: rival ? '#B71C1C' : '#1565C0',
          borderWidth: 2, borderColor: '#FFF',
        }]}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [] }}>
        {!rival && !genericToken && (!usarToggleFotos || mostrarFotosJugadores) && p.photo ? (
          <Image
            source={{ uri: p.photo }}
            style={{ width: size - 4, height: size - 4, borderRadius: size * PLAYER_RADIUS_FACTOR }}
          />
        ) : (
          <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: size * 0.38 }}>
            {genericToken ? '' : (rival ? 'R' : (String(p.number ?? p.idx ?? '').trim() || String(p.name || '').trim().slice(0, 2).toUpperCase() || '?'))}
          </Text>
        )}
      </View>
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
    if (genericRecordingMode) {
      GENERIC_SLOT_KEYS.forEach((slotKey) => {
        if (pos.current[slotKey]) {
          frame[slotKey] = { x: pos.current[slotKey].x._value, y: pos.current[slotKey].y._value };
        }
      });
    } else {
      const onCourt = players
        .filter((p: any) => p?.onCourt && String(p?.role || '').toLowerCase() === 'jugador')
        .slice(0, 5);
      onCourt.forEach((p: any) => {
        if (pos.current[p.id]) {
          frame[p.id] = { x: pos.current[p.id].x._value, y: pos.current[p.id].y._value };
        }
      });
    }
    Object.keys(pos.current).forEach(id => {
      if (id === 'ball' || id.startsWith('rival')) {
        frame[id] = { x: pos.current[id].x._value, y: pos.current[id].y._value };
      }
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
    // Append aditivo: no sobrescribe jugadas existentes.
    const nueva = {
      id: `play_${Date.now()}`,
      nombre: nombreJugada,
      frames: JSON.parse(JSON.stringify(frames)),
      drawItems: persistedDrawItems,
      tags: { ...DEFAULT_PLAY_TAGS, ...(playTagsDraft || {}) },
      favorite: false,
      feedback: { ok: 0, parcial: 0, no: 0, total: 0 },
    };
    const nuevaLista = [...jugadasGuardadas, nueva];
    await persistJugadas(nuevaLista);
    
    setSaveModal(false);
    setNombreJugada('');
    setPlayTagsDraft(DEFAULT_PLAY_TAGS);
    setFrames([]); // Reinicia el contador de pasos a 0
    setDrawItems([]);
    Alert.alert("Éxito", "Jugada guardada. El contador se ha reiniciado.");
  };

  const registrarFeedbackJugada = async (index: number, tipo: 'ok' | 'parcial' | 'no') => {
    const nuevaLista = jugadasGuardadas.map((j: any, i: number) => {
      if (i !== index) return j;
      const prev = j?.feedback || { ok: 0, parcial: 0, no: 0, total: 0 };
      return {
        ...j,
        feedback: {
          ok: Number(prev.ok || 0) + (tipo === 'ok' ? 1 : 0),
          parcial: Number(prev.parcial || 0) + (tipo === 'parcial' ? 1 : 0),
          no: Number(prev.no || 0) + (tipo === 'no' ? 1 : 0),
          total: Number(prev.total || 0) + 1,
        },
      };
    });
    await persistJugadas(nuevaLista);
  };

  const resetFeedbackJugada = async (index: number) => {
    const nuevaLista = jugadasGuardadas.map((j: any, i: number) =>
      i === index ? { ...j, feedback: { ok: 0, parcial: 0, no: 0, total: 0 } } : j
    );
    await persistJugadas(nuevaLista);
  };

  const resetFeedbackGlobal = async () => {
    Alert.alert(
      'Reset global',
      'Se reiniciará el feedback de todas las jugadas. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const nuevaLista = jugadasGuardadas.map((j: any) => ({
              ...j,
              feedback: { ok: 0, parcial: 0, no: 0, total: 0 },
            }));
            await persistJugadas(nuevaLista);
          },
        },
      ]
    );
  };

  const sugerenciasJugadas = useMemo(() => {
    return [...jugadasGuardadas]
      .map((p: any) => ({ play: p, score: scorePlayByContext(p, suggestContext) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [jugadasGuardadas, suggestContext]);

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
      .filter((p: any) => p?.role === 'Jugador' && !isPlayerBlocked(p))
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

    const wIA = Number(autoWeights.ia || 0);
    const wStaff = Number(autoWeights.staff || 0);
    const wEncaje = Number(autoWeights.encaje || 0);
    const totalW = Math.max(1, wIA + wStaff + wEncaje);
    const calcAutoScore = (player: any, slot: SystemSlot) => {
      const ia = Number(player?.valoracionIA || 0);
      const staff = Number(player?.valoracionStaff || 0);
      const encajeNorm = Math.max(0, Math.min(10, fitScoreForProfile(player, slot.profile) / 12));
      return ((ia * wIA) + (staff * wStaff) + (encajeNorm * wEncaje)) / totalW - availabilityScorePenalty(player);
    };

    const porteroCandidates = candidatesForRole('portero', available);
    if (!porteroCandidates.length) {
      Alert.alert('Sin portero', 'No hay portero disponible. El sistema no se puede aplicar.');
      return;
    }

    slots.forEach((slot) => {
      const rolePool = candidatesForRole(slot.roleBase, available).filter((p: any) => !usedIds.has(p.id));
      const best = rolePool
        .map((p: any) => ({ player: p, score: calcAutoScore(p, slot) }))
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
    setSystemToConfigure(systemName);

    const wIA = Number(autoWeights.ia || 0);
    const wStaff = Number(autoWeights.staff || 0);
    const wEncaje = Number(autoWeights.encaje || 0);
    const totalW = Math.max(1, wIA + wStaff + wEncaje);
    const calcAutoScore = (player: any, slot: SystemSlot) => {
      const ia = Number(player?.valoracionIA || 0);
      const staff = Number(player?.valoracionStaff || 0);
      const encajeNorm = Math.max(0, Math.min(10, fitScoreForProfile(player, slot.profile) / 12));
      return ((ia * wIA) + (staff * wStaff) + (encajeNorm * wEncaje)) / totalW - availabilityScorePenalty(player);
    };

    // Precarga selección manual con la opción automática para acelerar ajustes.
    const available = jugadoresDisponibles();
    const preload: Record<string, string> = {};
    const usedIds = new Set<string>();
    slots.forEach((slot) => {
      const rolePool = candidatesForRole(slot.roleBase, available).filter((p: any) => !usedIds.has(p.id));
      const best = rolePool
        .map((p: any) => ({ player: p, score: calcAutoScore(p, slot) }))
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

  const isGenericRecording = (framesToCheck: any[]) => {
    if (!Array.isArray(framesToCheck) || framesToCheck.length === 0) return false;
    const first = framesToCheck[0] || {};
    return Object.keys(first).some((k) => k.startsWith('slot'));
  };

  const startPlaybackPrepared = (framesToPlay: any[], drawToPlay: DrawItem[] = [], map: Record<string, string>) => {
    setGenericRecordingMode(false);
    setFrames(framesToPlay);
    setPlaybackMap(map);
    setDrawItems(Array.isArray(drawToPlay) ? drawToPlay : []);
    setFrameIndex(0);
    setReproduciendo(false);
    setPausado(false);
    setModoReproduccion(true);
    if (framesToPlay.length > 0) aplicarFrame(framesToPlay[0], map);
  };

  const mapGenericSlotsToOnCourt = (framesToPlay: any[]) => {
    const first = framesToPlay[0] || {};
    const slots = Object.keys(first).filter((k) => k.startsWith('slot')).sort();
    const onCourt = [...jugadoresEnPistaIds];
    if (onCourt.length < slots.length) {
      Alert.alert("Faltan jugadoras en pista", `Se necesitan ${slots.length} jugadoras en pista para reproducir esta jugada.`);
      return null;
    }
    const map: Record<string, string> = {};
    slots.forEach((slot, idx) => {
      map[slot] = onCourt[idx];
    });
    return map;
  };

  const preparePlayback = (framesToPlay: any[], drawToPlay: DrawItem[] = []) => {
    if (!Array.isArray(framesToPlay) || framesToPlay.length === 0) {
      Alert.alert("Aviso", "No hay pasos grabados");
      return false;
    }
    if (isGenericRecording(framesToPlay)) {
      const map = mapGenericSlotsToOnCourt(framesToPlay);
      if (!map) return false;
      startPlaybackPrepared(framesToPlay, drawToPlay, map);
      return true;
    }
    const map = buildPlaybackMap(framesToPlay);
    startPlaybackPrepared(framesToPlay, drawToPlay, map);
    return true;
  };

  const iniciarGrabacionGenerica = () => {
    setMenuAbierto(false);
    setModoReproduccion(false);
    setReproduciendo(false);
    setPausado(false);
    pausadoRef.current = false;
    abortarRef.current = false;
    setFrameIndex(0);
    setFrames([]);
    setPlaybackMap({});
    setDrawItems([]);
    setActiveDraw(null);
    setShowSequenceTrails(true);
    setGenericRecordingMode(true);
    GENERIC_SLOT_KEYS.forEach((slot, idx) => {
      const coord = GENERIC_START_COORDS[idx] || GENERIC_START_COORDS[0];
      if (!pos.current[slot]) {
        pos.current[slot] = new Animated.ValueXY(coord);
      } else {
        pos.current[slot].setValue(coord);
      }
    });
  };

  const iniciarReproduccion = async () => {
    if (frames.length === 0) { Alert.alert("Aviso", "No hay pasos grabados"); return; }
    const map = isGenericRecording(frames)
      ? mapGenericSlotsToOnCourt(frames)
      : (Object.keys(playbackMap || {}).length > 0 ? playbackMap : buildPlaybackMap(frames));
    if (!map) return;
    setPlaybackMap(map);
    
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
      aplicarFrame(frames[0], map);
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

        const frame = resolveFrameForPlayback(frames[i], map);
        
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
        aplicarFrame(frames[0], map);
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
      const frame = resolveFrameForPlayback(frames[next]);
      Animated.parallel(
        Object.keys(frame).map(id => {
           if (pos.current[id]) {
             return Animated.spring(pos.current[id], {
               toValue: frame[id],
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
        if (isPlayerBlocked(p)) {
          Alert.alert(
            'No disponible',
            p?.estadoFisico === 'Lesionado'
              ? 'Este jugador está lesionado.'
              : 'Este jugador está marcado como no disponible.'
          );
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
          text: 'Garantizado',
          onPress: () => {
            setPlayers(players.map((p: any) => (
              p.id === playerId ? { ...p, disponibilidad: 'Garantizado' } : p
            )));
          }
        },
        {
          text: 'Duda',
          onPress: () => {
            setPlayers(players.map((p: any) => (
              p.id === playerId ? { ...p, disponibilidad: 'Duda' } : p
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
  const GENERIC_START_COORDS = [
    { x: toFieldX(0.5), y: toFieldY(0.88) },
    { x: toFieldX(0.3), y: toFieldY(0.68) },
    { x: toFieldX(0.7), y: toFieldY(0.68) },
    { x: toFieldX(0.3), y: toFieldY(0.45) },
    { x: toFieldX(0.7), y: toFieldY(0.45) },
  ];
  const benchPlayers = useMemo(
    () => players.filter((p: any) => String(p?.role || '').toLowerCase() === 'jugador'),
    [players]
  );
  const openSisModal = () => {
    setMenuAbierto(false);
    requestAnimationFrame(() => setSisModal(true));
  };

  const openStratModal = () => {
    setMenuAbierto(false);
    requestAnimationFrame(() => setStratModal(true));
  };
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
          <Text style={styles.btnText}>VOLVER</Text>
        </TouchableOpacity>
        {typeof onOpenBiblioteca === 'function' ? (
          <TouchableOpacity style={[styles.btnAction, { backgroundColor: '#FFD166' }]} onPress={onOpenBiblioteca}>
            <Text style={[styles.btnText, { color: '#001A33' }]}>BIBLIOTECA</Text>
          </TouchableOpacity>
        ) : null}
        <ScrollView style={styles.sideControlsScroll} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          <View style={styles.compactControls}>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.cBtnCompact} onPress={capturarFrame}>
                <Text style={styles.cText}>CAP ({frames.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cBtnCompact, submenuActivo === 'jugada' && styles.cBtnSmallActive]} onPress={() => setSubmenuActivo(submenuActivo === 'jugada' ? null : 'jugada')}>
                <Text style={styles.cText}>JUGADA</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cBtnCompact, submenuActivo === 'dibujo' && styles.cBtnSmallActive]} onPress={() => setSubmenuActivo(submenuActivo === 'dibujo' ? null : 'dibujo')}>
                <Text style={styles.cText}>DIBUJO</Text>
              </TouchableOpacity>
            </View>
            {submenuActivo === 'jugada' && (
              <View style={styles.actionRowSecondary}>
                {!modoReproduccion ? (
                  <>
                    <TouchableOpacity style={[styles.cBtnSmall, { backgroundColor: frames.length > 0 ? '#FF9800' : '#333' }]} onPress={() => frames.length > 0 && setSaveModal(true)}>
                      <Text style={styles.cText}>GUARDAR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.cBtnSmall, { backgroundColor: frames.length > 0 ? '#4CAF50' : '#333' }]}
                      onPress={() => {
                        if (frames.length > 0) {
                          preparePlayback(frames, drawItems);
                        } else {
                          Alert.alert("Vacio", "Graba algun paso primero");
                        }
                      }}
                    >
                      <Text style={styles.cText}>PROBAR</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity style={[styles.cBtnSmall, { backgroundColor: reproduciendo ? '#FFC107' : '#4CAF50' }]} onPress={reproduciendo ? pausarJugada : iniciarReproduccion}>
                      <Text style={styles.cText}>{reproduciendo ? 'PAUSA' : 'PLAY'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.cBtnSmall, { backgroundColor: '#D32F2F' }]} onPress={detenerDefinitivamente}>
                      <Text style={styles.cText}>STOP</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.cBtnSmall, { backgroundColor: '#2196F3' }]} onPress={siguientePasoManual}>
                      <Text style={styles.cText}>+1</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.cBtnSmall, { backgroundColor: bucle ? '#E91E63' : '#444' }]} onPress={() => setBucle(!bucle)}>
                      <Text style={styles.cText}>BUCLE</Text>
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity style={styles.cBtnSmall} onPress={() => setBiblioModal(true)}>
                  <Text style={styles.cText}>BIBLIOTECA</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cBtnSmall, { backgroundColor: '#0D47A1' }]} onPress={() => setSuggestModal(true)}>
                  <Text style={styles.cText}>SUGERIR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cBtnSmall, showSequenceTrails && styles.cBtnSmallActive]} onPress={() => setShowSequenceTrails((v) => !v)}>
                  <Text style={styles.cText}>{showSequenceTrails ? 'RASTRO ON' : 'RASTRO OFF'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cBtnSmall, !mostrarFotosJugadores && styles.cBtnSmallActive]} onPress={() => setMostrarFotosJugadores(v => !v)}>
                  <Text style={styles.cText}>{mostrarFotosJugadores ? 'FOTOS ON' : 'FOTOS OFF'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cBtnSmall, !mostrarRivales && styles.cBtnSmallActive]} onPress={() => setMostrarRivales(v => !v)}>
                  <Text style={styles.cText}>{mostrarRivales ? 'RIVALES ON' : 'RIVALES OFF'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {submenuActivo === 'dibujo' && (
              <View style={styles.actionRowSecondary}>
                <TouchableOpacity style={[styles.cBtnSmall, drawMode === 'draw' && styles.cBtnSmallActive]} onPress={() => setDrawMode(drawMode === 'draw' ? 'none' : 'draw')}>
                  <Text style={styles.cText}>DIBUJO</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cBtnSmall, drawMode === 'arrow' && styles.cBtnSmallActive]} onPress={() => setDrawMode(drawMode === 'arrow' ? 'none' : 'arrow')}>
                  <Text style={styles.cText}>FLECHA</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cBtnSmall, { backgroundColor: '#FFD54F' }, drawColor === '#FFD54F' && styles.colorBtnActive]} onPress={() => setDrawColor('#FFD54F')}>
                  <Text style={[styles.cText, { color: '#111' }]}>AM</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cBtnSmall, { backgroundColor: '#4DA3FF' }, drawColor === '#4DA3FF' && styles.colorBtnActive]} onPress={() => setDrawColor('#4DA3FF')}>
                  <Text style={styles.cText}>AZ</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cBtnSmall, { backgroundColor: '#EF5350' }, drawColor === '#EF5350' && styles.colorBtnActive]} onPress={() => setDrawColor('#EF5350')}>
                  <Text style={styles.cText}>RO</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cBtnSmall} onPress={() => setDrawItems((prev) => prev.slice(0, -1))}>
                  <Text style={styles.cText}>DESHACER</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cBtnSmall, { backgroundColor: '#D32F2F' }]} onPress={() => { setDrawItems([]); setActiveDraw(null); }}>
                  <Text style={styles.cText}>BORRAR TODO</Text>
                </TouchableOpacity>
              </View>
            )}
            {modoReproduccion && (
              <View style={styles.actionRowTertiary}>
                <View style={{ width: '100%' }}>
                  {VELOCIDADES.map((v) => (
                    <TouchableOpacity key={`spd-${v}`} style={[styles.cBtnSpeed, velocidad === v && styles.cBtnSmallActive]} onPress={() => setVelocidad(v)}>
                      <Text style={styles.cText}>{formatVelocidad(v)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={[styles.cBtnTertiary, { backgroundColor: '#333' }]} onPress={salirReproduccion}>
                  <Text style={styles.cText}>Volver</Text>
                </TouchableOpacity>
              </View>
            )}
            {modoReproduccion && frames.length > 0 && (
              <View style={{ width: '100%', height: 4, backgroundColor: '#333', marginTop: 6, borderRadius: 2 }}>
                <View style={{ width: `${((frameIndex + 1) / frames.length) * 100}%`, height: '100%', backgroundColor: '#2196F3' }} />
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      <View style={styles.fieldArea}>
        <View style={styles.fieldCanvas}>
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

        
{/* 1. Jugadores del equipo / slots genéricos */}
{genericRecordingMode ? GENERIC_SLOT_KEYS.map((slotKey) => {
  if (!pos.current || !pos.current[slotKey]) return null;
  return (
    <Animated.View
      key={`generic-slot-${slotKey}`}
      {...createPan(slotKey).panHandlers}
      style={[
        styles.pNode,
        { transform: pos.current[slotKey].getTranslateTransform() }
      ]}
    >
      {renderFicha({ number: '', name: '' }, PLAYER_SIZE_FIELD, false, false, true)}
    </Animated.View>
  );
}) : players && players.filter((p: any) => p && p.onCourt).map((p: any) => {
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
      {renderFicha(p, PLAYER_SIZE_FIELD)}
    </Animated.View>
  );
})}

{/* 2. Rivales (Asegúrate de que también tengan validación) */}
{mostrarRivales && Array.from({ length: 5 }).map((_, i) => {
  const id = `rival${i}`;
  if (!pos.current[id]) return null;

  return (
    <Animated.View 
      key={`rival-node-${i}`} 
      {...createPan(id).panHandlers} 
      style={[styles.pNode, { transform: pos.current[id].getTranslateTransform() }]}
    >
      {renderFicha({ idx: i }, PLAYER_SIZE_RIVAL, true)}
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

      <View style={styles.bottomBenchWrap}>
        <Text style={styles.benchTitle}>BANQUILLO</Text>
        <View style={styles.benchGrid}>
          {benchPlayers.slice(0, 15).map((p: any) => (
            <TouchableOpacity
              key={p.id}
              style={styles.benchGridItem}
              onLongPress={() => openDisponibilidadSelector(p.id)}
              delayLongPress={350}
              onPress={() => {
                if (isPlayerBlocked(p)) {
                  Alert.alert(
                    'No disponible',
                    p?.estadoFisico === 'Lesionado'
                      ? 'Jugador lesionado: no puede salir a pista.'
                      : 'Este jugador no puede salir a pista.'
                  );
                  return;
                }
                const count = players.filter((x: any) => x.onCourt).length;
                if (!p.onCourt && count >= 5) return;
                setPlayers(players.map((x: any) => (x.id === p.id ? { ...x, onCourt: !x.onCourt } : x)));
              }}
            >
              <View
                style={
                  isPlayerBlocked(p)
                    ? styles.unavailableFrame
                    : isPlayerDoubt(p)
                      ? styles.doubtFrame
                      : undefined
                }
              >
                {renderFicha(p, PLAYER_SIZE_BENCH, false, false)}
                {p.onCourt && <View style={styles.onCourtDot} />}
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.benchName,
                  isPlayerBlocked(p) && styles.benchNameUnavailable,
                  isPlayerDoubt(p) && styles.benchNameDoubt,
                ]}
              >
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      </View>

      {/* MODALES */}
      <Modal visible={menuAbierto} transparent>
        <View style={styles.overlay}>
          <View style={styles.mContent}>
            <Text style={styles.mT}>MENÚ</Text>
            <TouchableOpacity style={[styles.btnC, { backgroundColor: '#2E7D32' }]} onPress={iniciarGrabacionGenerica}><Text style={{ color: '#FFF' }}>GRABAR JUGADA</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnC} onPress={openSisModal}><Text style={{ color: '#FFF' }}>SISTEMAS</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnC} onPress={openStratModal}><Text style={{ color: '#FFF' }}>ESTRATEGIAS</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnC} onPress={() => { setBiblioModal(true); setMenuAbierto(false); }}><Text style={{ color: '#FFF' }}>BIBLIOTECA</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btnC, { backgroundColor: '#D32F2F' }]} onPress={() => setMenuAbierto(false)}><Text style={{ color: '#FFF' }}>CERRAR</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={sisModal} transparent animationType="fade">
        <View style={[styles.overlay, { justifyContent: 'flex-start', paddingTop: Math.max(insets.top + 10, 18) }]}> 
          <View style={[styles.mContentFull, styles.systemModalBox, { paddingBottom: Math.max(insets.bottom + 8, 14) }]}>
            <Text style={styles.mT}>SISTEMAS DE JUEGO</Text>
            <ScrollView
              style={{ width: '100%', flex: 1 }}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 140, 180), flexGrow: 1 }}
              showsVerticalScrollIndicator
              alwaysBounceVertical
              nestedScrollEnabled
            >
              {Object.keys(SISTEMAS_POS).map((k) => (
                <TouchableOpacity key={k} style={styles.cardDetalle} onPress={() => abrirConfiguracionSistema(k)}>
                  <Text style={styles.cardTituloPrincipal}>{k}</Text>
                  <Text style={styles.infoText}><Text style={styles.infoLabel}>Situación: </Text>{SISTEMAS_POS[k].situacion}</Text>
                  <Text style={styles.infoText}><Text style={styles.infoLabel}>Estructura: </Text>{SISTEMAS_POS[k].estructura}</Text>
                  <Text style={styles.infoText}><Text style={styles.infoLabel}>Roles: </Text>{SISTEMAS_POS[k].roles}</Text>
                  <Text style={[styles.infoText, { color: '#4CAF50', fontWeight: 'bold' }]}>{SISTEMAS_POS[k].cuando}</Text>
                  <Text style={styles.infoReact}>{SISTEMAS_POS[k].reaccion}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.systemListFooter}>
              <TouchableOpacity style={[styles.btnC, { backgroundColor: '#D32F2F', width: '100%' }]} onPress={() => setSisModal(false)}><Text style={{ color: '#FFF' }}>VOLVER</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={systemConfigModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.mContentFull, { paddingBottom: Math.max(insets.bottom + 8, 14) }]}>
            <Text style={styles.mT}>CONFIGURAR {systemToConfigure || 'SISTEMA'}</Text>
            {configuredSystem ? (
              <ScrollView style={{ width: '100%', flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
                <Text style={styles.infoText}>
                  <Text style={styles.infoLabel}>Necesidades: </Text>
                  {`Portero ${configuredRequirements.portero} · Cierre ${configuredRequirements.cierre} · Ala ${configuredRequirements.ala} · Pívot ${configuredRequirements.pivot}`}
                </Text>
                <Text style={[styles.infoText, { marginBottom: 10 }]}>
                  Puedes elegir manualmente cada plaza o aplicar asignación automática por valoración.
                </Text>
                <View style={styles.weightRow}>
                  <View style={styles.weightBox}>
                    <Text style={styles.weightLabel}>Peso IA (%)</Text>
                    <TextInput
                      style={styles.weightInput}
                      keyboardType="numeric"
                      value={autoWeights.ia}
                      onChangeText={(v) => setAutoWeights((prev) => ({ ...prev, ia: normalizeWeightInput(v) }))}
                    />
                  </View>
                  <View style={styles.weightBox}>
                    <Text style={styles.weightLabel}>Peso Staff (%)</Text>
                    <TextInput
                      style={styles.weightInput}
                      keyboardType="numeric"
                      value={autoWeights.staff}
                      onChangeText={(v) => setAutoWeights((prev) => ({ ...prev, staff: normalizeWeightInput(v) }))}
                    />
                  </View>
                  <View style={styles.weightBox}>
                    <Text style={styles.weightLabel}>Peso Encaje (%)</Text>
                    <TextInput
                      style={styles.weightInput}
                      keyboardType="numeric"
                      value={autoWeights.encaje}
                      onChangeText={(v) => setAutoWeights((prev) => ({ ...prev, encaje: normalizeWeightInput(v) }))}
                    />
                  </View>
                </View>

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
            ) : null}
            <View style={styles.systemConfigFooter}>
            <TouchableOpacity
              style={[styles.btnC, { backgroundColor: '#2E7D32', width: '100%' }]}
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
          <View style={[styles.mContentFull, { paddingBottom: Math.max(insets.bottom + 8, 14) }]}>
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
        <View style={[styles.overlay, styles.biblioOverlay]}>
          <View style={[styles.biblioContent, { paddingBottom: Math.max(insets.bottom + 8, 14) }]}>
            <Text style={styles.mT}>MIS JUGADAS GUARDADAS</Text>
            <Text style={styles.biblioHint}>
              {jugadasGuardadas.length} guardada(s). Busca, filtra o marca favoritas. Duplicar no borra la original.
            </Text>
            <TextInput
              value={biblioSearch}
              onChangeText={setBiblioSearch}
              placeholder="Buscar por nombre…"
              placeholderTextColor="#888"
              style={styles.biblioSearchInput}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.biblioFilterScroll}>
              <TouchableOpacity
                style={[styles.biblioFilterChip, !biblioTipoFilter && styles.biblioFilterChipOn]}
                onPress={() => setBiblioTipoFilter(null)}
              >
                <Text style={[styles.biblioFilterChipTxt, !biblioTipoFilter && styles.biblioFilterChipTxtOn]}>Todas</Text>
              </TouchableOpacity>
              {PLAY_TYPE_OPTIONS.map((t) => {
                const on = biblioTipoFilter === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.biblioFilterChip, on && styles.biblioFilterChipOn]}
                    onPress={() => setBiblioTipoFilter(on ? null : t)}
                  >
                    <Text style={[styles.biblioFilterChipTxt, on && styles.biblioFilterChipTxtOn]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={[styles.btnC, { backgroundColor: '#6D4C41', width: '100%', marginBottom: 8 }]} onPress={resetFeedbackGlobal}>
              <Text style={{ color: '#FFF' }}>RESET FEEDBACK GLOBAL</Text>
            </TouchableOpacity>
            <ScrollView
              style={styles.biblioScroll}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 16, 20), flexGrow: 1 }}
              showsVerticalScrollIndicator
            >
              {jugadasFiltradas.length === 0 ? (
                <Text style={styles.biblioEmpty}>
                  {jugadasGuardadas.length === 0
                    ? 'Aún no hay jugadas guardadas.'
                    : 'Ninguna jugada coincide con la búsqueda/filtro.'}
                </Text>
              ) : null}
              {jugadasFiltradas.map(({ j, index }) => (
                <View key={`jugada-${index}-${String(j?.id || j?.nombre || index)}`} style={[styles.cardJugada, j?.favorite && styles.cardJugadaFav]}>
                  <View style={styles.cardJugadaTop}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => {
                        abortarRef.current = false;
                        pausadoRef.current = false;
                        setBiblioModal(false);
                        preparePlayback(j.frames || [], Array.isArray(j.drawItems) ? j.drawItems : []);
                      }}
                    >
                      <Text style={styles.cardT}>
                        {j?.favorite ? '★ ' : ''}
                        {j.nombre}
                      </Text>
                      <Text style={{ color: '#888', fontSize: 10 }}>{j.frames?.length || 0} pasos</Text>
                      <Text style={{ color: '#8FB3C9', fontSize: 9 }}>
                        {(j?.tags?.tipo || 'ataque posicional')} · {(j?.tags?.momento || 'mitad')} · {(j?.tags?.escenario || 'empatando')}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.cardJugadaActions}>
                      <TouchableOpacity style={styles.btnFav} onPress={() => toggleFavoritoJugada(index)}>
                        <Text style={{ color: '#FFD54F', fontWeight: '900' }}>{j?.favorite ? '★' : '☆'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.btnDup} onPress={() => duplicarJugadaPorIndice(index)}>
                        <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>DUP</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.btnEliminar} onPress={() => eliminarJugadaPorIndice(index)}>
                        <Text style={{ color: '#FFF' }}>×</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.feedbackRow}>
                    <TouchableOpacity style={[styles.feedbackBtn, { backgroundColor: '#2E7D32' }]} onPress={() => registrarFeedbackJugada(index, 'ok')}>
                      <Text style={styles.feedbackTxt}>FUNCIONO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.feedbackBtn, { backgroundColor: '#EF6C00' }]} onPress={() => registrarFeedbackJugada(index, 'parcial')}>
                      <Text style={styles.feedbackTxt}>PARCIAL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.feedbackBtn, { backgroundColor: '#C62828' }]} onPress={() => registrarFeedbackJugada(index, 'no')}>
                      <Text style={styles.feedbackTxt}>NO</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.feedbackBtn, { backgroundColor: '#455A64' }]} onPress={() => resetFeedbackJugada(index)}>
                      <Text style={styles.feedbackTxt}>RESET</Text>
                    </TouchableOpacity>
                  </View>
                  {j?.feedback?.total ? (
                    <Text style={{ color: '#90A4AE', fontSize: 9, marginTop: 4 }}>
                      Historial: OK {j.feedback.ok || 0} · Parcial {j.feedback.parcial || 0} · No {j.feedback.no || 0}
                    </Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.btnC, { marginTop: 10, width: '100%', backgroundColor: '#1565C0' }]} onPress={() => setBiblioModal(false)}><Text style={{ color: '#FFF' }}>VOLVER A PIZARRA</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={saveModal} transparent>
        <View style={styles.overlay}>
          <View style={styles.mContent}>
            <Text style={styles.mT}>GUARDAR JUGADA</Text>
            <TextInput value={nombreJugada} onChangeText={setNombreJugada} placeholder="Nombre" placeholderTextColor="#AAA" style={styles.input} />
            {(Object.keys(TAG_OPTIONS_BY_FIELD) as Array<keyof PlayTagContext>).map((field) => (
              <TouchableOpacity key={`tag-${field}`} style={styles.dropdownField} onPress={() => setTagPickerField(field)}>
                <Text style={styles.dropdownFieldLabel}>{TAG_LABEL_BY_FIELD[field]}</Text>
                <Text style={styles.dropdownFieldValue}>{String(playTagsDraft[field] || '').toUpperCase()} ▼</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.btnC} onPress={guardarEnBiblioteca}><Text style={{ color: '#FFF' }}>GUARDAR</Text></TouchableOpacity>
            <TouchableOpacity style={styles.btnC} onPress={() => setSaveModal(false)}><Text style={{ color: '#FFF' }}>CANCELAR</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!tagPickerField} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.mContent, { width: '80%' }]}>
            <Text style={styles.mT}>{tagPickerField ? `SELECCIONAR ${TAG_LABEL_BY_FIELD[tagPickerField].toUpperCase()}` : 'SELECCIONAR'}</Text>
            {(tagPickerField ? TAG_OPTIONS_BY_FIELD[tagPickerField] : []).map((opt) => (
              <TouchableOpacity
                key={`opt-${tagPickerField}-${opt}`}
                style={styles.btnC}
                onPress={() => {
                  if (!tagPickerField) return;
                  setPlayTagsDraft((prev) => ({ ...prev, [tagPickerField]: opt }));
                  setTagPickerField(null);
                }}
              >
                <Text style={{ color: '#FFF' }}>{opt.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.btnC, { backgroundColor: '#D32F2F' }]} onPress={() => setTagPickerField(null)}>
              <Text style={{ color: '#FFF' }}>CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={suggestModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.mContent, { width: '92%' }]}>
            <Text style={styles.mT}>SUGERENCIAS AUTOMATICAS</Text>
            <TouchableOpacity style={styles.btnC} onPress={() => setSuggestContext((prev) => ({ ...prev, tipo: nextOptionValue(PLAY_TYPE_OPTIONS, prev.tipo) }))}>
              <Text style={{ color: '#FFF' }}>TIPO: {suggestContext.tipo.toUpperCase()}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnC} onPress={() => setSuggestContext((prev) => ({ ...prev, momento: nextOptionValue(PLAY_MOMENT_OPTIONS, prev.momento) }))}>
              <Text style={{ color: '#FFF' }}>MOMENTO: {suggestContext.momento.toUpperCase()}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnC} onPress={() => setSuggestContext((prev) => ({ ...prev, escenario: nextOptionValue(PLAY_SCENARIO_OPTIONS, prev.escenario) }))}>
              <Text style={{ color: '#FFF' }}>ESCENARIO: {suggestContext.escenario.toUpperCase()}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnC} onPress={() => setSuggestContext((prev) => ({ ...prev, presionRival: nextOptionValue(PLAY_PRESSURE_OPTIONS, prev.presionRival) }))}>
              <Text style={{ color: '#FFF' }}>PRESION: {suggestContext.presionRival.toUpperCase()}</Text>
            </TouchableOpacity>
            <View style={{ width: '100%', marginTop: 6 }}>
              {sugerenciasJugadas.length === 0 ? (
                <Text style={{ color: '#B0BEC5', textAlign: 'center' }}>No hay jugadas guardadas.</Text>
              ) : (
                sugerenciasJugadas.map((item, idx) => (
                  <TouchableOpacity
                    key={`sug-${idx}-${item.play?.nombre || 'jugada'}`}
                    style={[styles.cardDetalle, { marginBottom: 8 }]}
                    onPress={() => {
                      const j = item.play;
                      setSuggestModal(false);
                      preparePlayback(j.frames || [], Array.isArray(j.drawItems) ? j.drawItems : []);
                    }}
                  >
                    <Text style={styles.cardT}>{idx + 1}. {item.play?.nombre || 'Jugada'}</Text>
                    <Text style={{ color: '#8FB3C9', fontSize: 10 }}>
                      {(item.play?.tags?.tipo || '-') + ' · ' + (item.play?.tags?.momento || '-') + ' · ' + (item.play?.tags?.escenario || '-')}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
            <TouchableOpacity style={[styles.btnC, { backgroundColor: '#D32F2F' }]} onPress={() => setSuggestModal(false)}>
              <Text style={{ color: '#FFF' }}>CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#000', flexDirection: 'row' },
  sideBench: { width: BENCH_W, backgroundColor: '#111', alignItems: 'center', paddingTop: 10 },
  sideControlsScroll: { width: '100%', marginTop: 4, paddingHorizontal: 4 },
  fieldArea: { flex: 1, justifyContent: 'flex-start', alignItems: 'center', paddingTop: 2 },
  fieldCanvas: { width: '100%', alignItems: 'center' },
  bottomBenchWrap: {
    width: '100%',
    marginTop: 4,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#2f2f2f',
    paddingTop: 3,
    paddingHorizontal: 6,
    paddingBottom: 4,
    minHeight: 148,
  },
  benchTitle: { color: '#BDBDBD', fontSize: 10, fontWeight: '700', marginBottom: 2, letterSpacing: 0.4 },
  benchGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  benchGridItem: { width: '19.2%', alignItems: 'center', marginBottom: 2 },
  fieldTouchLayer: { position: 'absolute', top: 20, left: FIELD_X_OFFSET, width: FIELD_W, height: FIELD_H + 40, zIndex: 40 },
  drawOverlay: { position: 'absolute', top: 0, left: FIELD_X_OFFSET, zIndex: 30 },
  btnAction: { backgroundColor: '#444', width: 55, height: 30, justifyContent: 'center', alignItems: 'center', borderRadius: 5, marginBottom: 10 },
  btnText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  benchItem: { marginBottom: 15, alignItems: 'center' },
  benchName: { color: '#AAA', fontSize: 7, width: '100%', textAlign: 'center' },
  benchNameUnavailable: { color: '#FF8A80' },
  benchNameDoubt: { color: '#FFD54F' },
  unavailableFrame: {
    backgroundColor: '#B71C1C',
    borderWidth: 2,
    borderColor: '#FFCDD2',
    borderRadius: 4,
    padding: 2,
  },
  doubtFrame: {
    backgroundColor: '#5D4037',
    borderWidth: 2,
    borderColor: '#FFD54F',
    borderRadius: 4,
    padding: 2,
  },
  fichaBase: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  onCourtDot: { position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#4CAF50' },
  pNode: {
    position: 'absolute',
    width: PLAYER_SIZE_FIELD,
    height: PLAYER_SIZE_FIELD,
    left: -PLAYER_SIZE_FIELD / 2,
    top: -PLAYER_SIZE_FIELD / 2,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },
  compactControls: {
    backgroundColor: 'rgba(20,20,20,0.84)',
    borderRadius: 10, 
    paddingHorizontal: 3,
    paddingVertical: 4,
    width: '100%',
    borderWidth: 1,
    borderColor: '#444',
    elevation: 3
  },
  actionRow: { flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch' },
  actionRowSecondary: { flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch', marginTop: 2 },
  actionRowTertiary: { flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch', width: '100%' },
  cBtn: { backgroundColor: '#2196F3', paddingVertical: 4, paddingHorizontal: 4, borderRadius: 6, width: '100%', alignItems: 'center', marginBottom: 2 },
  cBtnCompact: { backgroundColor: '#2196F3', paddingVertical: 4, paddingHorizontal: 4, borderRadius: 6, width: '100%', alignItems: 'center', marginBottom: 2 },
  cBtnSmall: { backgroundColor: '#2f2f2f', paddingVertical: 4, paddingHorizontal: 4, borderRadius: 7, width: '100%', alignItems: 'center', marginBottom: 2, borderWidth: 1, borderColor: '#4a4a4a' },
  cBtnSpeed: { backgroundColor: '#333', paddingVertical: 3, paddingHorizontal: 4, borderRadius: 6, width: '100%', alignItems: 'center', marginBottom: 2 },
  cBtnTertiary: { backgroundColor: '#333', paddingVertical: 4, borderRadius: 6, alignItems: 'center', marginBottom: 2 },
  cBtnSmallActive: { backgroundColor: '#2E7D32', borderColor: '#7CFF8C' },
  colorBtnActive: { borderWidth: 2, borderColor: '#FFF' },
  cText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  mContent: { width: '85%', backgroundColor: '#1A1A1A', borderRadius: 20, padding: 25, borderWidth: 1, borderColor: '#333' },
  mContentFull: { width: '90%', height: '85%', backgroundColor: '#1A1A1A', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  biblioOverlay: { justifyContent: 'flex-start', paddingTop: 20 },
  biblioContent: { width: '84%', height: '52%', backgroundColor: '#1A1A1A', borderRadius: 18, padding: 10, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  biblioScroll: { width: '100%', flex: 1 },
  mT: { color: '#FFF', fontWeight: 'bold', marginBottom: 15, textAlign: 'center', fontSize: 16 },
  btnC: { backgroundColor: '#2196F3', paddingVertical: 10, borderRadius: 8, marginTop: 10, alignItems: 'center', width: '100%' },
  dropdownField: { width: '100%', backgroundColor: '#121212', borderWidth: 1, borderColor: '#2f2f2f', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10, marginBottom: 8 },
  dropdownFieldLabel: { color: '#90A4AE', fontSize: 10, marginBottom: 2, fontWeight: '700' },
  dropdownFieldValue: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  input: { backgroundColor: '#111', borderRadius: 8, padding: 10, color: '#FFF', marginBottom: 10 },
  cardDetalle: { backgroundColor: '#262626', borderRadius: 10, padding: 12, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#2196F3', width: '100%' },
  cardTituloPrincipal: { color: '#2196F3', fontSize: 14, fontWeight: 'bold', marginBottom: 5 },
  infoLabel: { color: '#AAA', fontSize: 11, fontWeight: 'bold' },
  infoText: { color: '#EEE', fontSize: 11, marginBottom: 2 },
  infoReact: { color: '#4DA3FF', fontSize: 11, marginTop: 4, fontWeight: '700' },
  availabilityBox: { backgroundColor: '#202020', borderRadius: 8, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#333' },
  weightRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  weightBox: { width: '32%' },
  weightLabel: { color: '#AAA', fontSize: 10, marginBottom: 4, fontWeight: '700' },
  weightInput: { backgroundColor: '#121212', borderWidth: 1, borderColor: '#333', borderRadius: 8, color: '#FFF', textAlign: 'center', paddingVertical: 8, paddingHorizontal: 6, fontSize: 12 },
  availabilityTxt: { color: '#CFCFCF', fontSize: 11, marginTop: 4 },
  slotCard: { backgroundColor: '#1F1F1F', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#2C2C2C' },
  pickChip: { backgroundColor: '#303030', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, marginRight: 8 },
  pickChipActive: { backgroundColor: '#2E7D32' },
  pickChipTxt: { color: '#E0E0E0', fontSize: 10, fontWeight: '600' },
  pickChipTxtActive: { color: '#FFF' },
  systemListFooter: { width: '100%', backgroundColor: '#1A1A1A', paddingTop: 6 },
  systemModalBox: { height: '38%', paddingTop: 6, paddingBottom: 4 },
  systemConfigFooter: { width: '100%', paddingTop: 6, paddingBottom: 2, backgroundColor: '#1A1A1A' },
  cardJugada: { width: '100%', backgroundColor: '#262626', borderRadius: 8, padding: 10, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  cardJugadaTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardJugadaFav: { borderLeftColor: '#FFD54F', backgroundColor: '#2A2A20' },
  cardJugadaActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnFav: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#37474F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDup: {
    paddingHorizontal: 8,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  biblioHint: { color: '#90A4AE', fontSize: 10, marginBottom: 8, textAlign: 'center' },
  biblioSearchInput: {
    backgroundColor: '#1A1A1A',
    color: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#455A64',
  },
  biblioFilterScroll: { maxHeight: 40, marginBottom: 8 },
  biblioFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#37474F',
    marginRight: 6,
  },
  biblioFilterChipOn: { backgroundColor: '#2E7D32' },
  biblioFilterChipTxt: { color: '#CFD8DC', fontSize: 10, fontWeight: '700' },
  biblioFilterChipTxtOn: { color: '#FFF' },
  biblioEmpty: { color: '#90A4AE', textAlign: 'center', paddingVertical: 16, fontSize: 12 },
  cardT: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  feedbackRow: { flexDirection: 'row', marginTop: 6, justifyContent: 'space-between', width: '100%' },
  feedbackBtn: { width: '24%', paddingVertical: 3, paddingHorizontal: 2, borderRadius: 5, alignItems: 'center' },
  feedbackTxt: { color: '#FFF', fontSize: 8, fontWeight: '800' },
  btnEliminar: { backgroundColor: '#D32F2F', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});
