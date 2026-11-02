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
