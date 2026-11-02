import 'nido_constants.dart';

/// Filtros de consulta usados por la lista/mapa y por la exportación.
class NidoFilter {
  const NidoFilter({
    this.municipios = const {},
    this.estado = EstadoReproductivo.todos,
    this.query = '',
    this.fechaDesde,
    this.fechaHasta,
  });

  /// Vacío = todos los municipios.
  final Set<String> municipios;
  final EstadoReproductivo estado;

  /// Texto libre: busca en etiqueta y propietario.
  final String query;

  /// Rango de campaña, aplicado a la fecha de referencia del nido
  /// (entrada al nido, o incubación/eclosión/vuelo si falta).
  final DateTime? fechaDesde;
  final DateTime? fechaHasta;

  bool get isEmpty =>
      municipios.isEmpty &&
      estado == EstadoReproductivo.todos &&
      query.trim().isEmpty &&
      fechaDesde == null &&
      fechaHasta == null;

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
        estado: estado ?? this.estado,
        query: query ?? this.query,
        fechaDesde: limpiarFechas ? null : (fechaDesde ?? this.fechaDesde),
        fechaHasta: limpiarFechas ? null : (fechaHasta ?? this.fechaHasta),
      );
}
