# Plan de trabajo P3 · VíaClara

Persona 3: **notificaciones, pagos C2P simulados, oficiales y alertas**. Sale de leer todo `docs/` y `AGENTS.md`. Horas relativas a h0 como en `07-plan-36h.md`.

> **Decisión:** no usamos Kapso. WhatsApp va **directo con Meta (WhatsApp Cloud API)** y una línea propia. El resto de los docs, `AGENTS.md` y `.env.example` ya están alineados (paso 1); el detalle de Meta vive en §3.

## 1. Qué es tuyo

**Archivos** (`09` §1, con los nombres nuevos): `lib/notify/**` (`whatsapp.ts` en vez de `kapso.ts`), `lib/payments/**`, `lib/geo/**`, `lib/alerts/**`, `api/payments/**`, `api/officers/**`, `api/alerts/**`, `api/webhooks/**` (`whatsapp.ts` en vez de `kapso.ts`), `src/pages/{Multa,Pagar}.tsx`, `components/multa/**`. Tus specs en `tests/e2e/` (los configura P1).

**Funciones que expones** (`04` §0; las consumen P1 y P2). Las firmas no cambian con Meta:
| Función | La llama | Cuándo |
|---|---|---|
| `notifyFineIssued(fineId)` | P1 `registerDetection` y aprobación en revisión | multa creada |
| `notifyPaymentConfirmed(fineId)` | tu `api/payments/c2p` | pago aprobado |
| `notifyOfficerAlert(alertId)` | tu `dispatchAlert` | alerta creada con oficial |
| `dispatchAlert(sightingId)` | P1 `registerSighting` (vía P2) | placa con deuda vista |
| `chargeC2P(req)` | tu `api/payments/c2p` | cada intento de pago |

**Lo que consumes**: `lib/contracts` (P1), Prisma y `lib/db.ts` (P1), `markFinePaid` y `transition()`/`audit.ts` de `lib/domain` (P1), `GET /api/fines/[token]` (P1, lo usa tu página), guardas de `api/_lib/auth.ts` (P1), `components/vc/*` (P4: `DemoBanner`, `EstadoBadge`, `Evidencia`, `Placa`, `Monto`), seed de oficiales y teléfonos demo (P1).

**Historias que debes cerrar**: HU-03 (notificación), HU-04 (pago), HU-06 (alerta a oficial).

## 2. Cómo encaja
```
Detección (P2) → registerDetection (P1) → notifyFineIssued (P3) → Meta Cloud API → WhatsApp conductor
                                       └→ registerSighting (P1) → dispatchAlert (P3) → notifyOfficerAlert → WhatsApp oficial
/multa/:token (P3) → GET /api/fines/[token] (P1)
/multa/:token/pagar (P3) → POST /api/payments/c2p (P3) → chargeC2P → markFinePaid (P1) → notifyPaymentConfirmed
Meta → GET/POST /api/webhooks/whatsapp (P3) → Notification.status (DELIVERED/READ/FAILED)
/oficial (UI P4) → /api/officers/session|location|[id]/alerts, /api/alerts/[id]/ack (P3)
```

## 3. WhatsApp directo con Meta

### 3.1 Lo que hay que montar (solo tú puedes hacerlo, con tu cuenta)
1. **Cuenta de Meta para desarrolladores** y un **portafolio de negocio** (Business Manager).
2. **App de tipo Business** en developers.facebook.com con el producto **WhatsApp**. Eso crea una cuenta de WhatsApp Business (WABA) y un **número de prueba** de Meta.
3. **Número de prueba primero**: en *API Setup* agrega y verifica los dos teléfonos de demo como destinatarios (el número de prueba solo envía a una lista corta de destinatarios verificados) y manda la plantilla `hello_world`. Con esto puedes programar desde h1 sin esperar la línea propia.
4. **Línea propia** (en paralelo, porque tiene revisiones):
   - Un chip que **no** esté activo en WhatsApp ni en WhatsApp Business (o borra esa cuenta antes). Debe poder recibir SMS o llamada.
   - Agregarlo en WhatsApp Manager con un **nombre visible** (p. ej. "VíaClara Demo"). Meta revisa el nombre; si lo rechaza, el número no muestra nombre.
   - Registrarlo por API con un PIN de 6 dígitos (verificación en dos pasos): `POST /{PHONE_NUMBER_ID}/register` con `{ "messaging_product": "whatsapp", "pin": "123456" }`. No se puede registrar desde el panel.
   - **Método de pago** en la WABA: según guías de terceros, sin él no se envían plantillas desde un número propio. Con tarjeta venezolana puede fallar; tenerlo resuelto antes de h4 o quedarse con el número de prueba.
