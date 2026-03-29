import * as ImagePicker from 'expo-image-picker';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Modal, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { todayFormatted, formatDateExport, parseToDate } from '../utils/dateFormat';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { FontAwesome } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

// Importaciones de servicios
import { uploadActaToDrive, listActasFromDrive } from '../services/googleSheetsService';

/** Formato igual que la pestaña Partidos de Stats.tsx al exportar. */
function buildReportFromPartido(partido, players = []) {
  if (!partido) return '';
  const parseMin = (str) => {
    if (str == null || str === '') return 0;
    const parts = String(str).trim().split(':').map(Number);
    const m = Math.max(0, parts[0] || 0), s = Math.max(0, parts[1] || 0);
    return m * 60 + s;
  };
  const formatMinSeg = (min, seg) => {
    if (min == null && seg == null) return '-';
    const m = Math.max(0, min ?? 0);
    const s = Math.max(0, Math.min(59, seg ?? 0));
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };
  const formatTime = (totalSec) => {
    const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
    if (sec >= 3600) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };
  const tipoLabel = (t) => (t === 'CONTRA' ? 'C' : t === 'FAVOR' ? 'F' : t || '-');
  const listaJugadores = (players || []).filter(p => p.role === 'Jugador');
  const listaStaff = (players || []).filter(p => p.role === 'Monitor');
  const allPlayers = [...listaJugadores, ...listaStaff];

  const headerBase = '<h1 style="text-align:center; color:#012E57;">ESTADÍSTICAS DEL EQUIPO</h1>';
  const fechaDdMmAa = (s) => (s ? (formatDateExport(parseToDate(s)) || s) : '');
  const rows = (partido.convocatoria || []).map(reg => {
    const jug = allPlayers.find(p => p.id === reg.id);
    const nombre = (jug && ((jug.nominal && String(jug.nominal).trim()) || jug.name)) || reg.name || '-';
    const minutos = reg.minutos != null ? reg.minutos : '0:00';
    const minSeg = parseMin(minutos);
    const fmt = minSeg >= 3600 ? `${Math.floor(minSeg/3600)}:${Math.floor((minSeg%3600)/60)}:${(minSeg%60) < 10 ? '0' : ''}${minSeg%60}` : `${Math.floor(minSeg/60)}:${(minSeg%60) < 10 ? '0' : ''}${minSeg%60}`;
    return '<tr><td class="name-col">' + nombre + '</td><td>' + (reg.estado || '-') + '</td><td>' + (reg.esCapitan ? 'Sí' : '-') + '</td><td>' + (reg.goles ?? 0) + '</td><td>' + fmt + '</td></tr>';
  }).join('');

  const tiempos = partido.tiemposPorPeriodo || {};
  const totalPeriodos = (() => {
    const first = Object.values(tiempos)[0];
    return Array.isArray(first) ? first.length : 0;
  })();
  let pagina2 = '';
  if (totalPeriodos > 0 && Object.keys(tiempos).length > 0) {
    const convIds = (partido.convocatoria || []).map(c => c.id);
    const headerPeriodos = Array.from({ length: totalPeriodos }, (_, j) => '<th>P' + (j + 1) + '</th>').join('');
    const filasTiempos = convIds.map(id => {
      const jug = allPlayers.find(p => p.id === id);
      const nombre = jug?.name || '-';
      const segs = tiempos[id] || [];
      const celdas = Array.from({ length: totalPeriodos }, (_, j) => '<td>' + formatTime(segs[j]) + '</td>').join('');
      const total = segs.reduce((a, b) => a + (b || 0), 0);
      return '<tr><td class="name-col">' + nombre + '</td>' + celdas + '<td><b>' + formatTime(total) + '</b></td></tr>';
    }).join('');
    pagina2 = '<h3>Informe de cronómetro (tiempos y goles)</h3><h4>Tiempos de juego (importados del cronómetro)</h4><table><thead><tr><th class="name-col">Jugador</th>' + headerPeriodos + '<th>Total</th></tr></thead><tbody>' + filasTiempos + '</tbody></table>';
  } else {
    pagina2 = '<h3>Informe de cronómetro (tiempos y goles)</h3><p style="font-style:italic;color:#666;">No disponible.</p>';
  }

  const eventos = partido.eventosGoles || [];
  let pagina3 = '';
  if (eventos.length > 0) {
    const filasGoles = eventos.map(ev => {
      const tiempo = formatMinSeg(ev.minuto, ev.segundo);
      const tipo = tipoLabel(ev.tipo);
      return '<tr><td class="name-col">' + (ev.autor || '-') + '</td><td>' + tiempo + '</td><td>' + tipo + '</td><td>' + (ev.quintetoEnPista || '-') + '</td></tr>';
    }).join('');
    pagina3 = '<h3>Detalle de goles (importados del cronómetro)</h3><table><thead><tr><th class="name-col">Autor del gol</th><th>Tiempo (m:ss)</th><th>Tipo</th><th>Quinteto en pista</th></tr></thead><tbody>' + filasGoles + '</tbody></table>';
  } else {
    pagina3 = '<h3>Detalle de goles (importados del cronómetro)</h3><p style="font-style:italic;color:#666;">No disponible.</p>';
  }

  const pageBreak = '<div class="page-break"></div>';
  const pag1 = '<div>' + headerBase +
    '<h2>Partido: ' + (partido.tipo || 'LIGA') + ' – ' + (partido.rival || 'Rival') + '</h2>' +
    '<p><strong>Fecha:</strong> ' + fechaDdMmAa(partido.fecha) + ' &nbsp; <strong>Resultado:</strong> ' + (partido.golesFavor ?? 0) + ' - ' + (partido.golesContra ?? 0) + ' &nbsp; <strong>Lugar:</strong> ' + (partido.lugar || '-') + '</p>' +
    '<h3>Convocatoria</h3>' +
    '<table><thead><tr><th class="name-col">Jugador</th><th>Asist.</th><th>Cap.</th><th>Goles</th><th>Minutos</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5">Sin convocatoria</td></tr>') + '</tbody></table></div>';
  return pag1 + pageBreak + '<div>' + pagina2 + '</div>' + pageBreak + '<div>' + pagina3 + '</div>';
}

