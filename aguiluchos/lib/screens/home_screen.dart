import 'dart:async';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';

import '../app/app_services.dart';
import '../models/nido_constants.dart';
import '../models/nido_filter.dart';
import '../models/nido_grefa_model.dart';
import '../services/excel_import_service.dart';
import '../widgets/nido_card.dart';
import '../widgets/nidos_map.dart';
import '../widgets/responsive.dart';
import '../widgets/sync_status_icon.dart';
import 'export_screen.dart';
import 'nido_detail_screen.dart';

enum _Vista { lista, mapa }

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  NidoFilter _filter = const NidoFilter();
  _Vista _vista = _Vista.lista;
  List<NidoGrefaModel> _nidos = const [];
  List<String> _municipios = const [];
  bool _loading = true;
  StreamSubscription<void>? _sub;
  bool _didInit = false;
  final _searchCtrl = TextEditingController();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_didInit) return;
    _didInit = true;
    final db = AppServices.of(context).db;
    _sub = db.changes.listen((_) => _cargar());
    _cargar();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _cargar() async {
    final db = AppServices.of(context).db;
    final nidos = await db.consultar(_filter);
    final municipios = await db.municipios();
    if (!mounted) return;
    setState(() {
      _nidos = nidos;
      _municipios = municipios;
      _loading = false;
      // Si el municipio filtrado ya no existe, se limpia el filtro.
      if (_filter.municipios.isNotEmpty &&
          !municipios.contains(_filter.municipios.first)) {
        _filter = _filter.copyWith(municipios: <String>{});
      }
    });
  }

  void _setFilter(NidoFilter f) {
    _filter = f;
    _cargar();
  }

  Future<void> _abrirNido(NidoGrefaModel? nido) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => NidoDetailScreen(nido: nido),
    ));
    _cargar();
  }

  Future<void> _sincronizar() async {
    final sync = AppServices.of(context).sync;
    final messenger = ScaffoldMessenger.of(context);
    final r = await sync.syncNow();
    final msg = r.skippedReason != null
        ? 'No se sincronizó: ${r.skippedReason}.'
        : r.errors.isNotEmpty
            ? 'Sincronización con errores: ${r.errors.first}'
            : 'Sincronizado: ${r.pushed} subidos, ${r.pulled} descargados'
                '${r.conflicts > 0 ? ', ${r.conflicts} conflictos' : ''}.';
    messenger.showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _importarExcel() async {
    final services = AppServices.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final file = await openFile(acceptedTypeGroups: const [
      XTypeGroup(
        label: 'Excel',
        extensions: ['xlsx'],
        mimeTypes: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ],
        uniformTypeIdentifiers: ['org.openxmlformats.spreadsheetml.sheet'],
      ),
    ]);
    if (file == null || !mounted) return;
    try {
      final report =
          await ExcelImportService().importar(services.db, await file.readAsBytes());
      services.sync.requestSync();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => _ImportDialog(report: report),
      );
    } on FormatException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Excel no válido: ${e.message}')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('No se pudo importar: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final services = AppServices.of(context);
    final wide = Breakpoints.isWide(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('GREFA - Campaña Aguilucho'),
        actions: [
          SyncStatusIcon(sync: services.sync),
          if (wide)
            TextButton.icon(
              onPressed: _sincronizar,
              icon: const Icon(Icons.sync),
              label: const Text('Sincronizar ahora'),
            )
          else
            IconButton(
              tooltip: 'Sincronizar ahora',
              onPressed: _sincronizar,
              icon: const Icon(Icons.sync),
            ),
          IconButton(
            tooltip: 'Exportar informes',
            onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ExportScreen())),
            icon: const Icon(Icons.ios_share),
          ),
          PopupMenuButton<String>(
            tooltip: 'Más opciones',
            onSelected: (v) {
              if (v == 'importar') _importarExcel();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: 'importar',
                child: ListTile(
                  leading: Icon(Icons.upload_file),
                  title: Text('Importar desde Excel (.xlsx)'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _abrirNido(null),
        icon: const Icon(Icons.add),
        label: const Text('Nuevo Nido'),
      ),
      body: SafeArea(
        child: wide ? _buildWide() : _buildNarrow(),
      ),
    );
  }

  Widget _buildNarrow() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: _Filtros(
            filter: _filter,
            municipios: _municipios,
            searchCtrl: _searchCtrl,
            onChanged: _setFilter,
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: SegmentedButton<_Vista>(
            segments: const [
              ButtonSegment(
                  value: _Vista.lista, icon: Icon(Icons.list), label: Text('Lista')),
              ButtonSegment(
                  value: _Vista.mapa, icon: Icon(Icons.map), label: Text('Mapa')),
            ],
            selected: {_vista},
            onSelectionChanged: (s) => setState(() => _vista = s.first),
          ),
        ),
        Expanded(
          child: _vista == _Vista.lista
              ? _lista()
              : NidosMap(nidos: _nidos, onOpenNido: _abrirNido),
        ),
      ],
    );
  }

  Widget _buildWide() {
    return Row(
      children: [
        SizedBox(
          width: 460,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: _Filtros(
                  filter: _filter,
                  municipios: _municipios,
                  searchCtrl: _searchCtrl,
                  onChanged: _setFilter,
                ),
              ),
              Expanded(child: _lista()),
            ],
          ),
        ),
        const VerticalDivider(width: 1),
        Expanded(child: NidosMap(nidos: _nidos, onOpenNido: _abrirNido)),
      ],
    );
  }

  Widget _lista() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_nidos.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            _filter.isEmpty
                ? 'Aún no hay nidos. Pulsa "Nuevo Nido" para registrar el primero.'
                : 'Ningún nido coincide con los filtros.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 88),
      itemCount: _nidos.length,
      itemBuilder: (context, i) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: NidoCard(nido: _nidos[i], onTap: () => _abrirNido(_nidos[i])),
      ),
    );
  }
}

