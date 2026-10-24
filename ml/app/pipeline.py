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

from .schemas import (
    Box, Calibracion, ClipInfo, CruceLinea, Incidente, KeyFrame, Placa, PredictRequest, PredictResponse, Track,
    VehiculoIncidente,
)

ML_DIR = Path(__file__).resolve().parents[1]
MOTOR_DIR = Path(os.getenv("ML_MOTOR_DIR", ML_DIR / "motor"))
WEIGHTS_DIR = Path(os.getenv("ML_WEIGHTS_DIR", ML_DIR / "weights"))
EVIDENCE_DIR = Path(os.getenv("ML_EVIDENCE_DIR", ML_DIR / "evidencias"))
# Sin vehiculos.pt: YOLO genérico de COCO (se descarga solo). Sin placas.pt la placa sale "NO LEIDA".
USAR_COCO = os.getenv("ML_USAR_COCO", "false") == "true"
MODEL_VERSION = os.getenv("ML_MODEL_VERSION", "vc-0.1") + ("-coco" if USAR_COCO else "")
# Apagada por defecto: en video real dio solo falsas alarmas (un vehículo de cerca o desde arriba). ML_CHOQUES=true la activa.
CHOQUES_ACTIVOS = os.getenv("ML_CHOQUES", "false") == "true"
# Umbral sugerido por el notebook de choques (INTEGRACION_CAPA_CHOQUES.md §8); calibrar en el sitio de la demo.
CONF_CHOQUES = float(os.getenv("ML_CONF_CHOQUES", "0.3"))
MAX_CLIP_BYTES = 100 * 1024 * 1024
ESCENA_MAX_ANCHO = 1280  # fotos de escena en la respuesta; en disco quedan a resolución completa
PLACA_NO_LEIDA = "NO LEIDA"


class ClipError(Exception):
    """El clip no se pudo descargar o decodificar."""


def motor_disponible() -> bool:
    return (MOTOR_DIR / "motor_infracciones.py").exists() and (
        USAR_COCO or all((WEIGHTS_DIR / f).exists() for f in ("vehiculos.pt", "placas.pt"))
    )


def _device() -> int | str:
    d = os.getenv("ML_DEVICE", "cpu")  # "0" NVIDIA, "mps" Mac con chip Apple, "cpu"
    return int(d) if d.isdigit() else d


def crear_motor(**kwargs: Any) -> Any:
    sys.path.insert(0, str(MOTOR_DIR))
    from motor_infracciones import PLANTILLAS_VE, LectorPlacas, MotorInfracciones  # type: ignore[import-not-found]

    placas, senales, choques = WEIGHTS_DIR / "placas.pt", WEIGHTS_DIR / "senales.pt", WEIGHTS_DIR / "choques.pt"
    device = _device()
    # La GPU de Mac (mps) no admite dos hilos a la vez y el motor lee placas y señales en un hilo aparte:
    # con mps las placas van en CPU (los vehículos siguen en GPU).
    # shortcut: con mps se omite senales.pt (solo agrega evidencia); habilitarlo cuando corra en NVIDIA o CPU.
    en_mps = device == "mps"
    # Además de los formatos de 7 del motor, el antiguo de 6 (AHA79M) que todavía circula.
    plantillas = {**PLANTILLAS_VE, "antigua": "LLLDDL"}
    lector = (LectorPlacas.desde_pesos(str(placas), device="cpu" if en_mps else device, plantillas=plantillas)
              if placas.exists() else None)
    return MotorInfracciones(
        pesos_vehiculos="yolo11n.pt" if USAR_COCO else str(WEIGHTS_DIR / "vehiculos.pt"),
        lector_placas=lector,
        pesos_senales=str(senales) if senales.exists() and not en_mps else None,
        # choques.pt corre en el hilo principal del motor: sirve también con mps.
        pesos_choques=str(choques) if CHOQUES_ACTIVOS and choques.exists() else None,
        conf_choques=CONF_CHOQUES,
        usar_coco=USAR_COCO,
        device=device,
        **kwargs,
    )


def camara_json(cal: Calibracion, ancho: int, alto: int) -> dict[str, Any]:
    """Calibración normalizada del repo → `camara.json` del motor (píxeles del clip)."""

    def px(p: tuple[float, float]) -> list[int]:
        return [round(p[0] * ancho), round(p[1] * alto)]

    a, b = cal.stopLine
    medio = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    # La intersección queda "arriba" de la línea (el carro se aleja de la cámara, docs/10 §4), salvo que la
    # calibración diga parameters.stopLineAfterBelow = 1 (el carro viene hacia la cámara).
    abajo = cal.parameters.get("stopLineAfterBelow", 0) == 1
    despues = (medio[0], min(1.0, medio[1] + 0.1) if abajo else max(0.0, medio[1] - 0.1))
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


