import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../logic/texto.dart';
import 'nido_campo.dart';

/// Estado reproductivo derivado de `resultado_reproductivo`.
enum EstadoReproductivo {
  exito('Éxito'),
  fracaso('Fracaso'),
  enCurso('En curso');

  const EstadoReproductivo(this.etiqueta);
  final String etiqueta;
}

/// Opciones cerradas usadas por la UI.
abstract final class OpcionesNido {
  static const String exito = 'Éxito';
  static const String fracaso = 'Fracaso';
  static const List<String> resultados = [exito, fracaso];
  static const List<String> tiposManejo = ['Dron', 'Rodal', 'Compensación'];
  static const List<String> especies = [
    'Aguilucho cenizo (Circus pygargus)',
    'Aguilucho pálido (Circus cyaneus)',
  ];
  static const List<String> causasFracaso = [
    'Cosechado antes de tiempo',
    'Depredación',
    'Abandono',
    'Inclemencias meteorológicas',
    'Infertilidad / huevos no viables',
    'Muerte de pollos por manejo agrícola',
    'Molestias humanas',
    'Otras / desconocida',
  ];
  static const List<String> estadosFracaso = [
    'Incubación',
    'Pollos en nido',
    'Prevuelo',
    'Volanderos',
  ];
  static const List<String> estadosFinales = [
    'En curso',
    'Pollos volados',
    'Pollos cosechados / rescatados',
    'Nido fracasado',
    'Nido abandonado',
  ];
}

/// Ficha de un nido de aguilucho (42 campos de campo + control de sincronización).
///
/// Es un modelo mutable a propósito: la pantalla de edición trabaja sobre una
/// copia ([copiar]) y la persiste al guardar.
///
/// Serialización:
///  * [toJson]/[fromJson]: formato remoto (tabla `nidos_grefa` de Supabase).
///    Incluye el `id`, los 42 campos, `updated_at` e `image_urls`. No incluye
///    los campos de control exclusivamente locales.
///  * [toMap]/[fromMap]: fila de la BD local SQLite; incluye además
///    `is_synced`, `has_conflict`, `local_image_paths` y `last_synced_at`.
class NidoGrefaModel {
  NidoGrefaModel({
    String? id,
    DateTime? updatedAt,
    this.isSynced = false,
    this.hasConflict = false,
    List<String>? localImagePaths,
    List<String>? imageUrls,
    this.lastSyncedAt,
  }) : id = id ?? const Uuid().v4(),
       updatedAt = (updatedAt ?? DateTime.now()).toUtc(),
       localImagePaths = localImagePaths ?? <String>[],
       imageUrls = imageUrls ?? <String>[];

  // ---- Control ----
  final String id;
  DateTime updatedAt;
  bool isSynced;
  bool hasConflict;

  /// Rutas de fotos en el almacenamiento persistente de la app.
  List<String> localImagePaths;

  /// URLs públicas (Supabase Storage) de las fotos ya subidas.
  List<String> imageUrls;

  /// Última versión remota (`updated_at` del servidor) conocida por este
  /// dispositivo. Solo local; permite detectar ediciones concurrentes.
  DateTime? lastSyncedAt;

  // ---- F1 Ubicación / Hábitat ----
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

  /// Longitud WGS84 (grados decimales).
  double? coordenadaX;

  /// Latitud WGS84 (grados decimales).
  double? coordenadaY;
  String? sustrato;

  // ---- F2 Puesta / Incubación ----
  DateTime? fechaIncubacion;
  DateTime? fechaEclosion;
  int? numHuevosEntrada;
  int? tamanoPuesta;
  DateTime? fechaEntradaNido;

  // ---- F3 Seguimiento / Manejo ----
  int? numPollosNacidos;
  int? numHuevosNoEclosionados;
  int? edadDias;
  String? anillasPvc;
  String? anillasMetalica;
  bool intervencion = false;
  List<String> tipoAccionesManejo = <String>[];
  String? observacionesI;
  String? observacionesIi;

