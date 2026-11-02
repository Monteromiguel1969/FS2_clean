import 'dart:typed_data';

import 'package:excel/excel.dart' as xl;
import 'package:uuid/uuid.dart';

import '../models/nido_constants.dart';
import '../models/nido_grefa_model.dart';
import '../utils/utm.dart';
import 'database_service.dart';

/// Resultado de leer un Excel de campaña (sin tocar la base de datos).
class ImportParseResult {
  ImportParseResult({
    required this.nidos,
    required this.avisos,
    required this.filasLeidas,
    required this.filasOmitidas,
    required this.columnasNoReconocidas,
  });

  final List<NidoGrefaModel> nidos;

  /// Avisos por fila ("Fila 12 (P3): ...") sobre valores que se limpiaron.
  final List<String> avisos;
  final int filasLeidas;
  final int filasOmitidas;
  final List<String> columnasNoReconocidas;
}

/// Resultado de importar a la base de datos local.
class ImportReport {
  ImportReport({
    required this.nuevos,
    required this.yaExistentes,
    required this.parse,
  });

  final int nuevos;
  final int yaExistentes;
  final ImportParseResult parse;
}

/// Importa el Excel de campaña de GREFA (p. ej. "DATOS FINALES AGUILUCHO 2026").
///
/// Las columnas se localizan por el **nombre de la cabecera** (sin importar
/// orden, mayúsculas, tildes ni espacios sobrantes). Los datos reales son muy
/// heterogéneos ("—", "--", "Indet", "?", fechas "±12/04/2026", edades
/// "21-19-17"...), así que se normalizan:
///
/// * marcadores de "sin dato" → vacío;
/// * fechas aproximadas (`±`) o con rango (`05-10/07/2026`) → primer día, y se
///   anota en Observaciones II qué campos eran aproximados;
/// * edades múltiples ("21-19-17") → la mayor, y se anota el original;
/// * especie, estado final, causas y estado del fracaso → vocabulario de la app;
/// * "Tipo de acciones y/o manejo" (texto libre) → chips Dron/Rodal/Compensación
///   + el texto original se conserva en Observaciones II;
/// * coordenadas: se conservan en UTM; si no son plausibles se descartan.
///
/// Los ids son deterministas (UUID v5 sobre la numeración), de modo que
/// reimportar el mismo fichero no duplica nidos.
class ExcelImportService {
  ExcelImportService({this.campana = 'aguiluchos-2026'});

  final String campana;

  static const _sinDato = {
    '', '—', '–', '-', '--', '---', '?', 'indet', 'indet.', 'indeter.',
    'indeterminado', 'indeterminada', 'n/d', 'nd', 'none', 'null',
  };

  // Cabecera normalizada -> clave de columna (o '_manejo' para el texto libre).
  static const _exactas = <String, String>{
    'numeracion': '_numeracion',
    'etiqueta': 'etiqueta',
    'proyecto': 'proyecto',
    'propietario': 'propietario',
    'tlfn': 'tlfn',
    'telefono': 'tlfn',
    'localizacionesgooglemaps': 'google_maps_url',
    'googlemapsurl': 'google_maps_url',
    'municipio': 'municipio',
    'provincia': 'provincia',
    'referenciacatastral': 'referencia_catastral',
    'especie': 'especie',
    'territorio': 'territorio',
    'coordenadax': 'coordenada_x',
    'coordenaday': 'coordenada_y',
    'estadofinal': 'estado_final',
    'sustrato': 'sustrato',
    'fechaincubacion': 'fecha_incubacion',
    'nhuevosalentrarnido': 'num_huevos_entrada',
    'nhuevosnoeclosionados': 'num_huevos_no_eclosionados',
    'npollosnacidos': 'num_pollos_nacidos',
    'edaddias': 'edad_dias',
    'tamanopuesta': 'tamano_puesta',
    'fechaentradanido': 'fecha_entrada_nido',
    'npollosvolados': 'num_pollos_volados',
    'vuelanpollos': 'vuelan_pollos',
    'fechacosecha': 'fecha_cosecha',
    'pollosvoladosprecosecha': 'pollos_volados_precosecha',
    'pollosvoladospostcosecha': 'pollos_volados_postcosecha',
    'npollosmuertos': 'num_pollos_muertos',
    'pollosmuertosprecosecha': 'pollos_muertos_precosecha',
    'pollosmuertosdurantelacosecha': 'pollos_muertos_cosecha',
    'pollosmuertospostcosecha': 'pollos_muertos_postcosecha',
    'resultadoreproductivo': 'resultado_reproductivo',
    'causasfracaso': 'causas_fracaso',
    'estadofracaso': 'estado_fracaso',
    'intervencion': 'intervencion',
    'observacionesi': 'observaciones_i',
    'observacionesii': 'observaciones_ii',
    'anillaspvc': 'anillas_pvc',
    'anillasmetalica': 'anillas_metalica',
  };

