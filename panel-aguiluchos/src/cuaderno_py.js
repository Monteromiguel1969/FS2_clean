// Código Python de las celdas del cuaderno de Colab (construye el .pptx a partir de
// DATOS, incrustado en el propio cuaderno). String.raw: las barras se conservan tal cual.
export const PY_INSTALAR = String.raw`# 1/7 · Instala la librería que crea el PowerPoint (matplotlib, Pillow y requests ya vienen en Colab)
%pip install -q python-pptx`;

export const PY_AYUDA = String.raw`# 3/7 · Preparación: funciones y estilo
import io, math, datetime
from collections import Counter, defaultdict
import requests
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

try:
    from google.colab import files
    EN_COLAB = True
except ImportError:
    EN_COLAB = False

NIDOS = DATOS["nidos"]
AMBITO = DATOS["ambito"]
FECHA = DATOS["fecha"]
FILTROS = DATOS.get("filtros") or ""
FONDO = DATOS["fondo"]
CABECERAS = {"User-Agent": "GREFA-Aguiluchos-Presentacion/1.0 (cuaderno de Colab)"}
COLOR = {"Éxito": "#2e6b3a", "Fracaso": "#c0392b", "En curso": "#e08a1e"}


def rgb(hexa):
    h = hexa.lstrip("#")
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


VERDE, VERDE_OSC, GRIS, TEXTO, SUAVE = rgb("#2e6b3a"), rgb("#1f4a28"), rgb("#f3f5f2"), rgb("#1d2a1f"), rgb("#5f6d62")
BLANCO = rgb("#ffffff")


def vacio(v):
    return v is None or (isinstance(v, str) and v.strip() == "")


def texto(v):
    return "" if vacio(v) else str(v).strip()


def suma(clave):
    return sum(n.get(clave) or 0 for n in NIDOS)


def figura_png(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf


print(f"Listo: {len(NIDOS)} nidos · {AMBITO}")`;

