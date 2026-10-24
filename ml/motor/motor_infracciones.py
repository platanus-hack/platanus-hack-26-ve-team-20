"""Motor de infracciones de tránsito con cámara fija: vehículos + placas + OCR + reglas por cámara.

Infracciones (cada una se activa si su sección existe en la configuración de la cámara, ver camara_ejemplo.json):
  semaforo_rojo     cruzar la línea de pare con el semáforo en rojo (amarillo cuenta como verde)
  exceso_velocidad  velocidad medida en la zona de velocidad por encima de limite + tolerancia (requiere homografía)
  contravia         moverse dentro de un carril en sentido contrario a su flecha permitida
  pare              cruzar la línea del PARE sin haberse detenido el tiempo mínimo en la zona de parada
  giro_prohibido    pasar de una zona a otra que no está en movimientos_permitidos
  vuelta_en_u       salir y volver a entrar por la misma zona (si ese par no está permitido)
  linea_continua    cruzar una línea continua dibujada

Uso desde la app:

    from motor_infracciones import MotorInfracciones
    motor = MotorInfracciones("vehiculos.pt", "placas.pt", config="camara.json")
    salida = motor.procesar_frame(frame, "rojo")   # el estado lo manda el semáforo: "rojo", "verde" o "amarillo"
    salida["frame"]                # imagen anotada para mostrar
    salida["infracciones_nuevas"]  # infracciones recién detectadas (la placa todavía se está leyendo)
    salida["multas_listas"]        # multas cerradas, con placa leída y evidencias guardadas en disco
    motor.finalizar()              # al terminar, cierra lo pendiente

La velocidad es una ESTIMACIÓN NO METROLÓGICA: sirve para pruebas y analítica, no para multar sin un
instrumento homologado. Usa un motor nuevo por cámara o por video (el tracker guarda estado).
"""
import json
import math
import re
import time
from collections import Counter, deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

CLASES_COCO_VEHICULOS = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
COLORES = {"rojo": (0, 0, 255), "amarillo": (0, 215, 255), "verde": (0, 200, 0), "desconocido": (160, 160, 160)}
TIPOS = {
    "semaforo_rojo": "Cruce con semáforo en rojo",
    "exceso_velocidad": "Exceso de velocidad (estimación no metrológica)",
    "contravia": "Circular en contravía",
    "pare": "No respetar el PARE",
    "giro_prohibido": "Giro prohibido",
    "vuelta_en_u": "Vuelta en U prohibida",
    "linea_continua": "Cruzar línea continua",
}
CORTOS = {"semaforo_rojo": "ROJO", "exceso_velocidad": "VEL", "contravia": "CONTRAVIA", "pare": "PARE",
          "giro_prohibido": "GIRO", "vuelta_en_u": "U", "linea_continua": "LINEA"}
DEFAULTS = {
    "velocidad": {"limite_kmh": 40, "tolerancia_kmh": 5, "distancia_min_m": 8.0, "tiempo_min_s": 0.5},
    "pare": {"vel_max_kmh": 3.0, "vel_max_px_s": 15, "segundos_min": 1.0},
    "contravia": {"angulo_min": 135, "ventana_s": 1.0, "desplazamiento_min_m": 2.0, "desplazamiento_min_px": 25,
                  "duracion_min_s": 0.7, "edad_min_s": 0.5},
    "giros": {"debounce_frames": 3},
    "lineas": {"margen_px": 6},
}
PLANTILLAS_VE = {
    "particular": "LLDDDLL",   # AB123CD (la última letra es el estado)
    "moto": "LLDLDDL",         # AB1C23D
    "carga": "LDDLLDL",        # A12BC3D
}
REGEX_GENERICA = r"^[A-Z0-9]{6,8}$"
ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
A_LETRA = {"0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "7": "T", "8": "B"}
A_DIGITO = {"O": "0", "Q": "0", "D": "0", "U": "0", "I": "1", "L": "1", "T": "7", "Z": "2",
            "S": "5", "G": "6", "B": "8", "A": "4"}
_INICIO = "__inicio__"


# ---------------------------------------------------------------- semáforo
def normalizar_estado(estado):
    e = str(estado).strip().lower()
    if e in ("rojo", "red", "r"):
        return "rojo"
    if e in ("amarillo", "yellow", "a", "y"):
        return "amarillo"
    if e in ("verde", "green", "v", "g"):
        return "verde"
    return "desconocido"


def estado_ciclo(t, ciclo):
    """Semáforo simulado que se repite. ciclo = [("verde", 10), ("amarillo", 3), ("rojo", 12)] en segundos."""
    total = sum(d for _, d in ciclo)
    r = t % total
    for e, d in ciclo:
        if r < d:
            return e
        r -= d
    return ciclo[-1][0]


def color_dominante(crop):
    """Color encendido en un recorte de semáforo real (por HSV)."""
    if crop is None or crop.size == 0:
        return "desconocido"
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    brillante = (v > 150) & (s > 90)
    cuentas = {
        "rojo": int((brillante & ((h <= 10) | (h >= 160))).sum()),
        "amarillo": int((brillante & (h > 10) & (h <= 35)).sum()),
        "verde": int((brillante & (h >= 40) & (h <= 100)).sum()),
    }
    mejor = max(cuentas, key=cuentas.get)
    return mejor if cuentas[mejor] >= max(4, int(0.01 * crop.shape[0] * crop.shape[1])) else "desconocido"


class SemaforoVisual:
    """Opcional: lee un semáforo real que se vea en la cámara, dado su rectángulo (x, y, w, h)."""

    def __init__(self, roi, suavizado=5):
        self.roi, self.hist = roi, deque(maxlen=max(1, suavizado))

    def update(self, frame):
        x, y, w, h = self.roi
        est = color_dominante(frame[y:y + h, x:x + w])
        if est != "desconocido":
            self.hist.append(est)
        return Counter(self.hist).most_common(1)[0][0] if self.hist else "desconocido"


# ---------------------------------------------------------------- geometría
def lado(p, a, b):
    v = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    return 1 if v > 0 else (-1 if v < 0 else 0)


def distancia_signada(p, a, b):
    v = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    return v / max(1e-9, math.hypot(b[0] - a[0], b[1] - a[1]))


def dentro_segmento(p, a, b, margen=0.05):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / max(1e-9, dx * dx + dy * dy)
    return -margen <= t <= 1 + margen


def dentro_poligono(p, poligono):
    poly = poligono if isinstance(poligono, np.ndarray) else np.asarray(poligono, np.float32)
    return cv2.pointPolygonTest(poly, (float(p[0]), float(p[1])), False) >= 0


def angulo(u, v):
    nu, nv = math.hypot(*u), math.hypot(*v)
    if nu < 1e-9 or nv < 1e-9:
        return 0.0
    c = max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)))
    return math.degrees(math.acos(c))


