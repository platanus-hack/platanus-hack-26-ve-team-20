# Modo en vivo para la demo: la página /en-vivo manda cuadros de la cámara por WebSocket con el color del
# semáforo que marca el operador; el motor multa a quien cruza la línea de pare EN ROJO y cada multa
# cerrada (con placa votada) se registra en Vercel (POST /api/live/violations). A diferencia de /predict,
# aquí el motor sí recibe el color real en cada cuadro (guía de integración §7: "el servidor guarda el
# estado y lo pasa en cada procesar_frame").
import asyncio
import json
import os
import queue
import secrets
import threading
import urllib.request
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from . import pipeline
from .schemas import Calibracion

router = APIRouter()
PAGINA = Path(__file__).parent / "static" / "en_vivo.html"
ESTADOS = {"rojo", "amarillo", "verde"}


class Sesion:
    """Una cámara en vivo: su propio motor (el tracker guarda estado) y el color actual del semáforo."""

    def __init__(self, camara: str, fabrica: Callable[..., Any] = pipeline.crear_motor,
                 registrar: Callable[[dict[str, Any]], dict[str, Any]] | None = None) -> None:
        self.camara, self.fabrica = camara, fabrica
        self.registrar = registrar if registrar is not None else registrar_en_vercel
        self.estado, self.linea_y, self.hacia_camara = "verde", 0.6, False
        self.motor: Any = None
        self._ultimo: Any = None
        self.tam: tuple[int, int] | None = None
        self.multas: queue.Queue[dict[str, Any]] = queue.Queue()  # en_multa corre en el hilo del motor
        self.registros: queue.Queue[dict[str, Any]] = queue.Queue()

    def configurar(self, linea_y: float | None = None, hacia_camara: bool | None = None) -> None:
        """Cambiar la línea obliga a un motor nuevo (guía §4: finalizar() y crear otro)."""
        if linea_y is not None:
            self.linea_y = min(0.95, max(0.05, float(linea_y)))
        if hacia_camara is not None:
            self.hacia_camara = bool(hacia_camara)
        self.cerrar()

    def _motor(self, ancho: int, alto: int) -> Any:
        if self.motor is None or self.tam != (ancho, alto):
            self.cerrar()
            cal = Calibracion(configVersion=0, stopLine=((0, self.linea_y), (1, self.linea_y)),
                              parameters={"stopLineAfterBelow": 1.0} if self.hacia_camara else {})
            carpeta = pipeline.EVIDENCE_DIR / f"en-vivo-{uuid.uuid4().hex[:8]}"
            self.motor = self.fabrica(config=pipeline.camara_json(cal, ancho, alto),
                                      carpeta_evidencias=str(carpeta), en_multa=self.multas.put)
            self.tam = (ancho, alto)
            self._capturar_cajas(self.motor)
        return self.motor

    def _capturar_cajas(self, motor: Any) -> None:
        """Guarda el último resultado del tracker para mandar solo las cajas (sin tocar el motor)."""
        modelo = getattr(motor, "modelo", None)
        if modelo is None:
            return
        original = modelo.track

        def track(*a: Any, **k: Any) -> Any:
            self._ultimo = original(*a, **k)
            return self._ultimo

        modelo.track = track

    def _cajas(self, ancho: int, alto: int) -> list[dict[str, Any]]:
        """Cajas normalizadas 0–1 de los vehículos seguidos; `multa` si ya cruzó en rojo."""
        res, self._ultimo = self._ultimo, None
        boxes = res[0].boxes if res else None
        if boxes is None or boxes.id is None:
            return []
        out = []
        for (x1, y1, x2, y2), tid, c in zip(boxes.xyxy.cpu().numpy(), boxes.id.int().cpu().tolist(),
                                            boxes.cls.int().cpu().tolist()):
            clase = self.motor.nombres.get(c)
            if clase is None:  # p. ej. la caja de "accidente" de un modelo único: no es un vehículo
                continue
            tipos = self.motor.pistas.get(tid, {}).get("tipos", ())
            out.append({"id": tid, "clase": clase, "x": round(float(x1) / ancho, 4), "y": round(float(y1) / alto, 4),
                        "w": round(float(x2 - x1) / ancho, 4), "h": round(float(y2 - y1) / alto, 4),
                        "multa": "semaforo_rojo" in tipos})
        return out

    def procesar(self, jpg: bytes) -> dict[str, Any]:
        frame = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return {"tipo": "error", "mensaje": "Cuadro ilegible"}
        motor = self._motor(frame.shape[1], frame.shape[0])
        with pipeline.GPU_LOCK:
            salida = motor.procesar_frame(frame, self.estado)
        cruces = [{"id": i["id"], "clase": i["clase"]} for i in salida["infracciones_nuevas"]
                  if i.get("tipo") == "semaforo_rojo"]
        # Solo datos (unos cientos de bytes): la página muestra su propio video y dibuja las cajas encima.
        return {"tipo": "cuadro", "cajas": self._cajas(frame.shape[1], frame.shape[0]), "estado": salida["estado"],
                "cruces": cruces, "multas": self._multas_cerradas(), "registros": _vaciar(self.registros)}

    def _multas_cerradas(self) -> list[dict[str, Any]]:
        listas = []
        for m in _vaciar(self.multas):
            if m.get("tipo") != "semaforo_rojo":
                continue
            carpeta = Path(m["carpeta"])
            multa = {
                "ref": uuid.uuid4().hex,  # el id del motor se reinicia con cada motor: no sirve de clave
                "trackId": int(m["id"]), "clase": m["clase"], "hora": datetime.now(UTC).isoformat(),
                "placa": None if m.get("placa") in (None, pipeline.PLACA_NO_LEIDA) else str(m["placa"]),
                "confianza": float(m.get("confianza_placa", 0)), "votos": int(m.get("lecturas_validas", 0)),
                "crudas": [str(x) for x in m.get("lecturas_crudas", [])],
                "fotoVehiculo": pipeline._b64(carpeta / "vehiculo.jpg", 480),
                "fotoPlaca": pipeline._b64(carpeta / "placa.jpg"),
            }
            listas.append(multa)
            escena = pipeline._b64(carpeta / "escena.jpg", pipeline.ESCENA_MAX_ANCHO)
            threading.Thread(target=self._registrar, args=(multa, escena), daemon=True).start()
        return listas

    def _registrar(self, multa: dict[str, Any], escena: str | None) -> None:
        try:
            r = self.registrar({
                "cameraCode": self.camara, "occurredAt": multa["hora"], "trackId": multa["trackId"],
                "plate": multa["placa"], "plateConfidence": multa["confianza"], "votes": multa["votos"],
                "rawReads": multa["crudas"], "modelVersion": pipeline.MODEL_VERSION,
                "idempotencyKey": f"en-vivo-{multa['ref']}", "sceneJpegBase64": escena,
                "vehicleJpegBase64": multa["fotoVehiculo"], "plateJpegBase64": multa["fotoPlaca"],
            })
            self.registros.put({"ref": multa["ref"], "ok": True, **r})
        except Exception as e:  # sin Vercel la demo en pantalla sigue funcionando
            self.registros.put({"ref": multa["ref"], "ok": False, "error": str(e)[:200]})

    def cerrar(self) -> None:
        if self.motor is not None:
            self.motor.finalizar()  # cierra multas pendientes; se reportan en el próximo cuadro
            self.motor = None


