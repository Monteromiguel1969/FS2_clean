import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';

/// Abstracción de la conectividad (sustituible en tests).
abstract class ConnectivityMonitor {
  Future<bool> estaOnline();

  /// Emite `true`/`false` cada vez que cambia la conectividad de red.
  Stream<bool> get cambios;
}

/// Implementación con `connectivity_plus`. Indica si hay *alguna* interfaz de
/// red activa; que haya internet real se comprueba al intentar sincronizar.
class ConnectivityPlusMonitor implements ConnectivityMonitor {
  ConnectivityPlusMonitor([Connectivity? connectivity])
    : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  static bool _hayRed(List<ConnectivityResult> r) =>
      r.any((e) => e != ConnectivityResult.none);

  /// Si la plataforma no puede informar (p. ej. Linux sin NetworkManager/DBus)
  /// se asume que hay red y es el propio intento de sincronización el que
  /// confirma o no la conectividad.
  @override
  Future<bool> estaOnline() async {
    try {
      return _hayRed(await _connectivity.checkConnectivity());
    } catch (_) {
      return true;
    }
  }

  @override
  Stream<bool> get cambios => _connectivity.onConnectivityChanged
      .handleError((Object _) {})
      .map(_hayRed)
      .distinct();
}

/// Alternativa sin plugins para Linux (donde `connectivity_plus` depende de
/// NetworkManager vía DBus, no siempre presente): considera que hay red si
/// existe alguna interfaz no-loopback con dirección, y la consulta cada
/// [intervalo].
class InterfazRedMonitor implements ConnectivityMonitor {
  InterfazRedMonitor({this.intervalo = const Duration(seconds: 15)});

  final Duration intervalo;

  @override
  Future<bool> estaOnline() async {
    try {
      final interfaces = await NetworkInterface.list();
      return interfaces.any((i) => i.addresses.isNotEmpty);
    } catch (_) {
      return true;
    }
  }

  @override
  Stream<bool> get cambios =>
      Stream<void>.periodic(intervalo).asyncMap((_) => estaOnline()).distinct();
}

/// Elige el monitor adecuado para la plataforma actual.
ConnectivityMonitor crearMonitorConectividad() =>
    Platform.isLinux ? InterfazRedMonitor() : ConnectivityPlusMonitor();
