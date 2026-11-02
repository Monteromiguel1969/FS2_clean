import 'nido_grefa_model.dart';

/// Fases de la ficha de campo. Se usan para agrupar columnas en la
/// exportación y para documentar el origen de cada campo.
enum FaseNido {
  ubicacion('F1 · Ubicación / Hábitat'),
  puesta('F2 · Puesta / Incubación'),
  seguimiento('F3 · Seguimiento / Manejo'),
  cosecha('F4 · Cosecha / Balance');

  const FaseNido(this.titulo);
  final String titulo;
}

/// Tipo lógico de un campo; determina cómo se serializa a JSON, a SQLite y a
/// celdas de Excel.
enum TipoCampo { texto, entero, decimal, fecha, booleano, lista }

/// Metadatos de un campo de la ficha: clave (nombre de columna), etiqueta
/// legible, fase, tipo y accesores. Es la única fuente de verdad para
/// serialización, esquema local y selector de columnas de exportación.
class NidoCampo {
  const NidoCampo({
    required this.clave,
    required this.etiqueta,
    required this.fase,
    required this.tipo,
    required this.leer,
    required this.escribir,
  });

  final String clave;
  final String etiqueta;
  final FaseNido fase;
  final TipoCampo tipo;
  final Object? Function(NidoGrefaModel) leer;
  final void Function(NidoGrefaModel, Object?) escribir;

  /// Tipo de columna SQLite equivalente.
  String get tipoSqlite => switch (tipo) {
    TipoCampo.entero || TipoCampo.booleano => 'INTEGER',
    TipoCampo.decimal => 'REAL',
    _ => 'TEXT',
  };
}

