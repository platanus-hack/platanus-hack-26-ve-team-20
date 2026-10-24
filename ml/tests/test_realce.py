from typing import Any

import cv2
import numpy as np

from app import realce


def _placa() -> Any:
    img = np.full((40, 140, 3), 235, np.uint8)
    cv2.putText(img, "AB123CD", (6, 30), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (20, 20, 20), 2)
    return img


def test_borrosa_tiene_menos_nitidez_y_el_realce_la_sube() -> None:
    nitida = _placa()
    borrosa = cv2.GaussianBlur(nitida, (0, 0), 2.5)
    assert realce.nitidez(borrosa) < realce.nitidez(nitida)
    assert realce.nitidez(realce.realzar(borrosa)) > realce.nitidez(borrosa)


def test_realzar_agranda_las_placas_muy_chicas() -> None:
    assert realce.realzar(cv2.resize(_placa(), (70, 20))).shape[0] == realce.ALTO_REF


class Lector:
    def __init__(self, conf_original: float, conf_realzada: float) -> None:
        self.llamadas: list[float] = []
        self.conf = (conf_original, conf_realzada)

    def leer_texto(self, img: Any) -> tuple[str, float]:
        self.llamadas.append(realce.nitidez(img))
        return ("ORIG", self.conf[0]) if len(self.llamadas) == 1 else ("REAL", self.conf[1])


def test_con_realce_solo_actua_en_placas_borrosas_y_se_queda_con_la_mejor_lectura(monkeypatch: Any) -> None:
    nitida = _placa()
    monkeypatch.setattr(realce, "NITIDEZ_MIN", realce.nitidez(nitida) / 2)
    lector = realce.con_realce(Lector(0.4, 0.9))
    assert lector.leer_texto(nitida) == ("ORIG", 0.4)  # nítida: una sola lectura, sin realce
    assert len(lector.llamadas) == 1

    borrosa = cv2.GaussianBlur(nitida, (0, 0), 3)
    # borrosa pero la lectura original sirve (≥5 caracteres, confianza ≥0,3): se respeta, sin realce
    servible = Lector(0.4, 0.9)
    servible.leer_texto = lambda img: ("AB123CD", 0.4)  # type: ignore[method-assign]
    assert realce.con_realce(servible).leer_texto(borrosa) == ("AB123CD", 0.4)
    # borrosa y la original no sirve: se prueba la realzada y se queda con la mejor
    assert realce.con_realce(Lector(0.1, 0.9)).leer_texto(borrosa) == ("REAL", 0.9)
    assert realce.con_realce(Lector(0.2, 0.1)).leer_texto(borrosa) == ("ORIG", 0.2)
