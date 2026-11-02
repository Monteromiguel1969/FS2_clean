# GREFA · Campaña Aguilucho

Seguimiento reproductor de Aguilucho Cenizo y Pálido (GREFA).

| Carpeta | Qué es |
|---|---|
| [`aguiluchos/`](aguiluchos/README.md) | App Flutter offline-first para operarios de campo (Android/iOS/Windows/macOS/Linux). SQLite local, sincronización con Supabase, exportación Excel/PDF. |
| [`panel-aguiluchos/`](panel-aguiluchos/README.md) | Panel web (Vite) para oficina, desplegable en Vercel. Comparte la tabla `nidos_grefa` de Supabase. |

Ambos usan el mismo esquema: `aguiluchos/supabase/schema.sql`.

**Datos personales:** el Excel de campaña (propietarios, teléfonos) no se versiona. Las claves
de Supabase tampoco: se pasan con `--dart-define` (app) o variables de entorno (panel).
