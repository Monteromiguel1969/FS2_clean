import React, { useState, useEffect, useMemo } from 'react';

import {

  View,

  Text,

  TouchableOpacity,

  StyleSheet,

  TextInput,

  ScrollView,

  Modal,

  Alert,

  Image,

  Switch,

} from 'react-native';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontAwesome } from '@expo/vector-icons';

import {

  getListaEquipos,

  getTeamSettings,

  setListaEquipos,

  setStorageMode,

  getStorageMode,

  loadLocalData,

  savePlayers,

  setTeamSettings,

  deleteEquipoTemporadaData,

} from '../storage/localStorage';

import { formatTeamBookName, clearTeamCloudConfig } from '../storage/teamCloudStorage';

import CrearLibroAsistenteModal from './CrearLibroAsistenteModal';

import ClonePlantillaJugadoresModal from './ClonePlantillaJugadoresModal';

import { useScreenMetrics } from '../utils/useScreenMetrics';

import { ZoomableImageModal } from './ZoomableImage';
import { useAuth } from '../context/AuthContext';
import { pushUserAppData } from '../services/firebaseUserDataService';
import UsuariosAppAdminModal from './UsuariosAppAdminModal';
import { listAppUsers } from '../services/appUserAuthorizationService';

import {

  type EquipoItem,

  getEquiposUnicos,

  getTemporadasDeEquipo,

  keyForEquipoTemporada,

  pickEscudoForEquipo,

} from '../utils/equipoGrouping';

import {
  buildClonePlayerRows,
  cloneSelectedPlayers,
  defaultSelectedPlayerKeys,
} from '../utils/clonePlantilla';



type Vista = 'equipos' | 'temporadas';



