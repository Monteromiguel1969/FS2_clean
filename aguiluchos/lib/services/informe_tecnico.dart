import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../models/mapa_fondo.dart';
import '../models/nido_constants.dart';
import '../models/nido_grefa_model.dart';
import '../utils/geografia.dart';
import 'mapa_imagen.dart';

/// Informe técnico completo (equivalente al de la web): datos calculados con
/// precisión + textos redactados que la persona que firma puede editar antes
/// de emitir el PDF / Word / HTML.

// ── Secciones ──────────────────────────────────────────────────────────────

enum SeccionInforme {
  alcance('Objeto y alcance', true),
  resumen('Resumen ejecutivo (indicadores)', true),
  especies('Resultados por especie', true),
  comunidades('Resultados por comunidad autónoma', true),
  provincias('Resultados por provincia', true),
  municipios('Resultados por localidad', true),
  causas('Causas de fracaso', true),
  intervenciones('Intervenciones de conservación', true),
  relacion('Relación de nidos y justificaciones', true),
  conclusiones('Observaciones y conclusiones', true),
  fichas('Anexo: fichas técnicas individuales (una por nido)', false);

  const SeccionInforme(this.etiqueta, this.porDefecto);
  final String etiqueta;
  final bool porDefecto;
}

// ── Estadísticas ───────────────────────────────────────────────────────────

class EstadisticasInforme {
  EstadisticasInforme(this.nidos)
      : total = nidos.length,
        exito = nidos
            .where((n) => n.estadoReproductivo == EstadoReproductivo.exito)
            .length,
        fracaso = nidos
            .where((n) => n.estadoReproductivo == EstadoReproductivo.fracaso)
            .length,
        nacidos = nidos.fold(0, (a, n) => a + (n.numPollosNacidos ?? 0)),
        volados = nidos.fold(0, (a, n) => a + (n.numPollosVolados ?? 0)),
        muertos = nidos.fold(0, (a, n) => a + (n.numPollosMuertos ?? 0)),
        intervenciones = nidos.where((n) => n.intervencion).length,
        intervencionesExito = nidos
            .where((n) =>
                n.intervencion &&
                n.estadoReproductivo == EstadoReproductivo.exito)
            .length,
        sinDeterminar = nidos.fold(0, (a, n) {
          final nac = n.numPollosNacidos;
          if (nac == null) return a;
          final d = nac - (n.numPollosVolados ?? 0) - (n.numPollosMuertos ?? 0);
          return a + (d > 0 ? d : 0);
        });

  final List<NidoGrefaModel> nidos;
  final int total;
  final int exito;
  final int fracaso;
  final int nacidos;
  final int volados;
  final int muertos;
  final int sinDeterminar;
  final int intervenciones;
  final int intervencionesExito;

  int get enCurso => total - exito - fracaso;
  int get cerrados => exito + fracaso;

  /// Éxito / (éxito + fracaso); `null` si no hay nidos cerrados.
  double? get tasaExito => cerrados == 0 ? null : exito / cerrados;

  /// Pollos volados por nido con resultado cerrado.
  double? get productividad => cerrados == 0 ? null : volados / cerrados;

  /// Pollos volados / pollos nacidos.
  double? get supervivencia => nacidos == 0 ? null : volados / nacidos;

  /// Causas de fracaso ordenadas de mayor a menor.
  List<MapEntry<String, int>> get causas {
    final m = <String, int>{};
    for (final n in nidos) {
      if (n.estadoReproductivo != EstadoReproductivo.fracaso) continue;
      final c = (n.causasFracaso ?? '').isEmpty
          ? 'Sin causa indicada'
          : n.causasFracaso!;
      m[c] = (m[c] ?? 0) + 1;
    }
    return m.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
  }
}

class GrupoEstadisticas {
  GrupoEstadisticas(this.nombre, List<NidoGrefaModel> nidos)
      : stats = EstadisticasInforme(nidos);
  final String nombre;
  final EstadisticasInforme stats;
}

List<GrupoEstadisticas> agruparNidos(
  List<NidoGrefaModel> nidos,
  String? Function(NidoGrefaModel) clave,
) {
  final m = <String, List<NidoGrefaModel>>{};
  for (final n in nidos) {
    final k = (clave(n) ?? '').isEmpty ? 'Sin indicar' : clave(n)!;
    (m[k] ??= []).add(n);
  }
  final out = [for (final e in m.entries) GrupoEstadisticas(e.key, e.value)];
  out.sort((a, b) {
    final c = b.stats.total.compareTo(a.stats.total);
    return c != 0 ? c : a.nombre.compareTo(b.nombre);
  });
  return out;
}

/// Incidencias de calidad del dato que conviene que conozca quien firma.
List<String> incidenciasInforme(List<NidoGrefaModel> nidos) {
  final out = <String>[];
  final sinCoord = nidos.where((n) => !n.tieneCoordenadas).length;
  if (sinCoord > 0) out.add('$sinCoord nido(s) sin coordenadas UTM válidas.');
  final inc = nidos.where((n) {
    final nac = n.numPollosNacidos;
    return nac != null &&
        (n.numPollosVolados ?? 0) + (n.numPollosMuertos ?? 0) > nac;
  }).toList();
  if (inc.isNotEmpty) {
    final et = inc.take(8).map((n) => n.etiqueta ?? n.numeracion ?? '').join(', ');
    out.add(
        '${inc.length} nido(s) con volados + muertos superiores a los nacidos ($et${inc.length > 8 ? '…' : ''}).');
  }
  final enCurso = nidos
      .where((n) => n.estadoReproductivo == EstadoReproductivo.enCurso)
      .length;
  if (enCurso > 0) {
    out.add(
        '$enCurso nido(s) sin resultado reproductivo cerrado (en curso o pendientes de registrar).');
  }
  final sinEspecie = nidos.where((n) => (n.especie ?? '').isEmpty).length;
  if (sinEspecie > 0) out.add('$sinEspecie nido(s) sin especie indicada.');
  return out;
}

