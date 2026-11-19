# Aguiluchos

App **offline-first** para operarios de campo de la ONG **GREFA**: seguimiento del
éxito reproductor de **Aguilucho cenizo** y **Aguilucho pálido**.

* Plataformas: Android, iOS, Windows, macOS (y Linux para desarrollo). Un solo código con
  layout adaptativo (móvil: pestañas y una columna; escritorio/tablet ≥ 900 px: panel
  lateral + mapa, formularios a dos columnas, `NavigationRail` en la ficha).
* Todo se guarda primero en **SQLite local** y se sincroniza con **Supabase** cuando hay
  conexión. Sin Supabase configurado, la app funciona entera en modo solo-local.

## Puesta en marcha

Requisitos: Flutter estable (≥ 3.47, Dart ≥ 3.13). En Linux además `libgtk-3-dev`, `ninja-build`
y `libsqlite3-dev`.

```bash
cd aguiluchos
flutter pub get

# Solo local (sin Supabase)
flutter run

# Con Supabase
flutter run \
  --dart-define=SUPABASE_URL=https://TU-PROYECTO.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJhbGciOi...
```

Los mismos `--dart-define` valen para `flutter build apk`, `flutter build windows`,
`flutter build macos`, `flutter build ios`, etc. Si no se pasan, se usan los placeholders
`TU_SUPABASE_URL` / `TU_SUPABASE_ANON_KEY` y la app arranca en modo solo-local (el icono de
nube muestra "Supabase no configurado").

```bash
flutter analyze
flutter test
flutter build apk --debug --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
```

### Configurar Supabase

1. Crea un proyecto en Supabase.
2. Abre **SQL Editor**, pega y ejecuta [`supabase/schema.sql`](supabase/schema.sql): crea la tabla
   `nidos_grefa`, el trigger de Last-Write-Wins, el bucket público `nidos-fotos` y las políticas RLS.
3. Copia `Project URL` y la clave `anon` (Settings → API) a los `--dart-define`.
4. **Cuentas y acceso** (se comparte con grefa-proyectos: mismo proyecto de Supabase, mismos usuarios):
   * Administrador único: `aquilagestion@grefa.org` (es el único que puede eliminar nidos).
   * El resto se registra solo, desde la app o el panel («Crear cuenta»), con un correo
     `@grefa.org`; confirma el correo con el enlace que recibe y ya puede entrar.
   * «He olvidado mi contraseña» envía un enlace (abre grefa-proyectos para elegir la nueva) y
     «Cambiar contraseña» (menú de la app / botón del panel) la cambia con la sesión iniciada.
   * La sesión se guarda en el dispositivo: solo hace falta internet la primera vez. Sin sesión se
     puede «Trabajar sin conexión (solo local)» y todo lo guardado se sube al iniciar sesión.
5. **Aplicar las reglas en la base de datos**: ejecuta una vez
   [`supabase/activar_acceso_grefa.sql`](supabase/activar_acceso_grefa.sql) en el SQL Editor.
   Retira el acceso con la clave anónima (que va embebida en la APK y en el JavaScript del panel),
   limita la lectura y escritura a correos `@grefa.org`, reserva el borrado al administrador y
   activa Realtime para el panel. `--dart-define=REQUIRE_LOGIN=false` solo sirve para el piloto
   con políticas anónimas.
## Arquitectura

```
lib/
  main.dart                 Arranque: SQLite (FFI en escritorio), Supabase opcional, SyncService
  config/env.dart           --dart-define (SUPABASE_URL / SUPABASE_ANON_KEY)
  app/                      MaterialApp (es_ES, tema) + AppServices (InheritedWidget)
  models/
    nido_grefa_model.dart   NidoGrefaModel + metadatos de las 43 columnas (NidoColumn)
    nido_constants.dart     Catálogos (especies, causas, manejo...), 30 días de incubación
    nido_filter.dart        Filtros de consulta (municipio, estado, texto, fechas)
  services/
    database_service.dart   CRUD SQLite, filtros, borrado lógico, meta de sync
    sync_service.dart       Conectividad, pull/push, imágenes, estado (ChangeNotifier + Stream)
    last_write_wins.dart    Política LWW pura (testeada)
    remote_nidos_gateway.dart  Interfaz del backend + implementación Supabase
    export_service.dart     Excel (.xlsx) y PDF
    image_storage_service.dart / photo_picker.dart / location_service.dart
  screens/                  HomeScreen, NidoDetailScreen, ExportScreen
  widgets/                  ImagePickerWidget, NidosMap, NidoCard, SyncStatusIcon, responsive
supabase/schema.sql         Tabla, trigger, bucket y RLS
```

