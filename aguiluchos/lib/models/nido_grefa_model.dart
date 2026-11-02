import 'dart:convert';

import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import 'nido_constants.dart';

/// Fases de la campaña en las que se agrupan las 42 columnas de un nido.
enum NidoFase {
  ubicacion('Fase 1 · Ubicación e identificación', 'Ubicación'),
  incubacion('Fase 2 · Incubación', 'Incubación'),
  seguimiento('Fase 3 · Seguimiento y manejo', 'Seguimiento y Manejo'),
  cosecha('Fase 4 · Cosecha y balance', 'Cosecha y Balance');

  const NidoFase(this.titulo, this.etiquetaCorta);
  final String titulo;
  final String etiquetaCorta;
}

/// Tipo de dato de una columna; condiciona la serialización.
enum NidoColumnType { text, integer, real, boolean, date, stringList }

/// Metadato de una columna del nido: clave snake_case (idéntica en SQLite local
/// y en Supabase), etiqueta legible, fase y accesores tipados.
///
/// Es la única fuente de verdad para: esquema SQLite, `toMap/fromMap`,
/// `toJson/fromJson` (Supabase) y selector de columnas de exportación.
class NidoColumn {
  const NidoColumn({
    required this.key,
    required this.label,
    required this.fase,
    required this.type,
    required this.read,
    required this.write,
  });

  final String key;
  final String label;
  final NidoFase fase;
  final NidoColumnType type;
  final Object? Function(NidoGrefaModel nido) read;
  final void Function(NidoGrefaModel nido, Object? value) write;

  String get sqliteType => switch (type) {
        NidoColumnType.integer || NidoColumnType.boolean => 'INTEGER',
        NidoColumnType.real => 'REAL',
        _ => 'TEXT',
      };

  /// Valor listo para mostrarse en Excel/PDF.
  String formatted(NidoGrefaModel nido) {
    final v = read(nido);
    if (v == null) return '';
    return switch (type) {
      NidoColumnType.boolean => (v as bool) ? 'Sí' : 'No',
      NidoColumnType.date => DateFormat('dd/MM/yyyy').format(v as DateTime),
      NidoColumnType.stringList => (v as List<String>).join(', '),
      _ => v.toString(),
    };
  }
}

final DateFormat _isoDate = DateFormat('yyyy-MM-dd');

DateTime? _parseDate(Object? v) {
  if (v == null) return null;
  if (v is DateTime) return DateTime(v.year, v.month, v.day);
  final s = v.toString();
  if (s.isEmpty) return null;
  final d = DateTime.tryParse(s);
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

int? _parseInt(Object? v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is bool) return v ? 1 : 0;
  return int.tryParse(v.toString());
}

double? _parseDouble(Object? v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString().replaceAll(',', '.'));
}

bool _parseBool(Object? v) {
  if (v == null) return false;
  if (v is bool) return v;
  if (v is num) return v != 0;
  final s = v.toString().toLowerCase();
  return s == 'true' || s == '1' || s == 't';
}

List<String> _parseStringList(Object? v) {
  if (v == null) return <String>[];
  if (v is List) return v.map((e) => e.toString()).toList();
  final s = v.toString();
  if (s.isEmpty) return <String>[];
  try {
    final decoded = jsonDecode(s);
    if (decoded is List) return decoded.map((e) => e.toString()).toList();
  } catch (_) {}
  return s.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
}

/// Registro de un nido de aguilucho (cenizo/pálido).
///
/// Es un modelo mutable a propósito: las 42 columnas se editan desde un
/// formulario sobre una copia ([clone]) y se persisten de una vez.
class NidoGrefaModel {
  NidoGrefaModel({
    String? id,
    DateTime? updatedAt,
    this.isSynced = false,
    this.hasConflict = false,
    this.isDeleted = false,
    List<String>? localImagePaths,
    List<String>? remoteImageUrls,
    List<String>? tipoAccionesManejo,
  })  : id = id ?? const Uuid().v4(),
        updatedAt = (updatedAt ?? DateTime.now()).toUtc(),
        localImagePaths = localImagePaths ?? <String>[],
        remoteImageUrls = remoteImageUrls ?? <String>[],
        tipoAccionesManejo = tipoAccionesManejo ?? <String>[];

  // ── Control ──────────────────────────────────────────────────────────────
  final String id;

