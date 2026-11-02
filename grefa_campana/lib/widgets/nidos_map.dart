import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../logic/mapas.dart';
import '../models/nido_grefa_model.dart';
import 'nido_card.dart';

/// Mapa OpenStreetMap con un marcador por nido que tenga coordenadas.
/// Al pulsar un marcador aparece un popup con "Abrir en Google Maps".
class NidosMap extends StatefulWidget {
  const NidosMap({super.key, required this.nidos, required this.onAbrirNido});

  final List<NidoGrefaModel> nidos;
  final ValueChanged<NidoGrefaModel> onAbrirNido;

  @override
  State<NidosMap> createState() => _NidosMapState();
}

class _NidosMapState extends State<NidosMap> {
  final MapController _controller = MapController();
  String? _seleccionadoId;

  static const LatLng _centroEspana = LatLng(40.0, -3.7);

  List<NidoGrefaModel> get _conCoordenadas =>
      widget.nidos.where((n) => n.tieneCoordenadas).toList();

  LatLng _punto(NidoGrefaModel n) => LatLng(n.coordenadaY!, n.coordenadaX!);

  NidoGrefaModel? get _seleccionado {
    for (final n in _conCoordenadas) {
      if (n.id == _seleccionadoId) return n;
    }
    return null;
  }

  @override
  void didUpdateWidget(NidosMap old) {
    super.didUpdateWidget(old);
    final antes = old.nidos
        .where((n) => n.tieneCoordenadas)
        .map((n) => n.id)
        .toSet();
    final ahora = _conCoordenadas.map((n) => n.id).toSet();
    if (antes.length == ahora.length && antes.containsAll(ahora)) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final puntos = _conCoordenadas.map(_punto).toList();
      if (!mounted || puntos.isEmpty) return;
      try {
        _controller.fitCamera(
          puntos.length == 1
              ? CameraFit.coordinates(
                  coordinates: [puntos.first, puntos.first],
                  maxZoom: 13,
                )
              : CameraFit.coordinates(
                  coordinates: puntos,
                  padding: const EdgeInsets.all(48),
                  maxZoom: 15,
                ),
        );
      } catch (_) {
        // el mapa aún no está listo; se mantiene la cámara actual
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final con = _conCoordenadas;
    final sinCoord = widget.nidos.length - con.length;
    final puntos = con.map(_punto).toList();
    final sel = _seleccionado;

    return Stack(
      children: [
        FlutterMap(
          mapController: _controller,
          options: MapOptions(
            initialCenter: puntos.length == 1 ? puntos.first : _centroEspana,
            initialZoom: puntos.length == 1 ? 13 : 6,
            initialCameraFit: puntos.length > 1
                ? CameraFit.coordinates(
                    coordinates: puntos,
                    padding: const EdgeInsets.all(48),
                    maxZoom: 15,
                  )
                : null,
            onTap: (_, _) => setState(() => _seleccionadoId = null),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'org.grefa.grefa_campana',
              errorTileCallback: (_, _, _) {},
            ),
            MarkerLayer(
              markers: [
                for (final n in con)
                  Marker(
                    point: _punto(n),
                    width: 44,
                    height: 44,
                    alignment: Alignment.topCenter,
                    child: GestureDetector(
                      key: Key('marcador-${n.id}'),
                      onTap: () => setState(() => _seleccionadoId = n.id),
                      child: Icon(
                        Icons.location_on,
                        size: n.id == _seleccionadoId ? 44 : 38,
                        color: colorEstado(n.estadoReproductivo),
                        shadows: const [
                          Shadow(blurRadius: 4, color: Colors.black54),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const RichAttributionWidget(
              attributions: [
                TextSourceAttribution('© colaboradores de OpenStreetMap'),
              ],
            ),
          ],
        ),
        Positioned(
          left: 12,
          top: 12,
          child: Card(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Text(
                '${con.length} nido(s) en el mapa'
                '${sinCoord > 0 ? ' · $sinCoord sin coordenadas' : ''}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ),
        ),
        if (sel != null)
          Positioned(
            left: 12,
            right: 12,
            bottom: 24,
            child: Align(
              alignment: Alignment.bottomCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: _PopupNido(
                  nido: sel,
                  onCerrar: () => setState(() => _seleccionadoId = null),
                  onEditar: () => widget.onAbrirNido(sel),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _PopupNido extends StatelessWidget {
  const _PopupNido({
    required this.nido,
    required this.onCerrar,
    required this.onEditar,
  });

  final NidoGrefaModel nido;
  final VoidCallback onCerrar;
  final VoidCallback onEditar;

  @override
  Widget build(BuildContext context) {
    final url = urlGoogleMaps(nido);
    final estado = nido.estadoReproductivo;
    return Card(
      key: const Key('popup-nido'),
      elevation: 6,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    nido.titulo,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                IconButton(
                  tooltip: 'Cerrar',
                  icon: const Icon(Icons.close),
                  onPressed: onCerrar,
                ),
              ],
            ),
            Text(
              [
                if ((nido.municipio ?? '').isNotEmpty) nido.municipio!,
                if ((nido.especie ?? '').isNotEmpty) nido.especie!,
              ].join(' · '),
            ),
            const SizedBox(height: 4),
            Text(
              'Estado: ${estado.etiqueta}'
              '${nido.intervencion ? ' · con intervención' : ''}',
              style: TextStyle(
                color: colorEstado(estado),
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                FilledButton.icon(
                  onPressed: url == null
                      ? null
                      : () => launchUrl(
                          url,
                          mode: LaunchMode.externalApplication,
                        ),
                  icon: const Icon(Icons.map),
                  label: const Text('Abrir en Google Maps'),
                ),
                OutlinedButton.icon(
                  onPressed: onEditar,
                  icon: const Icon(Icons.edit),
                  label: const Text('Ver ficha'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
