import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../models/nido_grefa_model.dart';
import 'maps_launcher.dart';
import 'nido_card.dart';

/// Mapa (OpenStreetMap vía flutter_map, válido en móvil y escritorio) con un
/// marcador por nido con coordenadas. Al pulsar un marcador se muestra una
/// ficha con el botón "Abrir en Google Maps".
class NidosMap extends StatefulWidget {
  const NidosMap({super.key, required this.nidos, required this.onOpenNido});

  final List<NidoGrefaModel> nidos;
  final ValueChanged<NidoGrefaModel> onOpenNido;

  @override
  State<NidosMap> createState() => _NidosMapState();
}

class _NidosMapState extends State<NidosMap> {
  final _controller = MapController();
  bool _ready = false;
  String? _selectedId;
  String _lastFitKey = '';

  List<NidoGrefaModel> get _conCoordenadas =>
      widget.nidos.where((n) => n.tieneCoordenadas).toList();

  LatLng _pos(NidoGrefaModel n) {
    final p = n.latLon!;
    return LatLng(p.lat, p.lon);
  }

  @override
  void didUpdateWidget(NidosMap old) {
    super.didUpdateWidget(old);
    _fitIfNeeded();
  }

  void _fitIfNeeded() {
    if (!_ready) return;
    final key = _conCoordenadas.map((n) => n.id).join(',');
    if (key == _lastFitKey) return;
    _lastFitKey = key;
    final pts = _conCoordenadas.map(_pos).toList();
    if (pts.isEmpty) return;
    if (pts.length == 1) {
      _controller.move(pts.first, 14);
    } else {
      _controller.fitCamera(CameraFit.coordinates(
          coordinates: pts, padding: const EdgeInsets.all(48), maxZoom: 15));
    }
  }

  @override
  Widget build(BuildContext context) {
    final nidos = _conCoordenadas;
    NidoGrefaModel? selected;
    for (final n in nidos) {
      if (n.id == _selectedId) selected = n;
    }
    return Stack(
      children: [
        FlutterMap(
          mapController: _controller,
          options: MapOptions(
            initialCenter: nidos.isEmpty ? const LatLng(40.4, -3.7) : _pos(nidos.first),
            initialZoom: nidos.isEmpty ? 5.5 : 10,
            onMapReady: () {
              _ready = true;
              _fitIfNeeded();
            },
            onTap: (_, _) => setState(() => _selectedId = null),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'org.grefa.aguiluchos',
            ),
            MarkerLayer(markers: [
              for (final n in nidos)
                Marker(
                  point: _pos(n),
                  width: 44,
                  height: 44,
                  alignment: Alignment.topCenter,
                  child: GestureDetector(
                    onTap: () => setState(() => _selectedId = n.id),
                    child: Icon(
                      Icons.location_on,
                      size: n.id == _selectedId ? 44 : 36,
                      color: colorEstado(n.estadoReproductivo),
                    ),
                  ),
                ),
            ]),
            const RichAttributionWidget(attributions: [
              TextSourceAttribution('© OpenStreetMap contributors'),
            ]),
          ],
        ),
        if (nidos.isEmpty)
          const Positioned(
            top: 12,
            left: 12,
            right: 12,
            child: Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text('Ningún nido de la lista tiene coordenadas GPS.'),
              ),
            ),
          ),
        if (selected != null)
          Positioned(
            left: 12,
            right: 12,
            bottom: 24,
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: _MarkerPopup(
                  nido: selected,
                  onClose: () => setState(() => _selectedId = null),
                  onOpen: () => widget.onOpenNido(selected!),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _MarkerPopup extends StatelessWidget {
  const _MarkerPopup({required this.nido, required this.onClose, required this.onOpen});

  final NidoGrefaModel nido;
  final VoidCallback onClose;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      elevation: 6,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(
                child: Text(nido.etiqueta ?? '(sin etiqueta)',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w600)),
              ),
              IconButton(
                  visualDensity: VisualDensity.compact,
                  onPressed: onClose,
                  icon: const Icon(Icons.close)),
            ]),
            Text([
              if ((nido.municipio ?? '').isNotEmpty) nido.municipio!,
              if ((nido.especie ?? '').isNotEmpty) nido.especie!,
              nido.estadoReproductivo.etiqueta,
            ].join(' · ')),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 4, children: [
              FilledButton.icon(
                onPressed: () => abrirEnGoogleMaps(context, nido),
                icon: const Icon(Icons.map),
                label: const Text('Abrir en Google Maps'),
              ),
              OutlinedButton.icon(
                onPressed: onOpen,
                icon: const Icon(Icons.edit_note),
                label: const Text('Ver ficha'),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}
