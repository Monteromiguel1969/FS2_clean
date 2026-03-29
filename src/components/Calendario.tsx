import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { importPartidos } from '../services/googleSheetsService';

// -----------------------------------------------------------------------------
// TIPOS
// -----------------------------------------------------------------------------

export type ViewMode = 'calendar' | 'list';
export type EventKind = 'Partido' | 'Entrenamiento' | 'Otro';

export interface MatchItem {
  id: string;
  rival: string;
  fecha: string;
  hora: string;
  horaFin?: string;
  horaQuedada?: string;
  equipacion?: string;
  observaciones?: string;
  descripcion?: string;
  ubicacionMaps?: string;
  tipoCompeticion?: string;
  lugarQuedada?: string;
  lugar: string;
  tipo: string;
  golesFavor: number;
  golesContra: number;
  estado: 'pendiente' | 'jugado';
  /** true si es un evento creado manualmente en el calendario (pulsando el día) */
  isEvento?: boolean;
  /** Notas del evento (solo para eventos manuales); se incluye al exportar/compartir */
  notas?: string;
}

/** Evento guardado al pulsar un día y grabar en el calendario (persistido en memoria del móvil) */
export interface EventoCalendarioStored {
  id: string;
  tipoEvento: EventKind;
  tipoCompeticion: string;
  rival: string;
  title: string;
  dateKey: string;
  horaInicio: string;
  horaFin: string;
  horaQuedada: string;
  equipacion: string;
  lugarPartido: string;
  lugarQuedada: string;
  observaciones: string;
  descripcion: string;
  ubicacionMaps: string;
  ubicacion: string;
  notas: string;
}

interface PlayerBasic {
  id: string;
  name: string;
  nominal?: string;
  nombreCompleto?: string;
  role?: string;
}

interface PartidoFromApp {
  id?: string;
  rival?: string;
  fecha?: string;
  lugar?: string;
  tipo?: string;
  golesFavor?: number;
  golesContra?: number;
  convocatoria?: unknown[];
}

interface CalendarioProps {
  partidos: PartidoFromApp[];
  setPartidos?: (partidos: PartidoFromApp[]) => void;
  eventosCalendario?: EventoCalendarioStored[];
  setEventosCalendario?: (eventos: EventoCalendarioStored[]) => void;
  players?: PlayerBasic[];
  onBack: () => void;
  onVerPartido?: (id: string) => void;
  onVerEntreno?: (id: string) => void;
}

// -----------------------------------------------------------------------------
// UTILIDADES
// -----------------------------------------------------------------------------

const DATE_SEP = /[/-]/;
const defaultDate = (): string => new Date().toISOString().slice(0, 10);

