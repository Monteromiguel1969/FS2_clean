import 'dart:async';
import 'dart:io';

import 'package:grefa_campana/services/connectivity_monitor.dart';
import 'package:grefa_campana/services/nidos_remote.dart';

/// Backend en memoria que emula las reglas del servidor
/// (`supabase/schema.sql`): rechaza escrituras más antiguas que la
/// almacenada y bumpea `updated_at` si cambia el contenido sin cambiarla.
class FakeRemote implements NidosRemote {
  final Map<String, Map<String, dynamic>> filas = {};
  final Map<String, List<int>> archivos = {};
  final List<String> llamadas = [];
  bool fallarUpsert = false;
  bool fallarImagenes = false;
  DateTime Function() reloj = DateTime.now;

  @override
  Future<List<Map<String, dynamic>>> obtenerCambios({DateTime? desde}) async {
    llamadas.add('cambios');
    final r =
        filas.values.where((f) {
          if (desde == null) return true;
          return !DateTime.parse(f['updated_at'] as String).isBefore(desde);
        }).toList()..sort(
          (a, b) =>
              (a['updated_at'] as String).compareTo(b['updated_at'] as String),
        );
    return r.map(Map<String, dynamic>.of).toList();
  }

  @override
  Future<Map<String, dynamic>?> obtenerPorId(String id) async {
    final f = filas[id];
    return f == null ? null : Map<String, dynamic>.of(f);
  }

  @override
  Future<Map<String, dynamic>?> upsert(Map<String, dynamic> json) async {
    llamadas.add('upsert:${json['id']}');
    if (fallarUpsert) throw const SocketException('sin red');
    final id = json['id'] as String;
    final nuevo = Map<String, dynamic>.of(json);
    final previo = filas[id];
    if (previo != null) {
      final tNuevo = DateTime.parse(nuevo['updated_at'] as String);
      final tPrevio = DateTime.parse(previo['updated_at'] as String);
      if (tNuevo.isBefore(tPrevio)) return null;
      final a = Map<String, dynamic>.of(nuevo)..remove('updated_at');
      final b = Map<String, dynamic>.of(previo)..remove('updated_at');
      if (tNuevo == tPrevio && a.toString() != b.toString()) {
        nuevo['updated_at'] = reloj().toUtc().toIso8601String();
      }
    }
    filas[id] = nuevo;
    return Map<String, dynamic>.of(nuevo);
  }

  /// Simula una edición desde el panel web / otro operario.
  void editarRemoto(String id, Map<String, dynamic> cambios, DateTime t) {
    final f = Map<String, dynamic>.of(filas[id]!)..addAll(cambios);
    f['updated_at'] = t.toUtc().toIso8601String();
    filas[id] = f;
  }

  @override
  Future<String> subirImagen({
    required String nidoId,
    required File archivo,
    required String nombre,
  }) async {
    llamadas.add('imagen:$nombre');
    if (fallarImagenes) throw const SocketException('sin red');
    archivos['$nidoId/$nombre'] = await archivo.readAsBytes();
    return 'https://fake.supabase.co/storage/v1/object/public/nidos-fotos/$nidoId/$nombre';
  }
}

class FakeConnectivity implements ConnectivityMonitor {
  FakeConnectivity({this.online = true});

  bool online;
  final _ctrl = StreamController<bool>.broadcast();

  @override
  Future<bool> estaOnline() async => online;

  @override
  Stream<bool> get cambios => _ctrl.stream;

  void emitir(bool valor) {
    online = valor;
    _ctrl.add(valor);
  }
}
