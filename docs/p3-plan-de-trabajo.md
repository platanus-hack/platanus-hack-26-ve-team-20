# Plan de trabajo P3 · SmartTraffic

Persona 3: **notificaciones, pagos C2P simulados, oficiales y alertas**. Sale de leer todo `docs/` y `AGENTS.md`. Horas relativas a h0 como en `07-plan-36h.md`.

> **Decisiones:** no usamos Kapso. WhatsApp va **directo con Meta (WhatsApp Cloud API)** desde el **número de prueba**, con texto dentro de la ventana de 24 h: sin línea propia, sin plantillas y sin email de respaldo (§3). El resto de los docs, `AGENTS.md` y `.env.example` siguen estas decisiones.

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

**Alcance para la demo**: solo WhatsApp, desde el **número de prueba de Meta**, con **mensajes de texto** dentro de la **ventana de 24 h**. Sin línea propia, sin plantillas y sin email de respaldo.

### 3.1 Lo que ya está montado
| Pieza | Estado |
|---|---|
| App de Meta de tipo Business con el producto WhatsApp | hecha |
| Número de prueba `+1 555-631-3722` (`WHATSAPP_PHONE_NUMBER_ID`) y su cuenta de WhatsApp (`WHATSAPP_WABA_ID`) | hechos |
| 4 teléfonos del equipo verificados como destinatarios (el número de prueba admite pocos; quedó 1 cupo) | hecho |
| Token permanente de usuario del sistema, sin vencimiento, solo con `whatsapp_business_messaging` y `whatsapp_business_management` (comprobado contra Meta) | hecho |
| `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` en `.env.local` | hechos |
| Número de prueba registrado en la Cloud API (`POST /{PHONE_NUMBER_ID}/register` con PIN de 6 dígitos; sin esto Meta responde `133010 Account not registered`). El PIN está en `.env.local` como `WHATSAPP_REGISTRATION_PIN` | hecho: estado `CONNECTED` |
| Webhook: en la app de Meta, URL `https://<deploy>/api/webhooks/whatsapp`, el `WHATSAPP_VERIFY_TOKEN` y suscripción al campo `messages` | pendiente: necesita el endpoint desplegado (paso 12) |
| Variables en Vercel | pendiente: cuando P1 tenga el deploy |

El usuario del sistema es uno que ya existía en el portafolio: no cambiarle rol ni activos, y revocar el token al terminar el hackathon.

### 3.2 La ventana de 24 h (regla de la demo)
- Meta solo deja enviar **texto libre** a un número que le escribió al número de prueba en las **últimas 24 h**. Fuera de esa ventana exige plantillas, y no vamos a usarlas.
- Antes de cada sesión de pruebas, de cada ensayo y del pitch, **los teléfonos de demo (conductor y oficial) escriben "hola" al número de prueba**. Eso reabre la ventana por 24 h.
- Si la ventana está cerrada, Meta rechaza el envío con un error (según la doc, el código `131047`; confirmarlo en el primer fallo real). `lib/notify/whatsapp.ts` lo guarda en `Notification` como `FAILED` con el código y el mensaje, y la consola lo muestra. No hay reintento por otro canal.
- Solo pueden recibir los números verificados en *API Setup*. Un juez no puede recibir el WhatsApp en su teléfono salvo que se verifique antes, y queda 1 cupo.
- Los mensajes llegan desde un chat llamado "Test Number", sin nombre ni logo de SmartTraffic. El texto lleva "SmartTraffic (demo)" al inicio.

### 3.3 Variables de entorno
| Variable | Uso |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | token permanente del usuario del sistema |
| `WHATSAPP_PHONE_NUMBER_ID` | id del número de prueba |
| `WHATSAPP_WABA_ID` | id de la cuenta de WhatsApp Business (solo para diagnóstico) |
| `WHATSAPP_APP_SECRET` | clave secreta de la app; firma `X-Hub-Signature-256` del webhook |
| `WHATSAPP_VERIFY_TOKEN` | texto aleatorio para el GET de verificación del webhook |
| `WHATSAPP_GRAPH_VERSION` | `v23.0` (con el que se probó el token) |

