# Envuelve MotorInfracciones (ml/motor/, sale del notebook de Kaggle) detrás del contrato /predict.
# El servicio NO conoce el semáforo (docs/04 §8): se le pasa "rojo" en todos los fotogramas para que
# el motor reporte cada cruce de la línea de pare, y lib/vision/rules.ts decide con los LightChange.
import base64
import os
import sys
import time
import urllib.request
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import Any

import cv2

from .schemas import Calibracion, ClipInfo, CruceLinea, KeyFrame, Placa, PredictRequest, PredictResponse, Track

ML_DIR = Path(__file__).resolve().parents[1]
MOTOR_DIR = Path(os.getenv("ML_MOTOR_DIR", ML_DIR / "motor"))
WEIGHTS_DIR = Path(os.getenv("ML_WEIGHTS_DIR", ML_DIR / "weights"))
EVIDENCE_DIR = Path(os.getenv("ML_EVIDENCE_DIR", ML_DIR / "evidencias"))
MODEL_VERSION = os.getenv("ML_MODEL_VERSION", "vc-0.1")
MAX_CLIP_BYTES = 100 * 1024 * 1024
PLACA_NO_LEIDA = "NO LEIDA"


class ClipError(Exception):
    """El clip no se pudo descargar o decodificar."""


def motor_disponible() -> bool:
    return (MOTOR_DIR / "motor_infracciones.py").exists() and all(
        (WEIGHTS_DIR / f).exists() for f in ("vehiculos.pt", "placas.pt")
    )


def _device() -> int | str:
    d = os.getenv("ML_DEVICE", "cpu")  # "0" NVIDIA, "mps" Mac con chip Apple, "cpu"
    return int(d) if d.isdigit() else d


def crear_motor(**kwargs: Any) -> Any:
    sys.path.insert(0, str(MOTOR_DIR))
    from motor_infracciones import MotorInfracciones  # type: ignore[import-not-found]

    senales = WEIGHTS_DIR / "senales.pt"
    return MotorInfracciones(
        pesos_vehiculos=str(WEIGHTS_DIR / "vehiculos.pt"),
        pesos_placas=str(WEIGHTS_DIR / "placas.pt"),
        pesos_senales=str(senales) if senales.exists() else None,
        device=_device(),
        **kwargs,
    )


def camara_json(cal: Calibracion, ancho: int, alto: int) -> dict[str, Any]:
    """Calibración normalizada del repo → `camara.json` del motor (píxeles del clip)."""

    def px(p: tuple[float, float]) -> list[int]:
        return [round(p[0] * ancho), round(p[1] * alto)]

    a, b = cal.stopLine
    medio = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    # shortcut: asume la intersección "arriba" de la línea (cámara mirando a lo largo del carril, docs/10 §4);
    # si se monta al revés, agregar el punto a la calibración.
    despues = (medio[0], max(0.0, medio[1] - 0.1))
    # shortcut: solo la línea de pare (MVP luz roja); homografía, carriles y velocidad quedan para después.
    return {"resolucion": [ancho, alto], "linea_pare": [px(a), px(b)], "punto_despues": px(despues)}


def descargar(url: str, destino: Path) -> Path:
    if not url.startswith(("https://", "http://")):
        raise ClipError("URL de clip no soportada")
    ruta = destino / "clip.mp4"
    try:
        with urllib.request.urlopen(url, timeout=30) as r, ruta.open("wb") as f:
            leidos = 0
            while chunk := r.read(1 << 20):
                leidos += len(chunk)
                if leidos > MAX_CLIP_BYTES:
                    raise ClipError("Clip demasiado grande")
                f.write(chunk)
    except OSError as e:
        raise ClipError(f"No se pudo descargar el clip: {e}") from e
    return ruta


def _b64(ruta: Path) -> str | None:
    return base64.b64encode(ruta.read_bytes()).decode() if ruta.exists() else None


def analizar(clip: Path, cal: Calibracion, fabrica: Callable[..., Any] = crear_motor) -> PredictResponse:
    inicio = time.perf_counter()
    cap = cv2.VideoCapture(str(clip))
    if not cap.isOpened():
        raise ClipError("No se pudo abrir el clip")
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    ancho, alto = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    infracciones: list[dict[str, Any]] = []
    multas: list[dict[str, Any]] = []
    carpeta = EVIDENCE_DIR / uuid.uuid4().hex  # se conserva: es el respaldo de cada multa
    motor = fabrica(config=camara_json(cal, ancho, alto), carpeta_evidencias=str(carpeta), en_multa=multas.append)
    n, ultimo_ms, fuente = 0, 0.0, "pts"
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            if n > 0 and ms <= 0:  # sin PTS: cae a número de fotograma / fps
                fuente, ms = "fps", n * 1000 / fps if fps else 0.0
            ultimo_ms = ms
            salida = motor.procesar_frame(frame, "rojo", t=ms / 1000)
            infracciones += [i for i in salida["infracciones_nuevas"] if i.get("tipo") == "semaforo_rojo"]
            n += 1
    finally:
        motor.finalizar()  # cierra las multas pendientes (llama en_multa)
        cap.release()
    if n == 0:
        raise ClipError("El clip no tiene fotogramas")

    def at_ms(d: dict[str, Any]) -> int:
        return round(float(d["segundo"]) * 1000)

    tracks = [
        Track(trackId=int(i["id"]), clase=str(i["clase"]), stopLine=CruceLinea(crossed=True, atMs=at_ms(i)))
        for i in infracciones
    ]
    multas_rojo = [m for m in multas if m.get("tipo") == "semaforo_rojo"]
    plates = [
        Placa(
            trackId=int(m["id"]),
            text=str(m["placa"]),
            ocrConfidence=float(m.get("confianza_placa", 0)),
            votes=int(m.get("lecturas_validas", 0)),
            bestFrameMs=at_ms(m),
            rawReads=[str(x) for x in m.get("lecturas_crudas", [])],
        )
        for m in multas_rojo
        if m.get("placa") and m["placa"] != PLACA_NO_LEIDA
    ]
    key_frames = [
        KeyFrame(ms=at_ms(i), jpegBase64=jpg)
        for i in infracciones
        if (jpg := _b64(Path(i["carpeta"]) / "escena.jpg"))
    ]
    placa_jpg = next((j for m in multas_rojo if (j := _b64(Path(m["carpeta"]) / "placa.jpg"))), None)

    return PredictResponse(
        modelVersion=MODEL_VERSION,
        latencyMs=round((time.perf_counter() - inicio) * 1000),
        clip=ClipInfo(fps=fps, frameCount=n, durationMs=round(ultimo_ms), timestampSource=fuente),
        tracks=tracks,
        plates=plates,
        keyFrames=key_frames,
        plateCropBase64=placa_jpg,
    )


def simulado(req: PredictRequest) -> PredictResponse:
    """Respuesta fija mientras no estén los pesos: set A (cruza, placa AB123CD del seed)."""
    return PredictResponse(
        modelVersion=f"{MODEL_VERSION}-simulado",
        latencyMs=0,
        simulated=True,
        clip=ClipInfo(fps=30, frameCount=120, durationMs=4000, timestampSource="pts"),
        tracks=[Track(trackId=1, clase="car", stopLine=CruceLinea(crossed=True, atMs=1800, framesConfirmed=5))],
        plates=[Placa(trackId=1, text="AB123CD", ocrConfidence=0.88, votes=7, bestFrameMs=1500)],
        keyFrames=[],
    )