/// Texto de justificación de conservación de un nido (idéntico al de la web).
String justificacionPorDefecto(NidoGrefaModel n) {
  final partes = <String>[];
  if (n.intervencion) {
    final tipos = n.tipoAccionesManejo.isEmpty
        ? 'sin especificar'
        : n.tipoAccionesManejo.join(', ');
    partes.add('Intervención de conservación ($tipos)');
  }
  if (n.estadoReproductivo == EstadoReproductivo.fracaso) {
    final causa = (n.causasFracaso ?? '').isEmpty ? 'causa no indicada' : n.causasFracaso!;
    final est = (n.estadoFracaso ?? '').isEmpty ? '' : ' (${n.estadoFracaso})';
    partes.add('Fracaso$est: $causa');
  }
  final obs = (n.observacionesI ?? '').trim();
  if (obs.isNotEmpty) {
    partes.add(obs.length > 140 ? '${obs.substring(0, 137)}...' : obs);
  }
  return partes.isEmpty ? '—' : partes.join('. ');
}

const _meses = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre',
];
String fechaLargaInforme(DateTime d) =>
    '${d.day} de ${_meses[d.month - 1]} de ${d.year}';
String _fechaCorta(DateTime d) => DateFormat('dd/MM/yyyy').format(d);

String _pct(double? v, [int dec = 0]) =>
    v == null ? 'n/d' : '${(v * 100).toStringAsFixed(dec).replaceAll('.', ',')} %';
String _num(double? v) =>
    v == null ? 'n/d' : v.toStringAsFixed(2).replaceAll('.', ',');

/// Año de campaña: la campaña más frecuente de los nidos (campo «Campaña»);
/// si ninguno la tiene, el año de la fecha de incubación más frecuente (o el actual).
String anioCampanaInforme(List<NidoGrefaModel> nidos, [DateTime? hoy]) {
  final porCampana = <String, int>{};
  for (final n in nidos) {
    final k = (n.campana ?? '').trim();
    if (k.isNotEmpty) porCampana[k] = (porCampana[k] ?? 0) + 1;
  }
  if (porCampana.isNotEmpty) {
    final e = porCampana.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    return e.first.key;
  }
  final c = <int, int>{};
  for (final n in nidos) {
    final y = n.fechaIncubacion?.year;
    if (y != null) c[y] = (c[y] ?? 0) + 1;
  }
  if (c.isEmpty) return '${(hoy ?? DateTime.now()).year}';
  final e = c.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
  return '${e.first.key}';
}

String referenciaInformePorDefecto([DateTime? d]) {
  final x = d ?? DateTime.now();
  String p(int v) => v.toString().padLeft(2, '0');
  return 'GREFA-AGU-${x.year}-${p(x.month)}${p(x.day)}-${p(x.hour)}${p(x.minute)}';
}

String nombreArchivoInforme(String referencia, String ext) {
  final base = referencia.replaceAll(RegExp(r'[^\w.\-]+'), '_');
  return '${base.isEmpty ? 'informe' : base}.$ext';
}

// ── Borrador editable ──────────────────────────────────────────────────────

class InformeBorrador {
  InformeBorrador({
    required this.nidos,
    required this.titulo,
    required this.referencia,
    required this.fecha,
    this.autor = '',
    this.cargo = '',
    this.destinatario = '',
    this.filtros = '',
    this.individual = false,
    Set<SeccionInforme>? secciones,
  })  : secciones = secciones ??
            {
              for (final s in SeccionInforme.values)
                if (s.porDefecto) s
            },
        anio = anioCampanaInforme(nidos, fecha) {
    alcance = textoAlcance();
    conclusiones = individual && nidos.length == 1
        ? textoConclusionesNido(nidos.first)
        : textoConclusiones();
    justificaciones = {for (final n in nidos) n.id: justificacionPorDefecto(n)};
  }

  final List<NidoGrefaModel> nidos;
  String titulo;
  String referencia;
  DateTime fecha;
  String autor;
  String cargo;
  String destinatario;
  String filtros;

  /// Informe de un único nido (ficha técnica + conclusiones).
  final bool individual;
  final String anio;
  Set<SeccionInforme> secciones;

  late String alcance;
  late String conclusiones;
  late Map<String, String> justificaciones;

  /// Mapas de localización ya generados (se incrustan tras el resumen).
  List<MapaGenerado> mapas = [];

  /// Fondo con el que se generaron los mapas (para la leyenda y la atribución).
  MapaFondo fondo = MapaFondo.osm;

