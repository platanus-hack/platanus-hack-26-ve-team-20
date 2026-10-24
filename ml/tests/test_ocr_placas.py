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
