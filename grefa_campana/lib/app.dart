import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'screens/home_screen.dart';
import 'services/database_service.dart';
import 'services/image_storage_service.dart';
import 'services/sync_service.dart';
import 'state/app_scope.dart';
import 'state/nidos_controller.dart';

class GrefaApp extends StatelessWidget {
  const GrefaApp({
    super.key,
    required this.db,
    required this.sync,
    required this.nidos,
    required this.imagenes,
  });

  final DatabaseService db;
  final SyncService sync;
  final NidosController nidos;
  final ImageStorageService imagenes;

  static const Color verdeGrefa = Color(0xFF2E6B3A);

  @override
  Widget build(BuildContext context) {
    return AppScope(
      db: db,
      sync: sync,
      nidos: nidos,
      imagenes: imagenes,
      child: MaterialApp(
        title: 'GREFA - Campaña Aguilucho',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: verdeGrefa),
          useMaterial3: true,
          inputDecorationTheme: const InputDecorationTheme(
            border: OutlineInputBorder(),
            isDense: true,
          ),
          visualDensity: VisualDensity.adaptivePlatformDensity,
        ),
        locale: const Locale('es'),
        supportedLocales: const [Locale('es'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: const HomeScreen(),
      ),
    );
  }
}
