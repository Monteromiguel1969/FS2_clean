import { readSheet } from 'read-excel-file/universal';

/** Primera hoja del .xlsx como array de filas (la primera fila son las cabeceras). */
export async function leerHoja(archivo) {
  const datos = archivo instanceof Blob ? archivo : new Blob([archivo]);
  return readSheet(datos);
}