5. **Usuario del sistema** en Business Settings con la app y la WABA asignadas (control total) y un **token permanente** con permisos `whatsapp_business_messaging`, `whatsapp_business_management` y `business_management`. El token temporal del panel vence en unas 24 h y no sirve para el deploy.
6. **Webhook**: en la configuración de la app pon `https://<deploy>/api/webhooks/whatsapp`, el `WHATSAPP_VERIFY_TOKEN` y suscríbete al campo `messages`. Necesita el endpoint ya desplegado (h8–12).

**Plan B**: si la línea propia no está lista para el ensayo de h30, la demo usa el número de prueba. Los teléfonos de demo ya están verificados como destinatarios y el resto del sistema no cambia.

### 3.2 Plantillas (las crea y aprueba Meta)
Fuera de la ventana de 24 h solo se pueden enviar **plantillas aprobadas**. El pago y la alerta ocurren en la web, así que tampoco abren ventana: las tres notificaciones necesitan plantilla.
| Plantilla | Categoría | Idioma | Variables (`{{n}}`) |
|---|---|---|---|
| `vc_multa_emitida` | Utilidad | `es` | Cuerpo: 1 tipo, 2 intersección, 3 fecha y hora, 4 placa enmascarada, 5 monto. Botón URL `APP_BASE_URL/multa/{{1}}` con el token |
| `vc_pago_confirmado` | Utilidad | `es` | 1 referencia, 2 placa enmascarada |
| `vc_alerta_oficial` | Utilidad | `es` | 1 placa, 2 vehículo, 3 n.º de multas, 4 intersección, 5 minutos, 6 distancia |

- Créalas en WhatsApp Manager en h0–1: la aprobación suele ser rápida pero puede tardar o rechazarse. Textos: los de `04` §7, con "(demo)".
- Mientras no estén aprobadas: los teléfonos de demo escriben "hola" al número (abre la ventana de 24 h) y se envía `type: "text"`.
- `lib/notify/whatsapp.ts` decide: si hay plantilla configurada, usa `type: "template"`; si no, `type: "text"`. Si Meta responde que la ventana está cerrada, guarda `FAILED` con el código de error y pasa al email.

### 3.3 Variables de entorno (reemplazan `KAPSO_*`)
| Variable | Uso |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | token permanente del usuario del sistema |
| `WHATSAPP_PHONE_NUMBER_ID` | id del número emisor (prueba o propio) |
| `WHATSAPP_WABA_ID` | id de la cuenta de WhatsApp Business (registro, plantillas) |
| `WHATSAPP_APP_SECRET` | clave secreta de la app; firma `X-Hub-Signature-256` del webhook |
| `WHATSAPP_VERIFY_TOKEN` | texto que inventas para el GET de verificación del webhook |
| `WHATSAPP_GRAPH_VERSION` | p. ej. `v23.0` (el que trae la doc oficial; confirmar en h0) |
| `WHATSAPP_TEMPLATE_FINE`, `WHATSAPP_TEMPLATE_PAYMENT`, `WHATSAPP_TEMPLATE_ALERT` | nombres de plantillas aprobadas (vacío = enviar texto) |
| `WHATSAPP_TEMPLATE_LANG` | `es` |

Siguen igual: `RESEND_API_KEY`, `EMAIL_FROM`, `DEMO_PHONE_DRIVER`, `DEMO_PHONE_OFFICER`, `OFFICER_PASSCODE`, `ALERT_RADIUS_METERS`, `NOTIFY_DRY_RUN`. Ninguna va al repo; solo en Vercel y `.env.local`.