  // ---- F4 Cosecha / Balance ----
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

  // ---------------------------------------------------------------------
  // Derivados
  // ---------------------------------------------------------------------

  /// Estado reproductivo normalizado (insensible a mayúsculas y tildes).
  EstadoReproductivo get estadoReproductivo {
    final r = normalizarTexto(resultadoReproductivo);
    if (r == 'exito') return EstadoReproductivo.exito;
    if (r == 'fracaso') return EstadoReproductivo.fracaso;
    return EstadoReproductivo.enCurso;
  }

  bool get tieneCoordenadas =>
      coordenadaX != null &&
      coordenadaY != null &&
      coordenadaY!.abs() <= 90 &&
      coordenadaX!.abs() <= 180;

  /// Nombre para mostrar: etiqueta, numeración o los primeros caracteres del id.
  String get titulo {
    final e = etiqueta?.trim();
    if (e != null && e.isNotEmpty) return e;
    final n = numeracion?.trim();
    if (n != null && n.isNotEmpty) return 'Nido $n';
    return 'Nido ${id.substring(0, 8)}';
  }

  /// Recalcula los totales a partir de los desgloses pre/durante/post
  /// cuando existe al menos un componente informado.
  void recalcularTotales() {
    final volados = [pollosVoladosPrecosecha, pollosVoladosPostcosecha];
    if (volados.any((v) => v != null)) {
      numPollosVolados = volados.fold<int>(0, (a, b) => a + (b ?? 0));
    }
    final muertos = [
      pollosMuertosPrecosecha,
      pollosMuertosCosecha,
      pollosMuertosPostcosecha,
    ];
    if (muertos.any((v) => v != null)) {
      numPollosMuertos = muertos.fold<int>(0, (a, b) => a + (b ?? 0));
    }
    if (numPollosVolados != null) vuelanPollos = numPollosVolados! > 0;
  }

  /// Copia profunda (incluye listas y control).
  NidoGrefaModel copiar() => NidoGrefaModel.fromMap(toMap());

  // ---------------------------------------------------------------------
  // JSON remoto
  // ---------------------------------------------------------------------

  Map<String, dynamic> toJson() {
    final m = <String, dynamic>{'id': id};
    for (final c in camposNido) {
      m[c.clave] = _aJson(c, c.leer(this));
    }
    m['updated_at'] = updatedAt.toUtc().toIso8601String();
    m['image_urls'] = List<String>.of(imageUrls);
    return m;
  }

  factory NidoGrefaModel.fromJson(Map<String, dynamic> json) {
    final n = NidoGrefaModel(
      id: json['id']?.toString(),
      updatedAt: _parseFechaHora(json['updated_at']),
      imageUrls: _parseLista(json['image_urls']),
      isSynced: _parseBool(json['is_synced']),
      hasConflict: _parseBool(json['has_conflict']),
      localImagePaths: _parseLista(json['local_image_paths']),
    );
    _leerCampos(n, json);
    return n;
  }

  // ---------------------------------------------------------------------
  // Mapa SQLite
  // ---------------------------------------------------------------------

  Map<String, Object?> toMap() {
    final m = <String, Object?>{'id': id};
    for (final c in camposNido) {
      m[c.clave] = _aSqlite(c, c.leer(this));
    }
    m['updated_at'] = updatedAt.toUtc().toIso8601String();
    m['is_synced'] = isSynced ? 1 : 0;
    m['has_conflict'] = hasConflict ? 1 : 0;
    m['local_image_paths'] = jsonEncode(localImagePaths);
    m['image_urls'] = jsonEncode(imageUrls);
    m['last_synced_at'] = lastSyncedAt?.toUtc().toIso8601String();
    return m;
  }

  factory NidoGrefaModel.fromMap(Map<String, Object?> map) {
    final n = NidoGrefaModel(
      id: map['id']?.toString(),
      updatedAt: _parseFechaHora(map['updated_at']),
      isSynced: _parseBool(map['is_synced']),
      hasConflict: _parseBool(map['has_conflict']),
      localImagePaths: _parseLista(map['local_image_paths']),
      imageUrls: _parseLista(map['image_urls']),
      lastSyncedAt: map['last_synced_at'] == null
          ? null
          : _parseFechaHora(map['last_synced_at']),
    );
    _leerCampos(n, map);
    return n;
  }

