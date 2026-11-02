# Panel web GREFA · Campaña Aguilucho

Panel para oficina (Vercel + Supabase) que comparte la tabla `nidos_grefa` con la app móvil
`aguiluchos/`. Vite + JavaScript, sin framework; Leaflet para el mapa.

**Funciones:** KPIs (nidos, éxito/fracaso/en curso, tasa de éxito, nacidos/volados/muertos), causas de
fracaso, filtros (texto, municipio, especie, proyecto, estado), tabla ordenable, mapa (UTM → WGS84),
ficha completa de 42 campos en 4 fases (crear, editar, eliminar), exportación CSV (Excel es_ES) y login
con Supabase Auth.

## Puesta en marcha local

```bash
cd panel-aguiluchos
cp .env.example .env.local      # rellena URL y anon key
npm install
npm run dev                     # http://localhost:5173
npm test                        # lógica: UTM, filtros, resumen, CSV
```

## Despliegue en Vercel

1. En <https://vercel.com/grefa> → **Add New… → Project** → importa el repositorio de GitHub.
2. **Root Directory:** `panel-aguiluchos` (Framework: Vite; ya hay `vercel.json`).
3. **Environment Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_REQUIRE_LOGIN=true`.
4. Deploy. La URL será `https://<nombre-del-proyecto>.vercel.app` (puedes asignar un dominio propio).

La anon key es pública por diseño (va en el JavaScript del navegador); **nunca** uses la `service_role`.

## Acceso

* `VITE_REQUIRE_LOGIN=true` (recomendado): el panel pide correo y contraseña. Crea los usuarios en
  Supabase → Authentication → Users → *Add user* (marca "Auto Confirm User"). Las políticas RLS de
  `authenticated` están en `aguiluchos/supabase/schema.sql`.
* `VITE_REQUIRE_LOGIN=false`: sin login, solo para el piloto (necesita las políticas `anon` de
  `aguiluchos/supabase/piloto_anon.sql`; los datos personales quedarían públicos).

## Sincronización con la app

Cada edición envía `updated_at = now()`. Un trigger de Postgres aplica Last-Write-Wins: si otra persona
guardó antes una versión más reciente, el servidor conserva la suya y el panel te avisa. Eliminar marca
`is_deleted = true` (la app lo recoge en su siguiente sincronización). El panel se refresca solo cada 90 s.

## Limitaciones

* No sube ni muestra fotos (`imagenes_urls`) todavía.
* Sin tiempo real (Realtime): se actualiza por sondeo.
* Exportación solo CSV; para PDF/Excel con formato usa la app.
