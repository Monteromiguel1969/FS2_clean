import 'dart:async';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';

import '../app/app_services.dart';
import '../models/mapa_fondo.dart';
import '../models/nido_constants.dart';
import '../models/nido_filter.dart';
import '../models/nido_grefa_model.dart';
import '../services/excel_import_service.dart';
import '../services/fondo_mapa_prefs.dart';
import '../services/location_service.dart';
import '../utils/geo.dart';
import '../widgets/filtro_geografico.dart';
import '../widgets/filtro_proyecto_campana.dart';
import '../widgets/nido_card.dart';
import '../widgets/nidos_map.dart';
import '../widgets/responsive.dart';
import '../widgets/sync_status_icon.dart';
import 'contratos_screen.dart';
import 'export_screen.dart';
import 'login_screen.dart';
import 'nido_detail_screen.dart';
import 'radar_screen.dart';

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
  List<NidoGrefaModel> _todos = const [];
  bool _loading = true;
  StreamSubscription<void>? _sub;
  bool _didInit = false;
  bool _buscandoGps = false;
  MapaFondo _fondo = MapaFondo.osm;
  bool _fondoTocado = false;
  final _searchCtrl = TextEditingController();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_didInit) return;
    _didInit = true;
    final db = AppServices.of(context).db;
    _sub = db.changes.listen((_) => _cargar());
    _cargar();
    leerFondoMapa(db).then((f) {
      if (mounted && !_fondoTocado && f != _fondo) setState(() => _fondo = f);
    });
  }

  void _cambiarFondo(MapaFondo f) {
    _fondoTocado = true;
    setState(() => _fondo = f);
    guardarFondoMapa(AppServices.of(context).db, f);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _cargar() async {
    final db = AppServices.of(context).db;
    final todos = await db.consultar(const NidoFilter());
    // Si la ubicación filtrada ya no existe (nido borrado o editado), se limpia.
    final original = _filter;
    final filtro = sanearProyectoCampana(sanearGeo(original, todos), todos);
    final nidos = await db.consultar(filtro);
    if (!mounted) return;
    setState(() {
      _todos = todos;
      _nidos = nidos;
      _loading = false;
      // Solo si el usuario no ha cambiado el filtro mientras tanto.
      if (identical(_filter, original)) _filter = filtro;
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

  /// Crea un nido nuevo a partir de la posición GPS actual: captura la
  /// posición, avisa si es poco precisa o si ya hay un nido junto a ella y
  /// abre el formulario con las coordenadas rellenadas.
  Future<void> _nuevoDesdeGps() async {
    if (_buscandoGps) return;
    final services = AppServices.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _buscandoGps = true);
    messenger.showSnackBar(const SnackBar(
        content: Text('Obteniendo posición GPS…'),
        duration: Duration(seconds: 30)));
    try {
      final pos = await services.location.posicionActual();
      final todos = await services.db.consultar(const NidoFilter());
      messenger.hideCurrentSnackBar();
      if (!mounted) return;

      final cerca = nidoMasCercano(todos, pos.latitude, pos.longitude);
      final lineas = <String>[
        if (pos.accuracy > 25)
          'La precisión del GPS es baja (±${pos.accuracy.toStringAsFixed(0)} m). '
              'Conviene esperar unos segundos al aire libre.',
        if (cerca != null)
          'Ya existe el nido ${cerca.nido.etiqueta ?? cerca.nido.numeracion ?? ''} '
              'a ${cerca.metros.toStringAsFixed(0)} m de aquí.',
      ];
      if (lineas.isNotEmpty) {
        final seguir = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            icon: const Icon(Icons.my_location),
            title: const Text('Revisa la posición'),
            content: Text('${lineas.join('\n\n')}\n\n¿Crear el nido en esta posición?'),
            actions: [
              TextButton(
                  key: const Key('gps-cancelar'),
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancelar')),
              FilledButton(
                  key: const Key('gps-crear'),
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text('Crear aquí')),
            ],
          ),
        );
        if (seguir != true || !mounted) return;
      }
      messenger.showSnackBar(SnackBar(
          content: Text(
              'Posición GPS capturada (±${pos.accuracy.toStringAsFixed(0)} m).')));
      await Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => NidoDetailScreen(
            plantilla: nidoDesdePosicion(pos.latitude, pos.longitude)),
      ));
      _cargar();
    } on LocationException catch (e) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _buscandoGps = false);
    }
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

  Future<void> _cerrarSesion() async {
    final auth = AppServices.of(context).auth;
    if (auth == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Cerrar sesión?'),
        content: const Text(
            'Los datos de este dispositivo se conservan. Lo pendiente se '
            'subirá cuando vuelvas a iniciar sesión.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Cerrar sesión')),
        ],
      ),
    );
    if (ok == true) await auth.signOut();
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
      final report = await ExcelImportService(idsPorCampana: true)
          .importarTolerante(services.db, await file.readAsBytes());
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
            key: const Key('btn-radar'),
            tooltip: 'Radar de nidos',
            onPressed: () => Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const RadarScreen())),
            icon: const Icon(Icons.radar),
          ),
          if (services.contratos != null)
            IconButton(
              tooltip: 'Contratos y parcelas',
              onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ContratosScreen())),
              icon: const Icon(Icons.description_outlined),
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
              if (v == 'entrar') services.auth?.requestLogin();
              if (v == 'clave' && services.auth != null) {
                mostrarCambiarClave(context, services.auth!);
              }
              if (v == 'salir') _cerrarSesion();
            },
            itemBuilder: (_) {
              final auth = services.auth;
              return [
                const PopupMenuItem(
                  value: 'importar',
                  child: ListTile(
                    leading: Icon(Icons.upload_file),
                    title: Text('Importar desde Excel (.xlsx)'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                if (auth != null && auth.requiresLogin && !auth.isSignedIn)
                  const PopupMenuItem(
                    value: 'entrar',
                    child: ListTile(
                      leading: Icon(Icons.login),
                      title: Text('Iniciar sesión'),
                      subtitle: Text('Para sincronizar con la oficina'),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                if (auth != null && auth.isSignedIn)
                  const PopupMenuItem(
                    value: 'clave',
                    child: ListTile(
                      leading: Icon(Icons.lock_reset),
                      title: Text('Cambiar contraseña'),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                if (auth != null && auth.isSignedIn)
                  PopupMenuItem(
                    value: 'salir',
                    child: ListTile(
                      leading: const Icon(Icons.logout),
                      title: const Text('Cerrar sesión'),
                      subtitle: Text(
                          '${auth.email ?? ''}${auth.isAdmin ? ' · administrador' : ''}'),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
              ];
            },
          ),
        ],
      ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          FloatingActionButton.extended(
            key: const Key('fab-nido-gps'),
            heroTag: 'fab-nido-gps',
            onPressed: _buscandoGps ? null : _nuevoDesdeGps,
            icon: _buscandoGps
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.my_location),
            label: const Text('Nido en mi posición'),
          ),
          const SizedBox(height: 12),
          FloatingActionButton.extended(
            key: const Key('fab-nido-nuevo'),
            heroTag: 'fab-nido-nuevo',
            onPressed: () => _abrirNido(null),
            icon: const Icon(Icons.add),
            label: const Text('Nuevo Nido'),
          ),
        ],
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
            todos: _todos,
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
              : NidosMap(
                  nidos: _nidos,
                  onOpenNido: _abrirNido,
                  fondo: _fondo,
                  onFondo: _cambiarFondo,
                ),
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
                  todos: _todos,
                  searchCtrl: _searchCtrl,
                  onChanged: _setFilter,
                ),
              ),
              Expanded(child: _lista()),
            ],
          ),
        ),
        const VerticalDivider(width: 1),
        Expanded(child: NidosMap(
                  nidos: _nidos,
                  onOpenNido: _abrirNido,
                  fondo: _fondo,
                  onFondo: _cambiarFondo,
                )),
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
    final contratos = AppServices.of(context).contratos;
    Widget lista() => ListView.builder(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 88),
          itemCount: _nidos.length,
          itemBuilder: (context, i) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: NidoCard(
              nido: _nidos[i],
              semaforo: (contratos == null || contratos.datos.vacio)
                  ? null
                  : contratos.estadoDe(_nidos[i]).codigo,
              onTap: () => _abrirNido(_nidos[i]),
            ),
          ),
        );
    return contratos == null
        ? lista()
        : ListenableBuilder(listenable: contratos, builder: (_, _) => lista());
  }
}

