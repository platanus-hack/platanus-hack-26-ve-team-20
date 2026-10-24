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

`GET /health` dice en qué modo está:

| Modo | Cuándo | Qué hace |
|---|---|---|
| `motor` | están `ml/weights/vehiculos.pt` y `placas.pt` | tus modelos entrenados |
| `coco` | `ML_USAR_COCO=true` | YOLO genérico de COCO (se descarga solo) para vehículos; placas solo si está `placas.pt` |
| `simulado` | sin pesos | respuesta fija del set A (cruza, placa `AB123CD`) |

Probar un video local sin servidor (imprime la respuesta del contrato y la carpeta de evidencias):

```bash
ML_USAR_COCO=true ML_DEVICE=mps python probar_clip.py clip.mp4 --linea 0,0.6,1,0.6
```

## Publicarlo para Vercel (ngrok)

```bash
./servir.sh brittle-kilowatt-entertain.ngrok-free.dev   # deja la terminal abierta
```

Levanta uvicorn con el `ML_SERVICE_TOKEN` de `.env.local` (`mps`, y COCO si no hay `weights/vehiculos.pt`) y abre el túnel
con el dominio fijo de ngrok (requiere ngrok ≥ 3.20 y `ngrok config add-authtoken`). En Vercel:
`ML_SERVICE_URL=https://brittle-kilowatt-entertain.ngrok-free.dev` y el mismo `ML_SERVICE_TOKEN`.

## Modo en vivo (demo)

Con `servir.sh` corriendo, abrir `https://<dominio-ngrok>/en-vivo` en el teléfono (o `http://localhost:8000/en-vivo`
en la Mac con la cámara de Continuidad). Pide la `CAMERA_API_KEY`, abre la cámara trasera y manda cuadros por
WebSocket. Botones ROJO/VERDE: el motor multa solo a quien cruza la línea de pare **en rojo**. Cada multa cerrada
aparece en la lista con placa y foto y se registra en Vercel (`ML_REGISTRO_URL` → `POST /api/live/violations`).
Sin esa variable, las multas solo quedan en pantalla. La cámara del navegador exige HTTPS (ngrok) salvo en localhost.

## Cuando termine el entrenamiento en Kaggle

El código del motor (`ml/motor/`) ya está en el repo, extraído de `deteccion_semaforo_placas.ipynb`. Solo faltan los pesos:

1. Descargar `app_infracciones.zip` de la pestaña **Output** de la versión guardada.
2. Copiar los pesos a `ml/weights/` (no van al repo). Si cambiaste el motor en el notebook, copia también `motor_infracciones.py`:
   ```bash
   unzip app_infracciones.zip -d /tmp/motor
   mkdir -p ml/weights && cp /tmp/motor/*.pt ml/weights/
   pip install -r ml/motor/requirements.txt
   ```
   Ultralytics instala `opencv-python` y choca con la versión headless. Dejar solo una:
   `pip uninstall -y opencv-python opencv-python-headless && pip install opencv-python-headless==4.11.0.86`.
3. `ML_DEVICE=mps` en Mac con chip Apple, `0` con NVIDIA, `cpu` por defecto.
4. Reiniciar uvicorn: `/health` debe decir `"mode": "motor"`.
5. Probar con un clip: `prueba_camara.py --camara clip.mp4` (referencia del motor) y luego `/predict`.

## Variables

| Variable | Defecto | Uso |
|---|---|---|
| `ML_SERVICE_TOKEN` | — (obligatoria) | Bearer que envía `lib/vision/ml-client.ts`. Sin ella todo `/predict` da 401 |
| `ML_DEVICE` | `cpu` | `0`, `mps` o `cpu` |
| `ML_USAR_COCO` | `false` | `true` = YOLO de COCO sin `vehiculos.pt` (pruebas) |
| `ML_OCR` | `fast-plate-ocr` | OCR de placas; `easyocr` vuelve al del notebook (medido: 6/21 placas exactas contra 19/21) |
| `ML_REALCE` | `false` | `true` = realza las placas borrosas antes del OCR (medido: no mejora con EasyOCR) |
| `ML_CHOQUES` | `false` | `true` = activa `weights/choques.pt` (dio falsas alarmas en video real; apagada para la demo) |
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
