/// Lógica de fechas de eclosión.
///
/// Duración media de incubación de los aguiluchos (Circus spp.): ~30 días
/// desde el inicio de la incubación hasta la eclosión.
const int diasIncubacion = 30;

DateTime _soloFecha(DateTime d) => DateTime(d.year, d.month, d.day);

/// Fecha estimada de eclosión = [fechaIncubacion] + [dias] días.
///
/// Suma días de calendario (no múltiplos de 24 h), por lo que es robusta
/// frente a cambios de hora de verano/invierno. Devuelve `null` si no hay
/// fecha de incubación.
DateTime? estimarFechaEclosion(
  DateTime? fechaIncubacion, {
  int dias = diasIncubacion,
}) {
  if (fechaIncubacion == null) return null;
  final f = _soloFecha(fechaIncubacion);
  return DateTime(f.year, f.month, f.day + dias);
}

/// Días que faltan para la eclosión estimada respecto a [hoy] (negativo si
/// ya pasó). `null` si no hay fecha de incubación.
int? diasHastaEclosion(DateTime? fechaIncubacion, {DateTime? hoy}) {
  final est = estimarFechaEclosion(fechaIncubacion);
  if (est == null) return null;
  final h = _soloFecha(hoy ?? DateTime.now());
  return _diasEntre(h, est);
}

/// Edad en días de los pollos a partir de la fecha real de eclosión.
/// `null` si no hay fecha o si ésta es posterior a [hoy].
int? edadPollosDias(DateTime? fechaEclosion, {DateTime? hoy}) {
  if (fechaEclosion == null) return null;
  final h = _soloFecha(hoy ?? DateTime.now());
  final d = _diasEntre(_soloFecha(fechaEclosion), h);
  return d < 0 ? null : d;
}

/// Diferencia en días de calendario (insensible a cambios de hora).
int _diasEntre(DateTime desde, DateTime hasta) {
  final a = DateTime.utc(desde.year, desde.month, desde.day);
  final b = DateTime.utc(hasta.year, hasta.month, hasta.day);
  return b.difference(a).inDays;
}