  // Cabeceras con sufijos informativos: "Fecha de eclosión (30 dias)".
  static const _prefijos = <String, String>{
    'fechadeeclosion': 'fecha_eclosion',
    'fechadevuelo': 'fecha_vuelo',
    'tipodeacciones': '_manejo',
  };

  static String _normalizarCabecera(Object? h) {
    var s = (h ?? '').toString().toLowerCase();
    const from = 'áàäâéèëêíìïîóòöôúùüûñ';
    const to = 'aaaaeeeeiiiioooouuuun';
    for (var i = 0; i < from.length; i++) {
      s = s.replaceAll(from[i], to[i]);
    }
    return s.replaceAll(RegExp(r'[^a-z0-9]'), '');
  }

  static String? _claveDe(String norm) {
    final e = _exactas[norm];
    if (e != null) return e;
    for (final p in _prefijos.entries) {
      if (norm.startsWith(p.key)) return p.value;
    }
    return null;
  }

  // ── API ──────────────────────────────────────────────────────────────────

  ImportParseResult parse(Uint8List bytes, {String? hoja}) {
    final book = xl.Excel.decodeBytes(bytes);
    final nombreHoja = hoja ?? book.tables.keys.first;
    final sheet = book.tables[nombreHoja];
    if (sheet == null) {
      throw FormatException('El libro no contiene la hoja "$nombreHoja".');
    }
    final rows = sheet.rows;
    if (rows.isEmpty) {
      throw const FormatException('La hoja está vacía.');
    }

    final cols = <String, int>{};
    final desconocidas = <String>[];
    for (var i = 0; i < rows.first.length; i++) {
      final raw = _texto(rows.first[i]?.value);
      if (raw == null) continue;
      final clave = _claveDe(_normalizarCabecera(raw));
      if (clave == null) {
        desconocidas.add(raw.trim());
      } else {
        cols.putIfAbsent(clave, () => i);
      }
    }
    if (!cols.containsKey('etiqueta') && !cols.containsKey('_numeracion')) {
      throw const FormatException(
          'No se reconoce el formato: faltan las columnas "Etiqueta" o "Numeración".');
    }

    final nidos = <NidoGrefaModel>[];
    final avisos = <String>[];
    var omitidas = 0;
    var leidas = 0;

    for (var r = 1; r < rows.length; r++) {
      final fila = rows[r];
      Object? v(String clave) {
        final i = cols[clave];
        return (i == null || i >= fila.length) ? null : fila[i]?.value;
      }

      if (fila.every((c) => c?.value == null || _texto(c!.value) == null)) {
        omitidas++;
        continue;
      }
      leidas++;
      final etiqueta = _texto(v('etiqueta'));
      final numeracion = _numeracion(v('_numeracion'));
      if (etiqueta == null && numeracion == null) {
        omitidas++;
        continue;
      }
      final n = _fila(
        v: v,
        etiqueta: etiqueta,
        numeracion: numeracion,
        filaExcel: r + 1,
        avisos: avisos,
      );
      nidos.add(n);
    }

    return ImportParseResult(
      nidos: nidos,
      avisos: avisos,
      filasLeidas: leidas,
      filasOmitidas: omitidas,
      columnasNoReconocidas: desconocidas,
    );
  }

  /// Importa a SQLite. Los nidos que ya existen (mismo id) no se sobrescriben.
  Future<ImportReport> importar(DatabaseService db, Uint8List bytes) async {
    final parsed = parse(bytes);
    var nuevos = 0;
    var existentes = 0;
    for (final n in parsed.nidos) {
      if (await db.obtener(n.id, incluirBorrados: true) != null) {
        existentes++;
        continue;
      }
      await db.guardar(n);
      nuevos++;
    }
    return ImportReport(nuevos: nuevos, yaExistentes: existentes, parse: parsed);
  }