const parseMinutosToSeconds = (str) => {
  if (str == null || str === '') return 0;
  const parts = String(str).trim().split(':').map(Number);
  const m = Math.max(0, parts[0] || 0), s = Math.max(0, parts[1] || 0);
  return m * 60 + s;
};
const formatTiempoJugado = (totalSeg) => {
  const sec = Math.max(0, Math.floor(Number(totalSeg) || 0));
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

// Vista previa para evitar que un informe muy largo bloquee el render en móviles.
const REPORT_PREVIEW_CHARS = 8000;

const parseFecha = (fechaStr) => {
  if (!fechaStr) return 0;
  const s = String(fechaStr).trim();
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  const yyyymmdd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ddmmyyyy) return new Date(parseInt(ddmmyyyy[3], 10), parseInt(ddmmyyyy[2], 10) - 1, parseInt(ddmmyyyy[1], 10)).getTime();
  if (yyyymmdd) return new Date(parseInt(yyyymmdd[1], 10), parseInt(yyyymmdd[2], 10) - 1, parseInt(yyyymmdd[3], 10)).getTime();
  const any = new Date(s).getTime();
  return isNaN(any) ? 0 : any;
};

export default function Partidos({ players = [], partidos, setPartidos, editItem, onBack, storageKeyBase = '@futsal_lega:default:default', onSelectPartidoToEdit, onClearEdit }) {
  const [rival, setRival] = useState('');
  const [fecha, setFecha] = useState('');
  const [lugar, setLugar] = useState('LOCAL');
  const [tipo, setTipo] = useState('LIGA');
  const [golesFavor, setGolesFavor] = useState('0');
  const [golesContra, setGolesContra] = useState('0');
  const [convocatoria, setConvocatoria] = useState([]);
  const [acta, setActa] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [driveActasModalVisible, setDriveActasModalVisible] = useState(false);
  const [driveActas, setDriveActas] = useState([]);
  const [driveActasLoading, setDriveActasLoading] = useState(false);
  const [driveActasQuery, setDriveActasQuery] = useState('');
  const [listaSesiones, setListaSesiones] = useState([]);
  const [compFilter, setCompFilter] = useState('LIGA');
  const [loading, setLoading] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [selectedPartidoId, setSelectedPartidoId] = useState(null);
  const [selectedPartido, setSelectedPartido] = useState(null);
  const [historicoModalVisible, setHistoricoModalVisible] = useState(false);
  const [eventosGoles, setEventosGoles] = useState([]);
  const [tiemposPorPeriodo, setTiemposPorPeriodo] = useState({});
  const sharingRef = useRef(false);

  const generatingRef = useRef(false);

  const reportPreview = useMemo(() => {
    if (!reportContent) return '';
    const str = typeof reportContent === 'string' ? reportContent : String(reportContent);
    const plain = str
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (plain.length <= REPORT_PREVIEW_CHARS) return plain;
    return plain.slice(0, REPORT_PREVIEW_CHARS) + '\n\n[Informe truncado para evitar bloqueo]';
  }, [reportContent]);

  useEffect(() => {
    cargarHistorialCrono();
    if (editItem) {
      setRival(editItem.rival || '');
      setFecha(editItem.fecha || todayFormatted());
      setLugar(editItem.lugar || 'LOCAL');
      setTipo(editItem.tipo || 'LIGA');
      setGolesFavor(editItem.golesFavor?.toString() || '0');
      setGolesContra(editItem.golesContra?.toString() || '0');
      setConvocatoria(editItem.convocatoria || []);
      setActa(editItem.acta || null);
      setEventosGoles(editItem.eventosGoles || []);
      setTiemposPorPeriodo(editItem.tiemposPorPeriodo || {});
    } else {
      setFecha(todayFormatted());
      setConvocatoria(players.map(p => ({
        id: p.id, name: p.name, role: p.role, estado: 'AS',
        goles: 0, esCapitan: false, minutos: '0:00'
      })));
      setEventosGoles([]);
      setTiemposPorPeriodo({});
    }
  }, [editItem, players]);

  const cargarHistorialCrono = async () => {
    try {
      const storageKey = `${storageKeyBase}:historial_partidos`;
      const data = await AsyncStorage.getItem(storageKey);
      if (data) {
        setListaSesiones(JSON.parse(data));
      }
    } catch (e) {
      console.log("Error cargando historial:", e);
    }
  };

  const aplicarTiemposSesion = (sesion) => {
    setGolesFavor((sesion?.goles?.favor ?? 0).toString());
    setGolesContra((sesion?.goles?.contra ?? 0).toString());
    if (!rival) setRival(sesion.rival || '');

    const eventos = sesion?.goles?.eventos || [];
    const nuevaConv = convocatoria.map(p => {
      const s = sesion?.tiempos?.[p.id]?.reduce((a, b) => a + b, 0) || 0;
      const m = Math.floor(s / 60);
      const sc = s % 60;
      const tFormateado = `${m}:${sc < 10 ? '0' : ''}${sc}`;
      // Los eventos del cronómetro guardan "autor" (nombre), no autorId; emparejar por nombre
      const nombreJugador = p.nominal || p.name || '';
      const conteoGoles = eventos.filter(ev =>
        ev.tipo === 'FAVOR' && (ev.autor === nombreJugador || ev.autor === p.name || ev.autor === p.nominal)
      ).length;

      return { ...p, minutos: tFormateado, goles: conteoGoles, estado: s > 0 ? 'AS' : p.estado };
    });
    setConvocatoria(nuevaConv);
    setEventosGoles(eventos);
    setTiemposPorPeriodo(sesion?.tiempos || {});
    setModalVisible(false);
  };

  // 1. GENERAR NOMBRE DINÁMICO SANITIZADO
  const generarNombreActa = () => {
    const fechaLimpia = (fecha || "SinFecha").replace(/\//g, "-").trim();
    const rivalLimpio = (rival || "SinRival").replace(/[^a-zA-Z0-9 ]/g, "").trim();
    return `${fechaLimpia}_${rivalLimpio}`.replace(/\s+/g, '_');
  };

  const saveActaLocally = async (sourceUri, fileName) => {
    const safeName = (fileName || `acta_${Date.now()}`).replace(/[^\w.\-]/g, '_');
    const dest = `${FileSystem.documentDirectory}actas_partidos/${Date.now()}_${safeName}`;
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}actas_partidos`, { intermediates: true });
    try {
      await FileSystem.copyAsync({ from: sourceUri, to: dest });
    } catch (_) {
      const b64 = await FileSystem.readAsStringAsync(sourceUri, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(dest, b64, { encoding: FileSystem.EncodingType.Base64 });
    }
    return dest;
  };

  const cargarActasDrive = async () => {
    setDriveActasLoading(true);
    try {
      const res = await listActasFromDrive();
      if (res.success) {
        setDriveActas(Array.isArray(res.files) ? res.files : []);
      } else {
        Alert.alert("Aviso", res.message || "No se pudieron cargar las actas de Drive.");
      }
    } catch (e) {
      Alert.alert("Error", "No se pudo conectar con Drive para listar actas.");
    } finally {
      setDriveActasLoading(false);
    }
  };

  const abrirImportarActaDesdeDrive = async () => {
    setDriveActasModalVisible(true);
    await cargarActasDrive();
  };

  const vincularActaDrive = (file) => {
    if (!file?.url) return;
    const mime = file.mimeType || (String(file.name || '').toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    setActa({
      uri: null,
      tipo: mime === 'application/pdf' ? 'archivo' : 'imagen',
      nombre: file.name || `${generarNombreActa()}.pdf`,
      mimeType: mime,
      driveUrl: file.url,
      driveFileId: file.id,
    });
    setDriveActasModalVisible(false);
    Alert.alert("Acta vinculada", "Se ha vinculado una acta existente de Drive.");
  };

  // 2. FUNCIÓN ÚNICA DE SUBIDA A DRIVE CON BASE64 CORREGIDO
  const subirActaADrive = async (uri, fileName, mimeType) => {
    try {
      // Verificar que el archivo existe antes de leerlo
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        console.error("El archivo no existe:", uri);
        return { success: false, message: "El archivo seleccionado no existe." };
      }

      // Verificar tamaño del archivo (límite de 10MB para evitar problemas)
      const fileSizeMB = fileInfo.size / (1024 * 1024);
      if (fileSizeMB > 10) {
        return { success: false, message: "El archivo es demasiado grande. Máximo 10MB." };
      }

      let base64;
      try {
        // Usar el método correcto para Expo FileSystem
        // Para todos los archivos (PDFs e imágenes), usar el mismo método
        base64 = await FileSystem.readAsStringAsync(uri, { 
          encoding: 'base64' 
        });

        // Validar que el base64 no esté vacío
        if (!base64 || base64.trim() === '') {
          throw new Error('El contenido del archivo está vacío');
        }

        // Para PDFs, asegurarse de que el base64 tenga el formato correcto
        if (mimeType === 'application/pdf') {
          // Los PDFs pueden necesitar un prefijo específico
          if (!base64.startsWith('JVBER')) {
            console.log('Advertencia: El base64 no parece ser un PDF válido');
          }
        }

      } catch (readError) {
        console.error("Error leyendo archivo:", readError);
        console.error("URI del archivo:", uri);
        console.error("Tipo MIME:", mimeType);
        
        // Intentar método alternativo sin encoding
        try {
          const content = await FileSystem.readAsStringAsync(uri);
          if (content && content.length > 0) {
            // Convertir a base64 usando Buffer (disponible en React Native)
            base64 = Buffer.from(content, 'binary').toString('base64');
          } else {
            throw new Error('Contenido vacío');
          }
        } catch (altError) {
          console.error("Error en método alternativo:", altError);
          return { success: false, message: "No se pudo leer el contenido del archivo. Formato no compatible." };
        }
      }

      const res = await uploadActaToDrive(base64, fileName, mimeType);
      return res;
      
    } catch (e) {
      console.error("Error en subirActaADrive:", e);
      return { success: false, message: "Error al procesar el archivo del dispositivo." };
    }
  };

  // 3. SELECCIONAR ARCHIVO — guardar referencia local primero; subida a Drive opcional
  const seleccionarArchivoActa = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
        multiple: false
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        return;
      }

      const file = res.assets[0];
      if (!file.uri) {
        Alert.alert("Error", "No se pudo obtener la ruta del archivo.");
        return;
      }

      const isPdf = file.mimeType === 'application/pdf' ||
        file.name?.toLowerCase().endsWith('.pdf') ||
        (file.uri || '').toLowerCase().endsWith('.pdf');
      const extension = isPdf ? 'pdf' : 'jpg';
      const mimeType = isPdf ? 'application/pdf' : 'image/jpeg';
      const nombreFinal = `${generarNombreActa()}.${extension}`;
      const localUri = await saveActaLocally(file.uri, nombreFinal);

      setActa({
        uri: localUri,
        tipo: isPdf ? 'archivo' : 'imagen',
        nombre: nombreFinal,
        mimeType: mimeType
      });

      setLoading(true);
      try {
        const uploadRes = await subirActaADrive(localUri, nombreFinal, mimeType);
        if (uploadRes.success && uploadRes.url) {
          setActa(prev => prev ? { ...prev, driveUrl: uploadRes.url, driveFileId: uploadRes.fileId } : prev);
          Alert.alert("Éxito", `Archivo guardado y subido a Drive.\n\n${nombreFinal}`);
        } else {
          const msg = (uploadRes.message || '').toLowerCase();
          if (msg.includes('no reconocida') || msg.includes('reconocida')) {
            Alert.alert(
              "Archivo guardado",
              "El archivo se ha guardado en el dispositivo. Para subir a la nube, actualiza el Google Apps Script con la acción 'uploadActaToDrive' y vuelve a desplegar."
            );
          } else {
            Alert.alert("Archivo guardado", `El archivo está guardado en el dispositivo.\nNo se pudo subir a Drive: ${uploadRes.message || 'Error desconocido'}`);
          }
        }
      } catch (uploadError) {
        Alert.alert("Archivo guardado", "El archivo se guardó en el dispositivo. No se pudo conectar con Drive. Puedes compartirlo desde aquí.");
      } finally {
        setLoading(false);
      }
    } catch (err) {
      setLoading(false);
      console.error("Error general en selección:", err);
      Alert.alert("Error", "No se pudo procesar la selección de archivo.");
    }
  };

  // 4. TOMAR FOTO DEL ACTA — guardar primero en el dispositivo, subir a Drive opcional
  const tomarFotoActa = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permiso denegado", "Necesitamos acceso a la cámara.");
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (!result.canceled) {
        const originalUri = result.assets[0].uri;
        const newPath = FileSystem.documentDirectory + "acta_" + Date.now() + ".jpg";
        try {
          await FileSystem.copyAsync({ from: originalUri, to: newPath });
        } catch (copyErr) {
          try {
            const base64 = await FileSystem.readAsStringAsync(originalUri, { encoding: FileSystem.EncodingType.Base64 });
            await FileSystem.writeAsStringAsync(newPath, base64, { encoding: FileSystem.EncodingType.Base64 });
          } catch (readErr) {
            Alert.alert("Error", "No se pudo guardar la foto. Prueba de nuevo.");
            return;
          }
        }
        const fileName = `${generarNombreActa()}_foto.jpg`;

        // Guardar acta localmente de inmediato para no bloquear la vuelta de la cámara
        setActa({ uri: newPath, tipo: 'imagen', nombre: fileName, mimeType: 'image/jpeg' });

        // Preguntar si quiere subir a Drive (evita hacer trabajo pesado justo al volver de la cámara)
        Alert.alert(
          "Foto guardada",
          "La foto del acta se ha guardado en el dispositivo. ¿Subir también a Google Drive?",
          [
            { text: "Dejar así", style: "cancel" },
            {
              text: "Subir a Drive",
              onPress: async () => {
                setLoading(true);
                try {
                  const uploadRes = await subirActaADrive(newPath, fileName, 'image/jpeg');
                  if (uploadRes.success && uploadRes.url) {
                    setActa(prev => prev ? { ...prev, driveUrl: uploadRes.url, driveFileId: uploadRes.fileId } : prev);
                    Alert.alert("Éxito", "Foto subida a Google Drive.");
                  } else {
                    Alert.alert("Aviso", `No se pudo subir a Drive:\n${uploadRes.message || "Error desconocido"}`);
                  }
                } catch (e) {
                  Alert.alert("Aviso", "No se pudo subir a Drive. La foto sigue guardada en el dispositivo.");
                } finally {
                  setLoading(false);
                }
              },
            },
          ]
        );
      }
    } catch (err) {
      console.error("Error en cámara:", err);
      Alert.alert("Error", "No se pudo capturar o guardar la foto.");
    }
  };

  const compartirActa = async () => {
    if (!acta) {
      Alert.alert("Aviso", "No hay ningún archivo seleccionado.");
      return;
    }
    // Si tiene URL de Drive, intentar abrir directamente la app de Drive
    if (acta.driveUrl) {
      try {
        await Linking.openURL(acta.driveUrl);
        return; // Salir si logra abrir Drive
      } catch (e) {
        console.log("No se pudo abrir Drive, usando fallback nativo.");
      }
    }

    if (!acta.uri) {
      Alert.alert("Aviso", "No hay archivo local. Se abrirá el enlace de Drive si está disponible.");
      return;
    }

    try {
      const info = await FileSystem.getInfoAsync(acta.uri);
      if (!info?.exists) {
        if (acta.driveUrl) {
          await Linking.openURL(acta.driveUrl);
          return;
        }
        Alert.alert("Aviso", "El archivo local ya no existe y no hay enlace de Drive.");
        return;
      }
    } catch (_) {}

    if (sharingRef.current) return;
    try {
      sharingRef.current = true;
      const disponible = await Sharing.isAvailableAsync();
      if (!disponible) {
        Alert.alert("Error", "La función de compartir no está disponible.");
        return;
      }
      await Sharing.shareAsync(acta.uri, {
        mimeType: acta.tipo === 'archivo' ? 'application/pdf' : 'image/jpeg',
        dialogTitle: 'Exportar Acta de Partido',
      });
    } catch (error) {
      console.error("Error al compartir:", error);
      Alert.alert("Error", "No se pudo abrir el menú de exportación.");
    } finally {
      sharingRef.current = false;
    }
  };

  const handleSave = async () => {
    if (!rival.trim()) return Alert.alert("Error", "Rival obligatorio");
    const data = {
      id: editItem?.id || Date.now().toString(),
      rival, fecha, lugar, tipo,
      golesFavor: parseInt(golesFavor) || 0,
      golesContra: parseInt(golesContra) || 0,
      convocatoria, acta,
      eventosGoles,
      tiemposPorPeriodo
    };
    const nuevos = editItem ? partidos.map(p => p.id === editItem.id ? data : p) : [data, ...partidos];
    try {
      await setPartidos(nuevos);
    } catch (e) {
      Alert.alert("Error", "No se pudo guardar el partido.");
      return;
    }
    onBack();
  };

  const handleGenerateReport = (partidoOrId) => {
    const list = Array.isArray(partidos) ? partidos : [];
    const partido = typeof partidoOrId === 'object' && partidoOrId !== null
      ? partidoOrId
      : list.find(p => String(p?.id) === String(partidoOrId));
    if (!partido) {
      Alert.alert("Error", "Partido no encontrado.");
      return;
    }
    setSelectedPartidoId(partido.id);
    setSelectedPartido(partido);
    const html = buildReportFromPartido(partido, players);
    setReportContent(html);
    setReportModalVisible(true);
    setHistoricoModalVisible(false);
  };

  const reportHtmlStyle = `
    <style>
      body { font-family: sans-serif; padding: 20px; background-color: white; }
      h1 { color: #012E57; text-align: center; font-size: 18px; }
      h2 { color: #012E57; border-bottom: 2px solid #1565C0; padding-bottom: 5px; text-align: center; font-size: 14px; }
      h3 { color: #012E57; font-size: 12px; }
      h4 { color: #012E57; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; table-layout: fixed; font-size: 10px; }
      th, td { border: 1px solid #CCC; padding: 6px; text-align: center; }
      th { background-color: #012E57; color: white; }
      .name-col { text-align: left; font-weight: bold; background-color: #F9F9F9; }
      .page-break { page-break-after: always; }
    </style>
  `;
  const reportHtmlDocument = useMemo(() => {
    if (!reportContent) return '';
    return `<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">${reportHtmlStyle}</head><body>${reportContent}</body></html>`;
  }, [reportContent]);

  const handleExportReportToDrive = async () => {
    if (!reportContent) return;
    if (sharingRef.current) return;
    try {
      sharingRef.current = true;
      const html = reportHtmlDocument || `<html><head><meta charset="UTF-8">${reportHtmlStyle}</head><body>${reportContent}</body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Exportar informe (guardar en Drive, etc.)' });
    } catch (error) {
      Alert.alert("Error", `Error al exportar: ${error.message}`);
    } finally {
      sharingRef.current = false;
    }
  };

  const handlePrintReport = async () => {
    if (!reportContent) return;
    if (sharingRef.current) return;
    try {
      sharingRef.current = true;
      const html = reportHtmlDocument || `<html><head><meta charset="UTF-8">${reportHtmlStyle}</head><body>${reportContent}</body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (error) {
      Alert.alert("Error", `Error al imprimir: ${error.message}`);
    } finally {
      sharingRef.current = false;
    }
  };

  // FUNCIÓN DE SEGURIDAD PARA ICONOS
  const Icono = ({ name, size, color }) => {
    try {
      return <FontAwesome name={name} size={size} color={color} />;
    } catch (e) {
      return <Text style={{ color }}>•</Text>;
    }
  };

  const partidosOrdenados = [...(Array.isArray(partidos) ? partidos : [])].sort((a, b) => parseFecha(b?.fecha) - parseFecha(a?.fecha));
  const driveActasFiltradas = (driveActas || []).filter((f: any) => {
    if (!driveActasQuery.trim()) return true;
    const q = driveActasQuery.trim().toLowerCase();
    return String(f?.name || '').toLowerCase().includes(q);
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
    <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
      <Text style={styles.title}>ACTA DE PARTIDO</Text>

      {editItem && (
        <View style={styles.editModeBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.editModeTitle}>MODO EDICION ACTIVO</Text>
            <Text style={styles.editModeSub} numberOfLines={1}>
              Partido: {editItem?.rival || 'Sin rival'} ({formatDateExport(parseToDate(editItem?.fecha)) || editItem?.fecha || 'sin fecha'})
            </Text>
          </View>
          <TouchableOpacity
            style={styles.editModeExitBtn}
            onPress={() => onClearEdit?.()}
          >
            <Text style={styles.editModeExitTxt}>NUEVO</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Botón para abrir histórico */}
      <TouchableOpacity
        style={styles.btnHistorico}
        onPress={() => setHistoricoModalVisible(true)}
      >
        <Text style={styles.btnHistoricoTxt}>HISTÓRICO DE PARTIDOS</Text>
      </TouchableOpacity>

      {editItem && (
        <>
          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => handleGenerateReport(editItem)}
          >
            <Text style={styles.reportBtnTxt}>GENERAR INFORME DE PARTIDO</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={styles.card}>
        <TextInput style={styles.input} placeholder="Rival" value={rival} onChangeText={setRival} placeholderTextColor="#666" />

        <View style={styles.row}>
          <TextInput style={[styles.input, {flex:1.5}]} value={fecha} onChangeText={setFecha} />
          <TouchableOpacity style={[styles.tab, lugar==='LOCAL' && styles.activeTab]} onPress={()=>setLugar('LOCAL')}><Text style={styles.tabTxt}>LOCAL</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tab, lugar==='VISITANTE' && styles.activeTab]} onPress={()=>setLugar('VISITANTE')}><Text style={styles.tabTxt}>VISIT.</Text></TouchableOpacity>
        </View>

        <Text style={styles.label}>TIPO DE COMPETICIÓN</Text>
        <View style={styles.compFilterBar}>
          {['LIGA', 'COPA', 'AMISTOSO', 'OTRO'].map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.compFilterBtn,
                tipo === t && styles.compFilterBtnActive,
                { borderColor: t === 'LIGA' ? '#00D4FF' : t === 'COPA' ? '#FFD700' : t === 'AMISTOSO' ? '#FF4444' : '#AAA' }
              ]}
              onPress={() => setTipo(t)}
            >
              <Text style={styles.compFilterBtnTxt}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row}>
          <View style={{flex:1}}><Text style={styles.label}>GOLES +</Text><TextInput style={styles.input} keyboardType="numeric" value={golesFavor} onChangeText={setGolesFavor}/></View>
          <View style={{flex:1}}><Text style={styles.label}>GOLES -</Text><TextInput style={styles.input} keyboardType="numeric" value={golesContra} onChangeText={setGolesContra}/></View>
          <TouchableOpacity style={styles.btnImport} onPress={() => setModalVisible(true)}>
            <Text style={styles.btnImportTxt}>IMPORTAR</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.labelComp}>ACTA DEL PARTIDO (imagen o PDF):</Text>
        <View style={styles.actaRow}>
          <TouchableOpacity
            style={[styles.btnActa, acta?.driveUrl && { borderColor: '#00FF00', borderWidth: 1 }]}
            onPress={acta ? compartirActa : seleccionarArchivoActa}
            onLongPress={seleccionarArchivoActa}
          >
            <Icono
              name={acta?.driveUrl ? "check-circle" : "file-pdf-o"}
              size={16}
              color={acta?.driveUrl ? "#00FF00" : "#FFF"}
            />
            <Text style={[styles.btnActaTxt, acta?.driveUrl && { color: '#00FF00' }]}>
              {acta?.driveUrl ? ' ABRIR DRIVE' : ' SELECCIONAR ARCHIVO'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnActa, styles.btnActaDrive]}
            onPress={abrirImportarActaDesdeDrive}
          >
            <Icono name="cloud-download" size={16} color="#FFF" />
            <Text style={styles.btnActaTxt}> IMPORTAR DRIVE</Text>
          </TouchableOpacity>
        </View>

        {acta?.driveUrl && (
          <Text style={{ color: '#2E7D32', fontSize: 10, fontWeight: 'bold', marginTop: 6, textAlign: 'center' }}>
            ✓ Acta vinculada a Google Drive {acta?.driveFileId ? '(con ID)' : ''}
          </Text>
        )}
        
        {acta && (
          <TouchableOpacity onPress={() => setActa(null)}>
            <Text style={{ color: '#C62828', fontSize: 10, textAlign: 'center', marginTop: 12, fontWeight: 'bold' }}>
              ELIMINAR ARCHIVO SELECCIONADO
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* TABLA DE JUGADORES */}
      <View style={styles.headerTable}>
        <Text style={[styles.hLab, {flex: 2}]}>JUGADOR</Text>
        <Text style={[styles.hLab, {flex: 0.6}]}>CAP</Text>
        <Text style={[styles.hLab, {flex: 2.5}]}>ASISTENCIA (AS-AV-NA)</Text>
      </View>

      {convocatoria.map((p, idx) => {
        const basePlayer = players.find((pl: any) => pl.id === p.id);
        let nameStyle = styles.pName;
        if (basePlayer?.estadoFisico === 'Lesionado' || basePlayer?.disponibilidad === 'No disponible') {
          nameStyle = [styles.pName, { color: '#FF6B6B' }] as any;
        } else if (basePlayer?.estadoFisico === 'Cargado' || basePlayer?.disponibilidad === 'Duda') {
          nameStyle = [styles.pName, { color: '#FFD166' }] as any;
        }
        return (
        <View key={p.id} style={styles.pRow}>
          <Text style={nameStyle} numberOfLines={1}>{p.name}</Text>
          <TouchableOpacity
            style={[styles.capBtn, p.esCapitan && styles.capBtnActive]}
            onPress={() => {
              setConvocatoria(prev => prev.map((c, i) => ({ ...c, esCapitan: i === idx })));
            }}
          >
            <Text style={[styles.capBtnTxt, p.esCapitan && styles.capBtnTxtActive]}>{p.esCapitan ? 'C' : '−'}</Text>
          </TouchableOpacity>
          <View style={styles.asistContainer}>
            {['AS','AV','NA'].map(e => (
              <TouchableOpacity key={e} onPress={()=>{
                const nc = [...convocatoria]; nc[idx].estado = e; setConvocatoria(nc);
              }} style={[styles.miniBtn, p.estado===e && styles[`btn${e}`]]}><Text style={styles.miniBtnTxt}>{e}</Text></TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.gInput}
            keyboardType="numeric"
            value={p.goles.toString()}
            onChangeText={(v)=>{
              const nc = [...convocatoria]; nc[idx].goles = parseInt(v) || 0; setConvocatoria(nc);
            }}
          />
          <Text style={styles.pMin}>{formatTiempoJugado(parseMinutosToSeconds(p.minutos))}</Text>
        </View>
      )})}

      <TouchableOpacity style={styles.btnSave} onPress={handleSave}><Text style={styles.btnSaveTxt}>GUARDAR TODO</Text></TouchableOpacity>
      <TouchableOpacity style={[styles.btnCancel, {marginBottom: 50}]} onPress={onBack}><Text style={styles.btnCancelTxt}>CANCELAR</Text></TouchableOpacity>

      {/* MODAL HISTÓRICO DE PARTIDOS */}
      <Modal visible={historicoModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>HISTÓRICO DE PARTIDOS</Text>
            {partidosOrdenados.length === 0 ? (
              <Text style={styles.historicoEmpty}>No hay partidos guardados. Guarda uno en el formulario o importa desde Gestión de datos.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 400, marginVertical: 10 }} showsVerticalScrollIndicator>
                {partidosOrdenados.map((p) => (
                  <View key={p.id} style={styles.historicoRow}>
                    <View style={[styles.historicoRowContent, editItem?.id === p.id && styles.historicoRowSelected]}>
                      <View style={styles.historicoRowLeft}>
                        <Text style={styles.historicoRival} numberOfLines={1}>{p.rival || 'Sin rival'}</Text>
                        <Text style={styles.historicoMeta}>{formatDateExport(parseToDate(p.fecha)) || p.fecha || ''} · {(p.tipo || 'LIGA')} · {p.lugar === 'VISITANTE' ? 'VISIT.' : 'LOCAL'}</Text>
                        <Text style={styles.historicoResultado}>{p.golesFavor ?? 0} - {p.golesContra ?? 0}</Text>
                      </View>
                      <View style={styles.historicoRowActions}>
                        <TouchableOpacity
                          style={styles.historicoBtnEdit}
                          onPress={() => {
                            onSelectPartidoToEdit?.(p);
                            setHistoricoModalVisible(false);
                          }}
                        >
                          <Text style={styles.historicoBtnTxt}>Editar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.historicoBtnReport}
                          onPress={() => handleGenerateReport(p)}
                        >
                          <Text style={styles.historicoBtnTxt}>Informe</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.btnCerrarModal} onPress={() => setHistoricoModalVisible(false)}>
              <Text style={{ color: '#FFF' }}>CERRAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL IMPORTACIÓN */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>SELECCIONAR ACTA DEL CRONO</Text>
            <ScrollView style={{maxHeight: 300, marginVertical: 10}}>
              {listaSesiones.map((s, i) => (
                <TouchableOpacity key={i} style={styles.sesionItem} onPress={() => aplicarTiemposSesion(s)}>
                  <Text style={{color:'#FFF'}}>{s.rival} - {formatDateExport(parseToDate(s.fecha)) || s.fecha}</Text>
                  <Icono name="chevron-right" size={14} color="#00aaff" />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.btnCerrarModal} onPress={() => setModalVisible(false)}><Text style={{color:'#FFF'}}>CERRAR</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL IMPORTAR ACTA DESDE DRIVE */}
      <Modal visible={driveActasModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>IMPORTAR ACTA DESDE DRIVE</Text>
            <TextInput
              style={styles.input}
              placeholder="Buscar por nombre..."
              placeholderTextColor="#8aa3b8"
              value={driveActasQuery}
              onChangeText={setDriveActasQuery}
            />
            {driveActasLoading ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator size="small" color="#00aaff" />
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 300, marginVertical: 10 }} showsVerticalScrollIndicator>
                {driveActasFiltradas.length === 0 ? (
                  <Text style={{ color: '#B0BEC5', fontSize: 11, textAlign: 'center', paddingVertical: 12 }}>
                    No hay actas en Drive o no coinciden con la búsqueda.
                  </Text>
                ) : (
                  driveActasFiltradas.map((f: any, i: number) => (
                    <TouchableOpacity key={f?.id || i} style={styles.sesionItem} onPress={() => vincularActaDrive(f)}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#FFF', fontSize: 11 }} numberOfLines={1}>{f?.name || 'Acta sin nombre'}</Text>
                        <Text style={{ color: '#8FB3C9', fontSize: 9 }}>
                          {f?.mimeType || '-'} {f?.createdTime ? `· ${String(f.createdTime).slice(0, 10)}` : ''}
                        </Text>
                      </View>
                      <Icono name="link" size={14} color="#00aaff" />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.btnCerrarModal, { flex: 1, backgroundColor: '#1565C0' }]} onPress={cargarActasDrive}>
                <Text style={{ color: '#FFF' }}>RECARGAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnCerrarModal, { flex: 1 }]} onPress={() => setDriveActasModalVisible(false)}>
                <Text style={{ color: '#FFF' }}>CERRAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL DE INFORME DE PARTIDO */}
      <Modal visible={reportModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.reportModalContent}>
            <Text style={styles.modalTitle}>INFORME DE PARTIDO</Text>
            {reportHtmlDocument ? (
              <View style={styles.reportWebViewWrap}>
                <WebView
                  originWhitelist={['*']}
                  source={{ html: reportHtmlDocument }}
                  setBuiltInZoomControls
                  setDisplayZoomControls={false}
                  scalesPageToFit
                  showsVerticalScrollIndicator
                  showsHorizontalScrollIndicator
                  style={styles.reportWebView}
                />
              </View>
            ) : (
              <ScrollView 
                style={styles.reportScrollView}
                contentContainerStyle={styles.reportScrollContent}
                showsVerticalScrollIndicator={true}
              >
                <Text style={styles.reportText}>{reportPreview || 'Cargando informe...'}</Text>
              </ScrollView>
            )}
            <View style={styles.reportActions}>
              <TouchableOpacity 
                style={[styles.reportActionBtn, styles.printBtn]} 
                onPress={handlePrintReport}
              >
                <Text style={styles.reportActionBtnTxt}>IMPRIMIR</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.reportActionBtn, styles.driveBtn]} 
                onPress={handleExportReportToDrive}
              >
                <Text style={styles.reportActionBtnTxt}>COMPARTIR / EXPORTAR</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.reportActionBtn, styles.closeBtn]} 
                onPress={() => {
                  setReportModalVisible(false);
                  setReportContent('');
                  setSelectedPartidoId(null);
                }}
              >
                <Text style={styles.reportActionBtnTxt}>CERRAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33', padding: 15 },
  title: { color: '#FFF', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginTop: 30, marginBottom: 15 },
  editModeBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0D2137', borderWidth: 1, borderColor: '#00D4FF', borderRadius: 10, padding: 10, marginBottom: 12 },
  editModeTitle: { color: '#00D4FF', fontSize: 11, fontWeight: 'bold' },
  editModeSub: { color: '#B0BEC5', fontSize: 10, marginTop: 2 },
  editModeExitBtn: { backgroundColor: '#2E7D32', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  editModeExitTxt: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  card: { backgroundColor: '#012E57', padding: 15, borderRadius: 12, marginBottom: 15 },
  input: { backgroundColor: '#001A33', color: '#FFF', padding: 10, borderRadius: 8, marginBottom: 8, fontSize: 13 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  tab: { padding: 10, borderRadius: 8, backgroundColor: '#001A33', borderWidth: 1, borderColor: '#1565C0' },
  activeTab: { backgroundColor: '#1565C0' },
  tabTxt: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  label: { color: '#00aaff', fontSize: 8, fontWeight: 'bold', marginBottom: 2 },
  labelComp: { color: '#00aaff', fontSize: 8, fontWeight: 'bold', marginBottom: 5, marginTop: 10 },
  compFilterBar: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 5, marginBottom: 15, width: '100%' },
  compFilterBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, backgroundColor: '#001A33', alignItems: 'center', justifyContent: 'center' },
  compFilterBtnActive: { backgroundColor: '#1565C0', borderColor: '#FFF' },
  compFilterBtnTxt: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  btnImport: { backgroundColor: '#2E7D32', padding: 12, borderRadius: 8, flex: 1, alignItems: 'center' },
  btnImportTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 10 },
  actaRow: { flexDirection: 'row', gap: 10 },
  btnActa: { flex: 1, flexDirection: 'row', backgroundColor: '#34495E', padding: 10, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  btnActaDrive: { backgroundColor: '#1565C0' },
  btnActaTxt: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  headerTable: { flexDirection: 'row', marginBottom: 5 },
  hLab: { color: '#1565C0', fontSize: 9, fontWeight: 'bold' },
  pRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#012E57', padding: 8, borderRadius: 8, marginBottom: 4 },
  pName: { color: '#FFF', fontSize: 11, flex: 2 },
  capBtn: { width: 28, height: 28, borderRadius: 4, backgroundColor: '#001A33', alignItems: 'center', justifyContent: 'center', flex: 0.6 },
  capBtnActive: { backgroundColor: '#1565C0' },
  capBtnTxt: { color: '#666', fontSize: 12, fontWeight: 'bold' },
  capBtnTxtActive: { color: '#FFF' },
  asistContainer: { flexDirection: 'row', gap: 2, flex: 2.5 },
  miniBtn: { padding: 5, backgroundColor: '#001A33', borderRadius: 4, width: 28, alignItems: 'center' },
  miniBtnTxt: { color: '#FFF', fontSize: 8, fontWeight: 'bold' },
  btnAS: { backgroundColor: '#2E7D32' },
  btnAV: { backgroundColor: '#E65100' },
  btnNA: { backgroundColor: '#C62828' },
  gInput: { backgroundColor: '#001A33', color: '#FFF', width: 30, textAlign: 'center', borderRadius: 4, fontSize: 11, marginLeft: 5 },
  pMin: { color: '#00aaff', fontSize: 10, flex: 1, textAlign: 'right' },
  btnSave: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  btnSaveTxt: { color: '#FFF', fontWeight: 'bold' },
  btnCancel: { backgroundColor: '#C62828', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  btnCancelTxt: { color: '#FFF', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#012E57', width: '90%', borderRadius: 15, padding: 20 },
  modalTitle: { color: '#FFF', fontWeight: 'bold', textAlign: 'center' },
  sesionItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#001A33' },
  btnCerrarModal: { backgroundColor: '#C62828', padding: 10, borderRadius: 8, marginTop: 10, alignItems: 'center' },
  reportBtn: { backgroundColor: '#FF6D00', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
  reportBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 11 },
  reportModalContent: { backgroundColor: '#FFF', width: '95%', maxHeight: '90%', borderRadius: 15, padding: 20 },
  reportWebViewWrap: { flex: 1, minHeight: 380, borderWidth: 1, borderColor: '#D8E2EE', borderRadius: 8, overflow: 'hidden', marginVertical: 10 },
  reportWebView: { flex: 1, backgroundColor: '#FFFFFF' },
  reportScrollView: { flex: 1, maxHeight: '70%', marginVertical: 10 },
  reportScrollContent: { paddingBottom: 20 },
  reportText: { fontSize: 12, color: '#333', lineHeight: 20 },
  reportActions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  reportActionBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', minWidth: 100 },
  printBtn: { backgroundColor: '#1565C0' },
  driveBtn: { backgroundColor: '#2E7D32' },
  closeBtn: { backgroundColor: '#C62828' },
  reportActionBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 10 },
  historicoEmpty: { color: '#B0BEC5', fontSize: 11, fontStyle: 'italic', paddingVertical: 12 },
  btnHistorico: { backgroundColor: '#0D47A1', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 15 },
  btnHistoricoTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  historicoRow: { marginBottom: 8 },
  historicoRowContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#001A33', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#0D47A1' },
  historicoRowSelected: { borderColor: '#00D4FF', backgroundColor: '#0D2137' },
  historicoRowLeft: { flex: 1 },
  historicoRival: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  historicoMeta: { color: '#90A4AE', fontSize: 10, marginTop: 2 },
  historicoResultado: { color: '#00D4FF', fontSize: 11, marginTop: 2, fontWeight: 'bold' },
  historicoRowActions: { flexDirection: 'row', gap: 6 },
  historicoBtnEdit: { backgroundColor: '#1565C0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, justifyContent: 'center' },
  historicoBtnReport: { backgroundColor: '#FF6D00', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, justifyContent: 'center', minWidth: 60, alignItems: 'center' },
  historicoBtnTxt: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  btnNuevoPartido: { backgroundColor: '#2E7D32', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnNuevoPartidoTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 11 }
});