  /// Marca de tiempo de la última edición (UTC). Base del Last-Write-Wins.
  DateTime updatedAt;

  /// `false` mientras haya cambios locales sin subir a Supabase.
  bool isSynced;

  /// `true` si en la última sincronización los cambios remotos (más recientes)
  /// sobrescribieron una edición local pendiente. Se limpia al revisar el nido.
  bool hasConflict;

  /// Borrado lógico (tombstone) para poder propagar el borrado a otros equipos.
  bool isDeleted;

  /// Rutas absolutas de fotos copiadas al directorio de documentos de la app.
  List<String> localImagePaths;

  /// URLs públicas de las fotos ya subidas a Supabase Storage.
  List<String> remoteImageUrls;

  // ── Fase 1: ubicación e identificación ───────────────────────────────────
  String? numeracion;
  String? etiqueta;
  String? proyecto;
  String? propietario;
  String? tlfn;
  String? googleMapsUrl;
  String? municipio;
  String? provincia;
  String? referenciaCatastral;
  String? especie;
  String? territorio;

  /// Longitud (WGS84, grados decimales).
  double? coordenadaX;

  /// Latitud (WGS84, grados decimales).
  double? coordenadaY;
  String? sustrato;

  // ── Fase 2: incubación ───────────────────────────────────────────────────
  DateTime? fechaIncubacion;
  DateTime? fechaEclosion;
  int? numHuevosEntrada;
  int? tamanoPuesta;
  DateTime? fechaEntradaNido;

  // ── Fase 3: seguimiento y manejo ─────────────────────────────────────────
  int? numPollosNacidos;
  int? numHuevosNoEclosionados;
  int? edadDias;
  String? anillasPvc;
  String? anillasMetalica;
  bool intervencion = false;

  /// Dron / Rodal / Compensación (multiselección).
  List<String> tipoAccionesManejo;
  String? observacionesI;
  String? observacionesII;

  // ── Fase 4: cosecha y balance ────────────────────────────────────────────
  DateTime? fechaVuelo;
  DateTime? fechaCosecha;
  int? pollosVoladosPrecosecha;
  int? pollosVoladosPostcosecha;
  int? numPollosVolados;
  bool vuelanPollos = false;
  int? numPollosMuertos;
  int? pollosMuertosPrecosecha;
  int? pollosMuertosCosecha;
  int? pollosMuertosPostcosecha;
  String? estadoFinal;
  String? resultadoReproductivo;
  String? causasFracaso;
  String? estadoFracaso;

  // ── Derivados ────────────────────────────────────────────────────────────

  /// Fecha de incubación + [diasIncubacion] días.
  DateTime? get fechaEstimadaEclosion {
    final f = fechaIncubacion;
    if (f == null) return null;
    return DateTime(f.year, f.month, f.day + diasIncubacion);
  }

  /// Estado reproductivo derivado del resultado: sin resultado => En curso.
  EstadoReproductivo get estadoReproductivo {
    switch (resultadoReproductivo) {
      case ResultadoReproductivo.exito:
        return EstadoReproductivo.exito;
      case ResultadoReproductivo.fracaso:
        return EstadoReproductivo.fracaso;
      default:
        return EstadoReproductivo.enCurso;
    }
  }

  bool get tieneCoordenadas => coordenadaX != null && coordenadaY != null;

  /// Fecha usada para filtrar por rango de campaña.
  DateTime? get fechaReferencia =>
      fechaEntradaNido ?? fechaIncubacion ?? fechaEclosion ?? fechaVuelo;

