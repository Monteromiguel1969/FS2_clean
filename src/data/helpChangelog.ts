export type HelpChangelogItem = {
  version: string;
  date: string;
  changes: string[];
};

// Historial de ayuda mostrado en la app. Nuevas versiones se agregan automaticamente.
export const HELP_CHANGELOG: HelpChangelogItem[] = [
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
  {
    version: '1.0.53',
    date: '2026-03-28',
    changes: [
      'Ayuda ampliada: manual mas completo y claro de uso diario en todos los modulos.',
      'Stats: documentacion de RESUMEN, formula de Dedicacion global, pestana DI y exportaciones PDF.',
      'Gestion de datos: explicacion completa de exportaciones DI (IA_Matriz, Personal_Matriz, Historico_Evaluaciones).',
      'Uso transversal: guia de zoom en previsualizaciones, rotacion global y buenas practicas de sincronizacion/backup.',
      'Interfaz Stats: ajuste responsivo continuo por ancho real de pantalla para evitar solapes.',
    ],
  },
  {
    version: '1.0.52',
    date: '2026-03-27',
    changes: [
      'Stats: nueva columna Dedicacion global (Ent+Par) en RESUMEN y exportacion PDF.',
      'Stats: nueva pestana DI con Valoracion IA, D.I. global y evaluacion personal.',
      'UI Stats: ajuste responsivo por ancho de pantalla para evitar solapes.',
      'Previsualizaciones: zoom con dedos en informes/listados/formularios.',
      'Pantallas: rotacion global habilitada segun orientacion del dispositivo.',
      'Google Sheets: nuevas hojas automaticas de evaluaciones (IA_Matriz, Personal_Matriz, Historico_Evaluaciones).',
    ],
  },
];
