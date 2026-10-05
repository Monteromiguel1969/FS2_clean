import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScreenMetrics } from '../utils/useScreenMetrics';
import { isPlayerBlocked, isPlayerDoubt } from '../utils/playerAvailability';

type PlayerItem = {
  id: string;
  name?: string;
  nombre?: string;
  number?: string | number;
  dorsal?: string | number;
  photo?: string;
  disponibilidad?: string;
  estadoFisico?: string;
  blocked?: boolean;
  doubt?: boolean;
};

type Props = {
  players: unknown[];
  onBack: () => void;
  onStartMatch: (config: any, rotacion: any) => void;
};

const MAX_EN_PISTA = 5;

export default function ConfigurarPartido({ players, onBack, onStartMatch }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const screen = useScreenMetrics();
  const playerCardMinW = useMemo(
    () => Math.min(64, Math.max(50, Math.floor(width * 0.168))),
    [width]
  );
  const jugadores = useMemo<PlayerItem[]>(() => {
    const base = (Array.isArray(players) ? players : []).filter((p: any) => {
      const role = String(p?.role || '').toLowerCase();
      return role !== 'staff' && role !== 'monitor' && role !== 'cuerpo tecnico' && role !== 'cuerpo técnico';
    });
    return base
      .map((p: any, idx) => ({
        id: String(p?.id ?? `tmp_${idx}`),
        name: p?.name,
        nombre: p?.nombre,
        number: p?.number,
        dorsal: p?.dorsal,
        photo: p?.photo || p?.foto || p?.image || p?.imagen,
        disponibilidad: p?.disponibilidad,
        estadoFisico: p?.estadoFisico,
        blocked: isPlayerBlocked(p),
        doubt: isPlayerDoubt(p),
      }))
      .filter((p) => !!p.id);
  }, [players]);

  const idsDisponibles = useMemo(
    () => jugadores.filter((j) => !j.blocked).map((j) => j.id),
    [jugadores]
  );
  const maxInicial = Math.min(MAX_EN_PISTA, idsDisponibles.length);

  const [rival, setRival] = useState('');
  const [duracionParte, setDuracionParte] = useState('20');
  const [numPartes, setNumPartes] = useState('2');
  const [convocados, setConvocados] = useState<string[]>(idsDisponibles);
  const [enPista, setEnPista] = useState<string[]>(idsDisponibles.slice(0, maxInicial));

  const getPlayer = (id: string) => jugadores.find((x) => x.id === id);
  const nombreJugador = (id: string) => {
    const j = getPlayer(id);
    if (!j) return id;
    const nombre = (j.name || j.nombre || 'Jugador').trim();
    const dorsal = String(j.number ?? j.dorsal ?? '').trim();
    return dorsal ? `${dorsal} ${nombre}` : nombre;
  };

  const toggleConvocado = (id: string) => {
    setConvocados((prev) => {
      const existe = prev.includes(id);
      if (existe) {
        setEnPista((old) => old.filter((x) => x !== id));
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const toggleEnPista = (id: string) => {
    if (!convocados.includes(id)) {
      Alert.alert('Aviso', 'Primero marca el jugador como disponible.');
      return;
    }
    setEnPista((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const limite = Math.min(MAX_EN_PISTA, convocados.length);
      if (prev.length >= limite) {
        Alert.alert('Aviso', `Solo puedes tener ${limite} en el cinco inicial.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const autoCompletarCinco = () => {
    const limite = Math.min(MAX_EN_PISTA, convocados.length);
    setEnPista(convocados.slice(0, limite));
  };

  const seleccionarTodos = () => {
    const ids = jugadores.map((j) => j.id);
    setConvocados(ids);
    setEnPista(ids.slice(0, Math.min(MAX_EN_PISTA, ids.length)));
  };

  const seleccionarNinguno = () => {
    setConvocados([]);
    setEnPista([]);
  };

  /** Solo convocables según plantilla (excluye Lesionado / No disponible). */
  const aplicarDisponibilidad = () => {
    const ids = jugadores.filter((j) => !j.blocked).map((j) => j.id);
    setConvocados(ids);
    setEnPista(ids.slice(0, Math.min(MAX_EN_PISTA, ids.length)));
    const excluidos = jugadores.filter((j) => j.blocked).length;
    if (excluidos > 0) {
      Alert.alert(
        'Disponibilidad aplicada',
        `Convocados ${ids.length}. Excluidos ${excluidos} (lesionado o no disponible). Las dudas siguen convocadas.`
      );
    }
  };

  const iniciar = () => {
    const dur = parseInt(duracionParte, 10);
    const partes = parseInt(numPartes, 10);

    if (!Number.isFinite(dur) || dur < 1 || dur > 99) {
      Alert.alert('Configuracion invalida', 'La duracion por parte debe estar entre 1 y 99 minutos.');
      return;
    }
    if (!Number.isFinite(partes) || partes < 1 || partes > 4) {
      Alert.alert('Configuracion invalida', 'El numero de partes debe estar entre 1 y 4.');
      return;
    }
    if (convocados.length === 0) {
      Alert.alert('Configuracion invalida', 'Selecciona al menos un jugador disponible.');
      return;
    }

    const minimoEnPista = Math.min(MAX_EN_PISTA, convocados.length);
    if (enPista.length !== minimoEnPista) {
      Alert.alert('Configuracion invalida', `Debes seleccionar ${minimoEnPista} jugadores en el cinco inicial.`);
      return;
    }

    const config = {
      rival: rival.trim() || 'Rival',
      duracionParte: String(dur),
      numPartes: String(partes),
    };

    const rotacion = {
      convocados: [...convocados],
      enPista: [...enPista],
      cambios: [],
    };

    onStartMatch(config, rotacion);
  };

  const renderCard = (id: string, selected: boolean, onPress: () => void) => {
    const p = getPlayer(id);
    const badge =
      p?.blocked
        ? (p.estadoFisico === 'Lesionado' ? 'LES' : 'NA')
        : p?.doubt
          ? (p.disponibilidad === 'Duda' ? 'DUDA' : 'CAR')
          : null;
    return (
      <TouchableOpacity
        key={id}
        style={[
          styles.playerCard,
          { minWidth: playerCardMinW },
          selected && styles.playerCardOn,
          p?.blocked && styles.playerCardBlocked,
          p?.doubt && !selected && styles.playerCardDoubt,
        ]}
        onPress={onPress}
      >
        <View style={styles.photoWrap}>
          {p?.photo ? (
            <Image source={{ uri: p.photo }} style={styles.photo} />
          ) : (
            <Text style={styles.photoFallback}>{String(p?.number ?? p?.dorsal ?? '?')}</Text>
          )}
          {badge ? (
            <View style={[styles.dispoBadge, p?.blocked ? styles.dispoBadgeBad : styles.dispoBadgeWarn]}>
              <Text style={styles.dispoBadgeTxt}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardName} numberOfLines={2}>{nombreJugador(id)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { paddingHorizontal: screen.horizontalPadding }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backTxt}>VOLVER</Text>
        </TouchableOpacity>
        <Text style={[styles.title, styles.titleCenter]} numberOfLines={1}>
          CONFIGURAR PARTIDO
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: 0 }]}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Datos del partido</Text>

          <Text style={styles.label}>Rival</Text>
          <TextInput
            value={rival}
            onChangeText={setRival}
            placeholder='Nombre del rival'
            placeholderTextColor='#8FA7BF'
            style={styles.input}
          />

          <View style={styles.row}>
            <View style={styles.rowPartCol}>
              <Text style={styles.label}>Partes</Text>
              <TextInput
                value={numPartes}
                onChangeText={setNumPartes}
                keyboardType='number-pad'
                style={styles.input}
              />
            </View>
            <View style={styles.rowGap} />
            <View style={styles.rowMinutesCol}>
              <Text style={styles.label}>Minutos / parte</Text>
              <TextInput
                value={duracionParte}
                onChangeText={setDuracionParte}
                keyboardType='number-pad'
                style={styles.input}
              />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={[styles.row, { alignItems: 'center', justifyContent: 'space-between' }]}>
            <Text style={styles.sectionTitle}>Jugadores disponibles</Text>
            <View style={styles.quickRow}>
              <TouchableOpacity onPress={aplicarDisponibilidad} style={[styles.autoBtn, styles.autoBtnDispo]}>
                <Text style={styles.autoTxt}>DISPO</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={seleccionarTodos} style={styles.autoBtn}>
                <Text style={styles.autoTxt}>TODOS</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={seleccionarNinguno} style={[styles.autoBtn, styles.autoBtnMuted]}>
                <Text style={styles.autoTxt}>NINGUNO</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.help}>
            Convocados: {convocados.length}/{jugadores.length}
            {jugadores.some((j) => j.blocked) ? ' · DISPO excluye LES/NA' : ''}
          </Text>
          {jugadores.length === 0 ? (
            <Text style={styles.empty}>No hay jugadores en plantilla.</Text>
          ) : (
            <View style={styles.cardsGrid}>
              {jugadores.map((j) => renderCard(j.id, convocados.includes(j.id), () => toggleConvocado(j.id)))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={[styles.row, { alignItems: 'center', justifyContent: 'space-between' }]}>
            <Text style={styles.sectionTitle}>Cinco inicial</Text>
            <TouchableOpacity onPress={autoCompletarCinco} style={styles.autoBtn}>
              <Text style={styles.autoTxt}>AUTO</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.help}>Seleccionados: {enPista.length}/{Math.min(MAX_EN_PISTA, convocados.length)}</Text>

          {convocados.length === 0 ? (
            <Text style={styles.empty}>Marca jugadores disponibles para crear el cinco inicial.</Text>
          ) : (
            <View style={styles.cardsGrid}>
              {convocados.map((id) => renderCard(id, enPista.includes(id), () => toggleEnPista(id)))}
            </View>
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            bottom: Math.max(insets.bottom + 10, 20),
            left: screen.horizontalPadding,
            right: screen.horizontalPadding,
          },
        ]}
      >
        <TouchableOpacity onPress={iniciar} style={styles.startBtn}>
          <Text style={styles.startTxt}>INICIAR CRONOMETRO</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 10,
  },
  headerSpacer: { width: 84, height: 1 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 10, width: 84, borderRadius: 8, backgroundColor: '#0D47A1', alignItems: 'center' },
  backTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  title: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  titleCenter: { flex: 1, textAlign: 'center', marginHorizontal: 4 },
  scrollContent: { paddingBottom: 180 },
  card: {
    backgroundColor: '#012A4A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#123E63',
  },
  sectionTitle: { color: '#E3F2FD', fontWeight: '700', fontSize: 15, marginBottom: 8 },
  label: { color: '#9FC5E8', fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#0B3556',
    borderWidth: 1,
    borderColor: '#1D5A86',
    color: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rowPartCol: { flex: 0.36, minWidth: 0, maxWidth: 140 },
  rowGap: { width: 10 },
  rowMinutesCol: { flex: 1, minWidth: 0 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  playerCard: {
    width: '19%',
    minWidth: 50,
    backgroundColor: '#0B3556',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#1D5A86',
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 8,
    alignItems: 'center',
  },
  playerCardOn: { borderColor: '#4CC9F0', backgroundColor: '#12476D' },
  playerCardBlocked: { borderColor: '#C62828', opacity: 0.85 },
  playerCardDoubt: { borderColor: '#FFB300' },
  photoWrap: {
    width: 42,
    height: 50,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#184A6D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photo: { width: '100%', height: '100%' },
  photoFallback: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  dispoBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 1,
    alignItems: 'center',
  },
  dispoBadgeBad: { backgroundColor: 'rgba(198,40,40,0.92)' },
  dispoBadgeWarn: { backgroundColor: 'rgba(255,179,0,0.92)' },
  dispoBadgeTxt: { color: '#FFF', fontSize: 7, fontWeight: '900' },
  cardName: { color: '#EAF4FF', fontSize: 9, marginTop: 4, textAlign: 'center' },
  help: { color: '#8FB1D1', marginBottom: 10 },
  autoBtn: {
    backgroundColor: '#1D5A86',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
  },
  autoBtnMuted: { backgroundColor: '#455A64' },
  autoBtnDispo: { backgroundColor: '#2E7D32' },
  autoTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  quickRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  empty: { color: '#9CB6CF' },
  footer: {
    position: 'absolute',
    backgroundColor: '#001A33',
    borderWidth: 1,
    borderColor: '#123E63',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  startBtn: {
    backgroundColor: '#0D47A1',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  startTxt: { color: '#FFFFFF', fontWeight: '700', letterSpacing: 0.5 },
});