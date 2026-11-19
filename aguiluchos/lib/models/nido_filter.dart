import 'nido_constants.dart';

/// Filtros de consulta usados por la lista/mapa y por la exportación.
class NidoFilter {
  const NidoFilter({
    this.municipios = const {},
    this.pais,
    this.comunidad,
    this.provincia,
    this.localidad,
    this.proyecto,
    this.campana,
    this.estado = EstadoReproductivo.todos,
    this.query = '',
    this.fechaDesde,
    this.fechaHasta,
  });

  /// Vacío = todos los municipios (selección múltiple, usada al exportar).
  final Set<String> municipios;

  /// Filtros geográficos en cascada (derivados de provincia y municipio, ver
  /// `utils/geografia.dart`). `null` = todos.
  final String? pais;
  final String? comunidad;
  final String? provincia;
  final String? localidad;

  /// Proyecto y campaña son campos distintos. `null` = todos;
  /// [sinValor] = nidos sin proyecto / sin campaña.
  final String? proyecto;
  final String? campana;

  /// Valor especial de [proyecto] y [campana]: los nidos que no tienen ninguno.
  static const sinValor = '\u0000sin-valor';

  final EstadoReproductivo estado;

  /// Texto libre: busca en etiqueta y propietario.
  final String query;

  /// Rango de campaña, aplicado a la fecha de referencia del nido
  /// (entrada al nido, o incubación/eclosión/vuelo si falta).
  final DateTime? fechaDesde;
  final DateTime? fechaHasta;

  bool get tieneFiltroGeografico =>
      pais != null || comunidad != null || provincia != null || localidad != null;

  bool get isEmpty =>
      municipios.isEmpty &&
      !tieneFiltroGeografico &&
      proyecto == null &&
      campana == null &&
      estado == EstadoReproductivo.todos &&
      query.trim().isEmpty &&
      fechaDesde == null &&
      fechaHasta == null;

  /// Conserva los filtros geográficos; para cambiarlos (o ponerlos a `null`)
  /// usa [conGeo].
  NidoFilter copyWith({
    Set<String>? municipios,
    EstadoReproductivo? estado,
    String? query,
    DateTime? fechaDesde,
    DateTime? fechaHasta,
    bool limpiarFechas = false,
  }) =>
      NidoFilter(
        municipios: municipios ?? this.municipios,
        pais: pais,
        comunidad: comunidad,
        provincia: provincia,
        localidad: localidad,
        proyecto: proyecto,
        campana: campana,
        estado: estado ?? this.estado,
        query: query ?? this.query,
        fechaDesde: limpiarFechas ? null : (fechaDesde ?? this.fechaDesde),
        fechaHasta: limpiarFechas ? null : (fechaHasta ?? this.fechaHasta),
      );

  /// Sustituye los cuatro niveles geográficos de una vez (permite nulos).
  NidoFilter conGeo({String? pais, String? comunidad, String? provincia, String? localidad}) =>
      NidoFilter(
        municipios: municipios,
        pais: pais,
        comunidad: comunidad,
        provincia: provincia,
        localidad: localidad,
        proyecto: proyecto,
        campana: campana,
        estado: estado,
        query: query,
        fechaDesde: fechaDesde,
        fechaHasta: fechaHasta,
      );

  /// Sustituye proyecto y campaña de una vez (permite nulos).
  NidoFilter conProyectoCampana({String? proyecto, String? campana}) => NidoFilter(
        municipios: municipios,
        pais: pais,
        comunidad: comunidad,
        provincia: provincia,
        localidad: localidad,
        proyecto: proyecto,
        campana: campana,
        estado: estado,
        query: query,
        fechaDesde: fechaDesde,
        fechaHasta: fechaHasta,
      );
}