class _Filtros extends StatelessWidget {
  const _Filtros({
    required this.filter,
    required this.municipios,
    required this.searchCtrl,
    required this.onChanged,
  });

  final NidoFilter filter;
  final List<String> municipios;
  final TextEditingController searchCtrl;
  final ValueChanged<NidoFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final municipioActual =
        filter.municipios.isEmpty ? null : filter.municipios.first;

    final buscador = TextField(
      controller: searchCtrl,
      decoration: InputDecoration(
        labelText: 'Buscar por etiqueta o propietario',
        prefixIcon: const Icon(Icons.search),
        suffixIcon: filter.query.isEmpty
            ? null
            : IconButton(
                icon: const Icon(Icons.clear),
                onPressed: () {
                  searchCtrl.clear();
                  onChanged(filter.copyWith(query: ''));
                },
              ),
      ),
      onChanged: (v) => onChanged(filter.copyWith(query: v)),
    );

    final municipio = DropdownButtonFormField<String?>(
      key: ValueKey('mun-$municipioActual-${municipios.length}'),
      initialValue: municipioActual,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Municipio'),
      items: [
        const DropdownMenuItem<String?>(value: null, child: Text('Todos')),
        for (final m in municipios)
          DropdownMenuItem<String?>(value: m, child: Text(m)),
      ],
      onChanged: (v) =>
          onChanged(filter.copyWith(municipios: v == null ? <String>{} : {v})),
    );

    final estado = DropdownButtonFormField<EstadoReproductivo>(
      initialValue: filter.estado,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Estado reproductivo'),
      items: [
        for (final e in EstadoReproductivo.values)
          DropdownMenuItem(value: e, child: Text(e.etiqueta)),
      ],
      onChanged: (v) => onChanged(filter.copyWith(estado: v)),
    );

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        buscador,
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: municipio),
          const SizedBox(width: 8),
          Expanded(child: estado),
        ]),
      ],
    );
  }
}

class _ImportDialog extends StatelessWidget {
  const _ImportDialog({required this.report});
  final ImportReport report;

  @override
  Widget build(BuildContext context) {
    final p = report.parse;
    return AlertDialog(
      icon: const Icon(Icons.upload_file),
      title: const Text('Importación terminada'),
      content: SizedBox(
        width: 520,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${report.nuevos} nidos nuevos importados.'),
              if (report.yaExistentes > 0)
                Text('${report.yaExistentes} ya existían y no se han modificado.'),
              if (p.filasOmitidas > 0)
                Text('${p.filasOmitidas} filas vacías omitidas.'),
              if (p.columnasNoReconocidas.isNotEmpty)
                Text('Columnas ignoradas: ${p.columnasNoReconocidas.join(', ')}.'),
              if (p.avisos.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('${p.avisos.length} avisos de datos:',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                for (final a in p.avisos.take(30))
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('• $a', style: const TextStyle(fontSize: 12)),
                  ),
                if (p.avisos.length > 30) Text('… y ${p.avisos.length - 30} más.'),
              ],
            ],
          ),
        ),
      ),
      actions: [
        FilledButton(
            onPressed: () => Navigator.pop(context), child: const Text('Cerrar')),
      ],
    );
  }
}
