-- Campaña como campo propio, distinto de proyecto.
--   proyecto = línea de trabajo (Aguilucho, …)
--   campana  = tanda dentro del proyecto (2026, 2027, …)
-- Ejecutar una vez en: Supabase Dashboard > SQL Editor (proyecto GREFA-PROYECTOS).
-- Es idempotente y no modifica ningún dato. Hasta que se ejecute, el panel
-- funciona igual pero sin selector ni importación de campaña.
alter table public.nidos_grefa add column if not exists campana text;
create index if not exists nidos_grefa_proyecto_campana_idx on public.nidos_grefa (proyecto, campana);