  /// Borrador del apartado «Objeto y alcance».
  String textoAlcance() {
    final especies = {for (final n in nidos) if ((n.especie ?? '').isNotEmpty) n.especie!}.toList();
    final municipios = {for (final n in nidos) if ((n.municipio ?? '').isNotEmpty) n.municipio!}.toList();
    final ubic = [for (final n in nidos) ubicacionDe(n)];
    final comunidades = {for (final u in ubic) if (u.comunidad != sinDato) u.comunidad}.toList();
    final provincias = {for (final u in ubic) if (u.provincia != sinDato) u.provincia}.toList();
    final f = filtros.isNotEmpty
        ? ' Filtros aplicados: $filtros.'
        : ' Sin filtros adicionales (conjunto completo de la campaña).';
    return 'El presente informe recoge los resultados del seguimiento reproductor de aguiluchos de la campaña $anio, '
        'desarrollado por GREFA (Grupo para la Rehabilitación de la Fauna Autóctona y su Hábitat), a partir de los registros de campo de la base de datos de la campaña, '
        'con fecha de corte ${fechaLargaInforme(fecha)}. '
        'Se analizan ${nidos.length} nido(s)${especies.isNotEmpty ? ' de ${especies.join(', ')}' : ''}, '
        'localizados en ${municipios.length} localidad(es)'
        '${provincias.isNotEmpty ? ', ${provincias.length} provincia(s) (${provincias.join(', ')})' : ''}'
        '${comunidades.isNotEmpty ? ' y ${comunidades.length} comunidad(es) autónoma(s) (${comunidades.join(', ')})' : ''}.$f';
  }

  /// Borrador del apartado «Observaciones y conclusiones».
  String textoConclusiones() {
    if (nidos.isEmpty) return 'No hay nidos en el conjunto analizado.';
    final r = EstadisticasInforme(nidos);
    final partes = <String>[
      'De los ${r.total} nido(s) analizados, ${r.exito} finalizaron con éxito, ${r.fracaso} fracasaron y ${r.enCurso} no tienen resultado cerrado. '
          '${r.cerrados > 0 ? 'La tasa de éxito sobre nidos con resultado cerrado (${r.cerrados}) es del ${_pct(r.tasaExito)}.' : 'No hay nidos con resultado cerrado, por lo que la tasa de éxito no puede calcularse.'}',
    ];
    if (r.nacidos > 0) {
      partes.add(
          'Se registraron ${r.nacidos} pollo(s) nacidos, de los que ${r.volados} volaron (${_pct(r.volados / r.nacidos)}) y ${r.muertos} murieron (${_pct(r.muertos / r.nacidos)}); ${r.sinDeterminar} no constan ni como volados ni como muertos.');
    }
    if (r.cerrados > 0) {
      partes.add(
          'La productividad media es de ${_num(r.productividad)} pollos volados por nido con resultado cerrado.');
    }
    final causas = r.causas;
    if (causas.isNotEmpty) {
      final c = causas.first;
      partes.add(
          'La principal causa de fracaso registrada es «${c.key}» (${c.value} de ${r.fracaso} nidos fracasados, ${_pct(c.value / r.fracaso)}).');
    }
    if (r.intervenciones > 0) {
      partes.add(
          'Se realizaron actuaciones de conservación en ${r.intervenciones} nido(s) (${_pct(r.intervenciones / r.total)} del total), ${r.intervencionesExito} de los cuales alcanzaron el éxito reproductivo.');
    }
    final inc = incidenciasInforme(nidos);
    if (inc.isNotEmpty) partes.add('Calidad del dato: ${inc.join(' ')}');
    return partes.join(' ');
  }

  static String textoConclusionesNido(NidoGrefaModel n) {
    final e = n.estadoReproductivo == EstadoReproductivo.enCurso
        ? 'En curso'
        : n.estadoReproductivo.etiqueta;
    final loc = (n.municipio ?? '').isEmpty
        ? ''
        : ' (${n.municipio}${(n.provincia ?? '').isNotEmpty ? ', ${n.provincia}' : ''})';
    final partes = <String>[
      'El nido ${n.etiqueta ?? n.numeracion ?? ''}${(n.especie ?? '').isNotEmpty ? ' de ${n.especie}' : ''}$loc presenta resultado reproductivo «$e».',
    ];
    if (n.numPollosNacidos != null) {
      partes.add(
          'Nacieron ${n.numPollosNacidos} pollo(s): ${n.numPollosVolados ?? 0} volaron y ${n.numPollosMuertos ?? 0} murieron.');
    }
    if (n.estadoReproductivo == EstadoReproductivo.fracaso) {
      partes.add(
          'Causa del fracaso: ${(n.causasFracaso ?? '').isEmpty ? 'no indicada' : n.causasFracaso}${(n.estadoFracaso ?? '').isEmpty ? '' : ' (${n.estadoFracaso})'}.');
    }
    if (n.intervencion) {
      partes.add(
          'Se realizaron actuaciones de conservación: ${n.tipoAccionesManejo.isEmpty ? 'sin especificar' : n.tipoAccionesManejo.join(', ')}.');
    }
    return partes.join(' ');
  }
}

// ── Documento neutro (se renderiza a HTML o PDF) ───────────────────────────

sealed class Bloque {}

class BTitulo extends Bloque {
  BTitulo(this.texto, this.nivel);
  final String texto;
  final int nivel; // 1 título, 2 sección, 3 subsección
}

class BParrafo extends Bloque {
  BParrafo(this.texto);
  final String texto;
}