def config_linea(W, H, linea_pare=None, punto_despues=None):
    """Devuelve (a, b, lado_despues, punto_despues). Por defecto: línea horizontal al 60% y 'después' arriba."""
    if linea_pare:
        a, b = tuple(map(int, linea_pare[0])), tuple(map(int, linea_pare[1]))
    else:
        a, b = (0, int(H * 0.6)), (W - 1, int(H * 0.6))
    pd = tuple(map(int, punto_despues)) if punto_despues else ((a[0] + b[0]) // 2, max(0, min(a[1], b[1]) - 50))
    s = lado(pd, a, b)
    if s == 0:
        raise ValueError("punto_despues está sobre la línea; muévelo hacia la intersección")
    return a, b, s, pd


def recorte(frame, caja, pad=0.05):
    H, W = frame.shape[:2]
    x1, y1, x2, y2 = [float(v) for v in caja]
    pw, ph = (x2 - x1) * pad, (y2 - y1) * pad
    x1, y1 = int(max(0, x1 - pw)), int(max(0, y1 - ph))
    x2, y2 = int(min(W, x2 + pw)), int(min(H, y2 + ph))
    return frame[y1:y2, x1:x2].copy()


class Homografia:
    """Convierte píxeles del piso a metros reales a partir de 4 o más puntos medidos en el pavimento."""

    def __init__(self, imagen, mundo):
        src = np.asarray(imagen, np.float32).reshape(-1, 2)
        dst = np.asarray(mundo, np.float32).reshape(-1, 2)
        if len(src) < 4 or len(src) != len(dst):
            raise ValueError("La homografía necesita 4 o más pares de puntos imagen/mundo")
        self.H, _ = cv2.findHomography(src, dst, cv2.RANSAC if len(src) > 4 else 0)
        if self.H is None:
            raise ValueError("No se pudo calcular la homografía; revisa que no haya 3 puntos alineados")
        self.error_m = float(np.mean(np.linalg.norm(self.a_metros_lote(src) - dst, axis=1)))

    def a_metros_lote(self, pts):
        return cv2.perspectiveTransform(np.asarray(pts, np.float32).reshape(-1, 1, 2), self.H).reshape(-1, 2)

    def a_metros(self, p):
        x, y = self.a_metros_lote([p])[0]
        return float(x), float(y)


# ---------------------------------------------------------------- configuración por cámara
def cargar_config(config=None, linea_pare=None, punto_despues=None):
    """Lee la configuración (ruta a JSON o dict), aplica valores por defecto y la línea de pare legada."""
    if config is None:
        cfg = {}
    elif isinstance(config, (str, Path)):
        cfg = json.loads(Path(config).read_text(encoding="utf-8"))
    else:
        cfg = json.loads(json.dumps(config))
    cfg = {k: v for k, v in cfg.items() if not str(k).startswith("_")}
    if linea_pare:
        cfg["linea_pare"] = [list(linea_pare[0]), list(linea_pare[1])]
    if punto_despues:
        cfg["punto_despues"] = list(punto_despues)
    for k in ("velocidad", "pare"):
        if cfg.get(k):
            cfg[k] = {**DEFAULTS[k], **cfg[k]}
    for k in ("contravia", "giros", "lineas"):
        cfg[k] = {**DEFAULTS[k], **(cfg.get(k) or {})}
    return cfg


def escalar_config(cfg, W, H):
    """Si la configuración se dibujó con otra resolución, escala todos los puntos al tamaño del frame."""
    res = cfg.get("resolucion")
    if not res:
        return cfg
    sx, sy = W / float(res[0]), H / float(res[1])
    if abs(sx - 1) < 1e-6 and abs(sy - 1) < 1e-6:
        return cfg
    c = json.loads(json.dumps(cfg))

    def P(p):
        return [p[0] * sx, p[1] * sy]

    def L(ps):
        return [P(p) for p in ps]

    if c.get("linea_pare"):
        c["linea_pare"] = L(c["linea_pare"])
    if c.get("punto_despues"):
        c["punto_despues"] = P(c["punto_despues"])
    for car in c.get("carriles", []):
        car["poligono"], car["direccion"] = L(car["poligono"]), L(car["direccion"])
    for k in list(c.get("zonas", {})):
        c["zonas"][k] = L(c["zonas"][k])
    if c.get("pare"):
        c["pare"]["zona"], c["pare"]["linea"] = L(c["pare"]["zona"]), L(c["pare"]["linea"])
        if c["pare"].get("punto_despues"):
            c["pare"]["punto_despues"] = P(c["pare"]["punto_despues"])
    if c.get("velocidad"):
        c["velocidad"]["zona"] = L(c["velocidad"]["zona"])
    c["lineas_continuas"] = [L(l) for l in c.get("lineas_continuas", [])]
    if c.get("homografia"):
        c["homografia"]["imagen"] = L(c["homografia"]["imagen"])
    c["resolucion"] = [W, H]
    return c


def _ip(p):
    return int(round(p[0])), int(round(p[1]))


def dibujar_config(vis, cfg):
    """Dibuja las reglas configuradas (carriles, zonas, PARE, velocidad, líneas continuas)."""
    for car in cfg.get("carriles", []):
        pts = np.asarray(car["poligono"], np.int32)
        cv2.polylines(vis, [pts], True, (150, 150, 150), 1)
        d0, d1 = car["direccion"]
        cv2.arrowedLine(vis, _ip(d0), _ip(d1), (0, 220, 0), 2, tipLength=0.25)
        cv2.putText(vis, car.get("nombre", ""), _ip(car["poligono"][0]), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 0), 1)
    for nombre, poly in cfg.get("zonas", {}).items():
        pts = np.asarray(poly, np.int32)
        cv2.polylines(vis, [pts], True, (255, 255, 0), 1)
        c = pts.mean(axis=0).astype(int)
        cv2.putText(vis, str(nombre), (int(c[0]), int(c[1])), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)
    if cfg.get("pare"):
        cv2.polylines(vis, [np.asarray(cfg["pare"]["zona"], np.int32)], True, (0, 140, 255), 1)
        a, b = cfg["pare"]["linea"]
        cv2.line(vis, _ip(a), _ip(b), (0, 140, 255), 3)
        cv2.putText(vis, "PARE", _ip(a), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 140, 255), 2)
    if cfg.get("velocidad"):
        cv2.polylines(vis, [np.asarray(cfg["velocidad"]["zona"], np.int32)], True, (255, 0, 255), 1)
        cv2.putText(vis, f"max {cfg['velocidad'].get('limite_kmh', '?')} km/h", _ip(cfg["velocidad"]["zona"][0]),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 255), 1)
    for l in cfg.get("lineas_continuas", []):
        cv2.polylines(vis, [np.asarray(l, np.int32)], False, (255, 255, 255), 2)
    for p in (cfg.get("homografia") or {}).get("imagen", []):
        cv2.drawMarker(vis, _ip(p), (0, 255, 255), cv2.MARKER_CROSS, 12, 2)
    return vis


