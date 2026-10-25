from types import SimpleNamespace
from typing import Any

import numpy as np
import pytest

from app import ocr_placas


class Reconocedor:
    def __init__(self, plate: str, probs: list[float]) -> None:
        self.p = SimpleNamespace(plate=plate, char_probs=np.array(probs))
        self.recibido: Any = None

    def run(self, img: Any, return_confidence: bool = False) -> list[Any]:
        self.recibido = img
        return [self.p]


def test_lee_y_promedia_la_confianza_solo_de_los_caracteres_de_la_placa(monkeypatch: pytest.MonkeyPatch) -> None:
    r = Reconocedor("AB123CD", [0.9] * 7 + [0.1, 0.1, 0.1])  # las 3 últimas son relleno
    monkeypatch.setattr(ocr_placas, "_reconocedor", r)
    texto, conf = ocr_placas.leer_placa(np.zeros((30, 90, 3), np.uint8))
    assert texto == "AB123CD" and conf == pytest.approx(0.9)
    assert r.recibido.shape == (30, 90, 3)


def test_sin_texto_o_sin_imagen_confianza_cero(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ocr_placas, "_reconocedor", Reconocedor("", [0.99] * 10))
    assert ocr_placas.leer_placa(np.zeros((30, 90, 3), np.uint8)) == ("", 0.0)
    assert ocr_placas.leer_placa(None) == ("", 0.0)


def test_reemplaza_el_ocr_del_lector() -> None:
    lector = SimpleNamespace(leer_texto=lambda img: ("EASY", 1.0))
    assert ocr_placas.con_ocr_de_placas(lector).leer_texto is ocr_placas.leer_placa


def _bloque(bgr: tuple[int, int, int]) -> np.ndarray:
    return np.full((30, 90, 3), bgr, np.uint8)


def test_no_lee_lo_que_no_parece_placa(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ocr_placas, "_reconocedor", Reconocedor("ZCA44A", [0.99] * 6))
    assert ocr_placas.leer_placa(_bloque((60, 140, 40))) == ("", 0.0)   # verde de bolso de delivery
    assert ocr_placas.leer_placa(_bloque((20, 20, 220))) == ("", 0.0)   # luz de freno
    assert ocr_placas.leer_placa(_bloque((230, 230, 230)))[0] == "ZCA44A"  # placa blanca
    assert ocr_placas.leer_placa(_bloque((150, 90, 30)))[0] == "ZCA44A"   # azul


def test_elige_la_caja_de_la_parte_baja_del_vehiculo() -> None:
    cajas = [(10, 5, 60, 25), (12, 70, 50, 85)]  # bolso arriba (más confiable) y placa abajo, en un vehículo de 100 px
    assert ocr_placas.elegir_caja(cajas, [0.9, 0.5], 100) == 1
    assert ocr_placas.elegir_caja(cajas[:1], [0.9], 100) is None