/// Los 42 campos de la ficha, en el orden F1..F4.
final List<NidoCampo> camposNido = List.unmodifiable(<NidoCampo>[
  // ---- F1 Ubicación / Hábitat (14) ----
  NidoCampo(
    clave: 'numeracion',
    etiqueta: 'Numeración',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.texto,
    leer: (n) => n.numeracion,
    escribir: (n, v) => n.numeracion = v as String?,
  ),
  NidoCampo(
    clave: 'etiqueta',
    etiqueta: 'Etiqueta',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.texto,
    leer: (n) => n.etiqueta,
    escribir: (n, v) => n.etiqueta = v as String?,
  ),
  NidoCampo(
    clave: 'proyecto',
    etiqueta: 'Proyecto',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.texto,
    leer: (n) => n.proyecto,
    escribir: (n, v) => n.proyecto = v as String?,
  ),
  NidoCampo(
    clave: 'propietario',
    etiqueta: 'Propietario',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.texto,
    leer: (n) => n.propietario,
    escribir: (n, v) => n.propietario = v as String?,
  ),
  NidoCampo(
    clave: 'tlfn',
    etiqueta: 'Teléfono',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.texto,
    leer: (n) => n.tlfn,
    escribir: (n, v) => n.tlfn = v as String?,
  ),
  NidoCampo(
    clave: 'google_maps_url',
    etiqueta: 'URL Google Maps',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.texto,
    leer: (n) => n.googleMapsUrl,
    escribir: (n, v) => n.googleMapsUrl = v as String?,
  ),
  NidoCampo(
    clave: 'municipio',
    etiqueta: 'Municipio',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.texto,
    leer: (n) => n.municipio,
    escribir: (n, v) => n.municipio = v as String?,
  ),
  NidoCampo(
    clave: 'provincia',
    etiqueta: 'Provincia',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.texto,
    leer: (n) => n.provincia,
    escribir: (n, v) => n.provincia = v as String?,
  ),
  NidoCampo(
    clave: 'referencia_catastral',
    etiqueta: 'Referencia catastral',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.texto,
    leer: (n) => n.referenciaCatastral,
    escribir: (n, v) => n.referenciaCatastral = v as String?,
  ),
  NidoCampo(
    clave: 'especie',
    etiqueta: 'Especie',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.texto,
    leer: (n) => n.especie,
    escribir: (n, v) => n.especie = v as String?,
  ),
  NidoCampo(
    clave: 'territorio',
    etiqueta: 'Territorio',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.texto,
    leer: (n) => n.territorio,
    escribir: (n, v) => n.territorio = v as String?,
  ),
  NidoCampo(
    clave: 'coordenada_x',
    etiqueta: 'Coordenada X (longitud)',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.decimal,
    leer: (n) => n.coordenadaX,
    escribir: (n, v) => n.coordenadaX = v as double?,
  ),
  NidoCampo(
    clave: 'coordenada_y',
    etiqueta: 'Coordenada Y (latitud)',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.decimal,
    leer: (n) => n.coordenadaY,
    escribir: (n, v) => n.coordenadaY = v as double?,
  ),
  NidoCampo(
    clave: 'sustrato',
    etiqueta: 'Sustrato',
    fase: FaseNido.ubicacion,
    tipo: TipoCampo.texto,
    leer: (n) => n.sustrato,
    escribir: (n, v) => n.sustrato = v as String?,
  ),

  // ---- F2 Puesta / Incubación (5) ----
  NidoCampo(
    clave: 'fecha_incubacion',
    etiqueta: 'Fecha de incubación',
    fase: FaseNido.puesta,
    tipo: TipoCampo.fecha,
    leer: (n) => n.fechaIncubacion,
    escribir: (n, v) => n.fechaIncubacion = v as DateTime?,
  ),
  NidoCampo(
    clave: 'fecha_eclosion',
    etiqueta: 'Fecha de eclosión',
    fase: FaseNido.puesta,
    tipo: TipoCampo.fecha,
    leer: (n) => n.fechaEclosion,
    escribir: (n, v) => n.fechaEclosion = v as DateTime?,
  ),
  NidoCampo(
    clave: 'num_huevos_entrada',
    etiqueta: 'Nº huevos a la entrada',
    fase: FaseNido.puesta,
    tipo: TipoCampo.entero,
    leer: (n) => n.numHuevosEntrada,
    escribir: (n, v) => n.numHuevosEntrada = v as int?,
  ),
  NidoCampo(
    clave: 'tamano_puesta',
    etiqueta: 'Tamaño de puesta',
    fase: FaseNido.puesta,
    tipo: TipoCampo.entero,
    leer: (n) => n.tamanoPuesta,
    escribir: (n, v) => n.tamanoPuesta = v as int?,
  ),
  NidoCampo(
    clave: 'fecha_entrada_nido',
    etiqueta: 'Fecha de entrada al nido',
    fase: FaseNido.puesta,
    tipo: TipoCampo.fecha,
    leer: (n) => n.fechaEntradaNido,
    escribir: (n, v) => n.fechaEntradaNido = v as DateTime?,
  ),

  // ---- F3 Seguimiento / Manejo (9) ----
  NidoCampo(
    clave: 'num_pollos_nacidos',
    etiqueta: 'Nº pollos nacidos',
    fase: FaseNido.seguimiento,
    tipo: TipoCampo.entero,
    leer: (n) => n.numPollosNacidos,
    escribir: (n, v) => n.numPollosNacidos = v as int?,
  ),
  NidoCampo(
    clave: 'num_huevos_no_eclosionados',
    etiqueta: 'Nº huevos no eclosionados',
    fase: FaseNido.seguimiento,
    tipo: TipoCampo.entero,
    leer: (n) => n.numHuevosNoEclosionados,
    escribir: (n, v) => n.numHuevosNoEclosionados = v as int?,
  ),
  NidoCampo(
    clave: 'edad_dias',
    etiqueta: 'Edad (días)',
    fase: FaseNido.seguimiento,
    tipo: TipoCampo.entero,
    leer: (n) => n.edadDias,
    escribir: (n, v) => n.edadDias = v as int?,
  ),
  NidoCampo(
    clave: 'anillas_pvc',
    etiqueta: 'Anillas PVC',
    fase: FaseNido.seguimiento,
    tipo: TipoCampo.texto,
    leer: (n) => n.anillasPvc,
    escribir: (n, v) => n.anillasPvc = v as String?,
  ),
  NidoCampo(
    clave: 'anillas_metalica',
    etiqueta: 'Anillas metálica',
    fase: FaseNido.seguimiento,
    tipo: TipoCampo.texto,
    leer: (n) => n.anillasMetalica,
    escribir: (n, v) => n.anillasMetalica = v as String?,
  ),
  NidoCampo(
    clave: 'intervencion',
    etiqueta: 'Intervención',
    fase: FaseNido.seguimiento,
    tipo: TipoCampo.booleano,
    leer: (n) => n.intervencion,
    escribir: (n, v) => n.intervencion = v == true,
  ),
  NidoCampo(
    clave: 'tipo_acciones_manejo',
    etiqueta: 'Tipo de acciones de manejo',
    fase: FaseNido.seguimiento,
    tipo: TipoCampo.lista,
    leer: (n) => n.tipoAccionesManejo,
    escribir: (n, v) => n.tipoAccionesManejo = List<String>.of(
      (v as List<String>?) ?? const <String>[],
    ),
  ),
  NidoCampo(
    clave: 'observaciones_i',
    etiqueta: 'Observaciones I',
    fase: FaseNido.seguimiento,
    tipo: TipoCampo.texto,
    leer: (n) => n.observacionesI,
    escribir: (n, v) => n.observacionesI = v as String?,
  ),
  NidoCampo(
    clave: 'observaciones_ii',
    etiqueta: 'Observaciones II',
    fase: FaseNido.seguimiento,
    tipo: TipoCampo.texto,
    leer: (n) => n.observacionesIi,
    escribir: (n, v) => n.observacionesIi = v as String?,
  ),

  // ---- F4 Cosecha / Balance (14) ----
  NidoCampo(
    clave: 'fecha_vuelo',
    etiqueta: 'Fecha de vuelo',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.fecha,
    leer: (n) => n.fechaVuelo,
    escribir: (n, v) => n.fechaVuelo = v as DateTime?,
  ),
  NidoCampo(
    clave: 'fecha_cosecha',
    etiqueta: 'Fecha de cosecha',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.fecha,
    leer: (n) => n.fechaCosecha,
    escribir: (n, v) => n.fechaCosecha = v as DateTime?,
  ),
  NidoCampo(
    clave: 'pollos_volados_precosecha',
    etiqueta: 'Pollos volados pre-cosecha',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.entero,
    leer: (n) => n.pollosVoladosPrecosecha,
    escribir: (n, v) => n.pollosVoladosPrecosecha = v as int?,
  ),
  NidoCampo(
    clave: 'pollos_volados_postcosecha',
    etiqueta: 'Pollos volados post-cosecha',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.entero,
    leer: (n) => n.pollosVoladosPostcosecha,
    escribir: (n, v) => n.pollosVoladosPostcosecha = v as int?,
  ),
  NidoCampo(
    clave: 'num_pollos_volados',
    etiqueta: 'Nº pollos volados (total)',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.entero,
    leer: (n) => n.numPollosVolados,
    escribir: (n, v) => n.numPollosVolados = v as int?,
  ),
  NidoCampo(
    clave: 'vuelan_pollos',
    etiqueta: '¿Vuelan los pollos?',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.booleano,
    leer: (n) => n.vuelanPollos,
    escribir: (n, v) => n.vuelanPollos = v == true,
  ),
  NidoCampo(
    clave: 'num_pollos_muertos',
    etiqueta: 'Nº pollos muertos (total)',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.entero,
    leer: (n) => n.numPollosMuertos,
    escribir: (n, v) => n.numPollosMuertos = v as int?,
  ),
  NidoCampo(
    clave: 'pollos_muertos_precosecha',
    etiqueta: 'Pollos muertos pre-cosecha',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.entero,
    leer: (n) => n.pollosMuertosPrecosecha,
    escribir: (n, v) => n.pollosMuertosPrecosecha = v as int?,
  ),
  NidoCampo(
    clave: 'pollos_muertos_cosecha',
    etiqueta: 'Pollos muertos durante cosecha',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.entero,
    leer: (n) => n.pollosMuertosCosecha,
    escribir: (n, v) => n.pollosMuertosCosecha = v as int?,
  ),
  NidoCampo(
    clave: 'pollos_muertos_postcosecha',
    etiqueta: 'Pollos muertos post-cosecha',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.entero,
    leer: (n) => n.pollosMuertosPostcosecha,
    escribir: (n, v) => n.pollosMuertosPostcosecha = v as int?,
  ),
  NidoCampo(
    clave: 'estado_final',
    etiqueta: 'Estado final',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.texto,
    leer: (n) => n.estadoFinal,
    escribir: (n, v) => n.estadoFinal = v as String?,
  ),
  NidoCampo(
    clave: 'resultado_reproductivo',
    etiqueta: 'Resultado reproductivo',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.texto,
    leer: (n) => n.resultadoReproductivo,
    escribir: (n, v) => n.resultadoReproductivo = v as String?,
  ),
  NidoCampo(
    clave: 'causas_fracaso',
    etiqueta: 'Causas del fracaso',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.texto,
    leer: (n) => n.causasFracaso,
    escribir: (n, v) => n.causasFracaso = v as String?,
  ),
  NidoCampo(
    clave: 'estado_fracaso',
    etiqueta: 'Estado del fracaso',
    fase: FaseNido.cosecha,
    tipo: TipoCampo.texto,
    leer: (n) => n.estadoFracaso,
    escribir: (n, v) => n.estadoFracaso = v as String?,
  ),
]);

/// Índice clave -> campo.
final Map<String, NidoCampo> camposNidoPorClave = Map.unmodifiable({
  for (final c in camposNido) c.clave: c,
});
