# 10 — Modelo ML y app móvil de cámara · VíaClara

Dueño: **P2**. Complementa `02-arquitectura.md` §5 y el contrato `04-api.md` §8. Base de las decisiones: `docs/Velocidad y contravía en fotomultas.md` (investigación). Todo el proyecto es TypeScript; la única excepción es `ml/` (Python), porque el ajuste fino y la inferencia viven en ese ecosistema.

## 1. Decisiones
| Tema | Decisión |
|---|---|
| Detector | **Preentrenado** (YOLO con pesos COCO; alternativa RF-DETR, Apache-2.0) con **ajuste fino** sobre datasets de Kaggle. No se entrena desde cero. Ultralytics es AGPL-3.0: anotarlo si el proyecto se comercializa. |
| Tracking | ByteTrack (`tracker="bytetrack.yaml"` explícito o el paquete `trackers`). El cambio de ID es el principal enemigo de las reglas. |
| Placa | Detector de placas con ajuste fino + **EasyOCR** preentrenado, con votación entre fotogramas del mismo track. |
| Cámara | **Teléfono con app Expo** que graba un **clip corto** (3–5 s, ≥ 25–30 fps), no ráfagas de fotos. |
| Tiempo | Los fotogramas se leen del clip con su **PTS** real; la velocidad usa solo diferencias de tiempo entre fotogramas. |
| Velocidad | **Homografía** con 4+ puntos del pavimento medidos (2–4 de control) y una zona de velocidad de 15–25 m. Estimación **no sancionatoria**. |
| Contravía | Regla sobre la trayectoria en el plano métrico, con la **dirección permitida por carril** en coordenadas del suelo. Sin brújula. |
| Semáforo | El estado lo marca el **operador o un semáforo simulado** en `/camaras` (amarillo cuenta como verde), como hace la investigación. Detectarlo por visión queda como stretch. |
| Dónde corre | Servicio **Python (FastAPI)** en `ml/`, **fuera de Vercel** (máquina del equipo con túnel o host gratuito). Entrenamiento en **notebooks de Kaggle** (GPU). |
| Subida del clip | **Client upload a Vercel Blob** con token de `POST /api/blob/upload` (el clip supera los 4,5 MB de Vercel Functions). Prueba corta en h1–4; alternativa: subir directo al servicio ML. |
| Validación | Por **división del dataset** en entrenamiento / validación / prueba (p. ej. 70/15/15, separando por fuente o secuencia para evitar fuga de datos). No se graba video propio para validar; **los datos propios son solo para la demo**. |
| Caída del servicio | `NEEDS_REVIEW` (`ML_SERVICE_ERROR`); plan B con `DEMO_VISION_CACHE`. |

## 2. Pendientes (P2, hora 0–1)
- **Datasets de Kaggle** (de la investigación): `saumyapatel/traffic-vehicles-object-detection`, `nadinpethiyagoda/vehicle-dataset-for-yolo`, `fareselmenshawii/large-license-plate-dataset` (obligatorios), `andrewmvd/car-plate-detection` (recomendado). Ninguna licencia está verificada: revisarlas en Kaggle y anotarlas en el README de `ml/`. Se adjuntan como "Add Input" en el notebook.
- Pesos entrenados: no van al repo si son grandes; guardarlos en un release/Drive y documentar cómo descargarlos en `ml/README.md`.
- Métricas de validación (sobre el split de **prueba**, que no se usa para ajustar): mAP50 y mAP50-95 de vehículos y de placas, y exactitud del OCR por placa completa y por carácter. Velocidad, contravía y cruce de línea **no tienen datos de referencia**: se prueban con tracks sintéticos y se comprueban en los clips de demo (§8); en el pitch no se declaran precisiones para ellas.
- Los datasets "vehicle speed" de Kaggle no están verificados; no se usan para validar velocidad hasta confirmar que traen una referencia medida.
- Verificar que el client upload de Blob funciona desde React Native/Expo (spike de 30 min); si no, subir directo al servicio ML.

