export type HelpChangelogItem = {
  version: string;
  date: string;
  changes: string[];
};

// Historial de ayuda mostrado en la app. Nuevas versiones se agregan automaticamente.
export const HELP_CHANGELOG: HelpChangelogItem[] = [
  {
    version: '1.4.7',
    date: '2026-10-05',
    changes: [
      'Calendario: el listado en pantalla y el PDF salen en orden cronológico, de la fecha más antigua a la más reciente.',
    ],
  },
  {
    version: '1.4.6',
    date: '2026-10-05',
    changes: [
      'Plantilla: al sincronizar, fecha de nacimiento, licencia, dorsal, posición y edad del Sheet actualizan la ficha.',
    ],
  },
  {
    version: '1.4.5',
    date: '2026-10-05',
    changes: [
      'Cada jugador recibe un id único y sesiones, partidos, tiempos y estadísticas usan ese mismo código.',
    ],
  },
  {
    version: '1.4.4',
    date: '2026-10-05',
    changes: [
      'Sincronizar: más tiempo de espera al leer partidos y el resto del libro, para que Google no corte la conexión.',
    ],
  },
  {
    version: '1.4.3',
    date: '2026-10-05',
    changes: [
      'Entrenamientos y partidos: al sincronizar, un jugador no aparece dos veces en la misma sesión o convocatoria.',
    ],
  },
  {
    version: '1.4.2',
    date: '2026-10-05',
    changes: [
      'Entrenamientos: al sincronizar no se duplican las sesiones que ya están en el Sheet y en el móvil.',
      'Fotos de plantilla: se guardan en Drive y la ficha usa ese enlace, sin copia local.',
      'Listado de plantilla: entrenadores y staff quedan siempre al final.',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-10-05',
    changes: [
      'Fotos de plantilla: al sincronizar o importar en otro dispositivo se guardan en local y se ven en la ficha.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-07-26',
    changes: [
      'Menú: «Últimos datos sync: dd/mm hh:mm» tras sync manual o automática (claridad offline).',
      'PDFs homogenizados: escudo + marca + equipo/temporada en Stats, Plantilla, Partidos y Cronómetro.',
      'Helper compartido de cabecera de informes (colores de marca unificados).',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-07-26',
    changes: [
      'Roles de acceso: ENTRENADOR (edita) y SOLO LECTURA (consulta sin guardar).',
      'Admin → Mi cuenta → Gestionar usuarios: aprobar como editor o lectura; cambiar rol después.',
      'Solo lectura: bloquea guardar plantilla/partidos/entrenos/calendario y crear equipos.',
      'Banner en menú y etiqueta de rol en Mi cuenta. Requiere redesplegar Apps Script (columna rol).',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-07-26',
    changes: [
      'Plantilla: toca los badges de estado físico / disponibilidad para ciclarlos sin abrir la ficha.',
      'Configurar partido: arranca sin LES/NA; botón DISPO aplica la plantilla (badges LES/DUDA/CAR).',
      'Partidos nuevos: AS/AV/NA sugeridos según disponibilidad (editable).',
      'Pizarra: long-press Garantizado/Duda/NA; lesionados fuera de sistemas; dudas penalizadas en auto.',
    ],
  },
  {
    version: '1.2.3',
    date: '2026-07-26',
    changes: [
      'Pizarra → Mis jugadas: buscar por nombre y filtrar por tipo (ataque, ABP…).',
      'Favoritos (★), duplicar (DUP) y borrar solo por confirmación (no se pierden las demás).',
      'Guardar jugada siempre añade (no sobrescribe homónimas). Estrategias ABP intactas.',
      'Migración suave plays_v4 → plays_v5 sin borrar el almacén anterior.',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-07-26',
    changes: [
      'Plantilla → Informes: bloque «Informe familias» (asistencia, minutos, goles, DI).',
      'Modo Un jugador: botón TEXTO WHATSAPP con resumen para familias.',
      'Comparar 2–4 jugadoras: tabla de seguimiento (Ent %, Par %, goles, min, DI).',
      'Atajo «Solo familias» al abrir informes (sin bloques técnicos por defecto).',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-07-26',
    changes: [
      'Stats → Entrenos: % de asistencia junto al nombre; objetivos tácticos arriba de la matriz.',
      'Desde Stats, editar sesión (E) y al guardar/volver regresas a Stats (no al menú).',
      'Entrenos: tip de objetivos con comas + lista de últimas sesiones para editar rápido.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-07-26',
    changes: [
      'Sync: dispositivo referencia por equipo/temporada (Gestión de datos).',
      'Si eres referencia: en conflictos gana este dispositivo y se sube al Sheet.',
      'Si no eres referencia: en conflictos gana el Google Sheet (modo satélite).',
      'Al sincronizar se indica el modo activo; se puede cambiar en cualquier momento.',
    ],
  },
  {
    version: '1.1.71',
    date: '2026-07-26',
    changes: [
      'Calendario: recordatorio local por evento (ON/OFF + 1h / 3h / 1 día / 2 días / 1 semana).',
      'Notificación del móvil antes del partido/entreno/evento (permiso Android).',
      'Menú principal: banner HOY / MAÑANA sobre el resumen de próximos 7 días.',
    ],
  },
  {
    version: '1.1.70',
    date: '2026-07-26',
    changes: [
      'Plantilla: DI RÁPIDO (Técnico/Táctico/Físico/Actitud 1–5, nota /10, copiar última).',
      'Historial de evaluaciones: distingue PERSONAL, RAPIDO, PERIODICA e IA.',
      'Stats → DI: columnas Última / Anterior / Δ / N y serie al tocar la fila.',
      'Stats → DI: comparativa rendimiento 1ª vs 2ª mitad del periodo (goles, % entreno, minutos).',
    ],
  },
  {
    version: '1.1.69',
    date: '2026-07-26',
    changes: [
      'Cronómetro: faltas de equipo y tiempos muertos por parte (se reinician al cambiar de parte).',
      'Gol rápido: toque = gol, mantener pulsado = deshacer (sin Alert de confirmación).',
      'Informe final: PDF + texto WhatsApp (resultado y goleadores).',
      'Configurar partido: botones TODOS / NINGUNO para convocatoria rápida.',
      'Partidos: botón TEXTO WHATSAPP en el informe del partido.',
    ],
  },
  {
    version: '1.1.68',
    date: '2026-07-26',
    changes: [
      'Mis equipos: botón admin «Autorizaciones pendientes» / gestionar usuarios (solo administrador).',
      'Contador de solicitudes pendientes en la pantalla de equipos y temporadas.',
    ],
  },
  {
    version: '1.1.67',
    date: '2026-07-26',
    changes: [
      'Admin monteromiguel.fs@gmail.com: acceso de emergencia si Google Script falla (403/HTML).',
      'Pantalla de aprobación: mensaje más claro cuando el fallo es de Script, no de falta de permiso.',
      'Recuperar contraseña: página Hosting /auth/action (configurar Action URL en Firebase).',
    ],
  },
  {
    version: '1.1.66',
    date: '2026-07-15',
    changes: [
      'Gestión de datos: IMP/EXP Actas, Eval. periódica, Historial cronómetro, Fotos y Calendario.',
      'Fix Sincronizar todo: guardaba con setPlayers inexistente (error en móvil).',
      'Import evaluaciones DI: fusiona por tipo sin pisar IA/personal/periódica.',
      'Sincronizar todo incluye eventos de calendario (hoja Calendario_Eventos).',
      'Propagar libros: timeout más largo y mensaje claro si Google responde HTML.',
    ],
  },
  {
    version: '1.1.65',
    date: '2026-07-15',
    changes: [
      'Descargar actualización: baja la APK al dispositivo y abre el instalador (sin abrir Drive con archivo antiguo).',
      'Enlace de descarga en Firebase Hosting (latest.bin) en lugar del Drive desactualizado.',
    ],
  },
  {
    version: '1.1.64',
    date: '2026-07-15',
    changes: [
      'Corrección descarga de actualizaciones: APK desde Firebase Hosting (ya no Drive con archivo antiguo 1.1.28).',
      'Descarga directa al dispositivo e instalador nativo al pulsar Descargar.',
      'Fix aviso deprecado makeDirectoryAsync en sincronización de fotos/actas.',
    ],
  },
  {
    version: '1.1.63',
    date: '2026-07-14',
    changes: [
      'Resumen breve de cambios de la version 1.1.63.',
    ],
  },
  {
    version: '1.1.62',
    date: '2026-07-14',
    changes: [
      'Resumen breve de cambios de la version 1.1.62.',
    ],
  },
  {
    version: '1.1.61',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.61.',
    ],
  },
  {
    version: '1.1.60',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.60.',
    ],
  },
  {
    version: '1.1.59',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.59.',
    ],
  },
  {
    version: '1.1.58',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.58.',
    ],
  },
  {
    version: '1.1.57',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.57.',
    ],
  },
  {
    version: '1.1.56',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.56.',
    ],
  },
  {
    version: '1.1.55',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.55.',
    ],
  },
  {
    version: '1.1.54',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.54.',
    ],
  },
  {
    version: '1.1.53',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.53.',
    ],
  },
  {
    version: '1.1.52',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.52.',
    ],
  },
  {
    version: '1.1.51',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.51.',
    ],
  },
  {
    version: '1.1.50',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.50.',
    ],
  },
  {
    version: '1.1.49',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.49.',
    ],
  },
  {
    version: '1.1.48',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.48.',
    ],
  },
  {
    version: '1.1.47',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.47.',
    ],
  },
  {
    version: '1.1.46',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.46.',
    ],
  },
  {
    version: '1.1.45',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.45.',
    ],
  },
  {
    version: '1.1.44',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.44.',
    ],
  },
  {
    version: '1.1.43',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.43.',
    ],
  },
  {
    version: '1.1.42',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.42.',
    ],
  },
  {
    version: '1.1.41',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.41.',
    ],
  },
  {
    version: '1.1.40',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.40.',
    ],
  },
  {
    version: '1.1.39',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.39.',
    ],
  },
  {
    version: '1.1.38',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.38.',
    ],
  },
  {
    version: '1.1.37',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.37.',
    ],
  },
  {
    version: '1.1.36',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.36.',
    ],
  },
  {
    version: '1.1.34',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.34.',
    ],
  },
  {
    version: '1.1.33',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.33.',
    ],
  },
  {
    version: '1.1.32',
    date: '2026-07-13',
    changes: [
      'Resumen breve de cambios de la version 1.1.32.',
    ],
  },
  {
    version: '1.1.31',
    date: '2026-07-07',
    changes: [
      'Resumen breve de cambios de la version 1.1.31.',
    ],
  },
  {
    version: '1.1.30',
    date: '2026-07-07',
    changes: [
      'Actualizaciones vía Firebase Hosting (version.json) con respaldo en Version_App del Sheet.',
      'Al compilar se publica la APK en Firebase App Distribution y se actualiza el manifiesto de versión.',
    ],
  },
  {
    version: '1.1.29',
    date: '2026-07-07',
    changes: [
      'Aviso de actualización: lee Version_App del Sheet canónico aunque tengas otro ID configurado.',
      'Botón BUSCAR ACTUALIZACIONES DE LA APP en Gestión de datos (vuelve a mostrar si pulsaste Más tarde).',
    ],
  },
  {
    version: '1.1.28',
    date: '2026-07-07',
    changes: [
      'Sincronización de fotos de plantilla vía Google Drive (sube locales y descarga en el otro dispositivo).',
      'Sincronización de actas de partidos: metadatos en hoja Partidos_Actas y archivos en Drive.',
      'Al guardar foto de jugador se conserva el enlace de Drive para la sync.',
    ],
  },
  {
    version: '1.1.27',
    date: '2026-07-07',
    changes: [
      'Sincronización completa tablet/móvil: botón SINCRONIZAR TODO (SHEET) en el menú y sync automático al entrar si usas nube.',
      'Historial del cronómetro sincronizado con Google Sheets (hoja Historial_Cronometro).',
      'Aviso de actualización: lee la versión publicada en tu Google Sheet (hoja Version_App).',
      'Reportar incidencia desde el menú principal (email con descripción, máx. 3000 caracteres).',
    ],
  },
  {
    version: '1.1.26',
    date: '2026-07-07',
    changes: [
      'Resumen breve de cambios de la version 1.1.26.',
    ],
  },
  {
    version: '1.1.25',
    date: '2026-07-07',
    changes: [
      'Resumen breve de cambios de la version 1.1.25.',
    ],
  },
  {
    version: '1.1.21',
    date: '2026-05-07',
    changes: [
      'Informe del partido (histórico): vuelve a mostrar la tabla de Convocatoria, Tiempos por Período (P1..Pn + Total) y Detalle de goles, en lugar de un texto plano.',
      'Modal del informe del partido: caja un poco más pequeña con scroll y los botones IMPRIMIR / COMPARTIR / CERRAR siempre visibles.',
      'Biblioteca: arreglado el zoom con dos dedos en el visor de imágenes; ahora el pellizco amplía y reduce de forma fluida sobre la imagen guardada.',
      'Pellizco más fiable en toda la app: el detector usa el contador real de toques activos del gesto, evitando que un dispositivo concreto no detecte el segundo dedo.',
    ],
  },
  {
    version: '1.1.20',
    date: '2026-05-07',
    changes: [
      'Zoom solo por pellizco: se eliminan los botones A−/A+/1:1 en informes y vistas previas. Pellizca con dos dedos para ampliar/reducir.',
      'Visor de imágenes (Biblioteca, foto del jugador, escudos): zoom únicamente por pellizco, con arrastre cuando hay zoom; indicador discreto del % en pantalla.',
      'Partidos: arreglado el bloqueo al abrir el INFORME desde el histórico (la pantalla quedaba atenuada por el conflicto entre dos modales). El informe ahora abre limpio.',
      'Plantilla: arreglada la vista previa del LISTADO (volvía invisible al activar el zoom de texto). Ahora se ve correctamente y se amplía con pellizco sobre la tabla.',
      'Cronómetro: el informe del partido y el informe parcial de cada parte amplían el texto con pellizco; ya no muestran botones de zoom.',
    ],
  },
  {
    version: '1.1.19',
    date: '2026-05-07',
    changes: [
      'Biblioteca: el visor de imágenes ahora soporta zoom con pellizco (dos dedos); arrastre con un dedo cuando hay zoom.',
      'Vistas previas con zoom de texto (informe de partido en Partidos, informe del cronómetro y informe parcial por período, vista previa del listado en Plantilla): zoom mediante pellizco de dos dedos.',
      'Plantilla: mantén pulsada la foto del jugador para abrir un visor a pantalla completa con zoom.',
      'Selector de equipos y menú principal: mantén pulsado o pulsa el escudo para verlo grande con zoom.',
    ],
  },
  {
    version: '1.1.16',
    date: '2026-05-07',
    changes: [
      'Plantilla: nuevo campo "Años en el equipo" en la ficha; el formulario personal renombra "AÑOS EN FS" a "AÑOS EN EL EQUIPO" y lo autorrellena bloqueado desde la ficha.',
      'Plantilla: la vista previa del listado solo se muestra al pulsar "VER VISTA PREVIA" en la pantalla emergente (con botones EXPORTAR y CERRAR).',
      'Selector de calendario en todos los campos de fecha: ficha (nacimiento), evaluación, entrenos, partidos y eventos del calendario.',
      'Cronómetro: alarma con vibración + pitido de árbitro generado en runtime; cada período entra en tiempo añadido hasta "PITIDO FINAL DE PARTE", con informe parcial al cerrar el período.',
      'Calendario: al agendar un Entrenamiento se pueden añadir fechas adicionales y se replica el evento en cada una.',
      'Biblioteca: pantalla global desde el menú y desde Plantilla, Pizarra, Estadísticas y Calendario (mismo almacén por equipo/temporada).',
    ],
  },
  {
    version: '1.1.06',
    date: '2026-05-02',
    changes: [
      'Ayuda: manual completo reescrito (inicio, orientacion, flujo Cronometro/Configurar partido, Stats con periodo y PDF, Calendario y exportaciones, nube y copias).',
      'Stats: periodo Desde/Hasta con calendario nativo en la misma linea; boton Todo; tablas y export PDF acotadas al rango; pestana DI filtra evaluaciones por fecha del periodo.',
      'Calendario: exportar listado PDF y rejilla por meses segun rango; fechas Desde/Hasta con selector de calendario en el modal.',
      'Selector de fechas reutilizable (Android dialogo fecha, iOS calendario en modal; web mantiene texto YYYY-MM-DD).',
    ],
  },
  {
    version: '1.0.78',
    date: '2026-04-05',
    changes: [
      'Ayuda ampliada con flujo de arranque, nube guiada y recomendaciones operativas para usuarios no tecnicos.',
      'Menu principal y selector: escudo mas visible y mostrado en la lista de equipos para identificar contexto rapido.',
      'Gestion de datos: botones compactos EXP/IMP y etiquetas ajustadas para mejorar alineacion en pantallas pequenas.',
      'Informes PDF de partidos y cronometro: incorporan el escudo del equipo seleccionado.',
      'Arranque: pantalla inicial de 5 segundos con texto de autoria de la aplicacion.',
    ],
  },
  {
    version: '1.0.58',
    date: '2026-03-29',
    changes: [
      'Cronometro: alarma configurable (pitido + vibracion) cada 1-15 minutos y confirmacion de doble conteo (partido/cambios).',
      'Plantilla: borrado selectivo de evaluaciones por jugador y exportacion de Ficha de Ponderacion IA con vista previa ampliable.',
      'Menu principal: resumen de eventos de calendario para los proximos 7 dias, incluyendo hoy.',
      'Pizarra: ajuste visual de fichas al giro del dispositivo y mejoras de lectura en banquillo.',
      'Sincronizacion: refuerzo de formato de fecha dd/mm/aaaa y conservacion de enlaces de actas en actualizaciones/importaciones.',
    ],
  },
  {
    version: '1.0.57',
    date: '2026-03-28',
    changes: [
      'Resumen breve de cambios de la version 1.0.57.',
    ],
  },
  {
    version: '1.0.56',
    date: '2026-03-28',
    changes: [
      'Resumen breve de cambios de la version 1.0.56.',
    ],
  },
  {
    version: '1.0.54',
    date: '2026-03-28',
    changes: [
      'Resumen breve de cambios de la version 1.0.54.',
    ],
  },
];
