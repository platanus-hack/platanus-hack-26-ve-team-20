# Plan de trabajo P3 · VíaClara

Persona 3: **notificaciones, pagos C2P simulados, oficiales y alertas**. Sale de leer todo `docs/` y `AGENTS.md`. Horas relativas a h0 como en `07-plan-36h.md`.

## 1. Qué es tuyo

**Archivos** (`09` §1): `lib/notify/**`, `lib/payments/**`, `lib/geo/**`, `lib/alerts/**`, `api/payments/**`, `api/officers/**`, `api/alerts/**`, `api/webhooks/**`, `src/pages/{Multa,Pagar}.tsx`, `components/multa/**`. Tus specs en `tests/e2e/` (los configura P1).

**Funciones que expones** (`04` §0; las consumen P1 y P2):
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
Detección (P2) → registerDetection (P1) → notifyFineIssued (P3) → Kapso → WhatsApp conductor
                                       └→ registerSighting (P1) → dispatchAlert (P3) → notifyOfficerAlert → WhatsApp oficial
/multa/:token (P3) → GET /api/fines/[token] (P1)
/multa/:token/pagar (P3) → POST /api/payments/c2p (P3) → chargeC2P → markFinePaid (P1) → notifyPaymentConfirmed
Kapso → POST /api/webhooks/kapso (P3) → Notification.status (DELIVERED/READ/FAILED)
/oficial (UI P4) → /api/officers/session|location|[id]/alerts, /api/alerts/[id]/ack (P3)
```

## 3. Estado actual y qué no depende de nadie
- El repo solo tiene docs: no hay `package.json`, Prisma ni `lib/contracts`. P1 arma el esqueleto en h0–4.
- **Sin esperar a nadie** puedes: crear cuentas (Kapso, Resend), pedir la plantilla, y escribir los módulos puros, que no tocan DB: `templates.ts`, `haversine.ts`, `banks.ts`, el simulador de `c2p.ts`, la verificación HMAC del webhook y el cliente HTTP de Kapso. Todos se prueban con Vitest apenas exista la config.
- **Bloquea a otros**: tus mocks (`lib/notify/mock.ts`, `lib/alerts/mock.ts`, `lib/payments/mock.ts`) deben estar antes de h2; P1 los necesita para `registerDetection`.

## 4. Fases (un PR pequeño por fila, rama `p3/<tema>`)
| Bloque | PR | Contenido | Hecho cuando |
|---|---|---|---|
| h0–1 | — | Cuenta Kapso: número, `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, webhook y `KAPSO_WEBHOOK_SECRET`. Pedir plantilla `KAPSO_TEMPLATE_FINE`. Cuenta Resend. Cargar env en Vercel. Llevar §6 a la reunión de contratos. **Confirmar en la doc actual de Kapso** endpoint, headers y formato de firma (`04` §7 los cita; no se verificaron). | credenciales en Vercel; decisiones de §6 cerradas |
| h1–2 | `p3/mocks` | Mocks con las firmas exactas de `lib/contracts`; devuelven `DRY_RUN`/`APPROVED`/`NO_OFFICER_NEARBY` con datos del seed | P1 puede importarlos con `USE_MOCKS=true` |
| h1–4 | `p3/notify-kapso` | `lib/notify/kapso.ts` (POST a Kapso, `X-API-Key`, `text` o `template`), `templates.ts` (los 3 textos de `04` §7, fechas en Caracas, placa enmascarada), `NOTIFY_DRY_RUN`, fila en `Notification` con `providerId` = wamid | **h4**: WhatsApp real desde prod a `DEMO_PHONE_DRIVER` |
| h4–6 | `p3/payments-sim` | `banks.ts` (lista de ejemplo), `c2p.ts` (espera de 800 a 1500 ms; `000000` → `INVALID_KEY`, `111111` → `INSUFFICIENT_FUNDS`, resto → `SIM-` + 8 dígitos) y tests | tests verdes; la clave no aparece en logs ni en la respuesta |
| h5–8 | `p3/payments-api` | `api/payments/c2p.ts`: Zod, idempotencia por `Payment.idempotencyKey`, 409 `ALREADY_PAID`, rate limit simple, `markFinePaid` + `notifyPaymentConfirmed`, `AuditLog` | doble envío = un solo `Payment` |
| h6–8 | `p3/multa-pages` | `Multa.tsx` y `Pagar.tsx` mobile-first (HTML simple hasta tener `components/vc`): evidencia, monto, CTA, form de 4 campos, estados enviando/aprobado/rechazado, `DemoBanner` siempre, `idempotencyKey` generado una vez por intento | **h8**: pagar una multa del seed en prod |
| h8–12 | `p3/notify-real` | `notifyFineIssued` y `notifyPaymentConfirmed` reales; fallback `lib/notify/email.ts` (Resend) si WhatsApp falla | WhatsApp al crear multa y al pagar |
| h8–12 | `p3/kapso-webhook` | `api/webhooks/kapso.ts`: body crudo (`await request.text()` con handler Web `POST(request: Request)`), HMAC-SHA256 con `timingSafeEqual`, lotes (`X-Webhook-Batch`), actualizar `Notification` por `providerId`, ignorar eventos repetidos, responder 200 rápido | **h12**: E2E happy path en prod |
| h12–14 | `p3/geo-alerts` | `lib/geo/haversine.ts`, `lib/alerts/dispatch.ts` (algoritmo de `04` §6), `notifyOfficerAlert`, tests | dispatch elige el más cercano, ignora ubicaciones viejas, suprime |
| h13–16 | `p3/officers-api` | `/api/officers/session`, `/location` (actualiza `onDuty`), `/[id]/alerts?since=`, `/api/alerts/[id]/ack`; DTO `OfficerAlertDTO` sin datos del dueño | **h16**: set D → WhatsApp en el teléfono 2 y alerta en `/oficial` |
| h16–18 | `p3/tests` | Vitest de c2p, haversine, dispatch, webhook; spec E2E `officer-alert.spec.ts` | `pnpm test` verde |
| h18–22 | — | Duermes | — |
| h22–24 | `p3/stretch-*` | Solo si todo está verde: respuesta "PAGAR"/"APELAR" por WhatsApp; OTP del portal (con P1) | **h24**: freeze |
| h24–36 | — | Bugs, abrir ventana 24 h con los teléfonos de demo, `NOTIFY_DRY_RUN=false` en prod, teléfono del oficial en la demo | ensayos h30/h32/h34 |