# ---------------------------------------------------------------- placas
MAX_CORRECCIONES = 2   # máximo de caracteres que el corrector puede cambiar para encajar en un formato


def ajustar_plantilla(txt, plantilla, max_correcciones=MAX_CORRECCIONES):
    """Ajusta txt al formato (L = letra, D = dígito). Devuelve (texto, cambios) o None si no encaja."""
    if len(txt) != len(plantilla):
        return None
    out, cambios = [], 0
    for ch, t in zip(txt, plantilla):
        nuevo = A_LETRA.get(ch, ch) if t == "L" else A_DIGITO.get(ch, ch)
        if (t == "L" and not nuevo.isalpha()) or (t == "D" and not nuevo.isdigit()):
            return None
        cambios += nuevo != ch
        out.append(nuevo)
    if cambios > max_correcciones:
        return None
    return "".join(out), cambios


def normalizar_placa(texto, plantillas=None, regex_generica=REGEX_GENERICA, preferida=None,
                     max_correcciones=MAX_CORRECCIONES):
    """Busca en el texto del OCR un tramo con formato de placa venezolana y corrige confusiones típicas
    (0/O, 1/I, 5/S, 8/B), pero como máximo max_correcciones caracteres. Si hacen falta más, deja la
    lectura original como 'generica' en vez de inventar una placa."""
    plantillas = plantillas or PLANTILLAS_VE
    t = re.sub(r"[^A-Z0-9]", "", str(texto).upper())
    for exacto in (True, False):
        candidatos = []
        for k, (nombre, pl) in enumerate(plantillas.items()):
            L = len(pl)
            if exacto and len(t) != L:
                continue
            for i in range(0, max(0, len(t) - L) + 1):
                r = ajustar_plantilla(t[i:i + L], pl, max_correcciones)
                if r:
                    candidatos.append((r[1], nombre != preferida, k, i, r[0], nombre))
        if candidatos:   # gana el formato que necesita menos correcciones (en empate, el preferido y luego el orden)
            *_, fijo, nombre = min(candidatos)
            return fijo, nombre
    if re.match(regex_generica, t):
        return t, "generica"
    return None, None