def _b64(ruta: Path, max_ancho: int | None = None) -> str | None:
    """JPEG en base64; con max_ancho lo reduce para la respuesta (el archivo en disco queda completo)."""
    if not ruta.exists():
        return None
    if max_ancho is None:
        return base64.b64encode(ruta.read_bytes()).decode()
    img = cv2.imread(str(ruta))
    if img is None:
        return None
    if img.shape[1] > max_ancho:
        img = cv2.resize(img, (max_ancho, round(img.shape[0] * max_ancho / img.shape[1])), interpolation=cv2.INTER_AREA)
    ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(jpg.tobytes()).decode() if ok else None


def analizar(clip: Path, cal: Calibracion, fabrica: Callable[..., Any] = crear_motor) -> PredictResponse:
    inicio = time.perf_counter()
    cap = cv2.VideoCapture(str(clip))
    if not cap.isOpened():
        raise ClipError("No se pudo abrir el clip")
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)  # el teléfono graba en vertical con la rotación como metadato
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    ancho, alto = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    # A 60 fps se procesa uno de cada dos cuadros: el tracking va bien a ~30 y el tiempo sigue saliendo del PTS.
    paso = max(1, round(fps / 30)) if fps else 1

    infracciones: list[dict[str, Any]] = []
    multas: list[dict[str, Any]] = []
    carpeta = EVIDENCE_DIR / uuid.uuid4().hex  # se conserva: es el respaldo de cada multa
    motor = fabrica(config=camara_json(cal, ancho, alto), carpeta_evidencias=str(carpeta), en_multa=multas.append)
    n, leidos, ultimo_ms, fuente = 0, 0, 0.0, "pts"
    try:
        while True:
            if leidos % paso and cap.grab():  # grab() salta el cuadro sin decodificarlo
                leidos += 1
                continue
            ok, frame = cap.read()
            if not ok:
                break
            leidos += 1
            ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            if n > 0 and ms <= 0:  # sin PTS: cae a número de fotograma / fps
                fuente, ms = "fps", (leidos - 1) * 1000 / fps if fps else 0.0
            ultimo_ms = ms
            salida = motor.procesar_frame(frame, "rojo", t=ms / 1000)
            infracciones += salida["infracciones_nuevas"]
            n += 1
    finally:
        motor.finalizar()  # cierra las multas pendientes (llama en_multa)
        cap.release()
    if n == 0:
        raise ClipError("El clip no tiene fotogramas")

    def at_ms(d: dict[str, Any]) -> int:
        return round(float(d["segundo"]) * 1000)

    incidents = _incidentes(infracciones, multas, ancho, alto, at_ms)
    infracciones = [i for i in infracciones if i.get("tipo") == "semaforo_rojo"]
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
        if (jpg := _b64(Path(i["carpeta"]) / "escena.jpg", ESCENA_MAX_ANCHO))
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
        incidents=incidents,
    )


def _incidentes(
    infracciones: list[dict[str, Any]], multas: list[dict[str, Any]], ancho: int, alto: int,
    at_ms: Callable[[dict[str, Any]], int],
) -> list[Incidente]:
    """Agrupa los registros `choque` del motor: uno por vehículo involucrado, misma clave (frame, caja)."""

    def clave(d: dict[str, Any]) -> tuple[int, tuple[int, ...]]:
        return int(d["frame"]), tuple(d["detalle"]["caja"])

    por_clave: dict[tuple[int, tuple[int, ...]], Incidente] = {}
    for i in infracciones:
        if i.get("tipo") != "choque" or clave(i) in por_clave:
            continue
        x1, y1, x2, y2 = i["detalle"]["caja"]
        por_clave[clave(i)] = Incidente(
            atMs=at_ms(i),
            confidence=float(i["detalle"]["conf"]),
            box=Box(x=x1 / ancho, y=y1 / alto, w=(x2 - x1) / ancho, h=(y2 - y1) / alto),
            vehicles=[],
            sceneJpegBase64=_b64(Path(i["carpeta"]) / "escena.jpg", ESCENA_MAX_ANCHO),
        )
    for m in multas:
        inc = por_clave.get(clave(m)) if m.get("tipo") == "choque" else None
        if inc is None or int(m["id"]) < 0:  # id negativo = registro de escena, sin vehículo
            continue
        inc.vehicles.append(VehiculoIncidente(
            trackId=int(m["id"]),
            clase=str(m["clase"]),
            plate=None if m.get("placa") in (None, PLACA_NO_LEIDA) else str(m["placa"]),
            ocrConfidence=float(m.get("confianza_placa", 0)),
            votes=int(m.get("lecturas_validas", 0)),
            rawReads=[str(x) for x in m.get("lecturas_crudas", [])],
        ))
    return list(por_clave.values())


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
