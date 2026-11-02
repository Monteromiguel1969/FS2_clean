// Las 42 columnas de `nidos_grefa` en 4 fases (idéntico al modelo de la app).
// tipo: text | int | date | bool | list | num | area | select (con opciones)
export const ESPECIES = ['Aguilucho cenizo', 'Aguilucho pálido', 'Aguilucho lagunero'];
export const PROYECTOS = ['LIFE', 'Compensatorias', 'USANOS'];
export const TERRITORIOS = ['Seguro', 'Probable', 'Posible', 'Descartado'];
export const SUSTRATOS = ['Cebada', 'Trigo', 'Avena', 'Erial', 'Barbecho', 'Pastizal', 'Herbazal', 'Matorral', 'Otro'];
export const MANEJO = ['Dron', 'Rodal', 'Compensación'];
export const ESTADOS_FINALES = [
  'Reproducción con éxito',
  'Reproducción sin éxito',
  'Reproducción no constatada',
  'Territorio descartado',
];
export const RESULTADOS = ['Éxito', 'Fracaso'];
export const CAUSAS = [
  'Depredación', 'Abandono', 'Huevos infértiles', 'Cosecha', 'Cosecha en verde',
  'Parcela cosechada', 'Parcela arada', 'Incendio parcela', 'Desconocidas', 'Otra',
];
export const ESTADOS_FRACASO = ['Huevos', 'Pollos', 'Pollos y huevos'];

export const FASES = [
  { id: 1, titulo: 'Fase 1 · Ubicación e identificación' },
  { id: 2, titulo: 'Fase 2 · Incubación' },
  { id: 3, titulo: 'Fase 3 · Seguimiento y manejo' },
  { id: 4, titulo: 'Fase 4 · Cosecha y balance' },
];

const c = (fase, key, label, tipo = 'text', opciones) => ({ fase, key, label, tipo, opciones });

export const COLUMNAS = [
  c(1, 'numeracion', 'Numeración'),
  c(1, 'etiqueta', 'Etiqueta'),
  c(1, 'proyecto', 'Proyecto', 'select', PROYECTOS),
  c(1, 'propietario', 'Propietario'),
  c(1, 'tlfn', 'Teléfono'),
  c(1, 'google_maps_url', 'URL Google Maps'),
  c(1, 'municipio', 'Municipio'),
  c(1, 'provincia', 'Provincia'),
  c(1, 'referencia_catastral', 'Referencia catastral'),
  c(1, 'especie', 'Especie', 'select', ESPECIES),
  c(1, 'territorio', 'Territorio', 'select', TERRITORIOS),
  c(1, 'coordenada_x', 'Coordenada X (Este, UTM m)', 'num'),
  c(1, 'coordenada_y', 'Coordenada Y (Norte, UTM m)', 'num'),
  c(1, 'sustrato', 'Sustrato', 'select', SUSTRATOS),

  c(2, 'fecha_incubacion', 'Fecha incubación', 'date'),
  c(2, 'fecha_eclosion', 'Fecha eclosión', 'date'),
  c(2, 'num_huevos_entrada', 'Nº huevos entrada', 'int'),
  c(2, 'tamano_puesta', 'Tamaño puesta', 'int'),
  c(2, 'fecha_entrada_nido', 'Fecha entrada nido', 'date'),

  c(3, 'num_pollos_nacidos', 'Pollos nacidos', 'int'),
  c(3, 'num_huevos_no_eclosionados', 'Huevos no eclosionados', 'int'),
  c(3, 'edad_dias', 'Edad (días)', 'int'),
  c(3, 'anillas_pvc', 'Anillas PVC'),
  c(3, 'anillas_metalica', 'Anilla metálica'),
  c(3, 'intervencion', 'Intervención', 'bool'),
  c(3, 'tipo_acciones_manejo', 'Tipo de manejo', 'list', MANEJO),
  c(3, 'observaciones_i', 'Observaciones I', 'area'),
  c(3, 'observaciones_ii', 'Observaciones II', 'area'),

  c(4, 'fecha_vuelo', 'Fecha vuelo', 'date'),
  c(4, 'fecha_cosecha', 'Fecha cosecha', 'date'),
  c(4, 'pollos_volados_precosecha', 'Volados pre-cosecha', 'int'),
  c(4, 'pollos_volados_postcosecha', 'Volados post-cosecha', 'int'),
  c(4, 'num_pollos_volados', 'Total pollos volados', 'int'),
  c(4, 'vuelan_pollos', '¿Vuelan los pollos?', 'bool'),
  c(4, 'num_pollos_muertos', 'Total pollos muertos', 'int'),
  c(4, 'pollos_muertos_precosecha', 'Muertos pre-cosecha', 'int'),
  c(4, 'pollos_muertos_cosecha', 'Muertos en cosecha', 'int'),
  c(4, 'pollos_muertos_postcosecha', 'Muertos post-cosecha', 'int'),
  c(4, 'estado_final', 'Estado final', 'select', ESTADOS_FINALES),
  c(4, 'resultado_reproductivo', 'Resultado reproductivo', 'select', RESULTADOS),
  c(4, 'causas_fracaso', 'Causas de fracaso', 'select', CAUSAS),
  c(4, 'estado_fracaso', 'Estado del fracaso', 'select', ESTADOS_FRACASO),
];

export const COLUMNAS_POR_CLAVE = Object.fromEntries(COLUMNAS.map((x) => [x.key, x]));