  /// URL a abrir en Google Maps: la guardada o una generada desde las coordenadas.
  Uri? get googleMapsUri {
    final url = googleMapsUrl?.trim();
    if (url != null && url.isNotEmpty) {
      return Uri.tryParse(url.startsWith('http') ? url : 'https://$url');
    }
    if (tieneCoordenadas) {
      return Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=$coordenadaY,$coordenadaX',
      );
    }
    return null;
  }

  static String urlDesdeCoordenadas(double lat, double lon) =>
      'https://www.google.com/maps/search/?api=1&query=$lat,$lon';

  /// Recalcula los totales a partir de los desgloses pre/post cosecha.
  void recalcularTotales() {
    if (pollosVoladosPrecosecha != null || pollosVoladosPostcosecha != null) {
      numPollosVolados =
          (pollosVoladosPrecosecha ?? 0) + (pollosVoladosPostcosecha ?? 0);
    }
    if (pollosMuertosPrecosecha != null ||
        pollosMuertosCosecha != null ||
        pollosMuertosPostcosecha != null) {
      numPollosMuertos = (pollosMuertosPrecosecha ?? 0) +
          (pollosMuertosCosecha ?? 0) +
          (pollosMuertosPostcosecha ?? 0);
    }
    vuelanPollos = (numPollosVolados ?? 0) > 0;
  }

  /// Comprueba la coherencia de los datos. Devuelve la lista de problemas
  /// (vacía si es válido).
  List<String> validar() {
    final e = <String>[];
    if ((etiqueta ?? '').trim().isEmpty) {
      e.add('La etiqueta del nido es obligatoria.');
    }
    final contadores = <String, int?>{
      'Huevos a la entrada': numHuevosEntrada,
      'Tamaño de puesta': tamanoPuesta,
      'Pollos nacidos': numPollosNacidos,
      'Huevos no eclosionados': numHuevosNoEclosionados,
      'Edad (días)': edadDias,
      'Pollos volados pre-cosecha': pollosVoladosPrecosecha,
      'Pollos volados post-cosecha': pollosVoladosPostcosecha,
      'Pollos muertos pre-cosecha': pollosMuertosPrecosecha,
      'Pollos muertos durante cosecha': pollosMuertosCosecha,
      'Pollos muertos post-cosecha': pollosMuertosPostcosecha,
    };
    contadores.forEach((k, v) {
      if (v != null && v < 0) e.add('$k no puede ser negativo.');
    });
    final y = coordenadaY;
    final x = coordenadaX;
    if (y != null && (y < -90 || y > 90)) {
      e.add('La latitud debe estar entre -90 y 90.');
    }
    if (x != null && (x < -180 || x > 180)) {
      e.add('La longitud debe estar entre -180 y 180.');
    }
    if ((coordenadaX == null) != (coordenadaY == null)) {
      e.add('Indica latitud y longitud, o ninguna de las dos.');
    }
    if (numHuevosEntrada != null &&
        tamanoPuesta != null &&
        numHuevosEntrada! > tamanoPuesta!) {
      e.add('Los huevos a la entrada no pueden superar el tamaño de puesta.');
    }
    if (tamanoPuesta != null &&
        numPollosNacidos != null &&
        numPollosNacidos! + (numHuevosNoEclosionados ?? 0) > tamanoPuesta!) {
      e.add('Pollos nacidos + huevos no eclosionados superan el tamaño de puesta.');
    }
    final volados = numPollosVolados ?? 0;
    final muertos = numPollosMuertos ?? 0;
    if (numPollosNacidos != null && volados + muertos > numPollosNacidos!) {
      e.add('Pollos volados + muertos ($volados + $muertos) superan los pollos nacidos (${numPollosNacidos!}).');
    }
    if (fechaIncubacion != null &&
        fechaEclosion != null &&
        fechaEclosion!.isBefore(fechaIncubacion!)) {
      e.add('La fecha de eclosión no puede ser anterior a la de incubación.');
    }
    if (tipoAccionesManejo.isNotEmpty && !intervencion) {
      e.add('Hay acciones de manejo seleccionadas pero no se marcó Intervención.');
    }
    if (resultadoReproductivo == ResultadoReproductivo.fracaso &&
        (causasFracaso ?? '').isEmpty) {
      e.add('Indica la causa del fracaso.');
    }
    if (resultadoReproductivo == ResultadoReproductivo.exito && volados <= 0) {
      e.add('Un nido con resultado Éxito debe tener pollos volados.');
    }
    return e;
  }

  // ── Serialización ────────────────────────────────────────────────────────

  /// Mapa para SQLite local.
  Map<String, Object?> toMap() {
    final m = <String, Object?>{
      'id': id,
      'updated_at': updatedAt.millisecondsSinceEpoch,
      'is_synced': isSynced ? 1 : 0,
      'has_conflict': hasConflict ? 1 : 0,
      'is_deleted': isDeleted ? 1 : 0,
      'local_image_paths': jsonEncode(localImagePaths),
      'remote_image_urls': jsonEncode(remoteImageUrls),
    };
    for (final c in nidoColumns) {
      m[c.key] = _encode(c, c.read(this), forSupabase: false);
    }
    return m;
  }

  factory NidoGrefaModel.fromMap(Map<String, Object?> map) {
    final n = NidoGrefaModel(
      id: map['id'] as String?,
      updatedAt: DateTime.fromMillisecondsSinceEpoch(
        _parseInt(map['updated_at']) ?? 0,
        isUtc: true,
      ),
      isSynced: _parseBool(map['is_synced']),
      hasConflict: _parseBool(map['has_conflict']),
      isDeleted: _parseBool(map['is_deleted']),
      localImagePaths: _parseStringList(map['local_image_paths']),
      remoteImageUrls: _parseStringList(map['remote_image_urls']),
    );
    _readColumns(n, map);
    return n;
  }

  /// JSON para Supabase (snake_case). No incluye campos solo locales
  /// (`isSynced`, `hasConflict`, rutas locales).
  Map<String, dynamic> toJson() {
    final m = <String, dynamic>{
      'id': id,
      'updated_at': updatedAt.toUtc().toIso8601String(),
      'is_deleted': isDeleted,
      'imagenes_urls': remoteImageUrls,
    };
    for (final c in nidoColumns) {
      m[c.key] = _encode(c, c.read(this), forSupabase: true);
    }
    return m;
  }

  /// Construye un nido desde una fila de Supabase. Lo recibido del servidor
  /// se considera sincronizado.
  factory NidoGrefaModel.fromJson(Map<String, dynamic> json) {
    final n = NidoGrefaModel(
      id: json['id'] as String?,
      updatedAt: DateTime.tryParse(json['updated_at']?.toString() ?? '')
              ?.toUtc() ??
          DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      isSynced: true,
      isDeleted: _parseBool(json['is_deleted']),
      remoteImageUrls: _parseStringList(json['imagenes_urls']),
    );
    _readColumns(n, json);
    return n;
  }

  static void _readColumns(NidoGrefaModel n, Map<String, Object?> src) {
    for (final c in nidoColumns) {
      c.write(n, _decode(c, src[c.key]));
    }
  }

  static Object? _encode(NidoColumn c, Object? v, {required bool forSupabase}) {
    switch (c.type) {
      case NidoColumnType.date:
        return v == null ? null : _isoDate.format(v as DateTime);
      case NidoColumnType.boolean:
        final b = v == true;
        return forSupabase ? b : (b ? 1 : 0);
      case NidoColumnType.stringList:
        final l = (v as List<String>?) ?? const <String>[];
        return forSupabase ? l : jsonEncode(l);
      default:
        return v;
    }
  }

  static Object? _decode(NidoColumn c, Object? v) => switch (c.type) {
        NidoColumnType.text => v?.toString(),
        NidoColumnType.integer => _parseInt(v),
        NidoColumnType.real => _parseDouble(v),
        NidoColumnType.boolean => _parseBool(v),
        NidoColumnType.date => _parseDate(v),
        NidoColumnType.stringList => _parseStringList(v),
      };

  /// Copia profunda (para editar sin tocar el original).
  NidoGrefaModel clone() => NidoGrefaModel.fromMap(toMap());

  /// Igualdad de contenido (todas las columnas y campos de control).
  bool sameContentAs(NidoGrefaModel other) =>
      jsonEncode(toMap()) == jsonEncode(other.toMap());

  @override
  String toString() => 'NidoGrefaModel($id, $etiqueta, ${updatedAt.toIso8601String()})';
}