Si vas atrasado, el orden de `07` §4 manda: happy path (notify + pago) antes que alertas. Recortes permitidos: email.

## 5. Flujo por PR
1. `git checkout main && git pull`, luego `git checkout -b p3/<tema>`. Tu rama actual (`Edwjon`) no sigue la convención `p3/`.
2. Implementa una sola tajada (skill `incremental-implementation`). Zod en todo borde; respuesta `{ ok, data }` o `{ ok: false, error }`; dinero en `amountCents`; sin `any`.
3. `pnpm lint && pnpm typecheck && pnpm test`.
4. `git push -u origin p3/<tema>`: el doble push lo sube a la org y al espejo, y el espejo genera el Preview de Vercel.
5. Prueba en el Preview, no solo en local (Definition of Done de `AGENTS.md` §10).
6. PR a `main` de menos de 300 líneas; P1 mergea. Si tocas `lib/contracts`, PR aparte, aviso en el chat y OK de P1 y de quien lo consuma.
7. Antes de decir "listo": skill `superpowers-verification-before-completion` contra la HU.

## 6. Decisiones a cerrar en la reunión de contratos (h1)
Huecos que encontré al cruzar los docs:
1. **Quién pasa la violación de `FINED` a `NOTIFIED`.** Propuesta: `notifyFineIssued` solo envía y registra `Notification`; P1, dentro de `registerDetection`, llama `transition()` según el resultado (`SENT`/`DRY_RUN`). Así todo cambio de estado queda en `lib/domain`.
2. **`C2PRequest` no está definido** en `04` §0. Propongo el Zod de `04` §5 (`fineToken`, `payerBankCode`, `payerPhone`, `payerCedula`, `c2pKey`, `idempotencyKey`) y lo llevo como PR a `lib/contracts`.
3. **De dónde sale la ubicación de la cámara para el haversine.** `Camera` y `Sighting` no tienen lat/lng; el GPS del teléfono queda en `Evidence.meta`. Propuesta MVP: usar `Intersection.lat/lng`. Opcional: que P1 agregue `lat`/`lng` a `Sighting`.
4. **Qué cuenta para la supresión de 10 min.** Si `NO_OFFICER_NEARBY` también suprime, un oficial que entra en servicio 2 min después no recibe nada. Propuesta: solo cuentan `SENT` y `ACKNOWLEDGED`.
5. **Sesión del oficial.** `api/_lib/auth.ts` es de P1 y `/api/officers/session` es tuyo. Pedir a P1 un helper `requireOfficer(req)` y otro que firme la cookie con `officerId`.
6. **Pagos simultáneos.** Dos pagos con distinta `idempotencyKey` pueden aprobarse a la vez. `markFinePaid` debe hacer el update condicionado a `status = PENDING` dentro de una transacción y fallar si ya está pagada; tu API responde 409.
7. **Email de respaldo.** Sin dominio verificado, Resend solo entrega al correo dueño de la cuenta, y el seed usa `@example.com`. Propuesta: agregar `DEMO_EMAIL_DRIVER` (env, correo del equipo) o asumir que el respaldo solo se ve en `Notification`.
8. **Formato de teléfonos.** `Person.phone` y `DEMO_PHONE_*` van en E.164 sin `+` (`58412…`), que es lo que pide Kapso; `payerPhone` del formulario va en formato local (`0412…`). No mezclarlos.

