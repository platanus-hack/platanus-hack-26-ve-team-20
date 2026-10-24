import time
from types import SimpleNamespace
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import pipeline
from app.en_vivo import Sesion
from app.main import app


def _esperar(cond: Any, segundos: float = 2.0) -> None:
    """El registro corre en un hilo aparte."""
    fin = time.monotonic() + segundos
    while not cond() and time.monotonic() < fin:
        time.sleep(0.01)


def _jpg() -> bytes:
    ok, buf = cv2.imencode(".jpg", np.full((90, 160, 3), 120, np.uint8))
    assert ok
    return buf.tobytes()


class MotorVivo:
    """Multa en el 3er cuadro solo si el semáforo está en rojo (como la regla real del motor)."""

    def __init__(self, config: dict[str, Any], carpeta_evidencias: str, en_multa: Any, **ajustes: Any) -> None:
        self.config, self.carpeta, self.en_multa, self.ajustes = config, Path(carpeta_evidencias), en_multa, ajustes
        self.n, self.estados = 0, []

    def procesar_frame(self, frame: Any, estado: str, t: float | None = None) -> dict[str, Any]:
        self.estados.append(estado)
        nuevas = []
        if self.n == 2 and estado == "rojo":
            carpeta = self.carpeta / "id0005"
            carpeta.mkdir(parents=True)
            for f in ("escena.jpg", "vehiculo.jpg", "placa.jpg"):
                cv2.imwrite(str(carpeta / f), frame)
            inf = {"id": 5, "clase": "car", "tipo": "semaforo_rojo", "carpeta": str(carpeta)}
            nuevas = [inf]
            self.en_multa({**inf, "placa": "XYZ12K", "confianza_placa": 0.9, "lecturas_validas": 4,
                           "lecturas_crudas": ["XYZ12K"]})
        self.n += 1
        return {"frame": frame, "estado": estado, "infracciones_nuevas": nuevas, "multas_listas": []}

    def finalizar(self) -> None:
        pass


@pytest.fixture
def sesion(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Sesion, list[dict[str, Any]], list[MotorVivo]]:
    monkeypatch.setattr(pipeline, "EVIDENCE_DIR", tmp_path)
    enviados: list[dict[str, Any]] = []
    motores: list[MotorVivo] = []

    def fabrica(**kw: Any) -> MotorVivo:
        motores.append(MotorVivo(**kw))
        return motores[-1]

    def registrar(p: dict[str, Any]) -> dict[str, Any]:
        enviados.append(p)
        return {"violationId": "vio_1", "status": "FINED", "fineId": "fine_1"}

    return Sesion("CAM-001", fabrica, registrar), enviados, motores


def test_multa_solo_en_rojo_y_se_registra(sesion: tuple[Sesion, list[dict[str, Any]], list[MotorVivo]]) -> None:
    s, enviados, motores = sesion
    s.procesar(_jpg())
    s.estado = "rojo"
    s.procesar(_jpg())
    r = s.procesar(_jpg())
    assert motores[0].estados == ["verde", "rojo", "rojo"]  # el color real llega al motor en cada cuadro
    assert r["tipo"] == "cuadro" and "jpg" not in r  # solo datos: la página dibuja sobre su propio video
    assert r["cruces"] == [{"id": 5, "clase": "car"}]
    assert [(m["placa"], m["votos"]) for m in r["multas"]] == [("XYZ12K", 4)]
    _esperar(lambda: bool(enviados) and (bool(r["registros"]) or s.registros.qsize() > 0))
    assert enviados[0]["cameraCode"] == "CAM-001" and enviados[0]["plate"] == "XYZ12K"
    assert enviados[0]["sceneJpegBase64"] and enviados[0]["idempotencyKey"].startswith("en-vivo-")
    registros = r["registros"] + s.procesar(_jpg())["registros"]  # sale en este cuadro o en el siguiente
    assert registros[0]["ok"] is True and registros[0]["ref"] == r["multas"][0]["ref"]


def test_en_verde_no_multa(sesion: tuple[Sesion, list[dict[str, Any]], list[MotorVivo]]) -> None:
    s, enviados, _ = sesion
    for _ in range(4):
        r = s.procesar(_jpg())
    assert r["multas"] == [] and enviados == []