NidoColumn _text(String key, String label, NidoFase fase,
        String? Function(NidoGrefaModel) get, void Function(NidoGrefaModel, String?) set) =>
    NidoColumn(
      key: key,
      label: label,
      fase: fase,
      type: NidoColumnType.text,
      read: get,
      write: (n, v) => set(n, v as String?),
    );

NidoColumn _int(String key, String label, NidoFase fase,
        int? Function(NidoGrefaModel) get, void Function(NidoGrefaModel, int?) set) =>
    NidoColumn(
      key: key,
      label: label,
      fase: fase,
      type: NidoColumnType.integer,
      read: get,
      write: (n, v) => set(n, v as int?),
    );

NidoColumn _real(String key, String label, NidoFase fase,
        double? Function(NidoGrefaModel) get, void Function(NidoGrefaModel, double?) set) =>
    NidoColumn(
      key: key,
      label: label,
      fase: fase,
      type: NidoColumnType.real,
      read: get,
      write: (n, v) => set(n, v as double?),
    );

NidoColumn _bool(String key, String label, NidoFase fase,
        bool Function(NidoGrefaModel) get, void Function(NidoGrefaModel, bool) set) =>
    NidoColumn(
      key: key,
      label: label,
      fase: fase,
      type: NidoColumnType.boolean,
      read: get,
      write: (n, v) => set(n, v == true),
    );

