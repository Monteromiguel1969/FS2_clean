import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;

import '../logic/lww.dart';
import '../models/nido_grefa_model.dart';
import 'connectivity_monitor.dart';
import 'database_service.dart';
import 'nidos_remote.dart';

enum EstadoSync { noConfigurado, inactivo, sincronizando, sinConexion, error }

class ResultadoSync {
  const ResultadoSync({
    this.descargados = 0,
    this.subidos = 0,
    this.imagenesSubidas = 0,
    this.conflictos = 0,
    this.errores = const [],
  });

  final int descargados;
  final int subidos;
  final int imagenesSubidas;
  final int conflictos;
  final List<String> errores;

  bool get ok => errores.isEmpty;
}

/// Sincronización offline-first con Supabase.
///
/// Ciclo ([sincronizar]):
///  1. **Descarga** cambios remotos (`updated_at >=` último cursor) y los
///     resuelve con Last-Write-Wins ([resolverLastWriteWins]).
///  2. **Imágenes**: sube las fotos de `localImagePaths` aún no presentes en
///     `imageUrls` y registra su URL pública.
///  3. **Subida**: upsert de los registros con `isSynced == false`.
///
/// Se dispara al recuperar conexión, tras guardar un nido, al pulsar
/// "Sincronizar ahora" y periódicamente.
class SyncService extends ChangeNotifier {
  SyncService({
    required this._db,
    required this._remote,
    required this._connectivity,
    Duration? intervaloAutomatico = const Duration(minutes: 5),
    String Function(String ruta)? resolverRuta,
  }) : _intervalo = intervaloAutomatico,
       _resolverRuta = resolverRuta ?? ((r) => r);

  static const String _metaCursor = 'cursor_remoto';

  final DatabaseService _db;
  final NidosRemote? _remote;
  final ConnectivityMonitor _connectivity;
  final Duration? _intervalo;

  /// Traduce una ruta guardada a la ruta vigente (en iOS el contenedor de la
  /// app puede cambiar entre actualizaciones).
  final String Function(String ruta) _resolverRuta;

  StreamSubscription<bool>? _sub;
  Timer? _timer;
  bool _online = true;
  bool _ejecutando = false;
  bool _repetir = false;
  bool _disposed = false;

  EstadoSync _estado = EstadoSync.inactivo;
  int _pendientes = 0;
  DateTime? _ultimaSync;
  String? _ultimoError;
  int _version = 0;

  bool get configurado => _remote != null;
  bool get online => _online;
  EstadoSync get estado => _estado;
  int get pendientes => _pendientes;
  DateTime? get ultimaSync => _ultimaSync;
  String? get ultimoError => _ultimoError;

  /// Se incrementa cada vez que la sincronización modifica la BD local.
  int get version => _version;

  Future<void> iniciar() async {
    _online = await _connectivity.estaOnline();
    await refrescarPendientes();
    if (!configurado) {
      _estado = EstadoSync.noConfigurado;
      _notificar();
      return;
    }
    _sub = _connectivity.cambios.listen((online) {
      _online = online;
      if (online) {
        unawaited(sincronizar());
      } else {
        _estado = EstadoSync.sinConexion;
        _notificar();
      }
    });
    if (_intervalo != null) {
      _timer = Timer.periodic(_intervalo, (_) => solicitarSync());
    }
    if (_online) {
      unawaited(sincronizar());
    } else {
      _estado = EstadoSync.sinConexion;
      _notificar();
    }
  }

  Future<void> refrescarPendientes() async {
    _pendientes = await _db.contarPendientes();
    _notificar();
  }

  /// Dispara una sincronización en segundo plano (p. ej. tras guardar).
  void solicitarSync() {
    unawaited(refrescarPendientes());
    if (configurado && _online) unawaited(sincronizar());
  }

  /// Ejecuta un ciclo completo. Seguro frente a llamadas concurrentes: si ya
  /// hay uno en curso se encadena una repetición al terminar.
  Future<ResultadoSync> sincronizar() async {
    final remote = _remote;
    if (remote == null) {
      _estado = EstadoSync.noConfigurado;
      _notificar();
      return const ResultadoSync(errores: ['Supabase no está configurado']);
    }
    if (_ejecutando) {
      _repetir = true;
      return const ResultadoSync();
    }
    _online = await _connectivity.estaOnline();
    if (!_online) {
      _estado = EstadoSync.sinConexion;
      _notificar();
      return const ResultadoSync(errores: ['Sin conexión']);
    }

    _ejecutando = true;
    _estado = EstadoSync.sincronizando;
    _ultimoError = null;
    _notificar();

    var resultado = const ResultadoSync();
    try {
      do {
        _repetir = false;
        resultado = await _ciclo(remote);
      } while (_repetir && resultado.ok);
    } catch (e) {
      resultado = ResultadoSync(errores: ['$e']);
    } finally {
      _ejecutando = false;
    }

    _pendientes = await _db.contarPendientes();
    if (resultado.ok) {
      _estado = EstadoSync.inactivo;
      _ultimaSync = DateTime.now();
    } else {
      _estado = EstadoSync.error;
      _ultimoError = resultado.errores.first;
    }
    _version++;
    _notificar();
    return resultado;
  }