def test_cambiar_la_linea_crea_un_motor_nuevo(sesion: tuple[Sesion, list[dict[str, Any]], list[MotorVivo]]) -> None:
    s, _, motores = sesion
    s.procesar(_jpg())
    s.configurar(0.3, True)
    s.procesar(_jpg())
    assert len(motores) == 2
    assert motores[1].config["linea_pare"] == [[0, 27], [160, 27]]
    assert motores[1].config["punto_despues"][1] > 27  # hacia la cámara: la intersección queda abajo


def test_sin_vercel_la_multa_queda_en_pantalla(sesion: tuple[Sesion, list[dict[str, Any]], list[MotorVivo]]) -> None:
    s, _, _ = sesion

    def falla(_p: dict[str, Any]) -> dict[str, Any]:
        raise RuntimeError("Falta ML_REGISTRO_URL")

    s.registrar = falla
    s.estado = "rojo"
    reg: list[dict[str, Any]] = []
    for _ in range(3):
        reg += s.procesar(_jpg())["registros"]
    _esperar(lambda: bool(reg) or s.registros.qsize() > 0)
    reg += s.procesar(_jpg())["registros"]
    assert reg and reg[0]["ok"] is False and "ML_REGISTRO_URL" in reg[0]["error"]


def test_ws_rechaza_clave_invalida(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CAMERA_API_KEY", "clave-buena")
    with TestClient(app).websocket_connect("/en-vivo/ws") as ws:
        ws.send_json({"tipo": "auth", "clave": "otra", "camara": "CAM-001"})
        assert ws.receive_json()["tipo"] == "error"


def test_pagina_en_vivo() -> None:
    r = TestClient(app).get("/en-vivo")
    assert r.status_code == 200 and "Multas en vivo" in r.text


class Tensor:
    """Imita lo que usa el motor de los tensores de ultralytics."""

    def __init__(self, v: Any) -> None:
        self.v = np.array(v)

    def cpu(self) -> "Tensor":
        return self

    def numpy(self) -> Any:
        return self.v

    def int(self) -> "Tensor":
        return Tensor(self.v.astype(int))

    def tolist(self) -> Any:
        return self.v.tolist()


def test_cajas_salen_del_tracker_normalizadas(sesion: tuple[Sesion, list[dict[str, Any]], list[MotorVivo]],
                                              monkeypatch: pytest.MonkeyPatch) -> None:
    s, _, _ = sesion
    boxes = SimpleNamespace(xyxy=Tensor([[16, 9, 80, 45], [0, 0, 10, 10]]), id=Tensor([5, 9]), cls=Tensor([0, 4]))

    class ConTracker(MotorVivo):
        def __init__(self, **kw: Any) -> None:
            super().__init__(**kw)
            self.nombres = {0: "car"}  # la clase 4 (p. ej. accidente) no es un vehículo
            self.pistas = {5: {"tipos": {"semaforo_rojo"}}}
            self.modelo = SimpleNamespace(track=lambda frame, **k: [SimpleNamespace(boxes=boxes)])

        def procesar_frame(self, frame: Any, estado: str, t: float | None = None) -> dict[str, Any]:
            self.modelo.track(frame)
            return super().procesar_frame(frame, estado, t)

    s.fabrica = ConTracker
    r = s.procesar(_jpg())  # cuadro de 160x90
    assert r["cajas"] == [{"id": 5, "clase": "car", "x": 0.1, "y": 0.1, "w": 0.4, "h": 0.4, "multa": True}]


def test_motor_en_vivo_usa_ajustes_para_pocos_cuadros(sesion: tuple[Sesion, list[dict[str, Any]], list[MotorVivo]]) -> None:
    s, _, motores = sesion
    s.procesar(_jpg())
    a = motores[0].ajustes
    assert a["leer_cada"] == 1 and a["imgsz_vehiculos"] == 960
    assert Path(a["tracker"]).name == "bytetrack_vivo.yaml" and Path(a["tracker"]).exists()


def test_cuadro_ilegible_responde_igual_para_no_desordenar(sesion: tuple[Sesion, list[dict[str, Any]], list[MotorVivo]]) -> None:
    s, _, _ = sesion
    r = s.procesar(b"no es un jpg")
    assert r["tipo"] == "cuadro" and r["cajas"] == [] and r["aviso"] == "Cuadro ilegible"
