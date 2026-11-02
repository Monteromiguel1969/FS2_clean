-- =====================================================================
-- GREFA · Campaña Aguilucho — esquema de Supabase
-- Ejecutar completo en: Supabase Dashboard -> SQL Editor (es idempotente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabla nidos_grefa (42 campos de la ficha + control de sincronización)
--    Las columnas coinciden con NidoGrefaModel.toJson() de la app Flutter.
--    Campos solo locales (is_synced, has_conflict, local_image_paths) NO
--    existen en el servidor.
-- ---------------------------------------------------------------------
create table if not exists public.nidos_grefa (
  id uuid primary key,

  -- F1 · Ubicación / Hábitat
  numeracion text,
  etiqueta text,
  proyecto text,
  propietario text,
  tlfn text,
  google_maps_url text,
  municipio text,
  provincia text,
  referencia_catastral text,
  especie text,
  territorio text,
  coordenada_x double precision,
  coordenada_y double precision,
  sustrato text,

  -- F2 · Puesta / Incubación
  fecha_incubacion date,
  fecha_eclosion date,
  num_huevos_entrada integer,
  tamano_puesta integer,
  fecha_entrada_nido date,

  -- F3 · Seguimiento / Manejo
  num_pollos_nacidos integer,
  num_huevos_no_eclosionados integer,
  edad_dias integer,
  anillas_pvc text,
  anillas_metalica text,
  intervencion boolean not null default false,
  tipo_acciones_manejo text[] not null default '{}',
  observaciones_i text,
  observaciones_ii text,

  -- F4 · Cosecha / Balance
  fecha_vuelo date,
  fecha_cosecha date,
  pollos_volados_precosecha integer,
  pollos_volados_postcosecha integer,
  num_pollos_volados integer,
  vuelan_pollos boolean not null default false,
  num_pollos_muertos integer,
  pollos_muertos_precosecha integer,
  pollos_muertos_cosecha integer,
  pollos_muertos_postcosecha integer,
  estado_final text,
  resultado_reproductivo text,
  causas_fracaso text,
  estado_fracaso text,

  -- Control
  image_urls text[] not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.nidos_grefa is
  'Fichas de nidos de Aguilucho Cenizo y Pálido (GREFA). coordenada_x = longitud, coordenada_y = latitud (WGS84).';

create index if not exists nidos_grefa_updated_at_idx on public.nidos_grefa (updated_at);
create index if not exists nidos_grefa_municipio_idx on public.nidos_grefa (municipio);

-- ---------------------------------------------------------------------
-- 2) Last-Write-Wins en servidor
--    * Rechaza (ignora en silencio) escrituras con updated_at MÁS ANTIGUO
--      que el almacenado: la app detecta que no se aplicó y descarga la
--      versión vigente.
--    * Si alguien (p. ej. el panel web en Vercel) modifica la fila sin tocar
--      updated_at, se avanza automáticamente para que los móviles reciban
--      el cambio en su siguiente sincronización.
-- ---------------------------------------------------------------------
create or replace function public.nidos_grefa_lww()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return null;
    end if;
    if new.updated_at = old.updated_at
       and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      new.updated_at := greatest(now(), old.updated_at + interval '1 millisecond');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nidos_grefa_lww_trg on public.nidos_grefa;
create trigger nidos_grefa_lww_trg
  before update on public.nidos_grefa
  for each row execute function public.nidos_grefa_lww();

-- ---------------------------------------------------------------------
-- 3) Row Level Security
--    ATENCIÓN: la app no incluye login; usa la clave anon. Estas políticas
--    permiten leer/crear/editar (no borrar) a cualquiera que tenga esa
--    clave. Para producción activa Supabase Auth en la app y sustituye
--    "anon, authenticated" por "authenticated" en las políticas.
-- ---------------------------------------------------------------------
alter table public.nidos_grefa enable row level security;

drop policy if exists "nidos_grefa_select" on public.nidos_grefa;
create policy "nidos_grefa_select" on public.nidos_grefa
  for select to anon, authenticated using (true);

drop policy if exists "nidos_grefa_insert" on public.nidos_grefa;
create policy "nidos_grefa_insert" on public.nidos_grefa
  for insert to anon, authenticated with check (true);

drop policy if exists "nidos_grefa_update" on public.nidos_grefa;
create policy "nidos_grefa_update" on public.nidos_grefa
  for update to anon, authenticated using (true) with check (true);

-- (Opcional) cambios en tiempo real para el panel web:
-- alter publication supabase_realtime add table public.nidos_grefa;

-- ---------------------------------------------------------------------
-- 4) Storage: bucket público "nidos-fotos"
--    Las fotos se suben como <id_nido>/<etapa>_<uuid>.<ext> y se leen por
--    URL pública (getPublicUrl).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nidos-fotos',
  'nidos-fotos',
  true,
  15728640, -- 15 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "nidos_fotos_select" on storage.objects;
create policy "nidos_fotos_select" on storage.objects
  for select to anon, authenticated using (bucket_id = 'nidos-fotos');

drop policy if exists "nidos_fotos_insert" on storage.objects;
create policy "nidos_fotos_insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'nidos-fotos');

-- upsert:true en la subida necesita también UPDATE.
drop policy if exists "nidos_fotos_update" on storage.objects;
create policy "nidos_fotos_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'nidos-fotos') with check (bucket_id = 'nidos-fotos');
