import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'config/env.dart';
import 'services/connectivity_monitor.dart';
import 'services/database_service.dart';
import 'services/image_storage_service.dart';
import 'services/nidos_remote.dart';
import 'services/sync_service.dart';
import 'state/nidos_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('es');

  DatabaseService.inicializarFactoriaPlataforma();
  final db = await DatabaseService.abrir();
  final imagenes = ImageStorageService();
  await imagenes.directorio;

  // Supabase es opcional: sin URL/clave válidas la app trabaja solo en local.
  NidosRemote? remote;
  if (Env.supabaseConfigurado) {
    try {
      await Supabase.initialize(
        url: Env.supabaseUrl,
        publishableKey: Env.supabaseAnonKey,
      );
      remote = SupabaseNidosRemote(Supabase.instance.client);
    } catch (e) {
      debugPrint('Supabase no se pudo inicializar: $e');
    }
  } else {
    debugPrint(
      'Supabase sin configurar (--dart-define=SUPABASE_URL/SUPABASE_ANON_KEY): '
      'modo solo local.',
    );
  }

  final sync = SyncService(
    db: db,
    remote: remote,
    connectivity: crearMonitorConectividad(),
    resolverRuta: imagenes.resolverSincrono,
  );
  final nidos = NidosController(db: db, sync: sync);
  await nidos.cargar();
  unawaited(sync.iniciar());

  runApp(GrefaApp(db: db, sync: sync, nidos: nidos, imagenes: imagenes));
}
