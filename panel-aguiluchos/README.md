# Panel web GREFA · Campaña Aguilucho

Panel para oficina (Vercel + Supabase) que comparte la tabla `nidos_grefa` con la app móvil
`aguiluchos/`. Vite + JavaScript, sin framework; Leaflet para el mapa.

**Funciones:** KPIs (nidos, éxito/fracaso/en curso, tasa de éxito, nacidos/volados/muertos), causas de
fracaso, filtros (texto, ubicación, especie, proyecto, campaña, estado), tabla ordenable, mapa (UTM → WGS84),
ficha completa de 43 campos en 4 fases (crear, editar, eliminar), exportación CSV eligiendo los campos por fase (Excel es_ES), importación tolerante de Excel (.xlsx) y login
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

* `VITE_REQUIRE_LOGIN=true` (recomendado): el panel pide correo y contraseña. Los usuarios son los
  de grefa-proyectos (mismo proyecto de Supabase). El administrador único es
  `aquilagestion@grefa.org` (el único que ve el botón «Eliminar»); el resto se registra con «Crear
  cuenta» usando un correo `@grefa.org`. Incluye «He olvidado mi contraseña» y «Cambiar
  contraseña». Las reglas en la base de datos están en `aguiluchos/supabase/activar_acceso_grefa.sql`.
* `VITE_REQUIRE_LOGIN=false`: sin login, solo para el piloto (necesita las políticas `anon` de
  `aguiluchos/supabase/piloto_anon.sql`; los datos personales quedarían públicos).

## Sincronización con la app

Cada edición envía `updated_at = now()`. Un trigger de Postgres aplica Last-Write-Wins: si otra persona
guardó antes una versión más reciente, el servidor conserva la suya y el panel te avisa. Eliminar marca
`is_deleted = true` (la app lo recoge en su siguiente sincronización).

**Tiempo real:** el panel se suscribe a Supabase Realtime (`postgres_changes` sobre `nidos_grefa`):
lo que la app de campo sube al sincronizar aparece al instante (indicador «● En vivo» en la cabecera),
sin recargar. Requiere ejecutar una vez `aguiluchos/supabase/activar_acceso_grefa.sql`. Si Realtime no está
disponible, el panel lo indica y relee los datos cada 90 s.

## Limitaciones

* No sube ni muestra fotos (`imagenes_urls`) todavía.
* Exportación solo CSV; para PDF/Excel con formato usa la app.

## Proyecto, campaña e importación de Excel

* **Proyecto** (línea de trabajo) y **campaña** (tanda dentro del proyecto) son campos distintos, con selectores propios.
  La campaña requiere ejecutar una vez `aguiluchos/supabase/migracion_campana.sql` en el SQL Editor de Supabase;
  hasta entonces el panel funciona sin ese campo.
* **Importar Excel (.xlsx)**: la primera fila son las cabeceras; se emparejan por nombre (etiqueta del formulario o nombre
  de campo, sin importar acentos ni paréntesis). Columna o celda que falta = campo en blanco; columnas de más se ignoran;
  nunca se borra ningún nido; proyecto y campaña solo se asignan si el fichero trae esas columnas. Se enseña una vista
  previa antes de aplicar. Un nido ya existente (misma numeración o etiqueta, y proyecto/campaña compatibles) solo se completa.

## Contratos, parcelas y propietarios

1. Ejecuta una vez `aguiluchos/supabase/contratos_parcelas.sql` en el SQL Editor de Supabase (crea tablas, permisos, bucket privado `contratos` y el catálogo de ayudas).
2. Botón **Contratos** del panel: convenios, parcelas, propietarios, compensación y catálogo de ayudas. En cada nido, bloque «Parcela y contrato» y semáforo (columna, filtro y color del mapa).
3. Convenios nuevos: «Borrador del convenio» genera el documento editable (PDF / Word) con los datos. Convenios ya firmados: **Contratos → «Leer convenios firmados»** (uno o varios PDF/fotos). La función pi/extraer-contrato.mjs (raíz del repo) los lee con Mistral (OCR + extracción) y propone titular, parcelas, ayudas e importe; se asocian solos a propietarios (NIF/nombre), parcelas (SIGPAC) y nidos (nombre o teléfono del propietario) ya registrados, y tú revisas cada convenio antes de guardar. Requiere la variable **solo de servidor** MISTRAL_API_KEY en Vercel (opcionales MISTRAL_OCR_MODEL, MISTRAL_MODEL). El PDF se guarda en el bucket privado y el IBAN solo con sus 4 últimos dígitos.