### 3.4 Contrato técnico
**Envío** (`lib/notify/whatsapp.ts`):
```http
POST https://graph.facebook.com/{WHATSAPP_GRAPH_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
Content-Type: application/json

{ "messaging_product": "whatsapp", "to": "584120000001",
  "type": "template",
  "template": { "name": "vc_multa_emitida", "language": { "code": "es" },
    "components": [
      { "type": "body", "parameters": [ { "type": "text", "text": "Luz roja" } ] },
      { "type": "button", "sub_type": "url", "index": "0", "parameters": [ { "type": "text", "text": "x7Gq…" } ] } ] },
  "biz_opaque_callback_data": "fine:fine_cuid" }
```
El cuerpo lleva un parámetro por variable, en orden (aquí se muestra solo el primero). La respuesta trae `messages[0].id` (wamid) → `Notification.providerId`. Con `type: "text"`: `"text": { "body": "…", "preview_url": true }`.

**Webhook** (`api/webhooks/whatsapp.ts`, handler Web `GET`/`POST(request: Request)`):
- `GET`: si `hub.mode === "subscribe"` y `hub.verify_token === WHATSAPP_VERIFY_TOKEN`, responder 200 con `hub.challenge` en texto plano; si no, 403.
- `POST`: leer el body crudo con `await request.text()`, calcular `sha256=` + HMAC-SHA256(body, `WHATSAPP_APP_SECRET`) y compararlo con `X-Hub-Signature-256` con `timingSafeEqual`. Firma mala → 401. Recién después, `JSON.parse` y Zod.
- Recorrer `entry[].changes[].value`: `statuses[]` (`id` = wamid, `status` = `sent|delivered|read|failed`, `errors[]`) → actualizar `Notification` por `providerId`; `messages[]` (entrantes) → stretch "PAGAR"/"APELAR".
- Meta reintenta si no recibe 200, así que hay que deduplicar por (wamid, estado) y no bajar de estado (un `delivered` atrasado no pisa un `read`). Responder 200 rápido.

## 4. Estado actual y qué no depende de nadie
- El repo solo tiene docs: no hay `package.json`, Prisma ni `lib/contracts`. P1 arma el esqueleto en h0–4.
- **Sin esperar a nadie** puedes: todo §3.1 menos el webhook, crear las plantillas, y escribir los módulos puros que no tocan DB: `templates.ts`, el cliente HTTP de `whatsapp.ts`, la verificación de firma del webhook, `haversine.ts`, `banks.ts` y el simulador de `c2p.ts`. Todos se prueban con Vitest apenas exista la config.
- **Bloquea a otros**: tus mocks (`lib/notify/mock.ts`, `lib/alerts/mock.ts`, `lib/payments/mock.ts`) deben estar antes de h2; P1 los necesita para `registerDetection`.

## 5. Pasos

**Paso actual: 2.** Al cerrar un paso, marca su casilla y sube este número en el mismo commit.

Cada paso es **un commit** en la rama `Edwjon` (§6). Columna "Necesita": `—` = se puede hacer ya; **E** = el esqueleto de P1 ya está en `main` y traído a esta rama (Vite, `package.json`, Vitest, Prisma, `lib/db.ts`, `lib/contracts`, `lib/domain`); **S** = además el seed con oficiales y teléfonos demo; **Prod** = hay deploy en Vercel.

