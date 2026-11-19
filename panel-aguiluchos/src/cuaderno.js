// Cuaderno de Jupyter/Colab (.ipynb) con los nidos filtrados incrustados. Al ejecutarlo
// en Colab construye el PowerPoint (gráficos, mapa, imágenes y tabla) y lo descarga.
import { PY_AYUDA, PY_GRAFICOS, PY_IMAGENES, PY_INSTALAR, PY_MAPA, PY_PPTX } from './cuaderno_py.js';
import { nombreCuaderno } from './presentacion.js';

const lineas = (txt) => txt.split('\n').map((l, i, a) => (i < a.length - 1 ? `${l}\n` : l));
const celdaCodigo = (txt) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: lineas(txt) });
const celdaTexto = (txt) => ({ cell_type: 'markdown', metadata: {}, source: lineas(txt) });

/** Literal de cadena válido en Python a partir de un JSON (los escapes JSON valen en Python). */
export const literalPython = (cadena) => JSON.stringify(cadena);

export function celdaDatos(datos) {
  return `# 2/7 · Datos del informe filtrado (incrustados desde el panel; no se envían a ningún servidor)
import json
DATOS_JSON = ${literalPython(JSON.stringify(datos))}
DATOS = json.loads(DATOS_JSON)
print(f"{len(DATOS['nidos'])} nidos · {DATOS['ambito']} · {DATOS['fecha']}")`;
}

/** Objeto nbformat 4 listo para serializar. */
export function construirCuaderno(datos) {
  return {
    cells: [
      celdaTexto(`# Presentación · ${datos.ambito}

Cuaderno generado desde el panel de GREFA con los **${datos.nidos.length} nidos filtrados** (${datos.fecha}). Incluye los datos; no hace falta subir nada más.

**Cómo usarlo en Google Colab:** menú **Entorno de ejecución → Ejecutar todo**. Al terminar se descarga el archivo \`${datos.nombre_pptx}\` (PowerPoint, que también se puede importar en Google Slides desde Drive).

Contenido: portada con ámbito y fecha, totales, gráficos (resultado, tasas, pollos, causas), mapa con los nidos (${datos.fondo.nombre}; si Colab no puede cargar el fondo, mapa estático con los puntos), imágenes de los nidos con URL pública y tabla. Las celdas sin dato quedan en blanco. No contiene datos personales.`),
      celdaCodigo(PY_INSTALAR),
      celdaCodigo(celdaDatos(datos)),
      celdaCodigo(PY_AYUDA),
      celdaCodigo(PY_GRAFICOS),
      celdaCodigo(PY_MAPA),
      celdaCodigo(PY_IMAGENES),
      celdaCodigo(PY_PPTX),
    ],
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python' },
      colab: { name: nombreCuaderno(), provenance: [] },
    },
    nbformat: 4,
    nbformat_minor: 4,
  };
}

export const serializarCuaderno = (nb) => JSON.stringify(nb, null, 1);
