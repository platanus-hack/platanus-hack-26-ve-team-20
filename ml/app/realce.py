# Nitidez de placas: medir lo borroso de un recorte y realzarlo solo cuando hace falta. Dueño: P2.
# No inventa detalle (no es súper resolución): reduce ruido y acentúa bordes. La evidencia guardada sigue
# siendo la foto original en ml/evidencias; el realce se usa para leer (OCR), la lupa y la foto de placa en la web.
import os
from typing import Any

import cv2
import numpy as np

# Medido en 129 placas reales de los videos del puente: < ~600 se ven borrosas, desde ~730 se leen bien.
NITIDEZ_MIN = float(os.getenv("ML_NITIDEZ_MIN", "600"))
ALTO_REF = 48  # la nitidez se mide a un alto fijo para comparar recortes de distinto tamaño


def nitidez(img: Any) -> float:
    """Varianza del laplaciano a alto fijo: baja = borrosa."""
    gris = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    escala = ALTO_REF / max(1, gris.shape[0])
    gris = cv2.resize(gris, (max(1, round(gris.shape[1] * escala)), ALTO_REF), interpolation=cv2.INTER_AREA)
    return float(cv2.Laplacian(gris, cv2.CV_64F).var())


def realzar(img: Any) -> Any:
    """Agranda si es muy chica, quita ruido y aplica máscara de enfoque (unsharp mask)."""
    if img.shape[0] < ALTO_REF:
        f = ALTO_REF / img.shape[0]
        img = cv2.resize(img, (max(1, round(img.shape[1] * f)), ALTO_REF), interpolation=cv2.INTER_CUBIC)
    limpia = cv2.fastNlMeansDenoisingColored(img, None, 3, 3, 5, 15) if img.ndim == 3 else cv2.fastNlMeansDenoising(img, None, 3, 5, 15)
    suave = cv2.GaussianBlur(limpia, (0, 0), 1.2)
    return cv2.addWeighted(limpia, 1.8, suave, -0.8, 0)


def con_resolucion(img: Any, alto: int = 144) -> Any:
    """Foto de la placa para la web: agrandada (Lanczos, hasta 6x) y realzada, para que se lea a simple vista."""
    f = min(6.0, alto / max(1, img.shape[0]))
    if f > 1:
        img = cv2.resize(img, (max(1, round(img.shape[1] * f)), round(img.shape[0] * f)), interpolation=cv2.INTER_LANCZOS4)
    return realzar(img)


# La lectura original "no sirve" si casi no trae caracteres o el OCR casi no confía en ella.
MIN_CARACTERES, CONF_INUTIL = 5, 0.3


def con_realce(lector: Any) -> Any:
    """Envuelve `leer_texto` del lector del motor: el realce es un plan B. Solo si la placa está borrosa Y la
    lectura original no sirve se lee la versión realzada. Medido en 11 clips: elegir siempre la de mayor
    confianza cambiaba lecturas razonables por otras seguras pero equivocadas. No toca el código del motor."""
    original = lector.leer_texto

    def leer_texto(img: Any) -> tuple[str, float]:
        texto, conf = original(img)
        sirve = sum(ch.isalnum() for ch in texto) >= MIN_CARACTERES and conf >= CONF_INUTIL
        if sirve or img is None or not getattr(img, "size", 0) or nitidez(img) >= NITIDEZ_MIN:
            return texto, conf
        texto_r, conf_r = original(realzar(img))
        return (texto_r, conf_r) if conf_r > conf else (texto, conf)

    lector.leer_texto = leer_texto
    return lector


def puntaje(img: Any) -> float:
    """Para elegir el mejor cuadro de una placa: nítida y grande (hasta ~40 px de alto suma)."""
    return nitidez(img) * min(1.0, img.shape[0] / 40) if np.prod(img.shape[:2]) else 0.0
