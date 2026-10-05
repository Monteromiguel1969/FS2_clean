import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert, Linking, Modal, ActivityIndicator, useWindowDimensions } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { FontAwesome } from '@expo/vector-icons';
import { formatDateExport, parseToDate, dateToYmd, isValidYmd } from '../utils/dateFormat';
import { useScreenMetrics } from '../utils/useScreenMetrics';
import { YmdDatePickerField } from './YmdDatePickerField';
import { buildReportHeaderHtml, REPORT_BRAND } from '../utils/reportBranding';
import { findRosterEntry, samePerson } from '../utils/playerIdentity';

// --- MEDIDAS ESTRICTAS ---
const ROW_HEIGHT = 50;
const SECTION_SPACER_H = 30;
const RESUMEN_COLUMNS = ['ENT(N)', 'ENT(%)', 'PAR(N)', 'PAR(%)', 'DEDIC.', 'GOLES', 'CAP', 'MINS'];

/** Convierte string "m:ss" o "mm:ss" a total segundos */
const parseMinutosToSeconds = (str) => {
  if (str == null || str === '') return 0;
  const parts = String(str).trim().split(':').map(Number);
  const m = Math.max(0, parts[0] || 0), s = Math.max(0, parts[1] || 0);
  return m * 60 + s;
};

/** Formato de tiempo: mm:ss o hh:mm:ss si total >= 1h. totalSeg = total segundos */
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

const calcDedicacionGlobalPct = (entAsistidos, totalEntrenos, parAsistidos, totalPartidos) => {
  const total = Math.max(0, Number(totalEntrenos || 0)) + Math.max(0, Number(totalPartidos || 0));
  if (total <= 0) return 0;
  const asistidos = Math.max(0, Number(entAsistidos || 0)) + Math.max(0, Number(parAsistidos || 0));
  return Math.round((asistidos / total) * 100);
};

/** Clave yyyy-mm-dd para comparar rangos (misma lógica que parseToDate). */
function dateKeyFromFecha(fecha) {
  const d = parseToDate(fecha);
  if (!d || isNaN(d.getTime())) return null;
  const ymd = dateToYmd(d);
  return ymd || null;
}

function toScore10(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const scaled = n <= 5 ? n * 2 : n;
  return Math.round(scaled * 100) / 100;
}