class BNota extends Bloque {
  BNota(this.texto);
  final String texto;
}

class BMeta extends Bloque {
  BMeta(this.filas);
  final List<(String, String)> filas;
}

class BTabla extends Bloque {
  BTabla(this.cabeceras, this.filas,
      {this.numericas = const {}, this.pesos = const []});
  final List<String> cabeceras;
  final List<List<String>> filas;
  final Set<int> numericas;
  final List<double> pesos;
}

class BFirma extends Bloque {
  BFirma(this.autor, this.cargo);
  final String autor;
  final String cargo;
}

/// Rejilla de mapas (imágenes) con su pie de foto.
class BMapas extends Bloque {
  BMapas(this.mapas, {this.columnas = 2});
  final List<MapaGenerado> mapas;
  final int columnas;
}

class BSalto extends Bloque {}

class InformeDocumento {
  InformeDocumento(this.titulo, this.anio, this.bloques);
  final String titulo;
  final String anio;
  final List<Bloque> bloques;
}

class InformeTecnico {
  const InformeTecnico._();

  static InformeDocumento construir(InformeBorrador b) {
    final bl = <Bloque>[
      BTitulo(b.titulo, 1),
      BNota(b.individual
          ? 'Nido ${b.nidos.isEmpty ? '' : (b.nidos.first.etiqueta ?? b.nidos.first.numeracion ?? '')}'
          : '${b.nidos.length} nido(s) analizados'),
      BMeta([
        ('Referencia', b.referencia),
        ('Fecha de emisión', fechaLargaInforme(b.fecha)),
        ('Elaborado por',
            [b.autor, b.cargo].where((e) => e.isNotEmpty).join(' · ').ifEmpty('—')),
        ('Destinatario', b.destinatario.ifEmpty('—')),
      ]),
    ];

    if (b.individual && b.nidos.length == 1) {
      if (b.mapas.isNotEmpty) {
        bl.add(BTitulo('Mapa de localización', 2));
        bl.add(BMapas(b.mapas, columnas: 1));
        bl.add(BNota(leyendaMapaDe(b.fondo)));
      }
      bl.addAll(_ficha(b.nidos.first, b, nivel: 2));
      bl.add(BTitulo('1. Observaciones y conclusiones', 2));
      bl.add(BParrafo(b.conclusiones));
      bl.add(BFirma(b.autor, b.cargo));
      return InformeDocumento(b.titulo, b.anio, bl);
    }

    var i = 0;
    String t(String s) => '${++i}. $s';
    final s = b.secciones;
    // Orden natural por numeración (numérica si procede).
    final orden = [...b.nidos]..sort((x, y) {
      final a = int.tryParse(x.numeracion ?? '');
      final c = int.tryParse(y.numeracion ?? '');
      if (a != null && c != null) return a.compareTo(c);
      return (x.numeracion ?? '').compareTo(y.numeracion ?? '');
    });

    if (s.contains(SeccionInforme.alcance)) {
      bl..add(BTitulo(t('Objeto y alcance'), 2))..add(BParrafo(b.alcance));
    }
    if (s.contains(SeccionInforme.resumen)) {
      bl..add(BTitulo(t('Resumen ejecutivo'), 2))..add(_resumen(b.nidos));
    }
    if (b.mapas.isNotEmpty) {
      bl.add(BTitulo(t('Mapas de localización'), 2));
      bl.addAll(_mapas(b));
    }
    if (s.contains(SeccionInforme.especies)) {
      bl..add(BTitulo(t('Resultados por especie'), 2))
        ..add(_grupos('Especie', agruparNidos(b.nidos, (n) => n.especie)));
    }
    if (s.contains(SeccionInforme.comunidades)) {
      bl..add(BTitulo(t('Resultados por comunidad autónoma'), 2))
        ..add(_grupos('Comunidad autónoma', agruparNidos(b.nidos, (n) => ubicacionDe(n).comunidad)));
    }
    if (s.contains(SeccionInforme.provincias)) {
      bl..add(BTitulo(t('Resultados por provincia'), 2))
        ..add(_grupos('Provincia', agruparNidos(b.nidos, (n) => ubicacionDe(n).provincia)));
    }
    if (s.contains(SeccionInforme.municipios)) {
      bl..add(BTitulo(t('Resultados por localidad'), 2))
        ..add(_grupos('Localidad', agruparNidos(b.nidos, (n) => n.municipio)));
    }
    if (s.contains(SeccionInforme.causas)) {
      bl.add(BTitulo(t('Causas de fracaso'), 2));
      final r = EstadisticasInforme(b.nidos);
      if (r.causas.isEmpty) {
        bl.add(BParrafo('No constan nidos fracasados en el conjunto analizado.'));
      } else {
        bl.add(BTabla(
          ['Causa de fracaso', 'Nidos', '% sobre fracasos'],
          [for (final c in r.causas) [c.key, '${c.value}', _pct(c.value / r.fracaso)]],
          numericas: {1, 2},
          pesos: [4, 1, 1.5],
        ));
      }
    }
    if (s.contains(SeccionInforme.intervenciones)) {
      bl.add(BTitulo(t('Intervenciones de conservación'), 2));
      bl.addAll(_intervenciones(b.nidos));
    }
    if (s.contains(SeccionInforme.relacion)) {
      bl.add(BTitulo(t('Relación de nidos y justificaciones'), 2));
      if (b.nidos.isEmpty) {
        bl.add(BParrafo('No hay nidos que cumplan los filtros seleccionados.'));
      } else {
        bl.add(BTabla(
          ['Nº', 'Etiqueta', 'Localidad', 'Especie', 'Incubación', 'Nac.', 'Vol.', 'Muer.', 'Resultado', 'Justificación de conservación'],
          [
            for (final n in orden)
              [
                n.numeracion ?? '',
                n.etiqueta ?? '',
                n.municipio ?? '',
                n.especie ?? '',
                n.fechaIncubacion == null ? '—' : _fechaCorta(n.fechaIncubacion!),
                '${n.numPollosNacidos ?? 0}',
                '${n.numPollosVolados ?? 0}',
                '${n.numPollosMuertos ?? 0}',
                n.estadoReproductivo.etiqueta,
                b.justificaciones[n.id] ?? justificacionPorDefecto(n),
              ]
          ],
          numericas: {5, 6, 7},
          pesos: [0.55, 0.9, 1.3, 1.2, 1.05, 0.5, 0.5, 0.55, 0.9, 3.2],
        ));
      }
    }
    if (s.contains(SeccionInforme.conclusiones)) {
      bl..add(BTitulo(t('Observaciones y conclusiones'), 2))..add(BParrafo(b.conclusiones));
    }
    if (s.contains(SeccionInforme.fichas)) {
      bl.add(BSalto());
      bl.add(BTitulo('Anexo. Fichas técnicas individuales', 2));
      for (var k = 0; k < orden.length; k++) {
        if (k > 0) bl.add(BSalto());
        bl.addAll(_ficha(orden[k], b, nivel: 3));
      }
    }
    bl.add(BFirma(b.autor, b.cargo));
    return InformeDocumento(b.titulo, b.anio, bl);
  }