def unir_texto_ocr(resultados):
    """Une las cajas de EasyOCR por filas (las placas de moto vienen en dos) e ignora letreros pequeños."""
    if not resultados:
        return "", 0.0
    items = []
    for caja, txt, conf in resultados:
        xs, ys = [p[0] for p in caja], [p[1] for p in caja]
        items.append({"t": txt, "c": float(conf), "cx": (min(xs) + max(xs)) / 2,
                      "cy": (min(ys) + max(ys)) / 2, "h": max(ys) - min(ys)})
    hmax = max(it["h"] for it in items)
    items = sorted([it for it in items if it["h"] >= 0.5 * hmax], key=lambda it: it["cy"])
    filas = []
    for it in items:
        if filas and abs(it["cy"] - filas[-1][-1]["cy"]) < 0.5 * hmax:
            filas[-1].append(it)
        else:
            filas.append([it])
    texto = "".join(it["t"] for fila in filas for it in sorted(fila, key=lambda z: z["cx"]))
    return texto, float(np.mean([it["c"] for it in items]))


def preparar_placa(img):
    h, w = img.shape[:2]
    escala = 96 / max(1, h)
    img = cv2.resize(img, (max(1, int(w * escala)), 96), interpolation=cv2.INTER_CUBIC)
    gris = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4)).apply(gris)


def votar(lecturas):
    """Elige la placa más probable: voto ponderado por confianza y, con 3+ lecturas, voto por carácter."""
    validas = [l for l in lecturas if l and l.get("placa")]
    if not validas:
        return None, 0.0, 0
    puntos = Counter()
    for l in validas:
        puntos[l["placa"]] += (l["conf"] + 1e-3) * (1.0 if l["tipo"] != "generica" else 0.5)
    ganadora = puntos.most_common(1)[0][0]
    confianza = puntos[ganadora] / sum(puntos.values())
    tipo_g = next(l["tipo"] for l in validas if l["placa"] == ganadora)
    grupo = [l for l in validas if l["tipo"] == tipo_g and len(l["placa"]) == len(ganadora)]
    if len(grupo) >= 3:
        chars, acuerdos = [], []
        for i in range(len(ganadora)):
            c = Counter()
            for l in grupo:
                c[l["placa"][i]] += l["conf"] + 1e-3
            ch, peso = c.most_common(1)[0]
            chars.append(ch)
            acuerdos.append(peso / sum(c.values()))
        ganadora, confianza = "".join(chars), float(np.mean(acuerdos))
    return ganadora, float(confianza), len(validas)


class LectorPlacas:
    """Detecta la placa dentro del recorte de un vehículo y la lee con OCR."""

    def __init__(self, modelo_placas, lector_ocr, conf=0.30, imgsz=640, device=None,
                 plantillas=None, regex_generica=REGEX_GENERICA, max_correcciones=MAX_CORRECCIONES):
        self.modelo, self.lector_ocr = modelo_placas, lector_ocr
        self.conf, self.imgsz, self.device = conf, imgsz, device
        self.plantillas, self.regex = plantillas or PLANTILLAS_VE, regex_generica
        self.max_correcciones = max_correcciones

    @classmethod
    def desde_pesos(cls, pesos_placas, gpu=None, **kw):
        from ultralytics import YOLO
        import easyocr
        if gpu is None:
            try:
                import torch
                gpu = torch.cuda.is_available()
            except ImportError:
                gpu = False
        return cls(YOLO(str(pesos_placas)), easyocr.Reader(["en"], gpu=gpu, verbose=False), **kw)

    def leer_texto(self, img):
        if img is None or img.size == 0 or self.lector_ocr is None:
            return "", 0.0
        res = self.lector_ocr.readtext(preparar_placa(img), allowlist=ALNUM, detail=1, paragraph=False)
        return unir_texto_ocr(res)

    def leer(self, recorte_vehiculo, clase_vehiculo=None):
        if recorte_vehiculo is None or recorte_vehiculo.size == 0 or min(recorte_vehiculo.shape[:2]) < 16:
            return None
        kw = {"conf": self.conf, "imgsz": self.imgsz, "verbose": False}
        if self.device is not None:
            kw["device"] = self.device
        r = self.modelo.predict(recorte_vehiculo, **kw)[0]
        if r.boxes is None or len(r.boxes) == 0:
            return None
        confs = r.boxes.conf.cpu().numpy()
        k = int(np.argmax(confs))
        placa = recorte(recorte_vehiculo, r.boxes.xyxy[k].cpu().numpy(), pad=0.06)
        texto, conf_ocr = self.leer_texto(placa)
        norm, tipo = normalizar_placa(texto, self.plantillas, self.regex,
                                      preferida="moto" if clase_vehiculo == "motorcycle" else None,
                                      max_correcciones=self.max_correcciones)
        return {"crudo": texto, "placa": norm, "tipo": tipo, "conf": float(confs[k]) * conf_ocr, "img": placa}


