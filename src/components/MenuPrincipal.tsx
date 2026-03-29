import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getListaEquipos } from '../storage/localStorage';
import { FontAwesome } from '@expo/vector-icons';
import GestionDatosModal from './GestionDatosModal';
import { parseToDate, formatDateExport } from '../utils/dateFormat';

/** Hoy + 6 días = 7 días en total (incluye el día actual). */
const DIAS_VENTANA_CALENDARIO = 7;
const OFFSET_FIN_INCLUSIVE = DIAS_VENTANA_CALENDARIO - 1;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function MenuPrincipal({
  equipoNombre,
  temporadaNombre,
  onSelect,
  onExit,
  players = [],
  partidos = [],
  entrenos = [],
  eventosCalendario = [],
  savePlayers,
  savePartidos,
  saveEntrenos,
  onCambioEquipo,
}: any) {
  const insets = useSafeAreaInsets();
  const [gestionVisible, setGestionVisible] = useState(false);
  const [cambioEquipoVisible, setCambioEquipoVisible] = useState(false);
  const [listaEquipos, setListaEquipos] = useState<any[]>([]);

  useEffect(() => {
    getListaEquipos().then(setListaEquipos);
  }, [cambioEquipoVisible]);

  const eventosProximosCal = useMemo(() => {
    if (!Array.isArray(eventosCalendario)) return [];
    const today = startOfLocalDay(new Date());
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + OFFSET_FIN_INCLUSIVE);
    return [...eventosCalendario]
      .map((ev: any) => {
        const raw = ev?.dateKey;
        const parsed = parseToDate(typeof raw === 'string' ? raw : '');
        const day = parsed ? startOfLocalDay(parsed) : null;
        return { ...ev, _d: day };
      })
      .filter((ev: any) => ev._d && ev._d.getTime() >= today.getTime() && ev._d.getTime() <= windowEnd.getTime())
      .sort((a: any, b: any) => (a._d as Date).getTime() - (b._d as Date).getTime());
  }, [eventosCalendario]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Cabecera Identificativa */}
      <View style={styles.headerMini}>
        <Text style={styles.clubText}>{equipoNombre}</Text>
        <Text style={styles.tempText}>{temporadaNombre}</Text>
      </View>

      <View style={styles.summaryCalCard}>
        <Text style={styles.summaryCalTitle}>CALENDARIO — PRÓXIMOS 7 DÍAS</Text>
        {eventosProximosCal.length > 0 ? (
          <ScrollView style={styles.summaryCalList} nestedScrollEnabled showsVerticalScrollIndicator>
            {eventosProximosCal.map((ev: any) => {
              const tipo = String(ev.tipoEvento || 'Otro');
              const icon =
                tipo === 'Partido' ? 'futbol-o' : tipo === 'Entrenamiento' ? 'calendar-check-o' : 'calendar';
              const color =
                tipo === 'Partido' ? '#FFD166' : tipo === 'Entrenamiento' ? '#4ECDC4' : '#B39DDB';
              const fechaTxt = formatDateExport(parseToDate(ev.dateKey) ?? (ev._d as Date)) || ev.dateKey || '';
              const horaTxt = ev.horaInicio ? ` · ${ev.horaInicio}` : '';
              const nombre = ev.rival || ev.title || tipo;
              return (
                <View key={String(ev.id)} style={styles.summaryRow}>
                  <FontAwesome name={icon as any} size={13} color={color} />
                  <Text style={styles.summaryText}>{`${tipo}: ${nombre} — ${fechaTxt}${horaTxt}`}</Text>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.summaryText}>Sin eventos de calendario en los próximos 7 días.</Text>
        )}
      </View>

      <Text style={styles.mainTitle}>GESTIÓN TÁCTICA</Text>

      <View style={[styles.scroll, { paddingBottom: Math.max(insets.bottom + 20, 26) }]}>
        {/* FILA 1: Plantilla y Entrenos */}
        <View style={styles.row}>
          <MenuBtn 
            title="PLANTILLA" 
            icon="users" 
            color="#4A90E2" 
            onPress={() => onSelect('PLANTILLA')} 
          />
          <MenuBtn 
            title="ENTRENOS" 
            icon="calendar-check-o" 
            color="#50C878" 
            onPress={() => onSelect('ENTRENAMIENTOS')} 
          />
        </View>

        {/* FILA 2: Partidos y Cronómetro */}
        <View style={styles.row}>
          <MenuBtn 
            title="PARTIDOS" 
            icon="vcard-o" 
            color="#FF9F43" 
            onPress={() => onSelect('NUEVO_PARTIDO')} 
          />
          <MenuBtn 
            title="CRONÓMETRO" 
            icon="clock-o" 
            color="#FF4757" 
            onPress={() => onSelect('CONFIG_PARTIDO')} 
          />
        </View>

        {/* FILA 3: Pizarra y Stats */}
        <View style={styles.row}>
          <MenuBtn 
            title="PIZARRA" 
            icon="pencil-square-o" 
            color="#A29BFE" 
            onPress={() => onSelect('PIZARRA')} 
          />
          <MenuBtn 
            title="STATS" 
            icon="line-chart" 
            color="#00D2D3" 
            onPress={() => onSelect('STATS')} 
          />
        </View>

        {/* FILA 4: Calendario */}
        <View style={styles.row}>
          <MenuBtn 
            title="CALENDARIO" 
            icon="calendar" 
            color="#E17055" 
            onPress={() => onSelect('CALENDARIO')} 
          />
        </View>

        {/* FILA 5: Gestión de Datos y Ayuda */}
        <View style={styles.row}>
          <MenuBtn 
            title="GESTIÓN DE DATOS" 
            icon="cloud-upload" 
            color="#9B59B6" 
            onPress={() => setGestionVisible(true)} 
          />
          <MenuBtn 
            title="AYUDA" 
            icon="question-circle" 
            color="#00BFA5" 
            onPress={() => onSelect('AYUDA')} 
          />
        </View>

        <View style={styles.footerRow}>
          <TouchableOpacity style={[styles.footerBtn, styles.btnVolver]} onPress={() => setCambioEquipoVisible(true)}>
            <FontAwesome name="exchange" size={14} color="#FF4757" />
            <Text style={styles.btnVolverTxt}>CAMBIAR EQUIPO</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.footerBtn, styles.btnSalir]} onPress={onExit}>
            <FontAwesome name="power-off" size={14} color="#FFFFFF" />
            <Text style={styles.btnSalirTxt}>SALIR APP</Text>
          </TouchableOpacity>
        </View>
      </View>

      <GestionDatosModal
        visible={gestionVisible}
        onClose={() => setGestionVisible(false)}
        players={players}
        partidos={partidos}
        entrenos={entrenos}
        setPlayers={savePlayers}
        setPartidos={savePartidos}
        setEntrenos={saveEntrenos}
      />

      <Modal visible={cambioEquipoVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCambioContent}>
            <Text style={styles.modalCambioTitle}>CAMBIO DE EQUIPO</Text>
            <Text style={styles.modalCambioSub}>Selecciona un equipo activo</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {listaEquipos.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.equipoCard}
                  onPress={() => {
                    onCambioEquipo?.({ equipo: item.nombre, temporada: item.temporada });
                    setCambioEquipoVisible(false);
                  }}
                >
                  <Text style={styles.equipoCardTitle}>{item.nombre}</Text>
                  <Text style={styles.equipoCardSub}>{item.temporada}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.btnCerrarCambio} onPress={() => setCambioEquipoVisible(false)}>
              <Text style={styles.btnCerrarCambioTxt}>CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Componente interno para los botones tipo "Card"
