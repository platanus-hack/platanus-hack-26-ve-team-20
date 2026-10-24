# 04 — API · SmartTraffic

Convenciones: JSON, Zod en `lib/contracts/`, respuesta `{ ok: true, data }` | `{ ok: false, error: { code, message } }`. Códigos HTTP: 200/201, 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 404 `NOT_FOUND`, 409 `CONFLICT`/`INVALID_TRANSITION`, 429 `RATE_LIMITED`, 502 `UPSTREAM_ERROR`.
Auth: `camera` = header `X-Camera-Key` (= `CAMERA_API_KEY`, lo usa la app móvil); `admin` = cookie de sesión `vc_admin` del login de admin (§0b); `officer` = cookie `vc_officer` (`OFFICER_PASSCODE` + placa del oficial, la emite P3); `public` = sin auth.

## 0. Contratos compartidos (`lib/contracts/index.ts`) — se acuerdan en la hora 1
```ts
export type ViolationType = "RED_LIGHT" | "TURN_ARROW" | "SPEEDING";
export type Verdict = "VIOLATION" | "NO_VIOLATION" | "NEEDS_REVIEW";
export type LightState = "RED" | "YELLOW" | "GREEN" | "UNKNOWN";

export interface FrameInput { url: string; capturedAt: string /* ISO, hora real del fotograma (PTS + inicio del clip) */; }

export type RoadRelation = "WITH_FLOW" | "AGAINST_FLOW" | "UNKNOWN";
export interface MotionEstimate {         // estimación demo del servicio ML (no sancionatoria)
  speedKmh: number | null;                 // null sin homografía válida, con fps < 24 o track dudoso
  laneId: string | null;
  directionDeg: number | null;             // ángulo del movimiento en el plano del suelo
  relation: RoadRelation;                  // respecto a la dirección permitida del carril
}
export interface Crossing { crossedStopLine: boolean; atMs?: number; lightState: LightState }

export interface VisionResult {            // salida de lib/vision (P2) → entrada de lib/domain (P1)
  cameraId: string;
  type: ViolationType;
  verdict: Verdict;
  reviewReason?: "LOW_CONFIDENCE" | "NO_PLATE" | "MODEL_RULE_DISAGREE" | "ML_SERVICE_ERROR";
  plate: string | null;                    // normalizada
  plateConfidence: number;                 // 0..1
  confidence: number;                      // 0..1
  occurredAt: string;
  frames: Array<FrameInput & { lightState: LightState; vehicleBox?: Box }>;   // fotogramas clave
  plateCropUrl?: string;
  clipUrl: string;                         // clip en Blob (evidencia)
  crossing: Crossing;
  motion: MotionEstimate;
  modelVersion: string;                    // versión del modelo ML
  aiOutput: unknown;                       // respuesta cruda del servicio ML
  ruleOutput: unknown;                     // resultado de la regla geométrica
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

## 0b. Autenticación de admin/operador (P1)
Cuenta en la tabla `AdminUser` (correo + contraseña con hash scrypt). La sesión es una cookie `vc_admin` firmada (HttpOnly, SameSite=Lax, Secure en Vercel, 8 h). Para métodos que modifican, si el navegador envía `Origin` debe coincidir con el host.

| Endpoint | Auth | Descripción |
|---|---|---|
| `POST /api/auth/login` `{ "email", "password" }` | public | 200 `{ user: { id, email, name } }` + `Set-Cookie`. Credenciales erróneas, correo inexistente o cuenta desactivada → el mismo 401 `Credenciales inválidas`. |
| `GET /api/auth/me` | admin | 200 `{ user }`, o 401 si no hay sesión (la SPA lo usa para decidir si redirige a `/login`). |
| `POST /api/auth/logout` | public | Borra la cookie. Idempotente. |

- **Límites**: 5 fallos por correo y 10 por IP en 10 min → 429 `RATE_LIMITED` (aun con la contraseña correcta mientras dure el bloqueo). Los fallos se auditan (`ADMIN_LOGIN_FAILED`) sin guardar el correo ni la contraseña.
- **Revocación**: desactivar la cuenta (`active = false`) o cambiar su contraseña invalida las sesiones abiertas.
- **Cuenta inicial**: `pnpm db:seed` la crea con `ADMIN_EMAIL` / `ADMIN_PASSWORD` (solo se guarda el hash). Cambiar `ADMIN_PASSWORD` y volver a sembrar actualiza el hash.
- Guardas disponibles en `api/_lib/auth.ts`: `requireAdmin(db, req)`, `requireCamera(req)`, `requireCameraOrAdmin(db, req)`, `requireOfficer(req)` y, para P3, `issueOfficerSession(res, officerId)`.

## 0c. Cuenta del ciudadano: cédula + contraseña (P1)
El ciudadano crea su propia contraseña al registrarse y entra con su cédula. Sesión: cookie `vc_citizen` firmada (HttpOnly, SameSite=Lax, Secure en Vercel) de **30 min que se renueva con cada llamada autenticada** (`GET /api/citizen/me?renew=0` comprueba sin renovar, para sondeos). Como en el admin, los `POST` rechazan un `Origin` ajeno.

**Registro abierto.** Cualquier persona puede abrir cuenta: escribe cédula, **teléfono** y contraseña y recibe un código de 6 dígitos por WhatsApp en ese teléfono. Si la cédula no existe se crea el titular (sin vehículos ni multas) al pedir el código. Si el titular ya existe, el código también va al teléfono escrito, pero su teléfono no cambia si tiene vehículos. Sin `phone` solo sirve para titulares conocidos: el código va al teléfono que el sistema tiene. El servidor solo devuelve el teléfono enmascarado (`0426-***0319`). El código se guarda como HMAC (con `SESSION_SECRET`), vence a los 10 min y admite 5 intentos. Con `WHATSAPP_TEMPLATE_CODE` se envía con una plantilla de autenticación aprobada (llega a cualquiera); sin ella, texto libre (solo dentro de la ventana de 24 h).

> **Límite conocido (decisión de producto para la demo).** El código prueba que la persona controla *un* teléfono, no que sea el titular de la cédula: quien conozca la cédula de otro puede abrir esa cuenta con su propio teléfono y ver sus multas. Mitigaciones previstas fuera del MVP: verificar contra el teléfono del titular cuando se conoce, o un dato adicional (p. ej. una placa).

| Endpoint | Auth | Descripción |
|---|---|---|
| `POST /api/citizen/register` `{ cedula, password, phone?, email? }` | public | Paso 1: guarda la contraseña elegida (mín. 8) y envía el código al `phone` (venezolano, cualquier formato; se normaliza a `58412…`). 200 `{ telefono }`. |
| `POST /api/citizen/register/resend` `{ cedula }` | public | Código nuevo (30 s entre envíos). 200 `{ telefono }`. |
| `POST /api/citizen/register/verify` `{ cedula, code }` | public | Paso 2: crea la cuenta y abre la sesión. 200 `{ user, vehicles }` + `Set-Cookie`. |
| `POST /api/citizen/login` `{ cedula, password }` | public | 200 `{ user }` + `Set-Cookie`. |
| `POST /api/citizen/logout` | public | Borra la cookie. Idempotente. |
| `GET /api/citizen/me[?renew=0]` | citizen | `{ user: { cedula, telefono, correo } }` (el teléfono en formato local `04264180319`). |
| `POST /api/citizen/password` `{ current, next }` | citizen | Cambia la contraseña; emite una sesión nueva y cierra las demás. |
| `GET /api/citizen/fines` | citizen | `{ items: CitizenFineDTO[] }`: sus multas, la infracción más reciente primero, con `token` para pagar en `POST /api/payments/c2p`. |
| `GET /api/citizen/fines/:id` | citizen | Una multa propia; una ajena responde 404 igual que una inexistente. |
| `POST /api/citizen/fines/:id/appeal` | citizen | Apela una multa pendiente o vencida (→ `APPEALED`). |
| `GET /api/citizen/vehicles` | citizen | `{ items: CitizenVehicleDTO[] }`. |

**Errores.** Además de `code`, el error lleva `reason` (legible por máquina): `SIN_TITULAR` (404, no hay titular con esa cédula y no se dio teléfono), `YA_REGISTRADA` (409), `SIN_REGISTRO` (404, no hay registro pendiente), `CODIGO_INVALIDO` / `CODIGO_VENCIDO` (400), `CODIGO_AGOTADO` (429, 5 intentos), `ESPERAR` (429, 30 s entre envíos), `ENVIO_FALLIDO` (502, WhatsApp no entregó: típico si pasó la ventana de 24 h y el mensaje pide escribir primero al número), `CREDENCIALES` (401, igual para cédula desconocida, contraseña errónea y cuenta desactivada), `CLAVE_ACTUAL` / `CLAVE_IGUAL` (400), `NO_ENCONTRADA` (404), `NO_APELABLE` (409).

**Límites.** Registro/reenvío: 10 por IP cada 10 min y 5 por cédula por hora. Verificación: 20 por IP cada 10 min. Login: 5 fallos por cédula y 10 por IP cada 10 min (bloquea aun con la contraseña correcta). Cambio de contraseña: 5 intentos por cuenta cada 10 min. Los fallos se auditan con una huella de la cédula, nunca con la cédula ni la contraseña.

**Solo para demos.** `CITIZEN_DEMO_CODE` (6 dígitos) junto con `DEMO_CEDULA` hacen que ese código valga para esa cédula **sin enviar nada** (la presentación no depende de la ventana de 24 h). Sin esas dos variables no existe. No debe configurarse en un entorno con datos reales.

## 0d. Invitaciones de oficiales (P1; las pantallas son de P4)
El admin invita por correo a un oficial; el oficial abre el enlace, elige teléfono y contraseña y nace su cuenta con una placa `OF-NNNN`. Token de 256 bits (43 caracteres base64url), solo se guarda su SHA-256; vence a las 72 h, un solo uso, revocable. Invitar de nuevo al mismo correo anula la pendiente. El correo sale por SMTP (`SMTP_HOST/PORT/USER/PASS`, p. ej. Gmail con contraseña de aplicación) o, si no hay SMTP, por Resend (`RESEND_API_KEY` + `EMAIL_FROM`); en seco con `NOTIFY_DRY_RUN` ≠ `false`. Enlace del correo: `${APP_BASE_URL}/oficial/invitacion?token=…` (**ruta del SPA que debe crear P4**). La sesión del oficial es la misma cookie `vc_officer` que usa P3 (`/api/officers/*`).

| Endpoint | Auth | Descripción |
|---|---|---|
| `POST /api/admin/officer-invitations` `{ email, name }` | admin | Crea la invitación y envía el correo. 201 `{ invitation, emailSent, inviteUrl? }`; `inviteUrl` solo si el correo no salió (el admin copia el enlace). 409 `CORREO_EN_USO` si ya es oficial. |
| `GET /api/admin/officer-invitations` | admin | `{ items: OfficerInvitationDTO[] }` (estado `PENDING`/`USED`/`EXPIRED`/`REVOKED`, placa si se usó). Nunca devuelve tokens. |
| `POST /api/admin/officer-invitations/:id/revoke` | admin | Anula una pendiente (idempotente). 409 `YA_USADA` si ya se usó. |
| `GET /api/admin/officers` | admin | `{ items: AdminOfficerDTO[] }` con teléfono enmascarado. |
| `POST /api/admin/officers/:id/active` `{ active }` | admin | Desactiva/reactiva (desactivar lo saca de servicio y le impide el login con correo). |
| `POST /api/officer/invitation/check` `{ token }` | public | `{ email, name, expiresAt }`. 404 `INVITACION_INVALIDA` igual para inexistente, vencida, usada o revocada. |
| `POST /api/officer/invitation/accept` `{ token, name?, phone, password }` | public | Contraseña ≥ 10, teléfono venezolano. 201 `{ officer }` + `Set-Cookie vc_officer`. |
| `POST /api/officer/login` `{ email, password }` | public | 200 `{ officer }` + cookie. Un solo error `CREDENCIALES` (401); 5 fallos por correo y 10 por IP cada 10 min. |

Los oficiales del seed siguen entrando con `OFFICER_PASSCODE` + placa (`POST /api/officers/session`, P3). **Pendiente para P3:** esas rutas deberían comprobar `Officer.active` (hoy una sesión ya emitida a un oficial desactivado sigue valiendo hasta que vence, 12 h).

## 1. Detecciones y cámaras (P2)

### `GET /api/time` (public)
`{ ok, data: { now: "ISO" } }`. La app calcula `clockOffsetMs = serverNow − phoneNow` al abrir y lo envía con cada evento.

### `POST /api/blob/upload` (camera | admin)
Handler de `@vercel/blob/client` `handleUpload` para el clip. `allowedContentTypes: ["video/mp4","video/quicktime"]`, máx 30 MB, prefijo `evidence/clips/`.

### `POST /api/detections` (camera | admin) · `maxDuration = 60` (vía `vercel.json`)
Request (JSON; el clip ya está en Blob):
```json
{
  "cameraCode": "CAM-001",
  "type": "RED_LIGHT",
  "clip": { "url": "https://...blob.vercel-storage.com/evidence/clips/a.mp4", "startedAt": "2026-10-24T14:03:10.100Z", "durationMs": 4000 },
  "clockOffsetMs": -230,
  "device": { "lat": 10.4806, "lng": -66.9036, "accuracyM": 8 },
  "idempotencyKey": "opcional-uuid"
}
```
La función carga la cámara y los `LightChange` de la ventana del clip, llama al servicio ML (§8), guarda fotogramas clave y recorte de placa en Blob y aplica las reglas (`02-arquitectura.md` §5).
Response 200:
```json
{ "ok": true, "data": {
  "verdict": "VIOLATION",
  "violationId": "vio_cuid",
  "status": "NOTIFIED",
  "fineId": "fine_cuid",
  "plate": "AB123CD",
  "confidence": 0.91,
  "crossing": { "crossedStopLine": true, "atMs": 1800, "lightState": "RED" },
  "motion": { "speedKmh": 42.1, "laneId": "C1", "directionDeg": 2, "relation": "WITH_FLOW" },
  "duplicate": false,
  "latencyMs": 6400
}}
```
Lógica: cargar cámara → `lib/vision.analyze()` → `lib/domain.registerDetection()` → (P1 llama `notifyFineIssued` si FINED) → si vehículo con multas impagas previas también `registerSighting` + `dispatchAlert`.
Errores: servicio ML caído o respuesta inválida → 200 con `verdict: "NEEDS_REVIEW"`, `reviewReason: "ML_SERVICE_ERROR"` (nunca perder el clip).

### `POST /api/sightings` (camera | admin) — "placa vista" sin infracción
Request `{ "cameraId": "...", "plate": "AB123CD", "seenAt": "ISO", "evidenceUrl": "opcional" }` o `{ "cameraCode", "clip": {...}, "clockOffsetMs" }` (el servicio ML lee la placa).
Response `{ ok, data: { sightingId, unpaidCount, alert: { alertId, status, officerId?, distanceM? } | null } }`.

### Cámaras y semáforo simulado
- `GET /api/cameras` (camera | admin) → lista con calibración y `configVersion`.
- `PATCH /api/cameras/[id]` (admin) → `{ homography?, stopLine?, lanes?, speedZone?, parameters? }`; recalcula `reprojectionErrorM`, incrementa `configVersion`.
- `POST /api/cameras/[id]/light` (admin) → `{ "state": "RED" | "GREEN" | "YELLOW" }` (amarillo se guarda como `GREEN`); crea un `LightChange`.

## 2. Violaciones y revisión (P1)
### `GET /api/violations?status=NEEDS_REVIEW&since=ISO&limit=50` (admin)
`status` acepta uno o varios estados separados por coma (`FINED,NOTIFIED`). `limit` 1–200 (50 por defecto). Orden: la **modificación más reciente primero** (`updatedAt`). `since` devuelve solo lo modificado después de ese instante (estricto): el feed en vivo de `/camaras` sondea cada 2–3 s con `since = nextSince`, así un cambio de estado (DETECTED → NOTIFIED) vuelve a aparecer. `nextSince` es el `updatedAt` más reciente devuelto, o `null` si no hay novedades (el cliente conserva el anterior). Con más de `limit` novedades se devuelven las más nuevas.
```json
{ "ok": true, "data": { "items": [ {
  "id": "vio_cuid", "type": "RED_LIGHT", "status": "NEEDS_REVIEW", "verdict": "NEEDS_REVIEW",
  "reviewReason": "LOW_CONFIDENCE", "voidReason": null,
  "camera": { "code": "CAM-001", "intersection": "Av. Demo Norte con Calle 1 (ejemplo)" },
  "plateRead": "AB12?CD", "plateConfidence": 0.55, "confidence": 0.62,
  "lightState": "RED",
  "motion": { "speedKmh": 42.1, "laneId": "C1", "relation": "WITH_FLOW" },
  "occurredAt": "ISO", "updatedAt": "ISO",
  "evidence": [{ "kind": "FRAME", "url": "..." }],
  "fine": { "token": "x7Gq...", "status": "PENDING", "amountCents": 2500000, "currency": "VES" }
} ], "nextSince": "ISO" } }
```
- `verdict` lo deduce el servidor: `NEEDS_REVIEW`, `NO_VIOLATION` (un `VOID` con `voidReason = "NO_VIOLATION"`, ver `03` §4) o `VIOLATION`.
- `fine` es `null` si no hay multa; su `status` incluye `OVERDUE` (calculado). `lightState` es la luz en el cruce (`null` en datos del seed).
- Auth `admin`: cookie de sesión (§0b); sin sesión válida → 401.
- Devuelve los tokens de multa (llave de acceso): jamás debe quedar público.

### `GET /api/violations/[id]` (admin)
Detalle para la pantalla de revisión: el mismo ítem de la lista más `modelVersion`, `aiOutput` (respuesta cruda del servicio ML) y `ruleOutput` (`{ verdict, crossing, rules }`). 404 si no existe.

### `POST /api/violations/[id]/review` (admin)
Request `{ "action": "APPROVE", "plate": "AB123CD", "note": "placa legible en frame 2" }` o `{ "action": "VOID", "reason": "Vehículo de emergencia" }`.
Response `{ ok, data: { status: "NOTIFIED" | "FINED" | "VOID", fineId? } }`.
- **APPROVE** solo desde `NEEDS_REVIEW`: pasa por `REVIEWED` → `FINED` (crea la multa) y avisa al conductor (`NOTIFIED`). Si el aviso falla, la multa queda emitida y `status` es `FINED`. `plate` (opcional) corrige la placa: debe tener formato válido y ser de un vehículo registrado; sin `plate` se usa el vehículo ya enlazado o la placa leída si corresponde a uno registrado; si no hay vehículo → 400 `VALIDATION_ERROR` ("Indique la placa…"). `note` va al `AuditLog`. La multa queda con `verification: "HUMAN"`. No se despacha alerta a oficiales al aprobar (la detección ya es vieja).
- **VOID** exige `reason`. Vale desde cualquier estado que la tabla de transiciones permita, así que también anula una multa ya emitida; desde `PAID` o `VOID` → 409.
- Todo pasa por `transition()` y queda en el `AuditLog` con el operador de la sesión (`OPERATOR`, id de la cuenta, IP). Aprobar es atómico y la fila se bloquea: dos operadores a la vez → uno gana, el otro recibe 409 `INVALID_TRANSITION` y solo existe una multa.

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
El token es la "llave" de acceso: quien lo tiene ve la evidencia de esa multa. No muestra cédula ni teléfono. Un token inexistente o mal formado responde igual (404 `NOT_FOUND`), sin revelar cuál de los dos. `status` es el estado guardado (`PENDING`, `PAID`, `APPEALED`, `VOID`) y `overdue` se calcula aparte. `verification` es `HUMAN` si la violación pasó por revisión y `AUTO` si no. `paymentReference` es la del pago aprobado. Respuestas con `Cache-Control: no-store`.

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
`fineToken` solo se expone tras OTP (stretch: `POST /api/portal/otp` → WhatsApp con código → `POST /api/portal/verify`); hasta entonces es siempre `null`.
- **Cédula**: acepta `V12345678`, `v-12.345.678` y letras `V`, `E`, `J`, `G`, `P`; sin letra se busca como `V` y como `E` (el ciudadano suele escribir solo el número). Formato inválido → 400 `VALIDATION_ERROR`.
- **Qué lista**: las multas **emitidas** de los vehículos del titular (una violación en revisión aún no es multa y no aparece), la más reciente primero, hasta 50; el `summary` cuenta todas. `pending` = pendientes + vencidas; `status` puede ser `OVERDUE` (calculado). Una cédula sin multas o inexistente responde 200 con la misma forma y todo en cero.
- **Privacidad**: nunca nombre, teléfono, correo, cédula completa, placa completa ni `publicToken`; un test fija las claves exactas de la respuesta.
- **Límite**: 10 consultas por IP cada 10 min → 429 `RATE_LIMITED`. El conteo y el registro son atómicos (bloqueo por IP): consultas simultáneas no pueden pasarse del máximo, y las bloqueadas no alargan la ventana.
- **Auditoría**: cada consulta permitida escribe `AuditLog(PORTAL_LOOKUP, ip)` con una huella de la cédula en `entityId`, nunca la cédula.

## 5. Pagos C2P SIMULADOS (P3)
### Contexto: cómo es C2P real
En Pago Móvil C2P (comercio a persona) el **comercio** debita al pagador. El pagador genera en la app de su banco una **clave C2P** (token de un solo uso) y entrega: **banco** (código de 4 dígitos), **teléfono** afiliado, **cédula** y **clave**. El comercio envía eso + monto + concepto a la API C2P de **su** banco (o de un agregador de pagos) autenticado con credenciales del comercio; el banco responde aprobado/rechazado con número de referencia. Integración real requeriría: convenio con banco/agregador, credenciales y certificados, ambiente de certificación, conciliación diaria y manejo de reversos. **En SmartTraffic NO hay integración real.**

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

## 7. WhatsApp Cloud API de Meta (P3)
Directo con Meta, sin intermediarios, desde el **número de prueba de Meta** y solo con **mensajes de texto** (sin plantillas ni email). Montaje y variables: `p3-plan-de-trabajo.md` §3.

### Saliente (envío) — `lib/notify/whatsapp.ts`
```http
POST https://graph.facebook.com/{WHATSAPP_GRAPH_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
Content-Type: application/json

{ "messaging_product": "whatsapp", "recipient_type": "individual", "to": "584120000001",
  "type": "text", "text": { "body": "SmartTraffic · Aviso de infracción…\nVer y pagar: https://…/multa/x7Gq…", "preview_url": true },
  "biz_opaque_callback_data": "fine:fine_cuid" }
```
Respuesta trae `messages[0].id` (wamid) → `Notification.providerId`. Fuente: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started

**Ventana de 24 h de WhatsApp**: solo se envía texto libre a números que escribieron al número de prueba en las últimas 24 h; fuera de ella Meta exige plantillas, que no usamos. Los teléfonos de demo escriben "hola" al número antes de cada prueba, ensayo y del pitch. Si la ventana está cerrada, el envío falla y queda `Notification.FAILED` con el error. Solo reciben los números verificados en *API Setup* del número de prueba.

Textos (`lib/notify/templates.ts`):
- `FINE_ISSUED`: "SmartTraffic (demo). Se registró una posible infracción: {tipo} en {intersección}, {fecha hora} (hora de Caracas), vehículo placa {placaEnmascarada}. Monto de ejemplo: {monto}. Vea la evidencia, pague o apele aquí: {link}"
- `PAYMENT_CONFIRMED`: "SmartTraffic (demo). Pago simulado recibido. Ref {ref}. Multa {placaEnmascarada} saldada."
- `OFFICER_ALERT`: "SmartTraffic · Alerta: vehículo {placa} ({vehículo}) con {n} multas impagas visto en {intersección} hace {min} min, a {distancia} de su posición. Verifique antes de actuar."

### Entrante — `GET` y `POST /api/webhooks/whatsapp`
- `GET` (verificación al registrar la URL en la app de Meta): si `hub.mode=subscribe` y `hub.verify_token` = `WHATSAPP_VERIFY_TOKEN`, responder 200 con `hub.challenge` en texto plano; si no, 403.
- `POST`: verificar `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256(body crudo, `WHATSAPP_APP_SECRET`) con comparación de tiempo constante, antes de parsear. Firma inválida → 401. Responder 200 rápido. Suscribir el campo `messages` de la cuenta.
- `entry[].changes[].value.statuses[]` (`sent|delivered|read|failed`, con `errors[]`) → actualizar `Notification` por `providerId` (= wamid); no bajar de estado (un `delivered` atrasado no pisa un `read`).
- `entry[].changes[].value.messages[]` (stretch): texto "PAGAR" → responder link; "APELAR" → link de apelación; otro → ayuda.
- Idempotencia: Meta reintenta si no recibe 200; ignorar repetidos por (wamid, estado) o id de mensaje entrante.

## 8. Servicio de inferencia ML (P2) — `ml/` ↔ `lib/vision/ml-client.ts`
Detector preentrenado con ajuste fino (datasets de Kaggle) + ByteTrack + EasyOCR, servido por FastAPI fuera de Vercel (`docs/10-ml-y-app-movil.md`). Sin LLM en este pipeline.

### `POST {ML_SERVICE_URL}/predict`
Header `Authorization: Bearer ${ML_SERVICE_TOKEN}`. Timeout del cliente: 45 s, 1 reintento.
Request:
```json
{
  "cameraCode": "CAM-001",
  "clip": { "url": "https://...blob.vercel-storage.com/evidence/clips/a.mp4", "startedAt": "2026-10-24T14:03:10.100Z" },
  "calibration": {
    "configVersion": 3,
    "homography": { "imagePoints": [[0.3,0.9],[0.7,0.9],[0.6,0.4],[0.4,0.4]], "groundPointsM": [[0,0],[7,0],[7,25],[0,25]] },
    "stopLine": [[0.38, 0.35], [0.62, 0.35]],
    "lanes": [ { "id": "C1", "polygon": [[0.5,0.9],[0.7,0.9],[0.6,0.4],[0.5,0.4]], "allowedDirection": [0, 1] } ],
    "speedZone": { "yAM": 3, "yBM": 18 },
    "parameters": { "minTrackFrames": 15, "wrongWayWindowS": 1.0, "wrongWayMinM": 2.0, "wrongWayAngleDeg": 135, "wrongWayChecks": 10, "stopLineFrames": 3 }
  }
}
```
Response 200:
```json
{
  "modelVersion": "vc-0.1",
  "latencyMs": 3200,
  "clip": { "fps": 30, "frameCount": 120, "durationMs": 4000, "timestampSource": "pts" },
  "tracks": [ {
    "trackId": 1, "class": "car", "firstMs": 300, "lastMs": 3600, "framesSeen": 98, "idSwitchSuspected": false,
    "laneId": "C1",
    "stopLine": { "crossed": true, "atMs": 1800, "framesConfirmed": 5 },
    "speedKmh": 42.1, "speedValid": true,
    "directionDeg": 2, "relation": "WITH_FLOW"
  } ],
  "plates": [ { "trackId": 1, "text": "AB123CD", "ocrConfidence": 0.88, "votes": 7, "bestFrameMs": 1500 } ],
  "keyFrames": [ { "ms": 1500, "jpegBase64": "...", "vehicleBox": { "x": 0.3, "y": 0.5, "w": 0.2, "h": 0.2 }, "plateBox": { "x": 0.36, "y": 0.62, "w": 0.06, "h": 0.03 } } ],
  "plateCropBase64": "..."
}
```
Reglas: coordenadas normalizadas 0–1 (origen arriba-izquierda), instantes en ms desde el inicio del clip (PTS). `speedKmh` es `null` con `speedValid: false` si hay huecos, oclusión, cambio de ID sospechado o fps < 24. La placa con caracteres dudosos usa `?` (→ `NO_PLATE`/revisión). El servicio **no** conoce el semáforo: la luz en el instante del cruce la evalúa `lib/vision/rules.ts` con los `LightChange`. `GET /health` devuelve `{ ok: true, modelVersion }`.

Post-proceso (`lib/vision/analyze.ts`): Zod parse → elegir el track que cruzó `stopLine` → `normalizePlate` → `rules.ts` (luz en `atMs`, doble llave) → subir `keyFrames` y recorte a Blob → `VisionResult` (con `clipUrl`, `crossing`, `motion`).

Caché de demo: si `DEMO_VISION_CACHE=true` y el hash de la URL del clip coincide con un set demo, devolver la respuesta guardada en `public/demo/*.json` (plan B si el servicio ML o su túnel falla en vivo; mostrar etiqueta "caché").

## 9. Idempotencia (resumen)
| Endpoint | Llave | Comportamiento |
|---|---|---|
| `/api/detections` | `idempotencyKey` o hash(cameraId+urls) | misma respuesta, sin nueva violación |
| dedup de dominio | placa+cámara+tipo ±60 s | `duplicate: true` |
| `/api/payments/c2p` | `idempotencyKey` (unique en `Payment`) | mismo resultado |
| Multa pagada | `Fine.status=PAID` | 409 `ALREADY_PAID` |
| Webhook de WhatsApp | (wamid, estado) / id de mensaje entrante | ignorar repetidos |
| Alertas | vehicleId en 10 min | `SUPPRESSED` |
