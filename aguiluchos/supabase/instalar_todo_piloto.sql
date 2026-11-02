-- =============================================================================
-- Aguiluchos (GREFA) - esquema Supabase
-- Ejecutar completo en: Supabase Dashboard > SQL Editor.
-- Es idempotente: se puede volver a lanzar.
-- =============================================================================

-- 1) Tabla principal ----------------------------------------------------------
create table if not exists public.nidos_grefa (
  id uuid primary key,

  -- Fase 1: ubicación e identificación (14)
  numeracion            text,
  etiqueta              text,
  proyecto              text,
  propietario           text,
  tlfn                  text,
  google_maps_url       text,
  municipio             text,
  provincia             text,
  referencia_catastral  text,
  especie               text,
  territorio            text,
  coordenada_x          double precision,   -- UTM ETRS89 Este (m); huso 29/30 inferido por la app
  coordenada_y          double precision,   -- UTM ETRS89 Norte (m)
  sustrato              text,

  -- Fase 2: incubación (5)
  fecha_incubacion      date,
  fecha_eclosion        date,
  num_huevos_entrada    integer check (num_huevos_entrada is null or num_huevos_entrada >= 0),
  tamano_puesta         integer check (tamano_puesta is null or tamano_puesta >= 0),
  fecha_entrada_nido    date,

  -- Fase 3: seguimiento y manejo (9)
  num_pollos_nacidos          integer check (num_pollos_nacidos is null or num_pollos_nacidos >= 0),
  num_huevos_no_eclosionados  integer check (num_huevos_no_eclosionados is null or num_huevos_no_eclosionados >= 0),
  edad_dias                   integer check (edad_dias is null or edad_dias >= 0),
  anillas_pvc                 text,
  anillas_metalica            text,
  intervencion                boolean not null default false,
  tipo_acciones_manejo        text[]  not null default '{}',   -- Dron | Rodal | Compensación
  observaciones_i             text,
  observaciones_ii            text,

  -- Fase 4: cosecha y balance (14)
  fecha_vuelo                 date,
  fecha_cosecha               date,
  pollos_volados_precosecha   integer check (pollos_volados_precosecha is null or pollos_volados_precosecha >= 0),
  pollos_volados_postcosecha  integer check (pollos_volados_postcosecha is null or pollos_volados_postcosecha >= 0),
  num_pollos_volados          integer check (num_pollos_volados is null or num_pollos_volados >= 0),
  vuelan_pollos               boolean not null default false,
  num_pollos_muertos          integer check (num_pollos_muertos is null or num_pollos_muertos >= 0),
  pollos_muertos_precosecha   integer check (pollos_muertos_precosecha is null or pollos_muertos_precosecha >= 0),
  pollos_muertos_cosecha      integer check (pollos_muertos_cosecha is null or pollos_muertos_cosecha >= 0),
  pollos_muertos_postcosecha  integer check (pollos_muertos_postcosecha is null or pollos_muertos_postcosecha >= 0),
  estado_final                text,
  resultado_reproductivo      text check (resultado_reproductivo is null or resultado_reproductivo in ('Éxito', 'Fracaso')),
  causas_fracaso              text,
  estado_fracaso              text,

  -- Control de sincronización
  imagenes_urls       text[] not null default '{}',               -- URLs públicas (Storage)
  is_deleted          boolean not null default false,             -- borrado lógico (tombstone)
  updated_at          timestamptz not null default now(),         -- hora de edición del cliente: base del Last-Write-Wins
  server_updated_at   timestamptz not null default now(),         -- hora del servidor: cursor del sync incremental
  created_at          timestamptz not null default now()
);

comment on column public.nidos_grefa.updated_at is
  'Marca de edición enviada por el cliente (app o panel web). Last-Write-Wins: gana el mayor.';
comment on column public.nidos_grefa.server_updated_at is
  'Marca del servidor, la pone el trigger. La app descarga con server_updated_at >= cursor.';

create index if not exists nidos_grefa_server_updated_at_idx on public.nidos_grefa (server_updated_at, id);
create index if not exists nidos_grefa_municipio_idx         on public.nidos_grefa (municipio);
create index if not exists nidos_grefa_resultado_idx         on public.nidos_grefa (resultado_reproductivo);

-- 2) Trigger: LWW en servidor + cursor de servidor ---------------------------
-- * Si llega una escritura con updated_at ANTERIOR a la almacenada, se descarta
--   (devuelve la fila antigua sin cambios). El cliente lo detecta comparando el
--   updated_at devuelto por el upsert y marca hasConflict.
-- * server_updated_at se renueva siempre que la fila cambia realmente.
-- * El panel web (Vercel) DEBE enviar updated_at = now() en cada edición.
create or replace function public.nidos_grefa_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return old;
    end if;
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists nidos_grefa_before_write on public.nidos_grefa;
create trigger nidos_grefa_before_write
  before insert or update on public.nidos_grefa
  for each row execute function public.nidos_grefa_before_write();

