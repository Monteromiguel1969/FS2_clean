import '../models/mapa_fondo.dart';
import '../models/nido_grefa_model.dart';
import '../utils/geografia.dart';
import 'informe_tecnico.dart';
import 'mapa_imagen.dart';

/// Modelo de la presentación PowerPoint: lista de diapositivas «descriptivas»
/// que `presentacion_pptx.dart` dibuja. Se arma con el mismo borrador que el
/// informe (secciones, textos, mapas), de modo que solo lleva lo marcado.
///
/// Sin datos personales: nunca se incluyen propietario, teléfono ni referencia
/// catastral. Los datos que faltan se dejan en blanco (nada de «—» ni «n/d»).

const filasTablaPresentacion = 11;
const filasRelacionPresentacion = 8;
const largoTextoPresentacion = 900;
const _largoCelda = 160;
const _largoCeldaFicha = 90;

/// Claves de columna con datos personales, excluidas de la presentación.
const camposPersonales = {'propietario', 'tlfn', 'referencia_catastral'};

const colorExitoPpt = '2E6B3A';
const colorFracasoPpt = 'C0392B';
const colorEnCursoPpt = 'E08A1E';
const colorNeutroPpt = '4A90C2';

sealed class Diapositiva {
  const Diapositiva(this.titulo);
  final String titulo;
}

class DiapositivaTexto extends Diapositiva {
  const DiapositivaTexto(super.titulo, this.texto);
  final String texto;
}

class Kpi {
  const Kpi(this.etiqueta, this.valor, [this.color]);
  final String etiqueta;
  final String valor;
  final String? color;
}

class DiapositivaKpis extends Diapositiva {
  const DiapositivaKpis(super.titulo, this.items);
  final List<Kpi> items;
}

class SerieGrafico {
  const SerieGrafico(this.nombre, this.valores, this.color);
  final String nombre;
  final List<num> valores;
  final String color;
}

enum VarianteGrafico { barraHorizontal, barraVertical }

class DiapositivaGrafico extends Diapositiva {
  const DiapositivaGrafico(
    super.titulo, {
    required this.variante,
    required this.etiquetas,
    required this.series,
    this.coloresBarra,
    this.maximo,
    this.leyenda = false,
    this.sufijo = '',
  });
  final VarianteGrafico variante;
  final List<String> etiquetas;
  final List<SerieGrafico> series;

  /// Un color por barra (serie única), p. ej. éxito / fracaso / en curso.
  final List<String>? coloresBarra;
  final num? maximo;
  final bool leyenda;

  /// Texto tras el valor («%»).
  final String sufijo;
}

class ColumnaTabla {
  const ColumnaTabla(this.titulo, this.peso, {this.numerica = false});
  final String titulo;
  final double peso;
  final bool numerica;
}

class DiapositivaTabla extends Diapositiva {
  const DiapositivaTabla(super.titulo, this.columnas, this.filas, {this.compacta = false});
  final List<ColumnaTabla> columnas;
  final List<List<String>> filas;
  final bool compacta;
}

class DiapositivaMapa extends Diapositiva {
  const DiapositivaMapa(super.titulo, this.mapa, this.pie);
  final MapaGenerado mapa;
  final String pie;
}

class BloqueFicha {
  const BloqueFicha(this.titulo, this.filas);
  final String titulo;
  final List<(String, String)> filas;
}

class DiapositivaFicha extends Diapositiva {
  const DiapositivaFicha(super.titulo, this.izquierda, this.derecha, {this.justificacion});
  final List<BloqueFicha> izquierda;
  final List<BloqueFicha> derecha;

  /// Solo en la segunda diapositiva de la ficha.
  final String? justificacion;
}

class Presentacion {
  const Presentacion({
    required this.titulo,
    required this.referencia,
    required this.destinatario,
    required this.elaboradoPor,
    required this.fecha,
    required this.ambito,
    required this.filtros,
    required this.total,
    required this.fondo,
    required this.nombre,
    required this.diapositivas,
  });

  final String titulo;
  final String referencia;
  final String destinatario;
  final String elaboradoPor;
  final String fecha;
  final String ambito;
  final String filtros;
  final int total;
  final MapaFondo fondo;
  final String nombre;
  final List<Diapositiva> diapositivas;
}

String nombrePptx(DateTime fecha) {
  String d(int v) => v.toString().padLeft(2, '0');
  return 'presentacion_aguiluchos_${fecha.year}-${d(fecha.month)}-${d(fecha.day)}.pptx';
}