| # | Paso | Archivos | Necesita | Hecho cuando | Commit |
|---|---|---|---|---|---|
| [x] 1 | Documentar el cambio de Kapso a Meta en el resto del repo | `AGENTS.md`, `CLAUDE.md`, `docs/00`–`09`, `README.md`, `project-description.md`, `platanus-hack-project.jsonc`, `.env.example` | — | `grep -ri kapso` solo encuentra la nota histórica de este plan; `.env.example` trae las `WHATSAPP_*` de §3.3 | `docs: switch WhatsApp from Kapso to Meta Cloud API` |
| [ ] 2 | Montar WhatsApp en Meta (manual): app, número de prueba, destinatarios verificados, token permanente, 3 plantillas enviadas a revisión, arrancar la línea propia; cuenta Resend | sin código; solo la casilla de este plan | — | `hello_world` llega a los 2 teléfonos de demo; las variables están en Vercel y en `.env.local` | `docs(p3): mark Meta setup done` |
| [ ] 3 | Mocks de P3 con las firmas de `lib/contracts` | `lib/notify/mock.ts`, `lib/alerts/mock.ts`, `lib/payments/mock.ts` | E | `pnpm typecheck` verde; P1 los importa con `USE_MOCKS=true` | `feat(notify): add P3 mocks` |
| [ ] 4 | Textos y parámetros de plantilla, fechas en Caracas, placa y montos formateados | `lib/notify/templates.ts` + test | E | test de los 3 mensajes (texto y parámetros) en verde | `feat(notify): add message templates` |
| [ ] 5 | Cliente de WhatsApp Cloud API: plantilla o texto, `NOTIFY_DRY_RUN`, errores de Meta tipados | `lib/notify/whatsapp.ts` + test con `fetch` simulado | E | test verde; un script local envía un mensaje real al teléfono de demo | `feat(notify): add WhatsApp Cloud API client` |
| [ ] 6 | Simulador C2P y lista de bancos de ejemplo | `lib/payments/banks.ts`, `lib/payments/c2p.ts` + test | E | `000000` rechaza, `111111` sin fondos, otra aprueba con `SIM-`; la clave no aparece en nada devuelto | `feat(payments): add simulated C2P` |
| [ ] 7 | Distancia entre coordenadas | `lib/geo/haversine.ts` + test | E | distancias conocidas dentro de ±1 m | `feat(geo): add haversine` |
| [ ] 8 | `notifyFineIssued` y `notifyPaymentConfirmed` reales: guardan `Notification`, nunca lanzan, email por Resend si WhatsApp falla | `lib/notify/index.ts`, `lib/notify/email.ts` + test | E, S | crear una multa con el script de P1 envía WhatsApp y deja `Notification` en `SENT` (o `DRY_RUN`) | `feat(notify): send fine and payment notifications` |
| [ ] 9 | API de pago: Zod, idempotencia, 409 `ALREADY_PAID`, rate limit, `markFinePaid`, `AuditLog` | `api/payments/c2p.ts` + test | E, S | doble envío con la misma llave = un solo `Payment`; segundo pago de la misma multa = 409 | `feat(payments): add C2P payment endpoint` |
| [ ] 10 | Página de la multa (HU-04, `05` §3.3) | `src/pages/Multa.tsx`, `components/multa/**` | E, S, Prod | en el Preview, una multa del seed se ve a 360 px con evidencia, monto y banner demo, sin cédula ni teléfono | `feat(multa): add fine landing page` |
| [ ] 11 | Página de pago (`05` §3.4): 4 campos, validación en español, enviando/aprobado/rechazado | `src/pages/Pagar.tsx`, `components/multa/**` | E, S, Prod | en el Preview se paga con `123456` y llega el WhatsApp de confirmación; `000000` muestra rechazo | `feat(multa): add simulated C2P payment page` |
| [ ] 12 | Webhook de WhatsApp: GET de verificación, firma `X-Hub-Signature-256`, estados por `providerId`; registrar la URL en Meta | `api/webhooks/whatsapp.ts`, `lib/notify/webhook.ts` + test | E, Prod | Meta verifica la URL; tras un envío real, `Notification` pasa a `DELIVERED` y `READ`; firma inválida = 401 | `feat(webhooks): add WhatsApp webhook` |
| [ ] 13 | Despacho de alertas (`04` §6) y `notifyOfficerAlert` | `lib/alerts/dispatch.ts`, `lib/notify/index.ts` + test | E, S | tests: oficial más cercano, nadie en radio, ubicación vieja ignorada, supresión de 10 min | `feat(alerts): dispatch alerts to nearest officer` |
| [ ] 14 | Sesión y ubicación del oficial | `api/officers/session.ts`, `api/officers/location.ts` | E, S, Prod | en el Preview, OF-0001 inicia sesión y su ubicación se guarda con `onDuty` | `feat(officers): add session and location endpoints` |
| [ ] 15 | Alertas del oficial y acuse | `api/officers/[id]/alerts.ts`, `api/alerts/[id]/ack.ts` | E, S, Prod | un avistamiento del set D crea la alerta, el teléfono 2 recibe WhatsApp y el listado la devuelve sin datos del dueño | `feat(officers): add alert list and acknowledgement` |
| [ ] 16 | E2E de la alerta y tests que falten (HU-03, HU-04, HU-06) | `tests/e2e/officer-alert.spec.ts` | E, S, Prod | `pnpm test` y `pnpm test:e2e` verdes con `NOTIFY_DRY_RUN=true` | `test(p3): add officer alert e2e` |
| [ ] 17 | Pasar a la línea propia y plantillas aprobadas en prod, o confirmar el plan B (número de prueba) | env en Vercel; casilla de este plan | Prod | el flujo completo en prod llega desde el número que se usará en la demo | `docs(p3): record WhatsApp line used for demo` |
| [ ] 18 | Stretch: respuesta "PAGAR"/"APELAR" a mensajes entrantes | `api/webhooks/whatsapp.ts`, `lib/notify/**` | 12 hecho, todo lo anterior verde | escribir "PAGAR" al número devuelve el link de la multa | `feat(webhooks): reply to PAGAR and APELAR` |
| [ ] 19 | Stretch: OTP del portal por WhatsApp (con P1) | `lib/notify/**` y endpoints que acuerden con P1 | P1 | el código llega por WhatsApp y desbloquea el `fineToken` | `feat(notify): send portal OTP` |
| [ ] 20 | Preparar la demo: checklist de §9 | casilla de este plan | todo | checklist de §9 completo antes del ensayo de h30 | `docs(p3): demo checklist done` |