export const PY_GRAFICOS = String.raw`# 4/7 · Gráficos (solo se crean los que tienen datos)
def grupos(clave):
    g = defaultdict(Counter)
    for n in NIDOS:
        g[texto(n.get(clave)) or "Sin indicar"][n["estado"]] += 1
    return g


def grafico_estados():
    cuenta = Counter(n["estado"] for n in NIDOS)
    etiquetas = [e for e in ("Éxito", "Fracaso", "En curso") if cuenta[e]]
    if not etiquetas:
        return None
    fig, ax = plt.subplots(figsize=(6, 4.4))
    ax.pie([cuenta[e] for e in etiquetas], labels=[f"{e} ({cuenta[e]})" for e in etiquetas],
           colors=[COLOR[e] for e in etiquetas], autopct="%1.0f%%", startangle=90,
           wedgeprops={"edgecolor": "white"})
    ax.set_title("Resultado de la nidificación")
    return figura_png(fig)


def grafico_tasas():
    for clave, nombre in (("campana", "campaña"), ("provincia", "provincia")):
        filas = []
        for k, c in grupos(clave).items():
            cerrados = c["Éxito"] + c["Fracaso"]
            if cerrados:
                filas.append((k, 100.0 * c["Éxito"] / cerrados, cerrados))
        if len(filas) >= 2:
            filas = sorted(filas, key=lambda f: f[1])[-10:]
            fig, ax = plt.subplots(figsize=(7, 4.4))
            ax.barh([f"{k} (n={n})" for k, _, n in filas], [t for _, t, _ in filas], color=COLOR["Éxito"])
            ax.set_xlim(0, 100)
            ax.set_xlabel("% de éxito sobre nidos cerrados")
            ax.set_title(f"Tasa de éxito por {nombre}")
            return figura_png(fig)
    cerrados = sum(1 for n in NIDOS if n["estado"] in ("Éxito", "Fracaso"))
    if not cerrados:
        return None
    tasa = 100.0 * sum(1 for n in NIDOS if n["estado"] == "Éxito") / cerrados
    fig, ax = plt.subplots(figsize=(7, 2.6))
    ax.barh(["Tasa de éxito"], [tasa], color=COLOR["Éxito"])
    ax.set_xlim(0, 100)
    ax.set_xlabel(f"% de éxito sobre {cerrados} nidos cerrados")
    ax.set_title("Tasa de éxito")
    return figura_png(fig)


def grafico_pollos():
    claves = (("nacidos", "Nacidos", "#4a90c2"), ("volados", "Volados", COLOR["Éxito"]), ("muertos", "Muertos", COLOR["Fracaso"]))
    if not any(suma(k) for k, _, _ in claves):
        return None
    por = defaultdict(lambda: Counter())
    for n in NIDOS:
        g = texto(n.get("campana")) or "Total"
        for k, _, _ in claves:
            por[g][k] += n.get(k) or 0
    grupos_ = sorted(por)
    fig, ax = plt.subplots(figsize=(7, 4.4))
    ancho = 0.8 / len(claves)
    for i, (k, etiqueta, color) in enumerate(claves):
        xs = [j + i * ancho for j in range(len(grupos_))]
        ax.bar(xs, [por[g][k] for g in grupos_], width=ancho, label=etiqueta, color=color)
    ax.set_xticks([j + 0.4 - ancho / 2 for j in range(len(grupos_))])
    ax.set_xticklabels(grupos_)
    ax.set_ylabel("Pollos")
    ax.set_title("Pollos nacidos, volados y muertos")
    ax.legend()
    return figura_png(fig)


def grafico_causas():
    causas = Counter(texto(n.get("causas_fracaso")) or "Sin causa indicada" for n in NIDOS if n["estado"] == "Fracaso")
    if not causas:
        return None
    items = causas.most_common(8)[::-1]
    fig, ax = plt.subplots(figsize=(7, 4.4))
    ax.barh([k for k, _ in items], [v for _, v in items], color=COLOR["Fracaso"])
    ax.set_xlabel("Nidos")
    ax.set_title("Causas de fracaso")
    return figura_png(fig)


GRAFICOS = [(t, g) for t, g in (
    ("Resultado de la nidificación", grafico_estados()),
    ("Tasa de éxito", grafico_tasas()),
    ("Pollos nacidos, volados y muertos", grafico_pollos()),
    ("Causas de fracaso", grafico_causas()),
) if g is not None]
print(f"{len(GRAFICOS)} gráficos creados")`;

