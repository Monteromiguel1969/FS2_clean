import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { todayFormatted } from '../utils/dateFormat';
import { useScreenMetrics } from '../utils/useScreenMetrics';
import { DDMMYYYYDatePickerField } from './YmdDatePickerField';

export default function Entrenamientos({ players, entrenos, setEntrenos, editItem, onBack }: { players: unknown[]; entrenos: unknown[]; setEntrenos: (e: unknown[]) => Promise<void>; editItem: any; onBack: () => void }) {
  const screen = useScreenMetrics();
  const [fecha, setFecha] = useState(editItem?.fecha || todayFormatted());
  const [objetivos, setObjetivos] = useState(editItem?.objetivos || '');
  const [asistencia, setAsistencia] = useState([]);
  /** Id de sesión en edición (desde Stats/editItem o desde «últimas sesiones»). */
  const [activeEditId, setActiveEditId] = useState<string | number | null>(editItem?.id ?? null);

  // --- FUNCIÓN DE ORDENACIÓN ESTRICTA ---
  // Esta función garantiza: 1º Jugadores, 2º Staff, y dentro de cada uno, orden alfabético.
  const ordenarListaEstricta = (lista) => {
    return [...lista].sort((a, b) => {
      // Prioridad de Rol: "Jugador" tiene prioridad sobre cualquier otro (como "Monitor")
      if (a.role === 'Jugador' && b.role !== 'Jugador') return -1;
      if (a.role !== 'Jugador' && b.role === 'Jugador') return 1;

      // Si tienen el mismo rol, ordenamos por Nombre alfabéticamente (A-Z)
      return a.name.localeCompare(b.name);
    });
  };

  useEffect(() => {
    if (editItem && editItem.asistencia) {
      setActiveEditId(editItem.id ?? null);
      setFecha(editItem.fecha || todayFormatted());
      setObjetivos(editItem.objetivos || '');
      setAsistencia(ordenarListaEstricta(editItem.asistencia));
    } else if (!editItem) {
      setActiveEditId(null);
      setFecha(todayFormatted());
      setObjetivos('');
      const nuevaLista = players.map(p => ({ 
        id: p.id, 
        name: p.name, 
        role: p.role, 
        estado: 'AS' 
      }));
      setAsistencia(ordenarListaEstricta(nuevaLista));
    }
  }, [editItem, players]);

  const loadSession = (e: any) => {
    setActiveEditId(e?.id ?? null);
    setFecha(e?.fecha || todayFormatted());
    setObjetivos(e?.objetivos || '');
    setAsistencia(ordenarListaEstricta(Array.isArray(e?.asistencia) ? e.asistencia : []));
  };

  const updateEstado = (id, nuevoEstado) => {
    setAsistencia(asistencia.map(a => a.id === id ? { ...a, estado: nuevoEstado } : a));
  };

  const handleSave = () => {
    if (!fecha.trim()) return Alert.alert("Error", "Debes indicar una fecha");

    const data = {
      id: activeEditId ?? Date.now(),
      fecha,
      objetivos: objetivos.trim(),
      asistencia
    };

    if (activeEditId != null) {
      setEntrenos(entrenos.map((e: any) => (e.id === activeEditId ? data : e)));
    } else {
      setEntrenos([data, ...entrenos]);
    }
    onBack();
  };

  const getPlayerPhoto = (id: string | number) => {
    const p = (players as any[]).find((x) => String(x?.id) === String(id));
    return p?.photo ? String(p.photo) : null;
  };

  return (
    <SafeAreaView style={[styles.container, { paddingHorizontal: screen.horizontalPadding }]} edges={['top', 'bottom']}>
      <View style={styles.headerTitle}>
        <Text style={styles.title}>{activeEditId != null ? 'EDITAR SESIÓN' : 'NUEVA SESIÓN'}</Text>
      </View>

      <View style={styles.rowFechaActions}>
        <View style={styles.fechaBlock}>
          <Text style={styles.label}>FECHA:</Text>
          <DDMMYYYYDatePickerField value={fecha} onChange={setFecha} variant="dark" narrow={false} />
        </View>
        <TouchableOpacity onPress={handleSave} style={[styles.headerActionBtn, styles.headerBtnSave]}>
          <Text style={styles.headerActionBtnTxt}>GUARDAR</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onBack} style={[styles.headerActionBtn, styles.headerBtnBack]}>
          <Text style={styles.headerActionBtnTxt}>VOLVER</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formObj}>
        <Text style={styles.label}>OBJETIVOS TÁCTICOS</Text>
        <TextInput
          style={styles.objetivosInput}
          value={objetivos}
          onChangeText={setObjetivos}
          placeholder="Ej: Presión, Transiciones, Finalización (separa con comas)"
          placeholderTextColor="#666"
          multiline
        />
        <Text style={styles.objetivosHint}>
          Usa comas para que Stats cuente cada objetivo (p. ej. «Presión, Transiciones»).
        </Text>
      </View>

      {!editItem && Array.isArray(entrenos) && entrenos.length > 0 ? (
        <View style={styles.recientesBox}>
          <Text style={styles.label}>ÚLTIMAS SESIONES (tocar para editar)</Text>
          {[...entrenos]
            .slice()
            .sort((a: any, b: any) => String(b?.fecha || '').localeCompare(String(a?.fecha || '')))
            .slice(0, 5)
            .map((e: any) => (
              <TouchableOpacity
                key={String(e.id)}
                style={[styles.recienteRow, activeEditId === e.id && styles.recienteRowOn]}
                onPress={() => loadSession(e)}
              >
                <Text style={styles.recienteTxt} numberOfLines={1}>
                  {e.fecha || 'Sin fecha'}
                  {e.objetivos ? ` · ${String(e.objetivos).slice(0, 40)}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
        </View>
      ) : null}

      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 15, paddingBottom: 40 }}>
        <Text style={styles.secLabel}>LISTADO (JUGADORES {'>'} STAFF)</Text>

        {asistencia.map((a) => {
          const uri = getPlayerPhoto(a.id);
          const inicial = (a.name || '?')[0].toUpperCase();
          return (
          <View key={a.id} style={styles.row}>
            <View style={styles.avatarWrap}>
              {uri ? (
                <Image source={{ uri }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarPh}>{inicial}</Text>
              )}
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{a.name}</Text>
              <View style={[styles.roleBadge, a.role !== 'Jugador' ? styles.badgeStaff : styles.badgePlayer]}>
                <Text style={styles.roleTxt}>{a.role.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.selector}>
              <TouchableOpacity 
                onPress={() => updateEstado(a.id, 'AS')} 
                style={[styles.miniBtn, a.estado === 'AS' && styles.btnAS]}
              >
                <Text style={styles.miniBtnTxt}>AS</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => updateEstado(a.id, 'AV')} 
                style={[styles.miniBtn, a.estado === 'AV' && styles.btnAV]}
              >
                <Text style={styles.miniBtnTxt}>AV</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => updateEstado(a.id, 'NA')} 
                style={[styles.miniBtn, a.estado === 'NA' && styles.btnNA]}
              >
                <Text style={styles.miniBtnTxt}>NA</Text>
              </TouchableOpacity>
            </View>
          </View>
          );
        })}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33' },
  headerTitle: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingTop: 12, paddingBottom: 8, backgroundColor: '#012E57' },
  title: { color: '#FFF', fontSize: 12, fontWeight: 'bold', textAlign: 'center', alignSelf: 'stretch' },
  rowFechaActions: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#012E57',
    borderBottomWidth: 1,
    borderBottomColor: '#001A33',
  },
  fechaBlock: { flex: 1, minWidth: 0 },
  headerActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 76,
  },
  headerBtnSave: { backgroundColor: '#2E7D32' },
  headerBtnBack: { backgroundColor: '#1565C0' },
  headerActionBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 10 },
  formObj: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#012E57' },
  label: { color: '#1565C0', fontSize: 8, fontWeight: 'bold', marginBottom: 4 },
  dateInput: { backgroundColor: '#001A33', color: '#FFF', padding: 8, borderRadius: 8, fontSize: 12, fontWeight: 'bold' },
  objetivosInput: { backgroundColor: '#012E57', color: '#FFF', padding: 8, borderRadius: 8, fontSize: 10, minHeight: 56, textAlignVertical: 'top' },
  objetivosHint: { color: '#78909C', fontSize: 9, marginTop: 4, lineHeight: 12 },
  recientesBox: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#012E57',
  },
  recienteRow: {
    backgroundColor: '#012E57',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#123E63',
  },
  recienteRowOn: { borderColor: '#FFD166', backgroundColor: '#0E4A8A' },
  recienteTxt: { color: '#E3F2FD', fontSize: 11 },
  scroll: { flex: 1 },
  secLabel: { color: '#1565C0', fontSize: 8, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  row: {
    backgroundColor: '#012E57',
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 4,
    borderLeftColor: '#1565C0',
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#001A33',
    marginRight: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImg: { width: 44, height: 44 },
  avatarPh: { color: '#1565C0', fontWeight: 'bold', fontSize: 18 },
  info: { flex: 1, minWidth: 0 },
  name: { color: '#FFF', fontWeight: 'bold', fontSize: 15, marginBottom: 4 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgePlayer: { backgroundColor: '#003366' },
  badgeStaff: { backgroundColor: '#4a3000' },
  roleTxt: { color: '#00aaff', fontSize: 8, fontWeight: 'bold' },
  selector: { flexDirection: 'row' },
  miniBtn: { 
    paddingVertical: 10, 
    paddingHorizontal: 10, 
    backgroundColor: '#001A33', 
    borderRadius: 8, 
    marginLeft: 5,
    minWidth: 40,
    alignItems: 'center'
  },
  miniBtnTxt: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  btnAS: { backgroundColor: '#2E7D32' },
  btnAV: { backgroundColor: '#E65100' },
  btnNA: { backgroundColor: '#B71C1C' }
});