`WHATSAPP_REGISTRATION_PIN` solo hace falta si hay que volver a registrar el número. Además: `DEMO_PHONE_DRIVER`, `DEMO_PHONE_OFFICER`, `OFFICER_PASSCODE`, `ALERT_RADIUS_METERS`, `NOTIFY_DRY_RUN`. Ninguna va al repo; solo en Vercel y `.env.local`, que el `.gitignore` del esqueleto ya ignora.

### 3.4 Contrato técnico
**Envío** (`lib/notify/whatsapp.ts`), siempre `type: "text"`:
```http
POST https://graph.facebook.com/{WHATSAPP_GRAPH_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages
Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}
Content-Type: application/json

{ "messaging_product": "whatsapp", "recipient_type": "individual", "to": "584120000001",
  "type": "text", "text": { "body": "SmartTraffic (demo). Se registró una posible infracción…", "preview_url": true },
  "biz_opaque_callback_data": "fine:fine_cuid" }
```
La respuesta trae `messages[0].id` (wamid) → `Notification.providerId`. Un error de Meta (`error.code`, `error.message`) → `Notification.status = FAILED` y `Notification.error`.

**Webhook** (`api/webhooks/whatsapp.ts`, handler Web `GET`/`POST(request: Request)`):
- `GET`: si `hub.mode === "subscribe"` y `hub.verify_token === WHATSAPP_VERIFY_TOKEN`, responder 200 con `hub.challenge` en texto plano; si no, 403.
- `POST`: leer el body crudo con `await request.text()`, calcular `sha256=` + HMAC-SHA256(body, `WHATSAPP_APP_SECRET`) y compararlo con `X-Hub-Signature-256` con `timingSafeEqual`. Firma mala → 401. Recién después, `JSON.parse` y Zod.
- Recorrer `entry[].changes[].value`: `statuses[]` (`id` = wamid, `status` = `sent|delivered|read|failed`, `errors[]`) → actualizar `Notification` por `providerId`; `messages[]` (entrantes) → stretch "PAGAR"/"APELAR".
- Meta reintenta si no recibe 200, así que hay que deduplicar por (wamid, estado) y no bajar de estado (un `delivered` atrasado no pisa un `read`). Responder 200 rápido.

## 4. Estado actual y qué no depende de nadie
- El esqueleto de P1 ya está en `main` y en esta rama: Vite, Vercel Functions, `lib/contracts` (con las firmas de P3 en `modules.ts` y `C2PRequestSchema` en `requests.ts`), `api/_lib/respond.ts`, Vitest, oxlint y `.gitignore`. Las páginas `src/pages/Multa.tsx` y `Pagar.tsx` existen como placeholder.
- P1 terminó su parte: dominio (`registerDetection`, `registerSighting`, `markFinePaid`, revisión), `GET /api/fines/[token]`, portal, violaciones y sesiones (`api/_lib/auth.ts`, firmadas con `SESSION_SECRET`). Las APIs del oficial y el pago usan esa sesión y el límite de intentos de P1 (`lib/domain/rate-limit.ts`).
- **Aviso a P1 (archivo suyo tocado por P3):** en `lib/domain/index.ts` se cambiaron los mocks de P3 (`TODO(F13)`) por `lib/notify/index.ts` y `lib/alerts/index.ts`. `registerDetection` y la revisión ya envían el WhatsApp real y despachan la alerta real; con `USE_MOCKS=true` siguen usando los mocks. Son dos líneas de import, sin cambios en la lógica de P1.
- **Ya se puede** hacer todo lo que solo usa contratos y Vitest: mocks, textos de los mensajes, cliente de WhatsApp, simulador C2P y haversine (pasos 3–7).
- **Bloquea a otros**: tus mocks (`lib/notify/mock.ts`, `lib/alerts/mock.ts`, `lib/payments/mock.ts`) deben estar antes de h2; P1 los necesita para `registerDetection`.

## 5. Pasos

**Paso actual: 10.** Al cerrar un paso, marca su casilla y sube este número en el mismo commit.

Cada paso es **un commit** en la rama `Edwjon` (§6). Columna "Necesita": `—` = se puede hacer ya; **C** = contratos y Vitest del esqueleto de P1 (ya en esta rama); **E** = además Prisma, `lib/db.ts` y `lib/domain` de P1; **S** = además el seed con oficiales y teléfonos demo; **Prod** = hay deploy en Vercel.

