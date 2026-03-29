import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Modal, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { getListaEquipos, setListaEquipos, setStorageMode } from '../storage/localStorage';

type EquipoItem = { id: number; nombre: string; temporada: string };

export default function SelectorEquipo({ onConfirm }: { onConfirm: (arg: { equipo: string; temporada: string }) => void }) {
  const insets = useSafeAreaInsets();
  const [listaEquipos, setListaEquiposState] = useState<EquipoItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevaTemporada, setNuevaTemporada] = useState('2025-26');

  useEffect(() => {
    getListaEquipos().then(setListaEquiposState);
  }, []);

  const handleCrearEquipo = async () => {
    if (!nuevoNombre.trim()) {
      Alert.alert("Error", "Debes poner un nombre al equipo");
      return;
    }
    const nuevoItem: EquipoItem = {
      id: Date.now(),
      nombre: nuevoNombre.trim(),
      temporada: nuevaTemporada.trim()
    };
    const nuevaLista = [...listaEquipos, nuevoItem];
    setListaEquiposState(nuevaLista);
    await setListaEquipos(nuevaLista);
    setNuevoNombre('');
    setModalVisible(false);
    Alert.alert(
      '¿Dónde desea guardar los datos de este equipo?',
      'Puede cambiar esta opción más tarde.',
      [
        { text: 'Solo en el teléfono', onPress: () => setStorageMode('local') },
        { text: 'Solo en la nube', onPress: () => setStorageMode('cloud') },
        { text: 'Ambos', onPress: () => setStorageMode('both') },
      ]
    );
  };

  const handleBorrar = (id: number) => {
    Alert.alert("Borrar", "¿Eliminar este acceso directo? (Los datos de jugadores no se borran, solo el acceso)", [
      { text: "Cancelar" },
      {
        text: "Borrar",
        onPress: async () => {
          const nuevaLista = listaEquipos.filter(e => e.id !== id);
          setListaEquiposState(nuevaLista);
          await setListaEquipos(nuevaLista);
        },
        style: 'destructive'
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Text style={styles.title}>MIS EQUIPOS</Text>
      <Text style={styles.subTitle}>Selecciona para cargar datos</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 100 }}>
        {listaEquipos.map((item) => (
          <TouchableOpacity 
            key={item.id} 
            style={styles.card} 
            onPress={() => onConfirm({ equipo: item.nombre, temporada: item.temporada })}
          >
            <View>
              <Text style={styles.cardTitle}>{item.nombre}</Text>
              <Text style={styles.cardSub}>{item.temporada}</Text>
            </View>
            <TouchableOpacity onPress={() => handleBorrar(item.id)} style={{padding:10}}>
              <FontAwesome name="trash" size={20} color="#FF4757" />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Botón Flotante para añadir (respeta zona de gestos) */}
      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 20 }]} onPress={() => setModalVisible(true)}>
        <FontAwesome name="plus" size={24} color="#FFF" />
      </TouchableOpacity>

      <Text style={[styles.credits, { bottom: insets.bottom + 8 }]}>Creada por Miguel Montero</Text>

      {/* MODAL PARA CREAR EQUIPO */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>AÑADIR NUEVO EQUIPO</Text>
            
            <Text style={styles.label}>Nombre del Club:</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ej: Juvenil A" 
              placeholderTextColor="#888"
              value={nuevoNombre}
              onChangeText={setNuevoNombre}
            />

            <Text style={styles.label}>Temporada:</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Ej: 2026-27" 
              placeholderTextColor="#888"
              value={nuevaTemporada}
              onChangeText={setNuevaTemporada}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.btnModal, styles.btnCancel]} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnText}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModal, styles.btnSave]} onPress={handleCrearEquipo}>
                <Text style={styles.btnText}>GUARDAR</Text>
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
  title: { color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 },
  subTitle: { color: '#4CC9F0', fontSize: 14, textAlign: 'center', marginBottom: 30 },
  scroll: { flex: 1 },
  
  card: {
    backgroundColor: '#012E57',
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 5,
    borderLeftColor: '#4CC9F0',
    elevation: 3
  },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  cardSub: { color: '#AAA', fontSize: 14, marginTop: 4 },

  fab: {
    position: 'absolute',
    right: 30,
    backgroundColor: '#2E7D32',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5
  },
  credits: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 12,
    color: '#78909C'
  },

  // Estilos del Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#001A33', padding: 25, borderRadius: 20, borderWidth: 1, borderColor: '#4CC9F0' },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  label: { color: '#4CC9F0', marginBottom: 8, fontWeight: 'bold' },
  input: { backgroundColor: '#FFF', borderRadius: 8, padding: 12, marginBottom: 20, color: '#000' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  btnModal: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center' },
  btnCancel: { backgroundColor: '#C62828' },
  btnSave: { backgroundColor: '#2E7D32' },
  btnText: { color: '#FFF', fontWeight: 'bold' }
});