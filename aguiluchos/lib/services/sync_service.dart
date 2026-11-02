import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

import '../models/nido_grefa_model.dart';
import 'database_service.dart';
import 'last_write_wins.dart';
import 'remote_nidos_gateway.dart';

enum SyncStatus { synced, pending, syncing }

@immutable
class SyncState {
  const SyncState({
    this.status = SyncStatus.synced,
    this.pendingCount = 0,
    this.lastSyncAt,
    this.lastError,
    this.isOnline = false,
    this.isConfigured = false,
  });

  final SyncStatus status;
  final int pendingCount;
  final DateTime? lastSyncAt;
  final String? lastError;
  final bool isOnline;

  /// `false` si no hay credenciales de Supabase: la app funciona solo local.
  final bool isConfigured;

  SyncState copyWith({
    SyncStatus? status,
    int? pendingCount,
    DateTime? lastSyncAt,
    String? lastError,
    bool clearError = false,
    bool? isOnline,
    bool? isConfigured,
  }) =>
      SyncState(
        status: status ?? this.status,
        pendingCount: pendingCount ?? this.pendingCount,
        lastSyncAt: lastSyncAt ?? this.lastSyncAt,
        lastError: clearError ? null : (lastError ?? this.lastError),
        isOnline: isOnline ?? this.isOnline,
        isConfigured: isConfigured ?? this.isConfigured,
      );
}

class SyncResult {
  const SyncResult({
    this.pulled = 0,
    this.pushed = 0,
    this.conflicts = 0,
    this.imagesUploaded = 0,
    this.errors = const [],
    this.skippedReason,
  });

  final int pulled;
  final int pushed;
  final int conflicts;
  final int imagesUploaded;
  final List<String> errors;

  /// No se intentó sincronizar (sin configurar, sin conexión, ya en curso).
  final String? skippedReason;

  bool get ok => errors.isEmpty && skippedReason == null;
}

/// Sincronización offline-first con Supabase.
///
/// Ciclo (`syncNow`): **pull** de cambios remotos desde el último cursor
/// `server_updated_at` y después **push** de los registros `isSynced == false`.
/// La resolución de conflictos es Last-Write-Wins por `updatedAt`
/// (ver [LastWriteWins] y `README.md`).
class SyncService extends ChangeNotifier {
  SyncService({
    required this._db,
    RemoteNidosGateway? gateway,
    this._connectivityStream,
    this._initialConnectivity,
    this.pageSize = 500,
    this.periodicInterval = const Duration(minutes: 3),
    DateTime Function()? clock,
  })  : _gateway = gateway,
        _clock = clock ?? DateTime.now,
        _state = SyncState(isConfigured: gateway != null);

  static const _cursorKey = 'last_pull_server_updated_at';

  final DatabaseService _db;
  final RemoteNidosGateway? _gateway;
  final Stream<bool>? _connectivityStream;
  final Future<bool> Function()? _initialConnectivity;
  final DateTime Function() _clock;
  final int pageSize;
  final Duration periodicInterval;

  final _stateController = StreamController<SyncState>.broadcast();
  StreamSubscription<bool>? _connSub;
  StreamSubscription<void>? _dbSub;
  Timer? _periodic;
  Timer? _debounce;
  bool _running = false;
  bool _rerun = false;
  bool _disposed = false;
  SyncState _state;

  SyncState get state => _state;
  Stream<SyncState> get stateStream => _stateController.stream;
  bool get isConfigured => _gateway != null;

  /// Arranca la escucha de conectividad y sincroniza si hay red.
  Future<void> start() async {
    final stream = _connectivityStream ??
        Connectivity()
            .onConnectivityChanged
            .map((r) => !r.contains(ConnectivityResult.none));
    final initial = await (_initialConnectivity?.call() ??
        _checkConnectivity().catchError((_) => false));
    _setState(_state.copyWith(isOnline: initial));
    await _refreshPending();

    _connSub = stream.listen((online) {
      final wasOnline = _state.isOnline;
      _setState(_state.copyWith(isOnline: online));
      if (online && !wasOnline) unawaited(syncNow());
    });
    _dbSub = _db.changes.listen((_) => unawaited(_refreshPending()));
    _periodic = Timer.periodic(periodicInterval, (_) {
      if (_state.isOnline && _state.pendingCount > 0) unawaited(syncNow());
    });
    if (initial) unawaited(syncNow());
  }

  static Future<bool> _checkConnectivity() async {
    final r = await Connectivity().checkConnectivity();
    return !r.contains(ConnectivityResult.none);
  }