/// Parte un texto en trozos de diapositiva: conserva los párrafos y, si uno
/// solo excede el límite, lo separa por frases.
List<String> trocearTexto(String texto, [int max = largoTextoPresentacion]) {
  final unidades = <String>[];
  for (final p in texto.split(RegExp(r'\n+')).map((x) => x.trim()).where((x) => x.isNotEmpty)) {
    if (p.length <= max) {
      unidades.add(p);
      continue;
    }
    final frases = RegExp(r'[^.!?]+[.!?]*\s*').allMatches(p).map((m) => m.group(0)!).toList();
    for (final fr in frases.isEmpty ? [p] : frases) {
      for (var k = 0; k < fr.length; k += max) {
        final t = fr.substring(k, k + max > fr.length ? fr.length : k + max).trim();
        if (t.isNotEmpty) unidades.add(t);
      }
    }
  }
  final trozos = <String>[];
  var actual = <String>[];
  var largo = 0;
  for (final u in unidades) {
    if (actual.isNotEmpty && largo + u.length + 1 > max) {
      trozos.add(actual.join('\n'));
      actual = [];
      largo = 0;
    }
    actual.add(u);
    largo += u.length + 1;
  }
  if (actual.isNotEmpty) trozos.add(actual.join('\n'));
  return trozos;
}

/// Texto del ámbito: proyecto, campaña y el nivel geográfico más concreto filtrado.
String ambitoPresentacion({
  String? proyecto,
  String? campana,
  String? pais,
  String? comunidad,
  String? provincia,
  String? localidad,
  required String sinValor,
}) {
  final partes = <String>[
    if (proyecto != null) proyecto == sinValor ? 'Sin proyecto' : 'Proyecto $proyecto',
    if (campana != null) campana == sinValor ? 'Sin campaña' : 'Campaña $campana',
  ];
  final geo = tituloMapaGeneral(
      pais: pais, comunidad: comunidad, provincia: provincia, localidad: localidad);
  if (geo != 'Todos los nidos') partes.add(geo);
  return partes.isEmpty ? 'Todos los nidos' : partes.join(' · ');
}

String _corta(String t, [int max = _largoCelda]) =>
    t.length > max ? '${t.substring(0, max - 1).trimEnd()}…' : t;

extension on String {
  String trimEnd() => replaceFirst(RegExp(r'\s+$'), '');
}

String _pct(double? v, [int dec = 0]) =>
    v == null ? '' : '${(v * 100).toStringAsFixed(dec).replaceAll('.', ',')} %';
String _num(double? v) => v == null ? '' : v.toStringAsFixed(2).replaceAll('.', ',');
String _n(int? v) => v == null ? '' : '$v';
String _t(String? v) => (v ?? '').trim();

String _fecha(DateTime? d) {
  if (d == null) return '';
  String x(int v) => v.toString().padLeft(2, '0');
  return '${x(d.day)}/${x(d.month)}/${d.year}';
}

List<NidoGrefaModel> ordenarNidosPresentacion(List<NidoGrefaModel> nidos) =>
    [...nidos]..sort((x, y) {
        final a = int.tryParse(x.numeracion ?? '');
        final c = int.tryParse(y.numeracion ?? '');
        if (a != null && c != null) return a.compareTo(c);
        return (x.numeracion ?? '').compareTo(y.numeracion ?? '');
      });

List<DiapositivaTabla> _paginar(
  String titulo,
  List<ColumnaTabla> columnas,
  List<List<String>> filas, {
  int por = filasTablaPresentacion,
  bool compacta = false,
}) {
  if (filas.isEmpty) return [DiapositivaTabla(titulo, columnas, const [], compacta: compacta)];
  final paginas = (filas.length / por).ceil();
  return [
    for (var i = 0; i < paginas; i++)
      DiapositivaTabla(
        paginas > 1 ? '$titulo (${i + 1}/$paginas)' : titulo,
        columnas,
        filas.sublist(i * por, ((i + 1) * por) > filas.length ? filas.length : (i + 1) * por),
        compacta: compacta,
      ),
  ];
}

List<DiapositivaTexto> _textos(String titulo, String texto) {
  final trozos = trocearTexto(texto);
  if (trozos.isEmpty) return [DiapositivaTexto(titulo, '')];
  return [
    for (var i = 0; i < trozos.length; i++)
      DiapositivaTexto(trozos.length > 1 ? '$titulo (${i + 1}/${trozos.length})' : titulo, trozos[i]),
  ];
}

