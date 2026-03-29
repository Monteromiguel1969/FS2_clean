/**
 * Formato de fechas global: dd/mm/yyyy en toda la app.
 * Usar para: importación Sheet, datos manuales, visualizaciones, informes, exportaciones.
 */

const STORAGE_VERSION = 1;

export { STORAGE_VERSION };

/**
 * Parsea string o Date y devuelve dd/mm/yyyy.
 * Acepta: Date, ISO (yyyy-mm-dd), dd/mm/yyyy, dd-mm-yyyy.
 */
export function formatDateGlobal(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  const d = typeof value === 'string' ? parseDateInput(value) : value;
  if (!d || isNaN(d.getTime())) return typeof value === 'string' ? value : '';
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formato corto para listados: dd/mm/aa (año en 2 dígitos).
 */
export function formatDateExport(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  const d = typeof value === 'string' ? parseDateInput(value) : value;
  if (!d || isNaN(d.getTime())) return typeof value === 'string' ? value : '';
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear().toString().slice(-2);
  return `${day}/${month}/${year}`;
}

/**
 * Parsea entrada de usuario o del Sheet a Date.
 */
function parseDateInput(str: string): Date | null {
  const s = String(str || '').trim();
  if (!s) return null;
  // dd/mm/yyyy o dd-mm-yyyy
  const slash = s.split('/');
  const dash = s.split('-');
  if (slash.length === 3) {
    const [d, m, y] = slash.map(Number);
    if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return new Date(y, m - 1, d);
    }
  }
  if (dash.length === 3) {
    const [a, b, c] = dash.map(Number);
    // yyyy-mm-dd
    if (a >= 1900 && a <= 2100 && b >= 1 && b <= 12 && c >= 1 && c <= 31)
      return new Date(a, b - 1, c);
    // dd-mm-yyyy
    if (c >= 1900 && c <= 2100 && b >= 1 && b <= 12 && a >= 1 && a <= 31)
      return new Date(c, b - 1, a);
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Devuelve fecha por defecto para "hoy" en dd/mm/yyyy.
 */
export function todayFormatted(): string {
  return formatDateGlobal(new Date());
}

/**
 * Convierte dd/mm/yyyy (o ISO) a Date para ordenar o enviar al Sheet.
 */
export function parseToDate(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = typeof value === 'string' ? parseDateInput(value) : value;
  if (!d || isNaN(d.getTime())) return null;
  return d;
}

/**
 * Para ordenar listas por fecha (dd/mm/yyyy o ISO).
 */
export function sortByDate<T>(items: T[], getDate: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const da = parseToDate(getDate(a))?.getTime() ?? 0;
    const db = parseToDate(getDate(b))?.getTime() ?? 0;
    return da - db;
  });
}
