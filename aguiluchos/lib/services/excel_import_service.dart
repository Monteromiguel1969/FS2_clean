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
    this.actualizados = 0,
    this.sinCambios = 0,
    this.columnasQueFaltan = const [],
    this.cabecerasReconocidas = const [],
    this.traeProyecto = false,
    this.traeCampana = false,
    this.tolerante = false,
  });

  final int nuevos;

  /// Nidos que ya existían (en la importación tolerante: actualizados + sin cambios).
  final int yaExistentes;
  final ImportParseResult parse;

  /// Importación tolerante: nidos existentes a los que se completaron celdas.
  final int actualizados;
  final int sinCambios;

  /// Campos de la app que el fichero no trae (no se tocan).
  final List<String> columnasQueFaltan;

  /// Cabecera del fichero -> campo de la app («Año» -> «Campaña»).
  final List<({String cabecera, String campo})> cabecerasReconocidas;
  final bool traeProyecto;
  final bool traeCampana;
  final bool tolerante;
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
  ExcelImportService({this.campana = 'aguiluchos-2026', this.idsPorCampana = false});

  /// Semilla de los ids deterministas (carga inicial empaquetada).
  final String campana;

  /// Importación tolerante: el id de un nido nuevo se deriva de su campaña
  /// (`aguiluchos-<campaña>/nido/<numeración>`), igual que en el panel web, de
  /// modo que importar el mismo fichero en la app y en el panel no duplica nidos.
  final bool idsPorCampana;

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
    'campana': 'campana',
    // «Año» (o «Ano») vale como campaña, salvo que el fichero traiga «Campaña».
    'ano': 'campana',
    'anyo': 'campana',
    'temporada': 'campana',
    'localidad': 'municipio',
    'poblacion': 'municipio',
    'catastro': 'referencia_catastral',
    'refcatastral': 'referencia_catastral',
    'x': 'coordenada_x',
    'utmx': 'coordenada_x',
    'este': 'coordenada_x',
    'y': 'coordenada_y',
    'utmy': 'coordenada_y',
    'norte': 'coordenada_y',
    'huevosalentrarnido': 'num_huevos_entrada',
    'huevosentrada': 'num_huevos_entrada',
    'pollosnacidos': 'num_pollos_nacidos',
    'pollosvolados': 'num_pollos_volados',
    'pollosmuertos': 'num_pollos_muertos',
    'edad': 'edad_dias',
    'tipodemanejo': '_manejo',
    'manejo': '_manejo',
  };

  // Cabeceras con sufijos informativos: "Fecha de eclosión (30 dias)".
  static const _prefijos = <String, String>{
    'fechadeeclosion': 'fecha_eclosion',
    'fechadevuelo': 'fecha_vuelo',
    'fechadeincubacion': 'fecha_incubacion',
    'fechadecosecha': 'fecha_cosecha',
    'fechadeentrada': 'fecha_entrada_nido',
    'tipodeacciones': '_manejo',
  };

  static final _invisibles = RegExp(r'[\u200B-\u200F\u2060\uFEFF\u00AD]');

  static String _normalizarCabecera(Object? h) {
    var s = (h ?? '')
        .toString()
        .replaceAll(_invisibles, '')
        .replaceAll(RegExp(r'[\u00A0\u2007\u202F]'), ' ')
        .toLowerCase();
    const from = 'áàäâéèëêíìïîóòöôúùüûñ';
    const to = 'aaaaeeeeiiiioooouuuun';
    for (var i = 0; i < from.length; i++) {
      s = s.replaceAll(from[i], to[i]);
    }
    return s.replaceAll(RegExp(r'[^a-z0-9]'), '');
  }

  /// Cabecera normalizada ignorando lo que va entre paréntesis («Fecha de eclosión (30 días)»).
  static String _normalizarEncabezado(Object? h) =>
      _normalizarCabecera((h ?? '').toString().replaceAll(RegExp(r'\([^)]*\)'), ' '));

  static bool _unaEdicion(String a, String b) {
    if ((a.length - b.length).abs() > 1) return false;
    var i = 0;
    while (i < a.length && i < b.length && a[i] == b[i]) {
      i++;
    }
    if (a.length == b.length) return a.substring(i + 1) == b.substring(i + 1);
    final corta = a.length < b.length ? a : b;
    final larga = a.length < b.length ? b : a;
    return corta.substring(i) == larga.substring(i + 1);
  }

  /// Segunda pasada para cabeceras sin coincidencia exacta («Campañas»,
  /// «Año campaña», «Proyecto:», erratas de una letra…), solo si el campo sigue libre.
  static String? _claveAproximada(String norm, bool Function(String) libre) {
    if (norm.contains('campan') && libre('campana')) return 'campana';
    if (norm.contains('proyecto') && libre('proyecto')) return 'proyecto';
    if (norm.length < 6) return null;
    final cercanos = <String>{};
    for (final e in {..._exactas, ..._prefijos}.entries) {
      if (e.key.length >= 6 && libre(e.value) && _unaEdicion(norm, e.key)) {
        cercanos.add(e.value);
      }
    }
    return cercanos.length == 1 ? cercanos.first : null;
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

  ImportParseResult parse(Uint8List bytes, {String? hoja}) =>
      _leer(bytes, hoja: hoja).resultado;

  /// Lee la hoja: empareja cabeceras, convierte cada fila y anota qué campos
  /// traen dato (para la importación tolerante).
  LecturaExcel _leer(Uint8List bytes, {String? hoja}) {
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
    final reconocidas = <({String cabecera, String campo})>[];
    final cabeceras = <(int, String, String)>[]; // (columna, texto, normalizada)
    for (var i = 0; i < rows.first.length; i++) {
      final raw = _texto(rows.first[i]?.value);
      if (raw == null) continue;
      cabeceras.add((i, raw.trim(), _normalizarEncabezado(raw)));
    }
    // «Año» vale como campaña, pero si el fichero trae «Campaña», manda esa.
    final hayCampanaPropia = cabeceras.any((c) => c.$3 == 'campana');
    final pendientes = <(int, String, String)>[];
    for (final (i, texto, norm) in cabeceras) {
      final clave = _claveDe(norm);
      if (clave == null) {
        pendientes.add((i, texto, norm));
      } else if (cols.containsKey(clave) ||
          (hayCampanaPropia && clave == 'campana' && norm != 'campana')) {
        desconocidas.add(texto);
      } else {
        cols[clave] = i;
        reconocidas.add((cabecera: texto, campo: clave));
      }
    }
    for (final (i, texto, norm) in pendientes) {
      final clave = _claveAproximada(norm, (k) => !cols.containsKey(k));
      if (clave == null) {
        desconocidas.add(texto);
      } else {
        cols[clave] = i;
        reconocidas.add((cabecera: texto, campo: clave));
      }
    }
    if (!cols.containsKey('etiqueta') && !cols.containsKey('_numeracion')) {
      throw const FormatException(
          'No se reconoce el formato: faltan las columnas "Etiqueta" o "Numeración".');
    }

    final nidos = <NidoGrefaModel>[];
    final lecturas = <FilaExcelLeida>[];
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
      lecturas.add(FilaExcelLeida(n, {
        for (final k in cols.keys)
          if (_texto(v(k)) != null) k,
      }));
    }

    final resultado = ImportParseResult(
      nidos: nidos,
      avisos: avisos,
      filasLeidas: leidas,
      filasOmitidas: omitidas,
      columnasNoReconocidas: desconocidas,
    );
    final traen = {for (final k in cols.keys) k == '_numeracion' ? 'numeracion' : k};
    return LecturaExcel(
      resultado,
      lecturas,
      reconocidas,
      [
        for (final c in nidoColumns)
          if (!traen.contains(c.key) &&
              !(c.key == 'tipo_acciones_manejo' && cols.containsKey('_manejo')))
            c.label,
      ],
      traeProyecto: cols.containsKey('proyecto'),
      traeCampana: cols.containsKey('campana'),
    );
  }

  // ── Importación tolerante ────────────────────────────────────────────────

  static String _k(String? t) => _normalizarCabecera(t ?? '');
  static bool _blanco(String? t) => (t ?? '').trim().isEmpty;
  static bool _compatible(String? a, String? b) =>
      _blanco(a) || _blanco(b) || _k(a) == _k(b);

  static bool _iguales(Object? a, Object? b) {
    if (a is List || b is List) {
      final x = [...((a as List?) ?? const [])]..sort();
      final y = [...((b as List?) ?? const [])]..sort();
      return x.join('|') == y.join('|');
    }
    if (a is String || b is String) return (a ?? '').toString().trim() == (b ?? '').toString().trim();
    return a == b;
  }

  /// Campos de [cand] que traen dato en el fichero y por tanto pueden aplicarse.
  /// Lo que falta (columna ausente o celda vacía) nunca borra ni pisa nada.
  static Set<String> _camposConDato(FilaExcelLeida f) {
    final c = f.nido;
    final p = f.presentes;
    final out = <String>{};
    for (final col in nidoColumns) {
      final k = col.key;
      final valor = col.read(c);
      final hay = switch (k) {
        'numeracion' => p.contains('_numeracion'),
        'intervencion' => p.contains('intervencion') || c.tipoAccionesManejo.isNotEmpty,
        'tipo_acciones_manejo' => c.tipoAccionesManejo.isNotEmpty,
        'vuelan_pollos' => p.contains('vuelan_pollos') || p.contains('num_pollos_volados'),
        'observaciones_ii' => c.observacionesII != null,
        'resultado_reproductivo' || 'estado_final' => valor != null,
        'coordenada_x' || 'coordenada_y' => c.coordenadaX != null && c.coordenadaY != null,
        _ => p.contains(k) && valor != null,
      };
      if (hay) out.add(k);
    }
    return out;
  }

  /// Decide qué hacer con cada fila sin tocar la base de datos.
  ///
  /// Empareja cada fila con un nido existente por numeración (o etiqueta) siendo
  /// compatibles proyecto y campaña (uno vacío vale para cualquiera). A los
  /// existentes solo se les completan las celdas con dato; los demás son nuevos.
  PlanImportacion planificar(List<NidoGrefaModel> existentes, Uint8List bytes) {
    final lectura = _leer(bytes);
    final registros = [
      for (final e in existentes) _Registro(e.clone(), nuevo: false),
    ];
    final idsUsados = {for (final e in existentes) e.id};
    var sinCambios = 0;

    for (final f in lectura.filas) {
      final cand = f.nido;
      final porNum = !_blanco(cand.numeracion);
      final valor = porNum ? _k(cand.numeracion) : _k(cand.etiqueta);
      final candidatos = registros.where((r) {
        final dato = porNum ? r.nido.numeracion : r.nido.etiqueta;
        return _k(dato) == valor &&
            _compatible(r.nido.proyecto, cand.proyecto) &&
            _compatible(r.nido.campana, cand.campana);
      }).toList();
      final exacto = _blanco(cand.campana)
          ? null
          : candidatos.where((r) => _k(r.nido.campana) == _k(cand.campana)).firstOrNull;
      var reg = exacto ?? candidatos.firstOrNull;

      if (reg == null) {
        var n = cand;
        if (idsUsados.contains(n.id)) {
          n = NidoGrefaModel.fromMap({...cand.toMap(), 'id': const Uuid().v4()});
        }
        idsUsados.add(n.id);
        reg = _Registro(n, nuevo: true);
        registros.add(reg);
      }
      reg.tocado = true;
      if (reg.nuevo && !identical(reg.nido, cand)) {
        // Fila repetida dentro del propio fichero: completa el nido nuevo.
        _aplicar(reg, cand, _camposConDato(f));
      } else if (!reg.nuevo) {
        _aplicar(reg, cand, _camposConDato(f));
      }
    }

    final nuevos = <NidoGrefaModel>[];
    final actualizar = <NidoGrefaModel>[];
    final camposCambiados = <String, Set<String>>{};
    for (final r in registros) {
      if (!r.tocado) continue;
      if (r.nuevo) {
        nuevos.add(r.nido);
      } else if (r.cambios.isNotEmpty) {
        actualizar.add(r.nido);
        camposCambiados[r.nido.id] = r.cambios;
      } else {
        sinCambios++;
      }
    }
    return PlanImportacion(
      nuevos: nuevos,
      actualizar: actualizar,
      camposCambiados: camposCambiados,
      sinCambios: sinCambios,
      lectura: lectura,
    );
  }

  void _aplicar(_Registro reg, NidoGrefaModel cand, Set<String> campos) {
    for (final col in nidoColumns) {
      if (!campos.contains(col.key)) continue;
      final nuevo = col.read(cand);
      if (_iguales(col.read(reg.nido), nuevo)) continue;
      col.write(reg.nido, nuevo);
      reg.cambios.add(col.key);
    }
  }

  /// Importación tolerante a SQLite: columnas que faltan o celdas vacías no
  /// machacan datos; los nidos existentes solo se completan.
  Future<ImportReport> importarTolerante(DatabaseService db, Uint8List bytes,
      {DateTime? updatedAt}) async {
    final existentes = await db.consultar();
    final plan = planificar(existentes, bytes);
    var nuevos = 0;
    for (var n in plan.nuevos) {
      if (await db.obtener(n.id, incluirBorrados: true) != null) {
        n = NidoGrefaModel.fromMap({...n.toMap(), 'id': const Uuid().v4()});
      }
      await db.guardar(n, updatedAt: updatedAt);
      nuevos++;
    }
    for (final n in plan.actualizar) {
      await db.guardar(n, updatedAt: updatedAt);
    }
    final l = plan.lectura;
    return ImportReport(
      nuevos: nuevos,
      yaExistentes: plan.actualizar.length + plan.sinCambios,
      actualizados: plan.actualizar.length,
      sinCambios: plan.sinCambios,
      parse: l.resultado,
      columnasQueFaltan: l.columnasQueFaltan,
      cabecerasReconocidas: l.reconocidas,
      traeProyecto: l.traeProyecto,
      traeCampana: l.traeCampana,
      tolerante: true,
    );
  }

  /// Importa a SQLite. Los nidos que ya existen (mismo id) no se sobrescriben.
  ///
  /// [updatedAt] fija la marca de edición de lo importado (por defecto, ahora).
  /// La carga inicial empaquetada usa [NidoGrefaModel.marcaCargaInicial] para
  /// no machacar ediciones más recientes que ya existan en Supabase.
  Future<ImportReport> importar(DatabaseService db, Uint8List bytes,
      {DateTime? updatedAt}) async {
    final parsed = parse(bytes);
    var nuevos = 0;
    var existentes = 0;
    for (final n in parsed.nidos) {
      if (await db.obtener(n.id, incluirBorrados: true) != null) {
        existentes++;
        continue;
      }
      await db.guardar(n, updatedAt: updatedAt);
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
    final campanaFila = _texto(v('campana'));
    final semilla = idsPorCampana
        ? 'aguiluchos-${campanaFila ?? '2026'}/${numeracion != null ? 'nido' : 'etiqueta'}/${numeracion ?? etiqueta ?? 'fila$filaExcel'}'
        : '$campana/nido/${numeracion ?? 'fila$filaExcel'}';
    final id = const Uuid().v5(Namespace.url.value, semilla);
    final n = NidoGrefaModel(id: id);
    final ref = 'Fila $filaExcel (${etiqueta ?? numeracion})';
    void aviso(String m) => avisos.add('$ref: $m');
    final notas = <String>[];
    final aproximadas = <String>[];

    n.numeracion = numeracion;
    n.etiqueta = etiqueta;
    n.proyecto = _texto(v('proyecto'));
    n.campana = campanaFila;
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

class FilaExcelLeida {
  FilaExcelLeida(this.nido, this.presentes);
  final NidoGrefaModel nido;

  /// Claves de columna (`_numeracion`, `_manejo`…) cuya celda trae dato.
  final Set<String> presentes;
}

class LecturaExcel {
  LecturaExcel(this.resultado, this.filas, this.reconocidas, this.columnasQueFaltan,
      {required this.traeProyecto, required this.traeCampana});
  final ImportParseResult resultado;
  final List<FilaExcelLeida> filas;
  final List<({String cabecera, String campo})> reconocidas;
  final List<String> columnasQueFaltan;
  final bool traeProyecto;
  final bool traeCampana;
}

class _Registro {
  _Registro(this.nido, {required this.nuevo});
  final NidoGrefaModel nido;
  final bool nuevo;
  bool tocado = false;
  final Set<String> cambios = {};
}

/// Qué haría una importación tolerante (sin haber tocado nada todavía).
class PlanImportacion {
  PlanImportacion({
    required this.nuevos,
    required this.actualizar,
    required this.camposCambiados,
    required this.sinCambios,
    required this.lectura,
  });

  final List<NidoGrefaModel> nuevos;

  /// Existentes con los campos ya completados (listos para guardar).
  final List<NidoGrefaModel> actualizar;

  /// id del nido existente -> claves de columna que cambian.
  final Map<String, Set<String>> camposCambiados;
  final int sinCambios;
  final LecturaExcel lectura;

  ImportParseResult get parse => lectura.resultado;
}
