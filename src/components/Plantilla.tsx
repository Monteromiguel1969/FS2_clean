import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  Image,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { exportEvaluacionesDI, uploadPhotoToDrive } from '../services/googleSheetsService';
import { normalizePlayerRatings, calculateValoracionIA, explainValoracionIA } from '../utils/playerRating';
import { EVAL_DI_TARGET_PLAYERS, importEvaluacionesHoja2ToPlayers } from '../utils/evaluacionDIImport';
import { useScreenMetrics } from '../utils/useScreenMetrics';
import {
  PERSONAL_FORM_SECTIONS,
  type PersonalQuestion,
  type PersonalOption,
} from '../utils/personalFormSections';
import {
  buildCompareFamiliaHtmlExport,
  buildFamiliaHtmlExport,
  buildFamiliaWhatsAppText,
  computePlayerSeasonStats,
} from '../utils/playerSeasonStats';
import {
  DI_RAPIDO_ITEMS,
  DEFAULT_DI_RAPIDO_SCORES,
  scoreFromDiRapidoItems,
  clampDiRapidoScore,
  type DiRapidoScores,
} from '../utils/diRapidoTemplate';
import { createPlayerId } from '../utils/playerIdentity';
import { DDMMYYYYDatePickerField } from './YmdDatePickerField';
import { ZoomableImageModal, useTextZoom, PinchTextZoomArea } from './ZoomableImage';
import {
  cycleDisponibilidad,
  cycleEstadoFisico,
} from '../utils/playerAvailability';
import { buildReportHeaderHtml, REPORT_BRAND } from '../utils/reportBranding';

/** Fila solo numérica larga: p. ej. 0–10 (11 botones) o 1–10 (10 botones); una sola línea repartida. */
function isCompactNumericChoiceRow(options: PersonalOption[] | undefined): boolean {
  const opts = options || [];
  if (opts.length < 10) return false;
  return opts.every((o) => /^\d{1,2}$/.test(String(o.label).trim()));
}