  Future<ResultadoSync> _ciclo(NidosRemote remote) async {
    final errores = <String>[];
    var descargados = 0;
    var subidos = 0;
    var imagenes = 0;
    var conflictos = 0;

    // 1) Descarga + LWW.
    try {
      final cursorTxt = await _db.leerMeta(_metaCursor);
      final cursor = cursorTxt == null ? null : DateTime.tryParse(cursorTxt);
      final filas = await remote.obtenerCambios(desde: cursor);
      DateTime? maxVisto = cursor;
      for (final fila in filas) {
        try {
          final r = NidoGrefaModel.fromJson(fila);
          final res = await _aplicarRemoto(r);
          if (res.accion == AccionSync.aceptarRemoto) descargados++;
          if (res.hayConflicto) conflictos++;
          if (maxVisto == null || r.updatedAt.isAfter(maxVisto)) {
            maxVisto = r.updatedAt;
          }
        } catch (e) {
          errores.add('Descarga de ${fila['id']}: $e');
        }
      }
      // El cursor solo avanza si todo lo descargado se aplicó bien.
      if (errores.isEmpty && maxVisto != null) {
        await _db.escribirMeta(_metaCursor, maxVisto.toUtc().toIso8601String());
      }
    } catch (e) {
      errores.add('Descarga: $e');
      return ResultadoSync(errores: errores);
    }

    // 2) Imágenes pendientes (de cualquier nido, también ya sincronizados).
    for (final n in await _db.obtenerTodos()) {
      for (final ruta in imagenesPendientes(n)) {
        try {
          final f = File(_resolverRuta(ruta));
          if (!await f.exists()) continue;
          final url = await remote.subirImagen(
            nidoId: n.id,
            archivo: f,
            nombre: p.basename(ruta),
          );
          await _db.agregarImageUrl(n.id, url, marcarPendiente: true);
          imagenes++;
        } catch (e) {
          errores.add('Imagen ${p.basename(ruta)}: $e');
        }
      }
    }

    // 3) Subida de registros pendientes.
    for (final n in await _db.obtenerPendientes()) {
      try {
        final enviado = n.updatedAt;
        final fila = await remote.upsert(n.toJson());
        if (fila == null) {
          conflictos += await _resolverRechazo(remote, n) ? 1 : 0;
          continue;
        }
        final servidor = NidoGrefaModel.fromJson(fila).updatedAt;
        await _db.marcarSincronizado(
          n.id,
          versionSubida: enviado,
          versionServidor: servidor,
        );
        subidos++;
      } catch (e) {
        errores.add('Subida de ${n.titulo}: $e');
      }
    }

    if (descargados > 0 || subidos > 0 || conflictos > 0) _version++;
    return ResultadoSync(
      descargados: descargados,
      subidos: subidos,
      imagenesSubidas: imagenes,
      conflictos: conflictos,
      errores: errores,
    );
  }

  Future<ResolucionLww> _aplicarRemoto(NidoGrefaModel remoto) async {
    final local = await _db.obtenerPorId(remoto.id);
    final res = resolverLastWriteWins(local: local, remoto: remoto);
    switch (res.accion) {
      case AccionSync.aceptarRemoto:
        await _db.guardarDesdeRemoto(remoto, hasConflict: res.hayConflicto);
      case AccionSync.subirLocal:
        await _db.actualizarVersionServidor(remoto.id, remoto.updatedAt);
        if (res.hayConflicto) {
          await _db.actualizarMarcaConflicto(remoto.id, true);
        }
      case AccionSync.ninguna:
        break;
    }
    return res;
  }

  /// El servidor rechazó la escritura por ser más antigua: gana el remoto y
  /// se marca conflicto. Devuelve `true` si se aplicó el remoto.
  Future<bool> _resolverRechazo(
    NidosRemote remote,
    NidoGrefaModel local,
  ) async {
    final fila = await remote.obtenerPorId(local.id);
    if (fila == null) return false;
    final r = NidoGrefaModel.fromJson(fila);
    await _db.guardarDesdeRemoto(r, hasConflict: true);
    return true;
  }

  /// Rutas locales cuya foto aún no tiene URL remota (se compara por nombre
  /// de archivo, que es único: `<etapa>_<uuid>.<ext>`).
  @visibleForTesting
  static List<String> imagenesPendientes(NidoGrefaModel n) {
    final subidas = n.imageUrls.map(nombreDeUrl).toSet();
    return n.localImagePaths
        .where((r) => !subidas.contains(p.basename(r)))
        .toList();
  }

  static String nombreDeUrl(String url) {
    final uri = Uri.tryParse(url);
    final seg = uri != null && uri.pathSegments.isNotEmpty
        ? uri.pathSegments.last
        : p.basename(url);
    return Uri.decodeComponent(seg);
  }

  void _notificar() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _sub?.cancel();
    super.dispose();
  }
}