  /// Sección «Mapas de localización»: general y, por nivel, un mapa por grupo.
  static List<Bloque> _mapas(InformeBorrador b) {
    final out = <Bloque>[BNota(leyendaMapaDe(b.fondo))];
    final general = b.mapas.where((m) => m.nivel == 'general').toList();
    if (general.isNotEmpty) out.add(BMapas(general, columnas: 1));
    const titulos = {
      'comunidad': 'Por comunidad autónoma',
      'provincia': 'Por provincia',
      'localidad': 'Por localidad',
    };
    titulos.forEach((nivel, titulo) {
      final l = b.mapas.where((m) => m.nivel == nivel).toList();
      if (l.isEmpty) return;
      out..add(BTitulo(titulo, 3))..add(BMapas(l));
    });
    final sin = b.nidos.where((n) => !n.tieneCoordenadas).length;
    if (sin > 0) {
      out.add(BNota('$sin nido(s) sin coordenadas válidas no aparecen en los mapas.'));
    }
    return out;
  }

  static BTabla _resumen(List<NidoGrefaModel> nidos) {
    final r = EstadisticasInforme(nidos);
    final filas = <List<String>>[
      ['Nidos analizados', '${r.total}', 'Nidos del conjunto seleccionado.'],
      ['Nidos con éxito', '${r.exito}', 'Resultado reproductivo «Éxito».'],
      ['Nidos fracasados', '${r.fracaso}', 'Resultado reproductivo «Fracaso».'],
      ['Nidos en curso', '${r.enCurso}', 'Sin resultado reproductivo registrado.'],
      ['Tasa de éxito', _pct(r.tasaExito), 'Éxito / (éxito + fracaso); solo nidos con resultado cerrado.'],
      ['Pollos nacidos', '${r.nacidos}', 'Suma de pollos nacidos por nido.'],
      ['Pollos volados', '${r.volados}', 'Suma de pollos volados (incluye pre y post cosecha).'],
      ['Pollos muertos', '${r.muertos}', 'Suma de pollos muertos (pre-cosecha, cosecha y post-cosecha).'],
      ['Pollos sin determinar', '${r.sinDeterminar}', 'Nacidos - volados - muertos, nido a nido (mínimo 0).'],
      ['Supervivencia a vuelo', r.nacidos > 0 ? _pct(r.supervivencia) : 'n/d', 'Pollos volados / pollos nacidos.'],
      ['Productividad', _num(r.productividad), 'Pollos volados por nido con resultado cerrado.'],
      ['Nidos con intervención', '${r.intervenciones}', 'Nidos con actuaciones de conservación (dron, rodal, compensación).'],
    ];
    return BTabla(['Indicador', 'Valor', 'Definición'], filas,
        numericas: {1}, pesos: [2.2, 1, 5]);
  }

  static BTabla _grupos(String primera, List<GrupoEstadisticas> g) => BTabla(
        [primera, 'Nidos', 'Éxito', 'Fracaso', 'En curso', 'Tasa éxito', 'Nacidos', 'Volados', 'Muertos'],
        [
          for (final e in g)
            [
              e.nombre,
              '${e.stats.total}',
              '${e.stats.exito}',
              '${e.stats.fracaso}',
              '${e.stats.enCurso}',
              _pct(e.stats.tasaExito),
              '${e.stats.nacidos}',
              '${e.stats.volados}',
              '${e.stats.muertos}',
            ]
        ],
        numericas: {1, 2, 3, 4, 5, 6, 7, 8},
        pesos: [2.6, 0.8, 0.8, 0.9, 0.9, 1.1, 0.9, 0.9, 0.9],
      );