# ---------------------------------------------------------------- motor
class MotorInfracciones:
    def __init__(self, pesos_vehiculos="yolo11n.pt", pesos_placas=None, config=None, linea_pare=None,
                 punto_despues=None, usar_coco=False, device=None, conf_vehiculos=0.35, imgsz_vehiculos=640,
                 conf_placas=0.30, imgsz_placas=640, tracker="bytetrack.yaml", carpeta_evidencias="evidencias",
                 amarillo_es_rojo=False, leer_cada=3, buffer_recortes=6, frames_despues=30, max_lecturas=10,
                 plantillas=None, en_multa=None, pesos_senales=None, dibujar_reglas=True,
                 modelo_vehiculos=None, lector_placas=None, modelo_senales=None,
                 max_correcciones=MAX_CORRECCIONES):
        if modelo_vehiculos is None:
            from ultralytics import YOLO
            modelo_vehiculos = YOLO(str(pesos_vehiculos))
        self.modelo = modelo_vehiculos
        self.nombres = dict(CLASES_COCO_VEHICULOS) if usar_coco else {int(k): v for k, v in self.modelo.names.items()}
        if lector_placas is None and pesos_placas:
            lector_placas = LectorPlacas.desde_pesos(pesos_placas, conf=conf_placas, imgsz=imgsz_placas,
                                                     device=device, plantillas=plantillas,
                                                     max_correcciones=max_correcciones)
        self.lector = lector_placas
        if modelo_senales is None and pesos_senales:
            from ultralytics import YOLO
            modelo_senales = YOLO(str(pesos_senales))
        self.modelo_senales = modelo_senales
        self.cfg_base = cargar_config(config, linea_pare, punto_despues)
        self.device, self.conf, self.imgsz, self.tracker = device, conf_vehiculos, imgsz_vehiculos, tracker
        self.carpeta = Path(carpeta_evidencias)
        self.carpeta.mkdir(parents=True, exist_ok=True)
        self.amarillo_es_rojo = amarillo_es_rojo
        self.leer_cada, self.buffer_recortes = max(1, leer_cada), buffer_recortes
        self.frames_despues, self.max_lecturas = frames_despues, max_lecturas
        self.en_multa, self.dibujar_reglas = en_multa, dibujar_reglas
        self._pool = ThreadPoolExecutor(max_workers=1)   # OCR y señales corren aparte para no congelar el video
        self._tam, self._t0 = None, None
        self.idx, self.pistas, self.pendientes, self.multas = 0, {}, [], []

    # ------------------------------------------------------------------- preparación por tamaño de frame
    def _preparar(self, W, H):
        cfg = escalar_config(self.cfg_base, W, H)
        self.cfg = cfg
        self.Hm = Homografia(**cfg["homografia"]) if cfg.get("homografia") else None
        self._a, self._b, self._lado_despues, _ = config_linea(W, H, cfg.get("linea_pare"), cfg.get("punto_despues"))
        self._carriles = []
        for car in cfg.get("carriles", []):
            d0, d1 = car["direccion"]
            c = {"nombre": car.get("nombre", f"C{len(self._carriles) + 1}"),
                 "poly": np.asarray(car["poligono"], np.float32), "dir_px": (d1[0] - d0[0], d1[1] - d0[1])}
            if self.Hm:
                m0, m1 = self.Hm.a_metros(d0), self.Hm.a_metros(d1)
                c["dir_m"] = (m1[0] - m0[0], m1[1] - m0[1])
            self._carriles.append(c)
        self._zonas = {str(n): np.asarray(p, np.float32) for n, p in cfg.get("zonas", {}).items()}
        perm = cfg.get("movimientos_permitidos")
        self._permitidos = None if perm is None else {(str(a), str(b)) for a, b in perm}
        pc = cfg.get("pare")
        if pc:
            self._zona_pare = np.asarray(pc["zona"], np.float32)
            self._pa, self._pb, self._lado_despues_pare, _ = config_linea(W, H, pc["linea"], pc.get("punto_despues"))
        self._zona_vel = np.asarray(cfg["velocidad"]["zona"], np.float32) if cfg.get("velocidad") else None
        self._lineas = [[tuple(p) for p in l] for l in cfg.get("lineas_continuas", [])]
        self._tam = (W, H)

    def reglas_activas(self):
        """Texto con las reglas que va a aplicar este motor (útil para imprimir al arrancar)."""
        cfg = self.cfg_base
        r = ["semáforo en rojo"]
        if cfg.get("velocidad"):
            v = cfg["velocidad"]
            hom = "con homografía" if cfg.get("homografia") else "SIN homografía (no se medirá)"
            r.append(f"velocidad (límite {v['limite_kmh']} + {v['tolerancia_kmh']} km/h, {hom})")
        if cfg.get("carriles"):
            r.append(f"contravía ({len(cfg['carriles'])} carriles)")
        if cfg.get("pare"):
            r.append(f"PARE (mínimo {cfg['pare']['segundos_min']} s detenido)")
        if cfg.get("zonas") and cfg.get("movimientos_permitidos") is not None:
            r.append(f"giros y vuelta en U ({len(cfg['zonas'])} zonas)")
        if cfg.get("lineas_continuas"):
            r.append(f"línea continua ({len(cfg['lineas_continuas'])})")
        if self.modelo_senales is not None:
            r.append("detector de señales como evidencia")
        return ", ".join(r)

    # ------------------------------------------------------------------- bucle por frame
    def procesar_frame(self, frame, estado_semaforo, t=None):
        if self._t0 is None:
            self._t0 = time.time()
        t = (time.time() - self._t0) if t is None else float(t)
        estado = normalizar_estado(estado_semaforo)
        en_rojo = estado == "rojo" or (self.amarillo_es_rojo and estado == "amarillo")
        H, W = frame.shape[:2]
        if self._tam != (W, H):
            self._preparar(W, H)

        kw = {"persist": True, "tracker": self.tracker, "conf": self.conf, "classes": list(self.nombres),
              "imgsz": self.imgsz, "verbose": False}
        if self.device is not None:
            kw["device"] = self.device
        res = self.modelo.track(frame, **kw)[0]
        vis = frame.copy()
        if self.dibujar_reglas:
            dibujar_config(vis, self.cfg)
        nuevas = []
        if res.boxes is not None and res.boxes.id is not None:
            cajas = res.boxes.xyxy.cpu().numpy()
            ids = res.boxes.id.int().cpu().tolist()
            clss = res.boxes.cls.int().cpu().tolist()
            for caja, tid, c in zip(cajas, ids, clss):
                nombre = self.nombres.get(c, str(c))
                p = (float((caja[0] + caja[2]) / 2), float(caja[3]))   # punto de contacto con el piso
                pm = self.Hm.a_metros(p) if self.Hm else (None, None)
                pi = self._pista(tid, nombre, t)
                pi["visto"] = self.idx
                pi["hist"].append((t, p[0], p[1], pm[0], pm[1]))
                while pi["hist"] and t - pi["hist"][0][0] > 5.0:
                    pi["hist"].popleft()
                if self.idx % self.leer_cada == 0:
                    pi["buffer"].append(recorte(frame, caja))
                eventos = (self._regla_semaforo(pi, p, en_rojo) + self._regla_velocidad(pi, p, pm, t)
                           + self._regla_contravia(pi, p, t) + self._regla_pare(pi, p, t)
                           + self._regla_giros(pi, p) + self._regla_lineas(pi, p))
                for tipo, detalle in eventos:
                    if tipo in pi["tipos"]:
                        continue
                    pi["tipos"].add(tipo)
                    nuevas.append(self._registrar(tid, pi, frame, caja, tipo, detalle, estado, t))
                self._lecturas_post(pi, frame, caja)
                self._dibujar_vehiculo(vis, caja, p, nombre, tid, pi)

        self._dibujar_hud(vis, estado)
        for inf in nuevas:
            cv2.imwrite(str(Path(inf["carpeta"]) / "escena.jpg"), vis)
        listas = self._cerrar_pendientes()
        self._podar()
        self.idx += 1
        return {"frame": vis, "estado": estado, "infracciones_nuevas": nuevas, "multas_listas": listas}

    def finalizar(self):
        """Espera las lecturas pendientes y cierra todas las multas. Devuelve la lista completa."""
        self._cerrar_pendientes(forzar=True)
        self._pool.shutdown(wait=True)
        return self.multas

    # ------------------------------------------------------------------- estado por vehículo
    def _pista(self, tid, nombre, t):
        if tid not in self.pistas:
            self.pistas[tid] = {
                "clase": nombre, "t0": t, "visto": self.idx, "hist": deque(), "tipos": set(), "casos": [],
                "buffer": deque(maxlen=self.buffer_recortes), "lado_sem": None, "kmh": None, "vel_muestras": [],
                "contra_desde": None, "pare_desde": None, "pare_max": 0.0, "lado_pare": None,
                "zonas": [], "zona_conf": _INICIO, "zona_cand": None, "zona_cnt": 0, "giro_eval": False, "lc": {},
            }
        return self.pistas[tid]

    def _vel_ventana(self, pi, ventana, metros=True):
        """Velocidad media y desplazamiento en la última ventana (m/s con homografía, px/s sin ella)."""
        h = pi["hist"]
        if len(h) < 2:
            return None, None
        fin = h[-1]
        ini = next((x for x in h if fin[0] - x[0] <= ventana), h[0])
        dt = fin[0] - ini[0]
        if dt <= 1e-6:
            return None, None
        if metros and self.Hm is not None:
            d = (fin[3] - ini[3], fin[4] - ini[4])
        else:
            d = (fin[1] - ini[1], fin[2] - ini[2])
        return math.hypot(*d) / dt, d

    # ------------------------------------------------------------------- reglas
    def _regla_semaforo(self, pi, p, en_rojo):
        s = lado(p, self._a, self._b)
        cruzo = (pi["lado_sem"] is not None and pi["lado_sem"] != self._lado_despues
                 and s == self._lado_despues and dentro_segmento(p, self._a, self._b))
        if s != 0:
            pi["lado_sem"] = s
        return [("semaforo_rojo", {})] if (cruzo and en_rojo) else []

    def _regla_velocidad(self, pi, p, pm, t):
        vc = self.cfg.get("velocidad")
        if not vc or self.Hm is None:
            return []
        if dentro_poligono(p, self._zona_vel):
            pi["vel_muestras"].append((t, pm[0], pm[1]))
            return []
        mu, pi["vel_muestras"] = pi["vel_muestras"], []
        if len(mu) < 3:
            return []
        ts, xs, ys = (np.array([m[i] for m in mu], float) for i in range(3))
        dt, dist = ts[-1] - ts[0], math.hypot(xs[-1] - xs[0], ys[-1] - ys[0])
        if dt < vc["tiempo_min_s"] or dist < vc["distancia_min_m"]:
            return []
        vx, vy = np.polyfit(ts, xs, 1)[0], np.polyfit(ts, ys, 1)[0]   # pendiente robusta sobre toda la zona
        kmh = float(math.hypot(vx, vy) * 3.6)
        pi["kmh"] = kmh
        if kmh > vc["limite_kmh"] + vc["tolerancia_kmh"]:
            return [("exceso_velocidad", {"velocidad_kmh": round(kmh, 1), "limite_kmh": vc["limite_kmh"],
                                          "tolerancia_kmh": vc["tolerancia_kmh"], "distancia_m": round(dist, 1),
                                          "tiempo_s": round(float(dt), 2), "metodo": "homografia",
                                          "error_homografia_m": round(self.Hm.error_m, 3),
                                          "nota": "estimación no metrológica"})]
        return []

    def _regla_contravia(self, pi, p, t):
        if not self._carriles:
            return []
        cc = self.cfg["contravia"]
        carril = next((c for c in self._carriles if dentro_poligono(p, c["poly"])), None)
        if carril is None or t - pi["t0"] < cc["edad_min_s"]:
            pi["contra_desde"] = None
            return []
        usar_m = self.Hm is not None
        _, d = self._vel_ventana(pi, cc["ventana_s"], metros=usar_m)
        minimo = cc["desplazamiento_min_m"] if usar_m else cc["desplazamiento_min_px"]
        if d is None or math.hypot(*d) < minimo:
            return []   # sin movimiento suficiente no cambia el estado
        ang = angulo(d, carril["dir_m"] if usar_m else carril["dir_px"])
        if ang < cc["angulo_min"]:
            pi["contra_desde"] = None
            return []
        if pi["contra_desde"] is None:
            pi["contra_desde"] = t
        if t - pi["contra_desde"] >= cc["duracion_min_s"]:
            return [("contravia", {"carril": carril["nombre"], "angulo": round(ang)})]
        return []

    def _regla_pare(self, pi, p, t):
        pc = self.cfg.get("pare")
        if not pc:
            return []
        if dentro_poligono(p, self._zona_pare):
            usar_m = self.Hm is not None
            v, _ = self._vel_ventana(pi, 0.4, metros=usar_m)
            if v is not None:
                limite = pc["vel_max_kmh"] / 3.6 if usar_m else pc["vel_max_px_s"]
                if v <= limite:
                    if pi["pare_desde"] is None:
                        pi["pare_desde"] = t
                    pi["pare_max"] = max(pi["pare_max"], t - pi["pare_desde"])
                else:
                    pi["pare_desde"] = None
        s = lado(p, self._pa, self._pb)
        cruzo = (pi["lado_pare"] is not None and pi["lado_pare"] != self._lado_despues_pare
                 and s == self._lado_despues_pare and dentro_segmento(p, self._pa, self._pb))
        if s != 0:
            pi["lado_pare"] = s
        if cruzo and pi["pare_max"] < pc["segundos_min"]:
            return [("pare", {"tiempo_detenido_s": round(pi["pare_max"], 2), "minimo_s": pc["segundos_min"]})]
        return []

    def _regla_giros(self, pi, p):
        if not self._zonas or self._permitidos is None:
            return []
        z = next((n for n, poly in self._zonas.items() if dentro_poligono(p, poly)), None)
        if z == pi["zona_conf"]:
            pi["zona_cand"], pi["zona_cnt"] = None, 0
            return []
        if z == pi["zona_cand"]:
            pi["zona_cnt"] += 1
        else:
            pi["zona_cand"], pi["zona_cnt"] = z, 1
        if pi["zona_conf"] != _INICIO and pi["zona_cnt"] < self.cfg["giros"]["debounce_frames"]:
            return []
        pi["zona_conf"], pi["zona_cand"], pi["zona_cnt"] = z, None, 0
        pi["zonas"].append(z)
        if z is None or pi["giro_eval"]:
            return []
        previas = [x for x in pi["zonas"][:-1] if x is not None]
        if not previas:
            return []
        pi["giro_eval"] = True
        origen = previas[0]
        if (origen, z) in self._permitidos:
            return []
        return [("vuelta_en_u" if origen == z else "giro_prohibido", {"desde": origen, "hacia": z})]

    def _regla_lineas(self, pi, p):
        if not self._lineas:
            return []
        margen = self.cfg["lineas"]["margen_px"]
        for i, poly in enumerate(self._lineas):
            for j in range(len(poly) - 1):
                a, b = poly[j], poly[j + 1]
                if not dentro_segmento(p, a, b, 0.0):
                    continue
                d = distancia_signada(p, a, b)
                if abs(d) < margen:
                    continue
                s = 1 if d > 0 else -1
                previo = pi["lc"].get((i, j))
                pi["lc"][(i, j)] = s
                if previo is not None and previo != s:
                    return [("linea_continua", {"linea": i})]
        return []

    # ------------------------------------------------------------------- multas y placas
    def _encolar(self, futuros, rc, clase):
        if self.lector is not None and len(futuros) < self.max_lecturas:
            futuros.append(self._pool.submit(self.lector.leer, rc, clase))

    def _registrar(self, tid, pi, frame, caja, tipo, detalle, estado, t):
        abierto = next((c for c in reversed(pi["casos"]) if not c["cerrado"]), None)
        futuros = abierto["futuros"] if abierto else []   # dos infracciones simultáneas comparten las lecturas
        if abierto is None:
            for rc in sorted(pi["buffer"], key=lambda r: r.shape[0] * r.shape[1], reverse=True)[:3]:
                self._encolar(futuros, rc, pi["clase"])   # los recortes de antes suelen mostrar mejor la placa
        ahora = datetime.now()
        carpeta = self.carpeta / f"{ahora:%Y%m%d_%H%M%S}_{tipo}_id{tid:04d}"
        carpeta.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(carpeta / "vehiculo.jpg"), recorte(frame, caja, 0.1))
        caso = {"tid": tid, "frame_inf": self.idx, "futuros": futuros, "senales": None, "cerrado": False,
                "inf": {"id": tid, "clase": pi["clase"], "tipo": tipo, "descripcion": TIPOS[tipo], "detalle": detalle,
                        "fecha_hora": ahora.isoformat(timespec="seconds"), "segundo": round(t, 2),
                        "frame": self.idx, "estado_semaforo": estado, "carpeta": str(carpeta)}}
        if self.modelo_senales is not None:
            caso["senales"] = self._pool.submit(self._detectar_senales, frame.copy())
        pi["casos"].append(caso)
        self.pendientes.append(caso)
        return dict(caso["inf"])

    def _detectar_senales(self, frame):
        kw = {"conf": 0.35, "verbose": False}
        if self.device is not None:
            kw["device"] = self.device
        r = self.modelo_senales.predict(frame, **kw)[0]
        if r.boxes is None or len(r.boxes) == 0:
            return []
        nombres = self.modelo_senales.names
        return [{"clase": nombres[int(c)], "conf": round(float(s), 2)}
                for c, s in zip(r.boxes.cls.cpu().numpy(), r.boxes.conf.cpu().numpy())]

    def _lecturas_post(self, pi, frame, caja):
        abierto = next((c for c in reversed(pi["casos"]) if not c["cerrado"]), None)
        if (abierto and self.idx != abierto["frame_inf"] and self.idx - abierto["frame_inf"] <= self.frames_despues
                and self.idx % self.leer_cada == 0):
            self._encolar(abierto["futuros"], recorte(frame, caja), pi["clase"])

    def _cerrar_pendientes(self, forzar=False):
        listas = []
        for caso in list(self.pendientes):
            pi = self.pistas.get(caso["tid"])
            vencido = (pi is None or self.idx - caso["frame_inf"] >= self.frames_despues
                       or self.idx - pi["visto"] > 15)
            hechos = all(f.done() for f in caso["futuros"]) and (caso["senales"] is None or caso["senales"].done())
            if not forzar and not (vencido and hechos):
                continue
            lecturas = []
            for f in list(caso["futuros"]):
                try:
                    l = f.result()
                except Exception as e:   # un fallo de OCR no debe tumbar el motor
                    print("Error leyendo placa:", e)
                    l = None
                if l:
                    lecturas.append(l)
            placa, conf, n = votar(lecturas)
            inf = caso["inf"]
            inf.update({"placa": placa or "NO LEIDA", "confianza_placa": round(conf, 3), "lecturas_validas": n,
                        "lecturas_crudas": [l["crudo"] for l in lecturas][:20]})
            if caso["senales"] is not None:
                try:
                    inf["senales_detectadas"] = caso["senales"].result()
                except Exception as e:
                    inf["senales_detectadas"] = []
                    print("Error detectando señales:", e)
            candidatas = [l for l in lecturas if l.get("placa") == placa] or lecturas
            mejor = max(candidatas, key=lambda l: l["conf"], default=None)
            if mejor is not None and mejor.get("img") is not None and mejor["img"].size:
                cv2.imwrite(str(Path(inf["carpeta"]) / "placa.jpg"), mejor["img"])
            with open(Path(inf["carpeta"]) / "datos.json", "w", encoding="utf-8") as fh:
                json.dump(inf, fh, ensure_ascii=False, indent=2)
            caso["cerrado"] = True
            self.pendientes.remove(caso)
            self.multas.append(inf)
            listas.append(inf)
            if self.en_multa:
                try:
                    self.en_multa(inf)
                except Exception as e:
                    print("Error en en_multa:", e)
        return listas

    def _podar(self):
        """Olvida vehículos que no se ven hace rato y no tienen multas abiertas (sesiones largas en vivo)."""
        if self.idx % 100:
            return
        for tid in [k for k, pi in self.pistas.items() if self.idx - pi["visto"] > 300
                    and all(c["cerrado"] for c in pi["casos"])]:
            del self.pistas[tid]

    # ------------------------------------------------------------------- dibujo
    def _dibujar_vehiculo(self, vis, caja, p, nombre, tid, pi):
        infractor = bool(pi["tipos"])
        col = (0, 0, 255) if infractor else (255, 200, 0)
        x1, y1, x2, y2 = map(int, caja)
        cv2.rectangle(vis, (x1, y1), (x2, y2), col, 3 if infractor else 2)
        txt = f"{nombre} #{tid}"
        if pi["kmh"] is not None:
            txt += f" {pi['kmh']:.0f} km/h"
        if infractor:
            txt = "MULTA " + "+".join(CORTOS[t] for t in sorted(pi["tipos"])) + " " + txt
        cv2.putText(vis, txt, (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, col, 2)
        cv2.circle(vis, (int(p[0]), int(p[1])), 4, col, -1)

    def _dibujar_hud(self, vis, estado):
        H, W = vis.shape[:2]
        cv2.line(vis, self._a, self._b, COLORES[estado], 3)
        x0, y0, r = W - 70, 15, 16
        cv2.rectangle(vis, (x0, y0), (x0 + 50, y0 + 130), (30, 30, 30), -1)
        for i, nom in enumerate(("rojo", "amarillo", "verde")):
            c = COLORES[nom] if nom == estado else (70, 70, 70)
            cv2.circle(vis, (x0 + 25, y0 + 25 + i * 40), r, c, -1)
        cv2.putText(vis, f"Semaforo: {estado.upper()}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, COLORES[estado], 2)
        cv2.putText(vis, f"Multas: {len(self.multas) + len(self.pendientes)}", (20, 80),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
