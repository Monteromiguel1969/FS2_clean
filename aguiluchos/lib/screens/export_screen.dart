import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../app/app_services.dart';
import '../models/nido_constants.dart';
import '../models/nido_filter.dart';
import '../models/nido_grefa_model.dart';
import '../services/export_service.dart';
import 'informe_tecnico_screen.dart';
import '../utils/geografia.dart';
import '../widgets/entrega_archivos.dart';
import '../widgets/filtro_geografico.dart';
import '../widgets/filtro_proyecto_campana.dart';
import '../widgets/responsive.dart';

/// Exportación a Excel y PDF con filtros y selector de columnas a la carta.
class ExportScreen extends StatefulWidget {
  const ExportScreen({super.key});

  @override
  State<ExportScreen> createState() => _ExportScreenState();
}

class _ExportScreenState extends State<ExportScreen> {
  static const _estados = [
    EstadoReproductivo.todos,
    EstadoReproductivo.exito,
    EstadoReproductivo.fracaso,
  ];

  DateTimeRange? _rango;
  final Set<String> _municipiosSel = {};
  NidoFilter _geo = const NidoFilter();
  List<NidoGrefaModel> _todos = const [];
  EstadoReproductivo _estado = EstadoReproductivo.todos;
  final Set<String> _columnas = {for (final c in nidoColumns) c.key};
  int? _coinciden;
  bool _busy = false;
  bool _didInit = false;

  NidoFilter get _filter => NidoFilter(
        municipios: _municipiosSel,
        pais: _geo.pais,
        comunidad: _geo.comunidad,
        provincia: _geo.provincia,
        localidad: _geo.localidad,
        proyecto: _geo.proyecto,
        campana: _geo.campana,
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
    db.consultar(const NidoFilter()).then((t) {
      if (mounted) setState(() => _todos = t);
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
        'fechas ${f.format(_rango!.start)} - ${f.format(_rango!.end)}',
      ...descripcionProyectoCampana(_geo),
      if (_geo.tieneFiltroGeografico) 'ubicación: ${resumenGeo(_geo)}',
      if (_municipiosSel.isNotEmpty) 'municipios: ${_municipiosSel.join(', ')}',
      if (_estado != EstadoReproductivo.todos) 'estado: ${_estado.etiqueta}',
    ].join(' | ');
  }

  /// Localidades que existen dentro de la ubicación elegida (sin «Sin indicar»).
  List<String> get _localidadesDisponibles => opcionesCascada(_todos,
          pais: _geo.pais, comunidad: _geo.comunidad, provincia: _geo.provincia)
      .localidades
      .where((l) => l != sinDato)
      .toList();

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

  Future<ArchivoExportado?> _prepararExcel(List<NidoGrefaModel> nidos) async {
    final bytes = AppServices.of(context)
        .export
        .generarExcel(nidos, _columnasSeleccionadas);
    return ArchivoExportado(
      nombre: ExportService.nombreArchivo('nidos_aguiluchos', 'xlsx'),
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx',
      bytes: bytes,
    );
  }

  Future<ArchivoExportado?> _prepararPdf(List<NidoGrefaModel> nidos) async {
    final bytes = await AppServices.of(context).export.generarPdf(
          nidos,
          descripcionFiltros: _descripcionFiltros,
        );
    return ArchivoExportado(
      nombre: ExportService.nombreArchivo('informe_aguiluchos', 'pdf'),
      mime: 'application/pdf',
      ext: 'pdf',
      bytes: bytes,
    );
  }

  Future<void> _exportarExcel() => _generar(excel: true, pdf: false);

  Future<void> _exportarPdf() => _generar(excel: false, pdf: true);

  Future<void> _exportarAmbos() => _generar(excel: true, pdf: true);

  /// Informe técnico completo y editable con los nidos que cumplen los filtros.
  Future<void> _informeTecnico() async {
    final nav = Navigator.of(context);
    final nidos = await AppServices.of(context).db.consultar(_filter);
    if (nidos.isEmpty) {
      _snack('No hay nidos que cumplan los filtros.');
      return;
    }
    if (!mounted) return;
    await nav.push(MaterialPageRoute<void>(
      builder: (_) => InformeTecnicoScreen(
        nidos: nidos,
        filtros: _descripcionFiltros,
        geo: _filter,
      ),
    ));
  }

  Future<void> _generar({required bool excel, required bool pdf}) async {
    if (excel && _columnas.isEmpty) {
      _snack('Selecciona al menos una columna.');
      return;
    }
    final services = AppServices.of(context);
    setState(() => _busy = true);
    final archivos = <ArchivoExportado>[];
    try {
      final nidos = await services.db.consultar(_filter);
      if (nidos.isEmpty) {
        _snack('No hay nidos que cumplan los filtros.');
        return;
      }
      if (excel) archivos.add((await _prepararExcel(nidos))!);
      if (pdf) archivos.add((await _prepararPdf(nidos))!);
    } catch (e) {
      _snack('Error al generar el archivo: $e');
      return;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (!mounted) return;
    await entregarArchivos(context, archivos);
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
        Text('Ubicación', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 6),
        FiltroGeografico(
          nidos: _todos,
          filter: _geo,
          onChanged: (g) {
            setState(() {
              _geo = g;
              // Las localidades marcadas deben seguir dentro de la ubicación elegida.
              final validas = opcionesCascada(_todos,
                      pais: g.pais, comunidad: g.comunidad, provincia: g.provincia)
                  .localidades;
              _municipiosSel.removeWhere((m) => !validas.contains(m));
            });
            _contar();
          },
        ),
        const SizedBox(height: 16),
        Text('Proyecto y campaña', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 6),
        FiltroProyectoCampana(
          nidos: _todos,
          filter: _geo,
          onChanged: (g) {
            setState(() => _geo = g);
            _contar();
          },
        ),
        const SizedBox(height: 16),
        Text('Localidades (selección múltiple; vacío = todas las de la ubicación)',
            style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 6),
        if (_localidadesDisponibles.isEmpty)
          const Text('Aún no hay localidades registradas.')
        else
          Wrap(spacing: 8, runSpacing: 4, children: [
            for (final m in _localidadesDisponibles)
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
        OutlinedButton.icon(
          key: const Key('exportar-ambos'),
          onPressed: _busy ? null : _exportarAmbos,
          icon: const Icon(Icons.library_books_outlined),
          label: const Text('Excel + PDF'),
        ),
        FilledButton.tonalIcon(
          key: const Key('exportar-informe-tecnico'),
          onPressed: _busy ? null : _informeTecnico,
          icon: const Icon(Icons.assignment_outlined),
          label: const Text('Informe técnico completo'),
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
