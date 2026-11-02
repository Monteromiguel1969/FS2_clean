import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/nido_grefa_model.dart';

/// Abre el nido en Google Maps (URL guardada o generada desde coordenadas).
Future<void> abrirEnGoogleMaps(BuildContext context, NidoGrefaModel nido) async {
  final messenger = ScaffoldMessenger.of(context);
  final uri = nido.googleMapsUri;
  if (uri == null) {
    messenger.showSnackBar(const SnackBar(
        content: Text('Este nido no tiene URL ni coordenadas para abrir en el mapa.')));
    return;
  }
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication)
      .catchError((_) => false);
  if (!ok) {
    messenger.showSnackBar(
        SnackBar(content: Text('No se pudo abrir $uri')));
  }
}