## 7. Riesgos de P3
| Riesgo | Mitigación |
|---|---|
| WhatsApp no llega fuera de la ventana de 24 h | Plantilla pedida en h0; los dos teléfonos de demo escriben "hola" al número antes de cada prueba y antes del pitch; estado visible en `Notification` |
| Firma del webhook no coincide (body ya parseado) | Handler Web y `request.text()`; probar con un evento real de Kapso, no solo con el test |
| Notificar bloquea o rompe la creación de la multa | `notify*` nunca lanza: captura el error, guarda `FAILED` y devuelve el resultado |
| La clave C2P termina en logs | No pasar el body completo a `console.log`; el test verifica que la clave no aparece en la respuesta ni en `Payment` |
| Gastar mensajes o depender de red en tests | `NOTIFY_DRY_RUN=true` en local, CI y E2E |

## 8. Checklist de demo (lo tuyo de `06` §3)
- [ ] `NOTIFY_DRY_RUN=false` en prod; env de Kapso y Resend cargadas.
- [ ] Ventana de 24 h abierta en ambos teléfonos (o plantilla aprobada).
- [ ] Seed con `DEMO_PHONE_DRIVER` y `DEMO_PHONE_OFFICER` correctos.
- [ ] OF-0001 con sesión iniciada en el teléfono 2, "En servicio", posición demo cerca de CAM-001.
- [ ] Pago con clave `123456` aprobado; `000000` rechaza; segundo intento muestra "Esta multa ya fue pagada".

## 9. Prompt de arranque para tu agente
```
Eres el agente de Persona 3 (notificaciones, pagos y alertas) de VíaClara. Lee AGENTS.md, docs/p3-plan-de-trabajo.md, docs/04-api.md §0, §5, §6, §7, §9, docs/05-ui.md §3.3, §3.4, docs/08-privacidad-y-riesgos.md y docs/09 §1, §2, §6.
Solo modifica archivos de P3 (docs/09 §1). Trabaja la siguiente fila pendiente de docs/p3-plan-de-trabajo.md §4, en su rama p3/<tema>, con un PR pequeño.
Respeta las decisiones de §6 tal como quedaron en la reunión. Tests Vitest para lo que escribas. Antes de terminar, aplica superpowers-verification-before-completion contra HU-03, HU-04 o HU-06 de docs/01.
```
