# Plan B de lectura (demo): si una multa cierra sin placa o con una lectura floja, se reintenta con las mejores
# imágenes de ese vehículo, cada una en varias versiones (original, realzada, agrandada y realzada), con el OCR
# de placas. Gana el texto con más lecturas coincidentes; solo se acepta con confianza >= ML_ADIVINAR_MIN (0,60).
# Puede equivocarse: la multa queda marcada como "placa estimada" (decisión del equipo para la demo). Dueño: P2.
import os
from collections.abc import Callable, Iterator
from typing import Any

import cv2

from .ocr_placas import leer_placa
from .realce import realzar

MIN_CONF = float(os.getenv("ML_ADIVINAR_MIN", "0.60"))
DetectorPlacas = Callable[..., list[tuple[float, float, float, float] | None]]


def _variantes(img: Any) -> Iterator[Any]:
    yield img
    yield realzar(img)
    grande = cv2.resize(img, (img.shape[1] * 2, img.shape[0] * 2), interpolation=cv2.INTER_CUBIC)
    yield realzar(grande)


def recortes_de_vehiculo(vehiculo: Any, detector: DetectorPlacas | None) -> list[Any]:
    """Posibles placas dentro de la foto del vehículo: la que encuentre un detector sensible y, si no, la franja
    inferior central (donde suele ir la placa)."""
    if vehiculo is None or vehiculo.size == 0:
        return []
    out = []
    if detector is not None:
        caja = detector([vehiculo], conf=0.1)[0]
        if caja is not None:
            x1, y1, x2, y2 = (int(v) for v in caja)
            mx, my = int((x2 - x1) * 0.1), int((y2 - y1) * 0.2)
            recorte = vehiculo[max(0, y1 - my):y2 + my, max(0, x1 - mx):x2 + mx]
            if recorte.size:
                out.append(recorte)
    h, w = vehiculo.shape[:2]
    out.append(vehiculo[int(h * 0.55):int(h * 0.95), int(w * 0.2):int(w * 0.8)])
    return [r for r in out if r.size and min(r.shape[:2]) >= 8]


def _con_formato(texto: str, normalizar: Callable[[str], str | None] | None) -> str | None:
    """Una placa adivinada tiene que tener forma de placa venezolana (corrector del motor: 0/O, 8/B…)."""
    t = "".join(ch for ch in texto.upper() if ch.isalnum())
    if normalizar is None:
        return t if 5 <= len(t) <= 8 else None
    return normalizar(t)


def normalizador_del_motor() -> Callable[[str], str | None] | None:
    try:
        from motor_infracciones import PLANTILLAS_VE, normalizar_placa  # type: ignore[import-not-found]
    except ImportError:
        return None
    plantillas = {**PLANTILLAS_VE, "antigua": "LLLDDL"}

    def normalizar(t: str) -> str | None:
        fijo, tipo = normalizar_placa(t, plantillas)
        return fijo if tipo in plantillas else None  # "generica" no basta para adivinar

    return normalizar


def adivinar(imagenes: list[Any], min_conf: float = MIN_CONF,
             normalizar: Callable[[str], str | None] | None = None) -> tuple[str, float, int] | None:
    """(placa, confianza, lecturas que coinciden) o None si nada llega a min_conf con formato de placa."""
    lecturas: list[tuple[str, float]] = []
    for img in imagenes:
        if img is None or not getattr(img, "size", 0):
            continue
        for v in _variantes(img):
            texto, conf = leer_placa(v)
            placa = _con_formato(texto, normalizar)
            if placa:
                lecturas.append((placa, conf))
    if not lecturas:
        return None
    por_texto: dict[str, list[float]] = {}
    for t, c in lecturas:
        por_texto.setdefault(t, []).append(c)
    texto, confs = max(por_texto.items(), key=lambda kv: (len(kv[1]), max(kv[1])))
    conf = max(confs)
    return (texto, conf, len(confs)) if conf >= min_conf else None