export const PY_MAPA = String.raw`# 5/7 · Mapa con los nidos filtrados (fondo elegido en el panel; si no carga, mapa estático)
TESELA = 256


def mercator(lat, lon, z):
    n = 2 ** z * TESELA
    x = (lon + 180.0) / 360.0 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def encuadre(puntos, ancho, alto, margen=60, zmin=3, zmax=16):
    if len({(p[0], p[1]) for p in puntos}) == 1:
        z = min(zmax, 14)
    else:
        z = zmax
        while z > zmin:
            xy = [mercator(p[0], p[1], z) for p in puntos]
            w = max(a for a, _ in xy) - min(a for a, _ in xy)
            h = max(b for _, b in xy) - min(b for _, b in xy)
            if w <= ancho - 2 * margen and h <= alto - 2 * margen:
                break
            z -= 1
    xy = [mercator(p[0], p[1], z) for p in puntos]
    cx = (max(a for a, _ in xy) + min(a for a, _ in xy)) / 2
    cy = (max(b for _, b in xy) + min(b for _, b in xy)) / 2
    return z, cx, cy


def mapa_con_teselas(puntos, ancho=1200, alto=640):
    z, cx, cy = encuadre(puntos, ancho, alto)
    ox, oy = cx - ancho / 2, cy - alto / 2
    n = 2 ** z
    lienzo = Image.new("RGB", (ancho, alto), "#e9efe9")
    total = bien = 0
    for tx in range(int(ox // TESELA), int((ox + ancho) // TESELA) + 1):
        for ty in range(max(0, int(oy // TESELA)), min(n - 1, int((oy + alto) // TESELA)) + 1):
            total += 1
            url = FONDO["plantilla"].replace("{z}", str(z)).replace("{x}", str(tx % n)).replace("{y}", str(ty))
            try:
                r = requests.get(url, timeout=8, headers=CABECERAS)
                r.raise_for_status()
                tesela = Image.open(io.BytesIO(r.content)).convert("RGB")
                lienzo.paste(tesela, (int(tx * TESELA - ox), int(ty * TESELA - oy)))
                bien += 1
            except Exception:
                pass
    if total == 0 or bien < total * 0.6:
        raise RuntimeError(f"solo se cargaron {bien} de {total} teselas")
    dib = ImageDraw.Draw(lienzo)
    for lat, lon, estado, _ in puntos:
        x, y = mercator(lat, lon, z)
        px, py = x - ox, y - oy
        dib.ellipse((px - 9, py - 9, px + 9, py + 9), fill=COLOR[estado], outline="white", width=3)
    dib.rectangle((ancho - 330, alto - 18, ancho, alto), fill="white")
    dib.text((ancho - 325, alto - 15), FONDO["atribucion"], fill="#333333")
    buf = io.BytesIO()
    lienzo.save(buf, "PNG")
    buf.seek(0)
    return buf


def mapa_estatico(puntos):
    fig, ax = plt.subplots(figsize=(10, 5.2))
    for estado in ("Éxito", "Fracaso", "En curso"):
        sel = [p for p in puntos if p[2] == estado]
        if sel:
            ax.scatter([p[1] for p in sel], [p[0] for p in sel], s=70, c=COLOR[estado], edgecolors="white", label=estado, zorder=3)
    lat_media = sum(p[0] for p in puntos) / len(puntos)
    ax.set_aspect(1.0 / max(0.2, math.cos(math.radians(lat_media))), adjustable="datalim")
    ax.grid(True, color="#d3dcd3")
    ax.set_xlabel("Longitud")
    ax.set_ylabel("Latitud")
    ax.set_title("Nidos filtrados (mapa estático, sin mapa base)")
    ax.legend()
    return figura_png(fig)


PUNTOS = [(n["lat"], n["lon"], n["estado"], n.get("etiqueta") or n.get("numeracion") or "")
          for n in NIDOS if n.get("lat") is not None and n.get("lon") is not None]
MAPA = None
MAPA_PIE = ""
if PUNTOS:
    try:
        MAPA = mapa_con_teselas(PUNTOS)
        MAPA_PIE = f"Fondo: {FONDO['nombre']} · {FONDO['atribucion']}"
    except Exception as e:
        print(f"No se pudo cargar el fondo ({e}); se usa el mapa estático con los puntos.")
        MAPA = mapa_estatico(PUNTOS)
        MAPA_PIE = "Mapa estático con los puntos (sin mapa base)"
    print(f"Mapa creado con {len(PUNTOS)} nidos · {MAPA_PIE}")
else:
    print("Ningún nido filtrado tiene coordenadas válidas: no hay mapa.")`;

export const PY_IMAGENES = String.raw`# 6/7 · Imágenes de los nidos (solo las que tienen URL pública y se pueden descargar)
def descargar_imagenes(maximo=12, intentos=30):
    # Se limita el número de intentos para no esperar minutos si las URL no son accesibles.
    res, fallos = [], 0
    for n in NIDOS:
        for url in (n.get("imagenes") or [])[:1]:
            if len(res) >= maximo or fallos + len(res) >= intentos or (fallos >= 8 and not res):
                return res, fallos
            try:
                r = requests.get(url, timeout=6, headers=CABECERAS)
                r.raise_for_status()
                im = Image.open(io.BytesIO(r.content))
                im.load()
                im = im.convert("RGB")
                im.thumbnail((1600, 1600))
                buf = io.BytesIO()
                im.save(buf, "JPEG", quality=85)
                buf.seek(0)
                res.append((n, buf))
            except Exception:
                fallos += 1
    return res, fallos


IMAGENES, FALLOS_IMG = descargar_imagenes()
print(f"{len(IMAGENES)} imágenes descargadas" + (f" ({FALLOS_IMG} no se pudieron descargar)" if FALLOS_IMG else ""))`;

