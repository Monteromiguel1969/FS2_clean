import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getListaEquipos, getTeamSettings, setLastSuccessfulSyncAt, getLastSuccessfulSyncAt } from '../storage/localStorage';
import { useScreenMetrics } from '../utils/useScreenMetrics';
import { FontAwesome } from '@expo/vector-icons';
import GestionDatosModal from './GestionDatosModal';
import ReportarIncidenciaModal from './ReportarIncidenciaModal';
import CuentaUsuarioModal from './CuentaUsuarioModal';
import { useAuth } from '../context/AuthContext';
import { sincronizarTodo } from '../services/syncAllService';
import { resolveSyncAuthority } from '../storage/referenceDeviceStorage';
import { parseToDate, formatDateExport } from '../utils/dateFormat';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { ZoomableImageModal } from './ZoomableImage';
import {
  getEquiposUnicos,
  getTemporadasDeEquipo,
  keyForEquipoTemporada,
  pickEscudoForEquipo,
} from '../utils/equipoGrouping';
import { formatLastSyncLabel } from '../utils/reportBranding';

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
  saveEventosCalendario,
  escudoUri,
  lastSyncTick = 0,
  onUpdateEscudo,
  onCambioEquipo,
}: any) {
  const insets = useSafeAreaInsets();
  const screen = useScreenMetrics();
  const appVersion = String(
    (Constants.expoConfig as any)?.version ||
    (Constants as any)?.manifest?.version ||
    'N/D'
  );
  const [gestionVisible, setGestionVisible] = useState(false);
  const [cuentaVisible, setCuentaVisible] = useState(false);
  const [reporteVisible, setReporteVisible] = useState(false);
  const { user, isReadOnly } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [cambioEquipoVisible, setCambioEquipoVisible] = useState(false);
  const [cambioVista, setCambioVista] = useState<'equipos' | 'temporadas'>('equipos');
  const [cambioEquipoSeleccionado, setCambioEquipoSeleccionado] = useState('');
  const [listaEquipos, setListaEquipos] = useState<any[]>([]);
  const [escudosEquipos, setEscudosEquipos] = useState<Record<string, string | null>>({});
  const [escudoZoom, setEscudoZoom] = useState<{ uri: string; titulo: string } | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const keyFor = keyForEquipoTemporada;

  const equiposUnicosCambio = useMemo(() => getEquiposUnicos(listaEquipos), [listaEquipos]);
  const temporadasCambio = useMemo(
    () => (cambioEquipoSeleccionado ? getTemporadasDeEquipo(listaEquipos, cambioEquipoSeleccionado) : []),
    [listaEquipos, cambioEquipoSeleccionado]
  );

  const abrirCambioEquipo = () => {
    setCambioVista('equipos');
    setCambioEquipoSeleccionado('');
    setCambioEquipoVisible(true);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!equipoNombre || !temporadaNombre) {
        setLastSyncAt(null);
        return;
      }
      const iso = await getLastSuccessfulSyncAt(equipoNombre, temporadaNombre);
      if (!cancelled) setLastSyncAt(iso);
    })();
    return () => {
      cancelled = true;
    };
  }, [equipoNombre, temporadaNombre, lastSyncTick]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lista = await getListaEquipos();
      if (cancelled) return;
      setListaEquipos(lista);
      const pairs = await Promise.all(
        (lista || []).map(async (it: any) => {
          const s = await getTeamSettings(it?.nombre || '', it?.temporada || '');
          return [keyFor(it?.nombre || '', it?.temporada || ''), s.escudoUri || null] as const;
        })
      );
      if (cancelled) return;
      const map: Record<string, string | null> = {};
      pairs.forEach(([k, v]) => { map[k] = v; });
      setEscudosEquipos(map);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
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

  const avisosHoyManana = useMemo(() => {
    if (!Array.isArray(eventosCalendario)) return { hoy: [] as any[], manana: [] as any[] };
    const today = startOfLocalDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const hoy: any[] = [];
    const manana: any[] = [];
    eventosCalendario.forEach((ev: any) => {
      const parsed = parseToDate(typeof ev?.dateKey === 'string' ? ev.dateKey : '');
      const day = parsed ? startOfLocalDay(parsed) : null;
      if (!day) return;
      const t = day.getTime();
      if (t === today.getTime()) hoy.push(ev);
      else if (t === tomorrow.getTime()) manana.push(ev);
    });
    return { hoy, manana };
  }, [eventosCalendario]);

  const showEscudoGuidance = (onContinue?: () => void) => {
    Alert.alert(
      'Recomendacion para escudo',
      'Formato recomendado: JPG o PNG.\nTamano recomendado: 512x512 px.\nMinimo: 256x256 px.\nRelacion: 1:1 (cuadrada).',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: onContinue },
      ]
    );
  };

  const seleccionarEscudo = async () => {
    showEscudoGuidance(async () => {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permiso requerido', 'Debes permitir acceso a la galeria para cambiar el escudo.');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.9,
        });

        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        const mime = String(asset.mimeType || '').toLowerCase();
        const isJpgOrPng = mime.includes('jpeg') || mime.includes('jpg') || mime.includes('png');
        const minSide = Math.min(Number(asset.width || 0), Number(asset.height || 0));
        const isSquare = Number(asset.width || 0) === Number(asset.height || 0);

        if (!isJpgOrPng || !isSquare || minSide < 256) {
          Alert.alert(
            'Aviso de formato',
            'La imagen no cumple la recomendacion (JPG/PNG, cuadrada 1:1, minimo 256x256). Se guardara igualmente.'
          );
        }

        onUpdateEscudo?.(asset.uri);
        Alert.alert('Escudo actualizado', 'El nuevo escudo del club se ha guardado correctamente.');
      } catch (e) {
        Alert.alert('Error', `No se pudo actualizar el escudo: ${(e as Error).message}`);
      }
    });
  };

  const ejecutarSincronizarTodo = async () => {
    setSyncing(true);
    try {
      const result = await sincronizarTodo({
        equipo: equipoNombre,
        temporada: temporadaNombre,
        players,
        partidos,
        entrenos,
        eventosCalendario,
      });
      if (result.success) {
        if (result.players) await savePlayers(result.players);
        if (result.partidos) await savePartidos(result.partidos);
        if (result.entrenos) await saveEntrenos(result.entrenos);
        if (result.eventosCalendario && saveEventosCalendario) await saveEventosCalendario(result.eventosCalendario);
        const iso = new Date().toISOString();
        await setLastSuccessfulSyncAt(equipoNombre, temporadaNombre, iso);
        setLastSyncAt(iso);
        Alert.alert('Sincronización completada', result.message);
      } else {
        Alert.alert('Sincronización', result.message);
      }
    } catch (e) {
      Alert.alert('Error', (e as Error).message || 'No se pudo sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const handleSincronizarTodo = () => {
    void (async () => {
      const info = await resolveSyncAuthority(equipoNombre, temporadaNombre);
      const modo =
        info.authority === 'local'
          ? 'Este dispositivo es la REFERENCIA: en conflictos gana lo de aquí.'
          : 'Este dispositivo NO es la referencia: en conflictos gana el Google Sheet.';
      Alert.alert(
        'Sincronizar todo',
        `${modo}\n\n${info.detail}\n\nSe unirán los datos con el Google Sheet. Puedes cambiar el rol en Gestión de datos → Dispositivo referencia.\n\n¿Continuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sincronizar',
            onPress: () => void ejecutarSincronizarTodo(),
          },
        ]
      );
    })();
  };

  return (
    <SafeAreaView style={[styles.container, { paddingHorizontal: screen.horizontalPadding }]} edges={['top', 'bottom']}>
      {/* Cabecera Identificativa */}
      <View style={styles.headerMini}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.escudoWrap}
            onPress={() => {
              if (escudoUri) {
                setEscudoZoom({ uri: String(escudoUri), titulo: `${equipoNombre} · ${temporadaNombre}` });
              }
            }}
            onLongPress={() => {
              if (escudoUri) {
                setEscudoZoom({ uri: String(escudoUri), titulo: `${equipoNombre} · ${temporadaNombre}` });
              }
            }}
            delayLongPress={350}
          >
            {escudoUri ? (
              <Image source={{ uri: escudoUri }} style={styles.escudoImg} />
            ) : (
              <FontAwesome name="shield" size={24} color="#90CAF9" />
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.clubText}>{equipoNombre}</Text>
          <Text style={styles.tempText}>{temporadaNombre}</Text>
          <View style={styles.escudoActions}>
            <TouchableOpacity style={styles.escudoBtn} onPress={seleccionarEscudo}>
              <Text style={styles.escudoBtnTxt}>CAMBIAR ESCUDO</Text>
            </TouchableOpacity>
            {escudoUri ? (
              <TouchableOpacity
                style={[styles.escudoBtn, styles.escudoBtnDanger]}
                onPress={() =>
                  showEscudoGuidance(() => {
                    onUpdateEscudo?.(null);
                    Alert.alert('Escudo eliminado', 'Se ha quitado el escudo del equipo.');
                  })
                }
              >
                <Text style={styles.escudoBtnTxt}>QUITAR</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.summaryCalCard}>
        <Text style={styles.summaryCalTitle}>CALENDARIO — PRÓXIMOS 7 DÍAS</Text>
        {isReadOnly ? (
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyBannerTxt}>
              MODO SOLO LECTURA · Puedes consultar datos; no se guardan cambios ni se crean equipos.
            </Text>
          </View>
        ) : null}
        {(avisosHoyManana.hoy.length > 0 || avisosHoyManana.manana.length > 0) ? (
          <View style={styles.avisoBanner}>
            {avisosHoyManana.hoy.length > 0 ? (
              <Text style={styles.avisoBannerHoy}>
                HOY · {avisosHoyManana.hoy.map((ev: any) => ev.rival || ev.title || ev.tipoEvento || 'Evento').join(' · ')}
              </Text>
            ) : null}
            {avisosHoyManana.manana.length > 0 ? (
              <Text style={styles.avisoBannerManana}>
                MAÑANA · {avisosHoyManana.manana.map((ev: any) => ev.rival || ev.title || ev.tipoEvento || 'Evento').join(' · ')}
              </Text>
            ) : null}
          </View>
        ) : null}
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
              const badge =
                avisosHoyManana.hoy.some((x: any) => String(x.id) === String(ev.id))
                  ? ' · HOY'
                  : avisosHoyManana.manana.some((x: any) => String(x.id) === String(ev.id))
                  ? ' · MAÑANA'
                  : '';
              return (
                <View key={String(ev.id)} style={styles.summaryRow}>
                  <FontAwesome name={icon as any} size={13} color={color} />
                  <Text style={styles.summaryText}>{`${tipo}: ${nombre} — ${fechaTxt}${horaTxt}${badge}`}</Text>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.summaryText}>Sin eventos de calendario en los próximos 7 días.</Text>
        )}
      </View>

      <Text style={styles.mainTitle}>GESTIÓN TÁCTICA</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 18, 24), flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
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

        {/* FILA 4: Calendario y Biblioteca */}
        <View style={styles.row}>
          <MenuBtn 
            title="CALENDARIO" 
            icon="calendar" 
            color="#E17055" 
            onPress={() => onSelect('CALENDARIO')} 
          />
          <MenuBtn
            title="BIBLIOTECA"
            icon="book"
            color="#FFD166"
            onPress={() => onSelect('BIBLIOTECA')}
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

        {/* Botón para cambiar de equipo - muestra lista de equipos activos */}
        <TouchableOpacity style={styles.btnVolver} onPress={abrirCambioEquipo}>
          <FontAwesome name="exchange" size={14} color="#FF4757" />
          <Text style={styles.btnVolverTxt}>CAMBIAR DE EQUIPO / TEMPORADA</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnSync, syncing && styles.btnSyncDisabled]}
          onPress={handleSincronizarTodo}
          disabled={syncing}
        >
          <FontAwesome name="refresh" size={14} color="#4ECDC4" />
          <Text style={styles.btnSyncTxt}>{syncing ? 'SINCRONIZANDO...' : 'SINCRONIZAR TODO (SHEET)'}</Text>
        </TouchableOpacity>
        <Text style={styles.syncStampTxt}>
          Últimos datos sync: {formatLastSyncLabel(lastSyncAt)}
        </Text>

        <TouchableOpacity style={styles.btnCuenta} onPress={() => setCuentaVisible(true)}>
          <FontAwesome name="user" size={14} color="#4CC9F0" />
          <Text style={styles.btnCuentaTxt} numberOfLines={1}>
            {user?.email ? `CUENTA: ${user.email}` : 'MI CUENTA'}
          </Text>
        </TouchableOpacity>

        {/* Botón para salir de la aplicación */}
        <TouchableOpacity style={styles.btnSalir} onPress={onExit}>
          <FontAwesome name="power-off" size={14} color="#FFFFFF" />
          <Text style={styles.btnSalirTxt}>SALIR DE LA APLICACIÓN</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnReportar} onPress={() => setReporteVisible(true)}>
          <FontAwesome name="envelope" size={14} color="#FFD166" />
          <Text style={styles.btnReportarTxt}>REPORTAR INCIDENCIA / SUGERENCIA</Text>
        </TouchableOpacity>

        <Text style={styles.versionTxt}>Versión {appVersion}</Text>
      </ScrollView>

      <CuentaUsuarioModal visible={cuentaVisible} onClose={() => setCuentaVisible(false)} />

      <GestionDatosModal
        visible={gestionVisible}
        onClose={() => setGestionVisible(false)}
        equipo={equipoNombre}
        temporada={temporadaNombre}
        players={players}
        partidos={partidos}
        entrenos={entrenos}
        eventosCalendario={eventosCalendario}
        setPlayers={savePlayers}
        setPartidos={savePartidos}
        setEntrenos={saveEntrenos}
        setEventosCalendario={saveEventosCalendario}
      />

      <ReportarIncidenciaModal
        visible={reporteVisible}
        onClose={() => setReporteVisible(false)}
        equipoNombre={equipoNombre}
        temporadaNombre={temporadaNombre}
      />

      <Modal visible={cambioEquipoVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCambioContent}>
            <Text style={styles.modalCambioTitle}>
              {cambioVista === 'equipos' ? 'CAMBIO DE EQUIPO' : 'CAMBIO DE TEMPORADA'}
            </Text>
            <Text style={styles.modalCambioSub}>
              {cambioVista === 'equipos' ? 'Elige un club' : `Temporadas de ${cambioEquipoSeleccionado}`}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {cambioVista === 'equipos' ? (
                equiposUnicosCambio.map((nombre) => (
                  <TouchableOpacity
                    key={nombre}
                    style={styles.equipoCard}
                    onPress={() => {
                      setCambioEquipoSeleccionado(nombre);
                      setCambioVista('temporadas');
                    }}
                  >
                    <View style={styles.equipoCardRow}>
                      <View style={styles.equipoEscudoWrap}>
                        {pickEscudoForEquipo(escudosEquipos, nombre, listaEquipos) ? (
                          <Image
                            source={{ uri: String(pickEscudoForEquipo(escudosEquipos, nombre, listaEquipos)) }}
                            style={styles.equipoEscudoImg}
                          />
                        ) : (
                          <FontAwesome name="shield" size={16} color="#90CAF9" />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.equipoCardTitle}>{nombre}</Text>
                        <Text style={styles.equipoCardSub}>
                          {getTemporadasDeEquipo(listaEquipos, nombre).length} temporada(s)
                        </Text>
                      </View>
                      <FontAwesome name="chevron-right" size={14} color="#4CC9F0" />
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.cambioBackBtn}
                    onPress={() => {
                      setCambioVista('equipos');
                      setCambioEquipoSeleccionado('');
                    }}
                  >
                    <FontAwesome name="arrow-left" size={14} color="#90CAF9" />
                    <Text style={styles.cambioBackTxt}>Volver a equipos</Text>
                  </TouchableOpacity>
                  {temporadasCambio.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.equipoCard}
                      onPress={() => {
                        onCambioEquipo?.({ equipo: item.nombre, temporada: item.temporada });
                        setCambioEquipoVisible(false);
                      }}
                    >
                      <View style={styles.equipoCardRow}>
                        <View style={styles.equipoEscudoWrap}>
                          {escudosEquipos[keyFor(item?.nombre || '', item?.temporada || '')] ? (
                            <Image
                              source={{ uri: String(escudosEquipos[keyFor(item?.nombre || '', item?.temporada || '')]) }}
                              style={styles.equipoEscudoImg}
                            />
                          ) : (
                            <FontAwesome name="calendar" size={14} color="#90CAF9" />
                          )}
                        </View>
                        <View>
                          <Text style={styles.equipoCardTitle}>{item.temporada}</Text>
                          <Text style={styles.equipoCardSub}>{item.nombre}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.btnCerrarCambio} onPress={() => setCambioEquipoVisible(false)}>
              <Text style={styles.btnCerrarCambioTxt}>CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ZoomableImageModal
        visible={!!escudoZoom}
        uri={escudoZoom?.uri}
        title={escudoZoom?.titulo}
        onClose={() => setEscudoZoom(null)}
      />
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
  },
  headerMini: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6, 
    borderBottomWidth: 0.5, 
    borderBottomColor: '#1565C0', 
    paddingBottom: 6
  },
  headerLeft: { marginRight: 10 },
  headerRight: { flex: 1, alignItems: 'flex-end' },
  escudoWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#0B3556',
    borderWidth: 2,
    borderColor: '#4CC9F0',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  escudoImg: { width: '100%', height: '100%' },
  escudoActions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  escudoBtn: {
    backgroundColor: '#0E4A8A',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  escudoBtnDanger: { backgroundColor: '#8E1D1D' },
  escudoBtnTxt: { color: '#FFF', fontSize: 9, fontWeight: '700' },
  clubText: {
    color: '#FFF', 
    fontSize: 11, 
    fontWeight: 'bold', 
    opacity: 0.8,
    textTransform: 'uppercase'
  },
  tempText: { 
    color: '#00aaff', 
    fontSize: 10, 
    fontWeight: '600' 
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2, gap: 5 },
  summaryText: { color: '#CCC', fontSize: 9.5, lineHeight: 12, flex: 1 },
  summaryCalTitle: { color: '#B3E5FC', fontSize: 9.5, fontWeight: '700', marginBottom: 4 },
  avisoBanner: {
    backgroundColor: 'rgba(255, 209, 102, 0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 6,
    gap: 3,
  },
  readOnlyBanner: {
    backgroundColor: 'rgba(84, 110, 122, 0.35)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(176, 190, 197, 0.45)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 6,
  },
  readOnlyBannerTxt: { color: '#CFD8DC', fontSize: 10, fontWeight: '800' },
  avisoBannerHoy: { color: '#FFD166', fontSize: 10, fontWeight: '800' },
  avisoBannerManana: { color: '#4ECDC4', fontSize: 10, fontWeight: '800' },
  summaryCalList: { maxHeight: 48 },
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
  scroll: { 
    flex: 1
  },
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
    width: 30, 
    height: 30, 
    borderRadius: 15, 
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
  btnVolver: { 
    marginTop: 5, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    gap: 6, 
    paddingVertical: 7,
    paddingHorizontal: 9,
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
  btnSync: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4ECDC4',
    backgroundColor: 'rgba(78, 205, 196, 0.1)',
  },
  btnSyncDisabled: { opacity: 0.55 },
  btnSyncTxt: {
    color: '#4ECDC4',
    fontSize: 9.5,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  syncStampTxt: {
    color: '#8FA7BF',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 2,
  },
  btnCuenta: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4CC9F0',
    backgroundColor: 'rgba(76, 201, 240, 0.08)',
  },
  btnCuentaTxt: {
    color: '#4CC9F0',
    fontSize: 9.5,
    fontWeight: 'bold',
    textAlign: 'center',
    maxWidth: '92%',
  },
  btnSalir: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: '#FF4757'
  },
  btnSalirTxt: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 'bold'
  },
  btnReportar: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFD166',
    backgroundColor: 'rgba(255, 209, 102, 0.08)',
  },
  btnReportarTxt: {
    color: '#FFD166',
    fontSize: 9.5,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  versionTxt: {
    color: '#90CAF9',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
    opacity: 0.9,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalCambioContent: { backgroundColor: '#012E57', width: '90%', borderRadius: 15, padding: 20 },
  modalCambioTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  modalCambioSub: { color: '#00aaff', fontSize: 11, textAlign: 'center', marginBottom: 15 },
  equipoCard: { backgroundColor: '#001A33', padding: 14, borderRadius: 10, marginBottom: 8 },
  equipoCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  equipoEscudoWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#0B3556',
    borderWidth: 1,
    borderColor: '#1D5A86',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  equipoEscudoImg: { width: '100%', height: '100%' },
  equipoCardTitle: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  equipoCardSub: { color: '#00aaff', fontSize: 12, marginTop: 4 },
  btnCerrarCambio: { backgroundColor: '#C62828', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  btnCerrarCambioTxt: { color: '#FFF', fontWeight: 'bold' },
  cambioBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingVertical: 6 },
  cambioBackTxt: { color: '#90CAF9', fontWeight: 'bold' },
});