**Persistencia**: `sqflite` en Android/iOS y `sqflite_common_ffi` en Windows/macOS/Linux (se
elige en `DatabaseService.configureDesktopFactory()`). Se descartó Isar: SQLite + FFI da
un único motor probado en las cuatro plataformas y consultas SQL para los filtros.

**Modelo**: `NidoGrefaModel` agrupa las 43 columnas en 4 fases. La lista `nidoColumns`
(clave snake_case, etiqueta, fase, tipo, getter/setter) es la única fuente de verdad del
esquema SQLite, `toMap/fromMap`, `toJson/fromJson` (Supabase) y del selector de columnas
de exportación. Campos de control: `id` (UUID), `updatedAt`, `isSynced`, `hasConflict`,
`isDeleted` (borrado lógico), `localImagePaths` y `remoteImageUrls` (`imagenes_urls` en
Supabase).

**Coordenadas**: como en el Excel real de campaña ("DATOS FINALES AGUILUCHO 2026"),
`coordenada_x` / `coordenada_y` son **UTM ETRS89 en metros** (Este / Norte). No se guarda el
huso: se infiere del Este (`x >= 550000` → huso 29: Zamora, Salamanca, Galicia; resto → huso 30:
Madrid, Toledo, Guadalajara; válido aprox. entre -8,4° y -0,5° de longitud). `lib/utils/utm.dart`
convierte a WGS84 para el mapa y Google Maps, y el botón "Capturar GPS actual" convierte el GPS a UTM.

**Validación**: `validar()` devuelve errores que bloquean el guardado (etiqueta, negativos,
coordenadas no plausibles, volados + muertos > nacidos, manejo sin intervención) y `advertencias()`
incoherencias que se pueden confirmar con "Guardar de todos modos" (huevos > puesta, éxito sin
volados, fracaso sin causa, eclosión < incubación), porque los datos históricos contienen casos así.

### Importar el Excel de campaña

Menú ⋮ de la pantalla principal → **Importar desde Excel (.xlsx)** (`ExcelImportService`). Localiza
las columnas por el nombre de la cabecera y normaliza los datos sucios del Excel real
(`—`, `--`, `Indet`, `?`; fechas `±12/04/2026` o `05-10/07/2026`; edades `21-19-17`; especies
`A.Cenizo`/`A. pálido`...; causas y estado del fracaso al vocabulario de la app). Lo que no cabe en
columnas tipadas se conserva en *Observaciones II* (texto original de "Tipo de acciones y/o manejo",
fechas aproximadas, edades originales). Los ids son deterministas (UUID v5 sobre la numeración), así
que reimportar no duplica ni pisa ediciones. Los nidos importados quedan pendientes de sincronizar.

**Importación tolerante (v1.8)**: el menú ⋮ usa `ExcelImportService.importarTolerante`, la misma
lógica que el panel web. Las columnas que faltan y las celdas vacías **nunca** machacan datos: un
nido que ya existe (misma numeración o etiqueta, con proyecto y campaña compatibles) solo recibe las
celdas con dato; los que no existen se crean. Cabeceras con ruido (espacios, tildes, plurales,
erratas de una letra) se reconocen igual. **Año / Ano / Anyo / Temporada** se leen como *Campaña*;
si el fichero trae «Campaña» y «Año», manda «Campaña». Los ids nuevos dependen de la campaña
(`aguiluchos-<campaña>/nido/<numeración>`), así que importar el mismo fichero en la app y en el
panel no duplica nidos. Al terminar se muestra qué se ha creado, completado y qué columnas no venían.

Prueba contra el fichero real (no versionado, tiene datos personales):

