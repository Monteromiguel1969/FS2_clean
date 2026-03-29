import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Alert, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { exportEvaluacionesDI, uploadPhotoToDrive } from '../services/googleSheetsService';
import { normalizePlayerRatings, calculateValoracionIA, explainValoracionIA } from '../utils/playerRating';
import { EVAL_DI_TARGET_PLAYERS, importEvaluacionesHoja2ToPlayers } from '../utils/evaluacionDIImport';

type PersonalOption = { value: string; label: string; score: number };
type PersonalQuestion = {
  id: string;
  label: string;
  required?: boolean;
  type?: 'choice' | 'number';
  options?: PersonalOption[];
};
type PersonalSection = {
  id: string;
  title: string;
  description?: string;
  questions: PersonalQuestion[];
};

const optionsYNProcess: PersonalOption[] = [
  { value: 'SI', label: 'SI', score: 5 },
  { value: 'EN_PROCESO', label: 'EN PROCESO', score: 3 },
  { value: 'NO', label: 'NO', score: 1 },
];
const optionsYN: PersonalOption[] = [
  { value: 'SI', label: 'SI', score: 5 },
  { value: 'NO', label: 'NO', score: 1 },
];
const options12345: PersonalOption[] = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n), score: n }));
const options012345: PersonalOption[] = [0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n), score: n }));