  static List<Bloque> _intervenciones(List<NidoGrefaModel> nidos) {
    final lista = nidos.where((n) => n.intervencion).toList();
    if (lista.isEmpty) {
      return [BParrafo('No constan intervenciones de conservación en el conjunto analizado.')];
    }
    final tipos = <String, int>{};
    for (final n in lista) {
      for (final t in n.tipoAccionesManejo) {
        tipos[t] = (tipos[t] ?? 0) + 1;
      }
    }
    final resumenTipos = tipos.entries.map((e) => '${e.key}: ${e.value}').join(' · ');
    return [
      BParrafo('${lista.length} nido(s) con intervención${resumenTipos.isEmpty ? '' : ' - $resumenTipos'}.'),
      BTabla(
        ['Nido', 'Localidad', 'Tipo de manejo', 'Resultado', 'Observaciones'],
        [
          for (final n in lista)
            [
              n.etiqueta ?? n.numeracion ?? '',
              n.municipio ?? '',
              n.tipoAccionesManejo.isEmpty ? 'sin especificar' : n.tipoAccionesManejo.join(', '),
              n.estadoReproductivo.etiqueta,
              () {
                final o = (n.observacionesI ?? '').trim();
                if (o.isEmpty) return '—';
                return o.length > 220 ? o.substring(0, 220) : o;
              }(),
            ]
        ],
        pesos: [1, 1.4, 1.5, 1, 4],
      ),
    ];
  }

  /// Ficha técnica de un nido: las 43 columnas agrupadas por fase.
  static List<Bloque> _ficha(NidoGrefaModel n, InformeBorrador b, {required int nivel}) {
    final bl = <Bloque>[
      BTitulo('Ficha técnica · ${n.etiqueta ?? n.numeracion ?? 'Nido'} - ${n.estadoReproductivo.etiqueta}', nivel),
    ];
    for (final fase in NidoFase.values) {
      bl.add(BTitulo(fase.titulo, 3));
      bl.add(BTabla(
        ['Campo', 'Valor'],
        [
          for (final c in nidoColumnsPorFase[fase]!)
            [c.label, c.formatted(n).isEmpty ? '—' : c.formatted(n)]
        ],
        pesos: [2, 4],
      ));
      if (fase == NidoFase.ubicacion && n.latLon != null) {
        final p = n.latLon!;
        bl.add(BNota('Posición WGS84: ${p.lat.toStringAsFixed(6)}, ${p.lon.toStringAsFixed(6)}'
            '${n.googleMapsUri != null ? ' · ${n.googleMapsUri}' : ''}'));
      }
      if (fase == NidoFase.incubacion && n.fechaEstimadaEclosion != null) {
        bl.add(BNota('Fecha estimada de eclosión (incubación + $diasIncubacion días): ${_fechaCorta(n.fechaEstimadaEclosion!)}.'));
      }
      if (fase == NidoFase.cosecha && n.numPollosNacidos != null) {
        final nac = n.numPollosNacidos!;
        final v = n.numPollosVolados ?? 0;
        final m = n.numPollosMuertos ?? 0;
        bl.add(BNota('Balance: $nac nacidos = $v volados + $m muertos + ${(nac - v - m) > 0 ? nac - v - m : 0} sin determinar.'));
      }
    }
    bl.add(BTitulo('Justificación de conservación', 3));
    bl.add(BParrafo(b.justificaciones[n.id] ?? justificacionPorDefecto(n)));
    return bl;
  }
}

extension on String {
  String ifEmpty(String otro) => isEmpty ? otro : this;
}

// ── Renderizado ────────────────────────────────────────────────────────────

String _h(String s) => s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const _css = '''
@page { size: A4; margin: 16mm 14mm 18mm; }
* { box-sizing: border-box; }
body { font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.4; color: #1d2b22; margin: 0; }
.membrete { border-bottom: 3px solid #2e5e3a; padding-bottom: 6px; margin-bottom: 14px; }
.marca { font-size: 26pt; font-weight: 700; color: #2e5e3a; line-height: 1; }
.sub { font-size: 7.5pt; color: #333; }
.campana { font-size: 11pt; font-weight: 700; }
h1 { font-size: 17pt; color: #1d3f26; margin: 6px 0 2px; }
h2 { font-size: 13pt; color: #2e5e3a; border-bottom: 1px solid #c9d6cc; padding-bottom: 2px; margin: 18px 0 8px; }
h3 { font-size: 11pt; color: #2e5e3a; margin: 12px 0 4px; }
p { margin: 4px 0 8px; text-align: justify; }
.nota { font-size: 9pt; color: #444; text-align: left; }
table { border-collapse: collapse; width: 100%; margin: 4px 0 10px; }
table.meta { width: auto; }
table.meta th { text-align: left; padding: 2px 14px 2px 0; color: #555; }
table.t th { background: #2e5e3a; color: #fff; font-size: 8.5pt; padding: 4px 6px; text-align: left; }
table.t td { border-bottom: 1px solid #d5ddd7; padding: 3px 6px; font-size: 9pt; vertical-align: top; }
th.n, td.n { text-align: right; }
.firma { margin-top: 36px; width: 55%; }
.firma .linea { margin-top: 38px; border-top: 1px solid #333; padding-top: 2px; font-size: 8.5pt; color: #555; }
.salto { page-break-before: always; }
table.mapas { width: 100%; table-layout: fixed; }
table.mapas td { vertical-align: top; padding: 3px; border: 0; }
table.mapas img { width: 100%; height: auto; border: 1px solid #c9d6cc; }
.pie { font-size: 8.5pt; color: #444; text-align: center; margin-bottom: 6px; }
''';

