import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, ActivityIndicator } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import {
  exportPlantilla,
  importPlantilla,
  exportPartidosSoloNuevos,
  importPartidos,
  exportEntrenamientosSoloNuevos,
  importEntrenamientos,
  exportEvaluacionesDI,
  exportEvaluacionesDIViews,
  importEvaluacionesDI,
} from '../services/googleSheetsService';
import { normalizePlayerRatings } from '../utils/playerRating';

const PREFIJO = '@Leganes_Amas_B_2025-26:';

// Formatea fecha a DD/MM/YYYY para export/import
export function formatFechaDDMMYYYY(date: Date | string): string {
  if (typeof date === 'string') {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

interface GestionDatosModalProps {
  visible: boolean;
  onClose: () => void;
  players: any[];
  partidos: any[];
  entrenos: any[];
  setPlayers: (data: any[]) => Promise<void>;
  setPartidos: (data: any[]) => Promise<void>;
  setEntrenos: (data: any[]) => Promise<void>;
}

export default function GestionDatosModal({
  visible,
  onClose,
  players,
  partidos,
  entrenos,
  setPlayers,
  setPartidos,
  setEntrenos,
}: GestionDatosModalProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const isIADetailEvaluation = (ev: any) =>
    Array.isArray(ev?.bloques) && ev.bloques.length > 0;

  const keepEvaluacionesByKind = (player: any, kind: 'ia' | 'personal') => {
    const evals = Array.isArray(player?.evaluacionesDI) ? player.evaluacionesDI : [];
    return evals.filter((ev: any) => (kind === 'ia' ? isIADetailEvaluation(ev) : !isIADetailEvaluation(ev)));
  };

  const handleExportPlantilla = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'No hay plantilla para exportar');
      return;
    }
    setLoading('plantilla');
    try {
      const result = await exportPlantilla(players);
      Alert.alert(result.success ? 'Éxito' : 'Error', result.message);
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportPlantilla = async () => {
    Alert.alert(
      'Importar Plantilla',
      '¿Importar desde Google Sheets? Esto reemplazará los datos actuales.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('plantilla');
            try {
              const result = await importPlantilla();
              if (result.success && result.data) {
                await setPlayers(result.data);
                Alert.alert('Éxito', result.message);
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportPartidos = async () => {
    if (partidos.length === 0) {
      Alert.alert('Aviso', 'No hay partidos para exportar');
      return;
    }
    setLoading('partidos');
    try {
      const result = await exportPartidosSoloNuevos(partidos, players);
      Alert.alert(result.success ? 'Éxito' : 'Error', result.message);
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportPartidos = async () => {
    Alert.alert(
      'Importar Partidos',
      '¿Importar desde Google Sheets? Esto reemplazará los datos actuales.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('partidos');
            try {
              const result = await importPartidos(players);
              if (result.success && result.data) {
                await setPartidos(result.data);
                Alert.alert('Éxito', result.message);
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportEntrenamientos = async () => {
    if (entrenos.length === 0) {
      Alert.alert('Aviso', 'No hay entrenamientos para exportar');
      return;
    }
    setLoading('entrenos');
    try {
      const result = await exportEntrenamientosSoloNuevos(entrenos, players);
      Alert.alert(result.success ? 'Éxito' : 'Error', result.message);
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportEntrenamientos = async () => {
    Alert.alert(
      'Importar Entrenamientos',
      '¿Importar desde Google Sheets? Esto reemplazará los datos actuales.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('entrenos');
            try {
              const result = await importEntrenamientos(players);
              if (result.success && result.data) {
                await setEntrenos(result.data);
                Alert.alert('Éxito', result.message);
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportPonderacionIA = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'No hay plantilla; añade jugadores antes de exportar ponderación IA.');
      return;
    }
    setLoading('formIA');
    try {
      const payload = players.map((p) => ({ ...p, evaluacionesDI: keepEvaluacionesByKind(p, 'ia') }));
      const result = await exportEvaluacionesDI(payload);
      if (!result.success) {
        Alert.alert('Error', result.message);
        return;
      }
      const viewsResult = await exportEvaluacionesDIViews(players);
      if (viewsResult.success) {
        Alert.alert(
          'Éxito',
          `${result.message}\nVistas D.I. actualizadas (IA: ${viewsResult.iaRows ?? 0} filas, Personal: ${viewsResult.personalRows ?? 0} filas, Jugadores: ${viewsResult.players ?? 0}).`
        );
      } else {
        Alert.alert(
          'Aviso',
          `${result.message}\nLas vistas D.I. no se pudieron actualizar: ${viewsResult.message}`
        );
      }
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportPonderacionIA = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'Importa primero la plantilla o crea jugadores en el dispositivo.');
      return;
    }
    Alert.alert(
      'Importar ponderación IA',
      '¿Traer la hoja Evaluacion_DI desde Google Sheets? Se importará solo la parte de ponderación IA.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('formIA');
            try {
              const result = await importEvaluacionesDI(players);
              if (result.success && result.data) {
                const byId = new Map((result.data || []).map((p: any) => [String(p?.id || ''), p]));
                const merged = players.map((current: any) => {
                  const imported = byId.get(String(current?.id || ''));
                  if (!imported) return current;
                  const currentPersonal = keepEvaluacionesByKind(current, 'personal');
                  const importedIA = keepEvaluacionesByKind(imported, 'ia');
                  return { ...current, ...imported, evaluacionesDI: [...currentPersonal, ...importedIA] };
                });
                const normalized = merged.map((p: any, i: number) =>
                  normalizePlayerRatings(p, players[i], { partidos, entrenos })
                );
                await setPlayers(normalized);
                Alert.alert('Éxito', result.message);
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleExportFormularioPersonal = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'No hay plantilla; añade jugadores antes de exportar formulario personal.');
      return;
    }
    setLoading('formPersonal');
    try {
      const payload = players.map((p) => ({ ...p, evaluacionesDI: keepEvaluacionesByKind(p, 'personal') }));
      const result = await exportEvaluacionesDI(payload);
      if (!result.success) {
        Alert.alert('Error', result.message);
        return;
      }
      const viewsResult = await exportEvaluacionesDIViews(players);
      if (viewsResult.success) {
        Alert.alert(
          'Éxito',
          `${result.message}\nVistas D.I. actualizadas (IA: ${viewsResult.iaRows ?? 0} filas, Personal: ${viewsResult.personalRows ?? 0} filas, Jugadores: ${viewsResult.players ?? 0}).`
        );
      } else {
        Alert.alert('Aviso', `${result.message}\nLas vistas D.I. no se pudieron actualizar: ${viewsResult.message}`);
      }
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportFormularioPersonal = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'Importa primero la plantilla o crea jugadores en el dispositivo.');
      return;
    }
    Alert.alert(
      'Importar formulario personal',
      '¿Traer la hoja Evaluacion_DI desde Google Sheets? Se importará solo la parte de formulario personal.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('formPersonal');
            try {
              const result = await importEvaluacionesDI(players);
              if (result.success && result.data) {
                const byId = new Map((result.data || []).map((p: any) => [String(p?.id || ''), p]));
                const merged = players.map((current: any) => {
                  const imported = byId.get(String(current?.id || ''));
                  if (!imported) return current;
                  const currentIA = keepEvaluacionesByKind(current, 'ia');
                  const importedPersonal = keepEvaluacionesByKind(imported, 'personal');
                  return { ...current, ...imported, evaluacionesDI: [...currentIA, ...importedPersonal] };
                });
                const normalized = merged.map((p: any, i: number) =>
                  normalizePlayerRatings(p, players[i], { partidos, entrenos })
                );
                await setPlayers(normalized);
                Alert.alert('Éxito', result.message);
              } else {
                Alert.alert('Error', result.message);
              }
            } catch (e) {
              Alert.alert('Error', `Error: ${(e as Error).message}`);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  };

  const RowAction = ({
    label,
    loadingKey,
    onExport,
    onImport,
  }: {
    label: string;
    loadingKey: string;
    onExport: () => void;
    onImport: () => void;
  }) => (
    <View style={styles.rowAction}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.btnGroup}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.exportBtn]}
          onPress={onExport}
          disabled={!!loading}
        >
          {loading === loadingKey ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.actionBtnTxt}>EXPORTAR</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.importBtn]}
          onPress={onImport}
          disabled={!!loading}
        >
          {loading === loadingKey ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.actionBtnTxt}>IMPORTAR</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>GESTIÓN DE DATOS</Text>
          <Text style={styles.subtitle}>Importar / Exportar con Google Sheets</Text>

          <RowAction
            label="Plantilla"
            loadingKey="plantilla"
            onExport={handleExportPlantilla}
            onImport={handleImportPlantilla}
          />
          <RowAction
            label="Partidos"
            loadingKey="partidos"
            onExport={handleExportPartidos}
            onImport={handleImportPartidos}
          />
          <RowAction
            label="Entrenamientos"
            loadingKey="entrenos"
            onExport={handleExportEntrenamientos}
            onImport={handleImportEntrenamientos}
          />
          <RowAction
            label="Ponderación IA"
            loadingKey="formIA"
            onExport={handleExportPonderacionIA}
            onImport={handleImportPonderacionIA}
          />
          <RowAction
            label="Formulario Personal"
            loadingKey="formPersonal"
            onExport={handleExportFormularioPersonal}
            onImport={handleImportFormularioPersonal}
          />

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnTxt}>CERRAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: '#012E57',
    width: '90%',
    borderRadius: 15,
    padding: 20,
  },
  title: { color: '#FFF', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  subtitle: { color: '#00aaff', fontSize: 10, textAlign: 'center', marginBottom: 20 },
  rowAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#001A33',
  },
  rowLabel: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  btnGroup: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 85,
    alignItems: 'center',
  },
  exportBtn: { backgroundColor: '#2E7D32' },
  importBtn: { backgroundColor: '#1565C0' },
  actionBtnTxt: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  closeBtn: {
    backgroundColor: '#C62828',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 15,
  },
  closeBtnTxt: { color: '#FFF', fontWeight: 'bold' },
});