export default function SelectorEquipo({ onConfirm }: { onConfirm: (arg: { equipo: string; temporada: string }) => void }) {
  const { user, syncing, isAdmin, canEdit } = useAuth();

  const insets = useSafeAreaInsets();

  const screen = useScreenMetrics();

  const [listaEquipos, setListaEquiposState] = useState<EquipoItem[]>([]);

  const [escudos, setEscudos] = useState<Record<string, string | null>>({});

  const [vista, setVista] = useState<Vista>('equipos');

  const [equipoSeleccionado, setEquipoSeleccionado] = useState('');

  const [modalVisible, setModalVisible] = useState(false);

  const [escudoVisor, setEscudoVisor] = useState<{ uri: string; titulo: string } | null>(null);

  const [nuevoNombre, setNuevoNombre] = useState('');

  const [nuevaTemporada, setNuevaTemporada] = useState('2025-26');

  const [modoModal, setModoModal] = useState<'nuevo' | 'temporada'>('nuevo');

  const [asistenteLibro, setAsistenteLibro] = useState<{ equipo: string; temporada: string } | null>(null);

  const [cloneSourceTemporada, setCloneSourceTemporada] = useState('');

  const [cloneOrigenEquipo, setCloneOrigenEquipo] = useState('');

  const [cloneSourcePlayers, setCloneSourcePlayers] = useState<unknown[]>([]);

  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());

  const [copiarEscudo, setCopiarEscudo] = useState(true);

  const [jugadoresModalVisible, setJugadoresModalVisible] = useState(false);

  const [clubFijoTemporada, setClubFijoTemporada] = useState(false);
  const [adminUsersVisible, setAdminUsersVisible] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);



  
  const refreshPendingCount = async () => {
    if (!isAdmin || !user?.email) {
      setPendingCount(0);
      return;
    }
    try {
      const result = await listAppUsers(user.email);
      if (!result.success) {
        setPendingCount(0);
        return;
      }
      const n = (result.users || []).filter((u) => u.estado === 'pendiente').length;
      setPendingCount(n);
    } catch {
      setPendingCount(0);
    }
  };

  useEffect(() => {
    void refreshPendingCount();
  }, [isAdmin, user?.email]);

  const equiposUnicos = useMemo(() => getEquiposUnicos(listaEquipos), [listaEquipos]);

  const temporadasDelEquipo = useMemo(

    () => (equipoSeleccionado ? getTemporadasDeEquipo(listaEquipos, equipoSeleccionado) : []),

    [listaEquipos, equipoSeleccionado]

  );

  const temporadasOrigen = useMemo(() => {

    const nombre = modoModal === 'temporada' ? nuevoNombre.trim() : nuevoNombre.trim();

    if (!nombre) return [];

    return getTemporadasDeEquipo(listaEquipos, nombre);

  }, [listaEquipos, modoModal, nuevoNombre]);



  const ofrecerLibroNube = (nombre: string, temp: string) => {

    void getStorageMode().then((mode) => {

      if (mode !== 'cloud' && mode !== 'both') return;

      setAsistenteLibro({ equipo: nombre, temporada: temp });

    });

  };



  const cargarEquipos = async () => {

    const lista = await getListaEquipos();

    setListaEquiposState(lista);

    const pairs = await Promise.all(

      lista.map(async (it) => {

        const s = await getTeamSettings(it.nombre, it.temporada);

        return [keyForEquipoTemporada(it.nombre, it.temporada), s.escudoUri || null] as const;

      })

    );

    const map: Record<string, string | null> = {};

    pairs.forEach(([k, v]) => {

      map[k] = v;

    });

    setEscudos(map);

  };

  const subirCuentaTrasCambioLista = async (_nuevaLista: EquipoItem[]) => {
    if (user?.uid && user?.email) {
      await pushUserAppData(user.uid, user.email);
    }
  };

  const persistirListaEquipos = async (nuevaLista: EquipoItem[]) => {
    setListaEquiposState(nuevaLista);
    await setListaEquipos(nuevaLista);
    await subirCuentaTrasCambioLista(nuevaLista);
  };



  useEffect(() => {
    if (!user?.uid || syncing) return;
    cargarEquipos().catch(() => {});
  }, [user?.uid, syncing]);



  useEffect(() => {

    const srcEquipo = modoModal === 'temporada' ? nuevoNombre.trim() : cloneOrigenEquipo.trim();

    const srcTemp = cloneSourceTemporada.trim();

    if (!modalVisible || !srcEquipo || !srcTemp) {

      setCloneSourcePlayers([]);

      setSelectedPlayerIds(new Set());

      return;

    }

    void loadLocalData(srcEquipo, srcTemp).then((data) => {

      const players = Array.isArray(data.players) ? data.players : [];

      setCloneSourcePlayers(players);

      setSelectedPlayerIds(defaultSelectedPlayerKeys(buildClonePlayerRows(players)));

    });

  }, [modalVisible, modoModal, cloneSourceTemporada, nuevoNombre, cloneOrigenEquipo]);



  const resetModalForm = () => {

    setNuevoNombre(vista === 'temporadas' && equipoSeleccionado ? equipoSeleccionado : '');

    setNuevaTemporada('2025-26');

    setCloneSourceTemporada('');

    setCloneOrigenEquipo('');

    setCloneSourcePlayers([]);

    setSelectedPlayerIds(new Set());

    setCopiarEscudo(true);

    setClubFijoTemporada(vista === 'temporadas' && !!equipoSeleccionado);

  };



  const abrirModalNuevoEquipo = () => {
    if (!canEdit) {
      Alert.alert('Solo lectura', 'Tu cuenta no puede crear equipos.');
      return;
    }

    setModoModal('nuevo');

    resetModalForm();

    setNuevoNombre('');

    setModalVisible(true);

  };



  const abrirModalNuevaTemporada = (nombrePreseleccionado?: string) => {
    if (!canEdit) {
      Alert.alert('Solo lectura', 'Tu cuenta no puede crear temporadas.');
      return;
    }

    setModoModal('temporada');

    resetModalForm();

    const club = nombrePreseleccionado || (vista === 'temporadas' ? equipoSeleccionado : '');

    const fijo = !!(nombrePreseleccionado || (vista === 'temporadas' && equipoSeleccionado));

    setClubFijoTemporada(fijo);

    setNuevoNombre(club);

    if (club) {

      const temps = getTemporadasDeEquipo(listaEquipos, club);

      if (temps.length > 0) setCloneSourceTemporada(temps[0].temporada);

    }

    setModalVisible(true);

  };



  const aplicarClonadoPlantilla = async (
    srcEquipo: string,
    srcTemp: string,
    destEquipo: string,
    destTemp: string
  ) => {

    if (!srcEquipo || !srcTemp || selectedPlayerIds.size === 0) return 0;

    const data = await loadLocalData(srcEquipo, srcTemp);

    const sourcePlayers = Array.isArray(data.players) ? data.players : [];

    if (sourcePlayers.length === 0) return 0;

    const cloned = cloneSelectedPlayers(sourcePlayers, selectedPlayerIds);

    if (cloned.length === 0) return 0;

    await savePlayers(destEquipo, destTemp, cloned);

    return cloned.length;

  };



  const aplicarCopiaEscudo = async (
    srcEquipo: string,
    srcTemp: string,
    destEquipo: string,
    destTemp: string
  ) => {

    if (!copiarEscudo || !srcEquipo || !srcTemp) return;

    const src = await getTeamSettings(srcEquipo, srcTemp);

    if (src.escudoUri) await setTeamSettings(destEquipo, destTemp, { escudoUri: src.escudoUri });

  };



  const preguntarModoAlmacenamiento = (nombre: string, temp: string, jugadoresCopiados: number) => {

    const extra =

      jugadoresCopiados > 0

        ? `\n\nSe copiaron ${jugadoresCopiados} jugador(es) desde ${cloneSourceTemporada}.`

        : '';

    Alert.alert(

      '¿Dónde desea guardar los datos de este equipo?',

      `Puede cambiar esta opción más tarde.${extra}`,

      [

        { text: 'Solo en el teléfono', onPress: () => setStorageMode('local') },

        {

          text: 'Solo en la nube',

          onPress: () => {

            setStorageMode('cloud');

            ofrecerLibroNube(nombre, temp);

          },

        },

        {

          text: 'Ambos',

          onPress: () => {

            setStorageMode('both');

            ofrecerLibroNube(nombre, temp);

          },

        },

        {

          text: 'Entrar ahora',

          onPress: () => onConfirm({ equipo: nombre, temporada: temp }),

        },

      ]

    );

  };



  const ejecutarCreacion = async () => {

    const nombre = nuevoNombre.trim();

    const temp = nuevaTemporada.trim();

    const nuevoItem: EquipoItem = { id: Date.now(), nombre, temporada: temp };

    const nuevaLista = [...listaEquipos, nuevoItem];

    setListaEquiposState(nuevaLista);

    await setListaEquipos(nuevaLista);
    await subirCuentaTrasCambioLista(nuevaLista);



    let jugadoresCopiados = 0;

    const srcEquipo = modoModal === 'temporada' ? nombre : cloneOrigenEquipo.trim();

    const srcTemp = cloneSourceTemporada.trim();

    if (srcEquipo && srcTemp) {

      jugadoresCopiados = await aplicarClonadoPlantilla(srcEquipo, srcTemp, nombre, temp);

      await aplicarCopiaEscudo(srcEquipo, srcTemp, nombre, temp);

    }



    await cargarEquipos();

    setModalVisible(false);

    setEquipoSeleccionado(nombre);

    setVista('temporadas');



    if (modoModal === 'nuevo') {

      preguntarModoAlmacenamiento(nombre, temp, jugadoresCopiados);

    } else {

      Alert.alert(

        'Temporada creada',

        jugadoresCopiados > 0

          ? `Se añadió ${temp} con ${jugadoresCopiados} jugador(es) copiados.`

          : `Se añadió la temporada ${temp}.`,

        [

          { text: 'Seguir aquí', style: 'cancel' },

          { text: 'Entrar', onPress: () => onConfirm({ equipo: nombre, temporada: temp }) },

        ]

      );

      void getStorageMode().then((mode) => {

        if (mode === 'cloud' || mode === 'both') ofrecerLibroNube(nombre, temp);

      });

    }

  };



  const handleCrearEquipo = async () => {

    if (!nuevoNombre.trim()) {

      Alert.alert('Error', modoModal === 'temporada' ? 'Selecciona un club.' : 'Debes poner un nombre al equipo.');

      return;

    }

    const nombre = nuevoNombre.trim();

    const temp = nuevaTemporada.trim();

    if (!temp) {

      Alert.alert('Error', 'Indica la temporada.');

      return;

    }

    const duplicado = listaEquipos.some((e) => e.nombre === nombre && e.temporada === temp);

    if (duplicado) {

      Alert.alert('Error', 'Ya existe ese equipo con la misma temporada.');

      return;

    }

    if (modoModal === 'temporada' && cloneSourceTemporada === temp) {

      Alert.alert('Error', 'La temporada origen y destino no pueden ser la misma.');

      return;

    }

    if (
      modoModal === 'nuevo' &&
      cloneOrigenEquipo.trim() === nombre &&
      cloneSourceTemporada === temp
    ) {
      Alert.alert('Error', 'El origen y destino no pueden ser el mismo equipo y temporada.');
      return;
    }



    const tieneOrigenClon = !!(modoModal === 'temporada' ? cloneSourceTemporada : (cloneOrigenEquipo.trim() && cloneSourceTemporada));

    if (

      tieneOrigenClon &&

      cloneSourcePlayers.length > 0 &&

      selectedPlayerIds.size === 0

    ) {

      Alert.alert(

        'Sin jugadores seleccionados',

        'Elegiste copiar plantilla desde otra temporada pero no marcaste ningún jugador. La nueva temporada se creará sin plantilla (solo escudo si está activado).',

        [

          { text: 'Cancelar', style: 'cancel' },

          { text: 'Elegir jugadores', onPress: () => setJugadoresModalVisible(true) },

          { text: 'Crear vacía', onPress: () => void ejecutarCreacion() },

        ]

      );

      return;

    }



    await ejecutarCreacion();

  };



  const eliminarDatosTemporada = async (nombre: string, temporada: string) => {

    await deleteEquipoTemporadaData(nombre, temporada);

    await clearTeamCloudConfig(nombre, temporada);

  };

  const quitarTemporadaDeMiCuenta = async (item: EquipoItem) => {
    const nuevaLista = listaEquipos.filter((e) => e.id !== item.id);
    await clearTeamCloudConfig(item.nombre, item.temporada);
    await persistirListaEquipos(nuevaLista);
    await cargarEquipos();
    if (vista === 'temporadas' && getTemporadasDeEquipo(nuevaLista, equipoSeleccionado).length === 0) {
      setVista('equipos');
      setEquipoSeleccionado('');
    }
  };

  const quitarEquipoDeMiCuenta = async (nombre: string) => {
    const temps = getTemporadasDeEquipo(listaEquipos, nombre);
    const nuevaLista = listaEquipos.filter((e) => e.nombre !== nombre);
    for (const t of temps) {
      await clearTeamCloudConfig(t.nombre, t.temporada);
    }
    await persistirListaEquipos(nuevaLista);
    await cargarEquipos();
    if (equipoSeleccionado === nombre) {
      setVista('equipos');
      setEquipoSeleccionado('');
    }
  };



  const handleBorrarTemporada = (item: EquipoItem) => {

    Alert.alert(

      'Eliminar temporada',

      `¿Qué quieres hacer con "${item.nombre} · ${item.temporada}"?`,

      [

        { text: 'Cancelar', style: 'cancel' },

        {

          text: 'Borrar del móvil',

          style: 'destructive',

          onPress: () => {

            void (async () => {

              await eliminarDatosTemporada(item.nombre, item.temporada);

              const nuevaLista = listaEquipos.filter((e) => e.id !== item.id);

              await persistirListaEquipos(nuevaLista);

              await cargarEquipos();

              if (vista === 'temporadas' && getTemporadasDeEquipo(nuevaLista, equipoSeleccionado).length === 0) {

                setVista('equipos');

                setEquipoSeleccionado('');

              }

            })();

          },

        },
        {
          text: 'Quitar de mi cuenta',
          onPress: () => {
            void (async () => {
              await quitarTemporadaDeMiCuenta(item);
            })();
          },
        },

      ]

    );

  };



  const handleBorrarEquipo = (nombre: string) => {

    const temps = getTemporadasDeEquipo(listaEquipos, nombre);

    const numTemp = temps.length;

    Alert.alert(

      'Eliminar equipo',

      `¿Qué quieres hacer con el equipo "${nombre}" (${numTemp} temporada${numTemp === 1 ? '' : 's'})?`,

      [

        { text: 'Cancelar', style: 'cancel' },

        {

          text: 'Borrar del móvil',

          style: 'destructive',

          onPress: () => {

            void (async () => {

              for (const t of temps) {

                await eliminarDatosTemporada(t.nombre, t.temporada);

              }

              const nuevaLista = listaEquipos.filter((e) => e.nombre !== nombre);

              await persistirListaEquipos(nuevaLista);

              await cargarEquipos();

              if (equipoSeleccionado === nombre) {

                setVista('equipos');

                setEquipoSeleccionado('');

              }

            })();

          },

        },
        {
          text: 'Quitar de mi cuenta',
          onPress: () => {
            void (async () => {
              await quitarEquipoDeMiCuenta(nombre);
            })();
          },
        },

      ]

    );

  };



  const renderEquipos = () => (

    <>

      {equiposUnicos.length === 0 ? (

        <View style={styles.emptyBox}>

          <Text style={styles.emptyTxt}>No hay equipos creados aún. Pulsa + para empezar.</Text>

        </View>

      ) : null}

      {equiposUnicos.map((nombre) => {

        const escudoUri = pickEscudoForEquipo(escudos, nombre, listaEquipos);

        const numTemporadas = getTemporadasDeEquipo(listaEquipos, nombre).length;

        return (

          <View key={nombre} style={styles.card}>

            <TouchableOpacity

              style={styles.cardMain}

              onPress={() => {

                setEquipoSeleccionado(nombre);

                setVista('temporadas');

              }}

              onLongPress={() => {

                if (escudoUri) setEscudoVisor({ uri: escudoUri, titulo: nombre });

              }}

              delayLongPress={350}

            >

              <View style={styles.escudoBigWrap}>

                {escudoUri ? (

                  <Image source={{ uri: escudoUri }} style={styles.escudoBigImg} />

                ) : (

                  <FontAwesome name="shield" size={24} color="#90CAF9" />

                )}

              </View>

              <View style={{ flex: 1 }}>

                <Text style={styles.cardTitle}>{nombre}</Text>

                <Text style={styles.cardSub}>

                  {numTemporadas} temporada{numTemporadas === 1 ? '' : 's'}

                </Text>

              </View>

              <FontAwesome name="chevron-right" size={18} color="#4CC9F0" />

            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleBorrarEquipo(nombre)} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>

              <FontAwesome name="trash" size={20} color="#FF4757" />

            </TouchableOpacity>

          </View>

        );

      })}

    </>

  );



  const renderTemporadas = () => (

    <>

      <TouchableOpacity style={styles.backRow} onPress={() => { setVista('equipos'); setEquipoSeleccionado(''); }}>

        <FontAwesome name="arrow-left" size={16} color="#90CAF9" />

        <Text style={styles.backTxt}>Volver a equipos</Text>

      </TouchableOpacity>



      <View style={styles.teamHeader}>

        <View style={styles.escudoBigWrap}>

          {pickEscudoForEquipo(escudos, equipoSeleccionado, listaEquipos) ? (

            <Image

              source={{ uri: pickEscudoForEquipo(escudos, equipoSeleccionado, listaEquipos) || undefined }}

              style={styles.escudoBigImg}

            />

          ) : (

            <FontAwesome name="shield" size={24} color="#90CAF9" />

          )}

        </View>

        <View style={{ flex: 1 }}>

          <Text style={styles.teamHeaderTitle}>{equipoSeleccionado}</Text>

          <Text style={styles.teamHeaderSub}>Elige temporada</Text>

        </View>

        <TouchableOpacity style={styles.addTempBtn} onPress={() => abrirModalNuevaTemporada(equipoSeleccionado)}>

          <FontAwesome name="plus" size={14} color="#FFF" />

          <Text style={styles.addTempTxt}>NUEVA</Text>

        </TouchableOpacity>

      </View>



      {temporadasDelEquipo.length === 0 ? (

        <View style={styles.emptyBox}>

          <Text style={styles.emptyTxt}>Sin temporadas. Pulsa NUEVA para añadir la primera.</Text>

        </View>

      ) : null}



      {temporadasDelEquipo.map((item) => {

        const escudoUri = escudos[keyForEquipoTemporada(item.nombre, item.temporada)] || null;

        return (

          <View key={item.id} style={styles.card}>

            <TouchableOpacity

              style={styles.cardMain}

              onPress={() => onConfirm({ equipo: item.nombre, temporada: item.temporada })}

              onLongPress={() => {

                if (escudoUri) setEscudoVisor({ uri: escudoUri, titulo: `${item.nombre} · ${item.temporada}` });

              }}

              delayLongPress={350}

            >

              <View style={styles.escudoSmallWrap}>

                {escudoUri ? (

                  <Image source={{ uri: escudoUri }} style={styles.escudoSmallImg} />

                ) : (

                  <FontAwesome name="calendar" size={18} color="#90CAF9" />

                )}

              </View>

              <View>

                <Text style={styles.cardTitle}>{item.temporada}</Text>

                <Text style={styles.cardSub}>{formatTeamBookName(item.nombre, item.temporada)}</Text>

              </View>

            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleBorrarTemporada(item)} style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>

              <FontAwesome name="trash" size={20} color="#FF4757" />

            </TouchableOpacity>

          </View>

        );

      })}

    </>

  );



  return (

    <SafeAreaView style={[styles.container, { paddingHorizontal: screen.horizontalPadding }]} edges={['top', 'bottom']}>

      <Text style={styles.title}>{vista === 'equipos' ? 'MIS EQUIPOS' : 'TEMPORADAS'}</Text>

      <Text style={styles.subTitle}>

        {vista === 'equipos' ? 'Elige un club' : `Temporadas de ${equipoSeleccionado}`}

      </Text>

      {isAdmin ? (
        <TouchableOpacity
          style={styles.adminPendingBtn}
          onPress={() => setAdminUsersVisible(true)}
          activeOpacity={0.85}
        >
          <FontAwesome name="users" size={16} color="#FFF" />
          <Text style={styles.adminPendingTxt}>
            {pendingCount > 0
              ? `AUTORIZACIONES PENDIENTES (${pendingCount})`
              : 'GESTIONAR USUARIOS (ADMIN)'}
          </Text>
        </TouchableOpacity>
      ) : null}



      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 130 }}>

        {vista === 'equipos' ? renderEquipos() : renderTemporadas()}

      </ScrollView>



      <View style={[styles.footerBar, { paddingBottom: insets.bottom + 10 }]}>

        <TouchableOpacity style={styles.footerBtnPrimary} onPress={abrirModalNuevoEquipo}>

          <FontAwesome name="plus" size={18} color="#FFF" />

          <Text style={styles.footerBtnTxt}>AÑADIR EQUIPO</Text>

        </TouchableOpacity>

        <TouchableOpacity

          style={styles.footerBtnSecondary}

          onPress={() => abrirModalNuevaTemporada(vista === 'temporadas' ? equipoSeleccionado : undefined)}

        >

          <FontAwesome name="calendar-plus-o" size={16} color="#FFF" />

          <Text style={styles.footerBtnTxt}>AÑADIR TEMPORADA</Text>

        </TouchableOpacity>

      </View>



      <Text style={[styles.credits, { bottom: insets.bottom + 72 }]}>Creada por Miguel Montero</Text>



      <Modal visible={modalVisible} animationType="slide" transparent>

        <View style={styles.modalOverlay}>

          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">

            <View style={styles.modalContent}>

              <Text style={styles.modalTitle}>

                {modoModal === 'temporada' ? 'NUEVA TEMPORADA' : 'AÑADIR NUEVO EQUIPO'}

              </Text>



              {modoModal === 'temporada' ? (

                <>

                  <Text style={styles.label}>Club:</Text>

                  {clubFijoTemporada && nuevoNombre.trim() ? (

                    <Text style={styles.clubFijoTxt}>{nuevoNombre.trim()}</Text>

                  ) : (

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>

                      {equiposUnicos.map((nombre) => (

                        <TouchableOpacity

                          key={nombre}

                          style={[styles.chip, nuevoNombre === nombre && styles.chipActive]}

                          onPress={() => {

                            setNuevoNombre(nombre);

                            const temps = getTemporadasDeEquipo(listaEquipos, nombre);

                            setCloneSourceTemporada(temps[0]?.temporada || '');

                          }}

                        >

                          <Text style={styles.chipTxt}>{nombre}</Text>

                        </TouchableOpacity>

                      ))}

                    </ScrollView>

                  )}

                  {equiposUnicos.length === 0 ? (

                    <Text style={styles.hintModal}>Primero crea un equipo con el botón +.</Text>

                  ) : null}



                  {temporadasOrigen.length > 0 ? (

                    <>

                      <Text style={styles.label}>Copiar plantilla desde temporada:</Text>

                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>

                        <TouchableOpacity

                          style={[styles.chip, !cloneSourceTemporada && styles.chipActive]}

                          onPress={() => setCloneSourceTemporada('')}

                        >

                          <Text style={styles.chipTxt}>Sin copiar</Text>

                        </TouchableOpacity>

                        {temporadasOrigen.map((item) => (

                          <TouchableOpacity

                            key={item.id}

                            style={[styles.chip, cloneSourceTemporada === item.temporada && styles.chipActive]}

                            onPress={() => setCloneSourceTemporada(item.temporada)}

                          >

                            <Text style={styles.chipTxt}>{item.temporada}</Text>

                          </TouchableOpacity>

                        ))}

                      </ScrollView>



                      {cloneSourceTemporada ? (

                        <>

                          <TouchableOpacity

                            style={styles.fieldsBtn}

                            onPress={() => setJugadoresModalVisible(true)}

                            disabled={cloneSourcePlayers.length === 0}

                          >

                            <Text style={styles.fieldsBtnTxt}>

                              ELEGIR JUGADORES ({selectedPlayerIds.size} de {cloneSourcePlayers.length})

                            </Text>

                          </TouchableOpacity>

                          <Text style={styles.hintModal}>

                            Se copian todos los datos de cada jugador marcado. Desmarca a quien ya no esté en el equipo.

                          </Text>

                          <View style={styles.switchRow}>

                            <Text style={styles.switchLabel}>Copiar escudo del club</Text>

                            <Switch value={copiarEscudo} onValueChange={setCopiarEscudo} />

                          </View>

                        </>

                      ) : null}

                    </>

                  ) : null}

                </>

              ) : (

                <>

                  <Text style={styles.label}>Nombre del club:</Text>

                  <TextInput

                    style={styles.input}

                    placeholder="Ej: Juvenil A"

                    placeholderTextColor="#888"

                    value={nuevoNombre}

                    onChangeText={setNuevoNombre}

                  />



                  {listaEquipos.length > 0 ? (

                    <>

                      <Text style={styles.label}>Copiar plantilla desde (opcional):</Text>

                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>

                        <TouchableOpacity

                          style={[styles.chip, !cloneOrigenEquipo && !cloneSourceTemporada && styles.chipActive]}

                          onPress={() => {

                            setCloneOrigenEquipo('');

                            setCloneSourceTemporada('');

                          }}

                        >

                          <Text style={styles.chipTxt}>Sin copiar</Text>

                        </TouchableOpacity>

                        {listaEquipos.map((item) => {

                          const active = cloneOrigenEquipo === item.nombre && cloneSourceTemporada === item.temporada;

                          return (

                            <TouchableOpacity

                              key={item.id}

                              style={[styles.chip, active && styles.chipActive]}

                              onPress={() => {

                                setCloneOrigenEquipo(item.nombre);

                                setCloneSourceTemporada(item.temporada);

                              }}

                            >

                              <Text style={styles.chipTxt}>{item.nombre} · {item.temporada}</Text>

                            </TouchableOpacity>

                          );

                        })}

                      </ScrollView>



                      {cloneOrigenEquipo && cloneSourceTemporada ? (

                        <>

                          <TouchableOpacity

                            style={styles.fieldsBtn}

                            onPress={() => setJugadoresModalVisible(true)}

                            disabled={cloneSourcePlayers.length === 0}

                          >

                            <Text style={styles.fieldsBtnTxt}>

                              ELEGIR JUGADORES ({selectedPlayerIds.size} de {cloneSourcePlayers.length})

                            </Text>

                          </TouchableOpacity>

                          <View style={styles.switchRow}>

                            <Text style={styles.switchLabel}>Copiar escudo del club origen</Text>

                            <Switch value={copiarEscudo} onValueChange={setCopiarEscudo} />

                          </View>

                        </>

                      ) : null}

                    </>

                  ) : null}

                </>

              )}



              <Text style={styles.label}>Temporada:</Text>

              <TextInput

                style={styles.input}

                placeholder="Ej: 2026-27"

                placeholderTextColor="#888"

                value={nuevaTemporada}

                onChangeText={setNuevaTemporada}

              />



              <Text style={styles.hintModal}>

                Libro Google: {formatTeamBookName(nuevoNombre || 'Equipo', nuevaTemporada) || 'Equipo Temporada'}

              </Text>



              <View style={styles.modalButtons}>

                <TouchableOpacity style={[styles.btnModal, styles.btnCancel]} onPress={() => setModalVisible(false)}>

                  <Text style={styles.btnText}>CANCELAR</Text>

                </TouchableOpacity>

                <TouchableOpacity style={[styles.btnModal, styles.btnSave]} onPress={handleCrearEquipo}>

                  <Text style={styles.btnText}>GUARDAR</Text>

                </TouchableOpacity>

              </View>

            </View>

          </ScrollView>

        </View>

      </Modal>



      <ClonePlantillaJugadoresModal

        visible={jugadoresModalVisible}

        sourcePlayers={cloneSourcePlayers}

        selected={selectedPlayerIds}

        onClose={() => setJugadoresModalVisible(false)}

        onConfirm={setSelectedPlayerIds}

      />



      <CrearLibroAsistenteModal

        visible={!!asistenteLibro}

        equipo={asistenteLibro?.equipo || ''}

        temporada={asistenteLibro?.temporada || ''}

        onClose={() => setAsistenteLibro(null)}

      />



      <ZoomableImageModal

        visible={!!escudoVisor}

        uri={escudoVisor?.uri}

        title={escudoVisor?.titulo}

        onClose={() => setEscudoVisor(null)}

      />

      <UsuariosAppAdminModal
        visible={adminUsersVisible}
        onClose={() => {
          setAdminUsersVisible(false);
          void refreshPendingCount();
        }}
      />

    </SafeAreaView>

  );

}