class InformeRender {
  const InformeRender._();

  /// HTML autocontenido (se abre en cualquier navegador y se imprime a PDF).
  static String html(InformeDocumento d) {
    final sb = StringBuffer()
      ..write('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${_h(d.titulo)}</title><style>$_css</style></head><body>')
      ..write('<div class="membrete"><div class="marca">GREFA</div><div class="sub">Grupo para la Rehabilitación de la Fauna Autóctona y su Hábitat</div><div class="campana">Campaña Aguilucho cenizo y pálido ${_h(d.anio)}</div></div>');
    for (final b in d.bloques) {
      switch (b) {
        case BTitulo():
          sb.write('<h${b.nivel}>${_h(b.texto)}</h${b.nivel}>');
        case BParrafo():
          sb.write('<p>${_h(b.texto).replaceAll('\n', '<br>')}</p>');
        case BNota():
          sb.write('<p class="nota">${_h(b.texto)}</p>');
        case BMeta():
          sb.write('<table class="meta">');
          for (final (k, v) in b.filas) {
            sb.write('<tr><th>${_h(k)}</th><td>${_h(v)}</td></tr>');
          }
          sb.write('</table>');
        case BTabla():
          sb.write('<table class="t"><thead><tr>');
          for (var i = 0; i < b.cabeceras.length; i++) {
            sb.write('<th class="${b.numericas.contains(i) ? 'n' : ''}">${_h(b.cabeceras[i])}</th>');
          }
          sb.write('</tr></thead><tbody>');
          for (final f in b.filas) {
            sb.write('<tr>');
            for (var i = 0; i < f.length; i++) {
              sb.write('<td class="${b.numericas.contains(i) ? 'n' : ''}">${_h(f[i])}</td>');
            }
            sb.write('</tr>');
          }
          sb.write('</tbody></table>');
        case BFirma():
          sb.write('<div class="firma"><div>${_h(b.autor)}</div><div>${_h(b.cargo)}</div><div class="linea">Firma y sello</div></div>');
        case BMapas():
          sb.write('<table class="mapas">');
          for (var i = 0; i < b.mapas.length; i += b.columnas) {
            sb.write('<tr>');
            for (var k = 0; k < b.columnas; k++) {
              final j = i + k;
              if (j >= b.mapas.length) {
                sb.write('<td></td>');
                continue;
              }
              final m = b.mapas[j];
              sb.write('<td><img alt="${_h(m.titulo)}" src="data:image/jpeg;base64,${base64Encode(m.bytes)}">'
                  '<div class="pie">${_h(m.titulo)} · ${m.n} nido(s)</div></td>');
            }
            sb.write('</tr>');
          }
          sb.write('</table>');
        case BSalto():
          sb.write('<div class="salto"></div>');
      }
    }
    sb.write('</body></html>');
    return sb.toString();
  }

  /// Documento que Word / LibreOffice abren y permiten editar.
  static String word(InformeDocumento d) => html(d).replaceFirst(
        '<html lang="es">',
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="es">',
      );

  static Future<pw.ThemeData?> _temaPdf() async {
    try {
      final base = pw.Font.ttf(await rootBundle.load('assets/fonts/Roboto-Regular.ttf'));
      final bold = pw.Font.ttf(await rootBundle.load('assets/fonts/Roboto-Bold.ttf'));
      return pw.ThemeData.withFont(base: base, bold: bold, italic: base, boldItalic: bold);
    } catch (_) {
      return null; // sin fuente incluida: se usa la estándar del paquete pdf
    }
  }