  // ── Conversión de una fila ───────────────────────────────────────────────

  NidoGrefaModel _fila({
    required Object? Function(String) v,
    required String? etiqueta,
    required String? numeracion,
    required int filaExcel,
    required List<String> avisos,
  }) {
    final id = const Uuid().v5(
        Namespace.url.value, '$campana/nido/${numeracion ?? 'fila$filaExcel'}');
    final n = NidoGrefaModel(id: id);
    final ref = 'Fila $filaExcel (${etiqueta ?? numeracion})';
    void aviso(String m) => avisos.add('$ref: $m');
    final notas = <String>[];
    final aproximadas = <String>[];

    n.numeracion = numeracion;
    n.etiqueta = etiqueta;
    n.proyecto = _texto(v('proyecto'));
    n.propietario = _texto(v('propietario'));
    n.tlfn = _telefono(v('tlfn'));
    final url = _texto(v('google_maps_url'));
    n.googleMapsUrl = (url != null && url.startsWith('http')) ? url : null;
    n.municipio = _texto(v('municipio'));
    n.provincia = _texto(v('provincia'));
    n.referenciaCatastral = _texto(v('referencia_catastral'));
    n.territorio = _enCatalogo(_texto(v('territorio')), Territorios.todos);
    n.sustrato = _enCatalogo(_texto(v('sustrato')), Sustratos.todos);

    final espRaw = _texto(v('especie'));
    n.especie = Especies.normalizar(espRaw) ?? espRaw;
    if (espRaw != null && Especies.normalizar(espRaw) == null) {
      aviso('especie "$espRaw" no reconocida (se conserva tal cual)');
    }

    // Coordenadas UTM.
    final x = _numero(v('coordenada_x'));
    final y = _numero(v('coordenada_y'));
    if (x != null && y != null) {
      if (Utm.esPlausible(x, y)) {
        n.coordenadaX = x;
        n.coordenadaY = y;
      } else {
        aviso('coordenadas UTM no plausibles (X=$x, Y=$y): se descartan');
      }
    } else if (x != null || y != null) {
      aviso('coordenadas incompletas: se descartan');
    }

    // Fechas.
    DateTime? fecha(String clave) {
      final raw = v(clave);
      final r = _fecha(raw);
      if (r == null) {
        if (raw != null && _texto(raw) != null) {
          aviso('fecha ilegible en $clave: "${_texto(raw)}"');
        }
        return null;
      }
      if (r.aproximada) aproximadas.add(clave);
      return r.fecha;
    }

    n.fechaIncubacion = fecha('fecha_incubacion');
    n.fechaEclosion = fecha('fecha_eclosion');
    n.fechaEntradaNido = fecha('fecha_entrada_nido');
    n.fechaVuelo = fecha('fecha_vuelo');
    n.fechaCosecha = fecha('fecha_cosecha');

    // Contadores.
    n.numHuevosEntrada = _entero(v('num_huevos_entrada'));
    n.tamanoPuesta = _entero(v('tamano_puesta'));
    n.numPollosNacidos = _entero(v('num_pollos_nacidos'));
    n.numHuevosNoEclosionados = _entero(v('num_huevos_no_eclosionados'));
    n.pollosVoladosPrecosecha = _entero(v('pollos_volados_precosecha'));
    n.pollosVoladosPostcosecha = _entero(v('pollos_volados_postcosecha'));
    n.numPollosVolados = _entero(v('num_pollos_volados'));
    n.pollosMuertosPrecosecha = _entero(v('pollos_muertos_precosecha'));
    n.pollosMuertosCosecha = _entero(v('pollos_muertos_cosecha'));
    n.pollosMuertosPostcosecha = _entero(v('pollos_muertos_postcosecha'));
    n.numPollosMuertos = _entero(v('num_pollos_muertos'));

    final edadRaw = v('edad_dias');
    final edad = _edad(edadRaw);
    n.edadDias = edad.valor;
    if (edad.multiple) {
      notas.add('edad original: ${_texto(edadRaw)}');
    }

    n.anillasPvc = _texto(v('anillas_pvc'));
    n.anillasMetalica = _texto(v('anillas_metalica'));

    // Intervención y manejo.
    n.intervencion = _si(v('intervencion')) ?? false;
    final manejoTxt = _texto(v('_manejo'));
    n.tipoAccionesManejo = _tiposManejo(manejoTxt);
    if (n.tipoAccionesManejo.isNotEmpty && !n.intervencion) {
      n.intervencion = true;
      aviso('hay acciones de manejo pero Intervención no era "Sí": se marca Intervención');
    }

    n.observacionesI = _texto(v('observaciones_i'));
    n.observacionesII = _texto(v('observaciones_ii'));

    // Resultado.
    final estadoRaw = _texto(v('estado_final'));
    n.estadoFinal = _enCatalogo(estadoRaw, EstadosFinales.todos);
    final resRaw = _texto(v('resultado_reproductivo'));
    n.resultadoReproductivo = _resultado(resRaw) ?? _resultadoDeEstado(n.estadoFinal);
    final porEstado = _resultadoDeEstado(n.estadoFinal);
    if (_resultado(resRaw) != null &&
        porEstado != null &&
        _resultado(resRaw) != porEstado) {
      aviso('resultado "$resRaw" contradice el estado final "${n.estadoFinal}"');
    }
    n.causasFracaso = _enCatalogo(_texto(v('causas_fracaso')), CausasFracaso.todas);
    n.estadoFracaso = _estadoFracaso(_texto(v('estado_fracaso')));

    final vuelan = _si(v('vuelan_pollos'));
    n.vuelanPollos = vuelan ?? ((n.numPollosVolados ?? 0) > 0);

    // Coherencia de totales (solo aviso; no se modifican los datos de origen).
    final pre = n.pollosVoladosPrecosecha;
    final post = n.pollosVoladosPostcosecha;
    if (pre != null &&
        post != null &&
        n.numPollosVolados != null &&
        pre + post != n.numPollosVolados) {
      aviso('volados pre+post ($pre+$post) ≠ total (${n.numPollosVolados})');
    }
    final mp = n.pollosMuertosPrecosecha;
    final mc = n.pollosMuertosCosecha;
    final mo = n.pollosMuertosPostcosecha;
    if (mp != null &&
        mc != null &&
        mo != null &&
        n.numPollosMuertos != null &&
        mp + mc + mo != n.numPollosMuertos) {
      aviso('muertos pre+cosecha+post (${mp + mc + mo}) ≠ total (${n.numPollosMuertos})');
    }

    // Información que no cabe en columnas tipadas: se conserva en Observaciones II.
    final extra = <String>[
      if (manejoTxt != null) 'Acciones de manejo (texto original): $manejoTxt',
      if (aproximadas.isNotEmpty) 'Fechas aproximadas en origen: ${aproximadas.join(', ')}',
      ...notas,
    ];
    if (extra.isNotEmpty) {
      final base = n.observacionesII;
      n.observacionesII = [
        ?base,
        '[Importado del Excel] ${extra.join(' | ')}',
      ].join('\n\n');
    }
    return n;
  }

