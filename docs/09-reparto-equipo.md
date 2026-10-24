# 09 — Reparto del equipo (4 personas) · VíaClara

Objetivo: 4 verticales con **mínimo solapamiento de archivos** para no pisarse en git. Plan por horas: `07-plan-36h.md`.

## 1. Mapa de propiedad de archivos
| Ruta | Dueño | Otros pueden… |
|---|---|---|
| `lib/contracts/**` | P1 | proponer cambios por PR; requiere OK de los afectados |
| `prisma/**`, `lib/db.ts`, `lib/domain/**`, `lib/auth/**`, `middleware.ts` | P1 | solo leer |
| `app/api/violations/**`, `app/api/fines/**`, `app/api/portal/**` | P1 | — |
| `tests/e2e/**`, `vitest.config.ts`, `playwright.config.ts` | P1 | agregar specs de su vertical |
| `lib/vision/**`, `lib/storage/**`, `public/demo/**` | P2 | — |
| `app/camaras/**`, `components/camaras/**`, `app/api/detections/**`, `app/api/sightings/**`, `app/api/blob/**`, `app/api/cameras/**` | P2 | — |
| `lib/notify/**`, `lib/payments/**`, `lib/geo/**`, `lib/alerts/**` | P3 | — |
| `app/multa/**`, `components/multa/**`, `app/api/payments/**`, `app/api/officers/**`, `app/api/alerts/**`, `app/api/webhooks/**` | P3 | P4 ajusta estilos por PR |
| `app/globals.css`, `tailwind` config, `components/ui/**`, `components/vc/**`, `app/layout.tsx`, `app/page.tsx` | P4 | usar, no modificar |
| `app/consulta/**`, `app/oficial/**`, `app/admin/**`, `components/{consulta,oficial,admin}/**`, `pitch/**`, `DESIGN.md` | P4 | — |
| `package.json`, `pnpm-lock.yaml` | compartido | agregar deps en PR propio y pequeño; si hay conflicto en lock: `pnpm install` y recommit |
| `docs/**`, `AGENTS.md`, `CLAUDE.md` | P4 (producto) | cualquiera por PR |

## 2. Contratos (hora ~1, antes de separarse)
Reunión de 30–45 min. Resultado mergeado por P1 en `lib/contracts/index.ts` (copiar de `04-api.md` §0):
- Tipos: `VisionResult`, `FrameInput`, `Box`, `Verdict`, `LightState`, `ViolationType`, `NotificationResult`, `C2PRequest`, DTOs de respuesta de cada endpoint (`FinePublicDTO`, `PortalLookupDTO`, `ViolationListItemDTO`, `OfficerAlertDTO`).
- Zod schemas de request de cada endpoint.
- Firmas de: `registerDetection`, `registerSighting`, `markFinePaid` (P1); `analyze` (P2); `notifyFineIssued`, `notifyPaymentConfirmed`, `notifyOfficerAlert`, `chargeC2P`, `dispatchAlert` (P3).
- **Mocks**: cada dueño publica `lib/<modulo>/mock.ts` con la misma firma antes de h2; `USE_MOCKS=true` los activa. Datos de mock = fixtures del seed (mismos ids/placas).
- Regla: cambiar un contrato = PR a `lib/contracts` + aviso en el chat del equipo + OK de los consumidores.

### Quién llama a quién
```
P2 /api/detections ──> P2 lib/vision.analyze ──> P1 lib/domain.registerDetection ──> P3 lib/notify.notifyFineIssued
                                                       └─(vehículo con deuda)──> P1 registerSighting ──> P3 lib/alerts.dispatchAlert
P3 /api/payments/c2p ──> P3 lib/payments.chargeC2P ──> P1 lib/domain.markFinePaid ──> P3 notifyPaymentConfirmed
P4 páginas ──> GET/POST APIs de P1 y P3 (DTOs de lib/contracts)
```

## 3. Estrategia de ramas y repos
- `main` siempre desplegable (Vercel prod). Ramas: `p1/<tema>`, `p2/<tema>`, `p3/<tema>`, `p4/<tema>`.
- PRs pequeños (idealmente < 300 líneas), Conventional Commits, squash merge. CI mínimo: `lint`, `typecheck`, `test`.
- Review: cualquier compañero aprueba en ≤ 15 min; cambios en `lib/contracts` o `prisma` requieren review de P1.
- **Merge captain: P1** (integra, resuelve conflictos en archivos compartidos, anuncia "main roto" / "main verde").
- **Espejo para Vercel** (requisito Platanus): P1 crea repo personal y configura doble push (README de la org). Ojo: un merge hecho en la web de GitHub del repo de la org **no** llega solo al repo personal. Regla: tras cada merge, P1 corre `git checkout main && git pull && git push` (empuja a ambos), o se mergea localmente y se hace `git push`. Todos configuran el doble push en sus clones para que las ramas también generen Preview Deploys en Vercel.
- Congelamiento: desde h34 solo P1 mergea y solo bloqueantes.