  static void _leerCampos(NidoGrefaModel n, Map<String, Object?> origen) {
    for (final c in camposNido) {
      c.escribir(n, _deJson(c, origen[c.clave]));
    }
  }

  // ---------------------------------------------------------------------
  // Codificación por tipo
  // ---------------------------------------------------------------------

  static Object? _aJson(NidoCampo c, Object? v) => switch (c.tipo) {
    TipoCampo.fecha => v == null ? null : formatearFechaIso(v as DateTime),
    TipoCampo.lista => List<String>.of(v as List<String>),
    _ => v,
  };

  static Object? _aSqlite(NidoCampo c, Object? v) => switch (c.tipo) {
    TipoCampo.fecha => v == null ? null : formatearFechaIso(v as DateTime),
    TipoCampo.booleano => (v as bool) ? 1 : 0,
    TipoCampo.lista => jsonEncode(v),
    _ => v,
  };

  /// Decodificación tolerante (JSON remoto o fila SQLite).
  static Object? _deJson(NidoCampo c, Object? v) {
    switch (c.tipo) {
      case TipoCampo.texto:
        if (v == null) return null;
        final s = v.toString();
        return s.isEmpty ? null : s;
      case TipoCampo.entero:
        if (v == null) return null;
        if (v is num) return v.toInt();
        return int.tryParse(v.toString().trim());
      case TipoCampo.decimal:
        if (v == null) return null;
        if (v is num) return v.toDouble();
        return double.tryParse(v.toString().trim().replaceAll(',', '.'));
      case TipoCampo.fecha:
        return parsearFecha(v);
      case TipoCampo.booleano:
        return _parseBool(v);
      case TipoCampo.lista:
        return _parseLista(v);
    }
  }

  static bool _parseBool(Object? v) {
    if (v is bool) return v;
    if (v is num) return v != 0;
    if (v is String) {
      final s = v.toLowerCase();
      return s == 'true' || s == '1' || s == 't';
    }
    return false;
  }

  static List<String> _parseLista(Object? v) {
    if (v == null) return <String>[];
    if (v is List) return v.map((e) => e.toString()).toList();
    if (v is String) {
      final s = v.trim();
      if (s.isEmpty) return <String>[];
      if (s.startsWith('[')) {
        try {
          return (jsonDecode(s) as List).map((e) => e.toString()).toList();
        } catch (_) {
          // cae al formato separado por comas
        }
      }
      return s
          .split(',')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList();
    }
    return <String>[];
  }

  static DateTime? _parseFechaHora(Object? v) {
    if (v == null) return null;
    if (v is DateTime) return v.toUtc();
    final d = DateTime.tryParse(v.toString());
    return d?.toUtc();
  }
}

/// `yyyy-MM-dd` (columna `date` de Postgres).
String formatearFechaIso(DateTime d) {
  final y = d.year.toString().padLeft(4, '0');
  final m = d.month.toString().padLeft(2, '0');
  final dd = d.day.toString().padLeft(2, '0');
  return '$y-$m-$dd';
}

/// Interpreta fechas `yyyy-MM-dd` (o ISO completo) como fecha de calendario
/// local sin hora, para evitar desfases por zona horaria.
DateTime? parsearFecha(Object? v) {
  if (v == null) return null;
  if (v is DateTime) return DateTime(v.year, v.month, v.day);
  final s = v.toString().trim();
  if (s.isEmpty) return null;
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(s);
  if (m != null) {
    return DateTime(
      int.parse(m.group(1)!),
      int.parse(m.group(2)!),
      int.parse(m.group(3)!),
    );
  }
  final d = DateTime.tryParse(s);
  return d == null ? null : DateTime(d.year, d.month, d.day);
}
