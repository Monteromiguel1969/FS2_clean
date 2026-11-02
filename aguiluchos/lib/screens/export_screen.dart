import 'dart:io';
import 'dart:typed_data';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../app/app_services.dart';
import '../models/nido_constants.dart';
import '../models/nido_filter.dart';
import '../models/nido_grefa_model.dart';
import '../services/export_service.dart';
import '../widgets/responsive.dart';

/// Exportación a Excel y PDF con filtros y selector de columnas a la carta.
class ExportScreen extends StatefulWidget {
  const ExportScreen({super.key});

  @override
  State<ExportScreen> createState() => _ExportScreenState();
}

enum _Entrega { compartir, guardar }

class _ExportScreenState extends State<ExportScreen> {
  static const _estados = [
    EstadoReproductivo.todos,
    EstadoReproductivo.exito,
    EstadoReproductivo.fracaso,
  ];

  DateTimeRange? _rango;
  final Set<String> _municipiosSel = {};
  List<String> _municipios = const [];
  EstadoReproductivo _estado = EstadoReproductivo.todos;
  final Set<String> _columnas = {for (final c in nidoColumns) c.key};
  int? _coinciden;
  bool _busy = false;
  bool _didInit = false;

  NidoFilter get _filter => NidoFilter(
        municipios: _municipiosSel,
        estado: _estado,
        fechaDesde: _rango?.start,
        fechaHasta: _rango?.end,
      );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_didInit) return;
    _didInit = true;
    final db = AppServices.of(context).db;
    db.municipios().then((m) {
      if (mounted) setState(() => _municipios = m);
    });
    _contar();
  }

  Future<void> _contar() async {
    final n = await AppServices.of(context).db.consultar(_filter);
    if (mounted) setState(() => _coinciden = n.length);
  }

  String get _descripcionFiltros {
    final f = DateFormat('dd/MM/yyyy');
    return [
      if (_rango != null)
        'campaña ${f.format(_rango!.start)} - ${f.format(_rango!.end)}',
      if (_municipiosSel.isNotEmpty) 'municipios: ${_municipiosSel.join(', ')}',
      if (_estado != EstadoReproductivo.todos) 'estado: ${_estado.etiqueta}',
    ].join(' | ');
  }

  List<NidoColumn> get _columnasSeleccionadas =>
      nidoColumns.where((c) => _columnas.contains(c.key)).toList();

  Future<void> _elegirRango() async {
    final now = DateTime.now();
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2000),
      lastDate: DateTime(now.year + 2),
      initialDateRange: _rango,
      locale: const Locale('es', 'ES'),
      helpText: 'Rango de fechas de la campaña',
    );
    if (r != null) {
      setState(() => _rango = r);
      _contar();
    }
  }

  Future<void> _exportarExcel() async {
    if (_columnas.isEmpty) {
      _snack('Selecciona al menos una columna.');
      return;
    }
    await _generar(
      nombre: ExportService.nombreArchivo('nidos_aguiluchos', 'xlsx'),
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx',
      build: (nidos) async => AppServices.of(context)
          .export
          .generarExcel(nidos, _columnasSeleccionadas),
    );
  }

  Future<void> _exportarPdf() async {
    await _generar(
      nombre: ExportService.nombreArchivo('informe_aguiluchos', 'pdf'),
      mime: 'application/pdf',
      ext: 'pdf',
      build: (nidos) => AppServices.of(context).export.generarPdf(
            nidos,
            descripcionFiltros: _descripcionFiltros,
          ),
    );
  }

  Future<void> _generar({
    required String nombre,
    required String mime,
    required String ext,
    required Future<Uint8List> Function(List<NidoGrefaModel>) build,
  }) async {
    final services = AppServices.of(context);
    setState(() => _busy = true);
    try {
      final nidos = await services.db.consultar(_filter);
      if (nidos.isEmpty) {
        _snack('No hay nidos que cumplan los filtros.');
        return;
      }
      final bytes = await build(nidos);
      if (!mounted) return;
      setState(() => _busy = false);
      await _entregar(bytes, nombre, mime, ext);
    } catch (e) {
      _snack('Error al generar el archivo: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _entregar(
      Uint8List bytes, String nombre, String mime, String ext) async {
    final choice = await showModalBottomSheet<_Entrega>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            title: Text(nombre,
                style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('${(bytes.length / 1024).toStringAsFixed(1)} KB'),
          ),
          ListTile(
            leading: const Icon(Icons.share),
            title: const Text('Compartir'),
            subtitle: const Text('WhatsApp, correo electrónico, Drive…'),
            onTap: () => Navigator.pop(ctx, _Entrega.compartir),
          ),
          ListTile(
            leading: const Icon(Icons.save_alt),
            title: const Text('Guardar en este dispositivo'),
            onTap: () => Navigator.pop(ctx, _Entrega.guardar),
          ),
        ]),
      ),
    );
    if (choice == null || !mounted) return;
    final export = AppServices.of(context).export;

    Future<void> guardar() async {
      if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
        final loc = await getSaveLocation(
          suggestedName: nombre,
          acceptedTypeGroups: [
            XTypeGroup(label: ext.toUpperCase(), extensions: [ext]),
          ],
        );
        if (loc == null) return;
        await File(loc.path).writeAsBytes(bytes, flush: true);
        _snack('Guardado en ${loc.path}');
      } else {
        final f = await export.guardarEnApp(bytes, nombre);
        _snack('Guardado en ${f.path}');
      }
    }

    try {
      if (choice == _Entrega.guardar) {
        await guardar();
      } else {
        try {
          final f = await export.guardarTemporal(bytes, nombre);
          await SharePlus.instance.share(ShareParams(
            files: [XFile(f.path, mimeType: mime, name: nombre)],
            subject: 'Aguiluchos GREFA - $nombre',
            text: 'Informe de la campaña Aguilucho (GREFA).',
          ));
        } on UnimplementedError {
          _snack('Compartir archivos no está disponible en este sistema; elige dónde guardarlo.');
          await guardar();
        }
      }
    } catch (e) {
      _snack('No se pudo completar la acción: $e');
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  Widget _filtros() {
    final f = DateFormat('dd/MM/yyyy');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Filtros', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
          OutlinedButton.icon(
            onPressed: _elegirRango,
            icon: const Icon(Icons.date_range),
            label: Text(_rango == null
                ? 'Rango de fechas de campaña'
                : '${f.format(_rango!.start)} - ${f.format(_rango!.end)}'),
          ),
          if (_rango != null)
            IconButton(
              tooltip: 'Quitar rango',
              icon: const Icon(Icons.clear),
              onPressed: () {
                setState(() => _rango = null);
                _contar();
              },
            ),
        ]),
        const SizedBox(height: 16),
        Text('Estado reproductivo', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 6),
        SegmentedButton<EstadoReproductivo>(
          showSelectedIcon: false,
          segments: [
            for (final e in _estados)
              ButtonSegment(value: e, label: Text(e.etiqueta)),
          ],
          selected: {_estado},
          onSelectionChanged: (s) {
            setState(() => _estado = s.first);
            _contar();
          },
        ),
        const SizedBox(height: 16),
        Text('Municipios (vacío = todos)',
            style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 6),
        if (_municipios.isEmpty)
          const Text('Aún no hay municipios registrados.')
        else
          Wrap(spacing: 8, runSpacing: 4, children: [
            for (final m in _municipios)
              FilterChip(
                label: Text(m),
                selected: _municipiosSel.contains(m),
                onSelected: (sel) {
                  setState(() => sel
                      ? _municipiosSel.add(m)
                      : _municipiosSel.remove(m));
                  _contar();
                },
              ),
          ]),
        const SizedBox(height: 16),
        Card(
          child: ListTile(
            leading: const Icon(Icons.fact_check_outlined),
            title: Text(_coinciden == null
                ? 'Calculando…'
                : '$_coinciden nidos coinciden con los filtros'),
          ),
        ),
      ],
    );
  }

  Widget _selectorColumnas() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Expanded(
            child: Text('Columnas (${_columnas.length}/${nidoColumns.length})',
                style: Theme.of(context).textTheme.titleLarge),
          ),
          TextButton(
            onPressed: () => setState(
                () => _columnas.addAll(nidoColumns.map((c) => c.key))),
            child: const Text('Todas'),
          ),
          TextButton(
            onPressed: () => setState(_columnas.clear),
            child: const Text('Ninguna'),
          ),
        ]),
        for (final fase in NidoFase.values) _grupoFase(fase),
      ],
    );
  }

  Widget _grupoFase(NidoFase fase) {
    final cols = nidoColumnsPorFase[fase]!;
    final marcadas = cols.where((c) => _columnas.contains(c.key)).length;
    final bool? valor =
        marcadas == cols.length ? true : (marcadas == 0 ? false : null);
    return Card(
      margin: const EdgeInsets.only(top: 8),
      child: ExpansionTile(
        key: PageStorageKey('fase-${fase.name}'),
        initiallyExpanded: fase == NidoFase.ubicacion,
        leading: Checkbox(
          tristate: true,
          value: valor,
          onChanged: (_) => setState(() {
            if (valor == true) {
              _columnas.removeAll(cols.map((c) => c.key));
            } else {
              _columnas.addAll(cols.map((c) => c.key));
            }
          }),
        ),
        title: Text(fase.titulo),
        subtitle: Text('$marcadas de ${cols.length} columnas'),
        children: [
          for (final c in cols)
            CheckboxListTile(
              dense: true,
              controlAffinity: ListTileControlAffinity.leading,
              title: Text(c.label),
              subtitle: Text(c.key, style: const TextStyle(fontSize: 11)),
              value: _columnas.contains(c.key),
              onChanged: (v) => setState(() =>
                  v == true ? _columnas.add(c.key) : _columnas.remove(c.key)),
            ),
        ],
      ),
    );
  }

  Widget _acciones() => Wrap(spacing: 12, runSpacing: 8, children: [
        FilledButton.icon(
          onPressed: _busy ? null : _exportarExcel,
          icon: const Icon(Icons.table_chart),
          label: const Text('Exportar a Excel (.xlsx)'),
        ),
        FilledButton.tonalIcon(
          onPressed: _busy ? null : _exportarPdf,
          icon: const Icon(Icons.picture_as_pdf),
          label: const Text('Generar Informe PDF'),
        ),
      ]);

  @override
  Widget build(BuildContext context) {
    final wide = Breakpoints.isWide(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Exportar datos')),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (_busy) const LinearProgressIndicator(),
            const SizedBox(height: 8),
            _acciones(),
          ]),
        ),
      ),
      body: wide
          ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                  flex: 2,
                  child: SingleChildScrollView(
                      padding: const EdgeInsets.all(16), child: _filtros())),
              const VerticalDivider(width: 1),
              Expanded(
                  flex: 3,
                  child: SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: _selectorColumnas())),
            ])
          : ListView(padding: const EdgeInsets.all(16), children: [
              _filtros(),
              const SizedBox(height: 16),
              _selectorColumnas(),
            ]),
    );
  }
}