  // ── Conversión de valores ────────────────────────────────────────────────

  static String? _texto(Object? raw) {
    if (raw == null) return null;
    String s;
    if (raw is xl.CellValue) {
      s = switch (raw) {
        xl.IntCellValue(:final value) => '$value',
        xl.DoubleCellValue(:final value) =>
          value == value.roundToDouble() ? '${value.toInt()}' : '$value',
        xl.DateCellValue() => _isoDate(raw),
        _ => raw.toString(),
      };
    } else {
      s = raw.toString();
    }
    s = s.trim();
    return _sinDato.contains(s.toLowerCase()) ? null : s;
  }

  static String _isoDate(xl.DateCellValue d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static String? _numeracion(Object? raw) => _texto(raw);

  static String? _telefono(Object? raw) {
    final t = _texto(raw);
    if (t == null) return null;
    return t.replaceAll(RegExp(r'[.,;]+$'), '').trim();
  }

  static double? _numero(Object? raw) {
    final t = _texto(raw);
    if (t == null) return null;
    return double.tryParse(t.replaceAll(RegExp(r'\s'), '').replaceAll(',', '.'));
  }

  static int? _entero(Object? raw) {
    final t = _texto(raw);
    if (t == null) return null;
    final d = double.tryParse(t.replaceAll(RegExp(r'\s'), ''));
    if (d == null || d < 0 || d != d.roundToDouble()) return null;
    return d.toInt();
  }

  static ({int? valor, bool multiple}) _edad(Object? raw) {
    final t = _texto(raw);
    if (t == null) return (valor: null, multiple: false);
    final nums = RegExp(r'\d+').allMatches(t).map((m) => int.parse(m.group(0)!)).toList();
    if (nums.isEmpty) return (valor: null, multiple: false);
    final multiple = nums.length > 1 || t.contains('±');
    return (valor: nums.reduce((a, b) => a > b ? a : b), multiple: multiple);
  }

  static ({DateTime fecha, bool aproximada})? _fecha(Object? raw) {
    if (raw == null) return null;
    if (raw is xl.DateCellValue) {
      return (fecha: DateTime(raw.year, raw.month, raw.day), aproximada: false);
    }
    if (raw is xl.DateTimeCellValue) {
      return (fecha: DateTime(raw.year, raw.month, raw.day), aproximada: false);
    }
    final t = _texto(raw);
    if (t == null) return null;
    final aprox = t.contains('±') || t.contains('~') || t.toLowerCase().contains('aprox');
    final limpio = t.replaceAll(RegExp(r'[±~]'), '').trim();
    final iso = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(limpio);
    if (iso != null) {
      return (
        fecha: DateTime(int.parse(iso.group(1)!), int.parse(iso.group(2)!), int.parse(iso.group(3)!)),
        aproximada: aprox,
      );
    }
    final m = RegExp(r'^(\d{1,2})(\s*-\s*\d{1,2})?\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})$')
        .firstMatch(limpio);
    if (m == null) return null;
    var year = int.parse(m.group(4)!);
    if (year < 100) year += 2000;
    final month = int.parse(m.group(3)!);
    final day = int.parse(m.group(1)!);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return (fecha: DateTime(year, month, day), aproximada: aprox || m.group(2) != null);
  }

  static bool? _si(Object? raw) {
    final t = _texto(raw)?.toLowerCase();
    if (t == null) return null;
    if (t == 'si' || t == 'sí' || t == 's' || t == 'true') return true;
    if (t == 'no' || t == 'n' || t == 'false') return false;
    return null;
  }

  static String _clave(String s) => _normalizarCabecera(s);

  /// Devuelve el valor del catálogo equivalente (ignorando tildes/mayúsculas)
  /// o el texto original si no está en el catálogo.
  static String? _enCatalogo(String? t, List<String> catalogo) {
    if (t == null) return null;
    final k = _clave(t);
    for (final c in catalogo) {
      if (_clave(c) == k) return c;
    }
    // "Huevos infertiles" ~ "Huevos infértiles" ya cubierto por _clave.
    return t;
  }

  static List<String> _tiposManejo(String? t) {
    if (t == null) return <String>[];
    final s = t.toLowerCase();
    return [
      if (s.contains('dron')) TiposManejo.dron,
      if (s.contains('rodal')) TiposManejo.rodal,
      if (s.contains('compensa')) TiposManejo.compensacion,
    ];
  }

  static String? _resultado(String? t) {
    final s = t?.toLowerCase();
    if (s == null) return null;
    if (s == 'éxito' || s == 'exito') return ResultadoReproductivo.exito;
    if (s == 'fracaso') return ResultadoReproductivo.fracaso;
    return null;
  }

  static String? _resultadoDeEstado(String? estado) => switch (estado) {
        EstadosFinales.conExito => ResultadoReproductivo.exito,
        EstadosFinales.sinExito => ResultadoReproductivo.fracaso,
        _ => null,
      };

  static String? _estadoFracaso(String? t) {
    if (t == null) return null;
    final s = t.toLowerCase();
    final pollo = s.contains('pollo');
    final huevo = s.contains('huevo');
    if (pollo && huevo) return EstadosFracaso.pollosYHuevos;
    if (huevo) return EstadosFracaso.huevos;
    if (pollo) return EstadosFracaso.pollos;
    return null;
  }
}