-- 3) Realtime opcional (para que el panel web vea cambios al instante) -------
-- alter publication supabase_realtime add table public.nidos_grefa;

-- 4) RLS ---------------------------------------------------------------------
alter table public.nidos_grefa enable row level security;

drop policy if exists "nidos_grefa_select_auth" on public.nidos_grefa;
drop policy if exists "nidos_grefa_insert_auth" on public.nidos_grefa;
drop policy if exists "nidos_grefa_update_auth" on public.nidos_grefa;

-- Operarios y panel web autenticados (Supabase Auth): lectura y escritura.
-- No hay DELETE: los borrados son lógicos (is_deleted = true).
create policy "nidos_grefa_select_auth" on public.nidos_grefa
  for select to authenticated using (true);
create policy "nidos_grefa_insert_auth" on public.nidos_grefa
  for insert to authenticated with check (true);
create policy "nidos_grefa_update_auth" on public.nidos_grefa
  for update to authenticated using (true) with check (true);

-- ---- SOLO PILOTO SIN LOGIN ---------------------------------------------------
-- La app actual no incluye pantalla de login: usa la clave anónima (rol anon).
-- Para probar la sincronización sin Auth, descomenta estas políticas. Cualquiera
-- con la anon key podría leer y escribir: NO usar con datos reales (propietarios,
-- teléfonos). Lo recomendable es añadir login y quedarse con las de authenticated.
--
-- create policy "nidos_grefa_select_anon" on public.nidos_grefa
--   for select to anon using (true);
-- create policy "nidos_grefa_insert_anon" on public.nidos_grefa
--   for insert to anon with check (true);
-- create policy "nidos_grefa_update_anon" on public.nidos_grefa
--   for update to anon using (true) with check (true);

-- 5) Storage: bucket de fotos -------------------------------------------------
-- Público para lectura (la app guarda la URL pública en imagenes_urls). Los
-- nombres de archivo son UUID no adivinables: <id_nido>/<categoria>_<uuid>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nidos-fotos', 'nidos-fotos', true, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "nidos_fotos_select_public" on storage.objects;
drop policy if exists "nidos_fotos_insert_auth"   on storage.objects;
drop policy if exists "nidos_fotos_update_auth"   on storage.objects;
drop policy if exists "nidos_fotos_delete_auth"   on storage.objects;

create policy "nidos_fotos_select_public" on storage.objects
  for select using (bucket_id = 'nidos-fotos');
create policy "nidos_fotos_insert_auth" on storage.objects
  for insert to authenticated with check (bucket_id = 'nidos-fotos');
create policy "nidos_fotos_update_auth" on storage.objects
  for update to authenticated using (bucket_id = 'nidos-fotos') with check (bucket_id = 'nidos-fotos');
create policy "nidos_fotos_delete_auth" on storage.objects
  for delete to authenticated using (bucket_id = 'nidos-fotos');

-- Piloto sin login (la subida usa upsert, requiere INSERT y UPDATE):
-- create policy "nidos_fotos_insert_anon" on storage.objects
--   for insert to anon with check (bucket_id = 'nidos-fotos');
-- create policy "nidos_fotos_update_anon" on storage.objects
--   for update to anon using (bucket_id = 'nidos-fotos') with check (bucket_id = 'nidos-fotos');

-- ===== PILOTO SIN LOGIN (ver piloto_anon.sql) =====
-- SOLO PILOTO SIN LOGIN. Ejecutar DESPUÉS de schema.sql.
-- Da acceso de lectura/escritura a quien tenga la anon key (la APK la lleva
-- embebida): los datos de nidos (incluye propietarios y teléfonos) quedan
-- accesibles públicamente. Retirar con piloto_anon_revocar.sql al añadir login.

drop policy if exists "nidos_grefa_select_anon" on public.nidos_grefa;
drop policy if exists "nidos_grefa_insert_anon" on public.nidos_grefa;
drop policy if exists "nidos_grefa_update_anon" on public.nidos_grefa;
create policy "nidos_grefa_select_anon" on public.nidos_grefa
  for select to anon using (true);
create policy "nidos_grefa_insert_anon" on public.nidos_grefa
  for insert to anon with check (true);
create policy "nidos_grefa_update_anon" on public.nidos_grefa
  for update to anon using (true) with check (true);

drop policy if exists "nidos_fotos_insert_anon" on storage.objects;
drop policy if exists "nidos_fotos_update_anon" on storage.objects;
create policy "nidos_fotos_insert_anon" on storage.objects
  for insert to anon with check (bucket_id = 'nidos-fotos');
create policy "nidos_fotos_update_anon" on storage.objects
  for update to anon using (bucket_id = 'nidos-fotos') with check (bucket_id = 'nidos-fotos');