## 4. Persona 1 — Backend core + datos + dominio + integración + QA lead
**Posee**: ver tabla §1.
**Tareas en orden**
| Bloque | Tarea | Entregable en checkpoint |
|---|---|---|
| h0–1 | Crear app Next.js (TS, App Router, Tailwind, ESLint), pnpm, estructura de carpetas, `lib/contracts` con equipo, `.env.example` | h1: contratos en `main` |
| h1–4 | Prisma schema (doc 03), Neon vía Vercel Marketplace, migración, `seed.ts` v1, repo espejo + Vercel prod | h4: app desplegada con seed |
| h4–8 | `lib/domain`: `state-machine.ts`, `violations.ts` (`registerDetection` con dedup e idempotencia), `fines.ts` (montos de ejemplo, token), `audit.ts`; APIs `GET /api/violations`, `GET /api/fines/[token]` | h8: crear multa vía script/API |
| h8–12 | Integrar: reemplazar mocks por reales; `markFinePaid`; auth passcode (`middleware.ts`, cookie firmada) | h12: E2E happy path |
| h12–14 | `POST /api/portal/lookup` (+ rate limit, enmascarado, AuditLog), `POST /api/violations/[id]/review` | h16: portal y revisión en prod |
| h14–18 | Tests unit dominio; `registerSighting`; `pnpm demo:reset`; Playwright happy path | — |
| h18–22 | Duerme | — |
| h22–24 | E2E revisión y portal; revisar logs de Vercel | h24: freeze |
| h24–36 | QA lead (bug bash, `security-audit`), merge captain, deploy final | h30/h34: demo estable |
**Depende de**: nada para empezar. Consume `notify*` y `dispatchAlert` de P3 (mock hasta h8–10).
**Prompt de arranque (Claude Code)**:
```
Eres el agente de Persona 1 (backend core) del proyecto VíaClara. Lee AGENTS.md, docs/01-producto-prd.md, docs/03-modelo-de-datos.md, docs/04-api.md (§0, §2, §3, §4, §9) y docs/09-reparto-equipo.md §1-§4.
Solo puedes modificar los archivos que posee P1 según docs/09 §1.
Objetivo inmediato (en este orden, un PR pequeño por paso, usando las skills incremental-implementation y api-and-interface-design):
1) Esqueleto Next.js App Router + TS estricto + Tailwind + Prisma; crea lib/contracts/index.ts exactamente con los tipos y firmas de docs/04-api.md §0 y Zod schemas de requests.
2) prisma/schema.prisma según docs/03 §2, lib/db.ts singleton, prisma/seed.ts idempotente con los datos FALSOS de docs/03 §5 (lee DEMO_PHONE_DRIVER/DEMO_PHONE_OFFICER de env).
3) lib/domain/state-machine.ts con transiciones de docs/03 §3 y AuditLog en la misma transacción; lib/domain/violations.ts con registerDetection (dedup ±60 s, idempotencyKey), lib/domain/fines.ts.
4) Route handlers GET /api/violations, GET /api/fines/[token] con DTOs y respuestas de docs/04.
Usa los mocks de lib/notify/mock.ts y lib/alerts/mock.ts si los reales no existen. Escribe tests Vitest para la máquina de estados y dedup. Antes de decir terminado, aplica superpowers-verification-before-completion y verifica los criterios de HU-02 en docs/01.
```

