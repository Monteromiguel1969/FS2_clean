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

        <Section title="8) Stats (analisis completo)" />
        <SubSection title="8.1 Pestanas y lectura rapida" />
        <Paragraph>• ENTRENOS: asistencia por sesion, con vista cronologica y resumen de objetivos tacticos mas repetidos.</Paragraph>
        <Paragraph>• PARTIDOS: asistencia de convocatoria, capitanias, goles y minutos por encuentro.</Paragraph>
        <Paragraph>• RESUMEN: tabla global por persona con Ent(N), Ent(%), Par(N), Par(%), Dedic., Goles, Cap y Min.</Paragraph>
        <Paragraph>• DI: nueva pestana para consultar Valoracion IA, D.I. global, Evaluacion personal y fecha de ultima evaluacion personal.</Paragraph>
        <Paragraph>• FINAL: bloques de rendimiento del equipo, local/visitante, pichichis y rendimiento individual por competicion.</Paragraph>
        <SubSection title="8.2 Dedicacion global (nueva columna)" />
        <Paragraph>• Formula: (Ent asistidos + Par asistidos) / (Total entrenos + Total partidos) * 100.</Paragraph>
        <Paragraph>• Permite medir compromiso total combinado, no solo por entrenos o partidos por separado.</Paragraph>
        <SubSection title="8.3 Exportacion PDF desde Stats" />
        <Paragraph>• El boton EXPORTAR genera el PDF de la pestana que tengas activa en ese momento.</Paragraph>
        <Paragraph>• En RESUMEN se incluye la columna Dedicacion global.</Paragraph>
        <Paragraph>• En DI se exporta la tabla de valoraciones D.I. y evaluacion personal.</Paragraph>
        <Paragraph>• Recomendacion: revisa primero en pantalla y luego exporta para evitar versiones duplicadas.</Paragraph>
        <SubSection title="8.4 Adaptacion visual automatica" />
        <Paragraph>• Las tablas ajustan tipografia, paddings y etiquetas segun el ancho real del dispositivo.</Paragraph>
        <Paragraph>• En moviles muy estrechos se acortan cabeceras para mantener legibilidad sin solapes.</Paragraph>

        <Section title="9) Calendario" />
        <SubSection title="9.1 Tipos de evento" />
        <Paragraph>• Gestion de Partido, Entrenamiento u Otro con campos adaptados a cada tipo.</Paragraph>
        <Paragraph>• Fecha en formato dd/mm/aaaa y semana iniciando en lunes.</Paragraph>
        <SubSection title="9.2 Ubicacion y exportacion" />
        <Paragraph>• En Partido puedes generar ubicacion de Google Maps automaticamente desde el lugar.</Paragraph>
        <Paragraph>• Al exportar, decides si incluir o no la ubicacion.</Paragraph>

        <Section title="10) Gestion de datos (Google Sheets / Drive)" />
        <SubSection title="10.1 Conexion y formatos aceptados" />
        <Paragraph>• Puedes pegar ID del spreadsheet o URL completa del documento.</Paragraph>
        <Paragraph>• La app sincroniza Plantilla, Entrenamientos y Partidos, y exporta vistas especiales de evaluaciones.</Paragraph>
        <SubSection title="10.2 Exportaciones de Evaluaciones D.I. (nuevas vistas)" />
        <Paragraph>• Se mantiene la exportacion tradicional en formato largo (sin romper flujos anteriores).</Paragraph>
        <Paragraph>• Ademas se generan automaticamente estas hojas nuevas si no existen:</Paragraph>
        <Paragraph>• 1) Evaluacion_DI_IA_Matriz: items/bloques IA por filas, nominales por columnas y resultados por fila.</Paragraph>
        <Paragraph>• 2) Evaluacion_DI_Personal_Matriz: preguntas del formulario personal por filas, nominales por columnas y resultados por fila.</Paragraph>
        <Paragraph>• 3) Historico_Evaluaciones: fechas por filas y nominales por columnas con evolucion de evaluaciones globales.</Paragraph>
        <Paragraph>• En caso de varias evaluaciones del mismo dia para un jugador, prevalece la ultima registrada.</Paragraph>
        <SubSection title="10.3 Consejos de sincronizacion segura" />
        <Paragraph>• Antes de importar, exporta una copia de seguridad para poder volver atras.</Paragraph>
        <Paragraph>• Si detectas diferencias, verifica nominales, fechas y que el spreadsheet/script sean los correctos.</Paragraph>
        <Paragraph>• Si una hoja no aparece, repite una exportacion completa de evaluaciones; la creacion es automatica.</Paragraph>
        <SubSection title="10.4 Drive y documentos" />
        <Paragraph>• Las actas e informes pueden compartirse o imprimirse desde la vista previa.</Paragraph>
        <Paragraph>• Si vinculas Drive, puedes recuperar archivos incluso al cambiar de dispositivo.</Paragraph>

        <Section title="11) Previsualizaciones, zoom y rotacion" />
        <SubSection title="11.1 Zoom con los dedos (pinch)" />
        <Paragraph>• Las previsualizaciones de exportaciones (informes, listados y formularios) permiten zoom con los dedos.</Paragraph>
        <Paragraph>• Esto facilita validar detalle fino antes de compartir o imprimir.</Paragraph>
        <SubSection title="11.2 Rotacion global de pantalla" />
        <Paragraph>• La app permite girar entre vertical y horizontal segun orientacion del dispositivo.</Paragraph>
        <Paragraph>• En horizontal tendras mas anchura para tablas y revisiones de informes largos.</Paragraph>
        <SubSection title="11.3 Recomendacion practica" />
        <Paragraph>• Para revisar tablas anchas (Stats o matrices), usa horizontal; para carga de datos rapida, vertical.</Paragraph>

        <Section title="12) Copias de seguridad y actualizaciones" />
        <SubSection title="12.1 Buenas practicas" />
        <Paragraph>• Exporta datos antes de instalar una nueva APK.</Paragraph>
        <Paragraph>• Mantener package/app id y versionCode en orden evita conflictos y perdida de datos al actualizar.</Paragraph>
        <Paragraph>• Guarda la APK final en carpeta de releases para trazabilidad de versiones.</Paragraph>
        <SubSection title="12.2 Si aparece un problema" />
        <Paragraph>• Verifica primero que instalaste la APK correcta de la version esperada.</Paragraph>
        <Paragraph>• Si algo no cuadra, revisa Gestion de datos, nominales, fechas y configuracion de spreadsheet/script.</Paragraph>
        <Paragraph>• Ante duda, exporta backup, limpia inconsistencias y vuelve a importar de forma controlada.</Paragraph>

        <Section title="13) Novedades por version" />
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

        <Section title="14) Guia rapida de operacion diaria (resumen)" />
        <Paragraph>• 1) Antes de actividad: revisar Plantilla (disponibilidad, roles y datos basicos).</Paragraph>
        <Paragraph>• 2) Entreno/partido: registrar asistencia y eventos (cronometro en vivo si aplica).</Paragraph>
        <Paragraph>• 3) Post actividad: importar cronometro en Partidos y validar acta/informe.</Paragraph>
        <Paragraph>• 4) Seguimiento: revisar Stats (RESUMEN + DI) y detectar tendencias.</Paragraph>
        <Paragraph>• 5) Cierre semanal: exportar a Google Sheets/Drive y guardar backup local.</Paragraph>
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