def _vaciar(q: "queue.Queue[dict[str, Any]]") -> list[dict[str, Any]]:
    out = []
    while not q.empty():
        out.append(q.get_nowait())
    return out


def registrar_en_vercel(payload: dict[str, Any]) -> dict[str, Any]:
    """POST a la ruta de P2 en Vercel, que sube las fotos y llama a registerDetection de P1."""
    url, token = os.getenv("ML_REGISTRO_URL", ""), os.getenv("ML_SERVICE_TOKEN", "")
    if not url or not token:
        raise RuntimeError("Falta ML_REGISTRO_URL o ML_SERVICE_TOKEN: la multa solo quedó en pantalla")
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST", headers={
        "Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.loads(r.read())
    if not body.get("ok"):
        raise RuntimeError(body.get("error", {}).get("message", "Vercel rechazó la multa"))
    return dict(body["data"])


@router.get("/en-vivo")
def pagina() -> FileResponse:
    return FileResponse(PAGINA, media_type="text/html")


@router.websocket("/en-vivo/ws")
async def ws(websocket: WebSocket) -> None:
    await websocket.accept()
    sesion: Sesion | None = None
    try:
        # Primer mensaje: {"tipo":"auth","clave":CAMERA_API_KEY,"camara":"CAM-001"}
        hola = json.loads(await websocket.receive_text())
        clave = os.getenv("CAMERA_API_KEY", "")
        if not clave or not secrets.compare_digest(str(hola.get("clave", "")), clave):
            await websocket.send_json({"tipo": "error", "mensaje": "Clave de cámara inválida"})
            return await websocket.close(code=4401)
        if not pipeline.motor_disponible():
            await websocket.send_json({"tipo": "error", "mensaje": "El servicio no tiene los pesos del modelo"})
            return await websocket.close()
        sesion = Sesion(str(hola.get("camara") or "CAM-001"))
        await websocket.send_json({"tipo": "listo", "modelVersion": pipeline.MODEL_VERSION})
        while True:
            msg = await websocket.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes"):
                # procesar_frame es pesado: en un hilo, nunca en el event loop (guía §4).
                await websocket.send_json(await asyncio.to_thread(sesion.procesar, msg["bytes"]))
            elif msg.get("text"):
                orden = json.loads(msg["text"])
                if orden.get("tipo") == "semaforo" and orden.get("estado") in ESTADOS:
                    sesion.estado = orden["estado"]
                elif orden.get("tipo") == "linea":
                    await asyncio.to_thread(sesion.configurar, orden.get("y"), orden.get("haciaCamara"))
    except WebSocketDisconnect:
        pass
    finally:
        if sesion is not None:  # las multas que finalizar() cierra al salir también se registran
            s = sesion
            await asyncio.to_thread(lambda: (s.cerrar(), s._multas_cerradas()))