| # | Paso | Archivos | Necesita | Hecho cuando | Commit |
|---|---|---|---|---|---|
| [x] 1 | Documentar el cambio de Kapso a Meta en el resto del repo | `AGENTS.md`, `CLAUDE.md`, `docs/00`–`09`, `README.md`, `project-description.md`, `platanus-hack-project.jsonc`, `.env.example` | — | `grep -ri kapso` solo encuentra la nota histórica de este plan; `.env.example` trae las `WHATSAPP_*` de §3.3 | `docs: switch WhatsApp from Kapso to Meta Cloud API` |
| [x] 2 | Montar WhatsApp en Meta (manual): app, número de prueba, destinatarios verificados, token permanente, clave secreta y verify token (§3.1) | sin código; solo la casilla de este plan | — | `hello_world` llega a los teléfonos de demo; el token responde contra Meta; las variables están en `.env.local` (las de Vercel van en el paso 10) | `docs(p3): mark Meta setup done` |
| [x] 3 | Mocks de P3 con las firmas de `lib/contracts` | `lib/notify/mock.ts`, `lib/alerts/mock.ts`, `lib/payments/mock.ts` | C | `pnpm typecheck` verde; P1 los importa con `USE_MOCKS=true` | `feat(notify): add P3 mocks` |
| [x] 4 | Textos de los 3 mensajes (`04` §7), fechas en Caracas, placa y montos formateados | `lib/notify/templates.ts` + test | C | test de los 3 textos en verde | `feat(notify): add message templates` |
| [x] 5 | Cliente de WhatsApp Cloud API: mensajes de texto, `NOTIFY_DRY_RUN`, errores de Meta tipados (incluido ventana cerrada) | `lib/notify/whatsapp.ts` + test con `fetch` simulado | C | test verde; un script local envía un mensaje real al teléfono de demo | `feat(notify): add WhatsApp Cloud API client` |
| [x] 6 | Simulador C2P y lista de bancos de ejemplo | `lib/payments/banks.ts`, `lib/payments/c2p.ts` + test | C | `000000` rechaza, `111111` sin fondos, otra aprueba con `SIM-`; la clave no aparece en nada devuelto | `feat(payments): add simulated C2P` |
| [x] 7 | Distancia entre coordenadas | `lib/geo/haversine.ts` + test | C | distancias conocidas dentro de ±1 m | `feat(geo): add haversine` |
| [x] 8 | `notifyFineIssued` y `notifyPaymentConfirmed` reales: guardan `Notification` y `AuditLog`, nunca lanzan; si WhatsApp falla queda `FAILED` con el error. Probado de punta a punta contra Supabase con WhatsApp real (aviso → pago → confirmación) | `lib/notify/index.ts`, `notifier.ts`, `prisma-repo.ts` + tests | E, S | crear una multa con el script de P1 envía WhatsApp y deja `Notification` en `SENT` (o `DRY_RUN`) | `feat(notify): send fine and payment notifications` |
| [x] 9 | API de pago: Zod, idempotencia, 409 `ALREADY_PAID`, rate limit, pago con `transition()` de P1 (en lugar de `markFinePaid`), `AuditLog`. Probada contra Supabase con `pnpm test:db` (aprobación, misma llave, dos pagos a la vez, rechazo). Confirma por WhatsApp con `notifyPaymentConfirmed` real | `api/payments/c2p.ts` + test | E, S | doble envío con la misma llave = un solo `Payment`; segundo pago de la misma multa = 409 | `feat(payments): add C2P payment endpoint` |
| [ ] 10 | Página de la multa (HU-04, `05` §3.3); cargar las variables de §3.3 en Vercel. **Avance:** página lista y probada a 360 px con multas de ejemplo (`/multa/demo-pendiente`, `demo-vencida`, `demo-pagada`) que se usan solo si la API no responde; `GET /api/fines/[token]` de P1 ya existe; falta probarla en Vercel | `src/pages/Multa.tsx`, `components/multa/**` | E, S, Prod | en el Preview, una multa del seed se ve a 360 px con evidencia, monto y banner demo, sin cédula ni teléfono | `feat(multa): add fine landing page` |
| [ ] 11 | Página de pago (`05` §3.4): 4 campos, validación en español, enviando/aprobado/rechazado. **Avance:** página lista y probada (validación, rechazo con `000000`, comprobante, doble clic, multa ya pagada) con pago simulado en el navegador para las multas de ejemplo; falta la API del paso 9 y probarla en Vercel | `src/pages/Pagar.tsx`, `components/multa/**` | E, S, Prod | en el Preview se paga con `123456` y llega el WhatsApp de confirmación; `000000` muestra rechazo | `feat(multa): add simulated C2P payment page` |
| [ ] 12 | Webhook de WhatsApp: GET de verificación, firma `X-Hub-Signature-256`, estados por `providerId`; registrar la URL en Meta. **Avance:** verificación, firma, lectura de estados, endpoint y store con Prisma (`webhook-store.ts`) listos; probado contra Supabase con eventos firmados (`pnpm test:db`). Falta desplegar en prod con `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` en Vercel y registrar la URL en Meta | `api/webhooks/whatsapp.ts`, `lib/notify/webhook.ts` + test | E, Prod | Meta verifica la URL; tras un envío real, `Notification` pasa a `DELIVERED` y `READ`; firma inválida = 401 | `feat(webhooks): add WhatsApp webhook` |
| [x] 13 | Despacho de alertas (`04` §6) y `notifyOfficerAlert`: `decideAlert` (pura) + `dispatch.ts` con Prisma (candado por vehículo, idempotente por avistamiento, `AuditLog`) + `lib/alerts/index.ts`. Probado contra Supabase (más cercano, supresión, simultáneos) y con WhatsApp real al teléfono del oficial | `lib/alerts/decide.ts`, `dispatch.ts`, `index.ts`, `lib/notify/notifier.ts` + tests | E, S | tests: oficial más cercano, nadie en radio, ubicación vieja ignorada, supresión de 10 min | `feat(alerts): dispatch alerts to nearest officer` |
| [ ] 14 | Sesión y ubicación del oficial. **Avance:** `POST/DELETE /api/officers/session` (cookie `vc_officer` firmada con `OFFICER_PASSCODE`, 12 h) y `POST /api/officers/location` listos y probados contra Supabase; falta probar en el Preview | `api/officers/session.ts`, `api/officers/location.ts` | E, S, Prod | en el Preview, OF-0001 inicia sesión y su ubicación se guarda con `onDuty` | `feat(officers): add session and location endpoints` |
| [ ] 15 | Alertas del oficial y acuse. **Avance:** `GET /api/officers/[id]/alerts` (solo las propias, sin datos del dueño) y `POST /api/alerts/[id]/ack` (idempotente) listos y probados contra Supabase; falta probar en prod con el set D de P2 | `api/officers/[id]/alerts.ts`, `api/alerts/[id]/ack.ts` | E, S, Prod | un avistamiento del set D crea la alerta, el teléfono 2 recibe WhatsApp y el listado la devuelve sin datos del dueño | `feat(officers): add alert list and acknowledgement` |
| [ ] 16 | E2E de la alerta y tests que falten (HU-03, HU-04, HU-06). **Avance:** E2E de HU-06 a nivel API + DB (`tests/db/alert-flow.db.test.ts`: sesión → ubicación → avistamiento → alerta < 5 s → lista sin datos del dueño → "Recibido" → supresión → fuera de servicio) y tests del handler de pago (`tests/db/payments-api.db.test.ts`: 200/409/400/404/429). Falta el spec de Playwright: necesita Playwright y `playwright.config.ts` (P1), `/oficial` (P4) y `/api/sightings` (P2) | `tests/e2e/officer-alert.spec.ts` | E, S, Prod | `pnpm test` y `pnpm test:e2e` verdes con `NOTIFY_DRY_RUN=true` | `test(p3): add officer alert e2e` |
| [ ] 17 | Stretch: respuesta "PAGAR"/"APELAR" a mensajes entrantes | `api/webhooks/whatsapp.ts`, `lib/notify/**` | 12 hecho, todo lo anterior verde | escribir "PAGAR" al número devuelve el link de la multa | `feat(webhooks): reply to PAGAR and APELAR` |
| [ ] 18 | Stretch: OTP del portal por WhatsApp (con P1) | `lib/notify/**` y endpoints que acuerden con P1 | P1 | el código llega por WhatsApp y desbloquea el `fineToken` | `feat(notify): send portal OTP` |
| [ ] 19 | Preparar la demo: checklist de §9 | casilla de este plan | todo | checklist de §9 completo antes del ensayo de h30 | `docs(p3): demo checklist done` |

