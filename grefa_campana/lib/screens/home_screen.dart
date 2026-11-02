import 'package:flutter/material.dart';

import '../models/nido_grefa_model.dart';
import '../state/app_scope.dart';
import '../state/nidos_controller.dart';
import '../widgets/filtros_bar.dart';
import '../widgets/nido_card.dart';
import '../widgets/nidos_map.dart';
import '../widgets/sync_status_button.dart';
import 'export_screen.dart';
import 'nido_detail_screen.dart';

enum _Vista { lista, mapa, exportar }

/// Pantalla principal. Adaptable:
///  * móvil (< 900 px): selector Lista/Mapa y navegación a pantallas completas.
///  * escritorio (>= 900 px): `NavigationRail` y vista dividida (lista + ficha).
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  static const double anchoEscritorio = 900;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  _Vista _vista = _Vista.lista;

  /// Ficha abierta en el panel derecho (escritorio). `_nuevo` indica nido nuevo.
  String? _seleccionadoId;
  bool _nuevo = false;
  int _claveFicha = 0;

  Future<void> _sincronizar() async {
    final app = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final r = await app.sync.sincronizar();
    if (!mounted) return;
    final String msg;
    if (!app.sync.configurado) {
      msg = 'Supabase no está configurado: la app trabaja solo en local.';
    } else if (!r.ok) {
      msg = 'No se pudo sincronizar: ${r.errores.first}';
    } else {
      msg =
          'Sincronizado: ${r.subidos} subido(s), ${r.descargados} descargado(s)'
          '${r.imagenesSubidas > 0 ? ', ${r.imagenesSubidas} foto(s)' : ''}.';
    }
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _abrirNido(
    NidoGrefaModel? nido, {
    required bool escritorio,
  }) async {
    if (escritorio) {
      setState(() {
        _vista = _vista == _Vista.exportar ? _Vista.lista : _vista;
        _seleccionadoId = nido?.id;
        _nuevo = nido == null;
        _claveFicha++;
      });
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<NidoGrefaModel>(
        builder: (_) => NidoDetailScreen(nido: nido),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return LayoutBuilder(
      builder: (context, c) {
        final escritorio = c.maxWidth >= HomeScreen.anchoEscritorio;
        return Scaffold(
          appBar: AppBar(
            title: const Text('GREFA - Campaña Aguilucho'),
            actions: [
              SyncStatusIcon(sync: app.sync),
              if (escritorio)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilledButton.tonalIcon(
                    onPressed: _sincronizar,
                    icon: const Icon(Icons.sync),
                    label: const Text('Sincronizar ahora'),
                  ),
                )
              else ...[
                IconButton(
                  tooltip: 'Sincronizar ahora',
                  icon: const Icon(Icons.sync),
                  onPressed: _sincronizar,
                ),
                IconButton(
                  tooltip: 'Exportar',
                  icon: const Icon(Icons.ios_share),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const ExportScreen(),
                    ),
                  ),
                ),
              ],
            ],
          ),
          floatingActionButton: _vista == _Vista.exportar && escritorio
              ? null
              : FloatingActionButton.extended(
                  onPressed: () => _abrirNido(null, escritorio: escritorio),
                  label: const Text('➕ Nuevo Nido'),
                ),
          body: escritorio ? _cuerpoEscritorio() : _cuerpoMovil(),
        );
      },
    );
  }

  // ---------------------------------------------------------------- móvil

  Widget _cuerpoMovil() {
    final nidos = AppScope.of(context).nidos;
    return ListenableBuilder(
      listenable: nidos,
      builder: (context, _) {
        final esMapa = _vista == _Vista.mapa;
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: SegmentedButton<bool>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(
                    value: false,
                    icon: Icon(Icons.list),
                    label: Text('Lista'),
                  ),
                  ButtonSegment(
                    value: true,
                    icon: Icon(Icons.map),
                    label: Text('Mapa'),
                  ),
                ],
                selected: {esMapa},
                onSelectionChanged: (s) => setState(
                  () => _vista = s.first ? _Vista.mapa : _Vista.lista,
                ),
              ),
            ),
            FiltrosBar(controller: nidos),
            Expanded(
              child: nidos.cargando
                  ? const Center(child: CircularProgressIndicator())
                  : esMapa
                  ? NidosMap(
                      nidos: nidos.filtrados,
                      onAbrirNido: (n) => _abrirNido(n, escritorio: false),
                    )
                  : _lista(nidos.filtrados, escritorio: false),
            ),
          ],
        );
      },
    );
  }

  // ------------------------------------------------------------ escritorio

  Widget _cuerpoEscritorio() {
    final nidos = AppScope.of(context).nidos;
    return Row(
      children: [
        NavigationRail(
          selectedIndex: _vista.index,
          labelType: NavigationRailLabelType.all,
          onDestinationSelected: (i) =>
              setState(() => _vista = _Vista.values[i]),
          destinations: const [
            NavigationRailDestination(
              icon: Icon(Icons.list_alt),
              label: Text('Lista'),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.map),
              label: Text('Mapa'),
            ),
            NavigationRailDestination(
              icon: Icon(Icons.ios_share),
              label: Text('Exportar'),
            ),
          ],
        ),
        const VerticalDivider(width: 1),
        Expanded(
          child: _vista == _Vista.exportar
              ? const ExportScreen(embedded: true)
              : ListenableBuilder(
                  listenable: nidos,
                  builder: (context, _) => _vista == _Vista.lista
                      ? _listaDividida(nidos)
                      : _mapaEscritorio(nidos),
                ),
        ),
      ],
    );
  }

  Widget _listaDividida(NidosController nidos) {
    final seleccionado = _seleccionadoId == null
        ? null
        : nidos.porId(_seleccionadoId!);
    final hayFicha = _nuevo || seleccionado != null;
    return Row(
      children: [
        SizedBox(
          width: 440,
          child: Column(
            children: [
              FiltrosBar(controller: nidos),
              Expanded(
                child: nidos.cargando
                    ? const Center(child: CircularProgressIndicator())
                    : _lista(nidos.filtrados, escritorio: true),
              ),
            ],
          ),
        ),
        const VerticalDivider(width: 1),
        Expanded(
          child: hayFicha
              ? NidoDetailScreen(
                  key: ValueKey('ficha-$_claveFicha'),
                  nido: _nuevo ? null : seleccionado,
                  embedded: true,
                  onGuardado: (n) => setState(() {
                    _nuevo = false;
                    _seleccionadoId = n.id;
                    _claveFicha++;
                  }),
                  onCerrar: () => setState(() {
                    _nuevo = false;
                    _seleccionadoId = null;
                  }),
                )
              : const Center(
                  child: Text('Selecciona un nido o crea uno nuevo'),
                ),
        ),
      ],
    );
  }

  Widget _mapaEscritorio(NidosController nidos) {
    return Column(
      children: [
        FiltrosBar(controller: nidos),
        Expanded(
          child: NidosMap(
            nidos: nidos.filtrados,
            onAbrirNido: (n) {
              setState(() => _vista = _Vista.lista);
              _abrirNido(n, escritorio: true);
            },
          ),
        ),
      ],
    );
  }

  // ----------------------------------------------------------------- lista

  Widget _lista(List<NidoGrefaModel> lista, {required bool escritorio}) {
    if (lista.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'No hay nidos que mostrar.\nPulsa "Nuevo Nido" para registrar el primero.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.only(bottom: 88, top: 4),
      itemCount: lista.length,
      itemBuilder: (_, i) {
        final n = lista[i];
        return NidoCard(
          nido: n,
          seleccionado: escritorio && n.id == _seleccionadoId && !_nuevo,
          onTap: () => _abrirNido(n, escritorio: escritorio),
        );
      },
    );
  }
}
