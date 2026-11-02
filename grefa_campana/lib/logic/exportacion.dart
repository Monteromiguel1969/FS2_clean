import '../models/nido_campo.dart';
import '../models/nido_grefa_model.dart';
import 'texto.dart';

/// Filtros de la pantalla de exportación.
class FiltroExportacion {
  const FiltroExportacion({
    this.desde,
    this.hasta,
    this.municipios = const {},
    this.estado,
  });

  /// Rango de campaña (inclusivo). `null` = sin límite.
  final DateTime? desde;
  final DateTime? hasta;

  /// Municipios seleccionados; vacío = todos.
  final Set<String> municipios;

  /// `null` = todos; si no, solo ese estado reproductivo.
  final EstadoReproductivo? estado;
}

/// Fecha que sitúa un nido dentro de la campaña: la primera disponible entre
/// entrada al nido, incubación, eclosión, vuelo y cosecha; si no hay ninguna,
/// la fecha de la última modificación.
DateTime fechaDeCampana(NidoGrefaModel n) {
  final f =
      n.fechaEntradaNido ??
      n.fechaIncubacion ??
      n.fechaEclosion ??
      n.fechaVuelo ??
      n.fechaCosecha;
  if (f != null) return DateTime(f.year, f.month, f.day);
  final l = n.updatedAt.toLocal();
  return DateTime(l.year, l.month, l.day);
}

List<NidoGrefaModel> filtrarParaExportar(
  Iterable<NidoGrefaModel> nidos,
  FiltroExportacion filtro,
) {
  final munis = filtro.municipios.map(normalizarTexto).toSet();
  final desde = filtro.desde == null
      ? null
      : DateTime(filtro.desde!.year, filtro.desde!.month, filtro.desde!.day);
  final hasta = filtro.hasta == null
      ? null
      : DateTime(filtro.hasta!.year, filtro.hasta!.month, filtro.hasta!.day);
  return nidos.where((n) {
    if (munis.isNotEmpty && !munis.contains(normalizarTexto(n.municipio))) {
      return false;
    }
    if (filtro.estado != null && n.estadoReproductivo != filtro.estado) {
      return false;
    }
    final f = fechaDeCampana(n);
    if (desde != null && f.isBefore(desde)) return false;
    if (hasta != null && f.isAfter(hasta)) return false;
    return true;
  }).toList();
}

/// Totales del resumen ejecutivo del informe.
class ResumenEjecutivo {
  const ResumenEjecutivo({
    required this.totalNidos,
    required this.nidosExito,
    required this.nidosFracaso,
    required this.nidosEnCurso,
    required this.pollosNacidos,
    required this.pollosVolados,
    required this.pollosMuertos,
  });

  final int totalNidos;
  final int nidosExito;
  final int nidosFracaso;
  final int nidosEnCurso;
  final int pollosNacidos;
  final int pollosVolados;
  final int pollosMuertos;

  /// % de éxito sobre los nidos con resultado conocido.
  double? get tasaExito {
    final cerrados = nidosExito + nidosFracaso;
    return cerrados == 0 ? null : nidosExito / cerrados * 100;
  }

  /// Pollos volados por nido (productividad).
  double? get productividad =>
      totalNidos == 0 ? null : pollosVolados / totalNidos;

  factory ResumenEjecutivo.de(Iterable<NidoGrefaModel> nidos) {
    var exito = 0, fracaso = 0, curso = 0, nac = 0, vol = 0, mue = 0, total = 0;
    for (final n in nidos) {
      total++;
      switch (n.estadoReproductivo) {
        case EstadoReproductivo.exito:
          exito++;
        case EstadoReproductivo.fracaso:
          fracaso++;
        case EstadoReproductivo.enCurso:
          curso++;
      }
      nac += n.numPollosNacidos ?? 0;
      vol += _volados(n);
      mue += _muertos(n);
    }
    return ResumenEjecutivo(
      totalNidos: total,
      nidosExito: exito,
      nidosFracaso: fracaso,
      nidosEnCurso: curso,
      pollosNacidos: nac,
      pollosVolados: vol,
      pollosMuertos: mue,
    );
  }

  static int _volados(NidoGrefaModel n) =>
      n.numPollosVolados ??
      ((n.pollosVoladosPrecosecha ?? 0) + (n.pollosVoladosPostcosecha ?? 0));

  static int _muertos(NidoGrefaModel n) =>
      n.numPollosMuertos ??
      ((n.pollosMuertosPrecosecha ?? 0) +
          (n.pollosMuertosCosecha ?? 0) +
          (n.pollosMuertosPostcosecha ?? 0));
}

/// Texto de justificación de conservación de un nido para el informe: resume
/// el manejo aplicado y el balance reproductivo con los datos de la ficha.
String generarJustificacion(NidoGrefaModel n) {
  final partes = <String>[];

  final acciones = n.tipoAccionesManejo;
  if (n.intervencion || acciones.isNotEmpty) {
    partes.add(
      acciones.isEmpty
          ? 'Nido intervenido para evitar su pérdida por las labores agrícolas.'
          : 'Nido protegido mediante ${_lista(acciones.map((a) => a.toLowerCase()).toList())} '
                'para evitar su pérdida por las labores agrícolas.',
    );
  } else {
    partes.add('Seguimiento sin intervención directa.');
  }

  final vol = ResumenEjecutivo._volados(n);
  final mue = ResumenEjecutivo._muertos(n);
  switch (n.estadoReproductivo) {
    case EstadoReproductivo.exito:
      partes.add(
        'Éxito reproductor: $vol ${vol == 1 ? 'pollo volado' : 'pollos volados'}'
        '${mue > 0 ? ' y $mue ${mue == 1 ? 'baja' : 'bajas'}' : ''}.',
      );
    case EstadoReproductivo.fracaso:
      final causa = (n.causasFracaso ?? '').trim();
      final fase = (n.estadoFracaso ?? '').trim();
      partes.add(
        'Fracaso reproductor'
        '${fase.isNotEmpty ? ' en fase de ${fase.toLowerCase()}' : ''}'
        '${causa.isNotEmpty ? ' por: ${causa.toLowerCase()}' : ' (causa no determinada)'}.',
      );
    case EstadoReproductivo.enCurso:
      partes.add('Reproducción en curso.');
  }

  final obs = (n.observacionesI ?? '').trim();
  if (obs.isNotEmpty) {
    partes.add(obs.length > 160 ? '${obs.substring(0, 157)}...' : obs);
  }
  return partes.join(' ');
}

String _lista(List<String> items) {
  if (items.length <= 1) return items.join();
  return '${items.sublist(0, items.length - 1).join(', ')} y ${items.last}';
}

/// Campos agrupados por fase, en orden, para el selector de columnas.
Map<FaseNido, List<NidoCampo>> camposPorFase() {
  final m = <FaseNido, List<NidoCampo>>{
    for (final f in FaseNido.values) f: <NidoCampo>[],
  };
  for (final c in camposNido) {
    m[c.fase]!.add(c);
  }
  return m;
}
