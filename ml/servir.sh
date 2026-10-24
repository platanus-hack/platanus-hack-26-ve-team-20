#!/usr/bin/env bash
# Levanta el servicio ML y lo publica con ngrok para que Vercel lo llame.
#   ./servir.sh tu-dominio.ngrok-free.app
# Lee ML_SERVICE_TOKEN de ../.env.local (el mismo valor va en Vercel). Sin pesos propios usa YOLO de COCO.
set -euo pipefail
cd "$(dirname "$0")"

DOMINIO="${1:?Uso: ./servir.sh tu-dominio.ngrok-free.app}"
TOKEN="$(grep -E '^ML_SERVICE_TOKEN=' ../.env.local | cut -d= -f2-)"
[ -n "$TOKEN" ] || { echo "Falta ML_SERVICE_TOKEN en .env.local"; exit 1; }
[ -f weights/vehiculos.pt ] || export ML_USAR_COCO=true

ML_SERVICE_TOKEN="$TOKEN" ML_DEVICE="${ML_DEVICE:-mps}" .venv/bin/uvicorn app.main:app --port 8000 &
UVICORN=$!
trap 'kill $UVICORN 2>/dev/null' EXIT
sleep 3
curl -fsS localhost:8000/health && echo
ngrok http --url="$DOMINIO" 8000
