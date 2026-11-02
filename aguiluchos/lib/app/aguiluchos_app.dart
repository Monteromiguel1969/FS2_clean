import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../screens/home_screen.dart';
import '../services/database_service.dart';
import '../services/export_service.dart';
import '../services/image_storage_service.dart';
import '../services/location_service.dart';
import '../services/sync_service.dart';
import 'app_services.dart';

class AguiluchosApp extends StatelessWidget {
  const AguiluchosApp({
    super.key,
    required this.db,
    required this.sync,
    this._images,
    this._location,
    this._export,
  });

  final DatabaseService db;
  final SyncService sync;
  final ImageStorageService? _images;
  final LocationService? _location;
  final ExportService? _export;

  static const verdeGrefa = Color(0xFF2E7D32);

  @override
  Widget build(BuildContext context) {
    return AppServices(
      db: db,
      sync: sync,
      images: _images ?? ImageStorageService(),
      location: _location ?? LocationService(),
      export: _export ?? ExportService(),
      child: MaterialApp(
        title: 'Aguiluchos',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: verdeGrefa),
          visualDensity: VisualDensity.adaptivePlatformDensity,
          inputDecorationTheme: const InputDecorationTheme(
            border: OutlineInputBorder(),
            isDense: true,
          ),
        ),
        locale: const Locale('es', 'ES'),
        supportedLocales: const [Locale('es', 'ES')],
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