function latestPersonalEvaluation(evals) {
  const personal = (Array.isArray(evals) ? evals : []).filter(
    (e) => e?.personalForm && typeof e.personalForm === 'object'
  );
  if (!personal.length) return null;
  const sorted = [...personal].sort((a, b) => {
    const ka = dateKeyFromFecha(a?.fecha) || '';
    const kb = dateKeyFromFecha(b?.fecha) || '';
    if (ka !== kb) return ka.localeCompare(kb);
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
  return sorted[sorted.length - 1];
}

function sortEvalsByFecha(evals) {
  return [...(Array.isArray(evals) ? evals : [])].sort((a, b) => {
    const ka = dateKeyFromFecha(a?.fecha) || '';
    const kb = dateKeyFromFecha(b?.fecha) || '';
    if (ka !== kb) return ka.localeCompare(kb);
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

function formatDelta(n) {
  if (n == null || !Number.isFinite(n)) return '-';
  const r = Math.round(n * 100) / 100;
  if (r > 0) return `+${r}`;
  return String(r);
}

function midpointDateKey(desde, hasta) {
  const a = String(desde || '');
  const b = String(hasta || '');
  if (!a || !b) return a || b || '';
  const pa = a.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const pb = b.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!pa || !pb) return a;
  const ta = Date.UTC(+pa[1], +pa[2] - 1, +pa[3]);
  const tb = Date.UTC(+pb[1], +pb[2] - 1, +pb[3]);
  const mid = new Date((ta + tb) / 2);
  const y = mid.getUTCFullYear();
  const m = String(mid.getUTCMonth() + 1).padStart(2, '0');
  const d = String(mid.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function Stats({
  players = [],
  entrenos = [],
  partidos = [],
  onBack,
  onEditSession,
  onDeleteSession,
  onOpenBiblioteca,
  escudoUri = null,
  equipoNombre = '',
  temporadaNombre = '',
}: {
  players?: unknown[];
  entrenos?: unknown[];
  partidos?: unknown[];
  onBack: () => void;
  onEditSession?: (item: unknown, tipo: string) => void;
  onDeleteSession?: (id: string, tipo: string) => void;
  onOpenBiblioteca?: () => void;
  escudoUri?: string | null;
  equipoNombre?: string;
  temporadaNombre?: string;
}) {
  const { width, height } = useWindowDimensions();
  const gridCol = useMemo(() => {
    const s = Math.max(0.52, Math.min(1.22, width / 390));
    const matchColW = Math.round(Math.max(118, Math.min(238, 190 * s)));
    const subColW = matchColW / 4;
    return {
      fixNameW: Math.round(Math.max(80, Math.min(148, 110 * s))),
      entColW: Math.round(Math.max(58, Math.min(108, 90 * s))),
      matchColW,
      globColW: Math.round(Math.max(48, Math.min(92, 75 * s))),
      subColW,
    };
  }, [width]);
  const baseScale = Math.max(0.78, Math.min(1.08, width / 420));
  const compactResumenLabels = width < 520;
  const compactDiLabels = width < 430;
  const compactTabLabels = width < 430;
  const adaptiveTextStyles = useMemo(() => {
    const headerFont = Math.max(7, Math.min(10, 9 * baseScale));
    const headerPadV = Math.max(2, Math.min(5, 4 * baseScale));
    const headerPadH = Math.max(1, Math.min(4, 2 * baseScale));
    const cellFont = Math.max(7.5, Math.min(10, 8.5 * baseScale));
    const cellPadV = Math.max(2, Math.min(5, 4 * baseScale));
    const cellPadH = Math.max(1, Math.min(4, 2 * baseScale));
    const tabFont = Math.max(7, Math.min(9, 8 * baseScale));
    return {
      tableHeader: { fontSize: headerFont, paddingVertical: headerPadV, paddingHorizontal: headerPadH },
      tableCell: { fontSize: cellFont, paddingVertical: cellPadV, paddingHorizontal: cellPadH },
      tabTxt: { fontSize: tabFont },
    };
  }, [baseScale]);
  const screen = useScreenMetrics();
  const partidosList = Array.isArray(partidos) ? partidos : [];
  const [activeTab, setActiveTab] = useState('ENTRENOS');
  const [modalActaVisible, setModalActaVisible] = useState(false);
  const [actaSeleccionada, setActaSeleccionada] = useState(null);
  const [diDetalleId, setDiDetalleId] = useState(null);

  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const activeScroll = useRef(null);
  const sharingRef = useRef(false);

  const listaJugadores = useMemo(() => players.filter(p => p.role === 'Jugador'), [players]);
  const listaStaff = useMemo(() => players.filter(p => p.role === 'Monitor'), [players]);

  const todasLasComps = useMemo(() => {
    const existentes = [...new Set(partidosList.map(p => p.tipo?.toUpperCase() || 'LIGA'))];
    const base = ['LIGA', 'COPA', 'AMISTOSO'];
    return [...new Set([...base, ...existentes])];
  }, [partidosList]);

  // Ordenar por fecha: más antigua primero (izquierda / primera hoja)
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

  const dataDateBounds = useMemo(() => {
    const keys = [];
    (entrenos || []).forEach((e) => {
      const k = dateKeyFromFecha(e?.fecha);
      if (k) keys.push(k);
    });
    (partidosList || []).forEach((p) => {
      const k = dateKeyFromFecha(p?.fecha);
      if (k) keys.push(k);
    });
    keys.sort();
    return { min: keys[0] || null, max: keys[keys.length - 1] || null };
  }, [entrenos, partidosList]);

  const [statsDesdeInput, setStatsDesdeInput] = useState('');
  const [statsHastaInput, setStatsHastaInput] = useState(() => dateToYmd(new Date()));
  const statsRangeInit = useRef(false);
  useEffect(() => {
    if (statsRangeInit.current || !dataDateBounds.min || !dataDateBounds.max) return;
    statsRangeInit.current = true;
    setStatsDesdeInput(dataDateBounds.min);
    setStatsHastaInput(dateToYmd(new Date()));
  }, [dataDateBounds.min, dataDateBounds.max]);

  const rangeDesde = useMemo(() => {
    const v = statsDesdeInput.trim();
    if (v && isValidYmd(v)) return v;
    return dataDateBounds.min || '2000-01-01';
  }, [statsDesdeInput, dataDateBounds.min]);

  const rangeHasta = useMemo(() => {
    const v = statsHastaInput.trim();
    if (v && isValidYmd(v)) return v;
    return dataDateBounds.max || '2099-12-31';
  }, [statsHastaInput, dataDateBounds.max]);

  const entrenosFiltrados = useMemo(() => {
    return (entrenos || []).filter((e) => {
      const k = dateKeyFromFecha(e?.fecha);
      if (!k) return true;
      return k >= rangeDesde && k <= rangeHasta;
    });
  }, [entrenos, rangeDesde, rangeHasta]);

  const partidosFiltrados = useMemo(() => {
    return (partidosList || []).filter((p) => {
      const k = dateKeyFromFecha(p?.fecha);
      if (!k) return true;
      return k >= rangeDesde && k <= rangeHasta;
    });
  }, [partidosList, rangeDesde, rangeHasta]);

  const entrenosOrdenados = useMemo(
    () => [...entrenosFiltrados].sort((a, b) => parseFecha(a.fecha) - parseFecha(b.fecha)),
    [entrenosFiltrados]
  );
  const partidosOrdenados = useMemo(
    () => [...partidosFiltrados].sort((a, b) => parseFecha(a.fecha) - parseFecha(b.fecha)),
    [partidosFiltrados]
  );

  // --- LÓGICA DE COMPARTIR (Cualquier medio) ---
  const compartirArchivoUniversal = async (uri, tipo) => {
    if (!uri) return;
    if (sharingRef.current) return;
    try {
      sharingRef.current = true;
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert("Error", "La función de compartir no está disponible en este dispositivo.");
        return;
      }

      const esPdf = tipo === 'archivo' || uri.toLowerCase().endsWith('.pdf');
      
      // IMPORTANTE: Definimos el mimeType para que no salga solo QuickShare
      await Sharing.shareAsync(uri, {
        mimeType: esPdf ? 'application/pdf' : 'image/jpeg',
        dialogTitle: 'Enviar Acta Oficial',
        UTI: esPdf ? 'com.adobe.pdf' : 'public.image',
      });
    } catch (error) {
      console.log("Error Sharing:", error);
      Alert.alert("Error", "No se pudo abrir el menú de compartir.");
    } finally {
      sharingRef.current = false;
    }
  };

  const abrirActa = async (acta, rival = "") => {
    if (!acta?.uri && !acta?.driveUrl) {
      Alert.alert("Aviso", "Documento No Subido");
      return;
    }
    if (!acta?.uri && acta?.driveUrl) {
      Linking.openURL(acta.driveUrl).catch(() => Alert.alert("Error", "No se pudo abrir el enlace"));
      return;
    }
    // Guardamos el acta seleccionada (imagen o PDF) junto al rival para el encabezado
    setActaSeleccionada({ ...acta, rival });
    // Mostramos el modal de visor de actas, desde donde se puede previsualizar (imagen)
    // o reenviar/compartir (imagen o PDF) con el botón correspondiente.
    setModalActaVisible(true);
  };

  const compartirDesdeVisor = () => {
    if (actaSeleccionada) {
      compartirArchivoUniversal(actaSeleccionada.uri, actaSeleccionada.tipo);
    }
  };

  const statsCalculadas = useMemo(() => {
    const procesarLista = (lista) => lista.map(jug => {
      let global = { ent: 0, par: 0, gol: 0, cap: 0, min: 0 }; // min = total segundos
      global.ent = entrenosFiltrados.filter((e) => findRosterEntry(e.asistencia, jug)?.estado === 'AS').length;

      const porComp = todasLasComps.map(c => {
        let s = { nombre: c, par: 0, gol: 0, cap: 0, min: 0 }; // min = total segundos
        partidosFiltrados.filter(p => (p.tipo?.toUpperCase() || 'LIGA') === c).forEach(p => {
          const reg = findRosterEntry(p.convocatoria, jug);
          if (reg && reg.estado === 'AS') {
            s.par++; global.par++;
            s.gol += parseInt(reg.goles) || 0; global.gol += parseInt(reg.goles) || 0;
            if (reg.esCapitan) { s.cap++; global.cap++; }
            const seg = parseMinutosToSeconds(reg.minutos);
            s.min += seg; global.min += seg;
          }
        });
        return s;
      });
      return { id: jug.id, name: jug.name, global, porComp };
    });

    return {
      jugadores: procesarLista(listaJugadores),
      staff: procesarLista(listaStaff),
      resComp: todasLasComps.map(c => {
        let res = { nombre: c, j: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 };
        partidosFiltrados.filter(p => (p.tipo?.toUpperCase() || 'LIGA') === c).forEach(part => {
          res.j++;
          const gf = parseInt(part.golesFavor) || 0;
          const gc = parseInt(part.golesContra) || 0;
          res.gf += gf; res.gc += gc;
          if (gf > gc) res.g++; else if (gf === gc) res.e++; else res.p++;
        });
        return res;
      }),
      local: partidosFiltrados.filter(p => p.lugar === 'LOCAL').reduce((acc, p) => {
          acc.j++; const gf=parseInt(p.golesFavor)||0, gc=parseInt(p.golesContra)||0;
          acc.gf+=gf; acc.gc+=gc; if(gf>gc)acc.g++; else if(gf===gc)acc.e++; else acc.p++;
          return acc;
      }, {nombre:'LOCAL', j:0, g:0, e:0, p:0, gf:0, gc:0}),
      visita: partidosFiltrados.filter(p => p.lugar === 'VISITANTE').reduce((acc, p) => {
          acc.j++; const gf=parseInt(p.golesFavor)||0, gc=parseInt(p.golesContra)||0;
          acc.gf+=gf; acc.gc+=gc; if(gf>gc)acc.g++; else if(gf===gc)acc.e++; else acc.p++;
          return acc;
      }, {nombre:'VISITANTE', j:0, g:0, e:0, p:0, gf:0, gc:0})
    };
  }, [listaJugadores, listaStaff, entrenosFiltrados, partidosFiltrados, todasLasComps]);

  const rowsValoraciones = useMemo(() => {
    return [...listaJugadores, ...listaStaff].map((j, idx) => {
      const evalsAll = Array.isArray(j?.evaluacionesDI) ? j.evaluacionesDI : [];
      const evals = evalsAll.filter((e) => {
        const fk = dateKeyFromFecha(e?.fecha);
        if (!fk) return true;
        return fk >= rangeDesde && fk <= rangeHasta;
      });
      const sorted = sortEvalsByFecha(evals).filter((e) => {
        const n = Number(e?.score);
        return Number.isFinite(n) && n > 0;
      });
      const diScores = sorted.map((e) => Number(e.score));
      const latestPersonal = latestPersonalEvaluation(evals);
      const personalScore = toScore10(latestPersonal?.score);
      const diProm = diScores.length ? (diScores.reduce((a, b) => a + b, 0) / diScores.length) : null;
      const ultima = sorted.length ? Number(sorted[sorted.length - 1].score) : null;
      const anterior = sorted.length >= 2 ? Number(sorted[sorted.length - 2].score) : null;
      const delta = ultima != null && anterior != null ? Math.round((ultima - anterior) * 100) / 100 : null;
      const serie = sorted.slice(-5).map((e) => {
        const s = Math.round(Number(e.score) * 100) / 100;
        return `${s}`;
      });
      return {
        id: j?.id || `sin-id-${idx}`,
        nombre: j?.name || '-',
        rol: j?.role || '-',
        valoracionIA: Number.isFinite(Number(j?.valoracionIA)) ? Number(j?.valoracionIA) : null,
        diGlobal: diProm == null ? null : Math.round(diProm * 100) / 100,
        personal: personalScore,
        fechaPersonal: latestPersonal?.fecha || '',
        ultima: ultima == null ? null : Math.round(ultima * 100) / 100,
        anterior: anterior == null ? null : Math.round(anterior * 100) / 100,
        delta,
        nEvals: sorted.length,
        serieTxt: serie.length ? serie.join(' → ') : '-',
        fechaUltima: sorted.length ? String(sorted[sorted.length - 1]?.fecha || '') : '',
      };
    });
  }, [listaJugadores, listaStaff, rangeDesde, rangeHasta]);

  /** Compara 1ª mitad vs 2ª mitad del periodo (goles, mins, % entreno). */
  const rowsEvolucionRendimiento = useMemo(() => {
    const mid = midpointDateKey(rangeDesde, rangeHasta);
    const ent1 = (entrenosFiltrados || []).filter((e) => (dateKeyFromFecha(e?.fecha) || '') <= mid);
    const ent2 = (entrenosFiltrados || []).filter((e) => (dateKeyFromFecha(e?.fecha) || '') > mid);
    const par1 = (partidosFiltrados || []).filter((p) => (dateKeyFromFecha(p?.fecha) || '') <= mid);
    const par2 = (partidosFiltrados || []).filter((p) => (dateKeyFromFecha(p?.fecha) || '') > mid);

    const metrics = (jug, ents, parts) => {
      const ent = ents.filter((e) => findRosterEntry(e.asistencia, jug)?.estado === 'AS').length;
      let gol = 0;
      let min = 0;
      let par = 0;
      parts.forEach((p) => {
        const reg = findRosterEntry(p.convocatoria, jug);
        if (reg && reg.estado === 'AS') {
          par++;
          gol += parseInt(reg.goles, 10) || 0;
          min += parseMinutosToSeconds(reg.minutos);
        }
      });
      const entPct = ents.length > 0 ? Math.round((ent / ents.length) * 100) : null;
      return { gol, min, entPct };
    };

    return listaJugadores.map((j, idx) => {
      const a = metrics(j, ent1, par1);
      const b = metrics(j, ent2, par2);
      const dGol = b.gol - a.gol;
      const dMin = b.min - a.min;
      const dEnt = a.entPct == null || b.entPct == null ? null : b.entPct - a.entPct;
      return {
        id: j?.id || `evo-${idx}`,
        nombre: j?.name || '-',
        dGol,
        dMin,
        dEnt,
        a,
        b,
      };
    });
  }, [listaJugadores, entrenosFiltrados, partidosFiltrados, rangeDesde, rangeHasta]);

  const htmlStyle = `
    <style>
      body { font-family: sans-serif; padding: 20px; background-color: white; }
      h1 { color: ${REPORT_BRAND.navy}; text-align: center; font-size: 18px; }
      h2 { color: ${REPORT_BRAND.navy}; border-bottom: 2px solid ${REPORT_BRAND.blue}; padding-bottom: 5px; text-align: center; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; table-layout: fixed; font-size: 10px; }
      th, td { border: 1px solid #CCC; padding: 6px; text-align: center; }
      th { background-color: ${REPORT_BRAND.navy}; color: white; }
      .name-col { text-align: left; font-weight: bold; background-color: #F9F9F9; }
      .name-col-entrenos { text-align: left; font-weight: bold; background-color: #F9F9F9; min-width: 180px; white-space: nowrap; }
      table.table-entrenos { table-layout: auto; }
      .sum-row { font-weight: bold; background-color: #E3F2FD; }
      .page-break { page-break-after: always; }
    </style>
  `;

  const handleExport = async () => {
    if (sharingRef.current) return;
    if (rangeDesde > rangeHasta) {
      Alert.alert('Fechas', 'La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }
    try {
      sharingRef.current = true;
      let content = '';
      const fmtRango = (ymd) => {
        const d = parseToDate(ymd);
        return (d && formatDateExport(d)) || String(ymd || '');
      };
      const periodoHtml = `<p style="font-size:10px;color:#555;text-align:center;margin:0 0 10px;">Periodo del informe: ${fmtRango(rangeDesde)} – ${fmtRango(rangeHasta)}</p>`;
      const headerBase =
        buildReportHeaderHtml({
          title: 'ESTADÍSTICAS DEL EQUIPO',
          escudoUri,
          equipo: equipoNombre,
          temporada: temporadaNombre,
        }) + periodoHtml;

      if (activeTab === 'ENTRENOS') {
        // Exportación pestaña ENTRENOS: primera columna nombre completo (ancha, una línea); 10 columnas de sesiones por página
        if (entrenosOrdenados.length === 0) {
          content =
            (entrenos || []).length === 0
              ? `<div>${headerBase}<p>No hay entrenos registrados.</p></div>`
              : `<div>${headerBase}<p>No hay entrenos en el periodo seleccionado.</p></div>`;
        } else {
          const SESSION_COLS = 10;
          const nominal = (p) => (p.nominal && String(p.nominal).trim()) || (p.name || '-');
          const fechaDdMmAa = (s) => (s ? (formatDateExport(parseToDate(s)) || s) : '');
          const chunks = [];
          // Resumen temático: contar objetivos tácticos si existen
          const objetivosMap: Record<string, number> = {};
          entrenosOrdenados.forEach((e) => {
            const raw = (e.objetivos || '').toString();
            raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((o) => {
              objetivosMap[o] = (objetivosMap[o] || 0) + 1;
            });
          });
          let resumenObjetivos = '';
          const clavesObj = Object.keys(objetivosMap);
          if (clavesObj.length) {
            const lista = clavesObj
              .sort((a, b) => (objetivosMap[b] - objetivosMap[a]))
              .map((k) => `${k} (${objetivosMap[k]})`)
              .join(' · ');
            resumenObjetivos = `<p style="font-size:10px;color:#555;margin-top:4px;"><strong>Objetivos tácticos trabajados:</strong> ${lista}</p>`;
          }
          for (let i = 0; i < entrenosOrdenados.length; i += SESSION_COLS) {
            const chunk = entrenosOrdenados.slice(i, i + SESSION_COLS);
            const headerCols = chunk.map(e => `<th>${fechaDdMmAa(e.fecha)}</th>`).join('');
            const numCols = 1 + chunk.length;
            const rowJug = listaJugadores.map(p => {
              const celdas = chunk.map(e => {
                const st = findRosterEntry(e.asistencia, p);
                return `<td>${st?.estado || '-'}</td>`;
              }).join('');
              return `<tr><td class="name-col-entrenos">${nominal(p)}</td>${celdas}</tr>`;
            }).join('');
            const rowStaff = listaStaff.map(p => {
              const celdas = chunk.map(e => {
                const st = findRosterEntry(e.asistencia, p);
                return `<td>${st?.estado || '-'}</td>`;
              }).join('');
              return `<tr><td class="name-col-entrenos">${nominal(p)}</td>${celdas}</tr>`;
            }).join('');
            const sep = (txt) => `<tr><td colspan="${numCols}" style="background:#012E57;color:#00aaff;font-weight:bold;padding:6px;">${txt}</td></tr>`;
            const tableHtml = `<table class="table-entrenos"><thead><tr><th class="name-col-entrenos">Nominal</th>${headerCols}</tr></thead><tbody>${sep('JUGADORES')}${rowJug}${listaStaff.length ? sep('STAFF') : ''}${rowStaff}</tbody></table>`;
            chunks.push(tableHtml);
          }
            const intro = headerBase + '<h2>Asistencia a entrenamientos</h2><p style="font-size:10px;color:#666;">Sesiones ordenadas de más antigua (izquierda) a más reciente (derecha). Salto de página cada 10 sesiones.</p>' + resumenObjetivos;
            const blocks = chunks
              .map((html, idx) => {
                const block = idx === 0 ? `<div>${intro}${html}</div>` : `<div>${html}</div>`;
                const brk = idx < chunks.length - 1 ? '<div class="page-break"></div>' : '';
                return block + brk;
              })
              .join('');
            content = `<div>${blocks}</div>`;
        }
      }

      else if (activeTab === 'PARTIDOS') {
        // Exportación pestaña PARTIDOS: cada partido con convocatoria, tiempos por periodo y detalle de goles (si vienen del crono)
        const formatMinSeg = (min, seg) => {
          if (min == null && seg == null) return '-';
          const m = Math.max(0, min ?? 0);
          const s = Math.max(0, Math.min(59, seg ?? 0));
          return `${m}:${s < 10 ? '0' : ''}${s}`;
        };
        const tipoLabel = (t) => (t === 'CONTRA' ? 'C' : t === 'FAVOR' ? 'F' : t);
        const formatTime = (totalSec) => formatTiempoJugado(totalSec ?? 0);

        content = partidosOrdenados.map((pa, i) => {
          const rows = (pa.convocatoria || []).map(reg => {
            const jug = [...listaJugadores, ...listaStaff].find((p) => samePerson(reg, p));
            const nombre = (jug && ((jug.nominal && String(jug.nominal).trim()) || jug.name)) || reg.name || '-';
            return `<tr><td class="name-col">${nombre}</td><td>${reg.estado || '-'}</td><td>${reg.esCapitan ? 'Sí' : '-'}</td><td>${reg.goles ?? 0}</td><td>${formatTiempoJugado(parseMinutosToSeconds(reg.minutos))}</td></tr>`;
          }).join('');

          const tiempos = pa.tiemposPorPeriodo || {};
          const totalPeriodos = (() => {
            const first = Object.values(tiempos)[0];
            return Array.isArray(first) ? first.length : 0;
          })();
          let pagina2 = '';
          if (totalPeriodos > 0 && Object.keys(tiempos).length > 0) {
            const convIds = (pa.convocatoria || []).map(c => c.id);
            const headerPeriodos = Array.from({ length: totalPeriodos }, (_, j) => `<th>P${j + 1}</th>`).join('');
            const filasTiempos = convIds.map(id => {
              const jug = [...listaJugadores, ...listaStaff].find((p) => samePerson({ id }, p));
              const nombre = (jug && ((jug.nominal && String(jug.nominal).trim()) || jug.name)) || '-';
              const segs = tiempos[id] || [];
              const celdas = Array.from({ length: totalPeriodos }, (_, j) => `<td>${formatTime(segs[j])}</td>`).join('');
              const total = segs.reduce((a, b) => a + (b || 0), 0);
              return `<tr><td class="name-col">${nombre}</td>${celdas}<td><b>${formatTime(total)}</b></td></tr>`;
            }).join('');
            pagina2 = `<h3>Informe de cronómetro (tiempos y goles)</h3><h4>Tiempos de juego (importados del cronómetro)</h4><table><thead><tr><th class="name-col">Jugador</th>${headerPeriodos}<th>Total</th></tr></thead><tbody>${filasTiempos}</tbody></table>`;
          } else {
            pagina2 = '<h3>Informe de cronómetro (tiempos y goles)</h3><p style="font-style:italic;color:#666;">No disponible.</p>';
          }

          const eventos = pa.eventosGoles || [];
          let pagina3 = '';
          if (eventos.length > 0) {
            const filasGoles = eventos.map(ev => {
              const tiempo = formatMinSeg(ev.minuto, ev.segundo);
              const tipo = tipoLabel(ev.tipo);
              return `<tr><td class="name-col">${ev.autor || '-'}</td><td>${tiempo}</td><td>${tipo}</td><td>${ev.quintetoEnPista || '-'}</td></tr>`;
            }).join('');
            pagina3 = `<h3>Detalle de goles (importados del cronómetro)</h3><table><thead><tr><th class="name-col">Autor del gol</th><th>Tiempo (m:ss)</th><th>Tipo</th><th>Quinteto en pista</th></tr></thead><tbody>${filasGoles}</tbody></table>`;
          } else {
            pagina3 = '<h3>Detalle de goles (importados del cronómetro)</h3><p style="font-style:italic;color:#666;">No disponible.</p>';
          }

          const fechaPartido = (pa.fecha ? formatDateExport(parseToDate(pa.fecha)) : null) || pa.fecha || '';
          const pageBreakBetweenPartidos = i < partidosOrdenados.length - 1 ? '<div class="page-break"></div>' : '';
          return `
            <div class="pagina-informe">
              <div>${headerBase}<h2>Partido: ${pa.tipo || 'LIGA'} – ${pa.rival || 'Rival'}</h2><p><strong>Fecha:</strong> ${fechaPartido} &nbsp; <strong>Resultado:</strong> ${pa.golesFavor ?? 0} - ${pa.golesContra ?? 0} &nbsp; <strong>Lugar:</strong> ${pa.lugar || '-'}</p><h3>Convocatoria</h3><table><thead><tr><th class="name-col">Jugador</th><th>Asist.</th><th>Cap.</th><th>Goles</th><th>Minutos</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Sin convocatoria</td></tr>'}</tbody></table>
              </div>
              <div class="page-break"></div>
              <div>${pagina2}</div>
              <div class="page-break"></div>
              <div>${pagina3}</div>
            </div>${pageBreakBetweenPartidos}`;
        }).join('');
        if (!content && partidosFiltrados.length === 0) {
          content =
            partidosList.length === 0
              ? `<div>${headerBase}<p>No hay partidos registrados.</p></div>`
              : `<div>${headerBase}<p>No hay partidos en el periodo seleccionado.</p></div>`;
        }
      }

      else if (activeTab === 'RESUMEN') {
        // Exportación pestaña RESUMEN: incluye Dedicación global = (Ent + Par) / (Total Ent + Total Par)
        const rows = [...statsCalculadas.jugadores, ...statsCalculadas.staff].map((s, idx) => {
          const j = [...listaJugadores, ...listaStaff][idx];
          const entN = `${s.global.ent}/${entrenosFiltrados.length}`;
          const entP = entrenosFiltrados.length > 0 ? Math.round((s.global.ent / entrenosFiltrados.length) * 100) + '%' : '0%';
          const parN = `${s.global.par}/${partidosFiltrados.length}`;
          const parP = partidosFiltrados.length > 0 ? Math.round((s.global.par / partidosFiltrados.length) * 100) + '%' : '0%';
          const dedP = calcDedicacionGlobalPct(s.global.ent, entrenosFiltrados.length, s.global.par, partidosFiltrados.length) + '%';
          const goles = j?.role === 'Jugador' ? s.global.gol : '-';
          const cap = j?.role === 'Jugador' ? s.global.cap : '-';
          const mins = j?.role === 'Jugador' ? formatTiempoJugado(s.global.min) : '-';
          return `<tr><td class="name-col">${j?.name || '-'}</td><td>${entN}</td><td>${entP}</td><td>${parN}</td><td>${parP}</td><td>${dedP}</td><td>${goles}</td><td>${cap}</td><td>${mins}</td></tr>`;
        }).join('');
        content = `
          <div>
            ${headerBase}
            <h2>Resumen – Asistencia y rendimiento</h2>
            <table><thead><tr><th class="name-col">Nombre</th><th>Ent (N)</th><th>Ent %</th><th>Par (N)</th><th>Par %</th><th>Dedicación global</th><th>Goles</th><th>Cap</th><th>Min</th></tr></thead><tbody>${rows}</tbody></table>
          </div>`;
      }

      else if (activeTab === 'DI') {
        const rows = rowsValoraciones
          .map((r) => `<tr><td class="name-col">${r.nombre}</td><td>${r.rol}</td><td>${r.valoracionIA == null ? '-' : r.valoracionIA}</td><td>${r.diGlobal == null ? '-' : r.diGlobal}</td><td>${r.ultima == null ? '-' : r.ultima}</td><td>${r.anterior == null ? '-' : r.anterior}</td><td>${formatDelta(r.delta)}</td><td>${r.nEvals || 0}</td><td>${r.serieTxt || '-'}</td></tr>`)
          .join('');
        const evoRows = rowsEvolucionRendimiento
          .map((r) => `<tr><td class="name-col">${r.nombre}</td><td>${formatDelta(r.dGol)}</td><td>${formatDelta(r.dEnt)}${r.dEnt == null ? '' : ' pp'}</td><td>${r.dMin === 0 ? '0' : (r.dMin > 0 ? '+' : '') + formatTiempoJugado(Math.abs(r.dMin))}${r.dMin < 0 ? ' (↓)' : r.dMin > 0 ? ' (↑)' : ''}</td></tr>`)
          .join('');
        content = `
          <div>
            ${headerBase}
            <h2>Valoraciones D.I. – evolución</h2>
            <table><thead><tr><th class="name-col">Nombre</th><th>Rol</th><th>IA</th><th>DI media</th><th>Última</th><th>Anterior</th><th>Δ</th><th>N</th><th>Serie</th></tr></thead><tbody>${rows || '<tr><td colspan="9">Sin datos</td></tr>'}</tbody></table>
            <h2>Rendimiento 1ª vs 2ª mitad del periodo</h2>
            <table><thead><tr><th class="name-col">Nombre</th><th>Δ Goles</th><th>Δ Ent %</th><th>Δ Minutos</th></tr></thead><tbody>${evoRows || '<tr><td colspan="4">Sin datos</td></tr>'}</tbody></table>
          </div>`;
      }

      else if (activeTab === 'COMPETICION') {
        // Exportación pestaña FINAL/COMPETICIÓN: mismas tablas y columnas que la pantalla
        const jugExp = statsCalculadas?.jugadores || [];
        if (!statsCalculadas?.resComp?.length || !statsCalculadas?.local || !statsCalculadas?.visita || jugExp.length === 0) {
          content = `<div>${headerBase}<p>Sin datos suficientes para exportar el informe Final/Competición (se necesita al menos un jugador en plantilla).</p></div>`;
        } else {
          const sheets = [];
          const resCompMap = {};
          statsCalculadas.resComp.forEach(c => { resCompMap[c.nombre] = c; });
          const safeRes = (c) => resCompMap[c] || { j: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 };

          // 1. Balance por competición (igual que pantalla: columnas PJ, PG, PE, PP, GF, GC, DIF; orden todasLasComps)
          const filasComp = todasLasComps.map(c => {
            const r = safeRes(c);
            return `<tr><td class="name-col">${c}</td><td>${r.j}</td><td>${r.g}</td><td>${r.e}</td><td>${r.p}</td><td>${r.gf}</td><td>${r.gc}</td><td>${r.gf - r.gc}</td></tr>`;
          }).join('');
          const totalJ = todasLasComps.map(c => safeRes(c).j).reduce((a, b) => a + b, 0);
          const totalG = todasLasComps.map(c => safeRes(c).g).reduce((a, b) => a + b, 0);
          const totalE = todasLasComps.map(c => safeRes(c).e).reduce((a, b) => a + b, 0);
          const totalP = todasLasComps.map(c => safeRes(c).p).reduce((a, b) => a + b, 0);
          const totalGF = todasLasComps.map(c => safeRes(c).gf).reduce((a, b) => a + b, 0);
          const totalGC = todasLasComps.map(c => safeRes(c).gc).reduce((a, b) => a + b, 0);
          const totalDIF = todasLasComps.map(c => safeRes(c).gf - safeRes(c).gc).reduce((a, b) => a + b, 0);
          sheets.push(`
          <div>
            ${headerBase}
            <h2>1. Rendimiento del Equipo – General y por Competición</h2>
            <table><thead><tr><th class="name-col">Competición</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DIF</th></tr></thead>
            <tbody>${filasComp}
            <tr class="sum-row"><td class="name-col">TOTAL</td><td>${totalJ}</td><td>${totalG}</td><td>${totalE}</td><td>${totalP}</td><td>${totalGF}</td><td>${totalGC}</td><td>${totalDIF}</td></tr></tbody></table>
          </div>`);

          // 2. Local / Visitante (igual que pantalla: DIF en lugar de Ptos; etiquetas Local, Visitante)
          const loc = statsCalculadas.local;
          const vis = statsCalculadas.visita;
          sheets.push(`
          <div class="page-break">
            ${headerBase}
            <h2>2. Rendimiento Local / Visitante</h2>
            <table><thead><tr><th class="name-col">Lugar</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DIF</th></tr></thead>
            <tbody>
              <tr><td class="name-col">Local</td><td>${loc.j}</td><td>${loc.g}</td><td>${loc.e}</td><td>${loc.p}</td><td>${loc.gf}</td><td>${loc.gc}</td><td>${loc.gf - loc.gc}</td></tr>
              <tr><td class="name-col">Visitante</td><td>${vis.j}</td><td>${vis.g}</td><td>${vis.e}</td><td>${vis.p}</td><td>${vis.gf}</td><td>${vis.gc}</td><td>${vis.gf - vis.gc}</td></tr>
            </tbody></table>
          </div>`);

          // 3. Pichichis – tabla completa (Jugador, Total, por competición)
          sheets.push(`
          <div class="page-break">
            ${headerBase}
            <h2>3. Pichichis – General y por competición</h2>
            <table><thead><tr><th class="name-col">Jugador</th><th>Total</th>${todasLasComps.map(c => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>${statsCalculadas.jugadores.map(j => `<tr><td class="name-col">${j.name}</td><td>${j.global?.gol ?? 0}</td>${todasLasComps.map(c => `<td>${(j.porComp || []).find(pc => pc.nombre === c)?.gol ?? 0}</td>`).join('')}</tr>`).join('')}</tbody></table>
          </div>`);
          // 3b. Máximos Goleadores – Resumen: una fila por competición (máx goleador), última fila = General (como en pantalla visual)
          const pichichiRows: Array<{ tipo: string; jugador: string; goles: number }> = [];
          todasLasComps.forEach(c => {
            const maxComp = statsCalculadas.jugadores.reduce((a, b) => {
              const ga = (a.porComp || []).find(pc => pc.nombre === c)?.gol ?? 0;
              const gb = (b.porComp || []).find(pc => pc.nombre === c)?.gol ?? 0;
              return ga >= gb ? a : b;
            });
            const golesComp = (maxComp?.porComp || []).find(pc => pc.nombre === c)?.gol ?? 0;
            if (maxComp && golesComp > 0) {
              pichichiRows.push({ tipo: c, jugador: maxComp.name, goles: golesComp });
            }
          });
          const maxGeneral = statsCalculadas.jugadores.reduce((a, b) => (a.global?.gol || 0) >= (b.global?.gol || 0) ? a : b);
          if (maxGeneral && (maxGeneral.global?.gol ?? 0) > 0) {
            pichichiRows.push({ tipo: 'General', jugador: maxGeneral.name, goles: maxGeneral.global?.gol ?? 0 });
          }
          const pichichiTableRows = pichichiRows.length > 0
            ? pichichiRows.map(r => `<tr><td class="name-col">${r.tipo}</td><td>${r.jugador}</td><td>${r.goles}</td></tr>`).join('')
            : '<tr><td class="name-col">-</td><td>Sin goles registrados</td><td>0</td></tr>';
          sheets.push(`
          <div class="page-break">
            ${headerBase}
            <h2>3b. Máximos Goleadores – Resumen</h2>
            <p style="font-size:10px;color:#888;">Máximo goleador por competición; última fila: Máximo goleador general.</p>
            <table><thead><tr><th class="name-col">Competición</th><th>Jugador</th><th>Goles</th></tr></thead><tbody>${pichichiTableRows}</tbody></table>
          </div>`);

          // 4. Rendimiento individual – General (mismas columnas que pantalla; accesos seguros)
          sheets.push(`
          <div class="page-break">
            ${headerBase}
            <h2>4. Rendimiento individual – General</h2>
            <table><thead><tr><th class="name-col">Jugador</th><th>Entrenos</th><th>Partidos</th><th>Goles</th><th>Cap.</th><th>Tiempo</th></tr></thead>
            <tbody>${statsCalculadas.jugadores.map(j => `<tr><td class="name-col">${j.name}</td><td>${j.global?.ent ?? 0}/${entrenosFiltrados.length}</td><td>${j.global?.par ?? 0}/${partidosFiltrados.length}</td><td>${j.global?.gol ?? 0}</td><td>${j.global?.cap ?? 0}</td><td>${formatTiempoJugado(j.global?.min ?? 0)}</td></tr>`).join('')}</tbody></table>
          </div>`);

          // 5. Rendimiento individual por competición (igual que pantalla)
            todasLasComps.forEach(c => {
            const partidosComp = partidosFiltrados.filter(p => (p.tipo?.toUpperCase() || 'LIGA') === c).length;
            sheets.push(`
          <div class="page-break">
            ${headerBase}
            <h2>5. Rendimiento individual – ${c}</h2>
            <table><thead><tr><th class="name-col">Jugador</th><th>Entrenos</th><th>Partidos (${c})</th><th>Goles</th><th>Cap.</th><th>Tiempo</th></tr></thead>
            <tbody>${statsCalculadas.jugadores.map(j => {
              const pc = (j.porComp || []).find(pc => pc.nombre === c);
              return `<tr><td class="name-col">${j.name}</td><td>${j.global?.ent ?? 0}/${entrenosFiltrados.length}</td><td>${pc?.par ?? 0}/${partidosComp}</td><td>${pc?.gol ?? 0}</td><td>${pc?.cap ?? 0}</td><td>${formatTiempoJugado(pc?.min ?? 0)}</td></tr>`;
            }).join('')}</tbody></table>
          </div>`);
          });

          content = sheets.join('');
        }
      }

      if (!String(content || '').trim()) {
        Alert.alert('Exportar', 'No hay contenido para generar el PDF en esta pestaña.');
        return;
      }

      const html = `<html><head>${htmlStyle}</head><body>${content}</body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } catch (e) {
      Alert.alert("Error", "No se pudo generar el PDF.");
    } finally {
      sharingRef.current = false;
    }
  };

  const renderFilaDatos = (p, idx, isStaff) => (
    <View key={p.id} style={[styles.dataRow, { height: ROW_HEIGHT }]}>
      {activeTab === 'ENTRENOS' && entrenosOrdenados.map(e => {
        const st = findRosterEntry(e.asistencia, p);
        const color = st?.estado === 'AS' ? '#2E7D32' : st?.estado === 'AV' ? '#E65100' : st?.estado === 'NA' ? '#B71C1C' : '#333';
        return (
          <View key={e.id} style={[styles.cell, { width: gridCol.entColW }]}>
            <View style={[styles.badge, {backgroundColor: color}]}><Text style={styles.badgeTxt}>{st?.estado || '-'}</Text></View>
          </View>
        );
      })}

      {activeTab === 'PARTIDOS' && partidosOrdenados.map(pa => {
        const c = findRosterEntry(pa.convocatoria, p);
        const getAsistColor = (estado) => {
          if (estado === 'AS') return '#2E7D32';
          if (estado === 'AV') return '#E65100';
          if (estado === 'NA') return '#C62828';
          return '#555';
        };

        return (
          <View key={pa.id} style={{ flexDirection: 'row', width: gridCol.matchColW, borderLeftWidth: 1, borderColor: '#012E57' }}>
            <View style={[styles.subCol, { width: gridCol.subColW }]}>
              <TouchableOpacity 
                onPress={() => abrirActa(pa.acta, pa.rival)}
                style={[styles.miniBadge, { backgroundColor: getAsistColor(c?.estado) }]}
              >
                <Text style={styles.subColTxt}>{c?.estado || '-'}</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.subCol, { width: gridCol.subColW }]}><Text style={[styles.subColTxt, c?.esCapitan && { color: '#FFD700', fontWeight: 'bold' }]}>{c?.esCapitan ? 'C' : '-'}</Text></View>
            <View style={[styles.subCol, { width: gridCol.subColW }]}><Text style={[styles.subColTxt, (c?.goles > 0) && { color: '#00FF00', fontWeight: 'bold' }]}>{c?.goles || 0}</Text></View>
            <View style={[styles.subCol, { width: gridCol.subColW }]}><Text style={[styles.subColTxt, { fontSize: 9, color: '#AAA' }]}>{formatTiempoJugado(parseMinutosToSeconds(c?.minutos))}</Text></View>
          </View>
        );
      })}

      {activeTab === 'RESUMEN' && RESUMEN_COLUMNS.map(h => {
        const s = isStaff ? statsCalculadas.staff[idx] : statsCalculadas.jugadores[idx];
        if (!s || !s.global) return <View key={h} style={[styles.cell, {width: gridCol.globColW}]}><Text style={styles.globC}>-</Text></View>;
        let val = "-"; let color = "#FFF";
        if (h === 'ENT(N)') val = `${s.global.ent}/${entrenosFiltrados.length}`;
        if (h === 'ENT(%)') { val = entrenosFiltrados.length > 0 ? Math.round((s.global.ent/entrenosFiltrados.length)*100)+'%' : '0%'; color='#00D4FF'; }
        if (h === 'PAR(N)') val = `${s.global.par}/${partidosFiltrados.length}`;
        if (h === 'PAR(%)') { val = partidosFiltrados.length > 0 ? Math.round((s.global.par/partidosFiltrados.length)*100)+'%' : '0%'; color='#00D4FF'; }
        if (h === 'DEDIC.') { val = calcDedicacionGlobalPct(s.global.ent, entrenosFiltrados.length, s.global.par, partidosFiltrados.length) + '%'; color = '#4DD0E1'; }
        if (h === 'GOLES') val = !isStaff ? (s.global.gol || 0) : '-';
        if (h === 'CAP') val = !isStaff ? (s.global.cap || 0) : '-';
        if (h === 'MINS') { val = !isStaff ? formatTiempoJugado(s.global.min) : '-'; color='#FFD700'; }
        return <View key={h} style={[styles.cell, {width: gridCol.globColW}]}><Text style={[styles.globC, {color}]}>{val}</Text></View>
      })}
    </View>
  );

  const renderTabResumen = () => (
    <ScrollView style={{ flex: 1, padding: 15 }} contentContainerStyle={{ paddingBottom: 100 }} pinchGestureEnabled minimumZoomScale={1} maximumZoomScale={4}>
      <Text style={styles.sectionTitle}>Resumen – Asistencia y rendimiento</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          {(compactResumenLabels
            ? ['Nom', 'E(N)', 'E%', 'P(N)', 'P%', 'Ded.', 'Gol', 'Cap', 'Min']
            : ['Nombre', 'Ent (N)', 'Ent %', 'Par (N)', 'Par %', 'Dedic.', 'Goles', 'Cap', 'Min']
          ).map(h => (
            <Text key={h} style={[styles.tableHeaderCell, adaptiveTextStyles.tableHeader]} numberOfLines={1}>{h}</Text>
          ))}
        </View>
        {[...listaJugadores, ...listaStaff].map((j, idx) => {
          const s = idx < listaJugadores.length 
            ? statsCalculadas.jugadores[idx] 
            : statsCalculadas.staff[idx - listaJugadores.length];
          if (!s?.global) return null;
          const entN = `${s.global.ent}/${entrenosFiltrados.length}`;
          const entP = entrenosFiltrados.length > 0 ? Math.round((s.global.ent / entrenosFiltrados.length) * 100) + '%' : '0%';
          const parN = `${s.global.par}/${partidosFiltrados.length}`;
          const parP = partidosFiltrados.length > 0 ? Math.round((s.global.par / partidosFiltrados.length) * 100) + '%' : '0%';
          const dedicacion = calcDedicacionGlobalPct(s.global.ent, entrenosFiltrados.length, s.global.par, partidosFiltrados.length) + '%';
          const goles = j?.role === 'Jugador' ? s.global.gol : '-';
          const cap = j?.role === 'Jugador' ? s.global.cap : '-';
          const mins = j?.role === 'Jugador' ? formatTiempoJugado(s.global.min) : '-';
          return (
            <View key={j?.id || idx} style={styles.tableRow}>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{j?.name || '-'}</Text>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{entN}</Text>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{entP}</Text>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{parN}</Text>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{parP}</Text>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{dedicacion}</Text>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{goles}</Text>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{cap}</Text>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{mins}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderTabValoraciones = () => (
    <ScrollView style={{ flex: 1, padding: 15 }} contentContainerStyle={{ paddingBottom: 100 }} pinchGestureEnabled minimumZoomScale={1} maximumZoomScale={4}>
      <Text style={styles.sectionTitle}>Valoraciones D.I. – evolución</Text>
      <Text style={styles.diHint}>Toca una fila para ver la serie de las últimas evaluaciones. Δ = última − anterior.</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          {(compactDiLabels
            ? ['Nom', 'IA', 'Med', 'Ult', 'Ant', 'Δ', 'N']
            : ['Nombre', 'IA', 'Media', 'Última', 'Ant.', 'Δ', 'N']
          ).map((h) => (
            <Text key={h} style={[styles.tableHeaderCell, adaptiveTextStyles.tableHeader]} numberOfLines={1}>{h}</Text>
          ))}
        </View>
        {rowsValoraciones.map((r) => {
          const open = diDetalleId === r.id;
          const deltaColor = r.delta == null ? '#CFD8DC' : r.delta > 0 ? '#81C784' : r.delta < 0 ? '#E57373' : '#FFD54F';
          return (
            <View key={r.id}>
              <TouchableOpacity
                style={styles.tableRow}
                onPress={() => setDiDetalleId(open ? null : r.id)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.nombre}</Text>
                <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.valoracionIA == null ? '-' : r.valoracionIA}</Text>
                <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.diGlobal == null ? '-' : r.diGlobal}</Text>
                <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.ultima == null ? '-' : r.ultima}</Text>
                <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.anterior == null ? '-' : r.anterior}</Text>
                <Text style={[styles.tableCell, adaptiveTextStyles.tableCell, { color: deltaColor, fontWeight: '800' }]} numberOfLines={1}>{formatDelta(r.delta)}</Text>
                <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.nEvals || 0}</Text>
              </TouchableOpacity>
              {open ? (
                <View style={styles.diSerieBox}>
                  <Text style={styles.diSerieTxt}>Serie: {r.serieTxt}</Text>
                  <Text style={styles.diSerieSub}>
                    Última eval.: {r.fechaUltima || '-'}
                    {r.personal != null ? ` · Eval. pers.: ${r.personal}/10` : ''}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Rendimiento 1ª vs 2ª mitad del periodo</Text>
      <Text style={styles.diHint}>Comparativa de la primera mitad del rango de fechas con la segunda (goles, % entreno, minutos).</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          {(compactDiLabels
            ? ['Nom', 'ΔGol', 'ΔEnt%', 'ΔMin']
            : ['Nombre', 'Δ Goles', 'Δ Ent %', 'Δ Minutos']
          ).map((h) => (
            <Text key={h} style={[styles.tableHeaderCell, adaptiveTextStyles.tableHeader]} numberOfLines={1}>{h}</Text>
          ))}
        </View>
        {rowsEvolucionRendimiento.map((r) => {
          const cGol = r.dGol > 0 ? '#81C784' : r.dGol < 0 ? '#E57373' : '#CFD8DC';
          const cEnt = r.dEnt == null ? '#CFD8DC' : r.dEnt > 0 ? '#81C784' : r.dEnt < 0 ? '#E57373' : '#FFD54F';
          const cMin = r.dMin > 0 ? '#81C784' : r.dMin < 0 ? '#E57373' : '#CFD8DC';
          const minLabel = r.dMin === 0
            ? '0'
            : `${r.dMin > 0 ? '+' : '−'}${formatTiempoJugado(Math.abs(r.dMin))}`;
          return (
            <View key={r.id} style={styles.tableRow}>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.nombre}</Text>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell, { color: cGol, fontWeight: '700' }]} numberOfLines={1}>{formatDelta(r.dGol)}</Text>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell, { color: cEnt, fontWeight: '700' }]} numberOfLines={1}>{r.dEnt == null ? '-' : `${formatDelta(r.dEnt)}pp`}</Text>
              <Text style={[styles.tableCell, adaptiveTextStyles.tableCell, { color: cMin, fontWeight: '700' }]} numberOfLines={1}>{minLabel}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderTabAsistencia = () => {
    if (activeTab === 'PARTIDOS' && partidosList.length === 0) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: '#B0BEC5', fontSize: 14, textAlign: 'center', marginBottom: 8 }}>
            No hay partidos en esta temporada.
          </Text>
          <Text style={{ color: '#78909C', fontSize: 12, textAlign: 'center' }}>
            Importa desde Menú → Gestión de datos (configura el ID de tu libro y pulsa Importar en Partidos) o añade partidos en la pestaña Partidos.
          </Text>
        </View>
      );
    }
    if (activeTab === 'PARTIDOS' && partidosList.length > 0 && partidosFiltrados.length === 0) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: '#B0BEC5', fontSize: 14, textAlign: 'center', marginBottom: 8 }}>
            No hay partidos en el periodo seleccionado.
          </Text>
          <Text style={{ color: '#78909C', fontSize: 12, textAlign: 'center' }}>
            Amplía el rango de fechas arriba o pulsa «Todo».
          </Text>
        </View>
      );
    }
    if (activeTab === 'ENTRENOS' && (entrenos || []).length > 0 && entrenosFiltrados.length === 0) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: '#B0BEC5', fontSize: 14, textAlign: 'center', marginBottom: 8 }}>
            No hay entrenos en el periodo seleccionado.
          </Text>
          <Text style={{ color: '#78909C', fontSize: 12, textAlign: 'center' }}>
            Amplía el rango de fechas arriba o pulsa «Todo el histórico cargado».
          </Text>
        </View>
      );
    }
    // Resumen visual de objetivos tácticos en ENTRENOS (si existen)
    const objetivosMap: Record<string, number> = {};
    entrenosOrdenados.forEach((e) => {
      const raw = (e.objetivos || '').toString();
      raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((o) => {
        objetivosMap[o] = (objetivosMap[o] || 0) + 1;
      });
    });
    const objetivosClaves = Object.keys(objetivosMap)
      .sort((a, b) => objetivosMap[b] - objetivosMap[a]);
    const resumenObjetivosTexto = objetivosClaves.length
      ? objetivosClaves.map(k => `${k} (${objetivosMap[k]})`).join(' · ')
      : '';

    const hH = activeTab === 'PARTIDOS' ? 130 : 80;
    const handleScrollLeft = (e) => { if (activeScroll.current === 'left') rightRef.current?.scrollTo({ y: e.nativeEvent.contentOffset.y, animated: false }); };
    const handleScrollRight = (e) => { if (activeScroll.current === 'right') leftRef.current?.scrollTo({ y: e.nativeEvent.contentOffset.y, animated: false }); };

    return (
      <View style={{flex:1, flexDirection: 'row'}}>
        <View style={{width: gridCol.fixNameW, zIndex: 10, backgroundColor: '#001A33', borderRightWidth: 1, borderColor: '#1565C0'}}>
            <View style={[styles.headerCell, { height: hH }]}>
              <Text style={styles.headerLabel}>NOMBRE</Text>
              {activeTab === 'ENTRENOS' ? <Text style={styles.headerPctLabel}>%</Text> : null}
            </View>
          <ScrollView ref={leftRef} bounces={false} showsVerticalScrollIndicator={false} scrollEventThrottle={16} pinchGestureEnabled minimumZoomScale={1} maximumZoomScale={4}
            onScrollBeginDrag={() => activeScroll.current = 'left'} onScroll={handleScrollLeft}
            contentContainerStyle={{ paddingBottom: 100 }}>
            {activeTab === 'ENTRENOS' && !!resumenObjetivosTexto ? (
              <View style={styles.objetivosTopBox}>
                <Text style={styles.objetivosResumenTxt}>
                  Objetivos tácticos (separados por coma): {resumenObjetivosTexto}
                </Text>
              </View>
            ) : null}
            <View style={styles.sectHeader}><Text style={styles.sectTitle}>JUGADORES</Text></View>
            {listaJugadores.map((p, idx) => {
              const s = statsCalculadas.jugadores[idx];
              const pct =
                activeTab === 'ENTRENOS' && entrenosFiltrados.length > 0 && s?.global
                  ? Math.round((s.global.ent / entrenosFiltrados.length) * 100)
                  : null;
              return (
                <View key={p.id} style={[styles.nameRow, { height: ROW_HEIGHT }]}>
                  <Text style={styles.nameTxt} numberOfLines={1}>{p.name}</Text>
                  {pct != null ? <Text style={styles.entPctTxt}>{pct}%</Text> : null}
                </View>
              );
            })}
            <View style={styles.sectHeader}><Text style={styles.sectTitle}>STAFF</Text></View>
            {listaStaff.map((p, idx) => {
              const s = statsCalculadas.staff[idx];
              const pct =
                activeTab === 'ENTRENOS' && entrenosFiltrados.length > 0 && s?.global
                  ? Math.round((s.global.ent / entrenosFiltrados.length) * 100)
                  : null;
              return (
                <View key={p.id} style={[styles.nameRow, { height: ROW_HEIGHT }]}>
                  <Text style={styles.nameTxt} numberOfLines={1}>{p.name}</Text>
                  {pct != null ? <Text style={styles.entPctTxt}>{pct}%</Text> : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
        <ScrollView horizontal bounces={false}>
          <View>
            <View style={[styles.tableHeader, { height: hH }]}>
              {activeTab === 'ENTRENOS' ? entrenosOrdenados.map(e => (
                <View key={e.id} style={[styles.dateCol, { width: gridCol.entColW }]}>
                  <Text style={styles.dateTxt}>{formatDateExport(parseToDate(e.fecha)) || e.fecha}</Text>
                  <View style={styles.actionRow}>
                    <TouchableOpacity onPress={() => onEditSession?.(e, 'ENT')} style={styles.miniBtn}><Text style={styles.miniBtnTxt}>E</Text></TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert(
                          'Eliminar sesión',
                          `¿Eliminar la sesión de entrenamiento del ${formatDateExport(parseToDate(e.fecha)) || e.fecha || 'esta fecha'}?`,
                          [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Eliminar', style: 'destructive', onPress: () => onDeleteSession?.(e.id, 'ENT') }
                          ]
                        );
                      }}
                      style={[styles.miniBtn, {backgroundColor:'#C62828'}]}
                    >
                      <Text style={styles.miniBtnTxt}>X</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )) : activeTab === 'PARTIDOS' ? partidosOrdenados.map(p => (
                  <View key={p.id} style={[styles.matchHeaderCol, { width: gridCol.matchColW }]}>
                    <Text style={styles.tipoCompTxt}>{p.tipo || 'LIGA'}</Text>
                    <Text style={styles.rivalTxt} numberOfLines={1}>{p.rival}</Text>
                    <Text style={styles.lugarTxt}>{p.lugar === 'VISITANTE' ? 'VISIT.' : 'LOCAL'}</Text>
                    <Text style={styles.resultadoTxt}>{p.golesFavor || 0} - {p.golesContra || 0}</Text>
                    <Text style={styles.dateSubTxt}>{formatDateExport(parseToDate(p.fecha)) || p.fecha}</Text>
                    <View style={[styles.actionRow, {marginBottom: 8}]}>
                      <TouchableOpacity onPress={() => abrirActa(p.acta, p.rival)} style={[styles.miniBtn, { backgroundColor: (p.acta?.uri || p.acta?.driveUrl) ? '#2E7D32' : '#555', minWidth: 50 }]}>
                        <Text style={styles.miniBtnTxt}>ACTA</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => onEditSession(p, 'EDIT_PAR')} style={[styles.miniBtn, {backgroundColor:'#1565C0'}]}><Text style={styles.miniBtnTxt}>E</Text></TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            'Eliminar partido',
                            `¿Eliminar el partido contra ${p.rival || 'rival'} (${formatDateExport(parseToDate(p.fecha)) || p.fecha || 'sin fecha'})?`,
                            [
                              { text: 'Cancelar', style: 'cancel' },
                              { text: 'Eliminar', style: 'destructive', onPress: () => onDeleteSession(p.id, 'PAR') }
                            ]
                          );
                        }}
                        style={[styles.miniBtn, {backgroundColor:'#C62828'}]}
                      >
                        <Text style={styles.miniBtnTxt}>X</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.subHeaderRow}>
                      <Text style={[styles.subH, { width: gridCol.subColW }]}>AS</Text>
                      <Text style={[styles.subH, { width: gridCol.subColW }]}>C</Text>
                      <Text style={[styles.subH, { width: gridCol.subColW }]}>G</Text>
                      <Text style={[styles.subH, { width: gridCol.subColW }]}>MIN</Text>
                    </View>
                  </View>
              )) : RESUMEN_COLUMNS.map(h => (
                 <View key={h} style={[styles.dateCol, { width: gridCol.globColW }]}><Text style={styles.globH}>{h}</Text></View>
              ))}
            </View>
            <ScrollView ref={rightRef} bounces={false} showsVerticalScrollIndicator={false} scrollEventThrottle={16} pinchGestureEnabled minimumZoomScale={1} maximumZoomScale={4}
              onScrollBeginDrag={() => activeScroll.current = 'right'} onScroll={handleScrollRight}
              contentContainerStyle={{ paddingBottom: 100 }}>
              <View style={styles.sectHeader} /> 
              {listaJugadores.map((p, idx) => renderFilaDatos(p, idx, false))}
              <View style={styles.sectHeader} />
              {listaStaff.map((p, idx) => renderFilaDatos(p, idx, true))}
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    );
  };
const renderTabFinal = () => {
  if (!statsCalculadas?.resComp?.length || !statsCalculadas?.jugadores?.length || !statsCalculadas?.local || !statsCalculadas?.visita) {
    return (
      <ScrollView style={{ flex: 1, padding: 15 }} contentContainerStyle={{ paddingBottom: 100 }} pinchGestureEnabled minimumZoomScale={1} maximumZoomScale={4}>
        <Text style={styles.sectionTitle}>Rendimiento del Equipo</Text>
        <Text style={{ color: '#AAA', marginTop: 10 }}>Sin datos suficientes para mostrar el informe.</Text>
      </ScrollView>
    );
  }

  // Mapas para acceso rápido
  const resCompMap = {};
  statsCalculadas.resComp.forEach(c => { resCompMap[c.nombre] = c; });

  const lugarMap = { Local: statsCalculadas.local, Visitante: statsCalculadas.visita };

  // Pichichis: general y por competición (opcional para uso futuro)
  const pichichisMap = {};
  statsCalculadas.jugadores.forEach(j => {
    pichichisMap[j.name] = { total: j.global?.gol ?? 0 };
    (j.porComp || []).forEach(pc => { pichichisMap[j.name][pc.nombre] = pc.gol; });
  });

  const safeRes = (c) => resCompMap[c] || { j: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 };

  return (
    <ScrollView style={{ flex: 1, padding: 15 }} contentContainerStyle={{ paddingBottom: 100 }} pinchGestureEnabled minimumZoomScale={1} maximumZoomScale={4}>

      {/* === RENDIMIENTO DEL EQUIPO – GENERAL Y POR COMPETICIÓN === */}
      <Text style={styles.sectionTitle}>Rendimiento del Equipo – General y por Competición</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          {['Competición','PJ','PG','PE','PP','GF','GC','DIF'].map(h => <Text key={h} style={styles.tableHeaderCell}>{h}</Text>)}
        </View>
        {todasLasComps.map(c => {
          const r = safeRes(c);
          return (
            <View key={c} style={styles.tableRow}>
              <Text style={styles.tableCell}>{c}</Text>
              <Text style={styles.tableCell}>{r.j}</Text>
              <Text style={styles.tableCell}>{r.g}</Text>
              <Text style={styles.tableCell}>{r.e}</Text>
              <Text style={styles.tableCell}>{r.p}</Text>
              <Text style={styles.tableCell}>{r.gf}</Text>
              <Text style={styles.tableCell}>{r.gc}</Text>
              <Text style={styles.tableCell}>{r.gf - r.gc}</Text>
            </View>
          );
        })}
        {/* Fila sumatoria */}
        <View style={styles.tableRowSum}>
          <Text style={[styles.tableCell, {fontWeight:'bold'}]}>TOTAL</Text>
          <Text style={[styles.tableCell, {fontWeight:'bold'}]}>{todasLasComps.map(c => safeRes(c).j).reduce((a,b)=>a+b,0)}</Text>
          <Text style={[styles.tableCell, {fontWeight:'bold'}]}>{todasLasComps.map(c => safeRes(c).g).reduce((a,b)=>a+b,0)}</Text>
          <Text style={[styles.tableCell, {fontWeight:'bold'}]}>{todasLasComps.map(c => safeRes(c).e).reduce((a,b)=>a+b,0)}</Text>
          <Text style={[styles.tableCell, {fontWeight:'bold'}]}>{todasLasComps.map(c => safeRes(c).p).reduce((a,b)=>a+b,0)}</Text>
          <Text style={[styles.tableCell, {fontWeight:'bold'}]}>{todasLasComps.map(c => safeRes(c).gf).reduce((a,b)=>a+b,0)}</Text>
          <Text style={[styles.tableCell, {fontWeight:'bold'}]}>{todasLasComps.map(c => safeRes(c).gc).reduce((a,b)=>a+b,0)}</Text>
          <Text style={[styles.tableCell, {fontWeight:'bold'}]}>{todasLasComps.map(c => safeRes(c).gf - safeRes(c).gc).reduce((a,b)=>a+b,0)}</Text>
        </View>
      </View>

      {/* === RENDIMIENTO LOCAL VS VISITANTE === */}
      <Text style={{...styles.sectionTitle, marginTop:20}}>Rendimiento Local / Visitante</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          {['Lugar','PJ','PG','PE','PP','GF','GC','DIF'].map(h => <Text key={h} style={styles.tableHeaderCell}>{h}</Text>)}
        </View>
        {['Local','Visitante'].map(lugar => {
          const r = lugarMap[lugar] || { j: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 };
          return (
            <View key={lugar} style={styles.tableRow}>
              <Text style={styles.tableCell}>{lugar}</Text>
              <Text style={styles.tableCell}>{r.j}</Text>
              <Text style={styles.tableCell}>{r.g}</Text>
              <Text style={styles.tableCell}>{r.e}</Text>
              <Text style={styles.tableCell}>{r.p}</Text>
              <Text style={styles.tableCell}>{r.gf}</Text>
              <Text style={styles.tableCell}>{r.gc}</Text>
              <Text style={styles.tableCell}>{r.gf - r.gc}</Text>
            </View>
          );
        })}
      </View>
      {/* === MÁXIMOS GOLEADORES – General y por competición === */}
      <Text style={{...styles.sectionTitle, marginTop:20}}>Máximos Goleadores</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, {flex:2}]}>Competición</Text>
          <Text style={styles.tableHeaderCell}>Jugador</Text>
          <Text style={styles.tableHeaderCell}>Goles</Text>
        </View>
        {(() => {
          const rows = [];
          const maxGeneral = statsCalculadas.jugadores.reduce((a, b) => 
            (a.global?.gol || 0) >= (b.global?.gol || 0) ? a : b
          );
          if (maxGeneral && (maxGeneral.global?.gol || 0) > 0) {
            rows.push({ tipo: 'General', jugador: maxGeneral.name, goles: maxGeneral.global?.gol ?? 0 });
          }
          todasLasComps.forEach(c => {
            const maxComp = statsCalculadas.jugadores.reduce((a, b) => {
              const ga = a.porComp.find(pc => pc.nombre === c)?.gol ?? 0;
              const gb = b.porComp.find(pc => pc.nombre === c)?.gol ?? 0;
              return ga >= gb ? a : b;
            });
            const golesComp = maxComp?.porComp.find(pc => pc.nombre === c)?.gol ?? 0;
            if (maxComp && golesComp > 0) {
              rows.push({ tipo: c, jugador: maxComp.name, goles: golesComp });
            }
          });
          if (rows.length === 0) {
            return (
              <View style={styles.tableRow}>
                <Text style={[styles.tableCell, {flex:2}]}>Sin goles registrados</Text>
                <Text style={styles.tableCell}>-</Text>
                <Text style={styles.tableCell}>0</Text>
              </View>
            );
          }
          return rows.map((r, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, {flex:2}]}>{r.tipo}</Text>
              <Text style={styles.tableCell}>{r.jugador}</Text>
              <Text style={styles.tableCell}>{r.goles}</Text>
            </View>
          ));
        })()}
      </View>

      {/* === RENDIMIENTO INDIVIDUAL – GENERAL === */}
      <Text style={{...styles.sectionTitle, marginTop:20}}>Rendimiento Individual – General</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          {['Jugador','Entrenamientos','Partidos','Goles','Capitán','Tiempo Jugado'].map(h => <Text key={h} style={styles.tableHeaderCell}>{h}</Text>)}
        </View>
        {statsCalculadas.jugadores.map(j => (
          <View key={j.id} style={styles.tableRow}>
            <Text style={styles.tableCell}>{j.name}</Text>
            <Text style={styles.tableCell}>{`${j.global?.ent ?? 0}/${entrenosFiltrados.length}`}</Text>
            <Text style={styles.tableCell}>{`${j.global?.par ?? 0}/${partidosFiltrados.length}`}</Text>
            <Text style={styles.tableCell}>{j.global?.gol ?? 0}</Text>
            <Text style={styles.tableCell}>{j.global?.cap ?? 0}</Text>
            <Text style={styles.tableCell}>
              {formatTiempoJugado(j.global?.min ?? 0)}
            </Text>
          </View>
        ))}
      </View>

      {/* === RENDIMIENTO INDIVIDUAL – POR COMPETICIÓN === */}
      {todasLasComps.map(c => (
        <View key={c} style={{ marginTop: 20 }}>
          <Text style={styles.sectionTitle}>Rendimiento Individual – {c}</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              {['Jugador','Entrenamientos','Partidos','Goles','Capitán','Tiempo Jugado'].map(h => <Text key={h} style={styles.tableHeaderCell}>{h}</Text>)}
            </View>
            {statsCalculadas.jugadores.map(j => {
              const pc = j.porComp.find(pc => pc.nombre===c);
              const partidosComp = partidosFiltrados.filter(p => (p.tipo?.toUpperCase()||'LIGA')===c).length;
              return (
                <View key={j.id} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{j.name}</Text>
                  <Text style={styles.tableCell}>{`${j.global?.ent ?? 0}/${entrenosFiltrados.length}`}</Text>
                  <Text style={styles.tableCell}>{`${pc?.par ?? 0}/${partidosComp}`}</Text>
                  <Text style={styles.tableCell}>{pc?.gol || 0}</Text>
                  <Text style={styles.tableCell}>{pc?.cap || 0}</Text>
                  <Text style={styles.tableCell}>{formatTiempoJugado(pc?.min ?? 0)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}

    </ScrollView>
  );
};
  return (
    <View style={[styles.container, { paddingHorizontal: screen.horizontalPadding }]}>
      <View style={styles.headerNav}>
        <Text style={styles.title}>ESTADÍSTICAS</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={onBack} style={styles.exitTopBtn}>
            <Text style={styles.exitTopBtnTxt}>SALIR</Text>
          </TouchableOpacity>
          {typeof onOpenBiblioteca === 'function' ? (
            <TouchableOpacity onPress={onOpenBiblioteca} style={styles.biblioTopBtn}>
              <Text style={styles.biblioTopBtnTxt}>BIBLIOTECA</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={handleExport} style={styles.exportTopBtn}>
            <Text style={styles.exportTopBtnTxt}>EXPORTAR</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.tabContainer}>
        {[{ key: 'ENTRENOS', label: compactTabLabels ? 'ENT' : 'ENTRENOS' }, { key: 'PARTIDOS', label: compactTabLabels ? 'PAR' : 'PARTIDOS' }, { key: 'RESUMEN', label: compactTabLabels ? 'RES' : 'RESUMEN' }, { key: 'DI', label: 'DI' }, { key: 'FINAL', label: 'FINAL' }].map(t => (
          <TouchableOpacity key={t.key} style={[styles.tab, activeTab === (t.key === 'FINAL' ? 'COMPETICION' : t.key) && styles.activeTab]} onPress={() => setActiveTab(t.key === 'FINAL' ? 'COMPETICION' : t.key)}>
            <Text style={[styles.tabTxt, adaptiveTextStyles.tabTxt]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.statsFilterBar}>
        <Text style={styles.statsFilterHint}>Periodo · toca la fecha para abrir el calendario</Text>
        <View style={styles.statsFilterRow}>
          <Text style={styles.statsFilterLbl}>Desde</Text>
          <YmdDatePickerField
            value={statsDesdeInput}
            onChange={setStatsDesdeInput}
            minimumDate={dataDateBounds.min}
            maximumDate={
              statsHastaInput.trim() && isValidYmd(statsHastaInput.trim())
                ? statsHastaInput.trim()
                : dataDateBounds.max
            }
            variant="dark"
          />
          <Text style={styles.statsFilterLbl}>Hasta</Text>
          <YmdDatePickerField
            value={statsHastaInput}
            onChange={setStatsHastaInput}
            minimumDate={
              statsDesdeInput.trim() && isValidYmd(statsDesdeInput.trim())
                ? statsDesdeInput.trim()
                : dataDateBounds.min
            }
            variant="dark"
          />
          {dataDateBounds.min && dataDateBounds.max ? (
            <TouchableOpacity
              style={styles.statsFilterResetBtn}
              onPress={() => {
                setStatsDesdeInput(dataDateBounds.min);
                setStatsHastaInput(dataDateBounds.max);
              }}
            >
              <Text style={styles.statsFilterResetTxt}>Todo</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {activeTab === 'COMPETICION'
        ? renderTabFinal()
        : activeTab === 'DI'
        ? renderTabValoraciones()
        : activeTab === 'RESUMEN'
        ? renderTabResumen()
        : renderTabAsistencia()
      }


      {/* --- MODAL DE ACTA: primero se ve el documento/imagen; arriba Cerrar y Compartir --- */}
      <Modal visible={modalActaVisible} transparent={true} animationType="slide">
        <View style={styles.modalFullContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalActaVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnTxt}>Cerrar</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.modalTitleActa}>ACTA OFICIAL</Text>
              <Text style={styles.modalSubTitleActa}>{actaSeleccionada?.rival}</Text>
            </View>
            <TouchableOpacity onPress={compartirDesdeVisor} style={styles.modalShareBtn}>
              <FontAwesome name="share-square-o" size={24} color="#00FF00" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContentActa}>
            {actaSeleccionada?.uri ? (
              actaSeleccionada.tipo === 'archivo' ? (
                <View style={styles.modalPdfPlaceholder}>
                  <FontAwesome name="file-pdf-o" size={64} color="#C62828" />
                  <Text style={styles.modalPdfText}>Documento PDF</Text>
                  <Text style={styles.modalPdfSub}>Abre o comparte el archivo con el botón de abajo</Text>
                  <TouchableOpacity onPress={compartirDesdeVisor} style={styles.modalPdfBtn}>
                    <Text style={styles.modalPdfBtnTxt}>ABRIR / COMPARTIR PDF</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView
                  style={styles.modalImageScroll}
                  contentContainerStyle={styles.modalImageScrollContent}
                  showsVerticalScrollIndicator
                  showsHorizontalScrollIndicator
                  pinchGestureEnabled={true}
                  minimumZoomScale={1}
                  maximumZoomScale={5}
                >
                  <Image
                    source={{ uri: actaSeleccionada.uri }}
                    style={[styles.modalActaImage, { minHeight: Math.min(520, Math.max(200, height * 0.42)) }]}
                    resizeMode="contain"
                  />
                </ScrollView>
              )
            ) : (
              <ActivityIndicator size="large" color="#1565C0" />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33' },
  headerNav: { alignItems: 'center', paddingHorizontal: 15, paddingTop: 40, paddingBottom: 10, backgroundColor: '#012E57' },
  title: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  headerActions: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  exitTopBtn: { flex: 1, backgroundColor: '#FF4757', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  exitTopBtnTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  exportTopBtn: { flex: 1, backgroundColor: '#1565C0', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  exportTopBtnTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: 'bold' },
  biblioTopBtn: { flex: 1, backgroundColor: '#FFD166', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  biblioTopBtnTxt: { color: '#001A33', fontSize: 9, fontWeight: 'bold' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#012E57', padding: 5, gap: 4 },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 8, backgroundColor: '#001A33' },
  activeTab: { backgroundColor: '#1565C0' },
  tabTxt: { color: '#FFF', fontSize: 8, fontWeight: 'bold' },
  statsFilterBar: { backgroundColor: '#001326', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#1565C0' },
  statsFilterHint: { color: '#B0BEC5', fontSize: 9, marginBottom: 6 },
  statsFilterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', gap: 4 },
  statsFilterLbl: { color: '#00aaff', fontSize: 9, fontWeight: '600', flexShrink: 0 },
  statsFilterResetBtn: { backgroundColor: '#37474F', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, marginLeft: 2, flexShrink: 0 },
  statsFilterResetTxt: { color: '#ECEFF1', fontSize: 10, fontWeight: '700' },
  headerCell: { backgroundColor: '#012E57', justifyContent: 'center', padding: 10, borderBottomWidth: 1, borderColor: '#1565C0' },
  headerLabel: { color: '#00aaff', fontSize: 10, fontWeight: 'bold' },
  sectHeader: { height: SECTION_SPACER_H, backgroundColor: '#001326', justifyContent: 'center', paddingHorizontal: 10 },
  sectTitle: { color: '#1565C0', fontSize: 10, fontWeight: 'bold' },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderColor: '#012E57',
    gap: 4,
  },
  nameTxt: { color: '#FFF', fontSize: 11, fontWeight: 'bold', flex: 1, minWidth: 0 },
  entPctTxt: { color: '#00D4FF', fontSize: 10, fontWeight: '800', minWidth: 32, textAlign: 'right' },
  headerPctLabel: { color: '#00D4FF', fontSize: 9, fontWeight: '800', marginTop: 2 },
  objetivosTopBox: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: '#012A4A',
    borderBottomWidth: 1,
    borderBottomColor: '#1565C0',
  },
  objetivosResumenTxt: { color: '#B0BEC5', fontSize: 10, lineHeight: 13 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#012E57', borderBottomWidth:1, borderColor:'#1565C0' },
  dateCol: { alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderColor: '#012E57' },
  matchHeaderCol: { alignItems: 'center', justifyContent: 'flex-end', borderLeftWidth: 1, borderColor: '#012E57' },
  rivalTxt: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  lugarTxt: { color: '#00aaff', fontSize: 8, fontWeight: '600', marginVertical: 1 },
  resultadoTxt: { color: '#00FF00', fontSize: 12, fontWeight: 'bold' },
  dateSubTxt: { color: '#00aaff', fontSize: 8, marginBottom: 5 },
  dateTxt: { color: '#FFF', fontSize: 9, fontWeight: 'bold', marginBottom: 5 },
  actionRow: { flexDirection: 'row', gap: 4 },
  miniBtn: { padding: 4, borderRadius: 4, minWidth: 28, backgroundColor: '#1565C0', alignItems: 'center', justifyContent:'center' },
  miniBtnTxt: { color: '#FFF', fontSize: 8, fontWeight: 'bold' },
  dataRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#012E57' },
  cell: { justifyContent: 'center', alignItems: 'center' },
  badge: { width: 30, height: 20, borderRadius: 4, justifyContent:'center', alignItems:'center' },
  badgeTxt: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },
  subHeaderRow: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#1565C0', width: '100%' },
  subH: { textAlign: 'center', color: '#00aaff', fontSize: 8, fontWeight: 'bold', paddingVertical: 2 },
  subCol: { justifyContent: 'center', alignItems: 'center' },
  subColTxt: { color: '#FFF', fontSize: 10 },
  globH: { color: '#00aaff', fontSize: 8, fontWeight: 'bold', textAlign:'center' },
  globC: { fontSize: 10, fontWeight: 'bold', textAlign:'center' },
  tipoCompTxt: { color: '#FFFFFF', fontSize: 9, fontWeight: 'bold', textAlign: 'center', marginVertical: 2 },
  miniBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, minWidth: 24, alignItems: 'center' },
  modalFullContainer: { flex: 1, backgroundColor: '#000' },
  modalHeader: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, borderBottomWidth: 1, borderColor: '#1565C0', backgroundColor: '#012E57' },
  modalCloseBtnTxt: { color: '#FFF', fontWeight: 'bold' },
  modalTitleActa: { color: '#FFD700', fontSize: 16, fontWeight: 'bold' },
  modalSubTitleActa: { color: '#00aaff', fontSize: 12 },
  modalContent: { flex: 1, padding: 10, alignItems: 'center', justifyContent: 'center' },
  modalContentActa: { flex: 1, backgroundColor: '#FFF', padding: 8, justifyContent: 'flex-start' },
  modalImageScroll: { flex: 1, width: '100%' },
  modalImageScrollContent: { flexGrow: 1, alignItems: 'center', paddingBottom: 24 },
  modalActaImage: { width: '100%' },
  modalPdfPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalPdfText: { color: '#333', fontSize: 18, fontWeight: 'bold', marginTop: 16 },
  modalPdfSub: { color: '#666', fontSize: 14, marginTop: 8, textAlign: 'center' },
  modalPdfBtn: { backgroundColor: '#2E7D32', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 10, marginTop: 24 },
  modalPdfBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  table: { borderWidth:1, borderColor:'#1565C0', borderRadius:4, overflow:'hidden' },
tableHeader: { flexDirection:'row', backgroundColor:'#012E57' },
tableHeaderCell: { flex:1, padding:5, textAlign:'center', color:'#00aaff', fontWeight:'bold', fontSize:9 },
tableRow: { flexDirection:'row', borderTopWidth:1, borderColor:'#1565C0' },
tableRowSum: { flexDirection:'row', borderTopWidth:1, borderColor:'#1565C0', backgroundColor:'rgba(33,150,243,0.2)' },
tableCell: { flex:1, padding:5, textAlign:'center', color:'#FFF', fontSize:9 },
sectionTitle: { color:'#FFD700', fontWeight:'bold', fontSize:14, marginBottom:8 },
  diHint: { color: '#90A4AE', fontSize: 11, marginBottom: 10, lineHeight: 15 },
  diSerieBox: {
    backgroundColor: '#012A4A',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1565C0',
  },
  diSerieTxt: { color: '#E3F2FD', fontSize: 12, fontWeight: '700' },
  diSerieSub: { color: '#90CAF9', fontSize: 11, marginTop: 4 },
sectionSubtitle: { color:'#00D4FF', fontWeight:'bold', fontSize:12, marginBottom:4 }
});