## 3. Servicio `ml/`
- `POST /predict` y `GET /health` según `04-api.md` §8. Auth: `Authorization: Bearer ML_SERVICE_TOKEN`.
- **Pipeline por clip**: descargar el clip por URL → decodificar fotogramas con PTS (PyAV/OpenCV) → detector + ByteTrack → punto inferior central de cada caja → homografía a metros → reglas → placa (votación + mejor recorte) → fotogramas clave y recorte de placa.
- **Velocidad**: por vehículo, una sola velocidad entre dos líneas del plano métrico (`speedZone.yAM`, `yBM`) con **interpolación del instante de cruce** entre dos fotogramas, o pendiente robusta sobre la trayectoria dentro de la zona. `speedKmh = |yB − yA| / Δt × 3,6`. Se descarta (`null`) si hay huecos, oclusión, cambio de ID o fps < 24.
- **Cruce de línea de pare**: el punto inferior central pasa `stopLine` y se mantiene del otro lado ≥ 3 fotogramas. Devuelve el instante del cruce; la luz en ese instante la evalúa `lib/vision/rules.ts`.
- **Contravía**: ventana de 1 s, desplazamiento > 2 m, ángulo > 135° contra `allowedDirection` del carril durante 10 chequeos seguidos, edad mínima del track de 15 fotogramas. Devuelve `relation` por vehículo (`WITH_FLOW`, `AGAINST_FLOW`, `UNKNOWN`).
- Parámetros de arranque en `Camera.parameters` (no están validados en ninguna fuente; ajustarlos con los clips de demo, sin presentarlos como validados).
- Pruebas (pytest): contrato de `/predict`, homografía con puntos sintéticos y error de reproyección, velocidad con tracks sintéticos e interpolación, contravía y falsos positivos (retroceso, moto de lado), OCR sobre placas de prueba.

## 4. App móvil `mobile/` (Expo, TypeScript)
- **Pantallas**: (1) Ajustes: URL de la API (`EXPO_PUBLIC_API_BASE_URL`), `CAMERA_API_KEY` (se escribe en la app, no va en el repo) y código de cámara (`CAM-001`). (2) Cámara: vista previa, botón **Grabar evento** (clip de 3–5 s) y estado de subida. (3) Último resultado: veredicto, placa, velocidad y carril/dirección.
- **Grabación**: `expo-camera` (`recordAsync`, compatible con Expo Go) a 1080p/30 fps. Si hace falta fijar fps, exposición u obturador (placas: 1/1000 s), pasar a `react-native-vision-camera` con build de desarrollo.
- **Reloj**: al abrir, la app pide `GET /api/time` y calcula `clockOffsetMs` entre el reloj del teléfono y el del servidor; lo envía con cada evento para ubicar el clip en la línea de tiempo del semáforo.
- **Telemetría**: GPS (`expo-location`) para ubicar la cámara; la brújula no se usa para decidir infracciones.
- **Envío**: pide token a `POST /api/blob/upload` (`X-Camera-Key`), sube el clip a Blob y llama a `POST /api/detections` con la URL. Si falla, permite reintentar con la misma `idempotencyKey`.
- **Montaje**: teléfono en **trípode, fijo**, apuntando a lo largo del carril; la calibración solo vale con la cámara quieta. Foto de referencia por cámara para detectar si se movió.
- **Disparo**: manual en el MVP. Stretch: disparo por movimiento.

## 5. Calibración de una cámara (antes de la demo)
1. Montar el teléfono y grabar un clip de referencia; guardar un fotograma como imagen de referencia.
2. Medir 6–10 puntos del pavimento con cinta (esquinas de líneas de carril, marcas del brocal); dejar 2–4 como puntos de control.
3. En `/camaras` marcar esos puntos sobre el fotograma de referencia e ingresar sus coordenadas en metros. El sistema calcula la homografía y muestra el **error de reproyección** de los puntos de control (objetivo ≤ 0,15 m).
4. Dibujar `stopLine`, los polígonos de carril y su `allowedDirection`, y fijar `speedZone` (base de 15–25 m, empezando a 10–15 m de la cámara).
5. Guardar (PATCH `/api/cameras/[id]`); se incrementa `configVersion`. Probar con los clips demo A–D.

## 6. Semáforo simulado
`/camaras` tiene un control "Semáforo" (ROJO/VERDE; amarillo cuenta como verde) por cámara. Cada cambio se guarda como `LightChange` con la hora del servidor. Al procesar un clip, `api/detections.ts` arma la línea de tiempo de la luz para la ventana del clip (con `clockOffsetMs`) y la envía al análisis. Si la luz cambia dentro de la ventana, `lib/vision/rules.ts` evalúa el estado **en el instante del cruce**.

