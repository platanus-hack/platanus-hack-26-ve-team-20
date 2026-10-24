# 04 — API · VíaClara

Convenciones: JSON, Zod en `lib/contracts/`, respuesta `{ ok: true, data }` | `{ ok: false, error: { code, message } }`. Códigos HTTP: 200/201, 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 404 `NOT_FOUND`, 409 `CONFLICT`/`INVALID_TRANSITION`, 429 `RATE_LIMITED`, 502 `UPSTREAM_ERROR`.
Auth: `admin` = cookie de `ADMIN_PASSCODE`; `officer` = cookie de `OFFICER_PASSCODE` + `officerId`; `public` = sin auth.

## 0. Contratos compartidos (`lib/contracts/index.ts`) — se acuerdan en la hora 1
```ts
export type ViolationType = "RED_LIGHT" | "TURN_ARROW" | "SPEEDING";
export type Verdict = "VIOLATION" | "NO_VIOLATION" | "NEEDS_REVIEW";
export type LightState = "RED" | "YELLOW" | "GREEN" | "UNKNOWN";

export interface FrameInput { url: string; capturedAt: string /* ISO */; }

export interface VisionResult {            // salida de lib/vision (P2) → entrada de lib/domain (P1)
  cameraId: string;
  type: ViolationType;
  verdict: Verdict;
  reviewReason?: "LOW_CONFIDENCE" | "NO_PLATE" | "MODEL_RULE_DISAGREE" | "VISION_PARSE_ERROR";
  plate: string | null;                    // normalizada
  plateConfidence: number;                 // 0..1
  confidence: number;                      // 0..1
  occurredAt: string;
  frames: Array<FrameInput & { lightState: LightState; vehicleBox?: Box }>;
  plateCropUrl?: string;
  aiOutput: unknown; ruleOutput: unknown;
  idempotencyKey: string;
}
export interface Box { x: number; y: number; w: number; h: number } // normalizado 0..1

// lib/domain (P1)
export function registerDetection(r: VisionResult): Promise<{ violationId: string; status: ViolationStatus; fineId?: string; duplicate: boolean }>;
export function registerSighting(s: { cameraId: string; plate: string; seenAt: string; evidenceUrl?: string }): Promise<{ sightingId: string; vehicleId?: string; unpaidCount: number }>;
export function markFinePaid(fineId: string, paymentId: string): Promise<void>;

// lib/notify (P3)
export function notifyFineIssued(fineId: string): Promise<NotificationResult>;
export function notifyPaymentConfirmed(fineId: string): Promise<NotificationResult>;
export function notifyOfficerAlert(alertId: string): Promise<NotificationResult>;
export interface NotificationResult { channel: "WHATSAPP" | "EMAIL"; status: "SENT" | "FAILED" | "DRY_RUN"; providerId?: string }

// lib/alerts (P3)
export function dispatchAlert(sightingId: string): Promise<{ alertId: string; status: AlertStatus; officerId?: string; distanceM?: number }>;

// lib/payments (P3)
export function chargeC2P(req: C2PRequest): Promise<{ status: "APPROVED" | "REJECTED"; reference?: string; failureCode?: string }>;
```
Mientras un módulo no existe, su dueño publica un **mock** con la misma firma en `lib/<modulo>/mock.ts` (activado con `USE_MOCKS=true`).

---

## 1. Detecciones y cámaras (P2)

### `POST /api/blob/upload` (admin)
Handler de `@vercel/blob/client` `handleUpload`. Restringe `allowedContentTypes: ["image/jpeg","image/png","image/webp"]`, máx 5 MB, prefijo `evidence/`.

### `POST /api/detections` (admin) · `maxDuration = 60`
Request:
```json
{
  "cameraId": "cam_cuid",
  "type": "RED_LIGHT",
  "frames": [
    { "url": "https://...blob.vercel-storage.com/evidence/a.jpg", "capturedAt": "2026-10-24T14:03:10.100Z" },
    { "url": "https://...blob.vercel-storage.com/evidence/b.jpg", "capturedAt": "2026-10-24T14:03:10.900Z" }
  ],
  "idempotencyKey": "opcional-uuid"
}
```
Response 200:
```json
{ "ok": true, "data": {
  "verdict": "VIOLATION",
  "violationId": "vio_cuid",
  "status": "NOTIFIED",
  "fineId": "fine_cuid",
  "plate": "AB123CD",
  "confidence": 0.91,
  "lightStates": ["RED", "RED"],
  "duplicate": false,
  "latencyMs": 6400
}}
```
Lógica: cargar cámara → `lib/vision.analyze()` → `lib/domain.registerDetection()` → (P1 llama `notifyFineIssued` si FINED) → si vehículo con multas impagas previas también `registerSighting` + `dispatchAlert`.
Errores: Claude caído → 200 con `verdict: "NEEDS_REVIEW"`, `reviewReason: "VISION_PARSE_ERROR"` (nunca perder la evidencia).

