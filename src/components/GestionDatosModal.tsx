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
  exportEvaluacionesDIIA,
  exportEvaluacionesDIPersonal,
  exportEvaluacionesDIViewsIA,
  exportEvaluacionesDIViewsPersonal,
  importEvaluacionesDIIA,
  importEvaluacionesDIPersonal,
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

  const handleExportFormularioIA = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'No hay plantilla; añade jugadores antes de exportar la ponderación IA.');
      return;
    }
    setLoading('formIA');
    try {
      const result = await exportEvaluacionesDIIA(players);
      if (!result.success) {
        Alert.alert('Error', result.message);
        return;
      }
      const viewsResult = await exportEvaluacionesDIViewsIA(players);
      if (viewsResult.success) {
        Alert.alert(
          'Éxito',
          `${result.message}\nVista IA actualizada (${viewsResult.iaRows ?? 0} filas).`
        );
      } else {
        Alert.alert(
          'Aviso',
          `${result.message}\nLa vista IA no se pudo actualizar: ${viewsResult.message}`
        );
      }
    } catch (e) {
      Alert.alert('Error', `Error: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const handleImportFormularioIA = async () => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'Importa primero la plantilla o crea jugadores en el dispositivo.');
      return;
    }
    Alert.alert(
      'Importar ponderación IA',
      '¿Traer solo evaluaciones de tipo IA desde la hoja Evaluacion_DI? Se actualizarán solo esos registros.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('formIA');
            try {
              const result = await importEvaluacionesDIIA(players);
              if (result.success && result.data) {
                const normalized = result.data.map((p, i) =>
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
      Alert.alert('Aviso', 'No hay plantilla; añade jugadores antes de exportar el formulario personal.');
      return;
    }
    setLoading('formPersonal');
    try {
      const result = await exportEvaluacionesDIPersonal(players);
      if (!result.success) {
        Alert.alert('Error', result.message);
        return;
      }
      const viewsResult = await exportEvaluacionesDIViewsPersonal(players);
      if (viewsResult.success) {
        Alert.alert(
          'Éxito',
          `${result.message}\nVista Personal actualizada (${viewsResult.personalRows ?? 0} filas).`
        );
      } else {
        Alert.alert(
          'Aviso',
          `${result.message}\nLa vista Personal no se pudo actualizar: ${viewsResult.message}`
        );
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
      '¿Traer solo evaluaciones de tipo formulario personal desde la hoja Evaluacion_DI?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setLoading('formPersonal');
            try {
              const result = await importEvaluacionesDIPersonal(players);
              if (result.success && result.data) {
                const normalized = result.data.map((p, i) =>
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

  const resetEvaluacionesLocales = (kind: 'ia' | 'personal' | 'all') => {
    if (players.length === 0) {
      Alert.alert('Aviso', 'No hay jugadores para reiniciar.');
      return;
    }
    const titleByKind = {
      ia: 'Reiniciar ponderación IA',
      personal: 'Reiniciar formulario personal',
      all: 'Reiniciar todas las evaluaciones',
    } as const;
    const keyByKind = {
      ia: 'resetIA',
      personal: 'resetPersonal',
      all: 'resetAll',
    } as const;
    const msgByKind = {
      ia: 'Se borrarán solo las evaluaciones IA guardadas en este dispositivo. No afecta partidos/entrenos/plantilla.',
      personal: 'Se borrarán solo los formularios personales guardados en este dispositivo. No afecta partidos/entrenos/plantilla.',
      all: 'Se borrarán todas las evaluaciones (IA + personal) guardadas en este dispositivo.',
    } as const;

    Alert.alert(titleByKind[kind], msgByKind[kind], [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          setLoading(keyByKind[kind]);
          try {
            let removedCount = 0;
            const updated = players.map((p: any, i: number) => {
              const evals = Array.isArray(p?.evaluacionesDI) ? p.evaluacionesDI : [];
              const next =
                kind === 'all'
                  ? []
                  : evals.filter((ev: any) => {
                      const isPersonal = !!(ev?.personalForm && typeof ev.personalForm === 'object');
                      return kind === 'ia' ? isPersonal : !isPersonal;
                    });
              removedCount += Math.max(0, evals.length - next.length);
              return normalizePlayerRatings(
                { ...p, evaluacionesDI: next },
                players[i],
                { partidos, entrenos }
              );
            });
            await setPlayers(updated);
            Alert.alert('Hecho', `Borradas ${removedCount} evaluación(es) en local.`);
          } catch (e) {
            Alert.alert('Error', `Error: ${(e as Error).message}`);
          } finally {
            setLoading(null);
          }
        },
      },
    ]);
  };

  const handleResetFormularioIA = () => resetEvaluacionesLocales('ia');
  const handleResetFormularioPersonal = () => resetEvaluacionesLocales('personal');
  const handleResetFormulariosTodo = () => resetEvaluacionesLocales('all');

  const RowAction = ({
    label,
    loadingKey,
    onExport,
    onImport,
    onReset,
    resetLoadingKey,
  }: {
    label: string;
    loadingKey: string;
    onExport: () => void;
    onImport: () => void;
    onReset?: () => void;
    resetLoadingKey?: string;
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
        {onReset ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.resetBtn]}
            onPress={onReset}
            disabled={!!loading}
          >
            {loading === (resetLoadingKey || loadingKey) ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.actionBtnTxt}>BORRAR</Text>
            )}
          </TouchableOpacity>
        ) : null}
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
            onExport={handleExportFormularioIA}
            onImport={handleImportFormularioIA}
            onReset={handleResetFormularioIA}
            resetLoadingKey="resetIA"
          />
          <RowAction
            label="Formulario Personal"
            loadingKey="formPersonal"
            onExport={handleExportFormularioPersonal}
            onImport={handleImportFormularioPersonal}
            onReset={handleResetFormularioPersonal}
            resetLoadingKey="resetPersonal"
          />
          <TouchableOpacity
            style={[styles.closeBtn, styles.resetAllBtn]}
            onPress={handleResetFormulariosTodo}
            disabled={!!loading}
          >
            {loading === 'resetAll' ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.closeBtnTxt}>REINICIAR TODAS LAS EVALUACIONES (LOCAL)</Text>
            )}
          </TouchableOpacity>

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
  resetBtn: { backgroundColor: '#B71C1C' },
  actionBtnTxt: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  closeBtn: {
    backgroundColor: '#C62828',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 15,
  },
  resetAllBtn: { backgroundColor: '#8E24AA', marginTop: 6 },
  closeBtnTxt: { color: '#FFF', fontWeight: 'bold' },
});
