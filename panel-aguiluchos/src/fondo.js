// Fondo de los mapas (panel Leaflet e imágenes del informe): mapa o ortofoto PNOA.
export const FONDOS = {
  mapa: {
    id: 'mapa',
    etiqueta: 'Mapa',
    plantilla: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '© OpenStreetMap contributors',
    zoomMax: 19,
  },
  ortofoto: {
    id: 'ortofoto',
    etiqueta: 'Ortofoto',
    // WMTS KVP del IGN: TileRow = y, TileCol = x (GoogleMapsCompatible = esquema XYZ).
    plantilla: 'https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&Layer=OI.OrthoimageCoverage&Style=default&Format=image/jpeg&TileMatrixSet=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}',
    atribucion: 'PNOA © Instituto Geográfico Nacional de España',
    zoomMax: 19,
  },
};

export const FONDO_DEFECTO = 'mapa';
const CLAVE = 'aguiluchos.fondo';

const almacen = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

export const esFondo = (id) => Object.hasOwn(FONDOS, id);

/** Fondo elegido por el usuario (recordado en localStorage); `mapa` si no hay o no es válido. */
export function leerFondo(storage = almacen()) {
  try {
    const v = storage?.getItem(CLAVE);
    return esFondo(v) ? v : FONDO_DEFECTO;
  } catch {
    return FONDO_DEFECTO;
  }
}

export function guardarFondo(id, storage = almacen()) {
  if (!esFondo(id)) return false;
  try { storage?.setItem(CLAVE, id); return true; } catch { return false; }
}

/** URL de una tesela XYZ del fondo. */
export function urlTesela(id, z, x, y) {
  const f = FONDOS[esFondo(id) ? id : FONDO_DEFECTO];
  return f.plantilla.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

/** HTML del selector Mapa / Ortofoto (el enlace con la lógica lo hace quien lo pinta). */
export function htmlSelectorFondo(actual, idElemento) {
  return `<label class="sel-fondo" title="Fondo de los mapas del panel y de los informes">Fondo:
    <select id="${idElemento}">${Object.values(FONDOS).map((f) => `<option value="${f.id}" ${f.id === actual ? 'selected' : ''}>${f.etiqueta}</option>`).join('')}</select></label>`;
}