### `POST /api/sightings` (admin) — "placa vista" sin infracción
Request `{ "cameraId": "...", "plate": "AB123CD", "seenAt": "ISO", "evidenceUrl": "opcional" }` o `{ "cameraId", "frames":[...] }` (P2 lee placa con Claude).
Response `{ ok, data: { sightingId, unpaidCount, alert: { alertId, status, officerId?, distanceM? } | null } }`.

### `GET /api/cameras` (admin) → lista con calibración. `PATCH /api/cameras/[id]` (admin) → `{ stopLine?, lightRoi? }`.

## 2. Violaciones y revisión (P1)
### `GET /api/violations?status=NEEDS_REVIEW&since=ISO&limit=50` (admin)
```json
{ "ok": true, "data": { "items": [ {
  "id": "vio_cuid", "type": "RED_LIGHT", "status": "NEEDS_REVIEW", "reviewReason": "LOW_CONFIDENCE",
  "camera": { "code": "CAM-001", "intersection": "Av. Demo Norte con Calle 1 (ejemplo)" },
  "plateRead": "AB12?CD", "confidence": 0.62, "occurredAt": "ISO",
  "evidence": [{ "kind": "FRAME", "url": "..." }],
  "fine": null
} ], "nextSince": "ISO" } }
```
### `POST /api/violations/[id]/review` (admin)
Request `{ "action": "APPROVE", "plate": "AB123CD", "note": "placa legible en frame 2" }` o `{ "action": "VOID", "reason": "Vehículo de emergencia" }`.
Response `{ ok, data: { status: "NOTIFIED" | "VOID", fineId? } }`. 409 si transición inválida.

## 3. Multa pública (P1)
### `GET /api/fines/[token]` (public)
```json
{ "ok": true, "data": {
  "token": "x7Gq...", "status": "PENDING", "overdue": false,
  "type": "RED_LIGHT", "occurredAt": "ISO", "intersection": "…(ejemplo)", "cameraCode": "CAM-001",
  "plateMasked": "AB***CD", "vehicle": "Sedán gris (ejemplo)",
  "amountCents": 0, "currency": "VES", "dueAt": "ISO",
  "verification": "AUTO" ,
  "evidence": [{ "kind": "FRAME", "url": "...", "capturedAt": "ISO", "lightState": "RED" }],
  "paidAt": null, "paymentReference": null
}}
```
El token es la "llave" de acceso: quien lo tiene ve la evidencia de esa multa. No muestra cédula ni teléfono.

## 4. Portal por cédula (P1)
### `POST /api/portal/lookup` (public, rate limit 10/10min/IP)
Request `{ "cedula": "V-99000001" }` (acepta `V12345678`, `v-12.345.678`; normaliza).
Response (siempre 200, misma forma aunque no exista):
```json
{ "ok": true, "data": {
  "cedulaMasked": "V-****0001",
  "summary": { "total": 3, "pending": 1, "paid": 2 },
  "items": [ { "occurredAt": "ISO", "type": "RED_LIGHT", "intersection": "…", "plateMasked": "AB***CD",
               "status": "PENDING", "amountCents": 0, "currency": "VES", "fineToken": null } ]
}}
```
`fineToken` solo se expone tras OTP (stretch: `POST /api/portal/otp` → WhatsApp con código → `POST /api/portal/verify`). Escribe `AuditLog(PORTAL_LOOKUP, ip)`.

## 5. Pagos C2P SIMULADOS (P3)
### Contexto: cómo es C2P real
En Pago Móvil C2P (comercio a persona) el **comercio** debita al pagador. El pagador genera en la app de su banco una **clave C2P** (token de un solo uso) y entrega: **banco** (código de 4 dígitos), **teléfono** afiliado, **cédula** y **clave**. El comercio envía eso + monto + concepto a la API C2P de **su** banco (o de un agregador de pagos) autenticado con credenciales del comercio; el banco responde aprobado/rechazado con número de referencia. Integración real requeriría: convenio con banco/agregador, credenciales y certificados, ambiente de certificación, conciliación diaria y manejo de reversos. **En VíaClara NO hay integración real.**

