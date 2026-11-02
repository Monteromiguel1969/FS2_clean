import '../models/nido_grefa_model.dart';

/// Acción que debe ejecutar el motor de sincronización para un registro.
enum AccionSync {
  /// Sin cambios: ambas versiones coinciden o la local ya es la vigente.
  ninguna,

  /// La versión local gana: debe (re)subirse al servidor.
  subirLocal,

  /// La versión remota gana: debe sobrescribir la local.
  aceptarRemoto,
}

class ResolucionLww {
  const ResolucionLww(this.accion, {this.hayConflicto = false});

  final AccionSync accion;

  /// `true` cuando se detectó una edición concurrente (el dispositivo y otro
  /// operario/panel web modificaron el mismo nido desde la última sincronización)
  /// y una de las dos versiones se descartó por Last-Write-Wins.
  final bool hayConflicto;

  @override
  String toString() => 'ResolucionLww($accion, conflicto: $hayConflicto)';
}

/// Last-Write-Wins por `updatedAt`.
///
/// Reglas:
///  * Sin local -> se acepta el remoto.
///  * Local sincronizado (sin cambios pendientes): gana el remoto si es más
///    reciente; si no, no se hace nada. Nunca hay conflicto.
///  * Local con cambios pendientes y sin remoto -> se sube.
///  * Local con cambios pendientes y remoto con el mismo `updatedAt` -> es la
///    misma versión (subida previa); se acepta el remoto sin conflicto.
///  * Local con cambios pendientes y remoto sin cambios desde la última
///    sincronización (`remote.updatedAt <= local.lastSyncedAt`) -> se sube
///    (no hay edición concurrente).
///  * Local con cambios pendientes y remoto modificado por otro desde la última
///    sincronización -> edición concurrente: gana el `updatedAt` mayor
///    (empate -> gana el servidor, que es la fuente de verdad) y se marca
///    `hayConflicto = true` para que el operario pueda revisarlo.
ResolucionLww resolverLastWriteWins({
  required NidoGrefaModel? local,
  required NidoGrefaModel? remoto,
}) {
  if (remoto == null) {
    return local != null && !local.isSynced
        ? const ResolucionLww(AccionSync.subirLocal)
        : const ResolucionLww(AccionSync.ninguna);
  }
  if (local == null) {
    return const ResolucionLww(AccionSync.aceptarRemoto);
  }

  final tLocal = local.updatedAt.toUtc();
  final tRemoto = remoto.updatedAt.toUtc();

  if (local.isSynced) {
    return tRemoto.isAfter(tLocal)
        ? const ResolucionLww(AccionSync.aceptarRemoto)
        : const ResolucionLww(AccionSync.ninguna);
  }

  // Misma marca de tiempo: es nuestra propia subida previa (p. ej. se perdió
  // la respuesta). El contenido es idéntico, basta con marcarlo sincronizado.
  if (tLocal == tRemoto) {
    return const ResolucionLww(AccionSync.aceptarRemoto);
  }

  final base = local.lastSyncedAt?.toUtc();
  final remotoModificado = base == null || tRemoto.isAfter(base);
  if (!remotoModificado) {
    return const ResolucionLww(AccionSync.subirLocal);
  }

  // Edición concurrente.
  if (tLocal.isAfter(tRemoto)) {
    return const ResolucionLww(AccionSync.subirLocal, hayConflicto: true);
  }
  return const ResolucionLww(AccionSync.aceptarRemoto, hayConflicto: true);
}
