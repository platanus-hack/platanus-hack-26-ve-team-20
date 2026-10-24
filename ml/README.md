# ml/ — servicio de inferencia (P2)

FastAPI fuera de Vercel con `POST /predict` y `GET /health` (contrato en `docs/04-api.md` §8).
Envuelve `MotorInfracciones` (sale del notebook de Kaggle) y traduce su salida al contrato.

## Correr

```bash
cd ml
python3.13 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
ML_SERVICE_TOKEN=dev uvicorn app.main:app --reload --port 8000
pytest -q
```

Sin los pesos el servicio responde en **modo simulado** (set A: cruza, placa `AB123CD`).
`GET /health` dice en qué modo está (`"mode": "motor" | "simulado"`).

## Cuando termine el entrenamiento en Kaggle

1. Descargar `app_infracciones.zip` de la pestaña **Output** de la versión guardada.
2. Copiar el código del motor a `ml/motor/` (sí va al repo) y los pesos a `ml/weights/` (no van al repo):
   ```bash
   unzip app_infracciones.zip -d /tmp/motor
   cp /tmp/motor/{motor_infracciones.py,configurar_camara.py,prueba_camara.py,camara_ejemplo.json,requirements.txt} ml/motor/
   mkdir -p ml/weights && cp /tmp/motor/*.pt ml/weights/
   pip install -r ml/motor/requirements.txt
   ```
   Si al instalar EasyOCR se rompe OpenCV: `pip uninstall -y opencv-python opencv-python-headless && pip install opencv-python-headless`.
3. `ML_DEVICE=mps` en Mac con chip Apple, `0` con NVIDIA, `cpu` por defecto.
4. Reiniciar uvicorn: `/health` debe decir `"mode": "motor"`.
5. Probar con un clip: `prueba_camara.py --camara clip.mp4` (referencia del motor) y luego `/predict`.

## Variables

| Variable | Defecto | Uso |
|---|---|---|
| `ML_SERVICE_TOKEN` | — (obligatoria) | Bearer que envía `lib/vision/ml-client.ts`. Sin ella todo `/predict` da 401 |
| `ML_DEVICE` | `cpu` | `0`, `mps` o `cpu` |
| `ML_MODEL_VERSION` | `vc-0.1` | Va en cada `VisionResult` |
| `ML_MOTOR_DIR`, `ML_WEIGHTS_DIR`, `ML_EVIDENCE_DIR` | `ml/motor`, `ml/weights`, `ml/evidencias` | Rutas |

## Cómo se usa el motor

- El servicio **no conoce el semáforo**: le pasa `"rojo"` en todos los fotogramas, así el motor reporta cada
  cruce de la línea de pare. La luz real en el instante del cruce la decide `lib/vision/rules.ts` con los `LightChange`.
- Un motor nuevo por clip (tracking limpio) y un clip a la vez (lock).
- `t` = PTS real de cada fotograma (`CAP_PROP_POS_MSEC`).
- Las evidencias del motor se conservan en `ml/evidencias/<uuid>/`.
- Por ahora solo se traduce la línea de pare (MVP luz roja). Velocidad y contravía: pendientes.

## Licencias

Ultralytics YOLO es **AGPL-3.0**; EasyOCR es Apache-2.0. Anotar aquí la licencia de cada dataset de Kaggle usado:

| Dataset | Licencia |
|---|---|
| | |