List<ColumnaTabla> _columnasGrupo(String primera) => [
      ColumnaTabla(primera, 3.4),
      const ColumnaTabla('Nidos', 0.9, numerica: true),
      const ColumnaTabla('Éxito', 0.9, numerica: true),
      const ColumnaTabla('Fracaso', 0.9, numerica: true),
      const ColumnaTabla('En curso', 1, numerica: true),
      const ColumnaTabla('Tasa éxito', 1.2, numerica: true),
      const ColumnaTabla('Nacidos', 1, numerica: true),
      const ColumnaTabla('Volados', 1, numerica: true),
      const ColumnaTabla('Muertos', 1, numerica: true),
    ];

List<String> _filaGrupo(GrupoEstadisticas g) => [
      g.nombre,
      '${g.stats.total}',
      '${g.stats.exito}',
      '${g.stats.fracaso}',
      '${g.stats.enCurso}',
      _pct(g.stats.tasaExito),
      '${g.stats.nacidos}',
      '${g.stats.volados}',
      '${g.stats.muertos}',
    ];

DiapositivaGrafico? _graficoEstados(EstadisticasInforme r) {
  final datos = [
    ('Éxito', r.exito, colorExitoPpt),
    ('Fracaso', r.fracaso, colorFracasoPpt),
    ('En curso', r.enCurso, colorEnCursoPpt),
  ].where((d) => d.$2 > 0).toList();
  if (datos.isEmpty) return null;
  return DiapositivaGrafico(
    'Resultado de la nidificación',
    variante: VarianteGrafico.barraHorizontal,
    etiquetas: [for (final d in datos) '${d.$1} (${d.$2})'],
    series: [SerieGrafico('Nidos', [for (final d in datos) d.$2], colorExitoPpt)],
    coloresBarra: [for (final d in datos) d.$3],
  );
}

DiapositivaGrafico? _graficoTasas(List<NidoGrefaModel> nidos) {
  for (final (clave, nombre) in <(String? Function(NidoGrefaModel), String)>[
    ((n) => n.campana, 'campaña'),
    ((n) => n.provincia, 'provincia'),
  ]) {
    final filas = <({String k, int cerrados, int tasa})>[];
    for (final g in agruparNidos(nidos, clave)) {
      final cerrados = g.stats.cerrados;
      if (cerrados == 0) continue;
      filas.add((k: g.nombre, cerrados: cerrados, tasa: (100 * g.stats.exito / cerrados).round()));
    }
    if (filas.length >= 2) {
      filas.sort((a, b) {
        final c = a.tasa.compareTo(b.tasa);
        return c != 0 ? c : a.k.compareTo(b.k);
      });
      final top = filas.length > 10 ? filas.sublist(filas.length - 10) : filas;
      return DiapositivaGrafico(
        'Tasa de éxito por $nombre (% sobre nidos cerrados)',
        variante: VarianteGrafico.barraHorizontal,
        etiquetas: [for (final f in top) '${f.k} (n=${f.cerrados})'],
        series: [SerieGrafico('Tasa de éxito (%)', [for (final f in top) f.tasa], colorExitoPpt)],
        maximo: 100,
        sufijo: ' %',
      );
    }
  }
  return null;
}

DiapositivaGrafico? _graficoPollos(List<NidoGrefaModel> nidos) {
  final r = EstadisticasInforme(nidos);
  if (r.nacidos + r.volados + r.muertos == 0) return null;
  final grupos = <String, List<NidoGrefaModel>>{};
  for (final n in nidos) {
    final k = _t(n.campana);
    (grupos[k.isEmpty ? 'Total' : k] ??= []).add(n);
  }
  final nombres = grupos.keys.toList()..sort();
  List<num> valores(int Function(EstadisticasInforme) f) =>
      [for (final g in nombres) f(EstadisticasInforme(grupos[g]!))];
  return DiapositivaGrafico(
    'Pollos nacidos, volados y muertos',
    variante: VarianteGrafico.barraVertical,
    etiquetas: nombres,
    series: [
      SerieGrafico('Nacidos', valores((s) => s.nacidos), colorNeutroPpt),
      SerieGrafico('Volados', valores((s) => s.volados), colorExitoPpt),
      SerieGrafico('Muertos', valores((s) => s.muertos), colorFracasoPpt),
    ],
    leyenda: true,
  );
}

const _nombreNivel = {
  'general': 'General',
  'comunidad': 'Comunidad autónoma',
  'provincia': 'Provincia',
  'localidad': 'Localidad',
};