Orden si vamos atrasados (`07` §4): pasos 1–12 son el happy path; 13–16 la alerta; 18 y 19 se saltan. Recortes permitidos: email (paso 8 sin Resend) y línea propia (paso 17 con el número de prueba).

Referencia de horas de `07`: pasos 1–2 en h0–1, 3 antes de h2, 4–5 en h1–4, 6–11 en h4–8, 8 y 12 en h8–12, 13–15 en h12–16, 16 en h16–18, 18–19 en h22–24, 20 desde h24.

## 6. Flujo por paso (todo en la rama `Edwjon`)
1. Antes de empezar: `git pull` en `Edwjon`. Si P1 ya subió el esqueleto, traerlo con `git merge origin/main`.
2. Haz solo lo del paso (skill `incremental-implementation`). Zod en todo borde; respuesta `{ ok, data }` o `{ ok: false, error }`; dinero en `amountCents`; sin `any`; solo archivos de P3 (salvo el paso 1, que es de docs).
3. Verifica lo de la columna "Hecho cuando" y corre `pnpm lint && pnpm typecheck && pnpm test` (desde el paso 3).
4. Marca la casilla, sube "Paso actual" y haz **un commit** con el mensaje de la tabla (Conventional Commits, en inglés como el resto del historial).
5. `git push origin Edwjon`: el doble push lo sube a la org y al espejo, y el espejo genera el Preview de Vercel de esta rama.
6. Los pasos con **Prod** se prueban en el Preview o en prod, no solo en local. El webhook de Meta apunta a una sola URL: déjalo en prod.
7. **Llevar a `main`**: lo que usan los demás no les llega si solo está en esta rama. Abrir PR de `Edwjon` a `main` al menos después del paso 3 (P1 necesita los mocks antes de h2), del 9 y del 15. P1 mergea.
8. Antes de marcar un paso: skill `superpowers-verification-before-completion`.

## 7. Decisiones a cerrar en la reunión de contratos (h1)
1. **Kapso → Meta.** Avisar al equipo: cambian env vars (`KAPSO_*` → `WHATSAPP_*`), `.env.example`, nombres de archivo (`kapso.ts` → `whatsapp.ts`) y el webhook (`/api/webhooks/kapso` → `/api/webhooks/whatsapp`, ahora con `GET` de verificación). Las firmas de `notify*` no cambian.
2. **Quién pasa la violación de `FINED` a `NOTIFIED`.** Propuesta: `notifyFineIssued` solo envía y registra `Notification`; P1, dentro de `registerDetection`, llama `transition()` según el resultado (`SENT`/`DRY_RUN`). Así todo cambio de estado queda en `lib/domain`.
3. **`C2PRequest` no está definido** en `04` §0. Propongo el Zod de `04` §5 (`fineToken`, `payerBankCode`, `payerPhone`, `payerCedula`, `c2pKey`, `idempotencyKey`) y lo llevo como PR a `lib/contracts`.
4. **De dónde sale la ubicación de la cámara para el haversine.** `Camera` y `Sighting` no tienen lat/lng; el GPS del teléfono queda en `Evidence.meta`. Propuesta MVP: usar `Intersection.lat/lng`. Opcional: que P1 agregue `lat`/`lng` a `Sighting`.
5. **Qué cuenta para la supresión de 10 min.** Si `NO_OFFICER_NEARBY` también suprime, un oficial que entra en servicio 2 min después no recibe nada. Propuesta: solo cuentan `SENT` y `ACKNOWLEDGED`.
6. **Sesión del oficial.** `api/_lib/auth.ts` es de P1 y `/api/officers/session` es tuyo. Pedir a P1 un helper `requireOfficer(req)` y otro que firme la cookie con `officerId`.
7. **Pagos simultáneos.** Dos pagos con distinta `idempotencyKey` pueden aprobarse a la vez. `markFinePaid` debe hacer el update condicionado a `status = PENDING` dentro de una transacción y fallar si ya está pagada; tu API responde 409.
8. **Email de respaldo.** Sin dominio verificado, Resend solo entrega al correo dueño de la cuenta, y el seed usa `@example.com`. Propuesta: agregar `DEMO_EMAIL_DRIVER` (env, correo del equipo) o asumir que el respaldo solo se ve en `Notification`.
9. **Formato de teléfonos.** `Person.phone` y `DEMO_PHONE_*` van en formato internacional sin `+` (`58412…`), que es lo que va en `to`; `payerPhone` del formulario va en formato local (`0412…`). No mezclarlos.