Orden si vamos atrasados (`07` §4): pasos 1–12 son el happy path; 13–16 la alerta; 17 y 18 se saltan.

Referencia de horas de `07`: pasos 1–2 en h0–1, 3 antes de h2, 4–5 en h1–4, 6–11 en h4–8, 8 y 12 en h8–12, 13–15 en h12–16, 16 en h16–18, 17–18 en h22–24, 19 desde h24.

## 6. Flujo por paso (todo en la rama `Edwjon`)
1. Antes de empezar: `git pull` en `Edwjon`. Si P1 ya subió el esqueleto, traerlo con `git merge origin/main`.
2. Haz solo lo del paso (skill `incremental-implementation`). Zod en todo borde; respuesta `{ ok, data }` o `{ ok: false, error }`; dinero en `amountCents`; sin `any`; solo archivos de P3 (salvo el paso 1, que es de docs).
3. Verifica lo de la columna "Hecho cuando" y corre `pnpm lint && pnpm typecheck && pnpm test` (desde el paso 3).
4. Marca la casilla, sube "Paso actual" y haz **un commit** con el mensaje de la tabla (Conventional Commits, en inglés como el resto del historial).
5. `git push origin Edwjon`: sube **solo** a `daniel-morillo/PlatanusHack`, que genera el Preview de Vercel de esta rama. `Edwjon` no va al repo de la org (`platanus-hack/platanus-hack-26-ve-team-20`); lo que llega a `main` en `daniel-morillo/PlatanusHack` se lleva a la org desde ahí.
6. Los pasos con **Prod** se prueban en el Preview o en prod, no solo en local. El webhook de Meta apunta a una sola URL: déjalo en prod.
7. **Llevar a `main`**: lo que usan los demás no les llega si solo está en esta rama. Abrir PR de `Edwjon` a `main` en `daniel-morillo/PlatanusHack` al menos después del paso 3 (P1 necesita los mocks antes de h2), del 9 y del 15. P1 mergea.
8. Antes de marcar un paso: skill `superpowers-verification-before-completion`.

