import { createClient } from '@supabase/supabase-js';
import { COLUMNAS } from './columns.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && anonKey && !url.includes('xxxx'));
export const exigeLogin = String(import.meta.env.VITE_REQUIRE_LOGIN ?? 'true') !== 'false';

export const supabase = configurado ? createClient(url, anonKey) : null;

// Los enlaces de confirmación y recuperación abren grefa-proyectos, que ya sabe
// fijar la contraseña nueva (mismo proyecto de Supabase, misma cuenta).
const URL_CONFIRMACION = 'https://grefa-proyectos.vercel.app/auth/callback?next=/';
const URL_RECUPERACION = 'https://grefa-proyectos.vercel.app/auth/callback?next=/actualizar-contrasena';

const mensajeAuth = (error) => {
  const m = String(error?.message ?? error).toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('not confirmed')) return 'El correo todavía no está confirmado. Abre el enlace que te enviamos.';
  if (m.includes('already registered')) return 'Ese correo ya tiene cuenta. Inicia sesión o recupera la contraseña.';
  if (m.includes('same password') || m.includes('different from the old')) return 'La contraseña nueva debe ser distinta de la actual.';
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos.';
  return error?.message ?? String(error);
};

/** Crea la cuenta; devuelve true si queda con sesión y false si hay que confirmar el correo. */
export async function registrar({ nombre, email, clave }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password: clave,
    options: { data: { full_name: nombre.trim() }, emailRedirectTo: URL_CONFIRMACION },
  });
  if (error) throw new Error(mensajeAuth(error));
  return Boolean(data.session);
}

export async function recuperarClave(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: URL_RECUPERACION });
  if (error) throw new Error(mensajeAuth(error));
}

export async function cambiarClave(clave) {
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) throw new Error(mensajeAuth(error));
}

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

// `campana` se añade a la tabla con supabase/migracion_campana.sql. Mientras no
// exista, el panel funciona sin ella (no la lee, no la escribe, no la ofrece).
let hayCampana = true;
export const tieneCampana = () => hayCampana;
export const columnasActivas = () => (hayCampana ? COLUMNAS : COLUMNAS.filter((c) => c.key !== 'campana'));

export async function detectarCampana() {
  const { error } = await supabase.from(TABLA).select('campana').limit(1);
  hayCampana = !error;
  return hayCampana;
}

const soloColumnas = (n) => Object.fromEntries(columnasActivas().map((c) => [c.key, n[c.key] ?? (c.tipo === 'list' ? [] : null)]));

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

/**
 * Tiempo real: avisa de cada cambio en `nidos_grefa` (app de campo, otro panel…).
 * `onEvento` recibe el payload de postgres_changes; `onEstado` el estado del canal
 * (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED). Devuelve la función para cancelar.
 * Requiere la tabla en la publicación `supabase_realtime`
 * (ver `aguiluchos/supabase/habilitar_realtime.sql`).
 */
export function suscribirCambios({ onEvento, onEstado }) {
  const canal = supabase
    .channel('nidos-grefa-en-vivo')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLA }, onEvento)
    .subscribe((estado) => onEstado(estado));
  return () => supabase.removeChannel(canal);
}

export async function borrarNido(id) {
  const { error } = await supabase
    .from(TABLA)
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

const UUID_DUPLICADO = '23505';
const LOTE_INSERT = 50;
const LOTE_UPDATE = 10;

/**
 * Aplica un plan de importación (ver `planificarImportacion`): inserta los nidos
 * nuevos y actualiza solo los campos con valor de los existentes. Nunca borra.
 * Devuelve { creados, actualizados, errores: [texto] }.
 */
export async function aplicarImportacion(plan, alProgreso = () => {}) {
  const ahora = new Date().toISOString();
  const res = { creados: 0, actualizados: 0, errores: [] };
  const total = plan.nuevos.length + plan.actualizar.length;
  let hecho = 0;
  const avanzar = (n) => { hecho += n; alProgreso(hecho, total); };

  const filaCompleta = (n) => ({ ...n.fila, id: n.id, updated_at: ahora, is_deleted: false });
  for (let i = 0; i < plan.nuevos.length; i += LOTE_INSERT) {
    const lote = plan.nuevos.slice(i, i + LOTE_INSERT);
    const { error } = await supabase.from(TABLA).insert(lote.map(filaCompleta));
    if (!error) {
      res.creados += lote.length;
    } else {
      // Un id ya usado por un nido borrado: se recupera con los datos del fichero.
      for (const n of lote) {
        const q = error.code === UUID_DUPLICADO
          ? supabase.from(TABLA).upsert(filaCompleta(n), { onConflict: 'id' })
          : supabase.from(TABLA).insert(filaCompleta(n));
        const { error: e2 } = await q;
        if (e2) res.errores.push(`Fila ${n.filaExcel}: ${e2.message}`);
        else res.creados += 1;
      }
    }
    avanzar(lote.length);
  }

  for (let i = 0; i < plan.actualizar.length; i += LOTE_UPDATE) {
    const lote = plan.actualizar.slice(i, i + LOTE_UPDATE);
    await Promise.all(lote.map(async (u) => {
      const { error } = await supabase
        .from(TABLA)
        .update({ ...u.cambios, updated_at: ahora })
        .eq('id', u.id);
      if (error) res.errores.push(`Fila ${u.filaExcel}: ${error.message}`);
      else res.actualizados += 1;
    }));
    avanzar(lote.length);
  }
  return res;
}
