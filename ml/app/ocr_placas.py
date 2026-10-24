# OCR especializado en placas (fast-plate-ocr, MIT, ONNX) en lugar de EasyOCR dentro del lector del motor.
# Medido con 21 placas reales de los videos del puente (respuesta verificada a ojo): EasyOCR 6/21 exactas y 70 %
# de caracteres; fast-plate-ocr 19/21 y 99 %, a 9 ms por placa (EasyOCR 43 ms). ML_OCR=easyocr vuelve atrás.
import os
from typing import Any

import cv2
import numpy as np

OCR = os.getenv("ML_OCR", "fast-plate-ocr")
MODELO = os.getenv("ML_OCR_MODELO", "cct-s-v2-global-model")  # el modelo (~5 MB) se descarga la primera vez
_reconocedor: Any = None


def reconocedor() -> Any:
    global _reconocedor
    if _reconocedor is None:
        from fast_plate_ocr import LicensePlateRecognizer

        _reconocedor = LicensePlateRecognizer(MODELO, device="cpu")  # ONNX en CPU: 9 ms y sin pelear la GPU
    return _reconocedor


def leer_placa(img: Any) -> tuple[str, float]:
    """Misma firma que `LectorPlacas.leer_texto`: (texto, confianza 0–1 = promedio por carácter)."""
    if img is None or not getattr(img, "size", 0):
        return "", 0.0
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB if img.ndim == 3 else cv2.COLOR_GRAY2RGB)
    p = reconocedor().run(rgb, return_confidence=True)[0]
    n = len(p.plate)
    conf = float(np.mean(p.char_probs[:n])) if n and p.char_probs is not None else 0.0
    return p.plate, conf


def con_ocr_de_placas(lector: Any) -> Any:
    """El lector sigue detectando la placa con placas.pt; solo cambia quién lee el texto."""
    lector.leer_texto = leer_placa
    return lector