## 7. Decisiones a cerrar en la reunión de contratos (h1)
1. **Kapso → Meta, solo número de prueba.** Avisar al equipo: cambian env vars (`KAPSO_*` y `RESEND_*`/`EMAIL_FROM` → `WHATSAPP_*`), `.env.example`, nombres de archivo (`kapso.ts` → `whatsapp.ts`) y el webhook (`/api/webhooks/kapso` → `/api/webhooks/whatsapp`, ahora con `GET` de verificación). Las firmas de `notify*` no cambian.
2. ~~Quién pasa la violación de `FINED` a `NOTIFIED`.~~ Resuelto por P1 como se propuso: `registerDetection` y la revisión pasan a `NOTIFIED` si `notifyFineIssued` devuelve `SENT` o `DRY_RUN`.
3. ~~`C2PRequest` no está definido.~~ Resuelto: P1 lo publicó como `C2PRequestSchema` en `lib/contracts/requests.ts`.
4. ~~De dónde sale la ubicación de la cámara.~~ Aplicado en `dispatch.ts`: se usa `Intersection.lat/lng`. Si P1 agrega `lat`/`lng` a `Sighting` (GPS del teléfono), se cambia en un solo lugar.
5. **Qué cuenta para la supresión de 10 min.** Si `NO_OFFICER_NEARBY` también suprime, un oficial que entra en servicio 2 min después no recibe nada. Propuesta: solo cuentan `SENT` y `ACKNOWLEDGED`.
6. ~~Sesión del oficial.~~ Resuelto en P3, como prevé `docs/11` (la cookie `officer` la emite P3): `lib/alerts/officer-session.ts` firma y verifica, `api/officers/_session.ts` tiene `requireOfficer`. Si P1 la necesita en `api/_lib/auth.ts`, que importe `verifySessionToken`.
7. ~~Pagos simultáneos.~~ Resuelto en P3 sin esperar `markFinePaid`: `prisma-store.ts` pasa a `PAID` con `transition()` de P1, que bloquea la fila (`FOR UPDATE`); el segundo pago ve la multa pagada, su `Payment` queda `REJECTED` (`ALREADY_PAID`) y la API responde 409. Si P1 publica `markFinePaid`, se puede usar en su lugar.
8. **Sin email de respaldo.** HU-03 pedía intentar email si WhatsApp falla; queda fuera. El fallo se ve en `Notification` (`FAILED`). `Channel.EMAIL` y `Person.email` pueden quedarse en el schema sin uso.
9. **Formato de teléfonos.** `Person.phone` y `DEMO_PHONE_*` van en formato internacional sin `+` (`58412…`), que es lo que va en `to`; `payerPhone` del formulario va en formato local (`0412…`). No mezclarlos.
10. **Dos cambios aditivos a `lib/contracts` (requieren OK de P1):** `EXAMPLE_BANKS` e `isExampleBank` pasan a `lib/contracts/banks.ts` porque los usan el formulario y el servidor (`src/` no puede importar `lib/payments`), y se agregan `C2PRejectedDTO` y `C2PPaymentDTO`: un pago rechazado responde 200 con `{ ok: true, data: { status: "REJECTED", failureCode, simulated: true } }`, porque `docs/04` §5 no definía la respuesta del rechazo.

