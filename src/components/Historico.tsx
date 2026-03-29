import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDateGlobal } from '../utils/dateFormat';

export default function Historico({ historico, setHistorico, onBack }: { historico: unknown[]; setHistorico: (h: unknown[]) => void; onBack: () => void }) {

  const eliminarTemporada = (id) => {
    Alert.alert(
      "Eliminar Historial",
      "¿Estás seguro de que quieres borrar esta temporada para siempre? Esta acción no se puede deshacer.",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "ELIMINAR", 
          style: "destructive", 
          onPress: () => {
            const nuevo = historico.filter(item => item.id !== id);
            setHistorico(nuevo);
          } 
        }
      ]
    );
  };

  const verDetalle = (temp) => {
    const totalGoles = temp.partidos.reduce((acc, p) => acc + (parseInt(p.golesFavor) || 0), 0);
    const victorias = temp.partidos.filter(p => (parseInt(p.golesFavor) || 0) > (parseInt(p.golesContra) || 0)).length;

    Alert.alert(
      temp.nombre,
      `📅 Cerrada el: ${formatDateGlobal(temp.fecha)}\n\n` +
      `⚽ Partidos: ${temp.partidos.length}\n` +
      `🏆 Victorias: ${victorias}\n` +
      `📋 Entrenos: ${temp.entrenos.length}\n` +
      `🔥 Goles totales: ${totalGoles}`,
      [{ text: "Cerrar", style: "default" }]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TouchableOpacity onPress={onBack} style={styles.backContainer}>
        <Text style={styles.backBtn}>← VOLVER AL MENÚ</Text>
      </TouchableOpacity>

      <Text style={styles.title}>ARCHIVO HISTÓRICO</Text>
      <Text style={styles.subtitle}>Resumen de temporadas finalizadas</Text>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {historico.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No hay temporadas archivadas todavía.</Text>
            <Text style={styles.emptySub}>Aparecerán aquí cuando uses la opción "Cerrar Temporada" en Estadísticas.</Text>
          </View>
        ) : (
          historico.map((temp) => (
            <View key={temp.id} style={styles.card}>
              <View style={styles.cardInfo}>
                <Text style={styles.tempName}>{temp.nombre.toUpperCase()}</Text>
                <Text style={styles.tempDate}>Finalizada: {formatDateGlobal(temp.fecha)}</Text>
              </View>
              
              <View style={styles.actions}>
                <TouchableOpacity 
                  style={styles.detailBtn} 
                  onPress={() => verDetalle(temp)}
                >
                  <Text style={styles.btnTxt}>DETALLES</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.deleteBtn} 
                  onPress={() => eliminarTemporada(temp.id)}
                >
                  <Text style={styles.btnTxt}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33', padding: 25 },
  backContainer: { marginBottom: 20 },
  backBtn: { color: '#1565C0', fontWeight: 'bold', fontSize: 14 },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  subtitle: { color: '#555', fontSize: 13, marginBottom: 30, fontWeight: 'bold' },
  scroll: { paddingBottom: 40 },
  empty: { marginTop: 120, alignItems: 'center', paddingHorizontal: 20 },
  emptyText: { color: '#1565C0', fontSize: 16, textAlign: 'center', fontWeight: 'bold' },
  emptySub: { color: '#444', fontSize: 12, textAlign: 'center', marginTop: 15, lineHeight: 18 },
  card: { 
    backgroundColor: '#012E57', 
    padding: 20, 
    borderRadius: 18, 
    marginBottom: 15, 
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2
  },
  cardInfo: { flex: 1 },
  tempName: { color: '#fff', fontSize: 17, fontWeight: '900' },
  tempDate: { color: '#1565C0', fontSize: 12, marginTop: 4, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  detailBtn: { 
    backgroundColor: '#1565C0', 
    paddingVertical: 10, 
    paddingHorizontal: 15, 
    borderRadius: 10, 
    marginRight: 10 
  },
  deleteBtn: { 
    backgroundColor: '#B71C1C', 
    padding: 10, 
    borderRadius: 10 
  },
  btnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 11 }
});