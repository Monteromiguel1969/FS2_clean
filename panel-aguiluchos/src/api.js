import { createClient } from '@supabase/supabase-js';
import { COLUMNAS } from './columns.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && anonKey && !url.includes('xxxx'));
export const exigeLogin = String(import.meta.env.VITE_REQUIRE_LOGIN ?? 'true') !== 'false';

export const supabase = configurado ? createClient(url, anonKey) : null;

const TABLA = 'nidos_grefa';
const PAGINA = 1000;

export async function cargarNidos() {
  const todos = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .eq('is_deleted', false)
      .order('numeracion', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw error;
    todos.push(...data);
    if (data.length < PAGINA) break;
  }
  return todos;
}

const soloColumnas = (n) => Object.fromEntries(COLUMNAS.map((c) => [c.key, n[c.key] ?? (c.tipo === 'list' ? [] : null)]));

/**
 * Crea o actualiza un nido. `updated_at` es la hora de edición del cliente: el
 * trigger de Supabase aplica Last-Write-Wins (gana el mayor). Devuelve la fila
 * resultante y si el servidor conservó una versión más reciente que la nuestra.
 */
export async function guardarNido(nido, esNuevo) {
  const ahora = new Date().toISOString();
  const fila = { ...soloColumnas(nido), updated_at: ahora, is_deleted: false };
  const q = esNuevo
    ? supabase.from(TABLA).insert({ id: nido.id, ...fila })
    : supabase.from(TABLA).update(fila).eq('id', nido.id);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return { fila: data, descartado: new Date(data.updated_at) > new Date(ahora) };
}

export async function borrarNido(id) {
  const { error } = await supabase
    .from(TABLA)
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
