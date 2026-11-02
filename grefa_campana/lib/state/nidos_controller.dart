import 'package:flutter/foundation.dart';

import '../logic/texto.dart';
import '../models/nido_grefa_model.dart';
import '../services/database_service.dart';
import '../services/sync_service.dart';

/// Estado de la lista de nidos + filtros de la pantalla principal.
class NidosController extends ChangeNotifier {
  NidosController({required this._db, required this._sync}) {
    _sync.addListener(_alCambiarSync);
    _versionSync = _sync.version;
  }

  final DatabaseService _db;
  final SyncService _sync;
  int _versionSync = 0;

  List<NidoGrefaModel> _todos = const [];
  bool _cargando = true;

  String? _municipio;
  EstadoReproductivo? _estado;
  String _busqueda = '';

  bool get cargando => _cargando;
  List<NidoGrefaModel> get todos => _todos;
  String? get municipio => _municipio;
  EstadoReproductivo? get estado => _estado;
  String get busqueda => _busqueda;

  List<String> get municipios {
    final set = <String>{
      for (final n in _todos)
        if ((n.municipio ?? '').trim().isNotEmpty) n.municipio!.trim(),
    };
    return set.toList()
      ..sort((a, b) => normalizarTexto(a).compareTo(normalizarTexto(b)));
  }

  List<NidoGrefaModel> get filtrados => filtrar(
    _todos,
    municipio: _municipio,
    estado: _estado,
    busqueda: _busqueda,
  );

  /// Filtrado puro (testeable).
  static List<NidoGrefaModel> filtrar(
    Iterable<NidoGrefaModel> nidos, {
    String? municipio,
    EstadoReproductivo? estado,
    String busqueda = '',
  }) {
    final q = normalizarTexto(busqueda);
    final mun = municipio == null ? null : normalizarTexto(municipio);
    return nidos.where((n) {
      if (mun != null && normalizarTexto(n.municipio) != mun) return false;
      if (estado != null && n.estadoReproductivo != estado) return false;
      if (q.isNotEmpty) {
        final enEtiqueta = normalizarTexto(n.etiqueta).contains(q);
        final enPropietario = normalizarTexto(n.propietario).contains(q);
        if (!enEtiqueta && !enPropietario) return false;
      }
      return true;
    }).toList();
  }

  Future<void> cargar() async {
    _todos = await _db.obtenerTodos();
    if (_municipio != null && !municipios.contains(_municipio)) {
      _municipio = null;
    }
    _cargando = false;
    notifyListeners();
  }

  void setMunicipio(String? v) {
    _municipio = v;
    notifyListeners();
  }

  void setEstado(EstadoReproductivo? v) {
    _estado = v;
    notifyListeners();
  }

  void setBusqueda(String v) {
    _busqueda = v;
    notifyListeners();
  }

  /// Guarda en local (offline), recarga y dispara la sincronización en
  /// segundo plano.
  Future<NidoGrefaModel> guardar(NidoGrefaModel nido) async {
    nido.recalcularTotales();
    await _db.guardarNido(nido);
    await cargar();
    _sync.solicitarSync();
    return nido;
  }

  Future<void> marcarConflictoRevisado(NidoGrefaModel nido) async {
    await _db.actualizarMarcaConflicto(nido.id, false);
    await cargar();
  }

  NidoGrefaModel? porId(String id) {
    for (final n in _todos) {
      if (n.id == id) return n;
    }
    return null;
  }

  void _alCambiarSync() {
    if (_sync.version != _versionSync) {
      _versionSync = _sync.version;
      cargar();
    }
  }

  @override
  void dispose() {
    _sync.removeListener(_alCambiarSync);
    super.dispose();
  }
}
