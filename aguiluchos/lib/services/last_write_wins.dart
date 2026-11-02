import '../models/nido_grefa_model.dart';

/// Decisión al comparar un registro local con su versión remota.
enum LwwDecision {
  /// Se aplica la versión remota; no se pierde ningún cambio local.
  takeRemote,

  /// La versión remota (más reciente) sobrescribe una edición local aún sin
  /// subir: se aplica y se marca `hasConflict` para que el operario lo revise.
  takeRemoteWithConflict,

  /// La versión local gana (o es la misma): se conserva y, si está pendiente,
  /// se subirá en el push.
  keepLocal,
}

/// Política Last-Write-Wins por `updatedAt`.
///
/// Reglas (la marca de tiempo es la hora de edición del dispositivo/panel):
///
/// * Sin copia local → se toma la remota.
/// * Local sincronizada (sin cambios pendientes): gana la más reciente; con
///   empate se conserva la local (eco de nuestro propio push).
/// * Local con cambios pendientes y remota más reciente → gana la remota y se
///   marca **conflicto** (se descartó una edición local).
/// * Local con cambios pendientes y local más reciente o igual → gana la local.
///
/// `hasConflict` solo se activa cuando se pierde una edición local sin
/// subir; que la local sobrescriba a la remota es el LWW normal y no se marca.
abstract final class LastWriteWins {
  static LwwDecision resolve({
    required NidoGrefaModel? local,
    required NidoGrefaModel remote,
  }) {
    if (local == null) return LwwDecision.takeRemote;
    final remoteNewer = remote.updatedAt.isAfter(local.updatedAt);
    if (local.isSynced) {
      return remoteNewer ? LwwDecision.takeRemote : LwwDecision.keepLocal;
    }
    return remoteNewer
        ? LwwDecision.takeRemoteWithConflict
        : LwwDecision.keepLocal;
  }

  /// Tras un upsert el servidor devuelve la fila almacenada. Si su `updatedAt`
  /// es posterior al nuestro, el servidor conservó otra versión más reciente
  /// (carrera entre dos operarios) y esa gana con conflicto.
  static bool serverKeptNewerVersion({
    required NidoGrefaModel pushed,
    required NidoGrefaModel stored,
  }) =>
      stored.updatedAt.isAfter(pushed.updatedAt);
}