```bash
AGUILUCHOS_XLSX=/ruta/DATOS_FINALES.xlsx flutter test test/excel_import_test.dart
```

### Sincronización y Last-Write-Wins

`SyncService.syncNow()` se dispara al recuperar conexión (`connectivity_plus`), al guardar un
nido, al volver la app a primer plano, **cada minuto** (suba lo pendiente y baje lo que otros
hayan cambiado en el panel web, aunque no haya cambios locales) y desde el botón **Sincronizar
ahora**. Requiere sesión iniciada (ver "Configurar Supabase"). Ciclo:

1. **Pull incremental**: descarga filas con `server_updated_at >= cursor` (paginado). El cursor
   se guarda en la tabla local `sync_meta`. Se usa `server_updated_at` (la pone un trigger con
   la hora del servidor) y no `updated_at` porque un nido editado offline a las 09:00 y subido
   a las 15:00 tendría un `updated_at` anterior al cursor de otro dispositivo y nunca se vería.
2. **Push**: por cada registro con `isSynced == false`, sube primero las fotos de
   `localImagePaths` aún no subidas al bucket `nidos-fotos` (`<id_nido>/<categoria>_<uuid>.jpg`),
   guarda las URLs públicas en `remoteImageUrls` y hace `upsert` en `nidos_grefa`.
   Las copias locales de las fotos se conservan para verlas sin conexión.

**Resolución de conflictos (LWW por `updatedAt`)**, en `last_write_wins.dart`:

| Situación | Resultado |
|---|---|
| No existe copia local | Se toma la remota |
| Local sincronizada, remota más reciente | Se toma la remota (sin conflicto) |
| Local sincronizada, remota igual/antigua | Se conserva la local (eco de nuestro push) |
| **Local con cambios pendientes y remota más reciente** | **Gana la remota y se marca `hasConflict = true`** (se descartó una edición local) |
| Local con cambios pendientes y local más reciente/igual | Gana la local y se sube (sin conflicto) |

`hasConflict` solo indica que se perdió una edición local sin subir; el nido muestra un aviso
(icono en la tarjeta y banner en la ficha) hasta que el operario lo revisa o vuelve a guardar.
El trigger SQL añade una red de seguridad en servidor: una escritura con `updated_at` anterior
al almacenado se descarta y el `upsert` devuelve la fila ganadora; el cliente la detecta y
también la trata como conflicto (carrera entre dos operarios). **El panel web (Vercel) debe
enviar `updated_at = now()` en cada edición** para participar en el LWW.

Los borrados son lógicos (`is_deleted`): se propagan como tombstone, se purgan localmente tras
subirse y las demás apps eliminan su copia al recibirlos.

Estado expuesto: `SyncService.state` / `stateStream` / `ChangeNotifier` con
`SyncStatus.synced | pending | syncing`, nº de pendientes, última sync, último error,
`isOnline` e `isConfigured`. El icono de nube es verde (sincronizado), naranja (pendiente /
sin configurar) o muestra un indicador de progreso.

### Fotos

`ImagePickerWidget` (pestañas Seguimiento y Cosecha) copia cada foto a
`<documentos de la app>/aguiluchos_fotos/<categoria>_<uuid>.<ext>` y guarda la ruta en
`localImagePaths`. Cámara en móvil con `image_picker`; en escritorio no hay API de cámara
fiable, así que "Tomar Fotografía" abre el selector de archivos. Tocar una miniatura la abre a
pantalla completa (zoom) con opción de eliminar.

### Proyecto y campaña

Son dos campos distintos de `nidos_grefa` (`proyecto` y `campana`, texto). La lista, el mapa y la
exportación tienen filtro de proyecto y de campaña, con la opción «Sin proyecto» / «Sin campaña».
Los nidos anteriores a este campo (o importados sin él) se tratan como **sin campaña**; la app no
inventa ninguna. Base local v2: `onUpgrade` añade la columna `campana`. Para sincronizarla con Supabase
hay que haber ejecutado `supabase/migracion_campana.sql`; si aún no está, la app sigue sincronizando
el resto de campos y conserva la campaña en el dispositivo (sin subirla).