## 5. Persona 2 — Visión + simulador de cámara + evidencia
**Tareas en orden**
| Bloque | Tarea | Entregable |
|---|---|---|
| h0–1 | Revisar `VisionResult`; preparar frames demo con **placas ficticias** (fotos propias del equipo con placa editada, o imágenes generadas) para sets A (rojo, cruza, placa legible = placa de `V-99000001`), B (verde), C (placa ilegible), D (placa de `V-99000002`, con deuda) | h1: lista de sets y placas acordadas con P1 (seed) |
| h1–4 | `/api/blob/upload` + `lib/storage/blob.ts`; `/camaras` v0: selector cámara, dropzone, preview, redimensionar a ≤ 1568 px en cliente | h4: subir frames en prod |
| h4–8 | `lib/vision/prompt.ts`, `claude.ts` (tool use, doc 04 §8), Zod; `geometry.ts` (cruce con signo de producto cruz); `analyze.ts` (doble llave); `POST /api/detections` (contra mock de dominio) | h8: set A → `VIOLATION` |
| h8–12 | Overlay de `stopLine`/`lightRoi` (SVG/canvas) y calibración por cámara; feed en vivo (polling `/api/violations?since=`); progreso por pasos | h12: E2E |
| h12–14 | `POST /api/sightings` (con placa directa o frames); recorte de placa (sharp) → Blob; `DEMO_VISION_CACHE` | h16: set D dispara alerta |
| h14–18 | Duerme | — |
| h18–24 | Casos borde (C, amarillo, discrepancia); tests geometry/analyze; stretch flecha de giro → velocidad | h24: freeze |
| h24–36 | Bugs; frames de respaldo; operador en la demo | h30 ensayo |
**Depende de**: `registerDetection`/`registerSighting` (P1; mock), seed de cámaras con calibración que calce con frames (coordinar con P1 en h1–4).
**Prompt de arranque**:
```
Eres el agente de Persona 2 (visión y simulador de cámara) de VíaClara. Lee AGENTS.md, docs/02-arquitectura.md §5-§6, docs/04-api.md §0, §1, §8, §9, docs/05-ui.md §3.2 y docs/09 §1, §2, §5.
Solo modifica archivos de P2 (docs/09 §1). Usa lib/contracts sin cambiarlo; si necesitas un cambio, propónlo aparte.
Pasos (PRs pequeños, skill incremental-implementation):
1) app/api/blob/upload/route.ts con @vercel/blob/client handleUpload (solo imágenes, máx 5 MB) y lib/storage/blob.ts.
2) app/camaras/page.tsx: selector de cámara (GET /api/cameras o seed), dropzone 2-3 frames, redimensiona en cliente a ≤1568 px, sube a Blob, muestra previews con overlay de stopLine.
3) lib/vision/{prompt.ts,claude.ts,geometry.ts,analyze.ts}: llamada a Claude con @anthropic-ai/sdk, modelo de process.env.ANTHROPIC_MODEL, tool_choice forzado a report_detection con el input_schema de docs/04 §8, validación Zod, regla geométrica y doble llave; devuelve VisionResult.
4) app/api/detections/route.ts (maxDuration=60) que llama analyze() y luego registerDetection() (usa lib/domain/mock si no existe).
Tests Vitest de geometry y analyze con salidas de Claude simuladas. No proceses video en el servidor. Verifica HU-01 de docs/01 con superpowers-verification-before-completion.
```

## 6. Persona 3 — Notificaciones, pagos C2P simulados, oficiales y alertas
**Tareas en orden**
| Bloque | Tarea | Entregable |
|---|---|---|
| h0–1 | Cuenta Kapso + número + API key; pedir plantilla `KAPSO_TEMPLATE_FINE` (por si acaso); cuenta Resend; revisar contratos | h1: credenciales en Vercel env |
| h1–4 | `lib/notify/kapso.ts` (doc 04 §7), `templates.ts`, `NOTIFY_DRY_RUN`, registro en `Notification` | h4: WhatsApp real desde prod a teléfono de demo |
| h4–8 | `lib/payments/{banks.ts,c2p.ts}` simulado; `POST /api/payments/c2p` (idempotencia, nunca guardar clave); `app/multa/[token]/page.tsx` y `/pagar` con componentes de P4 | h8: pagar multa seed |
| h8–12 | `notifyFineIssued/PaymentConfirmed` reales; `POST /api/webhooks/kapso` (HMAC, lote, estados); `lib/notify/email.ts` (Resend) como fallback | h12: E2E |
| h12–14 | `lib/geo/haversine.ts`; `/api/officers/session`, `/location`, `/[id]/alerts`; `/api/alerts/[id]/ack`; `lib/alerts/dispatch.ts`; `notifyOfficerAlert` | h16: alerta llega al teléfono 2 |
| h14–18 | Tests pagos/alerts/webhook | — |
| h18–22 | Duerme | — |
| h22–24 | Stretch: respuesta "PAGAR"/"APELAR" por WhatsApp; OTP del portal (con P1) | h24: freeze |
| h24–36 | Bugs; verificar ventana 24 h; teléfono del oficial en demo | h30 ensayo |
**Depende de**: `markFinePaid` (P1; mock), componentes `components/vc` (P4; usar HTML simple hasta h8), datos de oficiales en seed (P1).
**Prompt de arranque**:
```
Eres el agente de Persona 3 (notificaciones, pagos y alertas) de VíaClara. Lee AGENTS.md, docs/04-api.md §0, §5, §6, §7, §9, docs/05-ui.md §3.3, §3.4, docs/08-privacidad-y-riesgos.md y docs/09 §1, §2, §6.
Solo modifica archivos de P3 (docs/09 §1).
Pasos (PRs pequeños):
1) lib/notify/kapso.ts: POST https://api.kapso.ai/meta/whatsapp/v24.0/{KAPSO_PHONE_NUMBER_ID}/messages con header X-API-Key, mensajes text (y template si KAPSO_TEMPLATE_FINE existe); lib/notify/templates.ts con los textos de docs/04 §7; respeta NOTIFY_DRY_RUN; registra Notification. Implementa notifyFineIssued, notifyPaymentConfirmed, notifyOfficerAlert con firma de lib/contracts.
2) lib/payments/c2p.ts SIMULADO (reglas de docs/04 §5; jamás persistir ni loguear c2pKey) y app/api/payments/c2p/route.ts con idempotencia y 409 ALREADY_PAID; llama markFinePaid.
3) app/multa/[token]/page.tsx y app/multa/[token]/pagar/page.tsx mobile-first con banner "Demo — pago simulado".
4) app/api/webhooks/kapso/route.ts con verificación HMAC-SHA256 de X-Webhook-Signature sobre el body crudo, soporte de lotes, actualización de Notification por providerId.
5) lib/geo/haversine.ts, lib/alerts/dispatch.ts (algoritmo docs/04 §6) y APIs de oficiales/alertas.
Tests Vitest para c2p, haversine, dispatch y webhook. Verifica HU-03, HU-04 y HU-06 de docs/01 antes de terminar.
```