  /// Pide una sincronización en segundo plano (p. ej. tras guardar). Agrupa
  /// llamadas cercanas y nunca lanza.
  void requestSync() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      unawaited(syncNow());
    });
  }

  Future<SyncResult> syncNow() async {
    if (_gateway == null) {
      await _refreshPending();
      return const SyncResult(skippedReason: 'Supabase no está configurado');
    }
    if (!_state.isOnline) {
      await _refreshPending();
      return const SyncResult(skippedReason: 'Sin conexión');
    }
    if (_running) {
      _rerun = true;
      return const SyncResult(skippedReason: 'Sincronización en curso');
    }
    _running = true;
    _setState(_state.copyWith(status: SyncStatus.syncing, clearError: true));

    var result = const SyncResult();
    try {
      final pulled = await _pull(_gateway);
      final pushed = await _push(_gateway);
      result = SyncResult(
        pulled: pulled.pulled,
        conflicts: pulled.conflicts + pushed.conflicts,
        pushed: pushed.pushed,
        imagesUploaded: pushed.imagesUploaded,
        errors: pushed.errors,
      );
      _setState(_state.copyWith(
        lastSyncAt: _clock(),
        lastError: result.errors.isEmpty ? null : result.errors.first,
        clearError: result.errors.isEmpty,
      ));
    } catch (e) {
      result = SyncResult(errors: ['$e']);
      _setState(_state.copyWith(lastError: '$e'));
    } finally {
      _running = false;
      await _refreshPending();
    }
    if (_rerun && !_disposed) {
      _rerun = false;
      unawaited(syncNow());
    }
    return result;
  }

  // ── Pull ─────────────────────────────────────────────────────────────────

  Future<({int pulled, int conflicts})> _pull(RemoteNidosGateway gw) async {
    final cursorStr = await _db.leerMeta(_cursorKey);
    final since = cursorStr == null ? null : DateTime.tryParse(cursorStr);
    DateTime? maxServer = since;
    var offset = 0;
    var pulled = 0;
    var conflicts = 0;

    while (true) {
      final page = await gw.fetchChanges(
          since: since, offset: offset, limit: pageSize);
      for (final change in page) {
        final remote = change.nido;
        if (maxServer == null || change.serverUpdatedAt.isAfter(maxServer)) {
          maxServer = change.serverUpdatedAt;
        }
        final local = await _db.obtener(remote.id, incluirBorrados: true);
        switch (LastWriteWins.resolve(local: local, remote: remote)) {
          case LwwDecision.keepLocal:
            break;
          case LwwDecision.takeRemote:
            await _applyRemote(remote, local, conflict: false);
            pulled++;
          case LwwDecision.takeRemoteWithConflict:
            await _applyRemote(remote, local, conflict: true);
            pulled++;
            conflicts++;
        }
      }
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    if (maxServer != null && maxServer != since) {
      await _db.escribirMeta(_cursorKey, maxServer.toUtc().toIso8601String());
    }
    return (pulled: pulled, conflicts: conflicts);
  }

  Future<void> _applyRemote(
    NidoGrefaModel remote,
    NidoGrefaModel? local, {
    required bool conflict,
  }) async {
    if (remote.isDeleted) {
      if (local != null) await _db.purgar(remote.id);
      return;
    }
    await _db.aplicarRemoto(remote, conflicto: conflict);
  }

  // ── Push ─────────────────────────────────────────────────────────────────

  Future<({int pushed, int conflicts, int imagesUploaded, List<String> errors})>
      _push(RemoteNidosGateway gw) async {
    final pending = await _db.pendientes();
    var pushed = 0;
    var conflicts = 0;
    var images = 0;
    final errors = <String>[];

    for (final nido in pending) {
      try {
        var imagesOk = true;
        if (!nido.isDeleted) {
          final up = await _uploadImages(gw, nido);
          images += up.uploaded;
          imagesOk = up.allOk;
        }
        final stored = await gw.upsert(nido);

        if (LastWriteWins.serverKeptNewerVersion(pushed: nido, stored: stored)) {
          await _applyRemote(stored, nido, conflict: true);
          conflicts++;
          continue;
        }
        if (imagesOk) {
          final marked = await _db.marcarSincronizado(nido.id, nido.updatedAt);
          if (marked && nido.isDeleted) await _db.purgar(nido.id);
        } else {
          errors.add('Fotos pendientes de subir en "${nido.etiqueta ?? nido.id}"');
        }
        pushed++;
      } on RemoteRejectedException catch (e) {
        errors.add('"${nido.etiqueta ?? nido.id}": ${e.message}');
      }
    }
    return (
      pushed: pushed,
      conflicts: conflicts,
      imagesUploaded: images,
      errors: errors
    );
  }

  /// Sube las fotos locales aún no presentes en `remoteImageUrls` y deja las
  /// URLs públicas en el modelo (en memoria y en BD).
  Future<({int uploaded, bool allOk})> _uploadImages(
    RemoteNidosGateway gw,
    NidoGrefaModel nido,
  ) async {
    final subidas = nido.remoteImageUrls
        .map((u) => Uri.tryParse(u)?.pathSegments.lastOrNull)
        .whereType<String>()
        .toSet();
    var uploaded = 0;
    var allOk = true;
    for (final path in nido.localImagePaths) {
      final file = File(path);
      final name = file.uri.pathSegments.last;
      if (subidas.contains(name)) continue;
      if (!await file.exists()) continue;
      try {
        final url = await gw.uploadImage(nidoId: nido.id, file: file);
        nido.remoteImageUrls = [...nido.remoteImageUrls, url];
        subidas.add(name);
        uploaded++;
      } catch (_) {
        allOk = false;
      }
    }
    if (uploaded > 0) {
      await _db.actualizarUrlsRemotas(nido.id, nido.remoteImageUrls);
    }
    return (uploaded: uploaded, allOk: allOk);
  }

  // ── Estado ───────────────────────────────────────────────────────────────

  Future<void> _refreshPending() async {
    if (_disposed) return;
    final count = await _db.contarPendientes();
    final status = _running
        ? SyncStatus.syncing
        : (count > 0 ? SyncStatus.pending : SyncStatus.synced);
    _setState(_state.copyWith(pendingCount: count, status: status));
  }

  void _setState(SyncState s) {
    if (_disposed) return;
    _state = s;
    _stateController.add(s);
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _debounce?.cancel();
    _periodic?.cancel();
    _connSub?.cancel();
    _dbSub?.cancel();
    _stateController.close();
    super.dispose();
  }
}
