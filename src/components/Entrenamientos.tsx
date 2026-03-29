import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { todayFormatted } from '../utils/dateFormat';

export default function Entrenamientos({ players, entrenos, setEntrenos, editItem, onBack }: { players: unknown[]; entrenos: unknown[]; setEntrenos: (e: unknown[]) => Promise<void>; editItem: any; onBack: () => void }) {
  const [fecha, setFecha] = useState(editItem?.fecha || todayFormatted());
  const [objetivos, setObjetivos] = useState(editItem?.objetivos || '');
  const [asistencia, setAsistencia] = useState([]);

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
      // Si editamos, forzamos el orden estricto sobre lo que viene de base de datos
      setAsistencia(ordenarListaEstricta(editItem.asistencia));
    } else {
      // Si es nuevo, creamos la lista desde la plantilla de 'players' y ordenamos
      const nuevaLista = players.map(p => ({ 
        id: p.id, 
        name: p.name, 
        role: p.role, 
        estado: 'AS' 
      }));
      setAsistencia(ordenarListaEstricta(nuevaLista));
    }
  }, [editItem, players]);

  const updateEstado = (id, nuevoEstado) => {
    setAsistencia(asistencia.map(a => a.id === id ? { ...a, estado: nuevoEstado } : a));
  };

  const handleSave = () => {
    if (!fecha.trim()) return Alert.alert("Error", "Debes indicar una fecha");

    const data = {
      id: editItem?.id || Date.now(),
      fecha,
      objetivos: objetivos.trim(),
      asistencia // Se guarda con el orden que tiene en el estado
    };

    if (editItem) {
      setEntrenos(entrenos.map(e => e.id === editItem.id ? data : e));
    } else {
      setEntrenos([data, ...entrenos]);
    }
    onBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.headerTitle}>
        <Text style={styles.title}>{editItem ? 'EDITAR SESIÓN' : 'NUEVA SESIÓN'}</Text>
      </View>

      <View style={styles.headerActions}>
        <TouchableOpacity onPress={onBack} style={styles.saveBtn}>
          <Text style={styles.saveBtnTxt}>VOLVER</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
          <Text style={styles.saveBtnTxt}>GUARDAR</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>FECHA:</Text>
        <TextInput style={styles.dateInput} value={fecha} onChangeText={setFecha} />
        <Text style={[styles.label, { marginTop: 10 }]}>OBJETIVOS TÁCTICOS (coma separados, ej.: Salida 3-1, Presión 2-2):</Text>
        <TextInput
          style={styles.objetivosInput}
          value={objetivos}
          onChangeText={setObjetivos}
          placeholder="Opcional"
          placeholderTextColor="#666"
          multiline
        />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 15 }}>
        <Text style={styles.secLabel}>LISTADO (JUGADORES {'>'} STAFF):</Text>
        
        {asistencia.map((a) => (
          <View key={a.id} style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.name}>{a.name}</Text>
              {/* Etiqueta visual para distinguir roles */}
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
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33' },
  headerTitle: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingTop: 30, paddingBottom: 4, backgroundColor: '#012E57' },
  headerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 8, backgroundColor: '#012E57' },
  backBtn: { color: '#00aaff', fontWeight: 'bold' },
  title: { color: '#FFF', fontSize: 16, fontWeight: 'bold', textAlign: 'center', alignSelf: 'stretch' },
  saveBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 15, paddingVertical: 3, borderRadius: 8 },
  saveBtnTxt: { color: '#FFF', fontWeight: 'bold' },
  form: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#012E57' },
  label: { color: '#1565C0', fontSize: 10, fontWeight: 'bold', marginBottom: 5 },
  dateInput: { backgroundColor: '#012E57', color: '#FFF', padding: 12, borderRadius: 10, fontSize: 16, fontWeight: 'bold' },
  objetivosInput: { backgroundColor: '#012E57', color: '#FFF', padding: 10, borderRadius: 8, fontSize: 13, minHeight: 60, textAlignVertical: 'top' },
  scroll: { flex: 1 },
  secLabel: { color: '#1565C0', fontSize: 10, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  row: { 
    backgroundColor: '#012E57', 
    padding: 12, 
    borderRadius: 12, 
    marginBottom: 8, 
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 4,
    borderLeftColor: '#1565C0'
  },
  info: { flex: 1 },
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