## 7. Persona 4 — UI, sistema de diseño, pantallas públicas/oficial/admin, pitch
**Tareas en orden**
| Bloque | Tarea | Entregable |
|---|---|---|
| h0–1 | Dirección de diseño (doc 05 §1), `DESIGN.md` (skill `design-md`), revisar DTOs | h1: tokens acordados |
| h1–4 | Tokens en `globals.css`, fuentes (Public Sans, IBM Plex Mono vía `next/font`), shadcn tematizado, `components/vc/*` (`Placa`, `EstadoBadge`, `Evidencia`, `Monto`, `DemoBanner`, `SemaforoMini`), `layout.tsx`, landing | h4: landing en prod |
| h4–8 | `/consulta` y `/admin/revision` con datos mock (fixtures del seed) | h8: pantallas navegables |
| h8–12 | Apoyar a P3 en estilo de `/multa` y `/pagar` (PRs de estilo) y a P2 en el feed/pasos de la consola | h12: E2E se ve bien |
| h12–14 | `/oficial`: login, toggle servicio, mapa Leaflet (dynamic import, sin SSR), lista de alertas con polling; conectar `/consulta` y `/admin` a APIs reales | h16 |
| h14–18 | Duerme | — |
| h18–24 | Pitch deck HTML (`pitch/`, skill `creating-html-presentations`) con capturas reales; accesibilidad y responsive (360 px); copy final | h24: freeze |
| h24–36 | Video plan B (h27), pulido, archivos de entrega (`README.md`, `project-description.md`, jsonc, logo), presentador | h30/h32 ensayos |
**Depende de**: DTOs en `lib/contracts` (h1), APIs de P1/P3 (usar fixtures hasta h12).
**Prompt de arranque**:
```
Eres el agente de Persona 4 (UI y diseño) de VíaClara. Lee AGENTS.md, docs/01-producto-prd.md, docs/05-ui.md completo, docs/04-api.md (DTOs de respuesta) y docs/09 §1, §2, §7.
Solo modifica archivos de P4 (docs/09 §1). Usa las skills design-md, frontend-ui-engineering, minimalist-ui, web-design-guidelines y vercel-react-best-practices.
Pasos (PRs pequeños):
1) DESIGN.md con la dirección de docs/05 §1 (sobrio, cívico; sin degradados morados, sin Inter por defecto, sin emojis como íconos; lucide-react).
2) Tokens de docs/05 §2 en app/globals.css y Tailwind; fuentes Public Sans e IBM Plex Mono con next/font; tematizar shadcn (Button, Input, Select, Card, Badge, Table, Sheet, Dialog, Skeleton, Sonner).
3) components/vc: Placa, EstadoBadge, Evidencia, Monto (es-VE, céntimos), DemoBanner, SemaforoMini.
4) app/page.tsx (landing), app/consulta/page.tsx, app/admin/revision/page.tsx con fixtures tipados con los DTOs de lib/contracts; luego app/oficial/page.tsx con Leaflet (import dinámico) y polling de alertas.
Mobile-first a 360 px, contraste AA, foco visible, fechas en America/Caracas. Verifica criterios de docs/05 §3 con playwright-cli/browser-testing-with-devtools antes de terminar.
```

## 8. Equidad de carga
| | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| Horas enfocadas estimadas | ~26 | ~26 | ~26 | ~26 |
| Riesgo técnico | medio (integración) | alto (visión) | medio-alto (APIs externas) | bajo-medio (volumen de pantallas) |
| Rol adicional | merge captain + QA lead | operador en demo | teléfono oficial en demo | presentador + entrega |
Si alguien termina antes: P1 ↔ ayuda con tests de cualquiera; P4 ↔ ayuda con UI de `/camaras`; P2/P3 ↔ stretch de su vertical. Reequilibrar en cada checkpoint (h8, h12, h16, h24).
