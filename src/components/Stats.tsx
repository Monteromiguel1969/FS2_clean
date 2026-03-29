import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert, Linking, Modal, ActivityIndicator, useWindowDimensions } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { FontAwesome } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { formatDateExport, parseToDate } from '../utils/dateFormat';

// --- MEDIDAS ESTRICTAS ---
const ROW_HEIGHT = 50;    
const FIX_NAME_W = 110;   
const ENT_COL_W = 90;     
const MATCH_COL_W = 190;  
const SUB_COL_W = 47.5;
const GLOB_COL_W = 75;
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

export default function Stats({ players = [], entrenos = [], partidos = [], onBack, onEditSession, onDeleteSession }) {
  const { width } = useWindowDimensions();
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
  const partidosList = Array.isArray(partidos) ? partidos : [];
  const [activeTab, setActiveTab] = useState('ENTRENOS');
  const [modalActaVisible, setModalActaVisible] = useState(false);
  const [actaSeleccionada, setActaSeleccionada] = useState(null);

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
  const entrenosOrdenados = useMemo(() => [...entrenos].sort((a, b) => parseFecha(a.fecha) - parseFecha(b.fecha)), [entrenos]);
  const partidosOrdenados = useMemo(() => [...partidosList].sort((a, b) => parseFecha(a.fecha) - parseFecha(b.fecha)), [partidosList]);

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
      global.ent = entrenos.filter(e => e.asistencia?.find(a => a.id === jug.id && a.estado === 'AS')).length;

      const porComp = todasLasComps.map(c => {
        let s = { nombre: c, par: 0, gol: 0, cap: 0, min: 0 }; // min = total segundos
        partidosList.filter(p => (p.tipo?.toUpperCase() || 'LIGA') === c).forEach(p => {
          const reg = p.convocatoria?.find(conv => conv.id === jug.id);
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
        partidosList.filter(p => (p.tipo?.toUpperCase() || 'LIGA') === c).forEach(part => {
          res.j++;
          const gf = parseInt(part.golesFavor) || 0;
          const gc = parseInt(part.golesContra) || 0;
          res.gf += gf; res.gc += gc;
          if (gf > gc) res.g++; else if (gf === gc) res.e++; else res.p++;
        });
        return res;
      }),
      local: partidosList.filter(p => p.lugar === 'LOCAL').reduce((acc, p) => {
          acc.j++; const gf=parseInt(p.golesFavor)||0, gc=parseInt(p.golesContra)||0;
          acc.gf+=gf; acc.gc+=gc; if(gf>gc)acc.g++; else if(gf===gc)acc.e++; else acc.p++;
          return acc;
      }, {nombre:'LOCAL', j:0, g:0, e:0, p:0, gf:0, gc:0}),
      visita: partidosList.filter(p => p.lugar === 'VISITANTE').reduce((acc, p) => {
          acc.j++; const gf=parseInt(p.golesFavor)||0, gc=parseInt(p.golesContra)||0;
          acc.gf+=gf; acc.gc+=gc; if(gf>gc)acc.g++; else if(gf===gc)acc.e++; else acc.p++;
          return acc;
      }, {nombre:'VISITANTE', j:0, g:0, e:0, p:0, gf:0, gc:0})
    };
  }, [listaJugadores, listaStaff, entrenos, partidosList, todasLasComps]);

  const rowsValoraciones = useMemo(() => {
    return [...listaJugadores, ...listaStaff].map((j, idx) => {
      const evals = Array.isArray(j?.evaluacionesDI) ? j.evaluacionesDI : [];
      const diScores = evals
        .map((e) => Number(e?.score))
        .filter((n) => Number.isFinite(n) && n > 0);
      const personalOnly = evals.filter((e) => e?.personalForm && typeof e.personalForm === 'object');
      const latestPersonal = personalOnly.length ? personalOnly[personalOnly.length - 1] : null;
      const personalScore = Number(latestPersonal?.score);
      const diProm = diScores.length ? (diScores.reduce((a, b) => a + b, 0) / diScores.length) : null;
      return {
        id: j?.id || `sin-id-${idx}`,
        nombre: j?.name || '-',
        rol: j?.role || '-',
        valoracionIA: Number.isFinite(Number(j?.valoracionIA)) ? Number(j?.valoracionIA) : null,
        diGlobal: diProm == null ? null : Math.round(diProm * 100) / 100,
        personal: Number.isFinite(personalScore) ? Math.round(personalScore * 100) / 100 : null,
        fechaPersonal: latestPersonal?.fecha || '',
      };
    });
  }, [listaJugadores, listaStaff]);

  const htmlStyle = `
    <style>
      body { font-family: sans-serif; padding: 20px; background-color: white; }
      h1 { color: #012E57; text-align: center; font-size: 18px; }
      h2 { color: #012E57; border-bottom: 2px solid #1565C0; padding-bottom: 5px; text-align: center; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; table-layout: fixed; font-size: 10px; }
      th, td { border: 1px solid #CCC; padding: 6px; text-align: center; }
      th { background-color: #012E57; color: white; }
      .name-col { text-align: left; font-weight: bold; background-color: #F9F9F9; }
      .name-col-entrenos { text-align: left; font-weight: bold; background-color: #F9F9F9; min-width: 180px; white-space: nowrap; }
      table.table-entrenos { table-layout: auto; }
      .sum-row { font-weight: bold; background-color: #E3F2FD; }
      .page-break { page-break-after: always; }
    </style>
  `;

  const handleExport = async () => {
    if (sharingRef.current) return;
    try {
      sharingRef.current = true;
      let content = '';
      const headerBase = `<h1 style="text-align:center; color:#012E57;">ESTADÍSTICAS DEL EQUIPO</h1>`;

      if (activeTab === 'ENTRENOS') {
        // Exportación pestaña ENTRENOS: primera columna nombre completo (ancha, una línea); 10 columnas de sesiones por página
        if (entrenosOrdenados.length === 0) {
          content = `<div>${headerBase}<p>No hay entrenos registrados.</p></div>`;
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
                const st = (e.asistencia || []).find(a => a.id === p.id);
                return `<td>${st?.estado || '-'}</td>`;
              }).join('');
              return `<tr><td class="name-col-entrenos">${nominal(p)}</td>${celdas}</tr>`;
            }).join('');
            const rowStaff = listaStaff.map(p => {
              const celdas = chunk.map(e => {
                const st = (e.asistencia || []).find(a => a.id === p.id);
                return `<td>${st?.estado || '-'}</td>`;
              }).join('');
              return `<tr><td class="name-col-entrenos">${nominal(p)}</td>${celdas}</tr>`;
            }).join('');
            const sep = (txt) => `<tr><td colspan="${numCols}" style="background:#012E57;color:#00aaff;font-weight:bold;padding:6px;">${txt}</td></tr>`;
            const tableHtml = `<table class="table-entrenos"><thead><tr><th class="name-col-entrenos">Nominal</th>${headerCols}</tr></thead><tbody>${sep('JUGADORES')}${rowJug}${listaStaff.length ? sep('STAFF') : ''}${rowStaff}</tbody></table>`;
            chunks.push(tableHtml);
          }
            const intro = headerBase + '<h2>Asistencia a entrenamientos</h2><p style="font-size:10px;color:#666;">Sesiones ordenadas de más antigua (izquierda) a más reciente (derecha). Salto de página cada 10 sesiones.</p>' + resumenObjetivos;
            const blocks = chunks.map((html, idx) => (idx === 0 ? `<div>${intro}${html}</div>` : `<div>${html}</div>`) + (idx < chunks.length - 1 ? '<div class="page-break"></div>' : '')).join('');
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
            const jug = [...listaJugadores, ...listaStaff].find(p => p.id === reg.id);
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
              const jug = [...listaJugadores, ...listaStaff].find(p => p.id === id);
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
        if (!content && partidosList.length === 0) content = `<div>${headerBase}<p>No hay partidos registrados.</p></div>`;
      }

      else if (activeTab === 'RESUMEN') {
        // Exportación pestaña RESUMEN: incluye Dedicación global = (Ent + Par) / (Total Ent + Total Par)
        const rows = [...statsCalculadas.jugadores, ...statsCalculadas.staff].map((s, idx) => {
          const j = [...listaJugadores, ...listaStaff][idx];
          const entN = `${s.global.ent}/${entrenos.length}`;
          const entP = entrenos.length > 0 ? Math.round((s.global.ent / entrenos.length) * 100) + '%' : '0%';
          const parN = `${s.global.par}/${partidosList.length}`;
          const parP = partidosList.length > 0 ? Math.round((s.global.par / partidosList.length) * 100) + '%' : '0%';
          const dedP = calcDedicacionGlobalPct(s.global.ent, entrenos.length, s.global.par, partidosList.length) + '%';
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
          .map((r) => `<tr><td class="name-col">${r.nombre}</td><td>${r.rol}</td><td>${r.valoracionIA == null ? '-' : r.valoracionIA}</td><td>${r.diGlobal == null ? '-' : r.diGlobal}</td><td>${r.personal == null ? '-' : r.personal}</td><td>${r.fechaPersonal || '-'}</td></tr>`)
          .join('');
        content = `
          <div>
            ${headerBase}
            <h2>Valoraciones D.I. y Evaluación personal</h2>
            <table><thead><tr><th class="name-col">Nombre</th><th>Rol</th><th>Valoración IA</th><th>D.I. global</th><th>Eval. personal</th><th>Fecha última eval. personal</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Sin datos</td></tr>'}</tbody></table>
          </div>`;
      }

      else if (activeTab === 'COMPETICION') {
        // Exportación pestaña FINAL/COMPETICIÓN: mismas tablas y columnas que la pantalla
        if (!statsCalculadas?.resComp?.length || !statsCalculadas?.jugadores || !statsCalculadas?.local || !statsCalculadas?.visita) {
          content = `<div>${headerBase}<p>Sin datos suficientes para exportar el informe Final/Competición.</p></div>`;
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
            <tbody>${statsCalculadas.jugadores.map(j => `<tr><td class="name-col">${j.name}</td><td>${j.global?.ent ?? 0}/${entrenos.length}</td><td>${j.global?.par ?? 0}/${partidosList.length}</td><td>${j.global?.gol ?? 0}</td><td>${j.global?.cap ?? 0}</td><td>${formatTiempoJugado(j.global?.min ?? 0)}</td></tr>`).join('')}</tbody></table>
          </div>`);

          // 5. Rendimiento individual por competición (igual que pantalla)
          todasLasComps.forEach(c => {
            const partidosComp = partidosList.filter(p => (p.tipo?.toUpperCase() || 'LIGA') === c).length;
            sheets.push(`
          <div class="page-break">
            ${headerBase}
            <h2>5. Rendimiento individual – ${c}</h2>
            <table><thead><tr><th class="name-col">Jugador</th><th>Entrenos</th><th>Partidos (${c})</th><th>Goles</th><th>Cap.</th><th>Tiempo</th></tr></thead>
            <tbody>${statsCalculadas.jugadores.map(j => {
              const pc = (j.porComp || []).find(pc => pc.nombre === c);
              return `<tr><td class="name-col">${j.name}</td><td>${j.global?.ent ?? 0}/${entrenos.length}</td><td>${pc?.par ?? 0}/${partidosComp}</td><td>${pc?.gol ?? 0}</td><td>${pc?.cap ?? 0}</td><td>${formatTiempoJugado(pc?.min ?? 0)}</td></tr>`;
            }).join('')}</tbody></table>
          </div>`);
          });

          content = sheets.join('');
        }
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
        const st = (e.asistencia || []).find(a => a.id === p.id);
        const color = st?.estado === 'AS' ? '#2E7D32' : st?.estado === 'AV' ? '#E65100' : st?.estado === 'NA' ? '#B71C1C' : '#333';
        return (
          <View key={e.id} style={[styles.cell, { width: ENT_COL_W }]}>
            <View style={[styles.badge, {backgroundColor: color}]}><Text style={styles.badgeTxt}>{st?.estado || '-'}</Text></View>
          </View>
        );
      })}

      {activeTab === 'PARTIDOS' && partidosOrdenados.map(pa => {
        const c = pa.convocatoria?.find(conv => conv.id === p.id);
        const getAsistColor = (estado) => {
          if (estado === 'AS') return '#2E7D32';
          if (estado === 'AV') return '#E65100';
          if (estado === 'NA') return '#C62828';
          return '#555';
        };

        return (
          <View key={pa.id} style={{ flexDirection: 'row', width: MATCH_COL_W, borderLeftWidth: 1, borderColor: '#012E57' }}>
            <View style={styles.subCol}>
              <TouchableOpacity 
                onPress={() => abrirActa(pa.acta, pa.rival)}
                style={[styles.miniBadge, { backgroundColor: getAsistColor(c?.estado) }]}
              >
                <Text style={styles.subColTxt}>{c?.estado || '-'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.subCol}><Text style={[styles.subColTxt, c?.esCapitan && { color: '#FFD700', fontWeight: 'bold' }]}>{c?.esCapitan ? 'C' : '-'}</Text></View>
            <View style={styles.subCol}><Text style={[styles.subColTxt, (c?.goles > 0) && { color: '#00FF00', fontWeight: 'bold' }]}>{c?.goles || 0}</Text></View>
            <View style={styles.subCol}><Text style={[styles.subColTxt, { fontSize: 9, color: '#AAA' }]}>{formatTiempoJugado(parseMinutosToSeconds(c?.minutos))}</Text></View>
          </View>
        );
      })}

      {activeTab === 'RESUMEN' && RESUMEN_COLUMNS.map(h => {
        const s = isStaff ? statsCalculadas.staff[idx] : statsCalculadas.jugadores[idx];
        if (!s || !s.global) return <View key={h} style={[styles.cell, {width: GLOB_COL_W}]}><Text style={styles.globC}>-</Text></View>;
        let val = "-"; let color = "#FFF";
        if (h === 'ENT(N)') val = `${s.global.ent}/${entrenos.length}`;
        if (h === 'ENT(%)') { val = entrenos.length > 0 ? Math.round((s.global.ent/entrenos.length)*100)+'%' : '0%'; color='#00D4FF'; }
        if (h === 'PAR(N)') val = `${s.global.par}/${partidosList.length}`;
        if (h === 'PAR(%)') { val = partidosList.length > 0 ? Math.round((s.global.par/partidosList.length)*100)+'%' : '0%'; color='#00D4FF'; }
        if (h === 'DEDIC.') { val = calcDedicacionGlobalPct(s.global.ent, entrenos.length, s.global.par, partidosList.length) + '%'; color = '#4DD0E1'; }
        if (h === 'GOLES') val = !isStaff ? (s.global.gol || 0) : '-';
        if (h === 'CAP') val = !isStaff ? (s.global.cap || 0) : '-';
        if (h === 'MINS') { val = !isStaff ? formatTiempoJugado(s.global.min) : '-'; color='#FFD700'; }
        return <View key={h} style={[styles.cell, {width: GLOB_COL_W}]}><Text style={[styles.globC, {color}]}>{val}</Text></View>
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
          const entN = `${s.global.ent}/${entrenos.length}`;
          const entP = entrenos.length > 0 ? Math.round((s.global.ent / entrenos.length) * 100) + '%' : '0%';
          const parN = `${s.global.par}/${partidosList.length}`;
          const parP = partidosList.length > 0 ? Math.round((s.global.par / partidosList.length) * 100) + '%' : '0%';
          const dedicacion = calcDedicacionGlobalPct(s.global.ent, entrenos.length, s.global.par, partidosList.length) + '%';
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
      <Text style={styles.sectionTitle}>Valoraciones D.I. y Evaluación personal</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          {(compactDiLabels
            ? ['Nom', 'Rol', 'IA', 'DI', 'E.P.', 'F.ult']
            : ['Nombre', 'Rol', 'IA', 'DI glob.', 'Eval. pers.', 'F. última']
          ).map((h) => (
            <Text key={h} style={[styles.tableHeaderCell, adaptiveTextStyles.tableHeader]} numberOfLines={1}>{h}</Text>
          ))}
        </View>
        {rowsValoraciones.map((r) => (
          <View key={r.id} style={styles.tableRow}>
            <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.nombre}</Text>
            <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.rol}</Text>
            <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.valoracionIA == null ? '-' : r.valoracionIA}</Text>
            <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.diGlobal == null ? '-' : r.diGlobal}</Text>
            <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.personal == null ? '-' : r.personal}</Text>
            <Text style={[styles.tableCell, adaptiveTextStyles.tableCell]} numberOfLines={1}>{r.fechaPersonal || '-'}</Text>
          </View>
        ))}
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
        <View style={{width: FIX_NAME_W, zIndex: 10, backgroundColor: '#001A33', borderRightWidth: 1, borderColor: '#1565C0'}}>
            <View style={[styles.headerCell, {height: hH}]}><Text style={styles.headerLabel}>NOMBRE</Text></View>
          <ScrollView ref={leftRef} bounces={false} showsVerticalScrollIndicator={false} scrollEventThrottle={16} pinchGestureEnabled minimumZoomScale={1} maximumZoomScale={4}
            onScrollBeginDrag={() => activeScroll.current = 'left'} onScroll={handleScrollLeft}
            contentContainerStyle={{ paddingBottom: 100 }}>
            <View style={styles.sectHeader}><Text style={styles.sectTitle}>JUGADORES</Text></View>
            {listaJugadores.map(p => <View key={p.id} style={[styles.nameRow, {height: ROW_HEIGHT}]}><Text style={styles.nameTxt} numberOfLines={1}>{p.name}</Text></View>)}
            <View style={styles.sectHeader}><Text style={styles.sectTitle}>STAFF</Text></View>
            {listaStaff.map(p => <View key={p.id} style={[styles.nameRow, {height: ROW_HEIGHT}]}><Text style={styles.nameTxt} numberOfLines={1}>{p.name}</Text></View>)}
            {activeTab === 'ENTRENOS' && !!resumenObjetivosTexto && (
              <View style={{ padding: 6 }}>
                <Text style={styles.objetivosResumenTxt}>
                  🎯 Objetivos tácticos más trabajados: {resumenObjetivosTexto}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
        <ScrollView horizontal bounces={false}>
          <View>
            <View style={[styles.tableHeader, { height: hH }]}>
              {activeTab === 'ENTRENOS' ? entrenosOrdenados.map(e => (
                <View key={e.id} style={[styles.dateCol, { width: ENT_COL_W }]}>
                  <Text style={styles.dateTxt}>{formatDateExport(parseToDate(e.fecha)) || e.fecha}</Text>
                  <View style={styles.actionRow}>
                    <TouchableOpacity onPress={() => onEditSession(e, 'ENT')} style={styles.miniBtn}><Text style={styles.miniBtnTxt}>E</Text></TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert(
                          'Eliminar sesión',
                          `¿Eliminar la sesión de entrenamiento del ${formatDateExport(parseToDate(e.fecha)) || e.fecha || 'esta fecha'}?`,
                          [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Eliminar', style: 'destructive', onPress: () => onDeleteSession(e.id, 'ENT') }
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
                  <View key={p.id} style={[styles.matchHeaderCol, { width: MATCH_COL_W }]}>
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
                    <View style={styles.subHeaderRow}><Text style={styles.subH}>AS</Text><Text style={styles.subH}>C</Text><Text style={styles.subH}>G</Text><Text style={styles.subH}>MIN</Text></View>
                  </View>
              )) : RESUMEN_COLUMNS.map(h => (
                 <View key={h} style={[styles.dateCol, { width: GLOB_COL_W }]}><Text style={styles.globH}>{h}</Text></View>
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
  if (!statsCalculadas?.resComp || !statsCalculadas?.jugadores || !statsCalculadas?.local || !statsCalculadas?.visita) {
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
            <Text style={styles.tableCell}>{`${j.global?.ent ?? 0}/${entrenos.length}`}</Text>
            <Text style={styles.tableCell}>{`${j.global?.par ?? 0}/${partidosList.length}`}</Text>
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
              const partidosComp = partidosList.filter(p => (p.tipo?.toUpperCase()||'LIGA')===c).length;
              return (
                <View key={j.id} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{j.name}</Text>
                  <Text style={styles.tableCell}>{`${j.global?.ent ?? 0}/${entrenos.length}`}</Text>
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
    <View style={styles.container}>
      <View style={styles.headerNav}>
        <Text style={styles.title}>ESTADÍSTICAS</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={onBack} style={styles.exitTopBtn}>
            <Text style={styles.exitTopBtnTxt}>SALIR</Text>
          </TouchableOpacity>
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
                    style={styles.modalActaImage}
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
  tabContainer: { flexDirection: 'row', backgroundColor: '#012E57', padding: 5, gap: 4 },
  tab: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 8, backgroundColor: '#001A33' },
  activeTab: { backgroundColor: '#1565C0' },
  tabTxt: { color: '#FFF', fontSize: 8, fontWeight: 'bold' },
  headerCell: { backgroundColor: '#012E57', justifyContent: 'center', padding: 10, borderBottomWidth: 1, borderColor: '#1565C0' },
  headerLabel: { color: '#00aaff', fontSize: 10, fontWeight: 'bold' },
  sectHeader: { height: SECTION_SPACER_H, backgroundColor: '#001326', justifyContent: 'center', paddingHorizontal: 10 },
  sectTitle: { color: '#1565C0', fontSize: 10, fontWeight: 'bold' },
  nameRow: { justifyContent: 'center', paddingHorizontal: 10, borderBottomWidth: 0.5, borderColor: '#012E57' },
  nameTxt: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
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
  subH: { width: SUB_COL_W, textAlign: 'center', color: '#00aaff', fontSize: 8, fontWeight: 'bold', paddingVertical: 2 },
  subCol: { width: SUB_COL_W, justifyContent: 'center', alignItems: 'center' },
  subColTxt: { color: '#FFF', fontSize: 10 },
  globH: { color: '#00aaff', fontSize: 8, fontWeight: 'bold', textAlign:'center' },
  globC: { fontSize: 10, fontWeight: 'bold', textAlign:'center' },
  objetivosResumenTxt: { color: '#B0BEC5', fontSize: 10, marginTop: 4 },
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
  modalActaImage: { width: '100%', minHeight: 480 },
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
sectionSubtitle: { color:'#00D4FF', fontWeight:'bold', fontSize:12, marginBottom:4 }
});