const styles = StyleSheet.create({

  container: { flex: 1, backgroundColor: '#001A33', paddingVertical: 20 },

  title: { color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 },

  subTitle: { color: '#4CC9F0', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  adminPendingBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0077B6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#4CC9F0',
  },
  adminPendingTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },

  scroll: { flex: 1 },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },

  backTxt: { color: '#90CAF9', fontWeight: 'bold' },

  teamHeader: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 12,

    backgroundColor: '#012E57',

    borderRadius: 14,

    padding: 14,

    marginBottom: 14,

    borderLeftWidth: 4,

    borderLeftColor: '#4CC9F0',

  },

  teamHeaderTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },

  teamHeaderSub: { color: '#8FA7BF', fontSize: 13, marginTop: 2 },

  addTempBtn: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: 6,

    backgroundColor: '#2E7D32',

    paddingHorizontal: 10,

    paddingVertical: 8,

    borderRadius: 10,

  },

  addTempTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 11 },

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

    elevation: 3,

  },

  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },

  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },

  cardSub: { color: '#AAA', fontSize: 14, marginTop: 4 },

  escudoBigWrap: {

    width: 64,

    height: 64,

    borderRadius: 16,

    backgroundColor: '#0B3556',

    borderWidth: 1,

    borderColor: '#1D5A86',

    justifyContent: 'center',

    alignItems: 'center',

    overflow: 'hidden',

  },

  escudoBigImg: { width: '100%', height: '100%' },

  escudoSmallWrap: {

    width: 44,

    height: 44,

    borderRadius: 12,

    backgroundColor: '#0B3556',

    borderWidth: 1,

    borderColor: '#1D5A86',

    justifyContent: 'center',

    alignItems: 'center',

    overflow: 'hidden',

  },

  escudoSmallImg: { width: '100%', height: '100%' },

  emptyBox: {

    backgroundColor: '#012E57',

    borderRadius: 12,

    padding: 14,

    marginBottom: 12,

    borderWidth: 1,

    borderColor: '#1D5A86',

  },

  emptyTxt: { color: '#B3E5FC', fontSize: 13, textAlign: 'center' },

  footerBar: {

    position: 'absolute',

    left: 16,

    right: 16,

    bottom: 0,

    flexDirection: 'row',

    gap: 10,

    zIndex: 20,

    elevation: 8,

  },

  footerBtnPrimary: {

    flex: 1,

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    gap: 8,

    backgroundColor: '#2E7D32',

    paddingVertical: 14,

    borderRadius: 12,

  },

  footerBtnSecondary: {

    flex: 1,

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    gap: 8,

    backgroundColor: '#023E8A',

    paddingVertical: 14,

    borderRadius: 12,

  },

  footerBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },

  deleteBtn: { padding: 10, minWidth: 44, alignItems: 'center', justifyContent: 'center' },

  fabRow: {

    position: 'absolute',

    right: 30,

    flexDirection: 'row',

    gap: 12,

    alignItems: 'center',

  },

  fab: {

    backgroundColor: '#2E7D32',

    width: 60,

    height: 60,

    borderRadius: 30,

    justifyContent: 'center',

    alignItems: 'center',

    elevation: 5,

  },

  fabSecondary: {

    width: 52,

    height: 52,

    borderRadius: 26,

    backgroundColor: '#023E8A',

  },

  chip: {

    backgroundColor: '#0A2A4A',

    paddingHorizontal: 14,

    paddingVertical: 8,

    borderRadius: 20,

    marginRight: 8,

    borderWidth: 1,

    borderColor: '#1B4965',

  },

  chipActive: { backgroundColor: '#0077B6', borderColor: '#4CC9F0' },

  chipTxt: { color: '#FFF', fontSize: 13 },

  hintModal: { color: '#8FA7BF', fontSize: 12, marginBottom: 10, textAlign: 'center' },

  clubFijoTxt: {

    color: '#FFF',

    fontSize: 16,

    fontWeight: 'bold',

    backgroundColor: '#0A2A4A',

    padding: 12,

    borderRadius: 10,

    marginBottom: 12,

    textAlign: 'center',

    borderWidth: 1,

    borderColor: '#4CC9F0',

  },

  fieldsBtn: {

    backgroundColor: '#023E8A',

    padding: 12,

    borderRadius: 10,

    alignItems: 'center',

    marginBottom: 10,

  },

  fieldsBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },

  switchRow: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    marginBottom: 12,

  },

  switchLabel: { color: '#E0E0E0', flex: 1, marginRight: 10 },

  credits: {

    position: 'absolute',

    left: 0,

    right: 0,

    textAlign: 'center',

    fontSize: 12,

    color: '#78909C',

  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 16 },

  modalScroll: { flexGrow: 1, justifyContent: 'center' },

  modalContent: { backgroundColor: '#001A33', padding: 22, borderRadius: 20, borderWidth: 1, borderColor: '#4CC9F0' },

  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },

  label: { color: '#4CC9F0', marginBottom: 8, fontWeight: 'bold' },

  input: { backgroundColor: '#FFF', borderRadius: 8, padding: 12, marginBottom: 16, color: '#000' },

  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 4 },

  btnModal: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center' },

  btnCancel: { backgroundColor: '#C62828' },

  btnSave: { backgroundColor: '#2E7D32' },

  btnText: { color: '#FFF', fontWeight: 'bold' },

});