## 8. Riesgos de P3
| Riesgo | Mitigación |
|---|---|
| Plantillas rechazadas o sin aprobar a tiempo | Crearlas en h0; texto sobrio de utilidad, sin promociones; mientras tanto, ventana de 24 h abierta con "hola" y `type: "text"` |
| La línea propia no queda (nombre rechazado, chip ya usado en WhatsApp, sin método de pago) | Empezar en h0 en paralelo; plan B con el número de prueba y los teléfonos de demo verificados |
| Token vencido en plena demo | Token permanente de usuario del sistema, nunca el temporal del panel |
| Firma del webhook no coincide (body ya parseado) | Handler Web y `request.text()`; probar con un evento real de Meta, no solo con el test |
| Notificar bloquea o rompe la creación de la multa | `notify*` nunca lanza: captura el error, guarda `FAILED` y devuelve el resultado |
| La clave C2P termina en logs | No pasar el body completo a `console.log`; el test verifica que la clave no aparece en la respuesta ni en `Payment` |
| Gastar mensajes o depender de red en tests | `NOTIFY_DRY_RUN=true` en local, CI y E2E |

## 9. Checklist de demo (lo tuyo de `06` §3)
- [ ] `NOTIFY_DRY_RUN=false` en prod; env de WhatsApp y Resend cargadas; token permanente.
- [ ] Plantillas aprobadas, o ventana de 24 h abierta en ambos teléfonos ("hola" al número).
- [ ] Decidido si la demo usa la línea propia o el número de prueba; `WHATSAPP_PHONE_NUMBER_ID` apunta a ese.
- [ ] Webhook verificado en la app de Meta y recibiendo `delivered`/`read`.
- [ ] Seed con `DEMO_PHONE_DRIVER` y `DEMO_PHONE_OFFICER` correctos.
- [ ] OF-0001 con sesión iniciada en el teléfono 2, "En servicio", posición demo cerca de CAM-001.
- [ ] Pago con clave `123456` aprobado; `000000` rechaza; segundo intento muestra "Esta multa ya fue pagada".

## 10. Prompt de arranque para tu agente
```
Eres el agente de Persona 3 (notificaciones, pagos y alertas) de VíaClara. Lee AGENTS.md, docs/p3-plan-de-trabajo.md, docs/04-api.md §0, §5, §6, §9, docs/05-ui.md §3.3, §3.4, docs/08-privacidad-y-riesgos.md y docs/09 §1, §2, §6.
WhatsApp va directo con la WhatsApp Cloud API de Meta (docs/p3-plan-de-trabajo.md §3 y docs/04 §7).
Solo modifica archivos de P3 (docs/09 §1). Trabaja el "Paso actual" de docs/p3-plan-de-trabajo.md §5 en la rama Edwjon y ciérralo con un solo commit, siguiendo §6.
Respeta las decisiones de §7 tal como quedaron en la reunión. Tests Vitest para lo que escribas. Antes de terminar, aplica superpowers-verification-before-completion contra HU-03, HU-04 o HU-06 de docs/01.
```