### Mapa: fondo Mapa u Ortofoto

El mapa de la pantalla principal y los mapas de los informes se pueden ver sobre **Mapa (OSM)** u
**Ortofoto (PNOA, IGN)**. La elección se recuerda en el dispositivo (`sync_meta`, no se sincroniza).
Los mapas del informe y de la presentación encuadran solo los nidos de la selección filtrada
(comunidad, provincia, localidad…) y se titulan con el nivel geográfico más concreto filtrado.

### Presentación PowerPoint (.pptx)

En el cuadro del informe técnico (Exportar → Informe técnico) el botón **PowerPoint (.pptx)** genera
la presentación con lo mismo que el informe: nidos de la selección, título, referencia, destinatario,
elaborado por, cargo, secciones activables, mapas general / comunidad / provincia / localidad con el
fondo elegido y textos editables (alcance y observaciones). Solo lleva lo marcado. No incluye
propietario, teléfono ni referencia catastral; las celdas sin dato quedan en blanco. Se entrega con
«Guardar en…» o compartiendo (`share_plus`). El `.pptx` se escribe en el propio dispositivo
(`presentacion_pptx.dart`, Open XML con `archive`); no usa Colab ni servidores. Los gráficos del
resumen (resultado, pollos, tasas, causas) son barras dibujadas con formas, no gráficos nativos
editables de PowerPoint.

### Exportación

`ExportScreen`: filtros (rango de campaña sobre la fecha de entrada/incubación, proyecto, campaña,
municipios, Éxito/Fracaso/Todos), selector de las 43 columnas agrupadas por fase, **Excel (.xlsx)** con las
columnas elegidas e **informe PDF** (membrete GREFA, resumen ejecutivo con nacidos / volados /
muertos, tasa de éxito, productividad, causas de fracaso y tabla de nidos con justificación de
conservación). Compartir con `share_plus` (WhatsApp, correo…) o guardar en el dispositivo; en
escritorio "Guardar" abre el diálogo del sistema y en Linux (donde `share_plus` no soporta
archivos) se ofrece guardar.

## Plataformas y permisos

* **Android**: `applicationId` `org.grefa.aguiluchos`, etiqueta "Aguiluchos"; permisos `INTERNET`,
  `ACCESS_NETWORK_STATE`, `CAMERA`, `ACCESS_FINE/COARSE_LOCATION`.
* **iOS**: `CFBundleDisplayName` "Aguiluchos" y textos `NSCameraUsageDescription`,
  `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`.
* **macOS**: entitlements de red, selección de archivos, ubicación y cámara.
* **Windows/Linux**: título de ventana y recursos "Aguiluchos".

## Limitaciones conocidas

* El mapa usa teselas de OpenStreetMap o de la ortofoto PNOA del IGN: sin conexión solo se ven las
  teselas ya cacheadas (los marcadores sí aparecen). Para uso intensivo conviene un proveedor de
  teselas propio.
* La presentación .pptx no incluye fotografías de los nidos.
* La captura de GPS no funciona en Linux (sin soporte de `geolocator`); se pueden teclear las
  coordenadas UTM.
* La app no gestiona usuarios: se crean en el panel de Supabase (ver "Configurar Supabase").
* Las fotos eliminadas en la app se quitan de la ficha pero no del bucket de Storage.

## APK con los datos de la campaña y script de Windows

- `assets/seed/datos_campana.xlsx` (ignorado por git: contiene datos personales) se empaqueta en la APK
  y se importa **una sola vez** en el primer arranque (`SeedService`). Sin ese fichero la app arranca vacía.
- `scripts/compilar_e_instalar.ps1` compila `app-release.apk`, la deja en `C:\AGUILUCHO\aguiluchos.apk`,
  copia una versión en `C:\AGUILUCHO\Releases\` y la instala por USB con `adb`:

```powershell
.\scripts\compilar_e_instalar.ps1 -Excel "C:\ruta\DATOS_FINALES_AGUILUCHO_2026_GREFA.xlsx" `
    -SupabaseUrl "https://xxxx.supabase.co" -SupabaseAnonKey "eyJ..."
```