  static Future<Uint8List> pdf(InformeDocumento d, {DateTime? generadoEn}) async {
    final verde = PdfColor.fromHex('#2E5E3A');
    // Roboto (incluida en la app) cubre tildes, «», —, … y otros símbolos Unicode.
    final tema = await _temaPdf();
    final doc = pw.Document(title: d.titulo, author: 'GREFA', theme: tema);

    pw.Widget membrete() => pw.Container(
          padding: const pw.EdgeInsets.only(bottom: 6),
          margin: const pw.EdgeInsets.only(bottom: 8),
          decoration: pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: verde, width: 2)),
          ),
          child: pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            crossAxisAlignment: pw.CrossAxisAlignment.end,
            children: [
              pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
                pw.Text('GREFA',
                    style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold, color: verde)),
                pw.Text('Grupo para la Rehabilitación de la Fauna Autóctona y su Hábitat',
                    style: const pw.TextStyle(fontSize: 7)),
              ]),
              pw.Text('Campaña Aguilucho cenizo y pálido ${d.anio}',
                  style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold)),
            ],
          ),
        );

    final w = <pw.Widget>[];
    for (final b in d.bloques) {
      switch (b) {
        case BTitulo():
          w.add(switch (b.nivel) {
            1 => pw.Padding(
                padding: const pw.EdgeInsets.only(top: 4, bottom: 2),
                child: pw.Text(b.texto,
                    style: pw.TextStyle(fontSize: 17, fontWeight: pw.FontWeight.bold, color: PdfColor.fromHex('#1D3F26')))),
            2 => pw.Padding(
                padding: const pw.EdgeInsets.only(top: 14, bottom: 6),
                child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
                  pw.Text(b.texto,
                      style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold, color: verde)),
                  pw.Divider(thickness: 0.6, height: 4, color: PdfColors.grey400),
                ])),
            _ => pw.Padding(
                padding: const pw.EdgeInsets.only(top: 8, bottom: 3),
                child: pw.Text(b.texto,
                    style: pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: verde))),
          });
        case BParrafo():
          w.add(pw.Padding(
            padding: const pw.EdgeInsets.only(bottom: 6),
            child: pw.Text(b.texto,
                textAlign: pw.TextAlign.justify,
                style: const pw.TextStyle(fontSize: 10, lineSpacing: 2)),
          ));
        case BNota():
          w.add(pw.Padding(
            padding: const pw.EdgeInsets.only(bottom: 6),
            child: pw.Text(b.texto,
                style: pw.TextStyle(fontSize: 8.5, color: PdfColors.grey700)),
          ));
        case BMeta():
          w.add(pw.Padding(
            padding: const pw.EdgeInsets.only(bottom: 6),
            child: pw.Column(children: [
              for (final (k, v) in b.filas)
                pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
                  pw.SizedBox(
                      width: 100,
                      child: pw.Text(k,
                          style: pw.TextStyle(fontSize: 9.5, color: PdfColors.grey700, fontWeight: pw.FontWeight.bold))),
                  pw.Expanded(child: pw.Text(v, style: const pw.TextStyle(fontSize: 9.5))),
                ]),
            ]),
          ));
        case BTabla():
          final pesos = b.pesos.length == b.cabeceras.length
              ? b.pesos
              : List<double>.filled(b.cabeceras.length, 1);
          w.add(pw.Padding(
            padding: const pw.EdgeInsets.only(bottom: 8),
            child: pw.TableHelper.fromTextArray(
              headers: b.cabeceras,
              data: b.filas,
              headerStyle: pw.TextStyle(fontSize: 7.5, fontWeight: pw.FontWeight.bold, color: PdfColors.white),
              headerDecoration: pw.BoxDecoration(color: verde),
              cellStyle: const pw.TextStyle(fontSize: 7.5),
              cellPadding: const pw.EdgeInsets.symmetric(horizontal: 3, vertical: 2.5),
              cellAlignments: {
                for (final i in b.numericas) i: pw.Alignment.centerRight,
              },
              headerAlignments: {
                for (var i = 0; i < b.cabeceras.length; i++)
                  i: b.numericas.contains(i)
                      ? pw.Alignment.centerRight
                      : pw.Alignment.centerLeft,
              },
              columnWidths: {
                for (var i = 0; i < pesos.length; i++) i: pw.FlexColumnWidth(pesos[i]),
              },
              oddRowDecoration: const pw.BoxDecoration(color: PdfColors.grey100),
            ),
          ));
        case BFirma():
          w.add(pw.Container(
            width: 230,
            margin: const pw.EdgeInsets.only(top: 30),
            child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
              pw.Text(b.autor, style: const pw.TextStyle(fontSize: 10)),
              pw.Text(b.cargo, style: pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
              pw.SizedBox(height: 34),
              pw.Container(
                decoration: const pw.BoxDecoration(
                    border: pw.Border(top: pw.BorderSide(width: 0.8))),
                padding: const pw.EdgeInsets.only(top: 2),
                child: pw.Text('Firma y sello',
                    style: pw.TextStyle(fontSize: 8, color: PdfColors.grey700)),
              ),
            ]),
          ));
        case BMapas():
          final ancho = (PdfPageFormat.a4.width - 72 - 8 * (b.columnas - 1)) / b.columnas;
          pw.Widget celda(MapaGenerado m) => pw.SizedBox(
                width: ancho,
                child: pw.Column(children: [
                  pw.Image(pw.MemoryImage(m.bytes), width: ancho),
                  pw.Padding(
                    padding: const pw.EdgeInsets.only(top: 2, bottom: 6),
                    child: pw.Text('${m.titulo} · ${m.n} nido(s)',
                        textAlign: pw.TextAlign.center,
                        style: pw.TextStyle(fontSize: 8, color: PdfColors.grey700)),
                  ),
                ]),
              );
          for (var i = 0; i < b.mapas.length; i += b.columnas) {
            w.add(pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                for (var k = 0; k < b.columnas; k++) ...[
                  if (k > 0) pw.SizedBox(width: 8),
                  if (i + k < b.mapas.length) celda(b.mapas[i + k]) else pw.SizedBox(width: ancho),
                ],
              ],
            ));
          }
        case BSalto():
          w.add(pw.NewPage());
      }
    }

    doc.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(36, 30, 36, 34),
      header: (_) => membrete(),
      footer: (ctx) => pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(d.titulo, style: const pw.TextStyle(fontSize: 7)),
          pw.Text('Página ${ctx.pageNumber} de ${ctx.pagesCount}',
              style: const pw.TextStyle(fontSize: 8)),
        ],
      ),
      build: (_) => w,
    ));
    return doc.save();
  }
}