### `POST /api/payments/c2p` (public; identificado por token)
Request:
```json
{
  "fineToken": "x7Gq...",
  "payerBankCode": "0102",
  "payerPhone": "04120000001",
  "payerCedula": "V-99000001",
  "c2pKey": "12345678",
  "idempotencyKey": "uuid-generado-en-el-cliente"
}
```
Validación: banco ∈ lista de ejemplo (`lib/payments/banks.ts`), teléfono venezolano `04(12|14|16|24|26)\d{7}`, clave `^\d{6,8}$`.
Simulador (`lib/payments/c2p.ts`): espera 800–1500 ms; `c2pKey === "000000"` → `REJECTED` (`INVALID_KEY`); `"111111"` → `REJECTED` (`INSUFFICIENT_FUNDS`); resto → `APPROVED`, referencia `SIM-` + 8 dígitos.
Response 200:
```json
{ "ok": true, "data": { "status": "APPROVED", "reference": "SIM-48213977", "paidAt": "ISO", "simulated": true } }
```
- Multa ya pagada → 409 `ALREADY_PAID` (y la UI muestra el comprobante existente).
- Mismo `idempotencyKey` → devuelve el mismo resultado, no crea otro `Payment`.
- **La clave C2P nunca se persiste ni se loguea.**
- Al aprobar: `markFinePaid()` (P1) + `notifyPaymentConfirmed()`.

## 6. Oficiales y alertas (P3)
### `POST /api/officers/session` (public) `{ "passcode": "...", "badge": "OF-0001" }` → cookie.
### `POST /api/officers/location` (officer)
`{ "lat": 10.49, "lng": -66.88, "accuracyM": 25, "onDuty": true }` → `{ ok, data: { recordedAt } }`. Cliente envía cada 30 s con `navigator.geolocation.watchPosition`; botón "Usar posición de demo".
### `GET /api/officers/[id]/alerts?since=ISO` (officer)
```json
{ "ok": true, "data": { "items": [ {
  "id": "alr_cuid", "status": "SENT", "createdAt": "ISO",
  "plate": "XY987ZT", "vehicle": "Camioneta blanca (ejemplo)", "unpaidCount": 2,
  "camera": { "code": "CAM-001", "intersection": "…", "lat": 10.5, "lng": -66.9 },
  "distanceM": 420
} ] } }
```
### `POST /api/alerts/[id]/ack` (officer) → `{ status: "ACKNOWLEDGED" }`.

Algoritmo `dispatchAlert` (`lib/alerts/dispatch.ts`):
1. Si existe `Alert` para el mismo `vehicleId` en últimos 10 min → `SUPPRESSED`.
2. Oficiales `onDuty` con `OfficerLocation` de < 10 min.
3. `haversine(camera, officer)`; filtrar `≤ ALERT_RADIUS_METERS`; tomar el menor.
4. Crear `Alert` + `notifyOfficerAlert`. Ninguno → `NO_OFFICER_NEARBY`.

## 7. Webhooks Kapso (P3)
### Saliente (envío) — `lib/notify/kapso.ts`
```http
POST https://api.kapso.ai/meta/whatsapp/v24.0/{KAPSO_PHONE_NUMBER_ID}/messages
X-API-Key: {KAPSO_API_KEY}
Content-Type: application/json

{ "messaging_product": "whatsapp", "recipient_type": "individual", "to": "584120000001",
  "type": "text", "text": { "body": "VíaClara · Aviso de infracción…\nVer y pagar: https://…/multa/x7Gq…", "preview_url": true },
  "biz_opaque_callback_data": "fine:fine_cuid" }
```
Respuesta trae `messages[0].id` (wamid) → `Notification.providerId`. Fuente: https://docs.kapso.ai/api/meta/whatsapp/messages/send-a-message

**Ventana de 24 h de WhatsApp**: mensajes iniciados por la empresa fuera de la ventana requieren **plantilla aprobada** (`type: "template"`, nombre en `KAPSO_TEMPLATE_FINE`). Para la demo: (a) aprobar plantilla temprano, o (b) los teléfonos de demo escriben primero "hola" al número para abrir la ventana. Hacer (b) siempre antes del pitch.

Textos (`lib/notify/templates.ts`):
- `FINE_ISSUED`: "VíaClara (demo). Se registró una posible infracción: {tipo} en {intersección}, {fecha hora} (hora de Caracas), vehículo placa {placaEnmascarada}. Monto de ejemplo: {monto}. Vea la evidencia, pague o apele aquí: {link}"
- `PAYMENT_CONFIRMED`: "VíaClara (demo). Pago simulado recibido. Ref {ref}. Multa {placaEnmascarada} saldada."
- `OFFICER_ALERT`: "VíaClara · Alerta: vehículo {placa} ({vehículo}) con {n} multas impagas visto en {intersección} hace {min} min, a {distancia} de su posición. Verifique antes de actuar."