export default function Plantilla({
  players,
  partidos = [],
  entrenos = [],
  setPlayers,
  onBack,
  onOpenBiblioteca,
  escudoUri = null,
  equipoNombre = '',
  temporadaNombre = '',
}: {
  players: unknown[];
  partidos?: unknown[];
  entrenos?: unknown[];
  setPlayers: (p: unknown[]) => Promise<void>;
  onBack: () => void;
  /** Acceso global a la pantalla Biblioteca (recursos del equipo). */
  onOpenBiblioteca?: () => void;
  escudoUri?: string | null;
  equipoNombre?: string;
  temporadaNombre?: string;
}) {
  const insets = useSafeAreaInsets();
  const screen = useScreenMetrics();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  // Estados del formulario
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [nominal, setNominal] = useState('');           // nombre visible en la app
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [numeroLicencia, setNumeroLicencia] = useState('');
  const [edad, setEdad] = useState('');
  const [aniosEquipo, setAniosEquipo] = useState('');
  const [dorsal, setDorsal] = useState('');             // número de camiseta
  const [role, setRole] = useState('Jugador'); 
  // Puede contener múltiples roles separados por coma: "Portero, Cierre"
  const [posicion, setPosicion] = useState('Ala'); 
  const [ladosJuego, setLadosJuego] = useState<string[]>([]);
  const [photo, setPhoto] = useState(null);
  const [perfilTactico, setPerfilTactico] = useState(''); // ej.: "Defensivo, Organizador"
  const [estadoFisico, setEstadoFisico] = useState<'OK' | 'Cargado' | 'Lesionado'>('OK');
  const [disponibilidad, setDisponibilidad] = useState<'Garantizado' | 'Duda' | 'No disponible'>('Garantizado');
  const [tallaSuperior, setTallaSuperior] = useState('M');
  const [tallaInferior, setTallaInferior] = useState('M');
  const [tallaPie, setTallaPie] = useState('M');
  const [numeroPie, setNumeroPie] = useState('42');
  const [valoracionStaff, setValoracionStaff] = useState(6);
  const [iaEditorVisible, setIaEditorVisible] = useState(false);
  const [personalFormVisible, setPersonalFormVisible] = useState(false);
  const [diRapidoVisible, setDiRapidoVisible] = useState(false);
  const [diRapidoItems, setDiRapidoItems] = useState<DiRapidoScores>({ ...DEFAULT_DI_RAPIDO_SCORES });
  const [resultadosVisible, setResultadosVisible] = useState(false);
  const [iaSelectedPlayerId, setIaSelectedPlayerId] = useState<string | null>(null);
  const [control, setControl] = useState(6);
  const [pase, setPase] = useState(6);
  const [lecturaJuego, setLecturaJuego] = useState(6);
  const [tomaDecision, setTomaDecision] = useState(6);
  const [velocidad, setVelocidad] = useState(6);
  const [resistencia, setResistencia] = useState(6);
  const [concentracion, setConcentracion] = useState(6);
  const [competitividad, setCompetitividad] = useState(6);
  const [evalFecha, setEvalFecha] = useState('');
  const [evalEdad, setEvalEdad] = useState('');
  const [evalExperienciaFS, setEvalExperienciaFS] = useState('');
  const [evalScore, setEvalScore] = useState(6);
  const [evalObservaciones, setEvalObservaciones] = useState('');
  const [personalAnswers, setPersonalAnswers] = useState<Record<string, string>>({});
  const [listadoModalVisible, setListadoModalVisible] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorType, setSelectorType] = useState<'tallaSuperior' | 'tallaInferior' | 'tallaPie' | 'numeroPie' | null>(null);
  const [selectedListadoFields, setSelectedListadoFields] = useState<string[]>([
    'nominal',
    'role',
    'posicion',
    'number',
  ]);
  const [exportingListado, setExportingListado] = useState(false);
  /** El usuario debe pulsar 'Ver vista previa' en la pantalla emergente para mostrar la previa. */
  const [listadoPreviewVisible, setListadoPreviewVisible] = useState(false);
  /** Modal con visor de la foto del jugador (zoom) - se abre con long-press en el círculo de foto. */
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  /** Zoom de texto/celdas para la vista previa del listado. */
  const previewZoom = useTextZoom(1);
  type InformesModo = 'uno' | 'todos' | 'comparar';
  type InformesSecciones = {
    familia: boolean;
    valoraciones: boolean;
    ponderacion: boolean;
    personal: boolean;
    resultado: boolean;
  };
  const [informesModalVisible, setInformesModalVisible] = useState(false);
  const [informesExporting, setInformesExporting] = useState(false);
  const [informesModo, setInformesModo] = useState<InformesModo>('uno');
  const [informesPlayerId, setInformesPlayerId] = useState<string | null>(null);
  const [informesCompareIds, setInformesCompareIds] = useState<string[]>([]);
  const [informesSecciones, setInformesSecciones] = useState<InformesSecciones>({
    familia: true,
    valoraciones: false,
    ponderacion: false,
    personal: false,
    resultado: false,
  });
  const [importingDI, setImportingDI] = useState(false);
  const previewPlayersScrollRef = useRef<ScrollView | null>(null);
  const previewDataScrollRef = useRef<ScrollView | null>(null);
  const previewHeaderHScrollRef = useRef<ScrollView | null>(null);
  const previewBodyHScrollRef = useRef<ScrollView | null>(null);
  const ignoreHeaderHScroll = useRef(false);
  const ignoreBodyHScroll = useRef(false);
  const ignoreNextPlayersVScroll = useRef(false);
  const ignoreNextDataVScroll = useRef(false);

  const posiciones = ['Portero', 'Cierre', 'Ala', 'Pívot'];
  const opcionesLado = ['Derecha', 'Izquierda', 'Centro'];
  const tallasRopa = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const numerosPie = Array.from({ length: 21 }, (_, i) => String(36 + i));
  const listadoFields = [
    { key: 'nominal', label: 'Nombre nominal' },
    { key: 'nombreCompleto', label: 'Nombre completo' },
    { key: 'role', label: 'Rol' },
    { key: 'posicion', label: 'Posición' },
    { key: 'number', label: 'Dorsal' },
    { key: 'numeroLicencia', label: 'Licencia' },
    { key: 'edad', label: 'Edad' },
    { key: 'aniosEquipo', label: 'Años en el equipo' },
    { key: 'fechaNacimiento', label: 'Fecha nacimiento' },
    { key: 'ladoPreferido', label: 'Lado preferido' },
    { key: 'ladosJuego', label: 'Lados de juego' },
    { key: 'perfilTactico', label: 'Perfil táctico' },
    { key: 'estadoFisico', label: 'Estado físico' },
    { key: 'disponibilidad', label: 'Disponibilidad' },
    { key: 'tallaSuperior', label: 'Talla superior' },
    { key: 'tallaInferior', label: 'Talla inferior' },
    { key: 'tallaPie', label: 'Talla pies' },
    { key: 'numeroPie', label: 'Nº pie' },
    { key: 'valoracionStaff', label: 'Valoración staff' },
    { key: 'valoracionIA', label: 'Valoración IA' },
  ];

  const formatFechaNacimiento = (raw: string) => {
    const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };
  const todayDDMMYYYY = () => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  };

  const calcularEdadDesdeFecha = (fecha: string) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(fecha || '').trim());
    if (!m) return '';
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';

    const birth = new Date(year, month - 1, day);
    if (
      birth.getFullYear() !== year ||
      birth.getMonth() !== month - 1 ||
      birth.getDate() !== day
    ) {
      return '';
    }

    const today = new Date();
    let years = today.getFullYear() - year;
    const notHadBirthday =
      today.getMonth() < month - 1 ||
      (today.getMonth() === month - 1 && today.getDate() < day);
    if (notHadBirthday) years -= 1;
    if (years < 0 || years > 99) return '';
    return String(years);
  };

  const parsePosicionesSeleccionadas = () =>
    (posicion || 'Ala')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const togglePosicion = (pos: string) => {
    setPosicion((prev) => {
      const actuales = (prev || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const existe = actuales.includes(pos);
      let nuevas = existe ? actuales.filter((p) => p !== pos) : [...actuales, pos];
      if (nuevas.length === 0) nuevas = [pos]; // siempre al menos un rol
      return nuevas.join(', ');
    });
  };

  const toggleLadoJuego = (lado: string) => {
    setLadosJuego((prev) =>
      prev.includes(lado) ? prev.filter((x) => x !== lado) : [...prev, lado]
    );
  };

  const toggleListadoField = (key: string) => {
    setSelectedListadoFields((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
    // Si el usuario cambia los campos, ocultamos la previa hasta que pulse otra vez "Ver vista previa"
    setListadoPreviewVisible(false);
  };

  const openSelectionModal = (type: 'tallaSuperior' | 'tallaInferior' | 'tallaPie' | 'numeroPie') => {
    setSelectorType(type);
    setSelectorVisible(true);
  };

  const applySelectionValue = (value: string) => {
    if (selectorType === 'tallaSuperior') setTallaSuperior(value);
    if (selectorType === 'tallaInferior') setTallaInferior(value);
    if (selectorType === 'tallaPie') setTallaPie(value);
    if (selectorType === 'numeroPie') setNumeroPie(value);
    setSelectorVisible(false);
  };

  const selectorTitle =
    selectorType === 'tallaSuperior'
      ? 'Talla superior'
      : selectorType === 'tallaInferior'
      ? 'Talla inferior'
      : selectorType === 'tallaPie'
      ? 'Talla pies'
      : selectorType === 'numeroPie'
      ? 'Número de pie'
      : 'Seleccionar';

  const selectorOptions = selectorType === 'numeroPie' ? numerosPie : tallasRopa;
  const personalAllQuestions = PERSONAL_FORM_SECTIONS.reduce((acc: PersonalQuestion[], s) => {
    s.questions.forEach((q) => acc.push(q));
    return acc;
  }, []);
  const setPersonalAnswer = (questionId: string, value: string) => {
    const question = personalAllQuestions.find((q) => q.id === questionId);
    if (question?.type === 'number') {
      const clean = String(value || '').replace(/[^\d]/g, '');
      if (clean === '') {
        setPersonalAnswers((prev) => ({ ...prev, [questionId]: '' }));
        return;
      }
      const n = Math.max(0, Math.min(10, Number(clean)));
      setPersonalAnswers((prev) => ({ ...prev, [questionId]: String(n) }));
      return;
    }
    setPersonalAnswers((prev) => ({ ...prev, [questionId]: value }));
  };
  const getPersonalOptionLabel = (q: PersonalQuestion, value: string) => {
    if (!q.options) return value;
    const opt = q.options.find((o) => o.value === value);
    return opt ? opt.label : value;
  };
  const computePersonalScore = (answers: Record<string, string>) => {
    const scored = personalAllQuestions.reduce((acc: number[], q) => {
      if (!q.options) return acc;
      const value = answers[q.id];
      const opt = q.options.find((o) => o.value === value);
      if (opt) acc.push(opt.score);
      return acc;
    }, []);
    if (!scored.length) return 0;
    const avg = scored.reduce((a, b) => a + b, 0) / scored.length;
    return Math.max(0, Math.min(10, Math.round(avg * 10) / 10));
  };

  const scaleTo10 = (v: any, min = 1, max = 10, fallback = 6) => {
    const raw = Number(v);
    const mapped = Number.isFinite(raw) ? (raw <= 5 ? raw * 2 : raw) : fallback;
    return Math.max(min, Math.min(max, Math.round(mapped)));
  };
  const clampRate = (v: any) => scaleTo10(v, 1, 10, 6);
  const safePlayers = useMemo(
    () => (Array.isArray(players) ? players : []).filter((p: any) => p && typeof p === 'object'),
    [players]
  );
  const plantillaVisible = useMemo(() => {
    const isStaff = (p: any) => String(p?.role || 'Jugador').trim().toLowerCase() !== 'jugador';
    return [...safePlayers].sort((a, b) => Number(isStaff(a)) - Number(isStaff(b)));
  }, [safePlayers]);
  const safePartidos = useMemo(
    () => (Array.isArray(partidos) ? partidos : []),
    [partidos]
  );
  const safeEntrenos = useMemo(
    () => (Array.isArray(entrenos) ? entrenos : []),
    [entrenos]
  );
  const rosterPlayers = safePlayers.filter((p: any) => p?.role === 'Jugador');
  const iaSelectedPlayer = rosterPlayers.find((p: any) => String(p?.id) === String(iaSelectedPlayerId || ''));
  const posicionPrincipal = ((posicion || '').split(',')[0] || 'Ala').trim();
  const iaPreview = explainValoracionIA({
    id: iaSelectedPlayer?.id || null,
    posicionPrincipal,
    valoracionStaff,
    control,
    pase,
    lecturaJuego,
    tomaDecision,
    velocidad,
    resistencia,
    concentracion,
    competitividad,
    estadoFisico,
    disponibilidad,
    evaluacionesDI: iaSelectedPlayer?.evaluacionesDI || [],
  }, { partidos: safePartidos as any[], entrenos: safeEntrenos as any[] });
  const iaWeightsPct = {
    technique: Math.round(iaPreview.weights.technique * 100),
    tactic: Math.round(iaPreview.weights.tactic * 100),
    physical: Math.round(iaPreview.weights.physical * 100),
    mental: Math.round(iaPreview.weights.mental * 100),
  };
  const iaContext = iaPreview?.context || {
    entrenosPct: 0,
    partidosPct: 0,
    goles: 0,
    minutos: 0,
    favorContraPct: 0,
    evaluacionDIScore: null,
    contextScore: 0,
  };
  const iaPositionLabel =
    iaPreview.position === 'portero'
      ? 'Portero'
      : iaPreview.position === 'cierre'
      ? 'Cierre'
      : iaPreview.position === 'pivot'
      ? 'Pívot'
      : 'Ala';
  const loadIAFieldsFromPlayer = (p: any) => {
    if (!p) return;
    setValoracionStaff(clampRate(p.valoracionStaff));
    setControl(clampRate(p.control));
    setPase(clampRate(p.pase));
    setLecturaJuego(clampRate(p.lecturaJuego));
    setTomaDecision(clampRate(p.tomaDecision));
    setVelocidad(clampRate(p.velocidad));
    setResistencia(clampRate(p.resistencia));
    setConcentracion(clampRate(p.concentracion));
    setCompetitividad(clampRate(p.competitividad));
    setPosicion(p.posicion || p.posicionPrincipal || 'Ala');
    setEstadoFisico(p.estadoFisico || 'OK');
    setDisponibilidad(p.disponibilidad || 'Garantizado');
    const evals = Array.isArray(p.evaluacionesDI) ? p.evaluacionesDI : [];
    const lastEval = evals.length ? evals[evals.length - 1] : null;
    setEvalFecha(lastEval?.fecha || todayDDMMYYYY());
    setEvalEdad(String(lastEval?.edad ?? p?.edad ?? ''));
    setEvalExperienciaFS(String(lastEval?.experienciaFS ?? ''));
    setEvalScore(scaleTo10(lastEval?.score, 0, 10, 0));
    setEvalObservaciones(lastEval?.observaciones || '');
  };
  const openIAEditorForPlayer = (playerId: string) => {
    const target = rosterPlayers.find((p: any) => String(p.id) === String(playerId));
    if (!target) {
      Alert.alert('Sin jugador', 'No se encontró el jugador seleccionado para ponderación IA.');
      return;
    }
    setIaSelectedPlayerId(String(target.id));
    loadIAFieldsFromPlayer(target);
    setIaEditorVisible(true);
  };
  const openPersonalFormForPlayer = (playerId: string) => {
    const target = rosterPlayers.find((p: any) => String(p.id) === String(playerId));
    if (!target) {
      Alert.alert('Sin jugador', 'No se encontró el jugador seleccionado para formulario personal.');
      return;
    }
    setIaSelectedPlayerId(String(target.id));
    loadIAFieldsFromPlayer(target);
    const latest = Array.isArray(target.evaluacionesDI) && target.evaluacionesDI.length
      ? target.evaluacionesDI[target.evaluacionesDI.length - 1]
      : null;
    const aniosEquipoStr = String(target?.aniosEquipo ?? '').trim();
    const baseAnswers = latest?.personalForm?.answers || {
      edad_personal: String(target?.edad || ''),
      anios_fs: aniosEquipoStr || String(latest?.experienciaFS ?? ''),
    };
    // Forzamos que 'anios_fs' provenga siempre de la ficha del jugador (años en el equipo)
    setPersonalAnswers({ ...baseAnswers, anios_fs: aniosEquipoStr });
    setPersonalFormVisible(true);
  };

  const findLatestPeriodica = (player: any) => {
    const evals = Array.isArray(player?.evaluacionesDI) ? player.evaluacionesDI : [];
    const periodicas = evals.filter(
      (ev: any) =>
        !(ev?.personalForm && typeof ev.personalForm === 'object') &&
        !(Array.isArray(ev?.bloques) && ev.bloques.length > 0)
    );
    return periodicas.length ? periodicas[periodicas.length - 1] : null;
  };

  const openDiRapidoForPlayer = (playerId: string) => {
    const target = rosterPlayers.find((p: any) => String(p.id) === String(playerId));
    if (!target) {
      Alert.alert('Sin jugador', 'No se encontró el jugador seleccionado para DI rápido.');
      return;
    }
    setIaSelectedPlayerId(String(target.id));
    loadIAFieldsFromPlayer(target);
    setEvalFecha(todayDDMMYYYY());
    setEvalObservaciones('');
    const last = findLatestPeriodica(target);
    if (last?.items && typeof last.items === 'object') {
      setDiRapidoItems({
        tecnico: clampDiRapidoScore(Number(last.items.tecnico) || 3),
        tactico: clampDiRapidoScore(Number(last.items.tactico) || 3),
        fisico: clampDiRapidoScore(Number(last.items.fisico) || 3),
        actitud: clampDiRapidoScore(Number(last.items.actitud) || 3),
      });
    } else {
      setDiRapidoItems({ ...DEFAULT_DI_RAPIDO_SCORES });
    }
    setDiRapidoVisible(true);
  };

  const copiarUltimaDiRapido = () => {
    if (!iaSelectedPlayer) return;
    const last = findLatestPeriodica(iaSelectedPlayer);
    if (!last) {
      Alert.alert('Sin historial', 'Este jugador aún no tiene evaluaciones periódicas.');
      return;
    }
    if (last.items && typeof last.items === 'object') {
      setDiRapidoItems({
        tecnico: clampDiRapidoScore(Number(last.items.tecnico) || 3),
        tactico: clampDiRapidoScore(Number(last.items.tactico) || 3),
        fisico: clampDiRapidoScore(Number(last.items.fisico) || 3),
        actitud: clampDiRapidoScore(Number(last.items.actitud) || 3),
      });
    } else {
      const s = Number(last.score);
      const approx5 = Number.isFinite(s) && s > 0 ? clampDiRapidoScore(Math.round(s / 2)) : 3;
      setDiRapidoItems({
        tecnico: approx5,
        tactico: approx5,
        fisico: approx5,
        actitud: approx5,
      });
    }
    if (last.observaciones) setEvalObservaciones(String(last.observaciones));
    Alert.alert('Copiado', 'Se han cargado los valores de la última evaluación periódica.');
  };

  const saveDiRapido = async () => {
    if (!iaSelectedPlayer) return;
    const fecha = (evalFecha || '').trim() || todayDDMMYYYY();
    const edadNum = Number(iaSelectedPlayer?.edad) || Number(evalEdad) || 0;
    const expNum = Number(iaSelectedPlayer?.aniosEquipo) || Number(evalExperienciaFS) || 0;
    const items = {
      tecnico: clampDiRapidoScore(diRapidoItems.tecnico),
      tactico: clampDiRapidoScore(diRapidoItems.tactico),
      fisico: clampDiRapidoScore(diRapidoItems.fisico),
      actitud: clampDiRapidoScore(diRapidoItems.actitud),
    };
    const score = scoreFromDiRapidoItems(items);
    const evaluacion = {
      id: `${Date.now()}`,
      fecha,
      edad: edadNum > 0 ? Math.round(edadNum) : 0,
      experienciaFS: expNum >= 0 ? Math.round(expNum) : 0,
      score,
      observaciones: evalObservaciones.trim(),
      items,
      modo: 'rapido',
    };
    const prev = Array.isArray(iaSelectedPlayer.evaluacionesDI) ? iaSelectedPlayer.evaluacionesDI : [];
    const nextEvals = [...prev, evaluacion].slice(-30);
    const updated = normalizePlayerRatings(
      {
        ...iaSelectedPlayer,
        evaluacionesDI: nextEvals,
        valoracionStaff,
        control,
        pase,
        lecturaJuego,
        tomaDecision,
        velocidad,
        resistencia,
        concentracion,
        competitividad,
        posicionPrincipal: ((posicion || '').split(',')[0] || 'Ala').trim(),
        estadoFisico,
        disponibilidad,
      },
      iaSelectedPlayer,
      { partidos: safePartidos as any[], entrenos: safeEntrenos as any[] }
    );
    const updatedPlayers = safePlayers.map((p: any) => (p.id === iaSelectedPlayer.id ? updated : p));
    await setPlayers(updatedPlayers);
    await exportEvaluacionesDI(updatedPlayers as any[]);
    setDiRapidoVisible(false);
    Alert.alert('DI rápido guardado', `Nota ${score}/10 añadida. Entra en Stats → DI y en la valoración IA.`);
  };

  const openResultadosForPlayer = (playerId: string) => {
    const target = rosterPlayers.find((p: any) => String(p.id) === String(playerId));
    if (!target) {
      Alert.alert('Sin jugador', 'No se encontró el jugador seleccionado para resultados.');
      return;
    }
    setIaSelectedPlayerId(String(target.id));
    loadIAFieldsFromPlayer(target);
    setResultadosVisible(true);
  };
  const saveIAForSelectedPlayer = async () => {
    if (!iaSelectedPlayer) return;
    const updated = normalizePlayerRatings({
      ...iaSelectedPlayer,
      valoracionStaff,
      control,
      pase,
      lecturaJuego,
      tomaDecision,
      velocidad,
      resistencia,
      concentracion,
      competitividad,
      posicionPrincipal: ((posicion || '').split(',')[0] || 'Ala').trim(),
      estadoFisico,
      disponibilidad,
    }, iaSelectedPlayer, { partidos: safePartidos as any[], entrenos: safeEntrenos as any[] });
    await setPlayers(safePlayers.map((p: any) => (p.id === iaSelectedPlayer.id ? updated : p)));
    setIaEditorVisible(false);
  };
  const addEvaluacionDI = async () => {
    if (!iaSelectedPlayer) return;
    const evalEdadNum = Number(evalEdad);
    const evalExpNum = Number(evalExperienciaFS);
    if (!evalFecha.trim()) {
      Alert.alert('Fecha obligatoria', 'Indica la fecha de la evaluación (dd/mm/aaaa).');
      return;
    }
    if (!Number.isFinite(evalEdadNum) || evalEdadNum <= 0) {
      Alert.alert('Edad obligatoria', 'Indica una edad válida para la evaluación.');
      return;
    }
    if (!Number.isFinite(evalExpNum) || evalExpNum < 0) {
      Alert.alert('Experiencia obligatoria', 'Indica los años de experiencia en fútbol sala.');
      return;
    }

    const evaluacion = {
      id: `${Date.now()}`,
      fecha: evalFecha.trim(),
      edad: Math.round(evalEdadNum),
      experienciaFS: Math.round(evalExpNum),
      score: evalScore,
      observaciones: evalObservaciones.trim(),
    };
    const prev = Array.isArray(iaSelectedPlayer.evaluacionesDI) ? iaSelectedPlayer.evaluacionesDI : [];
    const nextEvals = [...prev, evaluacion].slice(-30);
    const updated = normalizePlayerRatings({
      ...iaSelectedPlayer,
      evaluacionesDI: nextEvals,
      valoracionStaff,
      control,
      pase,
      lecturaJuego,
      tomaDecision,
      velocidad,
      resistencia,
      concentracion,
      competitividad,
      posicionPrincipal: ((posicion || '').split(',')[0] || 'Ala').trim(),
      estadoFisico,
      disponibilidad,
    }, iaSelectedPlayer, { partidos: safePartidos as any[], entrenos: safeEntrenos as any[] });
    const updatedPlayers = safePlayers.map((p: any) => (p.id === iaSelectedPlayer.id ? updated : p));
    await setPlayers(updatedPlayers);
    await exportEvaluacionesDI(updatedPlayers as any[]);
    Alert.alert('Evaluación guardada', 'La evaluación personal periódica se ha añadido y ya entra en la IA.');
  };
  const saveFormularioPersonal = async () => {
    if (!iaSelectedPlayer) return;
    const edadPersonal = personalAnswers.edad_personal || '';
    const aniosFichaJugador = String(iaSelectedPlayer?.aniosEquipo ?? '').trim();
    const aniosFs = aniosFichaJugador || (personalAnswers.anios_fs || '');
    if (!edadPersonal.trim()) {
      Alert.alert('Campo obligatorio', 'Debes indicar la edad.');
      return;
    }
    if (!aniosFs.trim()) {
      Alert.alert('Falta dato en la ficha', 'Indica primero los AÑOS EN EL EQUIPO en la ficha del jugador.');
      return;
    }
    const answersConsolidados = { ...personalAnswers, anios_fs: aniosFs };
    const score = computePersonalScore(answersConsolidados);
    const evaluacion = {
      id: `${Date.now()}`,
      fecha: evalFecha.trim() || todayDDMMYYYY(),
      edad: Number(edadPersonal) || Number(evalEdad) || 0,
      experienciaFS: Number(aniosFs) || Number(evalExperienciaFS) || 0,
      score,
      observaciones: evalObservaciones.trim(),
      personalForm: {
        sections: PERSONAL_FORM_SECTIONS.map((s) => s.id),
        answers: answersConsolidados,
      },
    };
    const prev = Array.isArray(iaSelectedPlayer.evaluacionesDI) ? iaSelectedPlayer.evaluacionesDI : [];
    const nextEvals = [...prev, evaluacion].slice(-30);
    const updated = normalizePlayerRatings({
      ...iaSelectedPlayer,
      evaluacionesDI: nextEvals,
      valoracionStaff,
      control,
      pase,
      lecturaJuego,
      tomaDecision,
      velocidad,
      resistencia,
      concentracion,
      competitividad,
      posicionPrincipal: ((posicion || '').split(',')[0] || 'Ala').trim(),
      estadoFisico,
      disponibilidad,
    }, iaSelectedPlayer, { partidos: safePartidos as any[], entrenos: safeEntrenos as any[] });
    const updatedPlayers = safePlayers.map((p: any) => (p.id === iaSelectedPlayer.id ? updated : p));
    await setPlayers(updatedPlayers);
    await exportEvaluacionesDI(updatedPlayers as any[]);
    setEvalScore(score);
    Alert.alert('Guardado', 'Formulario personal guardado correctamente.');
  };
  const removeEvaluacionForSelectedPlayer = (evalId: string, tipo: string, fecha: string) => {
    if (!iaSelectedPlayer) return;
    const title = `Borrar evaluación ${tipo}`;
    const msg = `¿Eliminar la evaluación del ${fecha || 'sin fecha'} para ${iaSelectedPlayer.name || iaSelectedPlayer.nominal || 'el jugador'}?`;
    Alert.alert(title, msg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          const updatedPlayers = safePlayers.map((p: any) => {
            if (String(p.id) !== String(iaSelectedPlayer.id)) return p;
            const prev = Array.isArray(p.evaluacionesDI) ? p.evaluacionesDI : [];
            const next = prev.filter((ev: any) => String(ev?.id || '') !== String(evalId));
            return normalizePlayerRatings(
              { ...p, evaluacionesDI: next },
              p,
              { partidos: safePartidos as any[], entrenos: safeEntrenos as any[] }
            );
          });
          await setPlayers(updatedPlayers);
          Alert.alert('Hecho', 'Evaluación eliminada para este jugador.');
        },
      },
    ]);
  };
  const selectedPlayerEvaluaciones = Array.isArray(iaSelectedPlayer?.evaluacionesDI)
    ? [...iaSelectedPlayer.evaluacionesDI]
        .map((ev: any, idx: number) => {
          let tipo = 'PERIODICA';
          if (ev?.personalForm && typeof ev.personalForm === 'object') tipo = 'PERSONAL';
          else if (Array.isArray(ev?.bloques) && ev.bloques.length > 0) tipo = 'IA';
          else if (ev?.modo === 'rapido' || (ev?.items && typeof ev.items === 'object')) tipo = 'RAPIDO';
          return {
            id: String(ev?.id || `${idx}`),
            fecha: String(ev?.fecha || ''),
            score: Number(ev?.score || 0),
            tipo,
          };
        })
        .reverse()
    : [];
  const importarEvaluacionesDIHoja2 = async () => {
    if (importingDI) return;
    try {
      setImportingDI(true);
      const result = await importEvaluacionesHoja2ToPlayers(safePlayers as any[], EVAL_DI_TARGET_PLAYERS);
      const normalized = result.updatedPlayers.map((p: any, i: number) =>
        normalizePlayerRatings(p, safePlayers[i], { partidos: safePartidos as any[], entrenos: safeEntrenos as any[] })
      );
      await setPlayers(normalized);
      await exportEvaluacionesDI(normalized as any[]);

      const resumen = [
        `Con datos importados (${result.conDatos.length}): ${result.conDatos.join(', ') || '-'}`,
        `Sin datos en Hoja 2 (${result.sinDatos.length}): ${result.sinDatos.join(', ') || '-'}`,
        `En libro y no en plantilla (${result.enLibroNoEnPlantilla.length}): ${result.enLibroNoEnPlantilla.join(', ') || '-'}`,
      ].join('\n\n');
      Alert.alert('Importación Hoja 2 completada', resumen);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error importando Hoja 2', msg);
    } finally {
      setImportingDI(false);
    }
  };
  const renderIARow = (label: string, value: number, onChange: (v: number) => void) => (
    <View style={styles.iaRow}>
      <Text style={styles.iaLabel}>{label}</Text>
      <View style={styles.iaBtns}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <TouchableOpacity
            key={`${label}-${n}`}
            style={[styles.iaBtn, value === n && styles.iaBtnActive]}
            onPress={() => onChange(n)}
          >
            <Text style={[styles.iaBtnTxt, value === n && styles.iaBtnTxtActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
  const renderCalculatedScoreRow = (label: string, value: number) => (
    <View style={styles.iaRow}>
      <Text style={styles.iaLabel}>{label}</Text>
      <View style={styles.iaCalculatedBox}>
        <Text style={styles.iaCalculatedValue}>{`${value}/10`}</Text>
      </View>
    </View>
  );

  const getListadoValue = (player: any, key: string) => {
    if (key === 'nominal') return player?.nominal || player?.name || '-';
    if (key === 'nombreCompleto') return player?.nombreCompleto || '-';
    if (key === 'number') return player?.number || '-';
    if (key === 'ladosJuego') {
      if (Array.isArray(player?.ladosJuego)) return player.ladosJuego.join(', ') || '-';
      return player?.ladosJuego || '-';
    }
    const raw = player?.[key];
    if (raw === null || raw === undefined || raw === '') return '-';
    return String(raw);
  };

  const previewDataFields = selectedListadoFields.filter((key) => key !== 'nominal');
  const syncPreviewPlayersScroll = (y: number) => {
    ignoreNextPlayersVScroll.current = true;
    previewPlayersScrollRef.current?.scrollTo({ y, animated: false });
  };

  const syncPreviewDataScroll = (y: number) => {
    ignoreNextDataVScroll.current = true;
    previewDataScrollRef.current?.scrollTo({ y, animated: false });
  };

  const onPreviewPlayersScroll = (y: number) => {
    if (ignoreNextPlayersVScroll.current) {
      ignoreNextPlayersVScroll.current = false;
      return;
    }
    syncPreviewDataScroll(y);
  };

  const onPreviewDataScroll = (y: number) => {
    if (ignoreNextDataVScroll.current) {
      ignoreNextDataVScroll.current = false;
      return;
    }
    syncPreviewPlayersScroll(y);
  };

  const listadoDataMinWidth = Math.max(previewDataFields.length, 1) * 120;

  const syncListadoHorizontal = (x: number, from: 'header' | 'body') => {
    if (from === 'header') {
      if (ignoreHeaderHScroll.current) {
        ignoreHeaderHScroll.current = false;
        return;
      }
      ignoreBodyHScroll.current = true;
      previewBodyHScrollRef.current?.scrollTo({ x, animated: false });
    } else {
      if (ignoreBodyHScroll.current) {
        ignoreBodyHScroll.current = false;
        return;
      }
      ignoreHeaderHScroll.current = true;
      previewHeaderHScrollRef.current?.scrollTo({ x, animated: false });
    }
  };

  const escapeHtml = (value: string) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const exportarListadoSeleccionado = async () => {
    if (exportingListado) return;
    if (!selectedListadoFields.length) {
      Alert.alert('Campos vacíos', 'Selecciona al menos un campo para exportar.');
      return;
    }
    const roster = plantillaVisible;
    if (!roster.length) {
      Alert.alert('Sin jugadores', 'No hay jugadores en la plantilla para exportar.');
      return;
    }

    try {
      setExportingListado(true);
      const headers = selectedListadoFields.map((key) => {
        const field = listadoFields.find((f) => f.key === key);
        return `<th>${escapeHtml(field?.label || key)}</th>`;
      }).join('');

      const bodyRows = roster.map((p: any) => {
        const cols = selectedListadoFields.map((key) => `<td>${escapeHtml(getListadoValue(p, key))}</td>`).join('');
        return `<tr>${cols}</tr>`;
      }).join('');

      const listadoStyles = `
        body { font-family: sans-serif; padding: 18px; color: #1a1a1a; background: #fff; }
        h1 { text-align: center; color: #012E57; font-size: 18px; margin: 0 0 8px; }
        p { text-align: center; color: #555; margin: 0 0 14px; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
        th, td { border: 1px solid #ccc; padding: 6px; text-align: center; vertical-align: middle; word-wrap: break-word; }
        th { background: #012E57; color: #fff; }
        tr:nth-child(even) td { background: #f7f9fc; }
      `;
      const html = `<html><head><meta charset="UTF-8"/><style>${listadoStyles}</style></head><body>
            <h1>LISTADO DE PLANTILLA</h1>
            <p>Campos exportados: ${escapeHtml(String(selectedListadoFields.length))}</p>
            <table>
              <thead><tr>${headers}</tr></thead>
              <tbody>${bodyRows}</tbody>
            </table>
          </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Exportar listado de plantilla',
        ...(Platform.OS === 'ios' ? { UTI: 'com.adobe.pdf' as const } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `No se pudo exportar el listado. ${msg}`);
    } finally {
      setExportingListado(false);
    }
  };

  const buildFichaPonderacionIAHtml = () => {
    if (!iaSelectedPlayer) return '';
    const jugador = iaSelectedPlayer.name || iaSelectedPlayer.nominal || '-';
    const fecha = evalFecha || todayDDMMYYYY();
    const bloques = [
      ['Control', control],
      ['Pase', pase],
      ['Lectura de juego', lecturaJuego],
      ['Toma de decisión', tomaDecision],
      ['Velocidad', velocidad],
      ['Resistencia', resistencia],
      ['Concentración', concentracion],
      ['Competitividad', competitividad],
    ]
      .map(([k, v]) => `<tr><td>${escapeHtml(String(k))}</td><td>${escapeHtml(String(v))}</td></tr>`)
      .join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; color: #1a1a1a; }
            h1 { font-size: 20px; margin-bottom: 8px; color: #012E57; }
            h2 { font-size: 14px; color: #0E3A66; margin: 14px 0 8px; }
            p { font-size: 12px; margin: 4px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #d8d8d8; padding: 8px; font-size: 12px; text-align: left; }
            th { background: #012E57; color: #fff; }
            .score { font-weight: 800; color: #0E3A66; font-size: 14px; }
            .formula { font-size: 11px; color: #2C3E50; margin-top: 8px; }
          </style>
        </head>
        <body>
          <h1>Ficha de ponderación IA</h1>
          <p><b>Jugador:</b> ${escapeHtml(jugador)}</p>
          <p><b>Fecha:</b> ${escapeHtml(fecha)}</p>
          <p><b>Valoración staff:</b> ${escapeHtml(String(valoracionStaff))}/10</p>
          <h2>Bloques IA</h2>
          <table>
            <thead><tr><th>Parámetro</th><th>Valor</th></tr></thead>
            <tbody>${bloques}</tbody>
          </table>
          <p class="score">Resultado IA: ${escapeHtml(String(iaPreview.score))}/10</p>
          <p class="formula">Fórmula: ${escapeHtml(String(iaPreview.formula || '-'))}</p>
        </body>
      </html>
    `;
  };

  const exportarFichaPonderacionIA = async () => {
    if (!iaSelectedPlayer) {
      Alert.alert('Sin jugador', 'Selecciona un jugador para exportar su ficha de ponderación IA.');
      return;
    }
    try {
      const html = buildFichaPonderacionIAHtml();
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('No disponible', 'No se puede compartir en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Exportar ficha de ponderación IA',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `No se pudo exportar la ficha IA. ${msg}`);
    }
  };

  const vistaPreviaFichaPonderacionIA = async () => {
    if (!iaSelectedPlayer) {
      Alert.alert('Sin jugador', 'Selecciona un jugador para previsualizar su ficha IA.');
      return;
    }
    try {
      const html = buildFichaPonderacionIAHtml();
      await Print.printAsync({ html });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `No se pudo abrir la vista previa. ${msg}`);
    }
  };

  const exportarFormularioPersonal = async () => {
    if (!iaSelectedPlayer) {
      Alert.alert('Sin jugador', 'Selecciona un jugador para exportar su formulario personal.');
      return;
    }
    const sectionsHtml = PERSONAL_FORM_SECTIONS.map((section) => {
      const rows = section.questions.map((q) => {
        const value = personalAnswers[q.id] || '';
        const printable = q.type === 'number' ? value : getPersonalOptionLabel(q, value);
        return `<div class="row"><span class="label">${escapeHtml(q.label)}:</span> ${escapeHtml(printable || '-')}</div>`;
      }).join('');
      return `<h2>${escapeHtml(section.title)}</h2>${section.description ? `<p class="meta">${escapeHtml(section.description)}</p>` : ''}${rows}`;
    }).join('');
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; padding: 16px; }
            h1 { font-size: 20px; margin-bottom: 8px; color: #012E57; }
            .meta { font-size: 12px; color: #333; margin-bottom: 10px; }
            .row { margin-bottom: 8px; font-size: 13px; }
            .label { font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Formulario personal</h1>
          <div class="meta">Jugador: ${escapeHtml(iaSelectedPlayer.name || iaSelectedPlayer.nominal || '-')}</div>
          <div class="row"><span class="label">Fecha:</span> ${escapeHtml(evalFecha || todayDDMMYYYY())}</div>
          <div class="row"><span class="label">Puntuación evaluación personal:</span> ${escapeHtml(String(evalScore || '-'))}/10</div>
          <div class="row"><span class="label">Observaciones:</span> ${escapeHtml(evalObservaciones || '-')}</div>
          ${sectionsHtml}
        </body>
      </html>
    `;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('No disponible', 'No se puede compartir en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'Exportar formulario personal',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `No se pudo exportar. ${msg}`);
    }
  };

  const imprimirFormularioPersonal = async () => {
    if (!iaSelectedPlayer) {
      Alert.alert('Sin jugador', 'Selecciona un jugador para imprimir su formulario personal.');
      return;
    }
    const sectionsHtml = PERSONAL_FORM_SECTIONS.map((section) => {
      const rows = section.questions.map((q) => {
        const value = personalAnswers[q.id] || '';
        const printable = q.type === 'number' ? value : getPersonalOptionLabel(q, value);
        return `<p><b>${escapeHtml(q.label)}:</b> ${escapeHtml(printable || '-')}</p>`;
      }).join('');
      return `<h3>${escapeHtml(section.title)}</h3>${rows}`;
    }).join('');
    const html = `
      <html>
        <head><meta charset="utf-8" /></head>
        <body style="font-family: Arial; padding: 16px;">
          <h2>Formulario personal</h2>
          <p><b>Jugador:</b> ${escapeHtml(iaSelectedPlayer.name || iaSelectedPlayer.nominal || '-')}</p>
          <p><b>Fecha:</b> ${escapeHtml(evalFecha || todayDDMMYYYY())}</p>
          <p><b>Puntuación:</b> ${escapeHtml(String(evalScore || '-'))}/10</p>
          <p><b>Observaciones:</b> ${escapeHtml(evalObservaciones || '-')}</p>
          ${sectionsHtml}
        </body>
      </html>
    `;
    try {
      await Print.printAsync({ html });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `No se pudo imprimir. ${msg}`);
    }
  };

  useEffect(() => {
    setEdad(calcularEdadDesdeFecha(fechaNacimiento));
  }, [fechaNacimiento]);

  useEffect(() => {
    if (!listadoModalVisible) setListadoPreviewVisible(false);
  }, [listadoModalVisible]);

  useEffect(() => {
    if (!personalFormVisible) return;
    setEvalScore(computePersonalScore(personalAnswers));
  }, [personalAnswers, personalFormVisible]);

  // Evitamos auto-guardado al abrir pantalla para prevenir cierres por datos heredados.
  // La normalización de IA se aplica al guardar/editar cada jugador.

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permiso denegado", "Se requiere acceso a la galería para subir fotos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          const tempUri = `${FileSystem.cacheDirectory}plantilla_photo_${Date.now()}.jpg`;
          await FileSystem.writeAsStringAsync(tempUri, asset.base64, { encoding: FileSystem.EncodingType.Base64 });
          setPhoto(tempUri);
        } else if (asset.uri) {
          setPhoto(asset.uri);
        }
      }
    } catch (e) {
      Alert.alert("Error", "No se pudo abrir la galería. " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleSave = async () => {
    if (!nombreCompleto.trim()) return Alert.alert("Error", "El nombre completo es obligatorio");
    if (!nominal.trim()) return Alert.alert("Error", "El nombre nominal es obligatorio");

    const playerId = editingId || createPlayerId();
    let photoUrl = photo;
    let photoDriveUrl: string | undefined =
      photo && String(photo).includes('drive.google.com') ? String(photo) : undefined;
    let photoDriveFileId: string | undefined;
    if (photo && (String(photo).startsWith('file://') || String(photo).startsWith('content://'))) {
      setUploadingPhoto(true);
      try {
        let base64: string;
        try {
          base64 = await FileSystem.readAsStringAsync(photo, { encoding: FileSystem.EncodingType.Base64 });
        } catch (readErr) {
          try {
            const tempUri = `${FileSystem.cacheDirectory}plantilla_photo_${Date.now()}.jpg`;
            await FileSystem.copyAsync({ from: photo, to: tempUri });
            base64 = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });
            await FileSystem.deleteAsync(tempUri, { idempotent: true });
          } catch (copyErr) {
            Alert.alert("Error al guardar foto", "No se pudo acceder a la imagen. Vuelve a elegir la foto desde la galería y guarda de nuevo.");
            setUploadingPhoto(false);
            return;
          }
        }
        if (!base64 || base64.length === 0) {
          Alert.alert("Error", "No se pudo leer la imagen. Prueba con otra foto.");
          setUploadingPhoto(false);
          return;
        }
        try {
          const res = await uploadPhotoToDrive(base64, nominal.trim());
          if (res.success && res.url) {
            photoUrl = res.url;
            photoDriveUrl = res.url;
            if (res.fileId) photoDriveFileId = res.fileId;
          } else {
            Alert.alert("Error", res.message || "No se pudo guardar la foto en Drive.");
            setUploadingPhoto(false);
            return;
          }
        } catch (_) {
          Alert.alert("Error", "No se pudo guardar la foto en Drive. Comprueba la conexión.");
          setUploadingPhoto(false);
          return;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert("Error al guardar foto", msg || "Comprueba la conexión y vuelve a intentarlo.");
      } finally {
        setUploadingPhoto(false);
      }
    }

    const previousPlayer = editingId ? safePlayers.find((p: any) => p.id === editingId) : undefined;
    if (!photoDriveUrl && previousPlayer?.photoDriveUrl) {
      photoDriveUrl = String(previousPlayer.photoDriveUrl);
    }
    if (!photoDriveFileId && previousPlayer?.photoDriveFileId) {
      photoDriveFileId = String(previousPlayer.photoDriveFileId);
    }
    const playerData = normalizePlayerRatings({
      id: playerId, 
      name: nominal,
      number: role === 'Jugador' ? dorsal : '', 
      role,
      posicion: role === 'Jugador' ? posicion : 'Staff',
      posicionPrincipal: role === 'Jugador' ? ((posicion || '').split(',')[0]?.trim() || 'Ala') : 'Staff',
      ladoPreferido: role === 'Jugador' ? (ladosJuego[0] || 'Centro') : '',
      ladosJuego: role === 'Jugador' ? ladosJuego : [],
      photo: photoUrl,
      photoDriveUrl,
      photoDriveFileId,
      nombreCompleto,
      nominal,
      fechaNacimiento,
      numeroLicencia,
      edad,
      aniosEquipo,
      perfilTactico,
      estadoFisico,
      disponibilidad,
      tallaSuperior,
      tallaInferior,
      tallaPie,
      numeroPie,
      valoracionStaff,
      control,
      pase,
      lecturaJuego,
      tomaDecision,
      velocidad,
      resistencia,
      concentracion,
      competitividad,
      evaluacionesDI: previousPlayer?.evaluacionesDI || [],
    }, previousPlayer, { partidos: safePartidos as any[], entrenos: safeEntrenos as any[] });

    if (editingId) {
      await setPlayers(safePlayers.map((p: any) => p.id === editingId ? playerData : p));
    } else {
      await setPlayers([...safePlayers, playerData]);
    }
    resetForm();
  };

  const resetForm = () => {
    setNombreCompleto(''); 
    setNominal(''); 
    setFechaNacimiento('');
    setNumeroLicencia('');
    setEdad('');
    setAniosEquipo('');
    setDorsal(''); 
    setRole('Jugador'); 
    setPosicion('Ala'); 
    setLadosJuego([]);
    setPhoto(null);
    setPerfilTactico('');
    setEstadoFisico('OK');
    setDisponibilidad('Garantizado');
    setTallaSuperior('M');
    setTallaInferior('M');
    setTallaPie('M');
    setNumeroPie('42');
    setValoracionStaff(3);
    setControl(3);
    setPase(3);
    setLecturaJuego(3);
    setTomaDecision(3);
    setVelocidad(3);
    setResistencia(3);
    setConcentracion(3);
    setCompetitividad(3);
    setEvalFecha('');
    setEvalEdad('');
    setEvalExperienciaFS('');
    setEvalScore(3);
    setEvalObservaciones('');
    setIaEditorVisible(false);
    setPersonalFormVisible(false);
    setResultadosVisible(false);
    setEditingId(null); 
    setModalVisible(false);
  };

  const loadPlayerIntoForm = (p: any) => {
    setEditingId(p.id);
    // Recuperamos datos extendidos si existen; si no, usamos el shape antiguo
    setNombreCompleto(p.nombreCompleto || p.name || '');
    setNominal(p.nominal || p.name || '');
    const fecha = p.fechaNacimiento || '';
    setFechaNacimiento(fecha);
    setNumeroLicencia(p.numeroLicencia || '');
    setEdad(calcularEdadDesdeFecha(fecha) || p.edad || '');
    setAniosEquipo(String(p.aniosEquipo ?? '').trim());
    setDorsal(p.number || '');
    setRole(p.role);
    setPosicion(p.posicion || 'Ala');
    setLadosJuego(
      Array.isArray(p.ladosJuego)
        ? p.ladosJuego
        : typeof p.ladosJuego === 'string'
        ? p.ladosJuego.split(',').map((s) => s.trim()).filter(Boolean)
        : []
    );
    setPhoto(p.photo || null);
    setPerfilTactico(p.perfilTactico || '');
    setEstadoFisico(p.estadoFisico || 'OK');
    setDisponibilidad(p.disponibilidad || 'Garantizado');
    setTallaSuperior(p.tallaSuperior || 'M');
    setTallaInferior(p.tallaInferior || 'M');
    setTallaPie(p.tallaPie || 'M');
    setNumeroPie(p.numeroPie || '42');
    setValoracionStaff(scaleTo10(p.valoracionStaff, 1, 10, 6));
    setControl(clampRate(p.control));
    setPase(clampRate(p.pase));
    setLecturaJuego(clampRate(p.lecturaJuego));
    setTomaDecision(clampRate(p.tomaDecision));
    setVelocidad(clampRate(p.velocidad));
    setResistencia(clampRate(p.resistencia));
    setConcentracion(clampRate(p.concentracion));
    setCompetitividad(clampRate(p.competitividad));
    const evals = Array.isArray(p.evaluacionesDI) ? p.evaluacionesDI : [];
    const lastEval = evals.length ? evals[evals.length - 1] : null;
    setEvalFecha(lastEval?.fecha || todayDDMMYYYY());
    setEvalEdad(String(lastEval?.edad ?? p.edad ?? ''));
    setEvalExperienciaFS(String(lastEval?.experienciaFS ?? ''));
    setEvalScore(scaleTo10(lastEval?.score, 0, 10, 0));
    setEvalObservaciones(lastEval?.observaciones || '');
  };

  const cyclePlayerDisponibilidad = async (p: any) => {
    if (String(p?.role || '') !== 'Jugador') return;
    const next = cycleDisponibilidad(p?.disponibilidad);
    const patch: any = { disponibilidad: next };
    if (next === 'No disponible') patch.onCourt = false;
    await setPlayers(safePlayers.map((x: any) => (x.id === p.id ? { ...x, ...patch } : x)));
  };

  const cyclePlayerEstadoFisico = async (p: any) => {
    if (String(p?.role || '') !== 'Jugador') return;
    const next = cycleEstadoFisico(p?.estadoFisico);
    const patch: any = { estadoFisico: next };
    if (next === 'Lesionado') {
      patch.disponibilidad = 'No disponible';
      patch.onCourt = false;
    } else if (next === 'OK' && p?.disponibilidad === 'No disponible' && p?.estadoFisico === 'Lesionado') {
      patch.disponibilidad = 'Garantizado';
    }
    await setPlayers(safePlayers.map((x: any) => (x.id === p.id ? { ...x, ...patch } : x)));
  };

  const startEdit = (p) => {
    loadPlayerIntoForm(p);
    setModalVisible(true);
  };

  const currentEditIndex = plantillaVisible.findIndex((p: any) => String(p.id) === String(editingId || ''));
  const canGoPrevPlayer = currentEditIndex > 0;
  const canGoNextPlayer = currentEditIndex >= 0 && currentEditIndex < plantillaVisible.length - 1;

  const navigateEditPlayer = (dir: 'prev' | 'next') => {
    if (currentEditIndex < 0) return;
    const nextIndex = dir === 'next' ? currentEditIndex + 1 : currentEditIndex - 1;
    const target = plantillaVisible[nextIndex];
    if (!target) {
      Alert.alert('Sin más fichas', dir === 'next' ? 'Ya estás en el último miembro.' : 'Ya estás en el primer miembro.');
      return;
    }
    loadPlayerIntoForm(target);
  };

  const deletePlayer = (id) => {
    Alert.alert("Eliminar", "¿Borrar a este miembro de la plantilla?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => setPlayers(safePlayers.filter((p: any) => p.id !== id)) }
    ]);
  };

  const quickAddPhoto = (p) => {
    // Abrimos la ficha en modo edición y, si no tiene foto, lanzamos directamente el selector
    startEdit(p);
    if (!p.photo) {
      setTimeout(() => {
        pickImage();
      }, 300);
    }
  };

  const openInformesModal = () => {
    const firstId = rosterPlayers[0]?.id != null ? String(rosterPlayers[0].id) : null;
    setInformesModo('uno');
    setInformesPlayerId(firstId);
    setInformesCompareIds([]);
    setInformesSecciones({
      familia: true,
      valoraciones: false,
      ponderacion: false,
      personal: false,
      resultado: false,
    });
    setInformesModalVisible(true);
  };

  const informesPdfBaseStyles = `
    @page { margin: 11mm 10mm; }
    body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 10px 8px 16px; color: #1a1a1a; font-size: 10.5px; line-height: 1.35; }
    .brand { text-align: center; color: #0D47A1; font-size: 10px; font-weight: 800; margin: 0 0 4px; letter-spacing: 0.04em; }
    h1 { color: #012E57; font-size: 18px; margin: 4px 0 10px; text-align: center; font-weight: 800; }
    h2 { color: #0E3A66; font-size: 12.5px; margin: 16px 0 8px; border-bottom: 1px solid #90A4AE; padding-bottom: 4px; font-weight: 800; }
    h3 { color: #37474F; font-size: 10.5px; margin: 10px 0 5px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; table-layout: fixed; }
    th, td { border: 1px solid #b0bec5; padding: 6px 5px; text-align: center; vertical-align: middle; word-wrap: break-word; font-size: 9px; }
    th { background: #012E57; color: #fff; font-weight: 700; }
    tr:nth-child(even) td { background: #f5f7fa; }
    table.compare th, table.compare td { font-size: 7px; padding: 4px 2px; line-height: 1.2; hyphens: auto; }
    .left { text-align: left; }
    .page-break { page-break-after: always; break-after: page; height: 0; margin: 0; padding: 0; }
    .muted { color: #546e7a; font-size: 9.5px; line-height: 1.3; }
    .formula { font-size: 8px; color: #263238; text-align: left; line-height: 1.3; }
    .row { margin-bottom: 6px; font-size: 10.5px; }
    .label { font-weight: bold; }
  `;

  const playerLabelInformes = (p: any) => String(p?.nominal || p?.name || '?');

  const mergePlayerForIaExport = (p: any) => ({
    ...p,
    posicionPrincipal: ((p.posicion || '').split(',')[0] || 'Ala').trim(),
    valoracionStaff: clampRate(p.valoracionStaff),
    control: clampRate(p.control),
    pase: clampRate(p.pase),
    lecturaJuego: clampRate(p.lecturaJuego),
    tomaDecision: clampRate(p.tomaDecision),
    velocidad: clampRate(p.velocidad),
    resistencia: clampRate(p.resistencia),
    concentracion: clampRate(p.concentracion),
    competitividad: clampRate(p.competitividad),
    estadoFisico: p.estadoFisico || 'OK',
    disponibilidad: p.disponibilidad || 'Garantizado',
    evaluacionesDI: Array.isArray(p.evaluacionesDI) ? p.evaluacionesDI : [],
  });

  const iaContextExport = () => ({ partidos: safePartidos as any[], entrenos: safeEntrenos as any[] });

  const latestPersonalEvalEntryExport = (p: any) => {
    const evs = Array.isArray(p?.evaluacionesDI) ? p.evaluacionesDI : [];
    for (let i = evs.length - 1; i >= 0; i--) {
      if (evs[i]?.personalForm && typeof evs[i].personalForm.answers === 'object') return evs[i];
    }
    return null;
  };

  const personalAnswersFromPlayerExport = (p: any): Record<string, string> => {
    const latest = latestPersonalEvalEntryExport(p);
    if (latest?.personalForm?.answers) return { ...latest.personalForm.answers };
    return { edad_personal: String(p?.edad ?? ''), anios_fs: '' };
  };

  const buildValoracionesDiHtmlExport = (p: any) => {
    const evs = Array.isArray(p?.evaluacionesDI) ? p.evaluacionesDI : [];
    if (!evs.length) return `<h2>Valoraciones (DI) — ${escapeHtml(playerLabelInformes(p))}</h2><p class="muted">Sin entradas en historial.</p>`;
    const rows = evs
      .map((ev: any) => {
        const tipo = ev?.personalForm && typeof ev.personalForm === 'object' ? 'Personal' : 'IA / periódica';
        const obs = String(ev?.observaciones || '').slice(0, 140);
        return `<tr><td>${escapeHtml(String(ev?.fecha || '-'))}</td><td>${escapeHtml(tipo)}</td><td>${escapeHtml(String(ev?.score ?? '-'))}</td><td class="left">${escapeHtml(obs)}</td></tr>`;
      })
      .join('');
    return `
      <h2>Valoraciones (DI) — ${escapeHtml(playerLabelInformes(p))}</h2>
      <table class="individual"><thead><tr><th>Fecha</th><th>Tipo</th><th>Nota</th><th class="left">Observaciones</th></tr></thead><tbody>${rows}</tbody></table>
    `;
  };

  const buildPonderacionHtmlExport = (p: any) => {
    const merged = mergePlayerForIaExport(p);
    const preview = explainValoracionIA(merged, iaContextExport());
    const bloques = [
      ['Control', merged.control],
      ['Pase', merged.pase],
      ['Lectura de juego', merged.lecturaJuego],
      ['Toma de decisión', merged.tomaDecision],
      ['Velocidad', merged.velocidad],
      ['Resistencia', merged.resistencia],
      ['Concentración', merged.concentracion],
      ['Competitividad', merged.competitividad],
    ]
      .map(([k, v]) => `<tr><td>${escapeHtml(String(k))}</td><td>${escapeHtml(String(v))}</td></tr>`)
      .join('');
    return `
      <h2>Ficha de ponderación IA — ${escapeHtml(playerLabelInformes(p))}</h2>
      <p><b>Valoración staff:</b> ${escapeHtml(String(clampRate(p.valoracionStaff)))}/10</p>
      <table class="individual"><thead><tr><th>Parámetro</th><th>Valor</th></tr></thead><tbody>${bloques}</tbody></table>
      <p><b>IA (skills combinados):</b> ${escapeHtml(String(preview.context.fichaPonderacionScore))}/10</p>
    `;
  };

  const buildFormularioPersonalHtmlExport = (p: any) => {
    const answers = personalAnswersFromPlayerExport(p);
    const score = computePersonalScore(answers);
    const latest = latestPersonalEvalEntryExport(p);
    const fecha = latest?.fecha || todayDDMMYYYY();
    const sectionsHtml = PERSONAL_FORM_SECTIONS.map((section) => {
      const rows = section.questions
        .map((q) => {
          const value = answers[q.id] || '';
          const printable = q.type === 'number' ? value : getPersonalOptionLabel(q, value);
          return `<div class="row"><span class="label">${escapeHtml(q.label)}:</span> ${escapeHtml(printable || '-')}</div>`;
        })
        .join('');
      return `<h3>${escapeHtml(section.title)}</h3>${section.description ? `<p class="muted">${escapeHtml(section.description)}</p>` : ''}${rows}`;
    }).join('');
    return `
      <h2>Formulario personal — ${escapeHtml(playerLabelInformes(p))}</h2>
      <p class="muted">Último guardado: ${escapeHtml(String(fecha))} · Puntuación: ${escapeHtml(String(score))}/10</p>
      ${sectionsHtml}
    `;
  };

  const buildResultadoValoracionHtmlExport = (p: any) => {
    const merged = mergePlayerForIaExport(p);
    const preview = explainValoracionIA(merged, iaContextExport());
    const ctx = preview.context;
    const iaGlobal = p.valoracionIA ?? calculateValoracionIA(merged, iaContextExport());
    return `
      <h2>Resultado valoración — ${escapeHtml(playerLabelInformes(p))}</h2>
      <table class="individual">
        <thead><tr><th class="left">Concepto</th><th>Valor</th></tr></thead>
        <tbody>
          <tr><td class="left">Valoración IA global</td><td>${escapeHtml(String(iaGlobal))}/10</td></tr>
          <tr><td class="left">Staff (escala)</td><td>${escapeHtml(String(ctx.staffScore))}/10</td></tr>
          <tr><td class="left">Contexto entrenos</td><td>${escapeHtml(String(ctx.entrenosPct))}%</td></tr>
          <tr><td class="left">Contexto partidos</td><td>${escapeHtml(String(ctx.partidosPct))}%</td></tr>
          <tr><td class="left">Goles / minutos (conv.)</td><td>${escapeHtml(String(ctx.goles))} gol · ${escapeHtml(String(ctx.minutos))} min</td></tr>
          <tr><td class="left">GF / (GF+GC) %</td><td>${escapeHtml(String(ctx.favorContraPct))}%</td></tr>
          <tr><td class="left">Media eval. DI</td><td>${ctx.evaluacionDIScore == null ? '-' : `${escapeHtml(String(ctx.evaluacionDIScore))}/10`}</td></tr>
        </tbody>
      </table>
      <p class="formula"><b>Fórmula:</b> ${escapeHtml(preview.formula || '-')}</p>
    `;
  };

  const composePlayerInformeBlocksHtml = (p: any, sec: InformesSecciones) => {
    const parts: string[] = [
      buildReportHeaderHtml({
        title: playerLabelInformes(p),
        escudoUri,
        equipo: equipoNombre,
        temporada: temporadaNombre,
        brandLabel: `${REPORT_BRAND.appName} · INFORMES PLANTILLA`,
      }),
    ];
    if (sec.familia) {
      const stats = computePlayerSeasonStats(p, safeEntrenos as any[], safePartidos as any[]);
      parts.push(buildFamiliaHtmlExport(stats));
    }
    if (sec.valoraciones) parts.push(buildValoracionesDiHtmlExport(p));
    if (sec.ponderacion) parts.push(buildPonderacionHtmlExport(p));
    if (sec.personal) parts.push(buildFormularioPersonalHtmlExport(p));
    if (sec.resultado) parts.push(buildResultadoValoracionHtmlExport(p));
    return parts.join('');
  };

  const buildCompareValoracionesExport = (plist: any[]) => {
    const rows = plist
      .map((p) => {
        const evs = Array.isArray(p?.evaluacionesDI) ? p.evaluacionesDI : [];
        const last = evs.length ? evs[evs.length - 1] : null;
        return `<tr><td class="left">${escapeHtml(playerLabelInformes(p))}</td><td>${evs.length}</td><td>${escapeHtml(String(last?.fecha || '-'))}</td><td>${escapeHtml(String(last?.score ?? '-'))}</td></tr>`;
      })
      .join('');
    return `<h2>Comparativa — Valoraciones (resumen)</h2><table class="compare"><thead><tr><th class="left">Jugador</th><th>Nº eval.</th><th>Última fecha</th><th>Última nota</th></tr></thead><tbody>${rows}</tbody></table>`;
  };

  const buildComparePonderacionExport = (plist: any[]) => {
    const params: [string, string][] = [
      ['Control', 'control'],
      ['Pase', 'pase'],
      ['Lectura de juego', 'lecturaJuego'],
      ['Toma de decisión', 'tomaDecision'],
      ['Velocidad', 'velocidad'],
      ['Resistencia', 'resistencia'],
      ['Concentración', 'concentracion'],
      ['Competitividad', 'competitividad'],
    ];
    const head = `<tr><th class="left">Parámetro</th>${plist.map((p) => `<th>${escapeHtml(playerLabelInformes(p))}</th>`).join('')}</tr>`;
    const body = params
      .map(([label, key]) => {
        const cells = plist
          .map((p) => {
            const m = mergePlayerForIaExport(p) as Record<string, unknown>;
            return `<td>${escapeHtml(String(m[key] ?? '-'))}</td>`;
          })
          .join('');
        return `<tr><td class="left">${escapeHtml(label)}</td>${cells}</tr>`;
      })
      .join('');
    return `<h2>Comparativa — Ponderación IA</h2><table class="compare"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  };

  const buildComparePersonalExport = (plist: any[]) => {
    const flat = PERSONAL_FORM_SECTIONS.flatMap((s) => s.questions.map((q) => ({ sec: s.title, q })));
    const rows = flat
      .map(({ sec, q }) => {
        const cells = plist
          .map((p) => {
            const ans = personalAnswersFromPlayerExport(p);
            const v = ans[q.id] || '';
            const printable = q.type === 'number' ? v : getPersonalOptionLabel(q, v);
            return `<td>${escapeHtml(printable || '-')}</td>`;
          })
          .join('');
        return `<tr><td class="left">${escapeHtml(sec)} · ${escapeHtml(q.label)}</td>${cells}</tr>`;
      })
      .join('');
    const head = `<tr><th class="left">Pregunta</th>${plist.map((p) => `<th>${escapeHtml(playerLabelInformes(p))}</th>`).join('')}</tr>`;
    return `<h2>Comparativa — Formulario personal</h2><table class="compare"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  };

  const buildCompareResultadoExport = (plist: any[]) => {
    const rows = plist
      .map((p) => {
        const merged = mergePlayerForIaExport(p);
        const preview = explainValoracionIA(merged, iaContextExport());
        const formulaShort = (preview.formula || '').slice(0, 280);
        const iaG = p.valoracionIA ?? calculateValoracionIA(merged, iaContextExport());
        return `<tr><td class="left">${escapeHtml(playerLabelInformes(p))}</td><td>${escapeHtml(String(preview.context.staffScore))}</td><td>${escapeHtml(String(iaG))}</td><td class="left formula">${escapeHtml(formulaShort)}</td></tr>`;
      })
      .join('');
    return `<h2>Comparativa — Resultado valoración</h2><table class="compare"><thead><tr><th class="left">Jugador</th><th>Staff</th><th>IA</th><th class="left">Fórmula (extracto)</th></tr></thead><tbody>${rows}</tbody></table>`;
  };

  const composeCompareInformeHtml = (plist: any[], sec: InformesSecciones) => {
    const intro = buildReportHeaderHtml({
      title: 'Comparativa de jugadores',
      escudoUri,
      equipo: equipoNombre,
      temporada: temporadaNombre,
      brandLabel: `${REPORT_BRAND.appName} · INFORMES PLANTILLA`,
    }) + `<p class="muted">${plist.map((p) => escapeHtml(playerLabelInformes(p))).join(' · ')}</p>`;
    const parts: string[] = [intro];
    if (sec.familia) {
      const rows = plist.map((p) => computePlayerSeasonStats(p, safeEntrenos as any[], safePartidos as any[]));
      parts.push(buildCompareFamiliaHtmlExport(rows));
    }
    if (sec.valoraciones) parts.push(buildCompareValoracionesExport(plist));
    if (sec.ponderacion) parts.push(buildComparePonderacionExport(plist));
    if (sec.personal) parts.push(buildComparePersonalExport(plist));
    if (sec.resultado) parts.push(buildCompareResultadoExport(plist));
    return parts.join('');
  };

  const toggleInformesComparePlayer = (id: string) => {
    setInformesCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const exportInformesPdf = async () => {
    if (informesExporting) return;
    const sec = informesSecciones;
    if (!sec.familia && !sec.valoraciones && !sec.ponderacion && !sec.personal && !sec.resultado) {
      Alert.alert('Secciones', 'Marca al menos un bloque a exportar.');
      return;
    }
    if (!rosterPlayers.length) {
      Alert.alert('Plantilla', 'No hay jugadores en la plantilla.');
      return;
    }
    let innerBody = '';
    if (informesModo === 'uno') {
      const p = rosterPlayers.find((x: any) => String(x.id) === String(informesPlayerId));
      if (!p) {
        Alert.alert('Jugador', 'Selecciona un jugador.');
        return;
      }
      innerBody = composePlayerInformeBlocksHtml(p, sec);
    } else if (informesModo === 'todos') {
      innerBody = rosterPlayers
        .map((p: any, i: number) => {
          const block = composePlayerInformeBlocksHtml(p, sec);
          const brk = i < rosterPlayers.length - 1 ? '<div class="page-break"></div>' : '';
          return `${block}${brk}`;
        })
        .join('');
    } else {
      const plist = informesCompareIds
        .map((id) => rosterPlayers.find((x: any) => String(x.id) === String(id)))
        .filter(Boolean) as any[];
      if (plist.length < 2 || plist.length > 4) {
        Alert.alert('Comparativa', 'Selecciona entre 2 y 4 jugadores (recomendado 2–3).');
        return;
      }
      innerBody = composeCompareInformeHtml(plist, sec);
    }
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>${informesPdfBaseStyles}</style></head><body>${innerBody}</body></html>`;
    try {
      setInformesExporting(true);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Informes plantilla (PDF)',
        ...(Platform.OS === 'ios' ? { UTI: 'com.adobe.pdf' as const } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `No se pudo generar el PDF. ${msg}`);
    } finally {
      setInformesExporting(false);
    }
  };

  const shareInformeFamiliaWhatsApp = async () => {
    if (informesModo !== 'uno') {
      Alert.alert('WhatsApp', 'El texto para familias está disponible en modo «Un jugador».');
      return;
    }
    const p = rosterPlayers.find((x: any) => String(x.id) === String(informesPlayerId));
    if (!p) {
      Alert.alert('Jugador', 'Selecciona un jugador.');
      return;
    }
    try {
      const stats = computePlayerSeasonStats(p, safeEntrenos as any[], safePartidos as any[]);
      await Share.share({ message: buildFamiliaWhatsAppText(stats) });
    } catch {
      Alert.alert('Error', 'No se pudo abrir compartir.');
    }
  };

  const fechaNacimientoInvalida =
    String(fechaNacimiento || '').trim().length === 10 &&
    !calcularEdadDesdeFecha(fechaNacimiento);

  return (
    <SafeAreaView style={[styles.container, { paddingHorizontal: screen.horizontalPadding }]} edges={['top', 'bottom']}>
      <Text style={styles.title}>MI PLANTILLA</Text>

      <View style={styles.plantillaTopActions}>
        <TouchableOpacity onPress={onBack} style={[styles.plantTopBtn, styles.plantTopBtnOutline]}>
          <Text style={styles.plantTopBtnTxtOutline}>← VOLVER</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={[styles.plantTopBtn, styles.plantTopBtnPrimary]}>
          <Text style={styles.plantTopBtnTxt}>+ AÑADIR</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setListadoModalVisible(true)} style={[styles.plantTopBtn, styles.plantTopBtnList]}>
          <Text style={styles.plantTopBtnTxt}>LISTADOS</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={openInformesModal} style={[styles.plantTopBtn, styles.plantTopBtnInformes]}>
          <Text style={styles.plantTopBtnTxt}>INFORMES PDF</Text>
        </TouchableOpacity>
        {onOpenBiblioteca ? (
          <TouchableOpacity onPress={onOpenBiblioteca} style={[styles.plantTopBtn, styles.plantTopBtnBiblio]}>
            <Text style={[styles.plantTopBtnTxt, styles.plantTopBtnTxtBiblio]}>BIBLIOTECA</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {plantillaVisible.map((p: any) => {
          const visibleName = p.nominal || p.name || '';
          const inicial = visibleName ? visibleName[0].toUpperCase() : '?';
          return (
            <View key={p.id} style={[styles.card, p.role === 'Monitor' && styles.cardMonitor]}>
              <TouchableOpacity
                style={styles.cardInfo}
                activeOpacity={0.75}
                onPress={() => startEdit(p)}
              >
                <TouchableOpacity
                  style={styles.miniPhotoContainer}
                  onPress={() => quickAddPhoto(p)}
                  activeOpacity={0.7}
                >
                  {p.photo ? (
                    <Image source={{ uri: p.photo }} style={styles.miniPhoto} />
                  ) : (
                    <Text style={styles.photoPlaceholderTxt}>{inicial}</Text>
                  )}
                </TouchableOpacity>
                <View style={styles.cardTextCol}>
                  <Text style={styles.pName}>{visibleName}</Text>
                  <Text style={styles.pRole}>
                    {p.role === 'Jugador' ? `${p.posicion} | Nº ${p.number}` : 'Monitor / Staff'}
                  </Text>
                  {p.role === 'Jugador' ? (
                    <Text style={styles.pRating}>
                      {`Valoración: ${p.valoracionIA ?? calculateValoracionIA(p)}/10`}
                    </Text>
                  ) : null}
                  {p.perfilTactico ? (
                    <Text style={styles.pPerfil}>Perfil: {p.perfilTactico}</Text>
                  ) : null}
                  <View style={styles.statusRow}>
                    {p.role === 'Jugador' ? (
                      <TouchableOpacity
                        onPress={() => cyclePlayerEstadoFisico(p)}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                      >
                        <Text
                          style={[
                            styles.statusTag,
                            (p.estadoFisico || 'OK') === 'OK'
                              ? { backgroundColor: '#2E7D32' }
                              : (p.estadoFisico || 'OK') === 'Cargado'
                              ? { backgroundColor: '#FFB300' }
                              : { backgroundColor: '#C62828' },
                          ]}
                        >
                          {p.estadoFisico || 'OK'}
                        </Text>
                      </TouchableOpacity>
                    ) : p.estadoFisico ? (
                      <Text
                        style={[
                          styles.statusTag,
                          p.estadoFisico === 'OK'
                            ? { backgroundColor: '#2E7D32' }
                            : p.estadoFisico === 'Cargado'
                            ? { backgroundColor: '#FFB300' }
                            : { backgroundColor: '#C62828' },
                        ]}
                      >
                        {p.estadoFisico}
                      </Text>
                    ) : null}
                    {p.role === 'Jugador' ? (
                      <TouchableOpacity
                        onPress={() => cyclePlayerDisponibilidad(p)}
                        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                      >
                        <Text
                          style={[
                            styles.statusTag,
                            (p.disponibilidad || 'Garantizado') === 'Garantizado'
                              ? { backgroundColor: '#2E7D32' }
                              : (p.disponibilidad || 'Garantizado') === 'Duda'
                              ? { backgroundColor: '#FFB300' }
                              : { backgroundColor: '#C62828' },
                          ]}
                        >
                          {p.disponibilidad || 'Garantizado'}
                        </Text>
                      </TouchableOpacity>
                    ) : p.disponibilidad ? (
                      <Text
                        style={[
                          styles.statusTag,
                          p.disponibilidad === 'Garantizado'
                            ? { backgroundColor: '#2E7D32' }
                            : p.disponibilidad === 'Duda'
                            ? { backgroundColor: '#FFB300' }
                            : { backgroundColor: '#C62828' },
                        ]}
                      >
                        {p.disponibilidad}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => startEdit(p)} style={styles.editBtn}>
                  <Text style={styles.btnTxt}>EDITAR</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deletePlayer(p.id)} style={styles.delBtn}>
                  <Text style={styles.btnTxt}>X</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalShell}>
            <ScrollView style={styles.formScroll} contentContainerStyle={styles.modalScroll}>
              <View style={styles.modalCont}>
              <Text style={styles.modalTitle}>{editingId ? "EDITAR PERFIL" : "NUEVA FICHA"}</Text>
              {editingId ? (
                <View style={styles.editNavRow}>
                  <TouchableOpacity
                    style={[styles.editNavBtn, !canGoPrevPlayer && styles.editNavBtnDisabled]}
                    onPress={() => navigateEditPlayer('prev')}
                    disabled={!canGoPrevPlayer}
                  >
                    <Text style={styles.editNavBtnTxt}>{'< ANTERIOR'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.editNavCounter}>
                    {currentEditIndex + 1}/{plantillaVisible.length}
                  </Text>
                  <TouchableOpacity
                    style={[styles.editNavBtn, !canGoNextPlayer && styles.editNavBtnDisabled]}
                    onPress={() => navigateEditPlayer('next')}
                    disabled={!canGoNextPlayer}
                  >
                    <Text style={styles.editNavBtnTxt}>{'SIGUIENTE >'}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              
              <TouchableOpacity
                style={styles.photoCircle}
                onPress={pickImage}
                onLongPress={() => {
                  if (photo) setPhotoViewerVisible(true);
                }}
                delayLongPress={350}
              >
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.fullPhoto} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.upTxt}>SUBIR</Text>
                    <Text style={styles.upTxt}>FOTO</Text>
                  </View>
                )}
              </TouchableOpacity>
              {photo ? (
                <Text style={styles.photoZoomHint}>Mantén pulsada la foto para verla con zoom</Text>
              ) : null}

              <Text style={styles.label}>NOMBRE COMPLETO:</Text>
              <TextInput
                style={styles.input}
                placeholder="Nombre completo (DNI / ficha)"
                value={nombreCompleto}
                onChangeText={setNombreCompleto}
                placeholderTextColor="#999"
              />

              <Text style={styles.label}>NOMBRE NOMINAL:</Text>
              <TextInput
                style={styles.input}
                placeholder="Nombre nominal visible en la app"
                value={nominal}
                onChangeText={setNominal}
                placeholderTextColor="#999"
              />

              <View style={styles.inlineRow}>
                <View style={styles.inlineFieldWide}>
                  <Text style={styles.label}>FECHA DE NACIMIENTO:</Text>
                  <View style={styles.dateFieldRow}>
                    <DDMMYYYYDatePickerField
                      value={fechaNacimiento}
                      onChange={setFechaNacimiento}
                      variant="dark"
                      narrow={false}
                    />
                  </View>
                  {fechaNacimientoInvalida ? (
                    <Text style={styles.errorTxt}>Fecha invalida. Formato: dd/mm/aaaa</Text>
                  ) : null}
                </View>
                <View style={styles.inlineFieldNarrow}>
                  <Text style={styles.label}>EDAD:</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Edad"
                    value={edad}
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                    editable={false}
                  />
                </View>
              </View>

              <Text style={styles.label}>AÑOS EN EL EQUIPO:</Text>
              <TextInput
                style={styles.input}
                placeholder="Años que lleva en el equipo"
                value={aniosEquipo}
                onChangeText={(t) => setAniosEquipo(t.replace(/[^0-9]/g, '').slice(0, 2))}
                keyboardType="numeric"
                placeholderTextColor="#999"
                maxLength={2}
              />

              <View style={styles.inlineRow}>
                <View style={styles.inlineFieldNarrow}>
                  <Text style={styles.label}>DORSAL:</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Dorsal"
                    value={dorsal}
                    onChangeText={setDorsal}
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                  />
                </View>
                <View style={[styles.inlineFieldWide, styles.inlineFieldRight]}>
                  <Text style={[styles.label, styles.labelRight]}>NÚMERO DE LICENCIA:</Text>
                  <TextInput
                    style={[styles.input, styles.inputRight]}
                    placeholder="Número de licencia federativa"
                    value={numeroLicencia}
                    onChangeText={setNumeroLicencia}
                    placeholderTextColor="#999"
                  />
                </View>
              </View>

              <View style={styles.roleRow}>
                {['Jugador', 'Monitor'].map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleBtn, role === r && styles.roleActive]}
                    onPress={() => {
                      setRole(r);
                      if (r !== 'Jugador') setIaEditorVisible(false);
                    }}
                  >
                    <Text style={[styles.roleTxt, role === r && {color:'#FFF'}]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>VALORACIÓN STAFF (1-10):</Text>
              <View style={styles.ratingRow}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <TouchableOpacity
                    key={`staff-${n}`}
                    style={[styles.ratingBtn, valoracionStaff === n && styles.ratingBtnActive]}
                    onPress={() => setValoracionStaff(n)}
                  >
                    <Text style={[styles.ratingTxt, valoracionStaff === n && styles.ratingTxtActive]}>{n}★</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>VALORACIÓN IA ESTIMADA:</Text>
              <Text style={styles.helperRatingTxt}>{iaPreview.score}/10</Text>

              {role === 'Jugador' && (
                <View style={{width: '100%'}}>
                  <Text style={styles.label}>LADO DE JUEGO (puedes elegir varios):</Text>
                  <View style={styles.posRow}>
                    {opcionesLado.map((lado) => {
                      const activa = ladosJuego.includes(lado);
                      return (
                        <TouchableOpacity
                          key={lado}
                          style={[styles.posBtn, activa && styles.posActive]}
                          onPress={() => toggleLadoJuego(lado)}
                        >
                          <Text style={[styles.posTxt, activa && {color:'#FFF'}]}>{lado}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.label}>POSICIÓN EN EL CAMPO (pueden ser varias):</Text>
                  <View style={styles.posRow}>
                    {posiciones.map(pos => {
                      const seleccionadas = parsePosicionesSeleccionadas();
                      const activa = seleccionadas.includes(pos);
                      return (
                        <TouchableOpacity
                          key={pos}
                          style={[styles.posBtn, activa && styles.posActive]}
                          onPress={() => togglePosicion(pos)}
                        >
                          <Text style={[styles.posTxt, activa && {color:'#FFF'}]}>{pos}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.label}>PERFIL TÁCTICO:</Text>
                  <View style={styles.posRow}>
                    {['Defensivo', 'Ofensivo', 'Finalizador', 'Organizador'].map(tag => {
                      const activos = (perfilTactico || '')
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      const activo = activos.includes(tag);
                      return (
                        <TouchableOpacity
                          key={tag}
                          style={[styles.posBtn, activo && styles.posActive]}
                          onPress={() => {
                            setPerfilTactico(prev => {
                              const actuales = (prev || '')
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean);
                              const existe = actuales.includes(tag);
                              const nuevas = existe
                                ? actuales.filter((t) => t !== tag)
                                : [...actuales, tag];
                              return nuevas.join(', ');
                            });
                          }}
                        >
                          <Text style={[styles.posTxt, activo && {color:'#FFF'}]}>{tag}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>ESTADO FÍSICO:</Text>
                  <View style={styles.posRow}>
                    {['OK', 'Cargado', 'Lesionado'].map(val => (
                      <TouchableOpacity
                        key={val}
                        style={[styles.posBtn, estadoFisico === val && styles.posActive]}
                        onPress={() => {
                          setEstadoFisico(val as any);
                          if (val === 'Lesionado') setDisponibilidad('No disponible');
                        }}
                      >
                        <Text style={[styles.posTxt, estadoFisico === val && {color:'#FFF'}]}>{val}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>DISPONIBILIDAD:</Text>
                  <View style={styles.posRow}>
                    {['Garantizado', 'Duda', 'No disponible'].map(val => (
                      <TouchableOpacity
                        key={val}
                        style={[styles.posBtn, disponibilidad === val && styles.posActive]}
                        onPress={() => setDisponibilidad(val as any)}
                      >
                        <Text style={[styles.posTxt, disponibilidad === val && {color:'#FFF'}]}>{val}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.inlineSelectRow}>
                    <Text style={styles.inlineSelectLabel}>TALLA SUPERIOR:</Text>
                    <TouchableOpacity
                      style={styles.selectBoxInline}
                      onPress={() => openSelectionModal('tallaSuperior')}
                    >
                      <Text style={styles.selectBoxTxt}>{tallaSuperior}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inlineSelectRow}>
                    <Text style={styles.inlineSelectLabel}>TALLA INFERIOR:</Text>
                    <TouchableOpacity
                      style={styles.selectBoxInline}
                      onPress={() => openSelectionModal('tallaInferior')}
                    >
                      <Text style={styles.selectBoxTxt}>{tallaInferior}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inlineSelectRow}>
                    <Text style={styles.inlineSelectLabel}>TALLA PIES:</Text>
                    <TouchableOpacity
                      style={styles.selectBoxInline}
                      onPress={() => openSelectionModal('tallaPie')}
                    >
                      <Text style={styles.selectBoxTxt}>{tallaPie}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.inlineSelectRow}>
                    <Text style={styles.inlineSelectLabel}>Nº DE PIE:</Text>
                    <TouchableOpacity
                      style={styles.selectBoxInline}
                      onPress={() => openSelectionModal('numeroPie')}
                    >
                      <Text style={styles.selectBoxTxt}>{numeroPie}</Text>
                    </TouchableOpacity>
                  </View>
                  {editingId ? (
                    <View style={styles.playerFlowBtnsWrap}>
                      <TouchableOpacity
                        style={[styles.playerFlowBtn, styles.playerFlowBtnRapido]}
                        onPress={() => openDiRapidoForPlayer(String(editingId))}
                      >
                        <Text style={styles.playerFlowBtnTxt}>DI RÁPIDO</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.playerFlowBtn, styles.playerFlowBtnIA]}
                        onPress={() => openIAEditorForPlayer(String(editingId))}
                      >
                        <Text style={styles.playerFlowBtnTxt}>FICHA DE PONDERACIÓN IA</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.playerFlowBtn, styles.playerFlowBtnPersonal]}
                        onPress={() => openPersonalFormForPlayer(String(editingId))}
                      >
                        <Text style={styles.playerFlowBtnTxt}>FORMULARIO PERSONAL</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.playerFlowBtn, styles.playerFlowBtnResult]}
                        onPress={() => openResultadosForPlayer(String(editingId))}
                      >
                        <Text style={styles.playerFlowBtnTxt}>RESULTADO VALORACIÓN</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              )}

              </View>
            </ScrollView>
            <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom + 52, 64) }]}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={uploadingPhoto}>
                <Text style={styles.saveBtnTxt}>{uploadingPhoto ? 'SUBIENDO FOTO...' : 'GUARDAR EN PLANTILLA'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
                <Text style={styles.cancelTxt}>CANCELAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={selectorVisible} transparent animationType="fade" onRequestClose={() => setSelectorVisible(false)}>
        <View style={styles.selectorOverlay}>
          <View style={styles.selectorCard}>
            <Text style={styles.selectorTitle}>{selectorTitle}</Text>
            <ScrollView style={styles.selectorScroll} showsVerticalScrollIndicator>
              {selectorOptions.map((opt) => (
                <TouchableOpacity key={opt} style={styles.selectorOption} onPress={() => applySelectionValue(opt)}>
                  <Text style={styles.selectorOptionTxt}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.selectorCloseBtn} onPress={() => setSelectorVisible(false)}>
              <Text style={styles.selectorCloseTxt}>CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={iaEditorVisible} transparent animationType="slide" onRequestClose={() => setIaEditorVisible(false)}>
        <View style={styles.iaModalOverlay}>
          <View style={styles.iaModalCard}>
            <Text style={styles.iaModalTitle}>FICHA DE PONDERACIÓN IA</Text>
            <Text style={styles.helperRatingTxt}>
              Jugador evaluado: {iaSelectedPlayer?.name || iaSelectedPlayer?.nominal || '-'}
            </Text>
            <Text style={styles.iaSummaryTxt}>
              Posición: {iaPositionLabel} · Pesos: Tec {iaWeightsPct.technique}% / Tac {iaWeightsPct.tactic}% /
              Fis {iaWeightsPct.physical}% / Men {iaWeightsPct.mental}%
            </Text>
            <ScrollView style={styles.iaModalScroll} showsVerticalScrollIndicator>
              <Text style={styles.iaBlockTitle}>BLOQUE TÉCNICO</Text>
              {renderIARow('Control', control, setControl)}
              {renderIARow('Pase', pase, setPase)}

              <Text style={styles.iaBlockTitle}>BLOQUE TÁCTICO</Text>
              {renderIARow('Lectura de juego', lecturaJuego, setLecturaJuego)}
              {renderIARow('Toma de decisión', tomaDecision, setTomaDecision)}

              <Text style={styles.iaBlockTitle}>BLOQUE FÍSICO</Text>
              {renderIARow('Velocidad', velocidad, setVelocidad)}
              {renderIARow('Resistencia', resistencia, setResistencia)}

              <Text style={styles.iaBlockTitle}>BLOQUE MENTAL</Text>
              {renderIARow('Concentración', concentracion, setConcentracion)}
              {renderIARow('Competitividad', competitividad, setCompetitividad)}
              <View style={styles.iaSummaryCard}>
                <Text style={styles.iaSummaryTitle}>Contexto competitivo (incluido en valoración)</Text>
                <Text style={styles.iaSummaryTxt}>Asistencia entrenos: {iaContext.entrenosPct}%</Text>
                <Text style={styles.iaSummaryTxt}>Asistencia partidos: {iaContext.partidosPct}%</Text>
                <Text style={styles.iaSummaryTxt}>Goles: {iaContext.goles} · Minutos: {iaContext.minutos}s</Text>
                <Text style={styles.iaSummaryTxt}>Balance favor/contra: {iaContext.favorContraPct}%</Text>
                <Text style={styles.iaSummaryTxt}>
                  Eval. personal media: {iaContext.evaluacionDIScore == null ? 'Sin datos' : `${iaContext.evaluacionDIScore}/10`}
                </Text>
                <Text style={styles.iaSummaryTxt}>Subscore contexto: {iaContext.contextScore}/10</Text>
              </View>
              <Text style={styles.helperRatingTxt}>
                Bloques → Tec {iaPreview.blocks.technique} · Tac {iaPreview.blocks.tactic} · Fis {iaPreview.blocks.physical} · Men {iaPreview.blocks.mental}
              </Text>
              <Text style={styles.helperRatingTxt}>Fórmula IA: {iaPreview.formula}</Text>
              <Text style={styles.iaSummaryScore}>Resultado IA ahora: {iaPreview.score}/10</Text>
              <TouchableOpacity style={styles.iaPrintBtn} onPress={vistaPreviaFichaPonderacionIA}>
                <Text style={styles.iaPrintBtnTxt}>VISTA PREVIA (ZOOM CON PELLIZCO)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iaShareBtn} onPress={exportarFichaPonderacionIA}>
                <Text style={styles.iaShareBtnTxt}>EXPORTAR / COMPARTIR FICHA IA</Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity style={styles.iaCloseBtn} onPress={saveIAForSelectedPlayer}>
              <Text style={styles.iaCloseBtnTxt}>GUARDAR Y CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={personalFormVisible} transparent animationType="slide" onRequestClose={() => setPersonalFormVisible(false)}>
        <View style={styles.iaModalOverlay}>
          <View style={styles.iaModalCard}>
            <Text style={styles.iaModalTitle}>FORMULARIO PERSONAL</Text>
            <Text style={styles.helperRatingTxt}>
              Jugador: {iaSelectedPlayer?.name || iaSelectedPlayer?.nominal || '-'}
            </Text>
            <ScrollView style={styles.iaModalScroll} showsVerticalScrollIndicator>
              <Text style={styles.personalQuestionLabel}>NOMBRE DEL JUGADOR</Text>
              <TextInput
                style={styles.input}
                value={String(iaSelectedPlayer?.name || iaSelectedPlayer?.nominal || '')}
                editable={false}
                selectTextOnFocus={false}
              />
              <Text style={styles.personalQuestionLabel}>FECHA EVALUACIÓN</Text>
              <View style={styles.dateFieldRow}>
                <DDMMYYYYDatePickerField
                  value={evalFecha}
                  onChange={setEvalFecha}
                  variant="dark"
                  narrow={false}
                />
              </View>
              {PERSONAL_FORM_SECTIONS.map((section) => (
                <View key={section.id} style={styles.personalSectionCard}>
                  <Text style={styles.personalSectionTitle}>{section.title}</Text>
                  {section.description ? (
                    <Text style={styles.personalSectionDesc}>{section.description}</Text>
                  ) : null}
                  {section.questions.map((q) => {
                    const compactNum = isCompactNumericChoiceRow(q.options);
                    /** anios_fs se autocalcula desde la ficha del jugador (años en el equipo) y no es editable. */
                    const isAniosEquipoLocked = q.id === 'anios_fs';
                    return (
                    <View key={q.id} style={styles.personalQuestionWrap}>
                      <Text style={styles.personalQuestionLabel}>
                        {q.label}{q.required ? ' *' : ''}
                        {isAniosEquipoLocked ? '  (desde ficha)' : ''}
                      </Text>
                      {q.type === 'number' ? (
                        <TextInput
                          style={[styles.input, isAniosEquipoLocked && styles.inputLocked]}
                          placeholder={q.label}
                          placeholderTextColor="#888"
                          keyboardType="numeric"
                          value={
                            isAniosEquipoLocked
                              ? String(iaSelectedPlayer?.aniosEquipo ?? personalAnswers[q.id] ?? '')
                              : (personalAnswers[q.id] || '')
                          }
                          editable={!isAniosEquipoLocked}
                          onChangeText={(t) => !isAniosEquipoLocked && setPersonalAnswer(q.id, t)}
                        />
                      ) : (
                        <View
                          style={[
                            styles.personalOptionsWrap,
                            compactNum && styles.personalOptionsWrapNumeric,
                          ]}
                        >
                          {(q.options || []).map((opt) => {
                            const active = personalAnswers[q.id] === opt.value;
                            return (
                              <TouchableOpacity
                                key={`${q.id}-${opt.value}`}
                                style={[
                                  styles.personalOptBtn,
                                  compactNum && styles.personalOptBtnNumeric,
                                  active && styles.personalOptBtnActive,
                                ]}
                                onPress={() => setPersonalAnswer(q.id, opt.value)}
                              >
                                <Text
                                  style={[
                                    styles.personalOptBtnTxt,
                                    compactNum && styles.personalOptBtnTxtNumeric,
                                    active && styles.personalOptBtnTxtActive,
                                  ]}
                                >
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                    );
                  })}
                </View>
              ))}
              {renderCalculatedScoreRow('Puntuación evaluación personal (calculada)', evalScore)}
              <TextInput
                style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                placeholder="Observaciones (opcional)"
                placeholderTextColor="#888"
                multiline
                value={evalObservaciones}
                onChangeText={setEvalObservaciones}
              />
              <TouchableOpacity style={styles.iaSaveEvalBtn} onPress={saveFormularioPersonal}>
                <Text style={styles.iaSaveEvalBtnTxt}>GUARDAR FORMULARIO PERSONAL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iaPrintBtn} onPress={imprimirFormularioPersonal}>
                <Text style={styles.iaPrintBtnTxt}>IMPRIMIR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iaShareBtn} onPress={exportarFormularioPersonal}>
                <Text style={styles.iaShareBtnTxt}>EXPORTAR / COMPARTIR</Text>
              </TouchableOpacity>
              <Text style={styles.helperRatingTxt}>
                Historial formularios personales: {Array.isArray(iaSelectedPlayer?.evaluacionesDI) ? iaSelectedPlayer.evaluacionesDI.length : 0}
              </Text>
              <View style={styles.evalHistoryWrap}>
                <Text style={styles.evalHistoryTitle}>Historial de evaluaciones (jugador actual)</Text>
                {selectedPlayerEvaluaciones.length ? (
                  selectedPlayerEvaluaciones.map((ev) => (
                    <View key={`${ev.id}-${ev.fecha}-${ev.tipo}`} style={styles.evalHistoryRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.evalHistoryRowTxt}>
                          {ev.tipo} · {ev.fecha || 'Sin fecha'} · {Number.isFinite(ev.score) && ev.score > 0 ? `${ev.score}/10` : '-'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.evalDeleteBtn}
                        onPress={() => removeEvaluacionForSelectedPlayer(ev.id, ev.tipo, ev.fecha)}
                      >
                        <Text style={styles.evalDeleteBtnTxt}>BORRAR</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <Text style={styles.evalHistoryEmpty}>Sin evaluaciones guardadas para este jugador.</Text>
                )}
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.iaCloseBtn} onPress={() => setPersonalFormVisible(false)}>
              <Text style={styles.iaCloseBtnTxt}>CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={diRapidoVisible} transparent animationType="slide" onRequestClose={() => setDiRapidoVisible(false)}>
        <View style={styles.iaModalOverlay}>
          <View style={styles.iaModalCard}>
            <Text style={styles.iaModalTitle}>DI RÁPIDO</Text>
            <Text style={styles.helperRatingTxt}>
              {iaSelectedPlayer?.name || iaSelectedPlayer?.nominal || '-'} · escala 1–5 · nota /10 automática
            </Text>
            <ScrollView style={{ flexGrow: 0, maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.iaLabel}>Fecha</Text>
              <DDMMYYYYDatePickerField value={evalFecha} onChange={setEvalFecha} variant="light" narrow={false} />
              {DI_RAPIDO_ITEMS.map((item) => (
                <View key={item.id} style={styles.diRapidoRow}>
                  <Text style={styles.diRapidoLabel}>{item.label}</Text>
                  <View style={styles.diRapidoChips}>
                    {[1, 2, 3, 4, 5].map((n) => {
                      const on = diRapidoItems[item.id] === n;
                      return (
                        <TouchableOpacity
                          key={`${item.id}_${n}`}
                          style={[styles.diRapidoChip, on && styles.diRapidoChipOn]}
                          onPress={() => setDiRapidoItems((prev) => ({ ...prev, [item.id]: n }))}
                        >
                          <Text style={[styles.diRapidoChipTxt, on && styles.diRapidoChipTxtOn]}>{n}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
              <Text style={styles.diRapidoScoreLine}>
                Nota calculada: {scoreFromDiRapidoItems(diRapidoItems)}/10
              </Text>
              <TextInput
                style={[styles.input, { minHeight: 56, textAlignVertical: 'top', marginTop: 8 }]}
                placeholder="Observación corta (opcional)"
                placeholderTextColor="#888"
                multiline
                value={evalObservaciones}
                onChangeText={setEvalObservaciones}
              />
              <TouchableOpacity style={styles.diRapidoCopyBtn} onPress={copiarUltimaDiRapido}>
                <Text style={styles.diRapidoCopyBtnTxt}>COPIAR ÚLTIMA</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iaSaveEvalBtn} onPress={saveDiRapido}>
                <Text style={styles.iaSaveEvalBtnTxt}>GUARDAR DI RÁPIDO</Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity style={styles.iaCloseBtn} onPress={() => setDiRapidoVisible(false)}>
              <Text style={styles.iaCloseBtnTxt}>CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={resultadosVisible} transparent animationType="slide" onRequestClose={() => setResultadosVisible(false)}>
        <View style={styles.iaModalOverlay}>
          <View style={styles.iaModalCard}>
            <Text style={styles.iaModalTitle}>RESULTADO DE VALORACIÓN</Text>
            <Text style={styles.iaSummaryTxt}>
              Jugador: {iaSelectedPlayer?.name || iaSelectedPlayer?.nominal || '-'}
            </Text>
            <View style={styles.iaSummaryCard}>
              <Text style={styles.iaSummaryTitle}>Resultado de ponderación IA</Text>
              <Text style={styles.iaSummaryScore}>{iaPreview.score}/10</Text>
            </View>
            <View style={styles.iaSummaryCard}>
              <Text style={styles.iaSummaryTitle}>Resultado de formulario personal</Text>
              <Text style={styles.iaSummaryScore}>
                {iaContext.evaluacionDIScore == null ? 'Sin datos' : `${iaContext.evaluacionDIScore}/10`}
              </Text>
            </View>
            <Text style={styles.helperRatingTxt}>Fórmula IA: {iaPreview.formula}</Text>
            <TouchableOpacity style={styles.iaCloseBtn} onPress={() => setResultadosVisible(false)}>
              <Text style={styles.iaCloseBtnTxt}>CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={informesModalVisible} transparent animationType="slide" onRequestClose={() => setInformesModalVisible(false)}>
        <View style={styles.modalBg}>
          <ScrollView
            style={styles.listadoModalOuterScroll}
            contentContainerStyle={styles.listadoModalOuterScrollContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            <View style={styles.listadoModalCard}>
              <Text style={styles.listadoTitle}>INFORMES PDF</Text>
              <Text style={styles.listadoSub}>
                Informe para familias (asistencia, minutos, goles, DI) o bloques técnicos. El PDF se comparte desde el menú del sistema. En «Un jugador» también puedes enviar texto por WhatsApp.
              </Text>

              <Text style={styles.informesBlockTitle}>Modo</Text>
              <View style={styles.informesModeRow}>
                {(['uno', 'todos', 'comparar'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.informesModeChip, informesModo === m && styles.informesModeChipOn]}
                    onPress={() => setInformesModo(m)}
                  >
                    <Text style={[styles.informesModeChipTxt, informesModo === m && styles.informesModeChipTxtOn]}>
                      {m === 'uno' ? 'Un jugador' : m === 'todos' ? 'Todos' : 'Comparar'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {informesModo === 'uno' ? (
                <>
                  <Text style={styles.informesBlockTitle}>Jugador</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.informesHScroll}>
                    <View style={styles.informesChipRow}>
                      {rosterPlayers.map((p: any) => {
                        const sel = String(informesPlayerId) === String(p.id);
                        return (
                          <TouchableOpacity
                            key={String(p.id)}
                            style={[styles.informesPlayerChip, sel && styles.informesPlayerChipOn]}
                            onPress={() => setInformesPlayerId(String(p.id))}
                          >
                            <Text style={[styles.informesPlayerChipTxt, sel && styles.informesPlayerChipTxtOn]} numberOfLines={1}>
                              {playerLabelInformes(p)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              ) : null}

              {informesModo === 'comparar' ? (
                <>
                  <Text style={styles.informesBlockTitle}>Jugadores (recomendado 2–3, máx. 4)</Text>
                  <View style={styles.informesChipWrap}>
                    {rosterPlayers.map((p: any) => {
                      const sel = informesCompareIds.includes(String(p.id));
                      return (
                        <TouchableOpacity
                          key={`cmp_${p.id}`}
                          style={[styles.informesPlayerChip, sel && styles.informesPlayerChipOn]}
                          onPress={() => toggleInformesComparePlayer(String(p.id))}
                        >
                          <Text style={[styles.informesPlayerChipTxt, sel && styles.informesPlayerChipTxtOn]} numberOfLines={1}>
                            {sel ? '✓ ' : ''}
                            {playerLabelInformes(p)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Text style={styles.informesBlockTitle}>Qué incluir</Text>
              <View style={styles.informesChipWrap}>
                <TouchableOpacity
                  style={styles.informesSecTodosBtn}
                  onPress={() =>
                    setInformesSecciones({
                      familia: true,
                      valoraciones: false,
                      ponderacion: false,
                      personal: false,
                      resultado: false,
                    })
                  }
                >
                  <Text style={styles.informesSecTodosTxt}>Solo familias</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.informesSecTodosBtn}
                  onPress={() =>
                    setInformesSecciones({
                      familia: true,
                      valoraciones: true,
                      ponderacion: true,
                      personal: true,
                      resultado: true,
                    })
                  }
                >
                  <Text style={styles.informesSecTodosTxt}>Marcar todos</Text>
                </TouchableOpacity>
                {(
                  [
                    ['familia', 'Informe familias'],
                    ['valoraciones', 'Valoraciones (DI)'],
                    ['ponderacion', 'Ponderación IA'],
                    ['personal', 'Formulario personal'],
                    ['resultado', 'Resultado valoración'],
                  ] as const
                ).map(([key, label]) => {
                  const on = informesSecciones[key];
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.informesPlayerChip, on && styles.informesPlayerChipOn]}
                      onPress={() => setInformesSecciones((prev) => ({ ...prev, [key]: !prev[key] }))}
                    >
                      <Text style={[styles.informesPlayerChipTxt, on && styles.informesPlayerChipTxtOn]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.listadoActions}>
                <TouchableOpacity
                  style={[styles.listadoExportBtn, informesExporting && { opacity: 0.7 }]}
                  onPress={exportInformesPdf}
                  disabled={informesExporting}
                >
                  <Text style={styles.listadoExportTxt}>{informesExporting ? 'GENERANDO…' : 'EXPORTAR PDF'}</Text>
                </TouchableOpacity>
                {informesModo === 'uno' ? (
                  <TouchableOpacity style={styles.informesWhatsAppBtn} onPress={shareInformeFamiliaWhatsApp}>
                    <Text style={styles.informesWhatsAppTxt}>TEXTO WHATSAPP</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={styles.listadoCloseBtn} onPress={() => setInformesModalVisible(false)}>
                  <Text style={styles.listadoCloseTxt}>CERRAR</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={listadoModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <ScrollView
            style={styles.listadoModalOuterScroll}
            contentContainerStyle={styles.listadoModalOuterScrollContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            <View style={styles.listadoModalCard}>
            <Text style={styles.listadoTitle}>LISTADO DE PLANTILLA</Text>
            <Text style={styles.listadoSub}>Marca los campos que quieres mostrar y exportar.</Text>

            <ScrollView style={styles.listadoFieldsScroll} contentContainerStyle={styles.listadoFieldsWrap}>
              {listadoFields.map((field) => {
                const active = selectedListadoFields.includes(field.key);
                return (
                  <TouchableOpacity
                    key={field.key}
                    style={[styles.fieldChip, active && styles.fieldChipActive]}
                    onPress={() => toggleListadoField(field.key)}
                  >
                    <Text style={[styles.fieldChipTxt, active && styles.fieldChipTxtActive]}>
                      {active ? '✓ ' : ''}{field.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.previewToggleRow}>
              <Text style={styles.previewTitle}>VISTA PREVIA</Text>
              <TouchableOpacity
                style={[styles.previewToggleBtn, listadoPreviewVisible && styles.previewToggleBtnActive]}
                onPress={() => setListadoPreviewVisible((v) => !v)}
              >
                <Text style={styles.previewToggleBtnTxt}>
                  {listadoPreviewVisible ? 'OCULTAR' : 'VER VISTA PREVIA'}
                </Text>
              </TouchableOpacity>
            </View>
            {listadoPreviewVisible ? (
              <Text style={styles.pinchHint}>Pellizca con dos dedos sobre la tabla para ampliarla.</Text>
            ) : null}
            {listadoPreviewVisible ? (
            <View style={styles.previewWrap}>
              <PinchTextZoomArea
                scale={previewZoom.scale}
                onScaleChange={previewZoom.setContinuous}
                style={styles.previewTable}
              >
                {/* Fila 0 fija: esquina + encabezados en una sola fila horizontal */}
                <View style={styles.previewHeaderBand}>
                  <View style={styles.previewCorner}>
                    <Text
                      style={[
                        styles.previewCell,
                        styles.previewHeaderCell,
                        styles.previewCornerTxt,
                        {
                          minWidth: 140 * previewZoom.scale,
                          maxWidth: 140 * previewZoom.scale,
                          fontSize: 11 * previewZoom.scale,
                          paddingVertical: 7 * previewZoom.scale,
                          paddingHorizontal: 8 * previewZoom.scale,
                        },
                      ]}
                      numberOfLines={2}
                    >
                      Jugador
                    </Text>
                  </View>
                  <ScrollView
                    ref={previewHeaderHScrollRef}
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator
                    style={styles.previewHeaderScroll}
                    scrollEventThrottle={16}
                    onScroll={(e) => syncListadoHorizontal(e.nativeEvent.contentOffset.x, 'header')}
                  >
                    <View style={[styles.previewHeaderRow, { minWidth: listadoDataMinWidth * previewZoom.scale }]}>
                      {previewDataFields.length ? (
                        previewDataFields.map((key) => {
                          const field = listadoFields.find((f) => f.key === key);
                          return (
                            <Text
                              key={`h-${key}`}
                              style={[
                                styles.previewCell,
                                styles.previewHeaderCell,
                                {
                                  minWidth: 120 * previewZoom.scale,
                                  fontSize: 11 * previewZoom.scale,
                                  paddingVertical: 7 * previewZoom.scale,
                                  paddingHorizontal: 8 * previewZoom.scale,
                                },
                              ]}
                              numberOfLines={2}
                            >
                              {field?.label || key}
                            </Text>
                          );
                        })
                      ) : (
                        <Text style={styles.previewEmpty}>Selecciona campos para previsualizar.</Text>
                      )}
                    </View>
                  </ScrollView>
                </View>

                {/* Cuerpo: columna nombres (scroll vertical) + datos (scroll H + V), alineados fila a fila */}
                <View style={styles.previewBodyBand}>
                  <ScrollView
                    ref={previewPlayersScrollRef}
                    style={styles.previewPlayersColBody}
                    contentContainerStyle={styles.previewPlayersContent}
                    scrollEventThrottle={16}
                    onScroll={(e) => onPreviewPlayersScroll(e.nativeEvent.contentOffset.y)}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    {plantillaVisible.map((p: any, idx: number) => (
                      <View key={`pn-${p?.id || idx}`} style={styles.previewNameRow}>
                        <Text
                          style={[
                            styles.previewCell,
                            styles.previewPlayerCell,
                            {
                              minWidth: 140 * previewZoom.scale,
                              maxWidth: 140 * previewZoom.scale,
                              fontSize: 11 * previewZoom.scale,
                              paddingVertical: 7 * previewZoom.scale,
                              paddingHorizontal: 8 * previewZoom.scale,
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {getListadoValue(p, 'nominal')}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                  <ScrollView
                    ref={previewBodyHScrollRef}
                    horizontal
                    nestedScrollEnabled
                    style={styles.previewDataHorizontal}
                    showsHorizontalScrollIndicator
                    scrollEventThrottle={16}
                    onScroll={(e) => syncListadoHorizontal(e.nativeEvent.contentOffset.x, 'body')}
                  >
                    <ScrollView
                      ref={previewDataScrollRef}
                      style={styles.previewDataVertical}
                      contentContainerStyle={[styles.previewDataContent, { minWidth: listadoDataMinWidth * previewZoom.scale }]}
                      scrollEventThrottle={16}
                      onScroll={(e) => onPreviewDataScroll(e.nativeEvent.contentOffset.y)}
                      showsVerticalScrollIndicator
                      nestedScrollEnabled
                    >
                      {previewDataFields.length
                        ? plantillaVisible.map((p: any, idx: number) => (
                            <View key={`r-${p?.id || idx}`} style={styles.previewRow}>
                              {previewDataFields.map((key) => (
                                <Text
                                  key={`c-${p?.id || idx}-${key}`}
                                  style={[
                                    styles.previewCell,
                                    {
                                      minWidth: 120 * previewZoom.scale,
                                      fontSize: 11 * previewZoom.scale,
                                      paddingVertical: 7 * previewZoom.scale,
                                      paddingHorizontal: 8 * previewZoom.scale,
                                    },
                                  ]}
                                  numberOfLines={2}
                                >
                                  {getListadoValue(p, key)}
                                </Text>
                              ))}
                            </View>
                          ))
                        : null}
                    </ScrollView>
                  </ScrollView>
                </View>
              </PinchTextZoomArea>
            </View>
            ) : (
              <Text style={styles.previewHint}>
                Selecciona los campos y pulsa "VER VISTA PREVIA" para revisarlos antes de exportar.
              </Text>
            )}

            <View style={styles.listadoActions}>
              <TouchableOpacity
                style={[styles.listadoExportBtn, exportingListado && { opacity: 0.7 }]}
                onPress={exportarListadoSeleccionado}
                disabled={exportingListado}
              >
                <Text style={styles.listadoExportTxt}>
                  {exportingListado ? 'EXPORTANDO...' : 'EXPORTAR'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.listadoCloseBtn} onPress={() => setListadoModalVisible(false)}>
                <Text style={styles.listadoCloseTxt}>CERRAR</Text>
              </TouchableOpacity>
            </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <ZoomableImageModal
        visible={photoViewerVisible}
        uri={photo}
        title={nombreCompleto || nominal || 'Foto del jugador'}
        onClose={() => setPhotoViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33', paddingVertical: 20 },
  title: { color: '#FFF', fontSize: 13, fontWeight: '900', marginBottom: 10, textAlign: 'center' },
  plantillaTopActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: 12, alignItems: 'stretch' },
  plantTopBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plantTopBtnOutline: { borderWidth: 1.5, borderColor: '#1565C0', backgroundColor: 'transparent' },
  plantTopBtnPrimary: { backgroundColor: '#1565C0' },
  plantTopBtnList: { backgroundColor: '#0E4A8A' },
  plantTopBtnInformes: { backgroundColor: '#5E35B1' },
  plantTopBtnBiblio: { backgroundColor: '#FFD166' },
  plantTopBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 10 },
  plantTopBtnTxtBiblio: { color: '#001A33' },
  plantTopBtnTxtOutline: { color: '#64B5F6', fontWeight: '800', fontSize: 10 },
  playerFlowBtnsWrap: { width: '100%', marginTop: 8, marginBottom: 6, gap: 6 },
  playerFlowBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  playerFlowBtnIA: { backgroundColor: '#0E4A8A' },
  playerFlowBtnRapido: { backgroundColor: '#E65100' },
  playerFlowBtnPersonal: { backgroundColor: '#1D6B29' },
  playerFlowBtnResult: { backgroundColor: '#6A1B9A' },
  playerFlowBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 11 },
  diRapidoRow: { marginTop: 10 },
  diRapidoLabel: { color: '#37474F', fontWeight: '700', fontSize: 12, marginBottom: 6 },
  diRapidoChips: { flexDirection: 'row', gap: 6 },
  diRapidoChip: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ECEFF1',
    borderWidth: 1,
    borderColor: '#B0BEC5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diRapidoChipOn: { backgroundColor: '#E65100', borderColor: '#FFB74D' },
  diRapidoChipTxt: { color: '#455A64', fontWeight: '800', fontSize: 14 },
  diRapidoChipTxtOn: { color: '#FFF' },
  diRapidoScoreLine: {
    color: '#E65100',
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 14,
  },
  diRapidoCopyBtn: {
    backgroundColor: '#546E7A',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  diRapidoCopyBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 11 },
  list: { marginTop: 4 },
  card: {
    backgroundColor: '#012E57',
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardMonitor: { borderLeftWidth: 5, borderLeftColor: '#FF6D00' },
  cardInfo: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, minWidth: 0 },
  cardTextCol: { flex: 1, flexShrink: 1, alignSelf: 'flex-start' },
  miniPhotoContainer: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: '#001A33', justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#1565C0' },
  miniPhoto: { width: 45, height: 45 },
  photoPlaceholderTxt: { color: '#1565C0', fontWeight: 'bold', fontSize: 18 },
  pName: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  pRole: { color: '#1565C0', fontSize: 11, fontWeight: '600' },
  pRating: { color: '#90CAF9', fontSize: 10, fontWeight: '700', marginTop: 2 },
  pPerfil: { color: '#AAA', fontSize: 10, fontStyle: 'italic', marginTop: 2 },
  statusRow: { flexDirection: 'row', marginTop: 2, gap: 4 },
  statusTag: { fontSize: 9, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, color: '#FFF' },
  actions: { flexDirection: 'row', alignSelf: 'flex-start', paddingTop: 0 },
  editBtn: { backgroundColor: '#2E7D32', padding: 10, borderRadius: 8, marginRight: 5 },
  delBtn: { backgroundColor: '#B71C1C', padding: 10, borderRadius: 8 },
  btnTxt: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', paddingTop: 10 },
  modalShell: { flex: 1, width: '100%', alignItems: 'center' },
  formScroll: { flex: 1, width: '100%' },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-start', alignItems: 'center', paddingVertical: 16 },
  modalCont: { backgroundColor: '#FFF', width: '90%', paddingVertical: 14, paddingHorizontal: 16, borderTopLeftRadius: 25, borderTopRightRadius: 25, alignItems: 'center' },
  modalTitle: { fontSize: 19, fontWeight: 'bold', marginBottom: 10, color: '#001A33' },
  editNavRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  editNavBtn: { backgroundColor: '#E8EFF7', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, minWidth: 96, alignItems: 'center' },
  editNavBtnDisabled: { opacity: 0.45 },
  editNavBtnTxt: { color: '#0F3B63', fontSize: 10, fontWeight: '800' },
  editNavCounter: { color: '#365068', fontSize: 11, fontWeight: '700' },
  photoCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 4, overflow: 'hidden', borderWidth: 2, borderColor: '#1565C0' },
  fullPhoto: { width: 100, height: 100 },
  photoPlaceholder: { alignItems: 'center' },
  photoZoomHint: { color: '#90CAF9', fontSize: 9, fontStyle: 'italic', marginBottom: 10, textAlign: 'center' },
  upTxt: { fontSize: 10, color: '#1565C0', fontWeight: 'bold' },
  input: { borderBottomWidth: 1, borderColor: '#CCC', paddingVertical: 7, paddingHorizontal: 10, marginBottom: 9, color: '#000', width: '100%', fontSize: 13 },
  inputError: { borderColor: '#C62828', borderBottomWidth: 2 },
  inputLocked: { backgroundColor: '#ECEFF1', color: '#37474F' },
  dateFieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, marginBottom: 6 },
  label: { alignSelf: 'flex-start', fontSize: 10, color: '#4A4A4A', fontWeight: 'bold', marginBottom: 3 },
  errorTxt: { alignSelf: 'flex-start', color: '#C62828', fontSize: 10, marginTop: -5, marginBottom: 6, fontWeight: '600' },
  inlineRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between' },
  inlineFieldWide: { width: '64%' },
  inlineFieldNarrow: { width: '33%' },
  inlineFieldRight: { alignItems: 'flex-end' },
  labelRight: { alignSelf: 'flex-end', textAlign: 'right' },
  inputRight: { textAlign: 'right' },
  roleRow: { flexDirection: 'row', marginBottom: 10 },
  roleBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', backgroundColor: '#F0F0F0', marginHorizontal: 4, borderRadius: 10 },
  roleActive: { backgroundColor: '#1565C0' },
  roleTxt: { fontWeight: 'bold', fontSize: 11, color: '#666' },
  ratingRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginBottom: 6 },
  ratingBtn: { flex: 1, marginHorizontal: 2, paddingVertical: 9, borderRadius: 8, backgroundColor: '#F0F0F0', alignItems: 'center' },
  ratingBtnActive: { backgroundColor: '#FFB300' },
  ratingTxt: { color: '#666', fontWeight: 'bold', fontSize: 10 },
  ratingTxtActive: { color: '#FFF' },
  helperRatingTxt: { alignSelf: 'flex-start', color: '#777', fontSize: 10, marginBottom: 8 },
  posRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 },
  posBtn: { width: '48%', paddingVertical: 8, paddingHorizontal: 8, backgroundColor: '#F0F0F0', marginBottom: 6, borderRadius: 10, alignItems: 'center' },
  posActive: { backgroundColor: '#2E7D32' },
  posTxt: { fontSize: 10, fontWeight: 'bold', color: '#666' },
  inlineSelectRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  inlineSelectLabel: { color: '#4A4A4A', fontSize: 10, fontWeight: 'bold', width: '50%' },
  selectBoxInline: { width: '47%', borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#F9FBFD' },
  selectBoxTxt: { color: '#1F2937', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  iaRow: { width: '100%', marginBottom: 8 },
  iaLabel: { color: '#4A4A4A', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  iaBtns: { flexDirection: 'row', width: '100%', alignItems: 'stretch' },
  iaBtn: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 1,
    backgroundColor: '#EEF2F7',
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iaBtnActive: { backgroundColor: '#1565C0' },
  iaBtnTxt: { color: '#4A5A6A', fontWeight: '700', fontSize: 9 },
  iaBtnTxtActive: { color: '#FFF' },
  iaCalculatedBox: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#C7D9EA',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F4F9FF',
  },
  iaCalculatedValue: { color: '#123A5B', fontSize: 14, fontWeight: '900' },
  iaSummaryCard: { width: '100%', backgroundColor: '#E8F3FF', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#B6D8FB' },
  iaSummaryTitle: { color: '#0E3A66', fontSize: 11, fontWeight: '800', marginBottom: 3 },
  iaSummaryTxt: { color: '#1C4A72', fontSize: 10, fontWeight: '600', marginBottom: 4 },
  iaSummaryScore: { color: '#123A5B', fontSize: 12, fontWeight: '900' },
  iaOpenBtn: { width: '100%', backgroundColor: '#0E4A8A', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  iaOpenBtnTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  iaBlockTitle: { color: '#0E4A8A', fontSize: 10, fontWeight: '900', marginTop: 4, marginBottom: 4, alignSelf: 'flex-start' },
  iaModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  iaModalCard: { width: '90%', maxHeight: '84%', backgroundColor: '#FFF', borderRadius: 14, padding: 12 },
  iaModalTitle: { color: '#001A33', fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  iaPlayersScroll: { maxHeight: 46, marginBottom: 6 },
  iaPlayersRow: { flexDirection: 'row', paddingBottom: 2 },
  iaPlayerChip: { backgroundColor: '#0C3257', borderWidth: 1, borderColor: '#1E527C', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8 },
  iaPlayerChipActive: { backgroundColor: '#1565C0', borderColor: '#8BD1FF' },
  iaPlayerChipTxt: { color: '#CFE8FF', fontSize: 11, fontWeight: '700' },
  iaPlayerChipTxtActive: { color: '#FFF' },
  iaImportBtn: { backgroundColor: '#6A1B9A', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  iaImportBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 11 },
  iaModalScroll: { maxHeight: 470 },
  iaSaveEvalBtn: { backgroundColor: '#2E7D32', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  iaSaveEvalBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 11 },
  personalSectionCard: { backgroundColor: '#F7FAFD', borderWidth: 1, borderColor: '#D9E7F5', borderRadius: 10, padding: 10, marginBottom: 10 },
  personalSectionTitle: { color: '#0E3A66', fontSize: 12, fontWeight: '800', marginBottom: 4 },
  personalSectionDesc: { color: '#5A6B7B', fontSize: 10, marginBottom: 6 },
  personalQuestionWrap: { marginBottom: 8 },
  personalQuestionLabel: { color: '#27465F', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  personalOptionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  personalOptionsWrapNumeric: { flexWrap: 'nowrap', width: '100%', gap: 0 },
  personalOptBtn: { backgroundColor: '#EEF3F8', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8, marginRight: 6, marginBottom: 6 },
  personalOptBtnNumeric: {
    flex: 1,
    minWidth: 0,
    marginRight: 0,
    marginBottom: 0,
    marginHorizontal: 1,
    paddingHorizontal: 0,
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalOptBtnActive: { backgroundColor: '#1565C0' },
  personalOptBtnTxt: { color: '#34526B', fontSize: 10, fontWeight: '700' },
  personalOptBtnTxtNumeric: { fontSize: 9 },
  personalOptBtnTxtActive: { color: '#FFF' },
  iaPrintBtn: { backgroundColor: '#5D4037', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  iaPrintBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 11 },
  iaShareBtn: { backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  iaShareBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 11 },
  evalHistoryWrap: { marginTop: 8, marginBottom: 8, backgroundColor: '#EEF4FA', borderRadius: 10, padding: 10 },
  evalHistoryTitle: { color: '#0F3B63', fontSize: 11, fontWeight: '800', marginBottom: 8 },
  evalHistoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  evalHistoryRowTxt: { color: '#1A2A3A', fontSize: 10, fontWeight: '600' },
  evalHistoryEmpty: { color: '#4A5A6A', fontSize: 10, fontStyle: 'italic' },
  evalDeleteBtn: { backgroundColor: '#B71C1C', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  evalDeleteBtnTxt: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  iaBlocksWrap: { marginBottom: 10 },
  iaBlockCard: { backgroundColor: '#F3F7FC', borderWidth: 1, borderColor: '#D5E3F2', borderRadius: 8, padding: 8, marginBottom: 6 },
  iaBlockCardTitle: { color: '#123A5B', fontSize: 11, fontWeight: '800' },
  iaBlockCardSub: { color: '#2D587D', fontSize: 10, fontWeight: '700' },
  iaBlockCardMeta: { color: '#436480', fontSize: 10, marginTop: 2 },
  iaCloseBtn: { marginTop: 8, backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  iaCloseBtnTxt: { color: '#FFF', fontWeight: '800' },
  selectorOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  selectorCard: { width: '82%', maxHeight: '70%', backgroundColor: '#FFF', borderRadius: 14, padding: 12 },
  selectorTitle: { color: '#001A33', fontWeight: '900', fontSize: 16, textAlign: 'center', marginBottom: 10 },
  selectorScroll: { maxHeight: 320 },
  selectorOption: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E6ECF2' },
  selectorOptionTxt: { color: '#12324A', fontSize: 14, textAlign: 'center', fontWeight: '700' },
  selectorCloseBtn: { marginTop: 10, backgroundColor: '#B71C1C', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  selectorCloseTxt: { color: '#FFF', fontWeight: '800' },
  saveBtn: { backgroundColor: '#1565C0', padding: 12, borderRadius: 15, alignItems: 'center', width: '100%', elevation: 5, marginTop: 2 },
  saveBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  modalFooter: { width: '90%', backgroundColor: '#FFF', borderBottomLeftRadius: 25, borderBottomRightRadius: 25, paddingHorizontal: 16, paddingTop: 8 },
  cancelBtn: { marginTop: 8, alignItems: 'center' },
  cancelTxt: { color: '#B71C1C', fontWeight: 'bold', fontSize: 13 },
  listadoModalOuterScroll: { flex: 1, width: '100%' },
  listadoModalOuterScrollContent: { flexGrow: 1, paddingBottom: 20 },
  listadoModalCard: {
    marginHorizontal: 14,
    marginVertical: 16,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
  },
  listadoTitle: { color: '#001A33', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  listadoSub: { color: '#4f5b66', fontSize: 11, textAlign: 'center', marginTop: 4, marginBottom: 10 },
  listadoFieldsScroll: { maxHeight: 170, marginBottom: 10 },
  listadoFieldsWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  fieldChip: {
    backgroundColor: '#F0F2F5',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 6,
  },
  fieldChipActive: { backgroundColor: '#1565C0' },
  fieldChipTxt: { color: '#46505a', fontSize: 11, fontWeight: '700' },
  fieldChipTxtActive: { color: '#FFF' },
  previewTitle: { color: '#001A33', fontSize: 12, fontWeight: '800', marginBottom: 6 },
  previewToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 },
  previewToggleBtn: { backgroundColor: '#0E4A8A', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  previewToggleBtnActive: { backgroundColor: '#37474F' },
  previewToggleBtnTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  previewHint: { color: '#546E7A', fontSize: 11, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 },
  pinchHint: { color: '#90CAF9', fontSize: 10, fontStyle: 'italic', marginBottom: 4 },
  previewWrap: {
    height: 260,
    borderWidth: 1,
    borderColor: '#D8DDE3',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
    backgroundColor: '#FFF',
  },
  previewTable: { flex: 1, minHeight: 0 },
  previewHeaderBand: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: '#D8DDE3',
    backgroundColor: '#012E57',
    minHeight: 40,
  },
  previewCorner: {
    width: 140,
    borderRightWidth: 1,
    borderRightColor: '#D8DDE3',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 0,
    backgroundColor: '#012E57',
  },
  previewCornerTxt: { minWidth: 140, maxWidth: 140 },
  previewHeaderScroll: { flex: 1, minWidth: 0 },
  previewBodyBand: { flex: 1, flexDirection: 'row', minHeight: 0 },
  previewPlayersColBody: {
    width: 140,
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: '#D8DDE3',
    backgroundColor: '#FFF',
  },
  previewNameRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 1,
    borderTopColor: '#E6EAF0',
    minHeight: 40,
  },
  previewGrid: { flex: 1, flexDirection: 'row' },
  previewPlayersCol: { width: 140, borderRightWidth: 1, borderRightColor: '#D8DDE3' },
  previewPlayersContent: { paddingBottom: 8 },
  previewDataHorizontal: { flex: 1, minWidth: 0 },
  previewDataVertical: { flex: 1, minHeight: 0 },
  previewDataContent: { paddingBottom: 8, flexGrow: 0, alignSelf: 'flex-start' },
  previewHeaderRow: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'stretch', backgroundColor: '#012E57' },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    borderTopWidth: 1,
    borderTopColor: '#E6EAF0',
    minHeight: 40,
  },
  previewCell: {
    minWidth: 120,
    flexShrink: 0,
    paddingVertical: 7,
    paddingHorizontal: 8,
    color: '#23303D',
    fontSize: 11,
  },
  previewPlayerCell: { minWidth: 140, maxWidth: 140 },
  previewHeaderCell: { color: '#FFF', fontWeight: '800' },
  previewEmpty: { color: '#FFF', paddingVertical: 8, paddingHorizontal: 10, fontSize: 11 },
  listadoActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  listadoExportBtn: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#1565C0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  listadoExportTxt: { color: '#FFF', fontWeight: '800' },
  informesWhatsAppBtn: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#128C7E',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  informesWhatsAppTxt: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  listadoCloseBtn: {
    flex: 1,
    minWidth: 100,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B0BEC5',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  listadoCloseTxt: { color: '#455A64', fontWeight: '800' },
  informesBlockTitle: { color: '#001A33', fontSize: 11, fontWeight: '800', marginTop: 10, marginBottom: 6 },
  informesModeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 6 },
  informesModeChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B0BEC5',
    backgroundColor: '#F5F7FA',
  },
  informesModeChipOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  informesModeChipTxt: { color: '#37474F', fontSize: 11, fontWeight: '700' },
  informesModeChipTxtOn: { color: '#FFF' },
  informesHScroll: { maxHeight: 44, marginBottom: 4 },
  informesChipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  informesChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  informesPlayerChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#ECEFF1',
    borderWidth: 1,
    borderColor: '#CFD8DC',
    marginBottom: 4,
  },
  informesPlayerChipOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  informesPlayerChipTxt: { color: '#37474F', fontSize: 10, fontWeight: '700', maxWidth: 140 },
  informesPlayerChipTxtOn: { color: '#FFF' },
  informesSecTodosBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#A5D6A7',
    marginRight: 4,
    marginBottom: 4,
  },
  informesSecTodosTxt: { color: '#1B5E20', fontSize: 10, fontWeight: '800' },
});