const PERSONAL_FORM_SECTIONS: PersonalSection[] = [
  {
    id: 's1',
    title: 'Sección 1 de 11 · EVALUACIÓN',
    description: 'Descripción del formulario',
    questions: [
      { id: 'edad_personal', label: 'EDAD', required: true, type: 'number' },
      { id: 'anios_fs', label: 'AÑOS EXPERIENCIA EN FS', required: true, type: 'number' },
    ],
  },
  {
    id: 's2',
    title: 'Sección 2 de 11 · COMUNICACIÓN VERBAL',
    questions: [
      { id: 'volumen_voz', label: 'VOLUMEN DE VOZ', required: true, options: options012345 },
      { id: 'claridad_coherencia', label: 'CLARIDAD Y COHERENCIA', required: true, options: options012345 },
      { id: 'habilidades_expresion', label: 'HABILIDADES DE EXPRESIÓN', required: true, options: options012345 },
    ],
  },
  {
    id: 's3',
    title: 'Sección 3 de 11 · COMUNICACIÓN NO VERBAL',
    questions: [
      { id: 'lenguaje_corporal', label: 'LENGUAJE CORPORAL', required: true, options: options12345 },
      { id: 'contacto_visual', label: 'CONTACTO VISUAL', required: true, options: options12345 },
      { id: 'gestos_expresiones', label: 'GESTOS Y EXPRESIONES FACIALES', required: true, options: options12345 },
    ],
  },
  {
    id: 's4',
    title: 'Sección 4 de 11 · COMUNICACIÓN EN EQUIPO',
    questions: [
      { id: 'colaboracion_escucha', label: 'COLABORACIÓN Y ESCUCHA', required: true, options: options12345 },
      { id: 'comunicacion_companeros', label: 'COMUNICACIÓN CON COMPAÑEROS', required: true, options: options12345 },
    ],
  },
  {
    id: 's5',
    title: 'Sección 5 de 11 · PARTICIPACIÓN Y DISFRUTE',
    questions: [
      { id: 'asiste_regularmente', label: 'ASISTE REGULARMENTE A ENTRENAMIENTOS Y PARTIDOS', required: true, options: optionsYNProcess },
      { id: 'motivado_disfruta', label: 'SE MUESTRA MOTIVADO Y DISFRUTA JUGANDO', required: true, options: optionsYNProcess },
      { id: 'cumple_normas', label: 'CUMPLE CON LAS NORMAS Y RESPONSABILIDADES DEL EQUIPO', required: true, options: optionsYNProcess },
    ],
  },
  {
    id: 's6',
    title: 'Sección 6 de 11 · DESARROLLO Y HABILIDADES',
    questions: [
      { id: 'mejora_tecnica', label: 'HA MEJORADO EL CONTROL DEL BALÓN, PASE, TIRO, ETC', required: true, options: optionsYNProcess },
      { id: 'comprende_juego_equipo', label: 'COMPRENDE Y APLICA CONCEPTOS BÁSICOS DEL JUEGO EN EQUIPO', required: true, options: optionsYNProcess },
      { id: 'fomenta_respeto_colaboracion', label: 'FOMENTA LA COMUNICACIÓN, EL RESPETO Y LA COLABORACIÓN', required: true, options: optionsYNProcess },
    ],
  },
  {
    id: 's7',
    title: 'Sección 7 de 11 · HABILIDADES TÉCNICAS CONTROL DEL BALÓN',
    questions: [
      { id: 'cb_precision', label: 'CONTROL DEL BALÓN · PRECISIÓN', required: true, options: options12345 },
      { id: 'cb_mantenimiento', label: 'CONTROL DEL BALÓN · MANTENIMIENTO', required: true, options: options12345 },
      { id: 'cb_movimiento', label: 'CONTROL DEL BALÓN · CONTROL EN MOVIMIENTO', required: true, options: options12345 },
      { id: 'pase_precision', label: 'PASE · PRECISIÓN', required: true, options: options12345 },
      { id: 'pase_fuerza', label: 'PASE · FUERZA', required: true, options: options12345 },
      { id: 'pase_presion', label: 'PASE · SITUACIONES DE PRESIÓN', required: true, options: options12345 },
      { id: 'regate_capacidad', label: 'REGATE · CAPACIDAD', required: true, options: options12345 },
      { id: 'regate_variedad', label: 'REGATE · VARIEDAD', required: true, options: options12345 },
      { id: 'regate_efectividad', label: 'REGATE · EFECTIVIDAD', required: true, options: options12345 },
      { id: 'tiro_precision', label: 'TIRO · PRECISIÓN', required: true, options: options12345 },
      { id: 'tiro_potencia', label: 'TIRO · POTENCIA', required: true, options: options12345 },
      { id: 'tiro_oportunidad', label: 'TIRO · OPORTUNIDAD', required: true, options: options12345 },
      { id: 'conduccion_seguridad', label: 'CONDUCCIÓN · SEGURIDAD', required: true, options: options12345 },
      { id: 'conduccion_ritmo', label: 'CONDUCCIÓN · CAMBIO DE RITMO', required: true, options: options12345 },
      { id: 'conduccion_espacios', label: 'CONDUCCIÓN · ESPACIOS REDUCIDOS', required: true, options: options12345 },
    ],
  },
  {
    id: 's8',
    title: 'Sección 8 de 11 · HABILIDADES TÉCNICAS Y FÍSICAS',
    questions: [
      { id: 'pos_estrategico', label: 'POSICIONAMIENTO · ESTRATÉGICO', required: true, options: options12345 },
      { id: 'pos_roles', label: 'POSICIONAMIENTO · ROLES', required: true, options: options12345 },
      { id: 'pos_apoyo', label: 'POSICIONAMIENTO · APOYO', required: true, options: options12345 },
      { id: 'td_opciones', label: 'TOMA DE DECISIONES · OPCIONES DE JUEGO', required: true, options: options12345 },
      { id: 'td_rapidez', label: 'TOMA DE DECISIONES · RAPIDEZ', required: true, options: options12345 },
      { id: 'td_individual_colectivo', label: 'TOMA DE DECISIONES · JUEGO INDIVIDUAL/COLECTIVO', required: true, options: options12345 },
      { id: 'equipo_comunicacion', label: 'JUEGO EN EQUIPO · COMUNICACIÓN', required: true, options: options12345 },
      { id: 'equipo_cooperacion', label: 'JUEGO EN EQUIPO · COOPERACIÓN', required: true, options: options12345 },
      { id: 'equipo_respeto', label: 'JUEGO EN EQUIPO · RESPETO', required: true, options: options12345 },
      { id: 'entend_reglas', label: 'ENTENDIMIENTO DEL JUEGO · REGLAS', required: true, options: options12345 },
      { id: 'entend_estrategia', label: 'ENTENDIMIENTO DEL JUEGO · ESTRATEGIA', required: true, options: options12345 },
      { id: 'entend_adaptacion', label: 'ENTENDIMIENTO DEL JUEGO · ADAPTACIÓN', required: true, options: options12345 },
      { id: 'res_nivel', label: 'RESISTENCIA · NIVEL DE RENDIMIENTO', required: true, options: options12345 },
      { id: 'res_recuperacion', label: 'RESISTENCIA · RECUPERACIÓN', required: true, options: options12345 },
      { id: 'res_participacion', label: 'RESISTENCIA · PARTICIPACIÓN', required: true, options: options12345 },
      { id: 'vel_carrera', label: 'VELOCIDAD · CARRERA', required: true, options: options12345 },
      { id: 'vel_reaccion', label: 'VELOCIDAD · REACCIÓN', required: true, options: options12345 },
      { id: 'vel_aceleracion', label: 'VELOCIDAD · ACELERACIÓN', required: true, options: options12345 },
      { id: 'fuerza_piernas', label: 'FUERZA · PIERNAS', required: true, options: options12345 },
      { id: 'fuerza_tren_sup', label: 'FUERZA · TREN SUPERIOR', required: true, options: options12345 },
      { id: 'fuerza_coordinacion', label: 'FUERZA · COORDINACIÓN', required: true, options: options12345 },
      { id: 'agi_cambio_dir', label: 'AGILIDAD · CAMBIO DE DIRECCIÓN', required: true, options: options12345 },
      { id: 'agi_equilibrio', label: 'AGILIDAD · EQUILIBRIO', required: true, options: options12345 },
      { id: 'agi_esquivar', label: 'AGILIDAD · ESQUIVAR', required: true, options: options12345 },
    ],
  },
  {
    id: 's9',
    title: 'Sección 9 de 11 · ADAPTACIÓN Y SUPERACIÓN',
    questions: [
      { id: 'prog_ritmo', label: 'PROGRESIÓN · HA PROGRESADO A SU PROPIO RITMO', required: true, options: optionsYNProcess },
      { id: 'prog_supera_obstaculos', label: 'PROGRESIÓN · HA SUPERADO OBSTÁCULOS Y MEJORADO HABILIDADES', required: true, options: optionsYNProcess },
      { id: 'prog_confianza', label: 'PROGRESIÓN · HA GANADO CONFIANZA EN SÍ MISMO', required: true, options: optionsYNProcess },
      { id: 'mot_entusiasmo', label: 'MOTIVACIÓN · ENTUSIASMO', required: true, options: options12345 },
      { id: 'mot_esfuerzo', label: 'MOTIVACIÓN · ESFUERZO', required: true, options: options12345 },
      { id: 'mot_perseverancia', label: 'MOTIVACIÓN · PERSEVERANCIA', required: true, options: options12345 },
      { id: 'conf_seguridad', label: 'CONFIANZA · SEGURIDAD', required: true, options: options12345 },
      { id: 'conf_presion', label: 'CONFIANZA · PRESIÓN', required: true, options: options12345 },
      { id: 'conf_actitud', label: 'CONFIANZA · ACTITUD', required: true, options: options12345 },
    ],
  },
  {
    id: 's10',
    title: 'Sección 10 de 11 · INCLUSIÓN Y DIVERSIDAD',
    questions: [
      { id: 'incluido_valorado', label: 'SE SIENTE INCLUIDO Y VALORADO', required: true, options: optionsYN },
      { id: 'respeta_diferencias', label: 'RESPETA DIFERENCIAS Y FOMENTA IGUALDAD', required: true, options: optionsYN },
      { id: 'apoyo_companeros', label: 'SE APOYA ENTRE COMPAÑEROS Y SE AYUDA A MEJORAR', required: true, options: optionsYN },
      { id: 'resp_companeros', label: 'RESPETO · COMPAÑEROS', required: true, options: options12345 },
      { id: 'resp_entrenadores', label: 'RESPETO · ENTRENADORES', required: true, options: options12345 },
      { id: 'resp_normas', label: 'RESPETO · NORMAS', required: true, options: options12345 },
      { id: 'comp_disciplina', label: 'COMPORTAMIENTO · DISCIPLINA', required: true, options: options12345 },
      { id: 'comp_participacion', label: 'COMPORTAMIENTO · PARTICIPACIÓN', required: true, options: options12345 },
      { id: 'comp_control_emocional', label: 'COMPORTAMIENTO · CONTROL EMOCIONAL', required: true, options: options12345 },
    ],
  },
  {
    id: 's11',
    title: 'Sección 11 de 11 · BIENESTAR PERSONAL',
    questions: [
      { id: 'bien_salud', label: 'EL DEPORTE MEJORÓ SU SALUD Y BIENESTAR FÍSICO', required: true, options: optionsYNProcess },
      { id: 'bien_feliz_seguro', label: 'SE SIENTE MÁS FELIZ Y SEGURO GRACIAS AL FÚTBOL SALA', required: true, options: optionsYNProcess },
      { id: 'bien_calidad_vida', label: 'IMPACTO POSITIVO EN SU CALIDAD DE VIDA', required: true, options: optionsYNProcess },
    ],
  },
];