List<DiapositivaFicha> _fichas(List<NidoGrefaModel> orden, InformeBorrador b) {
  BloqueFicha bloque(NidoGrefaModel n, NidoFase fase) => BloqueFicha(fase.titulo, [
        for (final c in nidoColumnsPorFase[fase]!)
          if (!camposPersonales.contains(c.key)) (c.label, _corta(c.formatted(n), _largoCeldaFicha)),
      ]);
  final out = <DiapositivaFicha>[];
  for (final n in orden) {
    final titulo =
        'Ficha técnica · ${n.etiqueta ?? n.numeracion ?? 'Nido'} · ${n.estadoReproductivo.etiqueta}';
    final j = b.justificaciones[n.id] ?? justificacionPorDefecto(n);
    out
      ..add(DiapositivaFicha(
        '$titulo (1/2)',
        [bloque(n, NidoFase.ubicacion)],
        [bloque(n, NidoFase.incubacion), bloque(n, NidoFase.seguimiento)],
      ))
      ..add(DiapositivaFicha(
        '$titulo (2/2)',
        [bloque(n, NidoFase.cosecha)],
        const [],
        justificacion: j == '—' ? '' : j,
      ));
  }
  return out;
}

/// Construye la presentación a partir del mismo borrador que el informe
/// (nidos, título, referencia, destinatario, autor, cargo, secciones, mapas,
/// fondo y textos editables). Solo se incluye lo marcado.
Presentacion armarPresentacion(
  InformeBorrador b, {
  String ambito = 'Todos los nidos',
  int sinCoordenadas = 0,
}) {
  final nidos = b.nidos;
  final s = b.secciones;
  final r = EstadisticasInforme(nidos);
  final orden = ordenarNidosPresentacion(nidos);
  final out = <Diapositiva>[];
  var i = 0;
  String titulo(String t) => '${++i}. $t';

  void seccion(SeccionInforme sec, String t, List<Diapositiva> Function(String) fn) {
    if (s.contains(sec)) out.addAll(fn(titulo(t)));
  }

  seccion(SeccionInforme.alcance, 'Objeto y alcance', (t) => _textos(t, b.alcance));

  seccion(SeccionInforme.resumen, 'Resumen ejecutivo', (t) {
    Kpi k(String e, Object v, [String? c]) => Kpi(e, '$v', c);
    final slides = <Diapositiva>[
      DiapositivaKpis(t, [
        k('Nidos analizados', r.total),
        k('Nidos con éxito', r.exito, colorExitoPpt),
        k('Nidos fracasados', r.fracaso, colorFracasoPpt),
        k('Nidos en curso', r.enCurso, colorEnCursoPpt),
        k('Tasa de éxito', _pct(r.tasaExito)),
        k('Pollos nacidos', r.nacidos),
        k('Pollos volados', r.volados),
        k('Pollos muertos', r.muertos),
        k('Pollos sin determinar', r.sinDeterminar),
        k('Supervivencia a vuelo', r.nacidos > 0 ? _pct(r.supervivencia) : ''),
        k('Productividad', _num(r.productividad)),
        k('Nidos con intervención', r.intervenciones),
      ]),
    ];
    for (final g in [_graficoEstados(r), _graficoPollos(nidos), _graficoTasas(nidos)]) {
      if (g == null) continue;
      slides.add(DiapositivaGrafico(
        '$t · ${g.titulo}',
        variante: g.variante,
        etiquetas: g.etiquetas,
        series: g.series,
        coloresBarra: g.coloresBarra,
        maximo: g.maximo,
        leyenda: g.leyenda,
        sufijo: g.sufijo,
      ));
    }
    return slides;
  });

  if (b.mapas.isNotEmpty) {
    final t = titulo('Mapas de localización');
    const niveles = ['general', 'comunidad', 'provincia', 'localidad'];
    final mapas = [...b.mapas]
      ..sort((a, c) => niveles.indexOf(a.nivel).compareTo(niveles.indexOf(c.nivel)));
    for (final m in mapas) {
      out.add(DiapositivaMapa(
        '$t · ${_nombreNivel[m.nivel] ?? m.nivel}${m.nivel == 'general' ? '' : ': ${m.titulo}'}',
        m,
        '${m.titulo} · ${m.n} nido(s) · fondo: ${b.fondo.etiqueta} · verde = éxito, rojo = fracaso, naranja = en curso'
        '${sinCoordenadas > 0 ? ' · $sinCoordenadas nido(s) sin coordenadas válidas no aparecen' : ''}'
        ' · ${b.fondo.atribucion}',
      ));
    }
  }

  void grupo(SeccionInforme sec, String t, String primera, String? Function(NidoGrefaModel) clave) {
    seccion(sec, t, (tt) => _paginar(tt, _columnasGrupo(primera),
        [for (final g in agruparNidos(nidos, clave)) _filaGrupo(g)]));
  }

  grupo(SeccionInforme.especies, 'Resultados por especie', 'Especie', (n) => n.especie);
  grupo(SeccionInforme.comunidades, 'Resultados por comunidad autónoma', 'Comunidad autónoma',
      (n) => ubicacionDe(n).comunidad);
  grupo(SeccionInforme.provincias, 'Resultados por provincia', 'Provincia',
      (n) => ubicacionDe(n).provincia);
  grupo(SeccionInforme.municipios, 'Resultados por localidad', 'Localidad', (n) => n.municipio);

  seccion(SeccionInforme.causas, 'Causas de fracaso', (t) {
    final causas = r.causas;
    if (causas.isEmpty) {
      return _textos(t, 'No constan nidos fracasados en el conjunto analizado.');
    }
    final top = causas.take(8).toList();
    return [
      ..._paginar(
        t,
        const [
          ColumnaTabla('Causa de fracaso', 6),
          ColumnaTabla('Nidos', 1.5, numerica: true),
          ColumnaTabla('% sobre fracasos', 2, numerica: true),
        ],
        [for (final c in causas) [c.key, '${c.value}', _pct(c.value / r.fracaso)]],
      ),
      DiapositivaGrafico(
        '$t · Gráfico',
        variante: VarianteGrafico.barraHorizontal,
        etiquetas: [for (final c in top) c.key],
        series: [SerieGrafico('Nidos', [for (final c in top) c.value], colorFracasoPpt)],
      ),
    ];
  });

  seccion(SeccionInforme.intervenciones, 'Intervenciones de conservación', (t) {
    final con = orden.where((n) => n.intervencion).toList();
    if (con.isEmpty) {
      return _textos(t, 'No constan intervenciones de conservación en el conjunto analizado.');
    }
    return _paginar(
      t,
      const [
        ColumnaTabla('Nido', 1.3),
        ColumnaTabla('Localidad', 2.2),
        ColumnaTabla('Tipo de manejo', 2.4),
        ColumnaTabla('Resultado', 1.1),
        ColumnaTabla('Observaciones', 5.3),
      ],
      [
        for (final n in con)
          [
            _t(n.etiqueta ?? n.numeracion),
            _t(n.municipio),
            n.tipoAccionesManejo.join(', '),
            n.estadoReproductivo.etiqueta,
            _corta(_t(n.observacionesI)),
          ]
      ],
      por: filasRelacionPresentacion,
    );
  });

  seccion(SeccionInforme.relacion, 'Relación de nidos y justificaciones', (t) => _paginar(
        t,
        const [
          ColumnaTabla('Nº', 0.5),
          ColumnaTabla('Etiqueta', 0.9),
          ColumnaTabla('Localidad', 1.4),
          ColumnaTabla('Especie', 1.3),
          ColumnaTabla('Incub.', 0.9),
          ColumnaTabla('Nac.', 0.5, numerica: true),
          ColumnaTabla('Vol.', 0.5, numerica: true),
          ColumnaTabla('Muer.', 0.5, numerica: true),
          ColumnaTabla('Resultado', 0.9),
          ColumnaTabla('Justificación de conservación', 5),
        ],
        [
          for (final n in orden)
            () {
              final j = b.justificaciones[n.id] ?? justificacionPorDefecto(n);
              return [
                _t(n.numeracion),
                _t(n.etiqueta),
                _t(n.municipio),
                _t(n.especie),
                _fecha(n.fechaIncubacion),
                _n(n.numPollosNacidos),
                _n(n.numPollosVolados),
                _n(n.numPollosMuertos),
                n.estadoReproductivo.etiqueta,
                j == '—' ? '' : _corta(j),
              ];
            }()
        ],
        por: filasRelacionPresentacion,
        compacta: true,
      ));

  seccion(SeccionInforme.conclusiones, 'Observaciones y conclusiones',
      (t) => _textos(t, b.conclusiones));

  if (s.contains(SeccionInforme.fichas)) out.addAll(_fichas(orden, b));

  final hoy = b.fecha;
  return Presentacion(
    titulo: b.titulo,
    referencia: b.referencia,
    destinatario: _t(b.destinatario),
    elaboradoPor: [_t(b.autor), _t(b.cargo)].where((e) => e.isNotEmpty).join(' · '),
    fecha: fechaLargaInforme(hoy),
    ambito: ambito,
    filtros: b.filtros,
    total: nidos.length,
    fondo: b.fondo,
    nombre: nombrePptx(hoy),
    diapositivas: out,
  );
}
