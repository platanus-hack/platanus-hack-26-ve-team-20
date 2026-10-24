# Contrato de POST /predict (docs/04-api.md §8). Lo consume lib/vision/ml-client.ts.
# Coordenadas normalizadas 0–1 (origen arriba-izquierda); instantes en ms desde el inicio del clip (PTS).
from typing import Literal

from pydantic import BaseModel, Field

Punto = tuple[float, float]


class Clip(BaseModel):
    url: str
    startedAt: str


class Homografia(BaseModel):
    imagePoints: list[Punto] = Field(min_length=4)
    groundPointsM: list[Punto] = Field(min_length=4)


class Carril(BaseModel):
    id: str
    polygon: list[Punto]
    allowedDirection: Punto


class ZonaVelocidad(BaseModel):
    yAM: float
    yBM: float


class Calibracion(BaseModel):
    configVersion: int
    homography: Homografia | None = None
    stopLine: tuple[Punto, Punto]
    lanes: list[Carril] = []
    speedZone: ZonaVelocidad | None = None
    parameters: dict[str, float] = {}


class PredictRequest(BaseModel):
    cameraCode: str
    clip: Clip
    calibration: Calibracion


class ClipInfo(BaseModel):
    fps: float
    frameCount: int
    durationMs: int
    timestampSource: Literal["pts", "fps"]


class Box(BaseModel):
    x: float
    y: float
    w: float
    h: float


class CruceLinea(BaseModel):
    crossed: bool
    atMs: int | None
    framesConfirmed: int | None = None


class Track(BaseModel):
    trackId: int
    # `class` es palabra reservada en Python: se serializa con alias.
    clase: str = Field(serialization_alias="class")
    firstMs: int | None = None
    lastMs: int | None = None
    framesSeen: int | None = None
    idSwitchSuspected: bool = False
    laneId: str | None = None
    stopLine: CruceLinea
    speedKmh: float | None = None
    speedValid: bool = False
    directionDeg: float | None = None
    relation: Literal["WITH_FLOW", "AGAINST_FLOW", "UNKNOWN"] = "UNKNOWN"


class Placa(BaseModel):
    trackId: int
    text: str
    ocrConfidence: float
    votes: int
    bestFrameMs: int
    rawReads: list[str] = []


class KeyFrame(BaseModel):
    ms: int
    jpegBase64: str
    vehicleBox: Box | None = None
    plateBox: Box | None = None


class VehiculoIncidente(BaseModel):
    trackId: int
    clase: str = Field(serialization_alias="class")
    plate: str | None  # None si el OCR no la leyó
    ocrConfidence: float
    votes: int
    rawReads: list[str] = []


class Incidente(BaseModel):
    """Posible choque (choques.pt): aviso para revisar, nunca una multa."""

    kind: Literal["CRASH"] = "CRASH"
    atMs: int
    confidence: float
    box: Box
    vehicles: list[VehiculoIncidente]  # vacío si el modelo de vehículos no vio los carros chocados
    sceneJpegBase64: str | None = None


class PredictResponse(BaseModel):
    modelVersion: str
    latencyMs: int
    simulated: bool = False
    clip: ClipInfo
    tracks: list[Track]
    plates: list[Placa]
    keyFrames: list[KeyFrame]
    plateCropBase64: str | None = None
    incidents: list[Incidente] = []
