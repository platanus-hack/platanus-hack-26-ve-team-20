# Servicio de inferencia (docs/04-api.md §8). Corre fuera de Vercel: uvicorn app.main:app
import os
import secrets
import tempfile
import threading
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException

from . import pipeline
from .schemas import PredictRequest, PredictResponse

app = FastAPI(title="VíaClara ML")
# El motor es pesado y guarda estado de tracking: un clip a la vez (docs de integración §4).
_lock = threading.Lock()


def auth(authorization: Annotated[str, Header()] = "") -> None:
    token = os.getenv("ML_SERVICE_TOKEN", "")
    if not token or not secrets.compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(status_code=401, detail="No autorizado")


@app.get("/health")
def health() -> dict[str, object]:
    modo = ("coco" if pipeline.USAR_COCO else "motor") if pipeline.motor_disponible() else "simulado"
    return {"ok": True, "modelVersion": pipeline.MODEL_VERSION, "mode": modo}


# `def` (no async): FastAPI lo corre en un hilo, fuera del event loop.
@app.post("/predict", dependencies=[Depends(auth)], response_model_by_alias=True)
def predict(req: PredictRequest) -> PredictResponse:
    if not pipeline.motor_disponible():
        return pipeline.simulado(req)
    with _lock, tempfile.TemporaryDirectory() as tmp:
        try:
            clip = pipeline.descargar(req.clip.url, Path(tmp))
            return pipeline.analizar(clip, req.calibration)
        except pipeline.ClipError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
