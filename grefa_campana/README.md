# GREFA · Campaña Aguilucho

App Flutter **offline-first** y multiplataforma (Android, iOS, Windows, macOS; también compila en Linux)
para los operarios de campo de GREFA: seguimiento reproductor de Aguilucho Cenizo y Pálido.
Todo se guarda primero en una BD local SQLite y se sincroniza con Supabase cuando hay conexión.

## Arquitectura

```
lib/
  main.dart                 arranque: BD local, Supabase opcional, SyncService
  app.dart                  MaterialApp + AppScope (inyección de dependencias)
  config/env.dart           --dart-define (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_BUCKET)
  models/
    nido_grefa_model.dart   NidoGrefaModel: toJson/fromJson (remoto) y toMap/fromMap (SQLite)
    nido_campo.dart         catálogo de los 42 campos (clave, etiqueta, fase, tipo, accesores)
  logic/                    lógica pura y testeada
    lww.dart                Last-Write-Wins por updatedAt + detección de conflicto
    eclosion.dart           fecha estimada de eclosión (incubación + 30 días), edad de pollos
    exportacion.dart        filtros, resumen ejecutivo y justificación de conservación
  services/
    database_service.dart  SQLite (sqflite en móvil/macOS, sqflite_common_ffi en Windows/Linux)
    sync_service.dart       ciclo: descarga + LWW -> subida de fotos -> upsert de pendientes
    nidos_remote.dart       contrato remoto + implementación Supabase (PostgREST y Storage)
    export_service.dart     Excel (.xlsx) y PDF; guardado y share_plus
    image_storage_service.dart, location_service.dart, connectivity_monitor.dart
  screens/                  HomeScreen, NidoDetailScreen (4 pestañas), ExportScreen
  widgets/                  ImagePickerWidget, mapa (flutter_map/OSM), filtros, tarjetas
supabase/schema.sql         tabla nidos_grefa, trigger LWW, RLS, bucket y políticas
test/                       82+ tests (modelo, LWW, eclosión, BD, sync, export, UI)
```

Puntos clave:

- **42 campos en 4 fases** (F1 ubicación, F2 puesta, F3 seguimiento, F4 cosecha) + control:
  `id` (UUID), `updatedAt`, `isSynced`, `hasConflict`, `localImagePaths`, `imageUrls`.
  `coordenada_x` = longitud y `coordenada_y` = latitud (WGS84).
- **Guardar** => `isSynced = false` y `updatedAt = ahora (UTC)`; después se dispara la sync en segundo plano.
- **Sincronización** (al recuperar conexión, tras guardar, cada 5 min y con "Sincronizar ahora"):
  1. Descarga filas con `updated_at >=` último cursor y aplica **Last-Write-Wins** por `updatedAt`.
     Si el nido tenía cambios locales y el servidor también cambió desde la última sync, gana el más
     reciente y se marca `hasConflict = true` (aviso en la tarjeta y banner en la ficha).
  2. Sube las fotos de `localImagePaths` a Storage (`<id_nido>/<archivo>`) y guarda su URL pública en `imageUrls`.
  3. `upsert` en `nidos_grefa` de los registros con `isSynced == false`. El servidor (trigger) rechaza
     escrituras más antiguas que la almacenada.
- Las fotos se copian a un directorio persistente de la app y se nombran `<etapa>_<uuid>.<ext>`
  (`seguimiento` / `cosecha`) para mostrarlas en su pestaña.
- Sin Supabase configurado la app funciona igual en modo solo local (icono de nube gris/naranja).

## Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor** ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql)
   (crea la tabla `nidos_grefa`, el trigger LWW, RLS, el bucket público `nidos-fotos` y sus políticas).
   Es idempotente.
3. Copia la **URL** y la clave **anon/publishable** de *Project Settings -> API*.
4. Ejecuta la app pasando las claves en compilación:

```bash
flutter run -d windows \
  --dart-define=SUPABASE_URL=https://xxxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJ...
# opcional: --dart-define=SUPABASE_BUCKET=nidos-fotos
```

Lo mismo con `flutter build apk|ipa|windows|macos`. Sin `--dart-define` se usan los placeholders
`TU_SUPABASE_URL` / `TU_SUPABASE_ANON_KEY` y la app arranca en modo offline.

> **Seguridad:** la app no tiene login y usa la clave anon, por lo que las políticas de `schema.sql`
> abren lectura/escritura (sin borrado) a quien posea esa clave. Para producción activa Supabase Auth y
> cambia `to anon, authenticated` por `to authenticated` en las políticas.
>
> **Panel web (Vercel):** puede leer/escribir la misma tabla. Si modifica una fila sin cambiar
> `updated_at`, el trigger lo avanza para que los móviles reciban el cambio.

## Desarrollo

```bash
flutter pub get
flutter analyze
flutter test
flutter run -d <android|ios|windows|macos|linux>
```

Requisitos por plataforma: Android Studio/SDK (Android), Xcode (iOS/macOS), Visual Studio con
"Desarrollo para el escritorio con C++" (Windows). Permisos ya declarados: ubicación, cámara,
galería, red (ver `AndroidManifest.xml`, `Info.plist` y `*.entitlements`).

## Limitaciones conocidas

- Los mosaicos del mapa (OpenStreetMap) se descargan en línea; sin conexión se ven los marcadores pero no el fondo.
  Para uso intensivo conviene un proveedor de teselas propio/cacheado (política de uso de OSM).
- El PDF usa la fuente Helvetica estándar (cubre el español; no caracteres fuera de Latin-1).
- Las fotos eliminadas en la app se quitan de la ficha pero no se borran de Supabase Storage.
- No hay borrado de nidos ni autenticación de operarios (ver nota de seguridad).
- En escritorio sin cámara, "Tomar Fotografía" abre el selector de archivos.
