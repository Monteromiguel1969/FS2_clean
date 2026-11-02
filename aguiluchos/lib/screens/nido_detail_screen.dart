import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../app/app_services.dart';
import '../models/nido_constants.dart';
import '../models/nido_grefa_model.dart';
import '../services/image_storage_service.dart';
import '../services/location_service.dart';
import '../services/photo_picker.dart';
import '../utils/utm.dart';
import '../widgets/image_picker_widget.dart';
import '../widgets/maps_launcher.dart';
import '../widgets/responsive.dart';

/// Ficha de un nido con las 4 fases de la campaña en pestañas.
class NidoDetailScreen extends StatefulWidget {
  const NidoDetailScreen({super.key, this.nido, this.photoPicker});

  /// `null` crea un nido nuevo.
  final NidoGrefaModel? nido;

  /// Inyectable para tests.
  final PhotoPicker? photoPicker;

  @override
  State<NidoDetailScreen> createState() => _NidoDetailScreenState();
}

class _NidoDetailScreenState extends State<NidoDetailScreen>
    with SingleTickerProviderStateMixin {
  static const _tabs = <(IconData, String)>[
    (Icons.map_outlined, 'Ubicación'),
    (Icons.egg_alt_outlined, 'Incubación'),
    (Icons.monitor_heart_outlined, 'Seguimiento y Manejo'),
    (Icons.agriculture_outlined, 'Cosecha y Balance'),
  ];

  late final NidoGrefaModel _nido;
  late final NidoGrefaModel _original;
  late final bool _esNuevo;
  late final TabController _tabController;
  final _formKey = GlobalKey<FormState>();
  final _ctrls = <String, TextEditingController>{};
  final _fotosVistas = <String>{};
  bool _saving = false;
  bool _locating = false;

  @override
  void initState() {
    super.initState();
    _esNuevo = widget.nido == null;
    _nido = widget.nido?.clone() ?? NidoGrefaModel();
    _original = _nido.clone();
    _fotosVistas.addAll(_nido.localImagePaths);
    _tabController = TabController(length: _tabs.length, vsync: this)
      ..addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _tabController.dispose();
    for (final c in _ctrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _dirty => !_nido.sameContentAs(_original);

  // ── Helpers de campos ────────────────────────────────────────────────────

  TextEditingController _ctrl(String key) => _ctrls.putIfAbsent(key, () {
        final v = nidoColumnByKey(key).read(_nido);
        return TextEditingController(text: _fmt(v));
      });

  static String _fmt(Object? v) {
    if (v == null) return '';
    if (v is double && v == v.roundToDouble()) return v.toInt().toString();
    return '$v';
  }

  void _setText(String key, String text) {
    _ctrl(key).text = text;
    _onText(nidoColumnByKey(key), text);
  }

  void _onText(NidoColumn col, String raw) {
    final t = raw.trim();
    switch (col.type) {
      case NidoColumnType.integer:
        col.write(_nido, int.tryParse(t));
      case NidoColumnType.real:
        col.write(_nido, double.tryParse(t.replaceAll(' ', '').replaceAll(',', '.')));
      default:
        col.write(_nido, t.isEmpty ? null : raw);
    }
    _afterChange();
  }

  void _afterChange() {
    _nido.recalcularTotales();
    for (final k in const ['num_pollos_volados', 'num_pollos_muertos']) {
      final v = nidoColumnByKey(k).read(_nido);
      final txt = v == null ? '' : '$v';
      if (_ctrls[k] != null && _ctrls[k]!.text != txt) _ctrls[k]!.text = txt;
    }
    setState(() {});
  }

  Widget _field(
    String key, {
    String? label,
    TextInputType? keyboard,
    int maxLines = 1,
    bool readOnly = false,
    String? Function(String?)? validator,
    List<TextInputFormatter>? formatters,
    String? helper,
    Widget? suffix,
  }) {
    final col = nidoColumnByKey(key);
    return TextFormField(
      key: ValueKey('f-$key'),
      controller: _ctrl(key),
      readOnly: readOnly,
      keyboardType: keyboard,
      inputFormatters: formatters,
      minLines: maxLines > 1 ? maxLines : null,
      maxLines: maxLines,
      textCapitalization:
          maxLines > 1 ? TextCapitalization.sentences : TextCapitalization.none,
      decoration: InputDecoration(
        labelText: label ?? col.label,
        helperText: helper,
        suffixIcon: suffix,
        alignLabelWithHint: maxLines > 1,
        filled: readOnly,
      ),
      validator: validator,
      onChanged: readOnly ? null : (v) => _onText(col, v),
    );
  }

  Widget _numero(String key, {String? label, bool readOnly = false, String? helper}) =>
      _field(
        key,
        label: label,
        readOnly: readOnly,
        helper: helper,
        keyboard: TextInputType.number,
        formatters: [FilteringTextInputFormatter.digitsOnly],
      );

  /// Contador con botones − / + pensado para uso con guantes en campo.
  Widget _contador(String key, {String? label}) {
    final col = nidoColumnByKey(key);
    void paso(int d) {
      final actual = (col.read(_nido) as int?) ?? 0;
      final nuevo = (actual + d).clamp(0, 9999);
      _setText(key, '$nuevo');
    }

    return Row(children: [
      IconButton.filledTonal(
        tooltip: 'Restar',
        onPressed: () => paso(-1),
        icon: const Icon(Icons.remove),
      ),
      const SizedBox(width: 8),
      Expanded(
        child: TextFormField(
          key: ValueKey('f-$key'),
          controller: _ctrl(key),
          textAlign: TextAlign.center,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(labelText: label ?? col.label),
          onChanged: (v) => _onText(col, v),
        ),
      ),
      const SizedBox(width: 8),
      IconButton.filledTonal(
        tooltip: 'Sumar',
        onPressed: () => paso(1),
        icon: const Icon(Icons.add),
      ),
    ]);
  }

  Widget _fecha(String key, {String? label}) {
    final col = nidoColumnByKey(key);
    final value = col.read(_nido) as DateTime?;
    return InkWell(
      key: ValueKey('f-$key'),
      onTap: () async {
        final now = DateTime.now();
        final picked = await showDatePicker(
          context: context,
          initialDate: value ?? now,
          firstDate: DateTime(2000),
          lastDate: DateTime(now.year + 2),
          locale: const Locale('es', 'ES'),
        );
        if (picked != null) {
          col.write(_nido, DateTime(picked.year, picked.month, picked.day));
          _afterChange();
        }
      },
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label ?? col.label,
          suffixIcon: value == null
              ? const Icon(Icons.calendar_today, size: 20)
              : IconButton(
                  tooltip: 'Borrar fecha',
                  icon: const Icon(Icons.clear, size: 20),
                  onPressed: () {
                    col.write(_nido, null);
                    _afterChange();
                  },
                ),
        ),
        child: Text(
          value == null ? 'Seleccionar…' : DateFormat('dd/MM/yyyy').format(value),
          style: value == null
              ? TextStyle(color: Theme.of(context).hintColor)
              : null,
        ),
      ),
    );
  }

  Widget _desplegable(String key, List<String> opciones,
      {String? label, bool enabled = true}) {
    final col = nidoColumnByKey(key);
    final actual = col.read(_nido) as String?;
    final items = [
      ...opciones,
      if (actual != null && actual.isNotEmpty && !opciones.contains(actual)) actual,
    ];
    return DropdownButtonFormField<String?>(
      key: ValueKey('f-$key-$actual-$enabled'),
      initialValue: (actual == null || actual.isEmpty) ? null : actual,
      isExpanded: true,
      decoration: InputDecoration(labelText: label ?? col.label),
      items: [
        const DropdownMenuItem<String?>(value: null, child: Text('—')),
        for (final o in items) DropdownMenuItem<String?>(value: o, child: Text(o)),
      ],
      onChanged: enabled
          ? (v) {
              col.write(_nido, v);
              _afterChange();
            }
          : null,
    );
  }

  // ── Pestañas ─────────────────────────────────────────────────────────────

  Widget _tabUbicacion() {
    return _pagina([
      FormGrid(children: [
        _field('numeracion'),
        _field('etiqueta',
            label: 'Etiqueta *',
            validator: (v) =>
                (v ?? '').trim().isEmpty ? 'La etiqueta es obligatoria' : null),
        _desplegable('proyecto', Proyectos.todos),
        _field('propietario'),
        _field('tlfn',
            keyboard: TextInputType.phone,
            formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+\s\-()]'))]),
        _field('municipio'),
        _field('provincia'),
        _field('referencia_catastral'),
        _desplegable('especie', Especies.todas),
        _desplegable('territorio', Territorios.todos),
        _desplegable('sustrato', Sustratos.todos),
      ]),
      const SectionTitle('Localización'),
      FormGrid(children: [
        _field('coordenada_x',
            label: 'Coordenada X (UTM Este, m)',
            keyboard: TextInputType.number,
            formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
            validator: (v) => _validarUtm(v, Utm.minEasting, Utm.maxEasting)),
        _field('coordenada_y',
            label: 'Coordenada Y (UTM Norte, m)',
            keyboard: TextInputType.number,
            formatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
            validator: (v) => _validarUtm(v, Utm.minNorthing, Utm.maxNorthing)),
        _field('google_maps_url', keyboard: TextInputType.url),
      ]),
      const SizedBox(height: 12),
      Wrap(spacing: 8, runSpacing: 8, children: [
        FilledButton.icon(
          onPressed: _locating ? null : _capturarGps,
          icon: _locating
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.my_location),
          label: const Text('Capturar GPS actual'),
        ),
        OutlinedButton.icon(
          onPressed: () => abrirEnGoogleMaps(context, _nido),
          icon: const Icon(Icons.map),
          label: const Text('Abrir en Google Maps'),
        ),
      ]),
    ]);
  }

  String? _validarUtm(String? v, double min, double max) {
    final t = (v ?? '').trim();
    if (t.isEmpty) return null;
    final d = double.tryParse(t.replaceAll(' ', '').replaceAll(',', '.'));
    return d == null || d < min || d > max
        ? 'Fuera de rango (${min.toInt()} a ${max.toInt()})'
        : null;
  }

  Widget _tabIncubacion() {
    final estimada = _nido.fechaEstimadaEclosion;
    return _pagina([
      FormGrid(children: [
        _fecha('fecha_entrada_nido', label: 'Fecha de entrada al nido'),
        _fecha('fecha_incubacion', label: 'Fecha de incubación'),
        _numero('tamano_puesta', label: 'Tamaño de puesta'),
        _numero('num_huevos_entrada', label: 'Nº de huevos (a la entrada)'),
        _fecha('fecha_eclosion', label: 'Fecha de eclosión (real)'),
      ]),
      const SizedBox(height: 16),
      Card(
        color: Theme.of(context).colorScheme.secondaryContainer,
        child: ListTile(
          leading: const Icon(Icons.event_available),
          title: const Text('Fecha Estimada de Eclosión'),
          subtitle: Text(
            estimada == null
                ? 'Indica la fecha de incubación para calcularla '
                    '(+$diasIncubacion días).'
                : '${DateFormat('EEEE d \'de\' MMMM \'de\' yyyy', 'es_ES').format(estimada)}'
                    '  (incubación + $diasIncubacion días)',
          ),
        ),
      ),
    ]);
  }

  Widget _tabSeguimiento() {
    return _pagina([
      FormGrid(minColumnWidth: 280, maxColumns: 3, children: [
        _contador('num_pollos_nacidos', label: 'Pollos nacidos'),
        _contador('num_huevos_no_eclosionados', label: 'Huevos no eclosionados'),
        _contador('edad_dias', label: 'Edad (días)'),
      ]),
      const SectionTitle('Anillamiento'),
      FormGrid(children: [
        _field('anillas_pvc', label: 'Anilla PVC'),
        _field('anillas_metalica', label: 'Anilla metálica'),
      ]),
      const SectionTitle('Manejo'),
      CheckboxListTile(
        key: const ValueKey('f-intervencion'),
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        title: const Text('Intervención'),
        value: _nido.intervencion,
        onChanged: (v) {
          _nido.intervencion = v ?? false;
          if (!_nido.intervencion) _nido.tipoAccionesManejo = <String>[];
          _afterChange();
        },
      ),
      Wrap(spacing: 8, children: [
        for (final t in TiposManejo.todos)
          FilterChip(
            key: ValueKey('manejo-$t'),
            label: Text(t),
            selected: _nido.tipoAccionesManejo.contains(t),
            onSelected: (sel) {
              final l = [..._nido.tipoAccionesManejo];
              sel ? l.add(t) : l.remove(t);
              _nido.tipoAccionesManejo = l;
              if (l.isNotEmpty) _nido.intervencion = true;
              _afterChange();
            },
          ),
      ]),
      const SizedBox(height: 16),
      _field('observaciones_i', label: 'Observaciones I', maxLines: 5),
      const SizedBox(height: 12),
      _field('observaciones_ii', label: 'Observaciones II', maxLines: 5),
      const SectionTitle('Fotografías de seguimiento'),
      _galeria(FotoCategoria.seguimiento),
    ]);
  }

  Widget _tabCosecha() {
    final n = _nido;
    final hayDesgloseVolados =
        n.pollosVoladosPrecosecha != null || n.pollosVoladosPostcosecha != null;
    final hayDesgloseMuertos = n.pollosMuertosPrecosecha != null ||
        n.pollosMuertosCosecha != null ||
        n.pollosMuertosPostcosecha != null;
    final fracaso = n.resultadoReproductivo == ResultadoReproductivo.fracaso;
    final nacidos = n.numPollosNacidos;
    final sinDeterminar = nacidos == null
        ? null
        : nacidos - (n.numPollosVolados ?? 0) - (n.numPollosMuertos ?? 0);

    return _pagina([
      FormGrid(children: [
        _fecha('fecha_vuelo', label: 'Fecha de vuelo'),
        _fecha('fecha_cosecha', label: 'Fecha de cosecha'),
      ]),
      const SectionTitle('Pollos volados'),
      FormGrid(minColumnWidth: 280, maxColumns: 3, children: [
        _contador('pollos_volados_precosecha', label: 'Volados pre-cosecha'),
        _contador('pollos_volados_postcosecha', label: 'Volados post-cosecha'),
        _numero('num_pollos_volados',
            label: 'Total volados',
            readOnly: hayDesgloseVolados,
            helper: hayDesgloseVolados ? 'Suma de pre + post' : null),
      ]),
      const SectionTitle('Pollos muertos'),
      FormGrid(minColumnWidth: 280, maxColumns: 2, children: [
        _contador('pollos_muertos_precosecha', label: 'Muertos pre-cosecha'),
        _contador('pollos_muertos_cosecha', label: 'Muertos durante cosecha'),
        _contador('pollos_muertos_postcosecha', label: 'Muertos post-cosecha'),
        _numero('num_pollos_muertos',
            label: 'Total muertos',
            readOnly: hayDesgloseMuertos,
            helper: hayDesgloseMuertos ? 'Suma de pre + cosecha + post' : null),
      ]),
      const SizedBox(height: 8),
      Chip(
        avatar: Icon(n.vuelanPollos ? Icons.flight : Icons.flight_land, size: 18),
        label: Text('¿Vuelan los pollos? ${n.vuelanPollos ? 'Sí' : 'No'}'),
      ),
      if (sinDeterminar != null)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(
            sinDeterminar < 0
                ? 'Incoherente: volados + muertos superan en ${-sinDeterminar} a los pollos nacidos ($nacidos).'
                : 'Balance: $nacidos nacidos = ${n.numPollosVolados ?? 0} volados + ${n.numPollosMuertos ?? 0} muertos + $sinDeterminar sin determinar.',
            style: TextStyle(
                color: sinDeterminar < 0
                    ? Theme.of(context).colorScheme.error
                    : null),
          ),
        ),
      const SectionTitle('Resultado'),
      SegmentedButton<String>(
        key: const ValueKey('f-resultado'),
        showSelectedIcon: false,
        segments: const [
          ButtonSegment(value: '', label: Text('En curso')),
          ButtonSegment(value: ResultadoReproductivo.exito, label: Text('Éxito')),
          ButtonSegment(value: ResultadoReproductivo.fracaso, label: Text('Fracaso')),
        ],
        selected: {n.resultadoReproductivo ?? ''},
        onSelectionChanged: (s) {
          final v = s.first;
          n.resultadoReproductivo = v.isEmpty ? null : v;
          if (v != ResultadoReproductivo.fracaso) {
            n.causasFracaso = null;
            n.estadoFracaso = null;
          }
          _afterChange();
        },
      ),
      const SizedBox(height: 12),
      FormGrid(children: [
        _desplegable('estado_final', EstadosFinales.todos),
        _desplegable('causas_fracaso', CausasFracaso.todas,
            label: 'Causas de fracaso', enabled: fracaso),
        _desplegable('estado_fracaso', EstadosFracaso.todos,
            label: 'Estado del fracaso', enabled: fracaso),
      ]),
      const SectionTitle('Fotografías de cosecha'),
      _galeria(FotoCategoria.cosecha),
    ]);
  }

  Widget _galeria(String categoria) => ImagePickerWidget(
        categoria: categoria,
        picker: widget.photoPicker,
        localPaths: _nido.localImagePaths,
        remoteUrls: _nido.remoteImageUrls,
        onLocalChanged: (l) {
          _fotosVistas.addAll(l);
          setState(() => _nido.localImagePaths = l);
        },
        onRemoteChanged: (l) => setState(() => _nido.remoteImageUrls = l),
      );

  Widget _pagina(List<Widget> children) => SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 900),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: children,
            ),
          ),
        ),
      );

  // ── Acciones ─────────────────────────────────────────────────────────────

  Future<void> _capturarGps() async {
    final messenger = ScaffoldMessenger.of(context);
    final location = AppServices.of(context).location;
    setState(() => _locating = true);
    try {
      final pos = await location.posicionActual();
      final tmp = NidoGrefaModel()..setLatLon(pos.latitude, pos.longitude);
      _setText('coordenada_x', _fmt(tmp.coordenadaX));
      _setText('coordenada_y', _fmt(tmp.coordenadaY));
      _setText('google_maps_url',
          NidoGrefaModel.urlDesdeCoordenadas(pos.latitude, pos.longitude));
      messenger.showSnackBar(SnackBar(
          content: Text(
              'GPS capturado (±${pos.accuracy.toStringAsFixed(0)} m).')));
    } on LocationException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _mostrarErrores(List<String> errores) => showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          icon: const Icon(Icons.error_outline),
          title: const Text('Revisa los datos'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [for (final e in errores) Text('• $e\n')],
            ),
          ),
          actions: [
            FilledButton(
                onPressed: () => Navigator.pop(ctx), child: const Text('Entendido')),
          ],
        ),
      );

  Future<bool> _confirmarAdvertencias(List<String> avisos) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.warning_amber),
        title: const Text('Datos dudosos'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [for (final a in avisos) Text('• $a\n')],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Revisar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Guardar de todos modos')),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _guardar() async {
    final services = AppServices.of(context);
    final nav = Navigator.of(context);
    _nido.recalcularTotales();
    final formOk = _formKey.currentState?.validate() ?? true;
    final errores = _nido.validar();
    if (!formOk || errores.isNotEmpty) {
      await _mostrarErrores(errores.isEmpty
          ? ['Hay campos con errores; revisa las pestañas.']
          : errores);
      return;
    }
    final avisos = _nido.advertencias();
    if (avisos.isNotEmpty && !await _confirmarAdvertencias(avisos)) return;
    if (!mounted) return;
    setState(() => _saving = true);
    try {
      await services.db.guardar(_nido);
      await _limpiarFotosHuerfanas(services.images, descartarNuevas: false);
      services.sync.requestSync();
      if (mounted) nav.pop(true);
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('No se pudo guardar: $e')));
      }
    }
  }

  /// Borra del disco las fotos que ya no están referenciadas. Al guardar:
  /// las quitadas de la lista. Al descartar: las añadidas en esta sesión.
  Future<void> _limpiarFotosHuerfanas(ImageStorageService images,
      {required bool descartarNuevas}) async {
    final conservar = descartarNuevas
        ? _original.localImagePaths.toSet()
        : _nido.localImagePaths.toSet();
    for (final path in _fotosVistas.difference(conservar)) {
      await images.eliminar(path);
    }
  }

  Future<void> _borrar() async {
    final services = AppServices.of(context);
    final nav = Navigator.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Borrar nido?'),
        content: Text('Se borrará "${_nido.etiqueta ?? 'sin etiqueta'}" '
            'también en el servidor en la próxima sincronización.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Borrar')),
        ],
      ),
    );
    if (ok != true) return;
    await services.db.borrar(_nido.id);
    services.sync.requestSync();
    nav.pop(true);
  }

  Future<bool> _confirmarDescartar() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Descartar cambios?'),
        content: const Text('Hay cambios sin guardar en este nido.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Seguir editando')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Descartar')),
        ],
      ),
    );
    return ok == true;
  }

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final wide = Breakpoints.isWide(context);
    final contenidos = [
      _tabUbicacion(),
      _tabIncubacion(),
      _tabSeguimiento(),
      _tabCosecha(),
    ];
    final body = IndexedStack(index: _tabController.index, children: contenidos);

    return PopScope(
      canPop: !_dirty || _saving,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final images = AppServices.of(context).images;
        final nav = Navigator.of(context);
        if (await _confirmarDescartar()) {
          await _limpiarFotosHuerfanas(images, descartarNuevas: true);
          nav.pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(_esNuevo
              ? 'Nuevo nido'
              : (_nido.etiqueta ?? '').isEmpty
                  ? 'Nido'
                  : _nido.etiqueta!),
          actions: [
            if (!_esNuevo)
              IconButton(
                tooltip: 'Borrar nido',
                onPressed: _borrar,
                icon: const Icon(Icons.delete_outline),
              ),
          ],
          bottom: wide
              ? null
              : TabBar(
                  controller: _tabController,
                  isScrollable: true,
                  tabAlignment: TabAlignment.start,
                  tabs: [for (final t in _tabs) Tab(icon: Icon(t.$1), text: t.$2)],
                ),
        ),
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Center(
              heightFactor: 1,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 900),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _saving ? null : _guardar,
                    icon: const Icon(Icons.save),
                    label: const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Text('Guardar Nido'),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        body: Form(
          key: _formKey,
          child: Column(
            children: [
              if (_nido.hasConflict)
                MaterialBanner(
                  leading: const Icon(Icons.warning_amber),
                  content: const Text(
                      'Este nido se modificó en otro dispositivo con fecha más reciente '
                      'y se aplicaron esos cambios (Last-Write-Wins). Revisa los datos.'),
                  actions: [
                    TextButton(
                      onPressed: () async {
                        await AppServices.of(context)
                            .db
                            .descartarConflicto(_nido.id);
                        setState(() => _nido.hasConflict = false);
                      },
                      child: const Text('Entendido'),
                    ),
                  ],
                ),
              Expanded(
                child: wide
                    ? Row(children: [
                        NavigationRail(
                          selectedIndex: _tabController.index,
                          labelType: NavigationRailLabelType.all,
                          onDestinationSelected: (i) =>
                              setState(() => _tabController.index = i),
                          destinations: [
                            for (final t in _tabs)
                              NavigationRailDestination(
                                icon: Icon(t.$1),
                                label: SizedBox(
                                    width: 90,
                                    child: Text(t.$2, textAlign: TextAlign.center)),
                              ),
                          ],
                        ),
                        const VerticalDivider(width: 1),
                        Expanded(child: body),
                      ])
                    : body,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
