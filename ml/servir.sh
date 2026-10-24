#!/usr/bin/env bash
# Levanta el servicio ML y lo publica con ngrok para que Vercel lo llame.
#   ./servir.sh tu-dominio.ngrok-free.app
# Lee de ../.env.local: ML_SERVICE_TOKEN (el mismo valor va en Vercel), CAMERA_API_KEY (clave de la página
# /en-vivo) y ML_REGISTRO_URL (p. ej. https://<app>.vercel.app/api/live/violations; sin ella las multas en
# vivo solo quedan en pantalla). Sin pesos propios usa YOLO de COCO.
set -euo pipefail
cd "$(dirname "$0")"

DOMINIO="${1:?Uso: ./servir.sh tu-dominio.ngrok-free.app}"
leer() { grep -E "^$1=" ../.env.local | cut -d= -f2- || true; }
TOKEN="$(leer ML_SERVICE_TOKEN)"
[ -n "$TOKEN" ] || { echo "Falta ML_SERVICE_TOKEN en .env.local"; exit 1; }
[ -f weights/vehiculos.pt ] || export ML_USAR_COCO=true
export CAMERA_API_KEY="$(leer CAMERA_API_KEY)" ML_REGISTRO_URL="$(leer ML_REGISTRO_URL)"

ML_SERVICE_TOKEN="$TOKEN" ML_DEVICE="${ML_DEVICE:-mps}" .venv/bin/uvicorn app.main:app --port 8000 &
UVICORN=$!
trap 'kill $UVICORN 2>/dev/null' EXIT
sleep 3
curl -fsS localhost:8000/health && echo
ngrok http --url="$DOMINIO" 8000 "${@:2}"   # p. ej. --log stdout si no hay terminal