## 8. Riesgos de P3
| Riesgo | Mitigación |
|---|---|
| La ventana de 24 h se cierra y el mensaje no llega | Los teléfonos de demo escriben "hola" antes de cada prueba, ensayo y del pitch; el fallo queda visible como `FAILED` en la consola |
| Un juez quiere recibir el WhatsApp en su teléfono | El número de prueba solo envía a números verificados; mostrar el teléfono del equipo, o verificar el del juez antes (queda 1 cupo) |
| Alguien cambia o revoca el usuario del sistema compartido | Avisar al dueño del portafolio; si el token deja de valer, generar otro desde el mismo usuario |
| Token vencido en plena demo | Token permanente de usuario del sistema, nunca el temporal del panel |
| Firma del webhook no coincide (body ya parseado) | Handler Web y `request.text()`; probar con un evento real de Meta, no solo con el test |
| Notificar bloquea o rompe la creación de la multa | `notify*` nunca lanza: captura el error, guarda `FAILED` y devuelve el resultado |
| La clave C2P termina en logs | No pasar el body completo a `console.log`; el test verifica que la clave no aparece en la respuesta ni en `Payment` |
| Gastar mensajes o depender de red en tests | `NOTIFY_DRY_RUN=true` en local, CI y E2E |

## 9. Checklist de demo (lo tuyo de `06` §3)
- [ ] `NOTIFY_DRY_RUN=false` en prod; variables de WhatsApp cargadas en Vercel; token permanente válido.
- [ ] Ventana de 24 h abierta: los teléfonos del conductor y del oficial escribieron "hola" al número de prueba poco antes del pitch.
- [ ] Webhook verificado en la app de Meta y recibiendo `delivered`/`read`.
- [ ] Seed con `DEMO_PHONE_DRIVER` y `DEMO_PHONE_OFFICER` correctos.
- [ ] OF-0001 con sesión iniciada en el teléfono 2, "En servicio", posición demo cerca de CAM-001.
- [ ] Pago con clave `123456` aprobado; `000000` rechaza; segundo intento muestra "Esta multa ya fue pagada".

## 10. Prompt de arranque para tu agente
```
Eres el agente de Persona 3 (notificaciones, pagos y alertas) de SmartTraffic. Lee AGENTS.md, docs/p3-plan-de-trabajo.md, docs/04-api.md §0, §5, §6, §9, docs/05-ui.md §3.3, §3.4, docs/08-privacidad-y-riesgos.md y docs/09 §1, §2, §6.
WhatsApp va directo con la WhatsApp Cloud API de Meta, desde el número de prueba y solo con mensajes de texto (docs/p3-plan-de-trabajo.md §3 y docs/04 §7). Sin plantillas ni email.
Solo modifica archivos de P3 (docs/09 §1). Trabaja el "Paso actual" de docs/p3-plan-de-trabajo.md §5 en la rama Edwjon y ciérralo con un solo commit, siguiendo §6.
Respeta las decisiones de §7 tal como quedaron en la reunión. Tests Vitest para lo que escribas. Antes de terminar, aplica superpowers-verification-before-completion contra HU-03, HU-04 o HU-06 de docs/01.
```
