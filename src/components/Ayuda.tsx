import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { HELP_CHANGELOG } from '../data/helpChangelog';
import { useScreenMetrics } from '../utils/useScreenMetrics';

export default function Ayuda({ onBack }: { onBack: () => void }) {
  const screen = useScreenMetrics();
  const appVersion =
    (Constants?.expoConfig as any)?.version ||
    (Constants as any)?.manifest2?.extra?.expoClient?.version ||
    'N/D';

  return (
    <SafeAreaView style={[styles.container, { paddingHorizontal: screen.horizontalPadding }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backTxt}>← VOLVER</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AYUDA</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: Math.max(10, screen.horizontalPadding) }]}
        showsVerticalScrollIndicator
      >
        <Text style={styles.mainTitle}>Manual completo de uso</Text>
        <Text style={styles.subtitle}>Version instalada: {appVersion}</Text>
        <Paragraph>
          Esta guia describe la aplicacion de principio a fin: que hace cada pantalla, como preparar un partido, como
          filtrar estadisticas y exportar informes, como usar el calendario y la nube, y buenas practicas de copias de
          seguridad. Los apartados estan ordenados como en el menu principal y en el flujo natural de trabajo.
        </Paragraph>

        <Section title="1) Inicio y navegacion general" />
        <SubSection title="1.1 Flujo de entrada" />
        <Paragraph>• Al abrir la APK veras durante 5 segundos el mensaje de autoria de la aplicacion.</Paragraph>
        <Paragraph>• Primero selecciona el equipo y la temporada activa. Todo lo que guardes despues se vincula a ese contexto (plantilla, partidos, entrenos, calendario local, escudo).</Paragraph>
        <Paragraph>• En la lista de equipos se muestra el escudo del club a la izquierda del nombre para identificar rapido cada contexto.</Paragraph>
        <Paragraph>
          • En el menu principal tienes acceso a: Plantilla, Entrenos, Partidos, Cronometro (configuracion previa al
          partido en vivo), Pizarra, Stats, Calendario, Ayuda y Gestion de datos (modal desde el boton morado).
        </Paragraph>
        <Paragraph>• La app guarda datos en el dispositivo para trabajar sin conexion; cuando haya conectividad puedes sincronizar con Google Sheets y Drive.</Paragraph>
        <Paragraph>• En el menu, bajo SINCRONIZAR, veras «Ultimos datos sync: dd/mm hh:mm» (o Sin sync aun) para saber si los datos estan frescos.</Paragraph>
        <Paragraph>
          • La primera vez que entras, la app puede preguntarte si quieres guardar datos solo en el telefono, solo en la
          nube o en ambos. Si eliges nube o ambos, abre Gestion de datos y usa el asistente guiado para no fallar en la
          configuracion.
        </Paragraph>
        <Paragraph>
          • Roles de acceso: el administrador aprueba usuarios como ENTRENADOR (puede editar) o SOLO LECTURA (consulta
          sin guardar). En Mi cuenta se muestra tu rol; en solo lectura aparece un aviso en el menu.
        </Paragraph>

        <SubSection title="1.2 Recomendacion de uso diario" />
        <Paragraph>• Antes de entrenar o partido: revisa Plantilla y disponibilidad.</Paragraph>
        <Paragraph>• Para partido oficial: entra en Cronometro (ver apartado 6), configura convocatoria y al cerrar arranca el crono en vivo.</Paragraph>
        <Paragraph>• Despues del partido: importa tiempos y goles a Partidos si hace falta, valida convocatoria y acta, y exporta copia de seguridad desde Gestion de datos.</Paragraph>

        <SubSection title="1.3 Orientacion de pantalla" />
        <Paragraph>• En casi todas las pantallas puedes girar el movil y la interfaz se adapta (tablas anchas, listados, modales).</Paragraph>
        <Paragraph>• La Pizarra tactica se fuerza en orientacion vertical para dibujar y colocar fichas con comodidad; al salir de la Pizarra vuelve la rotacion libre.</Paragraph>

        <SubSection title="1.4 Cambiar de equipo o temporada" />
        <Paragraph>• Desde el menu principal, al final, puedes cambiar de equipo/temporada. Al cambiar, se cargan los datos guardados para ese par (no se mezclan plantillas ni partidos entre equipos).</Paragraph>

        <Section title="2) Plantilla" />
        <SubSection title="2.1 Alta y edicion de ficha" />
        <Paragraph>• Cada ficha permite foto, nombre completo, nombre nominal, fecha de nacimiento, edad calculada, dorsal y numero de licencia.</Paragraph>
        <Paragraph>• Puedes definir rol (Jugador/Monitor), posicion(es), lado(s) de juego, perfil tactico, estado fisico y disponibilidad.</Paragraph>
        <Paragraph>• En la lista, toca los badges de estado fisico / disponibilidad para ciclarlos sin abrir la ficha. Lesionado marca No disponible automaticamente.</Paragraph>
        <Paragraph>• Configurar partido usa DISPO (excluye LES/NA). Partidos nuevos sugieren AS/AV/NA. En Pizarra, mantén pulsado el banquillo para cambiar disponibilidad.</Paragraph>
        <Paragraph>• En Jugador estan disponibles las tallas: superior, inferior, talla de pies y numero de pie.</Paragraph>
        <SubSection title="2.2 Valoraciones" />
        <Paragraph>• Valoracion Staff: la introduces manualmente (1-5) segun observacion del cuerpo tecnico.</Paragraph>
        <Paragraph>• Valoracion IA: se calcula automaticamente al guardar la ficha a partir de la informacion disponible.</Paragraph>
        <Paragraph>• Puedes borrar evaluaciones concretas por jugador (IA o personal) desde su historial, sin borrar toda la plantilla.</Paragraph>
        <Paragraph>• La Ficha de Ponderacion IA dispone de vista previa ampliable con pellizco y opcion de exportar o compartir en PDF.</Paragraph>
        <SubSection title="2.3 Listado personalizado" />
        <Paragraph>• Boton de listado: seleccionas campos, ves vista previa y exportas en PDF por el menu de compartir del sistema.</Paragraph>
        <Paragraph>• Util para convocatorias, control de equipaciones o informes de temporada.</Paragraph>
        <SubSection title="2.4 Consejos" />
        <Paragraph>• Mantener el nombre nominal consistente evita errores al cruzar datos con Partidos y Stats.</Paragraph>
        <Paragraph>• Si cambias muchos datos, guarda y vuelve a abrir la ficha para confirmar que todo queda persistido.</Paragraph>

        <Section title="3) Entrenamientos" />
        <SubSection title="3.1 Registro de sesiones" />
        <Paragraph>• Crea una sesion por fecha y marca asistencia por jugador con estados AS (asiste), AV (aviso) o NA (no asiste).</Paragraph>
        <Paragraph>• Puedes anotar objetivos, enfoque de la sesion y observaciones.</Paragraph>
        <SubSection title="3.2 Uso recomendado" />
        <Paragraph>• Registra siempre al terminar la sesion para no perder el detalle de asistencia real.</Paragraph>
        <Paragraph>• Exporta periodicamente desde Gestion de datos para consolidar historico fuera del dispositivo.</Paragraph>

        <Section title="4) Partidos y acta" />
        <SubSection title="4.1 Ficha de partido" />
        <Paragraph>• Incluye rival, fecha, lugar, tipo de competicion, goles, convocatoria y minutos por jugador.</Paragraph>
        <Paragraph>• Puedes importar automaticamente datos del cronometro (tiempos por periodo, goles detallados) para evitar doble trabajo.</Paragraph>
        <SubSection title="4.2 Acta del partido" />
        <Paragraph>• Admite imagen o PDF: seleccionar archivo, hacer foto, compartir o abrir desde Drive.</Paragraph>
        <Paragraph>• Si subes a Drive, queda vinculada al partido y recuperable aunque cambies de dispositivo.</Paragraph>
        <Paragraph>• Tambien puedes importar actas existentes desde la carpeta de Drive configurada.</Paragraph>
        <SubSection title="4.3 Historico y edicion" />
        <Paragraph>• El historico permite reabrir, editar, corregir y volver a exportar informes.</Paragraph>
        <Paragraph>• Ideal para ajustar datos tras revisiones de video o acta oficial.</Paragraph>
        <Paragraph>• Desde Stats (pestanas Entrenos o Partidos) puedes saltar a editar una sesion o un partido con los botones E/X de cada columna.</Paragraph>

        <Section title="5) Informes de partido" />
        <SubSection title="5.1 Vista previa y salida" />
        <Paragraph>• El informe se visualiza dentro de la app para revisar contenido antes de compartir.</Paragraph>
        <Paragraph>• Opciones de salida: imprimir y compartir o exportar PDF.</Paragraph>
        <Paragraph>• La vista previa corresponde al formato final exportado.</Paragraph>
        <Paragraph>• Los informes de partido y del cronometro incluyen el escudo del equipo seleccionado en ese momento.</Paragraph>
        <SubSection title="5.2 Recomendacion" />
        <Paragraph>• Revisa primero nombres, minutos y goleadores; despues exporta para evitar duplicados de versiones.</Paragraph>

        <Section title="6) Cronometro (configuracion + partido en vivo)" />
        <SubSection title="6.1 Boton Cronometro en el menu" />
        <Paragraph>
          • El boton rojo CRONOMETRO no abre directamente el tiempo: primero entras en Configurar partido. Alli defines
          rival, duracion de cada parte, numero de partes, lista de convocados y el quinteto inicial en pista (cinco
          jugadores). Los monitores no aparecen en esta convocatoria de pista.
        </Paragraph>
        <Paragraph>• Al confirmar, se abre el cronometro del partido con esa configuracion. Intenta no abandonar la pantalla del cronometro a mitad de partido salvo que lo tengas controlado.</Paragraph>
        <SubSection title="6.2 Funcionamiento del cronometro" />
        <Paragraph>• Control por periodos con tiempos de juego, eventos, goles y seguimiento del partido en vivo.</Paragraph>
        <Paragraph>• Permite reflejar la dinamica real para analisis posterior.</Paragraph>
        <Paragraph>• Hay dos conteos independientes: tiempo del partido y tiempo de cambios.</Paragraph>
        <Paragraph>• Puedes activar alarma periodica (pitido y vibracion) cada X minutos (1 a 15).</Paragraph>
        <SubSection title="6.3 Integracion con Partidos y estadisticas" />
        <Paragraph>• Los datos del cronometro se importan en Partidos y alimentan estadisticas.</Paragraph>
        <Paragraph>• Esto reduce errores manuales y mejora la trazabilidad de cada encuentro.</Paragraph>
        <Paragraph>• Al exportar el informe del cronometro en PDF, el encabezado usa el escudo configurado para el equipo activo.</Paragraph>
        <SubSection title="6.4 Comandos de voz en el cronometro" />
        <Paragraph>
          • Activa VOZ en la cabecera del cronometro. Puedes hablar manteniendo pulsado el boton del microfono (tablet) o el
          boton Vol+ del movil (si VOL+ esta en ON). Suelta al terminar de hablar.
        </Paragraph>
        <Paragraph>• Gol nuestro: «Gol de Pedro», «Gol de pedro», «Gol dorsal 7» o «Gol 7» (mejor si el jugador esta en pista).</Paragraph>
        <Paragraph>• Gol rival: «Gol rival», «Gol contra», «Gol en contra» o «Gol del rival».</Paragraph>
        <Paragraph>• Empezar el reloj de la parte: «Iniciar», «Jugar», «Continuar», «Empezar» o «Reanudar».</Paragraph>
        <Paragraph>
          • Fin de parte (solo cuando el reloj llego a 0 y esta en tiempo anadido +0:01…): «Fin periodo», «Fin parte»,
          «Pitido final de parte» o «Pitido de parte». Abre el informe parcial.
        </Paragraph>
        <Paragraph>
          • Pasar a la siguiente parte (en la pantalla del informe parcial): «Siguiente parte», «Siguiente periodo»,
          «Inicio periodo», «Inicio parte» o «Empezar parte».
        </Paragraph>
        <Paragraph>
          • Cambio completo: «Cambio sale Pedro entra Luis» o «Cambia sale Pedro por Luis» (tambien con dorsales:
          «Cambio sale 7 entra 12»).
        </Paragraph>
        <Paragraph>• Cambio en dos pasos: primero «Sale Pedro», despues «Entra Luis».</Paragraph>
        <Paragraph>
          • Fin del partido (ultima parte, reloj a 0 y tiempo anadido): «Fin partido» o «Pitido final» (no digas «de parte»).
        </Paragraph>
        <Paragraph>• Pausa: «Pausa», «Parar» o «Tiempo muerto».</Paragraph>
        <Paragraph>• Debajo del area de voz veras lo que entendio la app («Gol de Pedro», «Gol rival», etc.). Si sale «No reconocido», repite con frases cortas.</Paragraph>

        <Section title="7) Pizarra" />
        <SubSection title="7.1 Sistemas y asignacion" />
        <Paragraph>• Selecciona sistemas tacticos, visualiza alineacion ideal y asigna jugadores por puesto.</Paragraph>
        <Paragraph>• Puedes usar autoasignacion o configuracion manual segun la necesidad del partido.</Paragraph>
        <SubSection title="7.2 Herramientas de dibujo" />
        <Paragraph>• Preparacion de jugadas con trazos y escenarios tacticos para explicacion al equipo.</Paragraph>
        <Paragraph>• El scroll y los paneles estan adaptados para movil y zona de gestos.</Paragraph>
        <Paragraph>• La pizarra se mantiene en vertical fija, pero las fichas de jugadores se ajustan al giro del dispositivo para facilitar lectura en banquillo.</Paragraph>
        <Paragraph>• En banquillo, el nombre aparece debajo de cada jugador; en pista se prioriza la vista limpia del campo.</Paragraph>

        <Section title="8) Stats (estadisticas)" />
        <SubSection title="8.1 Que muestra" />
        <Paragraph>
          • Pantalla de estadisticas con pestanas: Entrenos (matriz de asistencia por sesion), Partidos (convocatoria y
          acta por partido), Resumen (ratios globales), DI (valoraciones e informacion personal), Final (rendimiento por
          competicion, local/visitante, goleadores e informes detallados).
        </Paragraph>
        <Paragraph>• Sirve para ver regularidad de asistencia, goles, minutos, capitanias y balance competitivo.</Paragraph>
        <SubSection title="8.2 Periodo de analisis y selector de fechas" />
        <Paragraph>
          • Debajo de las pestanas veras el periodo de trabajo: Desde y Hasta. Toca cada fecha para abrir el calendario
          nativo del movil (no hace falta escribir a mano). Los dos selectores y el boton Todo suelen caber en una misma
          linea; en pantallas muy estrechas pueden pasar a dos lineas.
        </Paragraph>
        <Paragraph>
          • Al cargar datos por primera vez, Desde se rellena con la primera fecha encontrada en entrenos y partidos y
          Hasta con la fecha de hoy (puedes cambiarlas en cualquier momento). El boton Todo amplia el rango a todo el
          historico cargado en el dispositivo.
        </Paragraph>
        <Paragraph>
          • Las fechas invalidas o vacias se interpretan con margenes amplios, pero lo recomendable es siempre tener un
          Desde y un Hasta coherentes (el Desde no puede ser posterior al Hasta al exportar).
        </Paragraph>
        <SubSection title="8.3 Que filtra el periodo" />
        <Paragraph>• Entrenos y Partidos: solo se listan sesiones y partidos cuya fecha cae dentro del periodo.</Paragraph>
        <Paragraph>• Resumen y pestana Final: porcentajes, tablas de competicion y rendimiento individual usan solo entrenos y partidos de ese periodo.</Paragraph>
        <Paragraph>
          • DI: las medias y columnas usan las evaluaciones cuya fecha esta en el periodo (si una entrada antigua no
          tiene fecha, se sigue mostrando para no perder historial).
        </Paragraph>
        <Paragraph>
          • Si hay datos en el equipo pero ninguno cae en el periodo elegido, veras un aviso para ampliar el rango o
          pulsar Todo (en Partidos o Entrenos).
        </Paragraph>
        <SubSection title="8.4 Exportar PDF" />
        <Paragraph>• El boton EXPORTAR genera un PDF segun la pestana activa y lo envia al menu de compartir del sistema.</Paragraph>
        <Paragraph>• En la cabecera del PDF aparece el periodo del informe (fecha desde y hasta en formato legible).</Paragraph>
        <Paragraph>• El contenido respeta el mismo filtro que ves en pantalla: no se mezclan sesiones fuera de rango.</Paragraph>
        <SubSection title="8.5 Edicion rapida desde Stats" />
        <Paragraph>• En columnas de entreno: E abre la sesion para editar, X pide confirmacion y elimina la sesion.</Paragraph>
        <Paragraph>• En columnas de partido: ACTA abre documento, E edita partido, X elimina partido.</Paragraph>

        <Section title="9) Calendario" />
        <SubSection title="9.1 Tipos de evento" />
        <Paragraph>• Gestion de Partido, Entrenamiento u Otro con campos adaptados a cada tipo (rival, horas, lugares, equipacion, observaciones, etc.).</Paragraph>
        <Paragraph>• Las fechas se muestran en formato dd/mm/aaaa y la vista semanal inicia en lunes.</Paragraph>
        <SubSection title="9.2 Vista y partidos importados" />
        <Paragraph>• Los partidos de la temporada aparecen integrados con los eventos manuales que crees al pulsar un dia.</Paragraph>
        <Paragraph>• Puedes abrir un partido existente desde el calendario para revisarlo en la ficha de Partidos.</Paragraph>
        <SubSection title="9.3 Exportar calendario" />
        <Paragraph>
          • Desde la propia pantalla de Calendario puedes abrir el modal de exportacion. Alli defines el rango Desde /
          Hasta tocando las fechas (calendario nativo en movil; en web se puede escribir YYYY-MM-DD). Por defecto Hasta
          es la fecha de hoy.
        </Paragraph>
        <Paragraph>• Exportar listado filtrado (PDF): tabla con tipo, fecha, detalle, estado, resultado y enlace a Google Maps si existe.</Paragraph>
        <Paragraph>
          • Exportar rejilla por meses (PDF, rango): genera una pagina por cada mes comprendido entre las fechas; en cada
          dia solo se listan actividades cuya fecha cae dentro del periodo elegido.
        </Paragraph>
        <Paragraph>• Usar mes actual rellena Desde y Hasta con el primer y ultimo dia del mes en curso.</Paragraph>
        <SubSection title="9.4 Resumen en el menu principal" />
        <Paragraph>• En el menu principal veras un resumen automatico de eventos de calendario para los proximos 7 dias (incluye hoy).</Paragraph>
        <SubSection title="9.5 Ubicacion en partidos" />
        <Paragraph>• En evento tipo Partido puedes generar ubicacion de Google Maps automaticamente desde el lugar del encuentro.</Paragraph>

        <Section title="10) Gestion de datos (Google Sheets)" />
        <SubSection title="10.1 Sincronizacion" />
        <Paragraph>• Importa y exporta Plantilla, Partidos y Entrenamientos.</Paragraph>
        <Paragraph>• Acepta tanto ID de spreadsheet como URL completa del documento.</Paragraph>
        <Paragraph>• Botones rapidos en filas de datos: EXP (exportar) e IMP (importar) para mantener todo alineado en pantallas pequenas.</Paragraph>
        <Paragraph>• La app valida respuestas del script para evitar errores de parseo cuando Google devuelve HTML por URL o despliegue incorrecto.</Paragraph>
        <SubSection title="10.2 Configuracion de nube guiada" />
        <Paragraph>• En Gestion de datos tienes el boton ASISTENTE GUIADO (PASO A PASO) para usuarios sin experiencia.</Paragraph>
        <Paragraph>• Debes indicar Spreadsheet (ID o URL) y carpeta raiz de Drive, luego pulsar GUARDAR CONFIG y VERIFICAR ESTRUCTURA.</Paragraph>
        <Paragraph>• El sistema confirma creacion o validacion de carpeta raiz, carpeta de fotos, carpeta de actas y hojas necesarias.</Paragraph>
        <SubSection title="10.3 Importante antes de importar" />
        <Paragraph>• Importar reemplaza datos locales por los datos del origen seleccionado.</Paragraph>
        <Paragraph>• Recomendado exportar copia local antes de cada importacion.</Paragraph>
        <Paragraph>• Las fechas se normalizan a formato dd/mm/aaaa al importar, mostrar y exportar.</Paragraph>
        <Paragraph>• Los enlaces de actas se preservan en actualizaciones y sincronizaciones para no perder vinculaciones de Drive.</Paragraph>
        <SubSection title="10.4 Limpieza selectiva de evaluaciones" />
        <Paragraph>• Desde Gestion de datos puedes reiniciar formularios de evaluacion en local (IA, personal o ambos) cuando quieras empezar de cero.</Paragraph>
        <SubSection title="10.5 Sincronizar tablet y movil" />
        <Paragraph>
          • Usa el mismo Google Sheet en ambos dispositivos (Gestión de datos → mismo Spreadsheet ID).
        </Paragraph>
        <Paragraph>
          • Botón SINCRONIZAR TODO (SHEET) en el menú principal: importa del Sheet, fusiona con lo local y vuelve a
          exportar (plantilla, partidos, entrenamientos, historial del cronómetro, fotos de jugadores y actas en Drive).
        </Paragraph>
        <Paragraph>
          • Las fotos de plantilla se suben a la carpeta Fotos jugadores en Drive y se descargan en el otro dispositivo.
          Los actas de partidos se guardan en Actas Partidos y sus enlaces en la hoja Partidos_Actas.
        </Paragraph>
        <Paragraph>
          • Si elegiste guardar en la nube o ambos, la app sincroniza sola al entrar al menú (en silencio) cuando hay
          Sheet configurado.
        </Paragraph>
        <Paragraph>• Recomendación: sincroniza el dispositivo donde hayas hecho cambios antes de abrir el otro.</Paragraph>

        <Section title="11) Copias de seguridad y actualizaciones" />
        <SubSection title="11.1 Buenas practicas" />
        <Paragraph>• Exporta datos antes de instalar una nueva APK.</Paragraph>
        <Paragraph>• Mantener el mismo package o app id y subir el versionCode en cada publicacion evita conflictos y perdida de datos al actualizar por encima.</Paragraph>
        <Paragraph>• Conviene guardar la APK final en una carpeta releases en tu ordenador para trazabilidad de versiones.</Paragraph>
        <SubSection title="11.2 Aviso de actualizacion" />
        <Paragraph>
          • Al abrir la app (tras la pantalla de inicio), se comprueba si hay una version mas reciente publicada en la hoja
          Version_App de Google Sheets (version, versionCode, enlace apkUrl y changelog).
        </Paragraph>
        <Paragraph>
          • Al compilar una release en el PC, el script de build puede autorrellenar Version_App (fila 2) si el Apps Script
          esta desplegado con la accion publishAppVersion. El enlace apkUrl se conserva si ya existia; para uno nuevo usa
          releases/apk-drive-url.txt o la variable APK_DRIVE_URL en .env.
        </Paragraph>
        <Paragraph>
          • Si hay APK nueva, veras un aviso con boton Descargar. Instala encima de la actual sin desinstalar para conservar
          tus datos. Si pulsas Mas tarde, no se repetira el aviso para esa misma version.
        </Paragraph>
        <Paragraph>
          • Si solo hay cambios de JavaScript compatibles con tu APK, la app puede ofrecer una actualizacion OTA (sin descargar
          APK) mediante expo-updates.
        </Paragraph>
        <SubSection title="11.3 Si aparece un problema" />
        <Paragraph>• Verifica primero que instalaste la APK correcta de la version esperada (menu Ayuda muestra la version instalada).</Paragraph>
        <Paragraph>• Si algo no cuadra, revisa Gestion de datos y la configuracion de spreadsheet y script de Google.</Paragraph>
        <Paragraph>
          • Desde el menu principal, al final, puedes usar REPORTAR INCIDENCIA / SUGERENCIA: escribe el problema (hasta
          3000 caracteres) y se abrira tu app de correo con el mensaje dirigido al desarrollador.
        </Paragraph>

        <Section title="12) Novedades por version" />
        {HELP_CHANGELOG.length === 0 ? (
          <View style={styles.versionCard}>
            <Text style={styles.paragraph}>• Historial reiniciado. En proximas versiones apareceran aqui los cambios.</Text>
          </View>
        ) : (
          HELP_CHANGELOG.map((item) => (
            <View key={`${item.version}-${item.date}`} style={styles.versionCard}>
              <Text style={styles.versionTitle}>v{item.version} ({item.date})</Text>
              {item.changes.map((c, idx) => (
                <Text key={`${item.version}-${item.date}-${idx}`} style={styles.paragraph}>
                  • {c}
                </Text>
              ))}
            </View>
          ))
        )}

        <View style={styles.footer}>
          <FontAwesome name="info-circle" size={14} color="#1565C0" />
          <Text style={styles.footerTxt}> El historial del apartado 12 se alimenta desde el archivo de datos de version; el manual se revisa con cada gran cambio de la app.</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6 },
  backBtn: { padding: 8 },
  backTxt: { color: '#1565C0', fontWeight: 'bold' },
  title: { flex: 1, minWidth: 0, color: '#FFF', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 44 },
  mainTitle: { color: '#FFD700', fontSize: 15, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  subtitle: { color: '#90A4AE', fontSize: 12, marginBottom: 16, textAlign: 'center' },
  sectionTitle: { color: '#FFD700', fontSize: 14, fontWeight: 'bold', marginTop: 10, marginBottom: 6 },
  subSectionTitle: { color: '#00BFA5', fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  paragraph: { color: '#E0E0E0', fontSize: 12, lineHeight: 20, marginBottom: 4 },
  versionCard: { backgroundColor: '#012E57', borderRadius: 10, padding: 10, marginTop: 8 },
  versionTitle: { color: '#00BFA5', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 24, paddingVertical: 12 },
  footerTxt: { color: '#1565C0', fontSize: 11, flex: 1 },
});