function MenuBtn({ title, icon, color, onPress }: any) {
  return (
    <TouchableOpacity 
      style={[styles.card, { borderTopColor: color }]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconCircle, { backgroundColor: color + '20' }]}>
        <FontAwesome name={icon} size={18} color={color} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#001A33', 
    paddingHorizontal: 12 
  },
  headerMini: { 
    marginTop: 8, 
    alignItems: 'flex-end', 
    borderBottomWidth: 0.5, 
    borderBottomColor: '#1565C0', 
    paddingBottom: 4 
  },
  clubText: { 
    color: '#FFF', 
    fontSize: 11, 
    fontWeight: 'bold', 
    opacity: 0.8,
    textTransform: 'uppercase'
  },
  tempText: { 
    color: '#00aaff', 
    fontSize: 9.5, 
    fontWeight: '600' 
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2, gap: 5 },
  summaryText: { color: '#CCC', fontSize: 9.5, lineHeight: 12, flex: 1 },
  summaryCalTitle: { color: '#B3E5FC', fontSize: 9.5, fontWeight: '700', marginBottom: 4 },
  // Altura aproximada: titulo + 3 lineas visibles; el resto con scroll interno.
  summaryCalList: { maxHeight: 50 },
  summaryCalCard: {
    backgroundColor: '#001E3D',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: '#0D47A1',
  },
  mainTitle: { 
    color: '#FFF', 
    fontSize: 16, 
    fontWeight: '900', 
    textAlign: 'center', 
    marginVertical: 5, 
    letterSpacing: 1 
  },
  scroll: { flex: 1 },
  row: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 6, 
    gap: 6 
  },
  card: { 
    flex: 1, 
    backgroundColor: '#012E57', 
    borderRadius: 10, 
    paddingVertical: 7, 
    alignItems: 'center',
    borderTopWidth: 4,
    elevation: 8, // Sombra Android
    shadowColor: '#000', // Sombra iOS
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5
  },
  iconCircle: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 3 
  },
  cardTitle: { 
    color: '#FFF', 
    fontSize: 9, 
    fontWeight: 'bold', 
    letterSpacing: 0.2 
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
  },
  footerBtn: {
    flex: 1,
  },
  btnVolver: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: '#FF4757',
    backgroundColor: 'rgba(255, 71, 87, 0.05)'
  },
  btnVolverTxt: { 
    color: '#FF4757', 
    fontSize: 9.5, 
    fontWeight: 'bold' 
  },
  btnSalir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FF4757'
  },
  btnSalirTxt: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 'bold'
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalCambioContent: { backgroundColor: '#012E57', width: '90%', borderRadius: 15, padding: 20 },
  modalCambioTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  modalCambioSub: { color: '#00aaff', fontSize: 11, textAlign: 'center', marginBottom: 15 },
  equipoCard: { backgroundColor: '#001A33', padding: 14, borderRadius: 10, marginBottom: 8 },
  equipoCardTitle: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  equipoCardSub: { color: '#00aaff', fontSize: 12, marginTop: 4 },
  btnCerrarCambio: { backgroundColor: '#C62828', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  btnCerrarCambioTxt: { color: '#FFF', fontWeight: 'bold' }
});