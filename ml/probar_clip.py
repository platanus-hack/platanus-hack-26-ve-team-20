"""Corre el pipeline de /predict sobre un video local, sin servidor ni Blob.

    python probar_clip.py clip.mp4                        # línea de pare horizontal al 60 % de la altura
    python probar_clip.py clip.mp4 --linea 0.2,0.55,0.8,0.55
    ML_USAR_COCO=true python probar_clip.py clip.mp4      # sin pesos propios (YOLO de COCO, sin placas)

Coordenadas normalizadas 0–1. Imprime la respuesta del contrato (sin los JPEG) y la carpeta de evidencias.
"""
import argparse
import json
from pathlib import Path

from app import pipeline
from app.schemas import Calibracion

ap = argparse.ArgumentParser()
ap.add_argument("clip", type=Path)
ap.add_argument("--linea", default="0,0.6,1,0.6", help="x1,y1,x2,y2 de la línea de pare (0–1)")
ap.add_argument("--hacia-camara", action="store_true", help="el carro viene hacia la cámara (cruza hacia abajo)")
args = ap.parse_args()

if not pipeline.motor_disponible():
    raise SystemExit("Falta ml/motor/motor_infracciones.py o los pesos en ml/weights/ (o usa ML_USAR_COCO=true)")
x1, y1, x2, y2 = (float(v) for v in args.linea.split(","))
params = {"stopLineAfterBelow": 1.0} if args.hacia_camara else {}
res = pipeline.analizar(args.clip, Calibracion(configVersion=0, stopLine=((x1, y1), (x2, y2)), parameters=params))

out = res.model_dump(by_alias=True)
for k in out["keyFrames"]:
    k["jpegBase64"] = f"<{len(k['jpegBase64'])} caracteres>"
if out["plateCropBase64"]:
    out["plateCropBase64"] = f"<{len(out['plateCropBase64'])} caracteres>"
print(json.dumps(out, indent=2, ensure_ascii=False))
print("Evidencias en:", max(pipeline.EVIDENCE_DIR.iterdir(), key=lambda p: p.stat().st_mtime, default="(ninguna)"))
