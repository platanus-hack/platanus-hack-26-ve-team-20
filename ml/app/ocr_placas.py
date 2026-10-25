# OCR especializado en placas (fast-plate-ocr, MIT, ONNX) en lugar de EasyOCR dentro del lector del motor.
# Medido con 21 placas reales de los videos del puente (respuesta verificada a ojo): EasyOCR 6/21 exactas y 70 %
# de caracteres; fast-plate-ocr 19/21 y 99 %, a 9 ms por placa (EasyOCR 43 ms). ML_OCR=easyocr vuelve atrás.
import os
import sys
from typing import Any

import cv2
import numpy as np

OCR = os.getenv("ML_OCR", "fast-plate-ocr")
MODELO = os.getenv("ML_OCR_MODELO", "cct-s-v2-global-model")  # el modelo (~5 MB) se descarga la primera vez
_reconocedor: Any = None

# Lo que no es placa: bolsos de delivery (letras blancas sobre verde), luces de freno. Medido en 491 recortes de
# multas: los 4 bolsos "Yummy" y la luz roja tienen >= 0,61 de verde o rojo saturado; la placa real con más, 0,38.
MAX_COLOR = float(os.getenv("ML_PLACA_MAX_COLOR", "0.45"))
# La placa va en la parte baja del vehículo; arriba de una moto suele estar el bolso del delivery.
MIN_CENTRO_Y = 0.4


def color_fuerte(img: Any) -> float:
    """Fracción del recorte que es verde o rojo saturado (las placas venezolanas son blancas, crema o azules)."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s = hsv[..., 0], hsv[..., 1]
    verde = ((h >= 35) & (h <= 85) & (s > 80)).mean()
    rojo = (((h < 10) | (h > 170)) & (s > 120)).mean()
    return float(max(verde, rojo))


def parece_placa(img: Any) -> bool:
    return img.ndim != 3 or color_fuerte(img) <= MAX_COLOR


def elegir_caja(cajas: Any, confs: Any, alto_vehiculo: int) -> int | None:
    """Índice de la caja de placa más confiable cuyo centro está en la parte baja del vehículo (o None)."""
    validas = [i for i, (_, y1, _, y2) in enumerate(cajas) if (y1 + y2) / 2 >= MIN_CENTRO_Y * alto_vehiculo]
    return max(validas, key=lambda i: float(confs[i])) if validas else None


def reconocedor() -> Any:
    global _reconocedor
    if _reconocedor is None:
        from fast_plate_ocr import LicensePlateRecognizer

        _reconocedor = LicensePlateRecognizer(MODELO, device="cpu")  # ONNX en CPU: 9 ms y sin pelear la GPU
    return _reconocedor


def leer_placa(img: Any) -> tuple[str, float]:
    """Misma firma que `LectorPlacas.leer_texto`: (texto, confianza 0–1 = promedio por carácter)."""
    if img is None or not getattr(img, "size", 0) or not parece_placa(img):
        return "", 0.0
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB if img.ndim == 3 else cv2.COLOR_GRAY2RGB)
    p = reconocedor().run(rgb, return_confidence=True)[0]
    n = len(p.plate)
    conf = float(np.mean(p.char_probs[:n])) if n and p.char_probs is not None else 0.0
    return p.plate, conf


def con_ocr_de_placas(lector: Any) -> Any:
    """El lector sigue detectando la placa con placas.pt; cambia quién lee el texto y qué caja se elige."""
    lector.leer_texto = leer_placa
    motor = sys.modules[type(lector).__module__]

    def leer(recorte_vehiculo: Any, clase_vehiculo: str | None = None) -> dict[str, Any] | None:
        # Igual que LectorPlacas.leer del motor, salvo la caja: elegir_caja en vez de la de mayor confianza.
        if recorte_vehiculo is None or recorte_vehiculo.size == 0 or min(recorte_vehiculo.shape[:2]) < 16:
            return None
        kw: dict[str, Any] = {"conf": lector.conf, "imgsz": lector.imgsz, "verbose": False}
        if lector.device is not None:
            kw["device"] = lector.device
        r = lector.modelo.predict(recorte_vehiculo, **kw)[0]
        if r.boxes is None or len(r.boxes) == 0:
            return None
        cajas, confs = r.boxes.xyxy.cpu().numpy(), r.boxes.conf.cpu().numpy()
        k = elegir_caja(cajas, confs, recorte_vehiculo.shape[0])
        if k is None:
            return None
        placa = motor.recorte(recorte_vehiculo, cajas[k], pad=0.06)
        texto, conf_ocr = lector.leer_texto(placa)  # en tiempo de llamada: puede estar envuelto por con_realce
        norm, tipo = motor.normalizar_placa(texto, lector.plantillas, lector.regex,
                                            preferida="moto" if clase_vehiculo == "motorcycle" else None,
                                            max_correcciones=lector.max_correcciones)
        return {"crudo": texto, "placa": norm, "tipo": tipo, "conf": float(confs[k]) * conf_ocr, "img": placa}

    lector.leer = leer
    return lector