function parseDateKey(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return defaultDate();
  const s = raw.trim();
  if (s.includes('/')) {
    const [d, m, y] = s.split('/');
    if (y && m && d) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (s.includes('-')) return s.split('T')[0] || defaultDate();
  return defaultDate();
}

function formatDateLabel(key: string): string {
  const [y, m, d] = key.split('-');
  if (d && m && y) return `${d}/${m}/${y}`;
  return key;
}

function extractHora(fechaStr: string | undefined): string {
  if (!fechaStr || typeof fechaStr !== 'string') return '--';
  if (fechaStr.includes('T')) {
    const t = fechaStr.split('T')[1];
    if (t) return t.slice(0, 5);
  }
  return '--';
}

function normalizeToMatch(p: PartidoFromApp): MatchItem {
  const fecha = p.fecha || '';
  const golesFavor = Number(p.golesFavor) || 0;
  const golesContra = Number(p.golesContra) || 0;
  const hasResult = fecha && (golesFavor > 0 || golesContra > 0 || fecha.length < 11);
  const estado: 'pendiente' | 'jugado' = hasResult ? 'jugado' : 'pendiente';
  return {
    id: String(p.id ?? ''),
    rival: String(p.rival ?? '—'),
    fecha: fecha,
    hora: extractHora(fecha),
    horaFin: '--',
    lugar: String(p.lugar ?? 'LOCAL').toUpperCase(),
    tipo: String(p.tipo ?? 'LIGA'),
    golesFavor,
    golesContra,
    estado,
  };
}

function isValidPartidoRow(x: unknown): x is PartidoFromApp {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof (o.rival ?? o.fecha) === 'string';
}

// -----------------------------------------------------------------------------
// HOOK: PARTIDOS NORMALIZADOS + SYNC
// -----------------------------------------------------------------------------

function eventoToMatch(ev: EventoCalendarioStored): MatchItem {
  const tipoEvento: EventKind = ev.tipoEvento || 'Otro';
  const rival = ev.rival || ev.title || (tipoEvento === 'Entrenamiento' ? 'Entrenamiento' : 'Evento');
  const lugar = ev.lugarPartido || ev.ubicacion || '—';
  const detalle =
    tipoEvento === 'Otro'
      ? (ev.descripcion || ev.observaciones || ev.notas || '')
      : (ev.observaciones || ev.notas || '');
  return {
    id: ev.id.startsWith('ev_') ? ev.id : `ev_${ev.id}`,
    rival,
    fecha: ev.dateKey,
    hora: ev.horaInicio || '--',
    horaFin: ev.horaFin || '--',
    horaQuedada: ev.horaQuedada || '--',
    equipacion: ev.equipacion || '',
    observaciones: detalle,
    descripcion: ev.descripcion || '',
    ubicacionMaps: ev.ubicacionMaps || '',
    tipoCompeticion: ev.tipoCompeticion || '',
    lugarQuedada: ev.lugarQuedada || '',
    lugar: String(lugar).toUpperCase(),
    tipo: tipoEvento,
    golesFavor: 0,
    golesContra: 0,
    estado: 'pendiente',
    isEvento: true,
    notas: ev.notas || undefined,
  };
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function useMatches(
  partidos: PartidoFromApp[],
  setPartidos: CalendarioProps['setPartidos'],
  players: PlayerBasic[] = [],
  eventosCalendario: EventoCalendarioStored[] = []
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const fromPartidos = !Array.isArray(partidos) ? [] : partidos
      .filter((p) => p && (p.rival != null || p.fecha != null))
      .map(normalizeToMatch);
    const fromEventos = Array.isArray(eventosCalendario)
      ? eventosCalendario.map(eventoToMatch)
      : [];
    return [...fromPartidos, ...fromEventos]
      .sort((a, b) => parseDateKey(b.fecha).localeCompare(parseDateKey(a.fecha)));
  }, [partidos, eventosCalendario]);

  const syncFromSheets = useCallback(async () => {
    if (!setPartidos) {
      setError('No se puede guardar los partidos importados.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const playerList = Array.isArray(players) ? players : [];
      const result = await importPartidos(playerList as Parameters<typeof importPartidos>[0]);
      if (!result.success) {
        setError(result.message || 'Error al importar');
        return;
      }
      const data = result.data;
      if (!Array.isArray(data)) {
        setPartidos([]);
        return;
      }
      const valid = data.filter(isValidPartidoRow);
      setPartidos(valid);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error de conexión';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [setPartidos, players]);

  return { matches, loading, error, syncFromSheets };
}

// -----------------------------------------------------------------------------
// HOOK: COMPARTIR PARTIDO
// -----------------------------------------------------------------------------

function useShareMatch() {
  return useCallback((match: MatchItem) => {
    const title = match.isEvento ? 'Evento' : 'Partido';
    const lines: string[] = [];
    if (!match.isEvento) {
      lines.push('⚽ Partido');
      lines.push(`🆚 Rival: ${match.rival}`);
      lines.push(`📅 Fecha: ${formatDateLabel(parseDateKey(match.fecha))}`);
      lines.push(`🕒 Hora: ${match.hora}`);
      lines.push(`📍 Lugar: ${match.lugar}`);
    } else if ((match.tipo || 'Otro') === 'Partido') {
      lines.push('📅 Evento: Partido');
      lines.push(`📅 Fecha: ${formatDateLabel(parseDateKey(match.fecha))}`);
      if (match.tipoCompeticion) lines.push(`🏆 Tipo de competición: ${match.tipoCompeticion}`);
      lines.push(`🆚 Rival: ${match.rival}`);
      lines.push(`🕒 Hora del partido: ${match.hora}`);
      lines.push(`📍 Lugar del partido: ${match.lugar}`);
      if (match.lugarQuedada) lines.push(`📌 Lugar de quedada: ${match.lugarQuedada}`);
      if (match.horaQuedada && match.horaQuedada !== '--') lines.push(`🕘 Hora de quedada: ${match.horaQuedada}`);
      if (match.equipacion) lines.push(`👕 Equipación: ${match.equipacion}`);
      if (match.observaciones) lines.push(`📝 Observaciones: ${match.observaciones}`);
      if (match.ubicacionMaps) lines.push(`🗺 Google Maps: ${match.ubicacionMaps}`);
    } else if (match.tipo === 'Entrenamiento') {
      lines.push('📅 Evento: Entrenamiento');
      lines.push(`📅 Fecha: ${formatDateLabel(parseDateKey(match.fecha))}`);
      lines.push(`🕒 Hora inicio: ${match.hora}`);
      if (match.horaFin && match.horaFin !== '--') lines.push(`⏱ Hora fin: ${match.horaFin}`);
      if (match.observaciones) lines.push(`📝 Observaciones: ${match.observaciones}`);
    } else {
      lines.push('📅 Evento: Otro');
      lines.push(`📅 Fecha: ${formatDateLabel(parseDateKey(match.fecha))}`);
      lines.push(`🕒 Hora inicio: ${match.hora}`);
      if (match.horaFin && match.horaFin !== '--') lines.push(`⏱ Hora fin: ${match.horaFin}`);
      if (match.descripcion) lines.push(`📝 Descripción: ${match.descripcion}`);
    }
    Share.share({ message: lines.join('\n'), title }).catch(() => {});
  }, []);
}

// -----------------------------------------------------------------------------
// HOOK: AÑADIR AL CALENDARIO DEL DISPOSITIVO (desde datos del diálogo)
// -----------------------------------------------------------------------------

export interface EventFormData {
  tipoEvento: EventKind;
  tipoCompeticion: string;
  rival: string;
  dateKey: string;
  horaInicio: string;
  horaFin: string;
  horaQuedada: string;
  equipacion: string;
  lugarPartido: string;
  lugarQuedada: string;
  observaciones: string;
  descripcion: string;
  ubicacionMaps: string;
}

function parseTimeToMinutes(t: string): number {
  const s = (t || '10:00').trim();
  const [h, m] = s.split(':').map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

function useDeviceCalendar() {
  const createEventFromForm = useCallback(async (form: EventFormData): Promise<boolean> => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se necesita acceso al calendario.');
        return false;
      }
      const calendars = await Calendar.getCalendarsAsync();
      const writable = calendars.find((c) => c.allowsModifications);
      const defaultCal = (writable ?? calendars[0])?.id ?? null;
      if (!defaultCal) {
        Alert.alert('Aviso', 'No hay calendario disponible.');
        return false;
      }
      const key = parseDateKey(form.dateKey);
      if (!key) return false;
      const [y, m, d] = key.split('-').map(Number);
      const startM = parseTimeToMinutes(form.horaInicio);
      const endM = parseTimeToMinutes(form.horaFin);
      const start = new Date(y, (m || 1) - 1, d || 1, Math.floor(startM / 60), startM % 60, 0);
      const endMinutes = endM <= startM ? startM + 90 : endM;
      const end = new Date(y, (m || 1) - 1, d || 1, Math.floor(endMinutes / 60), endMinutes % 60, 0);
      const title =
        form.tipoEvento === 'Partido'
          ? `Partido vs ${form.rival.trim() || 'Rival'}`
          : form.tipoEvento === 'Entrenamiento'
          ? 'Entrenamiento'
          : form.descripcion.trim() || 'Otro';
      const location =
        form.tipoEvento === 'Partido'
          ? form.lugarPartido.trim() || undefined
          : undefined;
      const notesParts: string[] = [];
      notesParts.push(`Tipo: ${form.tipoEvento}`);
      if (form.tipoEvento === 'Partido') {
        if (form.tipoCompeticion.trim()) notesParts.push(`Competición: ${form.tipoCompeticion.trim()}`);
        if (form.lugarQuedada.trim()) notesParts.push(`Lugar quedada: ${form.lugarQuedada.trim()}`);
        if (form.horaQuedada.trim()) notesParts.push(`Hora quedada: ${form.horaQuedada.trim()}`);
        if (form.equipacion.trim()) notesParts.push(`Equipación: ${form.equipacion.trim()}`);
        if (form.observaciones.trim()) notesParts.push(`Observaciones: ${form.observaciones.trim()}`);
        if (form.ubicacionMaps.trim()) notesParts.push(`Google Maps: ${form.ubicacionMaps.trim()}`);
      } else if (form.tipoEvento === 'Entrenamiento') {
        if (form.observaciones.trim()) notesParts.push(`Observaciones: ${form.observaciones.trim()}`);
      } else if (form.descripcion.trim()) {
        notesParts.push(`Descripción: ${form.descripcion.trim()}`);
      }
      await Calendar.createEventAsync(defaultCal, {
        title,
        startDate: start,
        endDate: end,
        location,
        notes: notesParts.join('\n') || undefined,
      });
      Alert.alert('Listo', 'Evento guardado en el calendario del dispositivo.');
      return true;
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo crear el evento.');
      return false;
    }
  }, []);
  return { createEventFromForm };
}

// -----------------------------------------------------------------------------
// COMPONENTES
// -----------------------------------------------------------------------------

const WEEK_DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function ViewToggle({ mode, onModeChange }: { mode: ViewMode; onModeChange: (m: ViewMode) => void }) {
  return (
    <View style={styles.viewToggle}>
      <TouchableOpacity
        style={[styles.toggleBtn, mode === 'calendar' && styles.toggleBtnActive]}
        onPress={() => onModeChange('calendar')}
      >
        <FontAwesome name="calendar" size={16} color={mode === 'calendar' ? '#001A33' : '#FFF'} />
        <Text style={[styles.toggleTxt, mode === 'calendar' && styles.toggleTxtActive]}> Calendario</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleBtn, mode === 'list' && styles.toggleBtnActive]}
        onPress={() => onModeChange('list')}
      >
        <FontAwesome name="list" size={16} color={mode === 'list' ? '#001A33' : '#FFF'} />
        <Text style={[styles.toggleTxt, mode === 'list' && styles.toggleTxtActive]}> Lista</Text>
      </TouchableOpacity>
    </View>
  );
}

