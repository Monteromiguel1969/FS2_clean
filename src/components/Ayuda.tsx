import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { HELP_CHANGELOG } from '../data/helpChangelog';

export default function Ayuda({ onBack }: { onBack: () => void }) {
  const appVersion =
    (Constants?.expoConfig as any)?.version ||
    (Constants as any)?.manifest2?.extra?.expoClient?.version ||
    'N/D';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backTxt}>← VOLVER</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AYUDA</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator>
        <Text style={styles.mainTitle}>Manual completo de uso</Text>
        <Text style={styles.subtitle}>Version instalada: {appVersion}</Text>

        <Section title="1) Inicio y navegacion general" />
        <SubSection title="1.1 Flujo de entrada" />
        <Paragraph>• Primero selecciona el equipo/temporada activa. Todo lo que guardes despues se vincula a ese contexto.</Paragraph>
        <Paragraph>• En el menu principal tienes acceso directo a todos los modulos: Plantilla, Entrenos, Partidos, Cronometro, Pizarra, Stats, Calendario, Ayuda y Gestion de datos.</Paragraph>
        <Paragraph>• La app guarda datos en el dispositivo para trabajar sin conexion; cuando haya conectividad puedes sincronizar con Google Sheets/Drive.</Paragraph>
        <SubSection title="1.2 Recomendacion de uso diario" />
        <Paragraph>• Antes de entrenar/partido: revisa Plantilla y disponibilidad.</Paragraph>
        <Paragraph>• Durante partido: registra en Cronometro.</Paragraph>
        <Paragraph>• Despues: importa a Partidos, valida informe y exporta copia de seguridad.</Paragraph>

        <Section title="2) Plantilla" />
        <SubSection title="2.1 Alta y edicion de ficha" />
        <Paragraph>• Cada ficha permite foto, nombre completo, nombre nominal, fecha de nacimiento, edad calculada, dorsal y numero de licencia.</Paragraph>
        <Paragraph>• Puedes definir rol (Jugador/Monitor), posicion(es), lado(s) de juego, perfil tactico, estado fisico y disponibilidad.</Paragraph>
        <Paragraph>• En Jugador estan disponibles las tallas: superior, inferior, talla de pies y numero de pie.</Paragraph>
        <SubSection title="2.2 Valoraciones" />
        <Paragraph>• Valoracion Staff: la introduces manualmente (1-5) segun observacion del cuerpo tecnico.</Paragraph>
        <Paragraph>• Valoracion IA: se calcula automaticamente al guardar la ficha a partir de la informacion disponible.</Paragraph>
        <Paragraph>• Puedes borrar evaluaciones concretas por jugador (IA o personal) desde su historial, sin borrar toda la plantilla.</Paragraph>
        <Paragraph>• La Ficha de Ponderacion IA dispone de vista previa ampliable con pellizco y opcion de exportar/compartir en PDF.</Paragraph>
        <SubSection title="2.3 Listado personalizado" />
        <Paragraph>• Boton de listado: seleccionas campos, ves vista previa y exportas en PDF por menu de compartir.</Paragraph>
        <Paragraph>• Util para convocatorias, control de equipaciones o informes de temporada.</Paragraph>
        <SubSection title="2.4 Consejos" />
        <Paragraph>• Mantener nombre nominal consistente evita errores al cruzar datos con Partidos/Stats.</Paragraph>
        <Paragraph>• Si cambias muchos datos, guarda y vuelve a abrir para confirmar que todo queda persistido.</Paragraph>

        <Section title="3) Entrenamientos" />
        <SubSection title="3.1 Registro de sesiones" />
        <Paragraph>• Crea una sesion por fecha y marca asistencia por jugador con estados AS, AV o NA.</Paragraph>
        <Paragraph>• Puedes anotar objetivos, enfoque de la sesion y observaciones.</Paragraph>
        <SubSection title="3.2 Uso recomendado" />
        <Paragraph>• Registra siempre al terminar para no perder detalle de asistencia real.</Paragraph>
        <Paragraph>• Exporta periodicamente para consolidar historico fuera del dispositivo.</Paragraph>

        <Section title="4) Partidos y acta" />
        <SubSection title="4.1 Ficha de partido" />
        <Paragraph>• Incluye rival, fecha, lugar, tipo de competicion, goles, convocatoria y minutos.</Paragraph>
        <Paragraph>• Puedes importar automaticamente datos del cronometro para evitar doble trabajo.</Paragraph>
        <SubSection title="4.2 Acta del partido" />
        <Paragraph>• Admite imagen o PDF: seleccionar archivo, hacer foto, compartir o abrir desde Drive.</Paragraph>
        <Paragraph>• Si subes a Drive, queda vinculada al partido y recuperable aunque cambies de dispositivo.</Paragraph>
        <Paragraph>• Tambien puedes importar actas existentes desde la carpeta de Drive.</Paragraph>
        <SubSection title="4.3 Historico" />
        <Paragraph>• El historico permite reabrir, editar, corregir y volver a exportar informes.</Paragraph>
        <Paragraph>• Ideal para ajustar datos tras revisiones de video/acta oficial.</Paragraph>

        <Section title="5) Informes de partido" />
        <SubSection title="5.1 Vista previa y salida" />
        <Paragraph>• El informe se visualiza dentro de la app para revisar contenido antes de compartir.</Paragraph>
        <Paragraph>• Opciones de salida: imprimir y compartir/exportar PDF.</Paragraph>
        <Paragraph>• La vista previa corresponde al formato final exportado.</Paragraph>
        <SubSection title="5.2 Recomendacion" />
        <Paragraph>• Revisa primero nombres, minutos y goleadores; despues exporta para evitar duplicados de versiones.</Paragraph>

        <Section title="6) Cronometro" />
        <SubSection title="6.1 Funcionamiento" />
        <Paragraph>• Control por periodos con tiempos de juego, eventos, goles y seguimiento del partido en vivo.</Paragraph>
        <Paragraph>• Permite reflejar dinamica real para analisis posterior.</Paragraph>
        <Paragraph>• Hay dos conteos independientes: tiempo del partido y tiempo de cambios.</Paragraph>
        <Paragraph>• Puedes activar alarma periodica (pitido + vibracion) cada X minutos (1 a 15).</Paragraph>
        <SubSection title="6.2 Integracion" />
        <Paragraph>• Los datos del cronometro se importan en Partidos y alimentan estadisticas.</Paragraph>
        <Paragraph>• Esto reduce errores manuales y mejora la trazabilidad de cada encuentro.</Paragraph>

        <Section title="7) Pizarra" />
        <SubSection title="7.1 Sistemas y asignacion" />
        <Paragraph>• Selecciona sistemas tacticos, visualiza alineacion ideal y asigna jugadores por puesto.</Paragraph>
        <Paragraph>• Puedes usar autoasignacion o configuracion manual segun necesidad del partido.</Paragraph>
        <SubSection title="7.2 Herramientas de dibujo" />
        <Paragraph>• Preparacion de jugadas con trazos y escenarios tacticos para explicacion al equipo.</Paragraph>
        <Paragraph>• El scroll y los paneles estan adaptados para movil y zona de gestos.</Paragraph>
        <Paragraph>• La pizarra se mantiene fija, pero las fichas de jugadores se ajustan al giro del dispositivo para facilitar lectura.</Paragraph>
        <Paragraph>• En banquillo, el nombre aparece debajo de cada jugador; en pista se prioriza la vista limpia del campo.</Paragraph>

        <Section title="8) Stats" />
        <SubSection title="8.1 Que muestra" />
        <Paragraph>• Estadisticas por entrenamientos, partidos y resumen global del rendimiento.</Paragraph>
        <Paragraph>• Te ayuda a detectar regularidad, aportacion ofensiva y disponibilidad.</Paragraph>
        <SubSection title="8.2 Exportacion" />
        <Paragraph>• Exporta lo visible en la pestana activa para compartir con staff o direccion deportiva.</Paragraph>

        <Section title="9) Calendario" />
        <SubSection title="9.1 Tipos de evento" />
        <Paragraph>• Gestion de Partido, Entrenamiento u Otro con campos adaptados a cada tipo.</Paragraph>
        <Paragraph>• Fecha en formato dd/mm/aaaa y semana iniciando en lunes.</Paragraph>
        <SubSection title="9.2 Ubicacion y exportacion" />
        <Paragraph>• En Partido puedes generar ubicacion de Google Maps automaticamente desde el lugar.</Paragraph>
        <Paragraph>• Al exportar, decides si incluir o no la ubicacion.</Paragraph>
        <Paragraph>• En el menu principal veras un resumen automatico de eventos de los proximos 7 dias (incluyendo hoy).</Paragraph>

        <Section title="10) Gestion de datos (Google Sheets)" />
        <SubSection title="10.1 Sincronizacion" />
        <Paragraph>• Importa/exporta Plantilla, Partidos y Entrenamientos.</Paragraph>
        <Paragraph>• Acepta tanto ID de spreadsheet como URL completa del documento.</Paragraph>
        <Paragraph>• La app valida respuestas del script para evitar errores de parseo cuando Google devuelve HTML por URL/deploy incorrecto.</Paragraph>
        <SubSection title="10.2 Importante antes de importar" />
        <Paragraph>• Importar reemplaza datos locales por los datos del origen seleccionado.</Paragraph>
        <Paragraph>• Recomendado exportar copia local antes de cada importacion.</Paragraph>
        <Paragraph>• Las fechas se normalizan a formato dd/mm/aaaa al importar, mostrar y exportar.</Paragraph>
        <Paragraph>• Los enlaces de actas se preservan en actualizaciones y sincronizaciones para no perder vinculaciones de Drive.</Paragraph>
        <SubSection title="10.3 Limpieza selectiva de evaluaciones" />
        <Paragraph>• Desde Gestion de datos puedes reiniciar formularios de evaluacion en local (IA, personal o ambos) cuando quieras empezar de cero.</Paragraph>

        <Section title="11) Copias de seguridad y actualizaciones" />
        <SubSection title="11.1 Buenas practicas" />
        <Paragraph>• Exporta datos antes de instalar una nueva APK.</Paragraph>
        <Paragraph>• Mantener package/app id y versionCode en orden evita conflictos y perdida de datos al actualizar.</Paragraph>
        <Paragraph>• Guarda la APK final en carpeta de releases para trazabilidad de versiones.</Paragraph>
        <SubSection title="11.2 Si aparece un problema" />
        <Paragraph>• Verifica primero que instalaste la APK correcta de la version esperada.</Paragraph>
        <Paragraph>• Si algo no cuadra, revisar Gestion de datos y la configuracion de spreadsheet/script.</Paragraph>

        <Section title="12) Novedades por version" />
        {HELP_CHANGELOG.length === 0 ? (
          <View style={styles.versionCard}>
            <Text style={styles.paragraph}>• Historial reiniciado. En proximas versiones apareceran aqui los cambios automaticamente.</Text>
          </View>
        ) : (
          HELP_CHANGELOG.map((item) => (
            <View key={item.version} style={styles.versionCard}>
              <Text style={styles.versionTitle}>v{item.version} ({item.date})</Text>
              {item.changes.map((c, idx) => (
                <Text key={`${item.version}-${idx}`} style={styles.paragraph}>• {c}</Text>
              ))}
            </View>
          ))
        )}

        <View style={styles.footer}>
          <FontAwesome name="info-circle" size={14} color="#1565C0" />
          <Text style={styles.footerTxt}> Este bloque se actualiza automaticamente en cada nueva version.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function SubSection({ title }: { title: string }) {
  return <Text style={styles.subSectionTitle}>{title}</Text>;
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#001A33' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 6 },
  backBtn: { padding: 8 },
  backTxt: { color: '#1565C0', fontWeight: 'bold' },
  title: { flex: 1, color: '#FFF', fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginRight: 44 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 44, paddingHorizontal: 16 },
  mainTitle: { color: '#FFD700', fontSize: 15, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  subtitle: { color: '#90A4AE', fontSize: 12, marginBottom: 16, textAlign: 'center' },
  sectionTitle: { color: '#FFD700', fontSize: 14, fontWeight: 'bold', marginTop: 10, marginBottom: 6 },
  subSectionTitle: { color: '#00BFA5', fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  paragraph: { color: '#E0E0E0', fontSize: 12, lineHeight: 20, marginBottom: 4 },
  versionCard: { backgroundColor: '#012E57', borderRadius: 10, padding: 10, marginTop: 8 },
  versionTitle: { color: '#00BFA5', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 24, paddingVertical: 12 },
  footerTxt: { color: '#1565C0', fontSize: 11 },
});