class _Filtros extends StatelessWidget {
  const _Filtros({
    required this.filter,
    required this.todos,
    required this.searchCtrl,
    required this.onChanged,
  });

  final NidoFilter filter;
  final List<NidoGrefaModel> todos;
  final TextEditingController searchCtrl;
  final ValueChanged<NidoFilter> onChanged;

  @override
  Widget build(BuildContext context) {
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

    final ubicacion = FiltroGeografico(
      nidos: todos,
      filter: filter,
      onChanged: onChanged,
      plegable: true,
    );

    final proyectoCampana = FiltroProyectoCampana(
      nidos: todos,
      filter: filter,
      onChanged: onChanged,
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
        ubicacion,
        const SizedBox(height: 8),
        proyectoCampana,
        const SizedBox(height: 8),
        estado,
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
              if (report.actualizados > 0)
                Text('${report.actualizados} nidos existentes completados '
                    '(solo celdas con dato; nada se ha borrado ni pisado con vacíos).'),
              if (report.sinCambios > 0)
                Text('${report.sinCambios} nidos existentes ya estaban al día.'),
              for (final c in report.cabecerasReconocidas)
                if (c.campo == 'campana' &&
                    c.cabecera.trim().toLowerCase().replaceAll('ñ', 'n') != 'campana')
                  Text('«${c.cabecera}» se ha usado como Campaña.'),
              if (!report.traeCampana)
                const Text('El fichero no trae Campaña: los nidos nuevos quedan sin campaña.'),
              if (report.columnasQueFaltan.isNotEmpty)
                Text('No vienen en el fichero (se dejan como están): '
                    '${report.columnasQueFaltan.join(', ')}.',
                    style: const TextStyle(fontSize: 12)),
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