function MatchCard({
  match,
  onShare,
  onAddToCalendar,
  onPress,
  onDeleteEvent,
  onEditEvent,
}: {
  match: MatchItem;
  onShare: (m: MatchItem) => void;
  onAddToCalendar: (m: MatchItem) => void;
  onPress?: (id: string) => void;
  onDeleteEvent?: (id: string) => void;
  onEditEvent?: (m: MatchItem) => void;
}) {
  const resultado =
    match.estado === 'jugado' ? `${match.golesFavor}-${match.golesContra}` : '—';

  const handleDeleteEvent = () => {
    if (!match.isEvento || !onDeleteEvent) return;
    Alert.alert(
      'Eliminar evento',
      `¿Eliminar "${match.rival}" del calendario?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => onDeleteEvent(match.id) },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={[styles.matchCard, match.estado === 'jugado' && styles.matchCardJugado]}
      onPress={() => onPress?.(match.id)}
      activeOpacity={0.8}
    >
      <View style={styles.matchCardHeader}>
        <Text style={styles.matchRival}>{match.isEvento ? match.rival : `vs ${match.rival}`}</Text>
        <View style={[styles.badge, match.isEvento ? styles.badgeEvento : match.estado === 'jugado' ? styles.badgeJugado : styles.badgePendiente]}>
          <Text style={styles.badgeTxt}>{match.isEvento ? (match.tipo || 'Evento') : match.estado === 'jugado' ? 'Jugado' : 'Pendiente'}</Text>
        </View>
      </View>
      <View style={styles.matchCardRow}>
        <FontAwesome name="calendar-o" size={12} color="#888" />
        <Text style={styles.matchMeta}>{formatDateLabel(parseDateKey(match.fecha))}</Text>
      </View>
      <View style={styles.matchCardRow}>
        <FontAwesome name="clock-o" size={12} color="#888" />
        <Text style={styles.matchMeta}>{match.hora}</Text>
      </View>
      <View style={styles.matchCardRow}>
        <FontAwesome name="map-marker" size={12} color="#888" />
        <Text style={styles.matchMeta}>{match.lugar}</Text>
      </View>
      {match.estado === 'jugado' && !match.isEvento && (
        <View style={styles.matchCardRow}>
          <Text style={styles.matchResultado}>Resultado: {resultado}</Text>
        </View>
      )}
      <View style={styles.matchCardActions}>
        <TouchableOpacity style={styles.matchActionBtn} onPress={() => onShare(match)}>
          <FontAwesome name="share-alt" size={16} color="#00aaff" />
          <Text style={styles.matchActionTxt}>Compartir</Text>
        </TouchableOpacity>
        {!match.isEvento && (
          <TouchableOpacity style={styles.matchActionBtn} onPress={() => onAddToCalendar(match)}>
            <FontAwesome name="calendar-plus-o" size={16} color="#00aaff" />
            <Text style={styles.matchActionTxt}>Añadir al calendario</Text>
          </TouchableOpacity>
        )}
        {match.isEvento && onEditEvent && (
          <TouchableOpacity style={[styles.matchActionBtn, styles.matchActionBtnEdit]} onPress={() => onEditEvent(match)}>
            <FontAwesome name="pencil" size={16} color="#FFF" />
            <Text style={[styles.matchActionTxt, styles.matchActionBtnEditTxt]}>Editar</Text>
          </TouchableOpacity>
        )}
        {match.isEvento && onDeleteEvent && (
          <TouchableOpacity style={[styles.matchActionBtn, styles.matchActionBtnDelete]} onPress={handleDeleteEvent}>
            <FontAwesome name="trash-o" size={16} color="#FFF" />
            <Text style={[styles.matchActionTxt, styles.matchActionBtnDeleteTxt]}>Eliminar</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// -----------------------------------------------------------------------------
// MODAL AGENDAR EVENTO
// -----------------------------------------------------------------------------

const defaultEventForm = (dateKey: string, match: MatchItem | null): EventFormData => ({
  tipoEvento: match?.isEvento ? ((match.tipo as EventKind) || 'Otro') : 'Partido',
  tipoCompeticion: '',
  rival: match?.rival || '',
  dateKey,
  horaInicio: match?.hora && match.hora !== '--' ? match.hora : '10:00',
  horaFin: '11:30',
  horaQuedada: match?.horaQuedada && match.horaQuedada !== '--' ? match.horaQuedada : '09:30',
  equipacion: match?.equipacion || '',
  lugarPartido: match?.lugar || '',
  lugarQuedada: '',
  observaciones: match?.observaciones || '',
  descripcion: '',
  ubicacionMaps: match?.ubicacionMaps || '',
});

function EventModal({
  visible,
  form,
  isEditing,
  onClose,
  onSave,
}: {
  visible: boolean;
  form: EventFormData | null;
  isEditing?: boolean;
  onClose: () => void;
  onSave: (form: EventFormData) => void;
}) {
  const [tipoEvento, setTipoEvento] = useState<EventKind>('Partido');
  const [tipoCompeticion, setTipoCompeticion] = useState('');
  const [rival, setRival] = useState('');
  const [dateKey, setDateKey] = useState(defaultDate());
  const [horaInicio, setHoraInicio] = useState('10:00');
  const [horaFin, setHoraFin] = useState('11:30');
  const [horaQuedada, setHoraQuedada] = useState('09:30');
  const [equipacion, setEquipacion] = useState('');
  const [lugarPartido, setLugarPartido] = useState('');
  const [lugarQuedada, setLugarQuedada] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [ubicacionMaps, setUbicacionMaps] = useState('');

  React.useEffect(() => {
    if (form) {
      setTipoEvento(form.tipoEvento || 'Otro');
      setTipoCompeticion(form.tipoCompeticion || '');
      setRival(form.rival || '');
      setDateKey(form.dateKey || defaultDate());
      setHoraInicio(form.horaInicio);
      setHoraFin(form.horaFin);
      setHoraQuedada(form.horaQuedada);
      setEquipacion(form.equipacion);
      setLugarPartido(form.lugarPartido || '');
      setLugarQuedada(form.lugarQuedada || '');
      setObservaciones(form.observaciones);
      setDescripcion(form.descripcion || '');
      setUbicacionMaps(form.ubicacionMaps);
    }
  }, [form]);

  const handleSave = useCallback(() => {
    if (!form) return;
    onSave({
      ...form,
      tipoEvento,
      tipoCompeticion: tipoCompeticion.trim(),
      rival: rival.trim(),
      dateKey: parseDateKey(dateKey),
      horaInicio: horaInicio.trim() || '10:00',
      horaFin: horaFin.trim() || '11:30',
      horaQuedada: horaQuedada.trim() || '09:30',
      equipacion: equipacion.trim(),
      lugarPartido: lugarPartido.trim(),
      lugarQuedada: lugarQuedada.trim(),
      observaciones: observaciones.trim(),
      descripcion: descripcion.trim(),
      ubicacionMaps: ubicacionMaps.trim(),
    });
  }, [form, tipoEvento, tipoCompeticion, rival, dateKey, horaInicio, horaFin, horaQuedada, equipacion, lugarPartido, lugarQuedada, observaciones, descripcion, ubicacionMaps, onSave]);

  if (!form) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent}>
          <ScrollView style={styles.eventFormScroll} contentContainerStyle={styles.eventFormScrollContent} showsVerticalScrollIndicator>
            <Text style={styles.modalTitle}>{isEditing ? 'Editar evento' : 'Agendar evento'}</Text>
            <Text style={styles.modalLabel}>Tipo de evento</Text>
            <View style={styles.tipoRow}>
              {(['Partido', 'Entrenamiento', 'Otro'] as EventKind[]).map((t) => {
                const active = tipoEvento === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.tipoBtn, active && styles.tipoBtnActive]}
                    onPress={() => setTipoEvento(t)}
                  >
                    <Text style={[styles.tipoBtnTxt, active && styles.tipoBtnTxtActive]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.modalLabel}>📅 Fecha (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              value={dateKey}
              onChangeText={setDateKey}
              placeholder="2026-03-18"
              placeholderTextColor="#666"
              autoCapitalize="none"
            />

            {tipoEvento === 'Partido' && (
              <>
                <Text style={styles.modalLabel}>🏆 Tipo de competición</Text>
                <TextInput
                  style={styles.modalInput}
                  value={tipoCompeticion}
                  onChangeText={setTipoCompeticion}
                  placeholder="Liga, Copa, Amistoso..."
                  placeholderTextColor="#666"
                />
                <Text style={styles.modalLabel}>🆚 Rival</Text>
                <TextInput
                  style={styles.modalInput}
                  value={rival}
                  onChangeText={setRival}
                  placeholder="Nombre del rival"
                  placeholderTextColor="#666"
                />
                <Text style={styles.modalLabel}>🕒 Hora del partido (HH:MM)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={horaInicio}
                  onChangeText={setHoraInicio}
                  placeholder="10:00"
                  placeholderTextColor="#666"
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.modalLabel}>📍 Lugar del partido</Text>
                <TextInput
                  style={styles.modalInput}
                  value={lugarPartido}
                  onChangeText={setLugarPartido}
                  placeholder="Pabellón / Dirección"
                  placeholderTextColor="#666"
                />
                <Text style={styles.modalLabel}>📌 Lugar de quedada (opcional)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={lugarQuedada}
                  onChangeText={setLugarQuedada}
                  placeholder="Punto de encuentro"
                  placeholderTextColor="#666"
                />
                <Text style={styles.modalLabel}>🕘 Hora de quedada (HH:MM)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={horaQuedada}
                  onChangeText={setHoraQuedada}
                  placeholder="09:30"
                  placeholderTextColor="#666"
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.modalLabel}>👕 Equipación</Text>
                <TextInput
                  style={styles.modalInput}
                  value={equipacion}
                  onChangeText={setEquipacion}
                  placeholder="Primera, segunda, petos..."
                  placeholderTextColor="#666"
                />
                <Text style={styles.modalLabel}>📝 Observaciones</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalInputMultiline]}
                  value={observaciones}
                  onChangeText={setObservaciones}
                  placeholder="Detalles del partido"
                  placeholderTextColor="#666"
                  multiline
                />
                <Text style={styles.modalLabel}>🗺 Ubicación Google Maps</Text>
                <TextInput
                  style={styles.modalInput}
                  value={ubicacionMaps}
                  onChangeText={setUbicacionMaps}
                  placeholder="https://maps.google.com/..."
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                />
              </>
            )}

            {tipoEvento === 'Entrenamiento' && (
              <>
                <Text style={styles.modalLabel}>🕒 Hora inicio (HH:MM)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={horaInicio}
                  onChangeText={setHoraInicio}
                  placeholder="18:00"
                  placeholderTextColor="#666"
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.modalLabel}>⏱ Hora fin (HH:MM)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={horaFin}
                  onChangeText={setHoraFin}
                  placeholder="19:30"
                  placeholderTextColor="#666"
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.modalLabel}>📝 Observaciones</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalInputMultiline]}
                  value={observaciones}
                  onChangeText={setObservaciones}
                  placeholder="Plan de sesión, material..."
                  placeholderTextColor="#666"
                  multiline
                />
              </>
            )}

            {tipoEvento === 'Otro' && (
              <>
                <Text style={styles.modalLabel}>🕒 Hora inicio (HH:MM)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={horaInicio}
                  onChangeText={setHoraInicio}
                  placeholder="10:00"
                  placeholderTextColor="#666"
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.modalLabel}>⏱ Hora fin (HH:MM)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={horaFin}
                  onChangeText={setHoraFin}
                  placeholder="11:00"
                  placeholderTextColor="#666"
                  keyboardType="numbers-and-punctuation"
                />
                <Text style={styles.modalLabel}>📝 Descripción</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalInputMultiline]}
                  value={descripcion}
                  onChangeText={setDescripcion}
                  placeholder="Describe el evento..."
                  placeholderTextColor="#666"
                  multiline
                />
              </>
            )}
          </ScrollView>
          <View style={styles.modalButtons}>
            <TouchableOpacity style={[styles.modalBtnCancel, styles.modalBtnHalf]} onPress={onClose}>
              <Text style={styles.modalBtnCancelTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtnSave, styles.modalBtnHalf]} onPress={handleSave}>
              <Text style={styles.modalBtnSaveTxt}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// MODAL EXPORTAR (filtro fechas + listado + calendario mes)
// -----------------------------------------------------------------------------

function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function ExportModal({
  visible,
  onClose,
  filterDesde,
  filterHasta,
  setFilterDesde,
  setFilterHasta,
  onExportList,
  onExportCalendar,
  exporting,
}: {
  visible: boolean;
  onClose: () => void;
  filterDesde: string;
  filterHasta: string;
  setFilterDesde: (s: string) => void;
  setFilterHasta: (s: string) => void;
  onExportList: () => Promise<void>;
  onExportCalendar: () => Promise<void>;
  exporting: boolean;
}) {
  const setCurrentMonth = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    setFilterDesde(firstDayOfMonth(y, m));
    setFilterHasta(lastDayOfMonth(y, m));
  };

  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Exportar calendario</Text>
          <Text style={styles.modalLabel}>Fecha desde (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.modalInput}
            value={filterDesde}
            onChangeText={setFilterDesde}
            placeholder="2025-02-01"
            placeholderTextColor="#666"
          />
          <Text style={styles.modalLabel}>Fecha hasta (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.modalInput}
            value={filterHasta}
            onChangeText={setFilterHasta}
            placeholder="2025-02-28"
            placeholderTextColor="#666"
          />
          <TouchableOpacity style={styles.exportModalSecBtn} onPress={setCurrentMonth}>
            <Text style={styles.exportModalSecTxt}>Usar mes actual</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalBtnSave, { marginTop: 12 }]}
            onPress={onExportList}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.modalBtnSaveTxt}>Exportar listado filtrado (PDF)</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalBtnSave, styles.exportModalCalBtn]}
            onPress={onExportCalendar}
            disabled={exporting}
          >
            <Text style={styles.modalBtnSaveTxt}>Exportar calendario del mes (PDF)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalBtnCancel} onPress={onClose}>
            <Text style={styles.modalBtnCancelTxt}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function CalendarDay({
  day,
  isCurrentMonth,
  isSelected,
  matchesCount,
  onPress,
  onLongPress,
}: {
  day: number | null;
  isCurrentMonth: boolean;
  isSelected: boolean;
  matchesCount: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  if (day == null) {
    return <View style={styles.calDayEmpty} />;
  }
  return (
    <TouchableOpacity
      style={[
        styles.calDay,
        !isCurrentMonth && styles.calDayOther,
        isSelected && styles.calDaySelected,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      <Text style={[styles.calDayNum, !isCurrentMonth && styles.calDayNumOther]}>{day}</Text>
      {matchesCount > 0 && (
        <View style={styles.calDayDot}>
          <Text style={styles.calDayDotTxt}>{matchesCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// -----------------------------------------------------------------------------
// VISTA CALENDARIO MENSUAL
// -----------------------------------------------------------------------------

function buildMonthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = first.getDay();
  const daysInMonth = last.getDate();
  const rows: (number | null)[][] = [];
  let row: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) row.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    row.push(d);
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) {
    while (row.length < 7) row.push(null);
    rows.push(row);
  }
  return rows;
}

function CalendarMonthView({
  matches,
  selectedDateKey,
  onSelectDate,
  onLongPressDate,
}: {
  matches: MatchItem[];
  selectedDateKey: string | null;
  onSelectDate: (key: string) => void;
  onLongPressDate: (key: string, dayMatches: MatchItem[]) => void;
}) {
  const [current, setCurrent] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const grid = useMemo(
    () => buildMonthGrid(current.year, current.month),
    [current.year, current.month]
  );

  const matchesByDate = useMemo(() => {
    const map: Record<string, MatchItem[]> = {};
    matches.forEach((m) => {
      const key = parseDateKey(m.fecha);
      if (!map[key]) map[key] = [];
      map[key].push(m);
    });
    return map;
  }, [matches]);

  const prevMonth = useCallback(() => {
    setCurrent((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  }, []);
  const nextMonth = useCallback(() => {
    setCurrent((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
  }, []);

  const monthLabel = `${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][current.month]} ${current.year}`;

  return (
    <View style={styles.calendarWrap}>
      <View style={styles.calendarNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.calendarNavBtn}>
          <FontAwesome name="chevron-left" size={20} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.calendarNavTitle}>{monthLabel}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.calendarNavBtn}>
          <FontAwesome name="chevron-right" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
      <View style={styles.weekRow}>
        {WEEK_DAYS.map((label) => (
          <Text key={label} style={styles.weekDayLabel}>
            {label}
          </Text>
        ))}
      </View>
      {grid.map((row, ri) => (
        <View key={ri} style={styles.calRow}>
          {row.map((day, di) => {
            const dateKey =
              day != null
                ? `${current.year}-${String(current.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                : '';
            const dayMatches = dateKey ? matchesByDate[dateKey] ?? [] : [];
            return (
              <CalendarDay
                key={di}
                day={day}
                isCurrentMonth={true}
                isSelected={dateKey === selectedDateKey}
                matchesCount={dayMatches.length}
                onPress={() => dateKey && onSelectDate(dateKey)}
                onLongPress={() => dateKey && onLongPressDate(dateKey, dayMatches)}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

// -----------------------------------------------------------------------------
// COMPONENTE PRINCIPAL
// -----------------------------------------------------------------------------

export default function Calendario({
  partidos = [],
  setPartidos,
  eventosCalendario = [],
  setEventosCalendario,
  players = [],
  onBack,
  onVerPartido,
}: CalendarioProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [eventFormData, setEventFormData] = useState<EventFormData | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const now = new Date();
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [filterDesde, setFilterDesde] = useState(() => firstDayOfMonth(now.getFullYear(), now.getMonth() + 1));
  const [filterHasta, setFilterHasta] = useState(() => lastDayOfMonth(now.getFullYear(), now.getMonth() + 1));
  const [exporting, setExporting] = useState(false);

  const { matches, loading, error, syncFromSheets } = useMatches(partidos, setPartidos, players, eventosCalendario);

  const matchesFiltered = useMemo(() => {
    return matches.filter((m) => {
      const k = parseDateKey(m.fecha);
      return k >= filterDesde && k <= filterHasta;
    });
  }, [matches, filterDesde, filterHasta]);
  const shareMatch = useShareMatch();
  const { createEventFromForm } = useDeviceCalendar();

  const matchesForList = useMemo(() => matches, [matches]);
  const matchesForSelectedDate = useMemo(() => {
    if (!selectedDateKey) return [];
    return matches.filter((m) => parseDateKey(m.fecha) === selectedDateKey);
  }, [matches, selectedDateKey]);

  const openEventModal = useCallback((dateKey: string, match: MatchItem | null) => {
    setEditingEventId(null);
    setEventFormData(defaultEventForm(dateKey, match));
    setEventModalVisible(true);
  }, []);

  const handleEditEvent = useCallback((match: MatchItem) => {
    if (!match.isEvento) return;
    const ev = eventosCalendario.find((e) => (e.id.startsWith('ev_') ? e.id : `ev_${e.id}`) === match.id);
    if (!ev) return;
    setEventFormData({
      tipoEvento: (ev.tipoEvento || 'Otro') as EventKind,
      tipoCompeticion: ev.tipoCompeticion || '',
      rival: ev.rival || ev.title || '',
      dateKey: ev.dateKey,
      horaInicio: ev.horaInicio || '10:00',
      horaFin: ev.horaFin || '11:30',
      horaQuedada: ev.horaQuedada || '09:30',
      equipacion: ev.equipacion || '',
      lugarPartido: ev.lugarPartido || ev.ubicacion || '',
      lugarQuedada: ev.lugarQuedada || '',
      observaciones: ev.observaciones || '',
      descripcion: ev.descripcion || '',
      ubicacionMaps: ev.ubicacionMaps || '',
    });
    setEditingEventId(ev.id);
    setEventModalVisible(true);
  }, [eventosCalendario]);

  const onLongPressDay = useCallback(
    (dateKey: string, dayMatches: MatchItem[]) => {
      openEventModal(dateKey, dayMatches.length > 0 ? dayMatches[0] : null);
    },
    [openEventModal]
  );

  const handleSaveEvent = useCallback(
    async (form: EventFormData) => {
      const isEditing = editingEventId != null;
      const tipoEvento = (form.tipoEvento || 'Otro') as EventKind;
      const rival = tipoEvento === 'Partido'
        ? (form.rival || '').trim()
        : tipoEvento === 'Entrenamiento'
        ? 'Entrenamiento'
        : ((form.descripcion || '').trim() || 'Otro');
      const newEvent: EventoCalendarioStored = {
        id: isEditing ? editingEventId : `ev_${Date.now()}`,
        tipoEvento,
        tipoCompeticion: tipoEvento === 'Partido' ? (form.tipoCompeticion || '').trim() : '',
        rival,
        title: rival || 'Evento',
        dateKey: form.dateKey || defaultDate(),
        horaInicio: (form.horaInicio || '10:00').trim(),
        horaFin: (form.horaFin || '11:30').trim(),
        horaQuedada: tipoEvento === 'Partido' ? (form.horaQuedada || '09:30').trim() : '',
        equipacion: tipoEvento === 'Partido' ? (form.equipacion || '').trim() : '',
        lugarPartido: tipoEvento === 'Partido' ? (form.lugarPartido || '').trim() : '',
        lugarQuedada: tipoEvento === 'Partido' ? (form.lugarQuedada || '').trim() : '',
        observaciones: (form.observaciones || '').trim(),
        descripcion: tipoEvento === 'Otro' ? (form.descripcion || '').trim() : '',
        ubicacionMaps: tipoEvento === 'Partido' ? (form.ubicacionMaps || '').trim() : '',
        ubicacion: tipoEvento === 'Partido' ? (form.lugarPartido || '').trim() : '',
        notas: '',
      };
      if (setEventosCalendario) {
        if (isEditing) {
          setEventosCalendario(eventosCalendario.map((ev) => (ev.id === editingEventId ? newEvent : ev)));
        } else {
          setEventosCalendario([...eventosCalendario, newEvent]);
        }
      }
      setEventModalVisible(false);
      setEventFormData(null);
      setEditingEventId(null);
      if (!isEditing) await createEventFromForm(form);
    },
    [createEventFromForm, setEventosCalendario, eventosCalendario, editingEventId]
  );

  const handleDeleteEvent = useCallback(
    (id: string) => {
      if (!setEventosCalendario || !id.startsWith('ev_')) return;
      setEventosCalendario(eventosCalendario.filter((ev) => (ev.id.startsWith('ev_') ? ev.id : `ev_${ev.id}`) !== id));
    },
    [setEventosCalendario, eventosCalendario]
  );

  const handleExportList = useCallback(async () => {
    setExporting(true);
    try {
      const rows = matchesFiltered.map((m) => {
        const tipo = m.isEvento ? (m.tipo || 'Otro') : 'Partido';
        const resultado = m.estado === 'jugado' && !m.isEvento ? `${m.golesFavor}-${m.golesContra}` : '—';
        let detalle = '';
        if (!m.isEvento) {
          detalle = `🆚 Rival: ${m.rival} · 🕒 Hora: ${m.hora} · 📍 Lugar: ${m.lugar}`;
        } else if (tipo === 'Partido') {
          detalle = [
            `🏆 Competición: ${m.tipoCompeticion || '—'}`,
            `🆚 Rival: ${m.rival || '—'}`,
            `🕒 Hora partido: ${m.hora || '--'}`,
            `📍 Lugar partido: ${m.lugar || '—'}`,
            `📌 Lugar quedada: ${m.lugarQuedada || '—'}`,
            `🕘 Hora quedada: ${m.horaQuedada || '--'}`,
            `👕 Equipación: ${m.equipacion || '—'}`,
            `📝 Observaciones: ${m.observaciones || '—'}`,
          ].join(' · ');
        } else if (tipo === 'Entrenamiento') {
          detalle = [
            `🕒 Hora inicio: ${m.hora || '--'}`,
            `⏱ Hora fin: ${m.horaFin || '--'}`,
            `📝 Observaciones: ${m.observaciones || '—'}`,
          ].join(' · ');
        } else {
          detalle = [
            `🕒 Hora inicio: ${m.hora || '--'}`,
            `⏱ Hora fin: ${m.horaFin || '--'}`,
            `📝 Descripción: ${m.descripcion || '—'}`,
          ].join(' · ');
        }
        const maps = m.isEvento && m.ubicacionMaps ? m.ubicacionMaps : '—';
        return `<tr>
          <td>${escapeHtml(tipo)}</td>
          <td>${escapeHtml(formatDateLabel(parseDateKey(m.fecha)))}</td>
          <td>${escapeHtml(detalle)}</td>
          <td>${escapeHtml(m.estado || '—')}</td>
          <td>${escapeHtml(resultado)}</td>
          <td>${escapeHtml(maps)}</td>
        </tr>`;
      });
      const html = `
        <!DOCTYPE html><html><head><meta charset="utf-8"/><style>
          body{ font-family: sans-serif; padding: 16px; }
          table{ width:100%; border-collapse: collapse; font-size: 11px; }
          th,td{ border:1px solid #ccc; padding: 6px; text-align:left; }
          th{ background:#012E57; color:#fff; }
        </style></head><body>
        <h1>Calendario – Listado (${formatDateLabel(filterDesde)} a ${formatDateLabel(filterHasta)})</h1>
        <table><thead><tr><th>Tipo</th><th>Fecha</th><th>Detalle (con iconos)</th><th>Estado</th><th>Resultado</th><th>Google Maps</th></tr></thead>
        <tbody>${rows.length ? rows.join('') : '<tr><td colspan="6">Sin registros en este rango</td></tr>'}</tbody></table>
        </body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      const available = await Sharing.isAvailableAsync();
      if (available) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      else Alert.alert('Listo', 'PDF generado.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo exportar.');
    } finally {
      setExporting(false);
    }
  }, [matchesFiltered, filterDesde, filterHasta]);

  const handleExportCalendar = useCallback(async () => {
    setExporting(true);
    try {
      const [y, m] = filterDesde.split('-').map(Number);
      const monthLabel = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][(m || 1) - 1];
      const first = new Date(y, (m || 1) - 1, 1);
      const last = new Date(y, m || 1, 0);
      const startDow = first.getDay();
      const daysInMonth = last.getDate();
      const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const prefix = `${y}-${String(m).padStart(2, '0')}-`;
      const monthMatches = matches.filter((mm) => parseDateKey(mm.fecha).startsWith(prefix));
      const matchesByDay: Record<number, MatchItem[]> = {};
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${prefix}${String(d).padStart(2, '0')}`;
        matchesByDay[d] = monthMatches.filter((mm) => parseDateKey(mm.fecha) === key);
      }
      let cells: string[] = [];
      for (let i = 0; i < startDow; i++) cells.push('<td></td>');
      for (let d = 1; d <= daysInMonth; d++) {
        const list = (matchesByDay[d] || [])
          .map((mm) => {
            if (mm.isEvento) {
              const tipo = mm.tipo || 'Otro';
              if (tipo === 'Partido') {
                const parts = [
                  `• ⚽ [Partido]`,
                  `🕒 ${mm.hora || '--'}`,
                  `🏆 ${mm.tipoCompeticion || '—'}`,
                  `🆚 ${mm.rival || '—'}`,
                  `📍 ${mm.lugar || '—'}`,
                  `📌 ${mm.lugarQuedada || '—'}`,
                  `🕘 ${mm.horaQuedada || '--'}`,
                  `👕 ${mm.equipacion || '—'}`,
                  `📝 ${mm.observaciones || '—'}`,
                ];
                if (mm.ubicacionMaps) parts.push(`🗺 ${mm.ubicacionMaps}`);
                return parts.join(' | ');
              }
              if (tipo === 'Entrenamiento') {
                return `• 🏃 [Entrenamiento] 🕒 ${mm.hora || '--'} | ⏱ ${mm.horaFin || '--'} | 📝 ${mm.observaciones || '—'}`;
              }
              return `• 📌 [Otro] 🕒 ${mm.hora || '--'} | ⏱ ${mm.horaFin || '--'} | 📝 ${mm.descripcion || '—'}`;
            }
            const resultado = mm.estado === 'jugado' ? `${mm.golesFavor}-${mm.golesContra}` : 'Pendiente';
            return `• [Partido] ${mm.hora || '--'} | vs ${mm.rival} | ${mm.lugar} | ${mm.tipo} | ${resultado}`;
          })
          .map((line) => escapeHtml(line))
          .join('<br/>');
        cells.push(`<td style="border:1px solid #ccc; padding:4px; vertical-align:top; font-size:10px;"><strong>${d}</strong><br/>${list || '—'}</td>`);
        if ((startDow + d) % 7 === 0) cells.push('</tr><tr>');
      }
      const html = `
        <!DOCTYPE html><html><head><meta charset="utf-8"/><style>
          body{ font-family: sans-serif; padding: 16px; }
          table{ width:100%; border-collapse: collapse; font-size: 11px; }
          th{ background:#012E57; color:#fff; padding: 6px; }
        </style></head><body>
        <h1>Calendario – ${monthLabel} ${y}</h1>
        <table><thead><tr>${weekDays.map((w) => `<th>${w}</th>`).join('')}</tr></thead>
        <tbody><tr>${cells.join('')}</tr></tbody></table>
        </body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      const available = await Sharing.isAvailableAsync();
      if (available) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      else Alert.alert('Listo', 'PDF generado.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo exportar.');
    } finally {
      setExporting(false);
    }
  }, [matches, filterDesde]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <EventModal
        visible={eventModalVisible}
        form={eventFormData}
        isEditing={editingEventId != null}
        onClose={() => {
          setEventModalVisible(false);
          setEventFormData(null);
          setEditingEventId(null);
        }}
        onSave={handleSaveEvent}
      />
      <ExportModal
        visible={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
        filterDesde={filterDesde}
        filterHasta={filterHasta}
        setFilterDesde={setFilterDesde}
        setFilterHasta={setFilterHasta}
        onExportList={handleExportList}
        onExportCalendar={handleExportCalendar}
        exporting={exporting}
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <Text style={styles.headerBtnTxt}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Calendario</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.headerActions}>
        <TouchableOpacity style={styles.exportBtn} onPress={() => setExportModalVisible(true)}>
          <FontAwesome name="file-pdf-o" size={16} color="#FFF" />
          <Text style={styles.exportBtnTxt}> Exportar</Text>
        </TouchableOpacity>
      </View>

      <ViewToggle mode={viewMode} onModeChange={setViewMode} />

      {setPartidos && (
        <TouchableOpacity
          style={styles.syncBtn}
          onPress={syncFromSheets}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <FontAwesome name="cloud-download" size={16} color="#FFF" />
              <Text style={styles.syncBtnTxt}> Sincronizar desde Sheets</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <FontAwesome name="exclamation-circle" size={18} color="#FF4757" />
          <Text style={styles.errorTxt}>{error}</Text>
        </View>
      ) : null}

      {viewMode === 'calendar' && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={syncFromSheets} tintColor="#00aaff" />
          }
        >
          <CalendarMonthView
            matches={matches}
            selectedDateKey={selectedDateKey}
            onSelectDate={setSelectedDateKey}
            onLongPressDate={onLongPressDay}
          />
          {selectedDateKey && matchesForSelectedDate.length > 0 && (
            <View style={styles.selectedDaySection}>
              <Text style={styles.selectedDayTitle}>
                {formatDateLabel(selectedDateKey)} — {matchesForSelectedDate.length} partido(s)
              </Text>
              {matchesForSelectedDate.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  onShare={shareMatch}
                  onAddToCalendar={(match) => openEventModal(parseDateKey(match.fecha), match)}
                  onPress={onVerPartido}
                  onDeleteEvent={handleDeleteEvent}
                  onEditEvent={handleEditEvent}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {viewMode === 'list' && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={syncFromSheets} tintColor="#00aaff" />
          }
        >
          {matchesForList.length === 0 ? (
            <View style={styles.empty}>
              <FontAwesome name="futbol-o" size={48} color="#333" />
              <Text style={styles.emptyTxt}>No hay partidos</Text>
              <Text style={styles.emptySub}>Sincroniza desde Sheets o añade partidos en la pestaña Partidos.</Text>
            </View>
          ) : (
            matchesForList.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                onShare={shareMatch}
                onAddToCalendar={(match) => openEventModal(parseDateKey(match.fecha), match)}
                onPress={onVerPartido}
                onDeleteEvent={handleDeleteEvent}
                onEditEvent={handleEditEvent}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// -----------------------------------------------------------------------------
// ESTILOS
// -----------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#012E57',
  },
  headerBtn: { minWidth: 80 },
  headerBtnTxt: { color: '#00aaff', fontSize: 15, fontWeight: '600' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  viewToggle: { flexDirection: 'row', padding: 12, gap: 10 },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#012E57',
  },
  toggleBtnActive: { backgroundColor: '#00aaff' },
  toggleTxt: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  toggleTxtActive: { color: '#001A33' },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
    marginBottom: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1565C0',
  },
  syncBtnTxt: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,71,87,0.15)',
    gap: 8,
  },
  errorTxt: { color: '#FF4757', fontSize: 13, flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 40 },
  calendarWrap: { marginBottom: 20 },
  calendarNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  calendarNavBtn: { padding: 8 },
  calendarNavTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDayLabel: { flex: 1, textAlign: 'center', color: '#00aaff', fontSize: 11, fontWeight: '600' },
  calRow: { flexDirection: 'row', marginBottom: 2 },
  calDayEmpty: { flex: 1, aspectRatio: 1, margin: 2 },
  calDay: {
    flex: 1,
    aspectRatio: 1,
    margin: 2,
    borderRadius: 8,
    backgroundColor: '#012E57',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calDayOther: { backgroundColor: '#001A33', opacity: 0.6 },
  calDaySelected: { backgroundColor: '#00aaff', borderWidth: 2, borderColor: '#FFF' },
  calDayNum: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  calDayNumOther: { color: '#666' },
  calDayDot: {
    position: 'absolute',
    bottom: 2,
    right: 4,
    backgroundColor: '#00aaff',
    borderRadius: 10,
    minWidth: 16,
    alignItems: 'center',
  },
  calDayDotTxt: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  selectedDaySection: { marginTop: 16 },
  selectedDayTitle: { color: '#00aaff', fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  matchCard: {
    backgroundColor: '#012E57',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9F43',
  },
  matchCardJugado: { borderLeftColor: '#50C878', opacity: 0.95 },
  matchCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  matchRival: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgePendiente: { backgroundColor: '#FF9F4322' },
  badgeJugado: { backgroundColor: '#50C87822' },
  badgeEvento: { backgroundColor: '#9B59B622' },
  badgeTxt: { color: '#FFF', fontSize: 10, fontWeight: '600' },
  matchCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  matchMeta: { color: '#AAA', fontSize: 13 },
  matchResultado: { color: '#50C878', fontSize: 13, fontWeight: '600', marginTop: 4 },
  matchCardActions: { flexDirection: 'row', gap: 16, marginTop: 12, flexWrap: 'wrap' },
  matchActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchActionBtnDelete: { backgroundColor: '#B71C1C' },
  matchActionBtnDeleteTxt: { color: '#FFF' },
  matchActionBtnEdit: { backgroundColor: '#1565C0' },
  matchActionBtnEditTxt: { color: '#FFF' },
  matchActionTxt: { color: '#00aaff', fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTxt: { color: '#888', fontSize: 16, marginTop: 12 },
  emptySub: { color: '#666', fontSize: 12, marginTop: 6, textAlign: 'center', paddingHorizontal: 24 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#012E57',
    borderRadius: 16,
    padding: 16,
    maxHeight: '90%',
  },
  eventFormScroll: { maxHeight: 520 },
  eventFormScrollContent: { paddingBottom: 8 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  tipoRow: { flexDirection: 'row', marginBottom: 8 },
  tipoBtn: {
    flex: 1,
    backgroundColor: '#001A33',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginRight: 6,
  },
  tipoBtnActive: { backgroundColor: '#00aaff' },
  tipoBtnTxt: { color: '#AAA', fontSize: 12, fontWeight: '700' },
  tipoBtnTxtActive: { color: '#001A33' },
  modalLabel: { color: '#00aaff', fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  modalInput: {
    backgroundColor: '#001A33',
    borderRadius: 8,
    padding: 12,
    color: '#FFF',
    fontSize: 15,
  },
  modalInputMultiline: { minHeight: 60, textAlignVertical: 'top' },
  modalDateReadonly: { color: '#AAA', fontSize: 15, paddingVertical: 8 },
  modalButtons: { flexDirection: 'row', marginTop: 14, justifyContent: 'space-between' },
  modalBtnHalf: { flex: 1 },
  modalBtnCancel: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: '#333',
    alignItems: 'center',
  },
  modalBtnCancelTxt: { color: '#FFF', fontWeight: '600' },
  modalBtnSave: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#00aaff',
    alignItems: 'center',
  },
  modalBtnSaveTxt: { color: '#001A33', fontWeight: 'bold' },
  exportModalSecBtn: { marginTop: 8, paddingVertical: 8 },
  exportModalSecTxt: { color: '#00aaff', fontSize: 13 },
  exportModalCalBtn: { backgroundColor: '#2E7D32', marginTop: 8 },
  headerActions: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2E7D32',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  exportBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
});
