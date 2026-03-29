import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  players: any[];
  onBack: () => void;
  onStartMatch: (config: any, rotacion: any) => void;
};

export default function ConfigurarPartido({ players, onBack, onStartMatch }: Props) {
  const iniciar = () => {
    const config = {
      periodoActual: 1,
      duracionPeriodoMin: 20,
      totalPeriodos: 2,
    };
    const rotacion = {
      jugadores: Array.isArray(players) ? players : [],
      cambios: [],
    };
    onStartMatch(config, rotacion);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backTxt}>VOLVER</Text>
        </TouchableOpacity>
        <Text style={styles.title}>CONFIGURAR PARTIDO</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.info}>Jugadores disponibles: {Array.isArray(players) ? players.length : 0}</Text>
        <TouchableOpacity onPress={iniciar} style={styles.startBtn}>
          <Text style={styles.startTxt}>INICIAR CRONOMETRO</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, marginBottom: 10 },
  backBtn: { padding: 8 },
  backTxt: { color: '#90CAF9', fontWeight: '700' },
  title: { flex: 1, color: '#FFFFFF', textAlign: 'center', fontWeight: '700', marginRight: 58 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  info: { color: '#E3F2FD', marginBottom: 18 },
  startBtn: { backgroundColor: '#0D47A1', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8 },
  startTxt: { color: '#FFFFFF', fontWeight: '700' },
});
