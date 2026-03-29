export type HelpChangelogItem = {
  version: string;
  date: string;
  changes: string[];
};

// Historial de ayuda mostrado en la app. Nuevas versiones se agregan automaticamente.
export const HELP_CHANGELOG: HelpChangelogItem[] = [
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