### Entrante — `POST /api/webhooks/kapso`
- Verificar `X-Webhook-Signature` = HMAC-SHA256(body crudo, `KAPSO_WEBHOOK_SECRET`) con comparación de tiempo constante. Leer evento de `X-Webhook-Event`. Soportar lote (`X-Webhook-Batch: true` → `body.data[]`). Responder 200 en < 10 s. Fuente: https://docs.kapso.ai/docs/platform/webhooks/overview
- `whatsapp.message.delivered|read|failed` → actualizar `Notification` por `providerId`.
- `whatsapp.message.received` (stretch): texto "PAGAR" → responder link; "APELAR" → link de apelación; otro → ayuda. No asumir que existe `phone_number` (puede venir BSUID).
- Idempotencia: guardar `X-Idempotency-Key`/id de mensaje procesado; ignorar repetidos.

## 8. Claude visión (P2) — `lib/vision/claude.ts`
- SDK `@anthropic-ai/sdk`, modelo `process.env.ANTHROPIC_MODEL` (uno con visión), `max_tokens: 1024`, `temperature: 0`.
- Imágenes por URL (`{ type: "image", source: { type: "url", url } }`) o base64 si la URL no es accesible. Redimensionar a ≤ 1568 px lado mayor en el cliente antes de subir.
- Forzar JSON con **tool use**: `tools: [reportDetectionTool]`, `tool_choice: { type: "tool", name: "report_detection" }`.

### System prompt
```
Eres un analista de evidencia de tránsito. Recibes 2–3 fotogramas consecutivos de UNA cámara fija en un semáforo, en orden temporal, con sus timestamps.
Contexto de calibración (coordenadas normalizadas 0–1, origen arriba-izquierda):
- Línea de pare: {stopLine}  (también dibujada en rojo sobre las imágenes si existe overlay)
- Región del semáforo: {lightRoi}
Tareas:
1. Para cada fotograma, indica el estado de la luz que controla el carril: RED, YELLOW, GREEN o UNKNOWN.
2. Identifica el vehículo que avanza hacia/sobre la línea de pare. Da su caja delimitadora normalizada en cada fotograma.
3. Lee la placa del vehículo (formato venezolano, letras y números, sin espacios). Si no es legible con certeza, devuelve null; NO inventes caracteres. Usa "?" para caracteres dudosos.
4. Indica si el vehículo cruzó la línea de pare mientras la luz estaba en RED.
Reglas: sé conservador; ante duda baja la confianza. No describas personas. Responde SOLO llamando a la herramienta report_detection.
```
### Tool `report_detection` (input_schema)
```json
{
  "name": "report_detection",
  "description": "Reporta el análisis estructurado de los fotogramas",
  "input_schema": {
    "type": "object",
    "required": ["frames", "plate", "crossed_on_red", "confidence"],
    "properties": {
      "frames": { "type": "array", "items": {
        "type": "object", "required": ["index", "light_state"],
        "properties": {
          "index": { "type": "integer" },
          "light_state": { "type": "string", "enum": ["RED","YELLOW","GREEN","UNKNOWN"] },
          "vehicle_box": { "type": ["object","null"], "properties": {
            "x": {"type":"number"}, "y": {"type":"number"}, "w": {"type":"number"}, "h": {"type":"number"} } }
        } } },
      "plate": { "type": ["object","null"], "required": ["text","confidence"], "properties": {
        "text": { "type": "string" }, "confidence": { "type": "number" },
        "frame_index": { "type": "integer" },
        "box": { "type": ["object","null"] } } },
      "vehicle_description": { "type": "string", "description": "tipo y color, p.ej. 'sedán gris'" },
      "crossed_on_red": { "type": "boolean" },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
      "notes": { "type": "string" }
    }
  }
}
```
Post-proceso (`lib/vision/analyze.ts`): Zod parse → `normalizePlate` (si contiene `?` → `NO_PLATE`/review) → regla geométrica (`02-arquitectura.md` §5) → veredicto. Recorte de placa: si viene `plate.box`, recortar con `sharp` y subir a Blob como `PLATE_CROP` (opcional).

Caché de demo: si `DEMO_VISION_CACHE=true` y el hash de las URLs coincide con un set demo, devolver la respuesta guardada en `public/demo/*.json` (plan B si Claude falla en vivo; mostrar etiqueta "caché").

## 9. Idempotencia (resumen)
| Endpoint | Llave | Comportamiento |
|---|---|---|
| `/api/detections` | `idempotencyKey` o hash(cameraId+urls) | misma respuesta, sin nueva violación |
| dedup de dominio | placa+cámara+tipo ±60 s | `duplicate: true` |
| `/api/payments/c2p` | `idempotencyKey` (unique en `Payment`) | mismo resultado |
| Multa pagada | `Fine.status=PAID` | 409 `ALREADY_PAID` |
| Webhook Kapso | id de evento / `X-Idempotency-Key` | ignorar repetidos |
| Alertas | vehicleId en 10 min | `SUPPRESSED` |