NidoColumn _date(String key, String label, NidoFase fase,
        DateTime? Function(NidoGrefaModel) get, void Function(NidoGrefaModel, DateTime?) set) =>
    NidoColumn(
      key: key,
      label: label,
      fase: fase,
      type: NidoColumnType.date,
      read: get,
      write: (n, v) => set(n, v as DateTime?),
    );

NidoColumn _list(String key, String label, NidoFase fase,
        List<String> Function(NidoGrefaModel) get, void Function(NidoGrefaModel, List<String>) set) =>
    NidoColumn(
      key: key,
      label: label,
      fase: fase,
      type: NidoColumnType.stringList,
      read: get,
      write: (n, v) => set(n, (v as List<String>?) ?? <String>[]),
    );

const _f1 = NidoFase.ubicacion;
const _f2 = NidoFase.incubacion;
const _f3 = NidoFase.seguimiento;
const _f4 = NidoFase.cosecha;

/// Las 42 columnas de datos de un nido, en orden de fase.
final List<NidoColumn> nidoColumns = List.unmodifiable(<NidoColumn>[
  // Fase 1 (14)
  _text('numeracion', 'Numeración', _f1, (n) => n.numeracion, (n, v) => n.numeracion = v),
  _text('etiqueta', 'Etiqueta', _f1, (n) => n.etiqueta, (n, v) => n.etiqueta = v),
  _text('proyecto', 'Proyecto', _f1, (n) => n.proyecto, (n, v) => n.proyecto = v),
  _text('propietario', 'Propietario', _f1, (n) => n.propietario, (n, v) => n.propietario = v),
  _text('tlfn', 'Teléfono', _f1, (n) => n.tlfn, (n, v) => n.tlfn = v),
  _text('google_maps_url', 'URL Google Maps', _f1, (n) => n.googleMapsUrl, (n, v) => n.googleMapsUrl = v),
  _text('municipio', 'Municipio', _f1, (n) => n.municipio, (n, v) => n.municipio = v),
  _text('provincia', 'Provincia', _f1, (n) => n.provincia, (n, v) => n.provincia = v),
  _text('referencia_catastral', 'Referencia catastral', _f1, (n) => n.referenciaCatastral, (n, v) => n.referenciaCatastral = v),
  _text('especie', 'Especie', _f1, (n) => n.especie, (n, v) => n.especie = v),
  _text('territorio', 'Territorio', _f1, (n) => n.territorio, (n, v) => n.territorio = v),
  _real('coordenada_x', 'Coordenada X (longitud)', _f1, (n) => n.coordenadaX, (n, v) => n.coordenadaX = v),
  _real('coordenada_y', 'Coordenada Y (latitud)', _f1, (n) => n.coordenadaY, (n, v) => n.coordenadaY = v),
  _text('sustrato', 'Sustrato', _f1, (n) => n.sustrato, (n, v) => n.sustrato = v),
  // Fase 2 (5)
  _date('fecha_incubacion', 'Fecha de incubación', _f2, (n) => n.fechaIncubacion, (n, v) => n.fechaIncubacion = v),
  _date('fecha_eclosion', 'Fecha de eclosión', _f2, (n) => n.fechaEclosion, (n, v) => n.fechaEclosion = v),
  _int('num_huevos_entrada', 'Nº huevos a la entrada', _f2, (n) => n.numHuevosEntrada, (n, v) => n.numHuevosEntrada = v),
  _int('tamano_puesta', 'Tamaño de puesta', _f2, (n) => n.tamanoPuesta, (n, v) => n.tamanoPuesta = v),
  _date('fecha_entrada_nido', 'Fecha de entrada al nido', _f2, (n) => n.fechaEntradaNido, (n, v) => n.fechaEntradaNido = v),
  // Fase 3 (9)
  _int('num_pollos_nacidos', 'Nº pollos nacidos', _f3, (n) => n.numPollosNacidos, (n, v) => n.numPollosNacidos = v),
  _int('num_huevos_no_eclosionados', 'Nº huevos no eclosionados', _f3, (n) => n.numHuevosNoEclosionados, (n, v) => n.numHuevosNoEclosionados = v),
  _int('edad_dias', 'Edad (días)', _f3, (n) => n.edadDias, (n, v) => n.edadDias = v),
  _text('anillas_pvc', 'Anilla PVC', _f3, (n) => n.anillasPvc, (n, v) => n.anillasPvc = v),
  _text('anillas_metalica', 'Anilla metálica', _f3, (n) => n.anillasMetalica, (n, v) => n.anillasMetalica = v),
  _bool('intervencion', 'Intervención', _f3, (n) => n.intervencion, (n, v) => n.intervencion = v),
  _list('tipo_acciones_manejo', 'Tipo de acciones de manejo', _f3, (n) => n.tipoAccionesManejo, (n, v) => n.tipoAccionesManejo = v),
  _text('observaciones_i', 'Observaciones I', _f3, (n) => n.observacionesI, (n, v) => n.observacionesI = v),
  _text('observaciones_ii', 'Observaciones II', _f3, (n) => n.observacionesII, (n, v) => n.observacionesII = v),
  // Fase 4 (14)
  _date('fecha_vuelo', 'Fecha de vuelo', _f4, (n) => n.fechaVuelo, (n, v) => n.fechaVuelo = v),
  _date('fecha_cosecha', 'Fecha de cosecha', _f4, (n) => n.fechaCosecha, (n, v) => n.fechaCosecha = v),
  _int('pollos_volados_precosecha', 'Pollos volados pre-cosecha', _f4, (n) => n.pollosVoladosPrecosecha, (n, v) => n.pollosVoladosPrecosecha = v),
  _int('pollos_volados_postcosecha', 'Pollos volados post-cosecha', _f4, (n) => n.pollosVoladosPostcosecha, (n, v) => n.pollosVoladosPostcosecha = v),
  _int('num_pollos_volados', 'Nº pollos volados (total)', _f4, (n) => n.numPollosVolados, (n, v) => n.numPollosVolados = v),
  _bool('vuelan_pollos', '¿Vuelan los pollos?', _f4, (n) => n.vuelanPollos, (n, v) => n.vuelanPollos = v),
  _int('num_pollos_muertos', 'Nº pollos muertos (total)', _f4, (n) => n.numPollosMuertos, (n, v) => n.numPollosMuertos = v),
  _int('pollos_muertos_precosecha', 'Pollos muertos pre-cosecha', _f4, (n) => n.pollosMuertosPrecosecha, (n, v) => n.pollosMuertosPrecosecha = v),
  _int('pollos_muertos_cosecha', 'Pollos muertos durante cosecha', _f4, (n) => n.pollosMuertosCosecha, (n, v) => n.pollosMuertosCosecha = v),
  _int('pollos_muertos_postcosecha', 'Pollos muertos post-cosecha', _f4, (n) => n.pollosMuertosPostcosecha, (n, v) => n.pollosMuertosPostcosecha = v),
  _text('estado_final', 'Estado final', _f4, (n) => n.estadoFinal, (n, v) => n.estadoFinal = v),
  _text('resultado_reproductivo', 'Resultado reproductivo', _f4, (n) => n.resultadoReproductivo, (n, v) => n.resultadoReproductivo = v),
  _text('causas_fracaso', 'Causas de fracaso', _f4, (n) => n.causasFracaso, (n, v) => n.causasFracaso = v),
  _text('estado_fracaso', 'Estado del fracaso', _f4, (n) => n.estadoFracaso, (n, v) => n.estadoFracaso = v),
]);

/// Columnas agrupadas por fase (para el selector de exportación).
final Map<NidoFase, List<NidoColumn>> nidoColumnsPorFase = {
  for (final f in NidoFase.values)
    f: List.unmodifiable(nidoColumns.where((c) => c.fase == f)),
};

NidoColumn nidoColumnByKey(String key) =>
    nidoColumns.firstWhere((c) => c.key == key);