export const PY_PPTX = String.raw`# 7/7 · Construye el PowerPoint y lo descarga
prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
VACIA = prs.slide_layouts[6]
pagina = [0]


def caja(diap, txt, x, y, w, h, size=14, negrita=False, color=TEXTO, alinear=PP_ALIGN.LEFT, ancla=MSO_ANCHOR.TOP):
    tb = diap.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = ancla
    tf.text = txt
    for p in tf.paragraphs:
        p.alignment = alinear
        for r in p.runs:
            r.font.size, r.font.bold, r.font.color.rgb, r.font.name = Pt(size), negrita, color, "Arial"
    return tb


def rectangulo(diap, x, y, w, h, relleno, borde=None):
    f = diap.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    f.fill.solid()
    f.fill.fore_color.rgb = relleno
    if borde is None:
        f.line.fill.background()
    else:
        f.line.color.rgb = borde
    f.shadow.inherit = False
    return f


def diapositiva(titulo):
    d = prs.slides.add_slide(VACIA)
    rectangulo(d, 0, 0, 13.333, 0.9, VERDE)
    caja(d, titulo, 0.5, 0.1, 12.3, 0.7, 22, True, BLANCO, ancla=MSO_ANCHOR.MIDDLE)
    pagina[0] += 1
    caja(d, f"GREFA · Campaña Aguilucho · {pagina[0]}", 0.5, 7.05, 12.3, 0.3, 9, False, SUAVE, PP_ALIGN.RIGHT)
    return d


def poner_imagen(diap, buf, x, y, w, h):
    im = Image.open(buf)
    ratio = min(w / im.width, h / im.height)
    ancho, alto = im.width * ratio, im.height * ratio
    buf.seek(0)
    diap.shapes.add_picture(buf, Inches(x + (w - ancho) / 2), Inches(y + (h - alto) / 2), Inches(ancho), Inches(alto))


# Portada
d = prs.slides.add_slide(VACIA)
rectangulo(d, 0, 0, 13.333, 7.5, VERDE_OSC)
caja(d, "Seguimiento reproductor · Campaña Aguilucho", 0.8, 1.8, 11.7, 1.2, 38, True, BLANCO)
caja(d, AMBITO, 0.8, 3.1, 11.7, 0.8, 26, False, rgb("#d9ebdd"))
caja(d, f"{len(NIDOS)} nidos", 0.8, 3.9, 11.7, 0.5, 18, False, BLANCO)
if FILTROS:
    caja(d, f"Filtros: {FILTROS}", 0.8, 4.6, 11.7, 0.9, 13, False, rgb("#d9ebdd"))
caja(d, FECHA, 0.8, 6.5, 11.7, 0.4, 14, False, rgb("#d9ebdd"))

# Totales
cuenta = Counter(n["estado"] for n in NIDOS)
cerrados = cuenta["Éxito"] + cuenta["Fracaso"]
tasa = f"{round(100 * cuenta['Éxito'] / cerrados)} %" if cerrados else "—"
KPIS = [("Nidos", len(NIDOS), TEXTO), ("Con éxito", cuenta["Éxito"], VERDE), ("Fracaso", cuenta["Fracaso"], rgb("#c0392b")),
        ("En curso", cuenta["En curso"], rgb("#e08a1e")), ("Tasa de éxito (cerrados)", tasa, TEXTO),
        ("Pollos nacidos", suma("nacidos"), TEXTO), ("Pollos volados", suma("volados"), VERDE), ("Pollos muertos", suma("muertos"), rgb("#c0392b"))]
d = diapositiva(f"Totales · {AMBITO}")
for i, (etiqueta, valor, color) in enumerate(KPIS):
    x, y = 0.5 + (i % 4) * 3.1, 1.3 + (i // 4) * 1.9
    rectangulo(d, x, y, 2.9, 1.65, GRIS, rgb("#d9dfd6"))
    caja(d, str(valor), x, y + 0.15, 2.9, 0.9, 36, True, color, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
    caja(d, etiqueta, x, y + 1.0, 2.9, 0.5, 13, False, SUAVE, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)

# Gráficos
for titulo, buf in GRAFICOS:
    d = diapositiva(f"{titulo} · {AMBITO}")
    poner_imagen(d, buf, 0.5, 1.1, 12.3, 5.8)

# Mapa
if MAPA is not None:
    d = diapositiva(f"Mapa de los nidos · {AMBITO}")
    poner_imagen(d, MAPA, 0.5, 1.1, 12.3, 5.4)
    caja(d, MAPA_PIE, 0.5, 6.55, 12.3, 0.4, 10, False, SUAVE)

# Imágenes
for n, buf in IMAGENES:
    d = diapositiva(f"Nido {texto(n.get('etiqueta')) or texto(n.get('numeracion'))} · {texto(n.get('municipio'))}")
    poner_imagen(d, buf, 0.5, 1.1, 12.3, 5.5)
    caja(d, " · ".join(x for x in (texto(n.get("provincia")), texto(n.get("campana")), n["estado"]) if x), 0.5, 6.6, 12.3, 0.4, 11, False, SUAVE)

# Tabla de nidos
COLUMNAS = [("numeracion", "Nº", 0.6), ("etiqueta", "Etiqueta", 1.2), ("proyecto", "Proyecto", 1.1), ("campana", "Campaña", 0.9),
            ("municipio", "Localidad", 1.9), ("provincia", "Provincia", 1.3), ("especie", "Especie", 1.6), ("estado", "Estado", 0.9),
            ("nacidos", "Nacidos", 0.75), ("volados", "Volados", 0.75), ("muertos", "Muertos", 0.75)]
COLUMNAS = [c for c in COLUMNAS if c[0] not in ("proyecto", "campana") or any(not vacio(n.get(c[0])) for n in NIDOS)]
FILAS = 11
escala = 12.3 / sum(c[2] for c in COLUMNAS)
paginas = [NIDOS[i:i + FILAS] for i in range(0, len(NIDOS), FILAS)] or [[]]
for i, grupo in enumerate(paginas, 1):
    d = diapositiva(f"Nidos ({i}/{len(paginas)}) · {AMBITO}")
    tabla = d.shapes.add_table(len(grupo) + 1, len(COLUMNAS), Inches(0.5), Inches(1.1), Inches(12.3), Inches(0.42 * (len(grupo) + 1))).table
    for j, (_, etiqueta, ancho) in enumerate(COLUMNAS):
        tabla.columns[j].width = Inches(ancho * escala)
    for fila in range(len(grupo) + 1):
        for j, (clave, etiqueta, _) in enumerate(COLUMNAS):
            celda = tabla.cell(fila, j)
            valor = etiqueta if fila == 0 else ("" if vacio(grupo[fila - 1].get(clave)) else str(grupo[fila - 1][clave]).strip())
            celda.text = valor
            celda.fill.solid()
            celda.fill.fore_color.rgb = VERDE_OSC if fila == 0 else (GRIS if fila % 2 == 0 else BLANCO)
            for p in celda.text_frame.paragraphs:
                for r in p.runs:
                    r.font.size, r.font.name, r.font.bold = Pt(11 if fila == 0 else 10.5), "Arial", fila == 0
                    r.font.color.rgb = BLANCO if fila == 0 else TEXTO

NOMBRE = DATOS["nombre_pptx"]
prs.save(NOMBRE)
print(f"Presentación creada: {NOMBRE} · {len(prs.slides)} diapositivas")
if EN_COLAB:
    files.download(NOMBRE)
else:
    print("(Fuera de Colab: el archivo queda guardado en la carpeta actual.)")`;
