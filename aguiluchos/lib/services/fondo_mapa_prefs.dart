import '../models/mapa_fondo.dart';
import 'database_service.dart';

/// Fondo de mapa recordado (tabla `sync_meta`, no se sincroniza). OSM si no hay o falla.
Future<MapaFondo> leerFondoMapa(DatabaseService db) async {
  try {
    return MapaFondo.desdeId(await db.leerMeta(MapaFondo.claveMeta));
  } catch (_) {
    return MapaFondo.osm;
  }
}

Future<void> guardarFondoMapa(DatabaseService db, MapaFondo fondo) async {
  try {
    await db.escribirMeta(MapaFondo.claveMeta, fondo.id);
  } catch (_) {}
}