## 7. Viabilidad (según la investigación)
Conclusión central: velocidad, contravía, PARE, giros y línea continua **no requieren entrenar modelos nuevos de infracciones**; salen de las trayectorias del tracker más calibración por cámara. Solo se afinan el detector de vehículos y el de placas. El cuello de botella es la calibración, el reloj y la falta de datos de referencia: sin video propio, solo el detector y el OCR se validan con métricas (split del dataset).

| Componente | Veredicto | Condición / riesgo |
|---|---|---|
| Vehículos y placas | **Viable** | Ajuste fino de detector preentrenado con los datasets de §2; se mide con el split de prueba. Motos, noche y lluvia dependen de lo que traigan los datasets. |
| OCR de placa | **Viable con EasyOCR** | Medir exactitud en el split de prueba; votar entre fotogramas. La distancia real de la cámara de demo puede degradarla: comprobarlo en los clips demo. |
| Luz roja | **Viable** | Regla de cruce de línea (referencia abierta con F1 0,93); estado del semáforo desde el operador/app. |
| Velocidad | **Estimación sin validar** | La literatura reporta 1–3 km/h con homografía y tiempos reales (1,69 km/h en un pipeline YOLOv8 + ByteTrack); aquí no hay referencia propia para confirmarlo, así que solo se prueba con tracks sintéticos y una comprobación de cordura en la demo. Con 30 fps y base de 10 m, ±1 fotograma ya es hasta 11 %; por eso base de 15–25 m. **No sirve para multar** (Ley de Metrología; OIML R 91-1 exige ±3 km/h con ensayo de tipo). |
| Contravía | **Viable con reglas, sin validar** | Riesgo: cambio de ID (precisión 0,75 con SORT vs 0,99 con mejor tracking en Iowa) y motos que zigzaguean, retrocesos para estacionar. No hay dataset público con contravías etiquetadas; se prueba con tracks sintéticos y un clip escenificado de la demo. Siempre con revisión humana. |
| Validación | **Solo detector y OCR** | Por división del dataset. Para velocidad, contravía y luz roja no hay referencia pública ni propia: se declara como limitación. |
| Google Maps / Street View | **No usar** | Sus términos prohíben entrenar y validar modelos con su contenido. OSM (`oneway`, `maxspeed`) solo como punto de partida. |

Realista para la demo: **luz roja + placa con revisión humana**; velocidad y dirección como estimaciones etiquetadas "no sancionatorias" y "sin validar". Notificar al propietario es una decisión legal abierta (en Colombia se declaró inconstitucional responsabilizarlo por lo que capta una cámara): el diseño deja abierta la defensa y la apelación.

## 8. Datos propios (solo para la demo)
No se graba video propio para validar el modelo (la validación sale del split del dataset, §1). Lo que sí se graba es lo mínimo para la demo:
1. **Calibración de la cámara de demo** (§5) y su fotograma de referencia.
2. **Clips demo A–D** con placas ficticias: A (luz roja, cruza, placa legible), B (verde), C (placa ilegible), D (vehículo con deuda). Un clip escenificado de contravía es opcional.
3. **Comprobación de cordura de la velocidad**: recorrer una distancia medida a velocidad aproximadamente conocida (cronómetro) y verificar que la estimación es plausible. Es una verificación, no una validación; no se cita como precisión.
4. **Respaldo**: respuestas guardadas en `public/demo/*.json` para `DEMO_VISION_CACHE`.

## 9. Contratos afectados (avisar a P1 y a todos en la reunión de la hora 1)
`VisionResult` (`clipUrl`, `motion`, `modelVersion`; `VISION_PARSE_ERROR` pasa a `ML_SERVICE_ERROR`), `Camera` (`homography`, `lanes`, `speedZone`, `parameters`, `configVersion`, `refFrameUrl`; se eliminan `heading`, `speedLines`, `lightRoi`, `turnZone`), nuevo modelo `LightChange`, `Violation` (`measuredSpeedKmh`, `laneId`, `roadRelation`, `modelVersion`), `EvidenceKind.CLIP`, `POST /api/detections` (JSON con URL del clip), `POST /api/blob/upload`, `GET /api/time`, `POST /api/cameras/[id]/light` y el contrato `/predict`. Cualquier cambio posterior sigue la regla de `docs/09` §2.