export default function Plantilla({
  players,
  partidos = [],
  entrenos = [],
  setPlayers,
  onBack,
}: {
  players: unknown[];
  partidos?: unknown[];
  entrenos?: unknown[];
  setPlayers: (p: unknown[]) => Promise<void>;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  // Estados del formulario
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [nominal, setNominal] = useState('');           // nombre visible en la app
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [numeroLicencia, setNumeroLicencia] = useState('');
  const [edad, setEdad] = useState('');
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
  const [valoracionStaff, setValoracionStaff] = useState(3);
  const [iaEditorVisible, setIaEditorVisible] = useState(false);
  const [personalFormVisible, setPersonalFormVisible] = useState(false);
  const [resultadosVisible, setResultadosVisible] = useState(false);
  const [iaSelectedPlayerId, setIaSelectedPlayerId] = useState<string | null>(null);
  const [control, setControl] = useState(3);
  const [pase, setPase] = useState(3);
  const [lecturaJuego, setLecturaJuego] = useState(3);
  const [tomaDecision, setTomaDecision] = useState(3);
  const [velocidad, setVelocidad] = useState(3);
  const [resistencia, setResistencia] = useState(3);
  const [concentracion, setConcentracion] = useState(3);
  const [competitividad, setCompetitividad] = useState(3);
  const [evalFecha, setEvalFecha] = useState('');
  const [evalEdad, setEvalEdad] = useState('');
  const [evalExperienciaFS, setEvalExperienciaFS] = useState('');
  const [evalScore, setEvalScore] = useState(3);
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
  const [importingDI, setImportingDI] = useState(false);
  const [exportPreviewVisible, setExportPreviewVisible] = useState(false);
  const [exportPreviewHtml, setExportPreviewHtml] = useState('');
  const [exportPreviewTitle, setExportPreviewTitle] = useState('');

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
    if (!scored.length) return 3;
    const avg = scored.reduce((a, b) => a + b, 0) / scored.length;
    return Math.max(1, Math.min(5, Math.round(avg)));
  };

  const clampRate = (v: any) => Math.max(1, Math.min(5, Number(v) || 3));
  const safePlayers = useMemo(
    () => (Array.isArray(players) ? players : []).filter((p: any) => p && typeof p === 'object'),
    [players]
  );
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
    setEvalScore(Math.max(1, Math.min(5, Number(lastEval?.score) || 3)));
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
    setPersonalAnswers(latest?.personalForm?.answers || {
      edad_personal: String(target?.edad || ''),
      anios_fs: String(latest?.experienciaFS ?? ''),
    });
    setPersonalFormVisible(true);
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
    const aniosFs = personalAnswers.anios_fs || '';
    if (!edadPersonal.trim()) {
      Alert.alert('Campo obligatorio', 'Debes indicar la edad.');
      return;
    }
    if (!aniosFs.trim()) {
      Alert.alert('Campo obligatorio', 'Debes indicar años de experiencia en FS.');
      return;
    }
    const score = computePersonalScore(personalAnswers);
    const evaluacion = {
      id: `${Date.now()}`,
      fecha: evalFecha.trim() || todayDDMMYYYY(),
      edad: Number(edadPersonal) || Number(evalEdad) || 0,
      experienciaFS: Number(aniosFs) || Number(evalExperienciaFS) || 0,
      score,
      observaciones: evalObservaciones.trim(),
      personalForm: {
        sections: PERSONAL_FORM_SECTIONS.map((s) => s.id),
        answers: personalAnswers,
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
        {[1, 2, 3, 4, 5].map((n) => (
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
    const roster = safePlayers;
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

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; padding: 18px; color: #1a1a1a; }
              h1 { text-align: center; color: #012E57; font-size: 20px; margin: 0 0 6px; }
              p { text-align: center; color: #555; margin: 0 0 16px; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; table-layout: auto; }
              th, td { border: 1px solid #ccc; padding: 7px; font-size: 11px; text-align: center; }
              th { background: #012E57; color: #fff; }
              tr:nth-child(even) td { background: #f7f9fc; }
            </style>
          </head>
          <body>
            <h1>LISTADO DE PLANTILLA</h1>
            <p>Campos exportados: ${escapeHtml(String(selectedListadoFields.length))}</p>
            <table>
              <thead><tr>${headers}</tr></thead>
              <tbody>${bodyRows}</tbody>
            </table>
          </body>
        </html>
      `;

      setExportPreviewTitle('PREVISUALIZACIÓN · LISTADO DE PLANTILLA');
      setExportPreviewHtml(html);
      setExportPreviewVisible(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `No se pudo exportar el listado. ${msg}`);
    } finally {
      setExportingListado(false);
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
          <div class="row"><span class="label">Puntuación evaluación personal:</span> ${escapeHtml(String(evalScore || '-'))}/5</div>
          <div class="row"><span class="label">Observaciones:</span> ${escapeHtml(evalObservaciones || '-')}</div>
          ${sectionsHtml}
        </body>
      </html>
    `;
    try {
      setExportPreviewTitle('PREVISUALIZACIÓN · FORMULARIO PERSONAL');
      setExportPreviewHtml(html);
      setExportPreviewVisible(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `No se pudo exportar. ${msg}`);
    }
  };

  const compartirExportPreview = async () => {
    if (!exportPreviewHtml) return;
    try {
      const { uri } = await Print.printToFileAsync({ html: exportPreviewHtml });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('No disponible', 'No se puede compartir en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: exportPreviewTitle || 'Exportar PDF',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `No se pudo compartir. ${msg}`);
    }
  };

  const imprimirExportPreview = async () => {
    if (!exportPreviewHtml) return;
    try {
      await Print.printAsync({ html: exportPreviewHtml });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error', `No se pudo imprimir. ${msg}`);
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
          <p><b>Puntuación:</b> ${escapeHtml(String(evalScore || '-'))}/5</p>
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

    const playerId = editingId || Date.now().toString();
    let photoUrl = photo;
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
        // Guardar copia en la memoria del móvil (persiste al cerrar la app)
        const dir = `${FileSystem.documentDirectory}player_photos`;
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const localPath = `${dir}/${playerId}.jpg`;
        await FileSystem.writeAsStringAsync(localPath, base64, { encoding: FileSystem.EncodingType.Base64 });
        photoUrl = localPath;

        // Subir también a Drive (respaldo)
        try {
          const res = await uploadPhotoToDrive(base64, nominal.trim());
          if (!res.success) {
            Alert.alert("Aviso", res.message || "La foto se guardó en el móvil pero no se pudo subir a Drive.");
          }
        } catch (_) {
          // La foto ya está guardada localmente; solo avisamos si falla Drive
          Alert.alert("Aviso", "La foto se guardó en el móvil pero no se pudo subir a Drive. Comprueba la conexión.");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert("Error al guardar foto", msg || "Comprueba la conexión y vuelve a intentarlo.");
      } finally {
        setUploadingPhoto(false);
      }
    }

    const previousPlayer = editingId ? safePlayers.find((p: any) => p.id === editingId) : undefined;
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
      nombreCompleto,
      nominal,
      fechaNacimiento,
      numeroLicencia,
      edad,
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
    setValoracionStaff(Math.max(1, Math.min(5, Number(p.valoracionStaff ?? 3))));
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
    setEvalScore(Math.max(1, Math.min(5, Number(lastEval?.score) || 3)));
    setEvalObservaciones(lastEval?.observaciones || '');
  };

  const startEdit = (p) => {
    loadPlayerIntoForm(p);
    setModalVisible(true);
  };

  const currentEditIndex = safePlayers.findIndex((p: any) => String(p.id) === String(editingId || ''));
  const canGoPrevPlayer = currentEditIndex > 0;
  const canGoNextPlayer = currentEditIndex >= 0 && currentEditIndex < safePlayers.length - 1;

  const navigateEditPlayer = (dir: 'prev' | 'next') => {
    if (currentEditIndex < 0) return;
    const nextIndex = dir === 'next' ? currentEditIndex + 1 : currentEditIndex - 1;
    const target = safePlayers[nextIndex];
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

  const fechaNacimientoInvalida =
    String(fechaNacimiento || '').trim().length === 10 &&
    !calcularEdadDesdeFecha(fechaNacimiento);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backTxt}>← VOLVER</Text>
      </TouchableOpacity>
      
      <Text style={styles.title}>MI PLANTILLA</Text>

      <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
        <Text style={styles.addBtnTxt}>+ AÑADIR JUGADOR / MONITOR</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.listadoBtn} onPress={() => setListadoModalVisible(true)}>
        <Text style={styles.listadoBtnTxt}>LISTADO PERSONALIZADO Y EXPORTAR</Text>
      </TouchableOpacity>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {safePlayers.map((p: any) => {
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
                      {`Valoración: ${p.valoracionIA ?? calculateValoracionIA(p)}/5`}
                    </Text>
                  ) : null}
                  {p.perfilTactico ? (
                    <Text style={styles.pPerfil}>Perfil: {p.perfilTactico}</Text>
                  ) : null}
                  <View style={styles.statusRow}>
                    {p.estadoFisico && (
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
                    )}
                    {p.disponibilidad && (
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
                    )}
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
                    {currentEditIndex + 1}/{safePlayers.length}
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
              
              <TouchableOpacity style={styles.photoCircle} onPress={pickImage}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.fullPhoto} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.upTxt}>SUBIR</Text>
                    <Text style={styles.upTxt}>FOTO</Text>
                  </View>
                )}
              </TouchableOpacity>

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
                  <TextInput
                    style={[styles.input, fechaNacimientoInvalida && styles.inputError]}
                    placeholder="dd/mm/aaaa"
                    value={fechaNacimiento}
                    onChangeText={(t) => setFechaNacimiento(formatFechaNacimiento(t))}
                    placeholderTextColor="#999"
                    keyboardType="numeric"
                    maxLength={10}
                  />
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

              <Text style={styles.label}>VALORACIÓN STAFF (1-5):</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((n) => (
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
              <Text style={styles.helperRatingTxt}>{iaPreview.score}/5</Text>

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
                        onPress={() => setEstadoFisico(val as any)}
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
                  Eval. personal media: {iaContext.evaluacionDIScore == null ? 'Sin datos' : `${iaContext.evaluacionDIScore}/5`}
                </Text>
                <Text style={styles.iaSummaryTxt}>Subscore contexto: {iaContext.contextScore}/5</Text>
              </View>
              <Text style={styles.helperRatingTxt}>
                Bloques → Tec {iaPreview.blocks.technique} · Tac {iaPreview.blocks.tactic} · Fis {iaPreview.blocks.physical} · Men {iaPreview.blocks.mental}
              </Text>
              <Text style={styles.helperRatingTxt}>Fórmula IA: {iaPreview.formula}</Text>
              <Text style={styles.iaSummaryScore}>Resultado IA ahora: {iaPreview.score}/5</Text>
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
              <TextInput
                style={styles.input}
                placeholder="Fecha evaluación (dd/mm/aaaa)"
                placeholderTextColor="#888"
                value={evalFecha}
                onChangeText={setEvalFecha}
              />
              {PERSONAL_FORM_SECTIONS.map((section) => (
                <View key={section.id} style={styles.personalSectionCard}>
                  <Text style={styles.personalSectionTitle}>{section.title}</Text>
                  {section.description ? (
                    <Text style={styles.personalSectionDesc}>{section.description}</Text>
                  ) : null}
                  {section.questions.map((q) => (
                    <View key={q.id} style={styles.personalQuestionWrap}>
                      <Text style={styles.personalQuestionLabel}>
                        {q.label}{q.required ? ' *' : ''}
                      </Text>
                      {q.type === 'number' ? (
                        <TextInput
                          style={styles.input}
                          placeholder={q.label}
                          placeholderTextColor="#888"
                          keyboardType="numeric"
                          value={personalAnswers[q.id] || ''}
                          onChangeText={(t) => setPersonalAnswer(q.id, t)}
                        />
                      ) : (
                        <View style={styles.personalOptionsWrap}>
                          {(q.options || []).map((opt) => {
                            const active = personalAnswers[q.id] === opt.value;
                            return (
                              <TouchableOpacity
                                key={`${q.id}-${opt.value}`}
                                style={[styles.personalOptBtn, active && styles.personalOptBtnActive]}
                                onPress={() => setPersonalAnswer(q.id, opt.value)}
                              >
                                <Text style={[styles.personalOptBtnTxt, active && styles.personalOptBtnTxtActive]}>
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ))}
              {renderIARow('Puntuación evaluación personal (calculada)', evalScore, setEvalScore)}
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
            </ScrollView>
            <TouchableOpacity style={styles.iaCloseBtn} onPress={() => setPersonalFormVisible(false)}>
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
              <Text style={styles.iaSummaryScore}>{iaPreview.score}/5</Text>
            </View>
            <View style={styles.iaSummaryCard}>
              <Text style={styles.iaSummaryTitle}>Resultado de formulario personal</Text>
              <Text style={styles.iaSummaryScore}>
                {iaContext.evaluacionDIScore == null ? 'Sin datos' : `${iaContext.evaluacionDIScore}/5`}
              </Text>
            </View>
            <Text style={styles.helperRatingTxt}>Fórmula IA: {iaPreview.formula}</Text>
            <TouchableOpacity style={styles.iaCloseBtn} onPress={() => setResultadosVisible(false)}>
              <Text style={styles.iaCloseBtnTxt}>CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={listadoModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
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

            <Text style={styles.previewTitle}>VISTA PREVIA</Text>
            <ScrollView horizontal style={styles.previewWrap} showsHorizontalScrollIndicator>
              <View>
                <View style={styles.previewHeaderRow}>
                  {selectedListadoFields.length ? (
                    selectedListadoFields.map((key) => {
                      const field = listadoFields.find((f) => f.key === key);
                      return (
                        <Text key={`h-${key}`} style={[styles.previewCell, styles.previewHeaderCell]}>
                          {field?.label || key}
                        </Text>
                      );
                    })
                  ) : (
                    <Text style={styles.previewEmpty}>Selecciona campos para previsualizar.</Text>
                  )}
                </View>
                {selectedListadoFields.length ? (
                  safePlayers.map((p: any, idx: number) => (
                    <View key={`r-${p?.id || idx}`} style={styles.previewRow}>
                      {selectedListadoFields.map((key) => (
                        <Text key={`c-${p?.id || idx}-${key}`} style={styles.previewCell}>
                          {getListadoValue(p, key)}
                        </Text>
                      ))}
                    </View>
                  ))
                ) : null}
              </View>
            </ScrollView>

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
        </View>
      </Modal>

      <Modal visible={exportPreviewVisible} transparent animationType="slide" onRequestClose={() => setExportPreviewVisible(false)}>
        <View style={styles.iaModalOverlay}>
          <View style={styles.exportPreviewCard}>
            <Text style={styles.iaModalTitle}>{exportPreviewTitle || 'PREVISUALIZACIÓN'}</Text>
            <View style={styles.exportPreviewWebWrap}>
              <WebView
                originWhitelist={['*']}
                source={{
                  html: exportPreviewHtml || '<html><body style="font-family: Arial; padding: 12px;">Sin contenido para previsualizar.</body></html>',
                }}
                setBuiltInZoomControls
                setDisplayZoomControls={false}
                scalesPageToFit
                showsVerticalScrollIndicator
                showsHorizontalScrollIndicator
                style={styles.exportPreviewWeb}
              />
            </View>
            <View style={styles.listadoActions}>
              <TouchableOpacity style={styles.listadoExportBtn} onPress={compartirExportPreview}>
                <Text style={styles.listadoExportTxt}>EXPORTAR / COMPARTIR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.listadoCloseBtn, { backgroundColor: '#E8F1FB' }]} onPress={imprimirExportPreview}>
                <Text style={styles.listadoCloseTxt}>IMPRIMIR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.listadoCloseBtn} onPress={() => setExportPreviewVisible(false)}>
                <Text style={styles.listadoCloseTxt}>CERRAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33', padding: 20 },
  backBtn: { marginBottom: 15 }, 
  backTxt: { color: '#1565C0', fontWeight: 'bold' },
  title: { color: '#FFF', fontSize: 26, fontWeight: '900', marginBottom: 20 },
  addBtn: { backgroundColor: '#1565C0', padding: 16, borderRadius: 12, alignItems: 'center' },
  addBtnTxt: { color: '#FFF', fontWeight: 'bold' },
  listadoBtn: { backgroundColor: '#0E4A8A', paddingVertical: 11, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  listadoBtnTxt: { color: '#EAF4FF', fontWeight: '700', fontSize: 12 },
  playerFlowBtnsWrap: { width: '100%', marginTop: 8, marginBottom: 6, gap: 6 },
  playerFlowBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  playerFlowBtnIA: { backgroundColor: '#0E4A8A' },
  playerFlowBtnPersonal: { backgroundColor: '#1D6B29' },
  playerFlowBtnResult: { backgroundColor: '#6A1B9A' },
  playerFlowBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 11 },
  list: { marginTop: 15 },
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
  photoCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 14, overflow: 'hidden', borderWidth: 2, borderColor: '#1565C0' },
  fullPhoto: { width: 100, height: 100 },
  photoPlaceholder: { alignItems: 'center' },
  upTxt: { fontSize: 10, color: '#1565C0', fontWeight: 'bold' },
  input: { borderBottomWidth: 1, borderColor: '#CCC', paddingVertical: 7, paddingHorizontal: 10, marginBottom: 9, color: '#000', width: '100%', fontSize: 13 },
  inputError: { borderColor: '#C62828', borderBottomWidth: 2 },
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
  iaBtns: { flexDirection: 'row', justifyContent: 'space-between' },
  iaBtn: { width: '18%', backgroundColor: '#EEF2F7', borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  iaBtnActive: { backgroundColor: '#1565C0' },
  iaBtnTxt: { color: '#4A5A6A', fontWeight: '700', fontSize: 11 },
  iaBtnTxtActive: { color: '#FFF' },
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
  personalOptBtn: { backgroundColor: '#EEF3F8', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8, marginRight: 6, marginBottom: 6 },
  personalOptBtnActive: { backgroundColor: '#1565C0' },
  personalOptBtnTxt: { color: '#34526B', fontSize: 10, fontWeight: '700' },
  personalOptBtnTxtActive: { color: '#FFF' },
  iaPrintBtn: { backgroundColor: '#5D4037', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  iaPrintBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 11 },
  iaShareBtn: { backgroundColor: '#1565C0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 8 },
  iaShareBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 11 },
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
  listadoModalCard: {
    marginHorizontal: 14,
    marginVertical: 26,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    flex: 1,
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
  previewWrap: { flex: 1, borderWidth: 1, borderColor: '#D8DDE3', borderRadius: 8, marginBottom: 12 },
  previewHeaderRow: { flexDirection: 'row', backgroundColor: '#012E57' },
  previewRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E6EAF0' },
  previewCell: {
    minWidth: 120,
    paddingVertical: 7,
    paddingHorizontal: 8,
    color: '#23303D',
    fontSize: 11,
  },
  previewHeaderCell: { color: '#FFF', fontWeight: '800' },
  previewEmpty: { color: '#FFF', paddingVertical: 8, paddingHorizontal: 10, fontSize: 11 },
  listadoActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  listadoExportBtn: {
    flex: 1,
    backgroundColor: '#1565C0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  listadoExportTxt: { color: '#FFF', fontWeight: '800' },
  listadoCloseBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B0BEC5',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  listadoCloseTxt: { color: '#455A64', fontWeight: '800' },
  exportPreviewCard: {
    width: '94%',
    maxHeight: '92%',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 12,
  },
  exportPreviewWebWrap: {
    flex: 1,
    minHeight: 420,
    borderWidth: 1,
    borderColor: '#D8E3EF',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
  },
  exportPreviewWeb: { flex: 1, backgroundColor: '#FFFFFF' },
});
