from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import pipeline
from app.main import app
from app.schemas import Calibracion, PredictRequest

CAL = {
    "configVersion": 1,
    "stopLine": [[0.25, 0.5], [0.75, 0.5]],
    "homography": {"imagePoints": [[0.3, 0.9], [0.7, 0.9], [0.6, 0.4], [0.4, 0.4]],
                   "groundPointsM": [[0, 0], [7, 0], [7, 25], [0, 25]]},
}
REQ = {"cameraCode": "CAM-001", "clip": {"url": "https://example.com/a.mp4", "startedAt": "2026-10-24T14:03:10.100Z"},
       "calibration": CAL}


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("ML_SERVICE_TOKEN", "secreto")
    return TestClient(app)


def test_health(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["ok"] is True


@pytest.mark.parametrize("header", [None, "Bearer otro", "secreto"])
def test_predict_exige_token(client: TestClient, header: str | None) -> None:
    headers = {"Authorization": header} if header else {}
    assert client.post("/predict", json=REQ, headers=headers).status_code == 401


def test_predict_sin_token_configurado_rechaza(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ML_SERVICE_TOKEN", raising=False)
    r = TestClient(app).post("/predict", json=REQ, headers={"Authorization": "Bearer "})
    assert r.status_code == 401


def test_predict_simulado_cumple_contrato(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "motor_disponible", lambda: False)
    r = client.post("/predict", json=REQ, headers={"Authorization": "Bearer secreto"})
    assert r.status_code == 200
    body = r.json()
    assert body["simulated"] is True
    assert body["tracks"][0]["class"] == "car"  # alias del contrato, no "clase"
    assert body["tracks"][0]["stopLine"] == {"crossed": True, "atMs": 1800, "framesConfirmed": 5}
    assert body["plates"][0]["text"] == "AB123CD"


def test_camara_json_escala_a_pixeles() -> None:
    cfg = pipeline.camara_json(Calibracion.model_validate(CAL), 1280, 720)
    assert cfg == {"resolucion": [1280, 720], "linea_pare": [[320, 360], [960, 360]], "punto_despues": [640, 288]}
    hacia_camara = Calibracion.model_validate({**CAL, "parameters": {"stopLineAfterBelow": 1}})
    assert pipeline.camara_json(hacia_camara, 1280, 720)["punto_despues"] == [640, 432]


# ---------------------------------------------------------------- adaptador con motor falso

def _video(ruta: Path, frames: int = 30, fps: int = 30) -> Path:
    w = cv2.VideoWriter(str(ruta), cv2.VideoWriter.fourcc(*"mp4v"), fps, (64, 48))
    for i in range(frames):
        w.write(np.full((48, 64, 3), i * 8 % 255, np.uint8))
    w.release()
    return ruta


class MotorFalso:
    """Imita la API de MotorInfracciones (guía de integración §4): multa en el fotograma 15."""

    def __init__(self, config: dict[str, Any], carpeta_evidencias: str, en_multa: Any) -> None:
        self.config, self.carpeta, self.en_multa = config, Path(carpeta_evidencias), en_multa
        self.n, self.estados, self.pendiente = 0, set(), None

    def procesar_frame(self, frame: Any, estado: str, t: float | None = None) -> dict[str, Any]:
        self.estados.add(estado)
        nuevas = []
        if self.n == 15:
            carpeta = self.carpeta / "id0007"
            carpeta.mkdir(parents=True)
            cv2.imwrite(str(carpeta / "escena.jpg"), frame)
            cv2.imwrite(str(carpeta / "placa.jpg"), frame[:10, :20])
            self.pendiente = {"id": 7, "clase": "car", "tipo": "semaforo_rojo", "segundo": t, "carpeta": str(carpeta)}
            nuevas = [self.pendiente, {**self.pendiente, "id": 8, "tipo": "contravia"}]
        self.n += 1
        return {"frame": frame, "estado": estado, "infracciones_nuevas": nuevas, "multas_listas": []}

    def finalizar(self) -> None:
        if self.pendiente:
            self.en_multa({**self.pendiente, "placa": "AB123CD", "confianza_placa": 0.74,
                           "lecturas_validas": 6, "lecturas_crudas": ["AB123CD", "A8123CD"]})


def test_analizar_mapea_motor_al_contrato(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "EVIDENCE_DIR", tmp_path / "evid")
    motores: list[MotorFalso] = []

    def fabrica(**kw: Any) -> MotorFalso:
        motores.append(MotorFalso(**kw))
        return motores[-1]

    res = pipeline.analizar(_video(tmp_path / "c.mp4"), Calibracion.model_validate(CAL), fabrica)

    assert motores[0].estados == {"rojo"}  # el servicio no conoce el semáforo
    assert motores[0].config["resolucion"] == [64, 48]
    assert res.clip.frameCount == 30 and res.clip.fps == 30
    assert [t.trackId for t in res.tracks] == [7]  # solo cruces de línea de pare
    at = res.tracks[0].stopLine.atMs
    assert at is not None and abs(at - 500) <= 40  # fotograma 15 a 30 fps ≈ 500 ms (PTS)
    assert res.plates[0].text == "AB123CD" and res.plates[0].votes == 6
    assert res.keyFrames[0].ms == at and res.keyFrames[0].jpegBase64
    assert res.plateCropBase64


def test_analizar_omite_placa_no_leida(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "EVIDENCE_DIR", tmp_path / "evid")

    class SinPlaca(MotorFalso):
        def finalizar(self) -> None:
            if self.pendiente:
                self.en_multa({**self.pendiente, "placa": "NO LEIDA", "confianza_placa": 0})

    res = pipeline.analizar(_video(tmp_path / "c.mp4"), Calibracion.model_validate(CAL), SinPlaca)
    assert len(res.tracks) == 1 and res.plates == []


def test_analizar_clip_ilegible(tmp_path: Path) -> None:
    roto = tmp_path / "roto.mp4"
    roto.write_bytes(b"no es video")
    with pytest.raises(pipeline.ClipError):
        pipeline.analizar(roto, PredictRequest.model_validate(REQ).calibration, MotorFalso)


def test_descargar_rechaza_esquemas_raros(tmp_path: Path) -> None:
    with pytest.raises(pipeline.ClipError):
        pipeline.descargar("file:///etc/passwd", tmp_path)
