# 09 — Reparto del equipo (4 personas) · VíaClara

Objetivo: 4 verticales con **mínimo solapamiento de archivos** para no pisarse en git. Plan por horas: `07-plan-36h.md`.

## 1. Mapa de propiedad de archivos
| Ruta | Dueño | Otros pueden… |
|---|---|---|
| `lib/contracts/**` | P1 | proponer cambios por PR; requiere OK de los afectados |
| `prisma/**`, `lib/db.ts`, `lib/domain/**`, `lib/auth/**`, `api/_lib/auth.ts` (guardas por passcode) | P1 | solo leer |
| `api/violations/**`, `api/fines/**`, `api/portal/**` | P1 | — |
| `tests/e2e/**`, `vitest.config.ts`, `playwright.config.ts` | P1 | agregar specs de su vertical |
| `lib/vision/**`, `lib/storage/**`, `public/demo/**`, `mobile/**`, `ml/**` | P2 | — |
| `src/pages/Camaras.tsx`, `components/camaras/**`, `api/detections/**`, `api/sightings/**`, `api/cameras/**`, `api/blob/**`, `api/time.ts` | P2 | — |
| `lib/notify/**`, `lib/payments/**`, `lib/geo/**`, `lib/alerts/**` | P3 | — |
| `src/pages/{Multa,Pagar}.tsx`, `components/multa/**`, `api/payments/**`, `api/officers/**`, `api/alerts/**`, `api/webhooks/**` | P3 | P4 ajusta estilos por PR |
| `src/index.css`, `src/main.tsx`, `src/App.tsx`, `src/pages/Landing.tsx`, `tailwind` config, `vite.config.ts`, `components/ui/**`, `components/vc/**` | P4 | usar, no modificar |
| `src/pages/{Consulta,Oficial,AdminRevision}.tsx`, `components/{consulta,oficial,admin}/**`, `pitch/**`, `DESIGN.md` | P4 | — |
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
| h0–1 | Crear app Vite + React (TS estricto, Tailwind, shadcn, ESLint) y carpeta `api/` para Vercel Functions, pnpm, estructura de carpetas, `lib/contracts` con equipo, `.env.example` | h1: contratos en `main` |
| h1–4 | Prisma schema (doc 03), Neon vía Vercel Marketplace, migración, `seed.ts` v1, repo espejo + Vercel prod | h4: app desplegada con seed |
| h4–8 | `lib/domain`: `state-machine.ts`, `violations.ts` (`registerDetection` con dedup e idempotencia), `fines.ts` (montos de ejemplo, token), `audit.ts`; APIs `GET /api/violations`, `GET /api/fines/[token]` | h8: crear multa vía script/API |
| h8–12 | Integrar: reemplazar mocks por reales; `markFinePaid`; auth passcode (`api/_lib/auth.ts` (guardas por passcode), cookie firmada) | h12: E2E happy path |
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
1) Esqueleto Vite + React + TS estricto + Tailwind + Vercel Functions (`api/`) + Prisma; crea lib/contracts/index.ts exactamente con los tipos y firmas de docs/04-api.md §0 y Zod schemas de requests.
2) prisma/schema.prisma según docs/03 §2, lib/db.ts singleton, prisma/seed.ts idempotente con los datos FALSOS de docs/03 §5 (lee DEMO_PHONE_DRIVER/DEMO_PHONE_OFFICER de env).
3) lib/domain/state-machine.ts con transiciones de docs/03 §3 y AuditLog en la misma transacción; lib/domain/violations.ts con registerDetection (dedup ±60 s, idempotencyKey), lib/domain/fines.ts.
4) Vercel Functions GET /api/violations, GET /api/fines/[token] con DTOs y respuestas de docs/04.
Usa los mocks de lib/notify/mock.ts y lib/alerts/mock.ts si los reales no existen. Escribe tests Vitest para la máquina de estados y dedup. Antes de decir terminado, aplica superpowers-verification-before-completion y verifica los criterios de HU-02 en docs/01.
```

## 5. Persona 2 — Modelo de visión + app de cámara (Expo) + evidencia
> ⚠ Alcance ampliado: ajuste fino del detector, servicio `ml/`, homografía y reglas, app móvil y consola `/camaras` es el mayor riesgo del proyecto. Pendiente decidir si se divide (p. ej. P2 = `ml/` y `lib/vision`; la app `mobile/` y la consola `/camaras` pasan a otra persona).

**Tareas en orden**
| Bloque | Tarea | Entregable |
|---|---|---|
| h0–1 | Revisar `VisionResult` y el contrato `/predict` (doc 04 §8); elegir datasets de Kaggle (doc 10 §2) y revisar licencias; plan de clips demo con el teléfono para sets A (rojo, cruza, placa legible = placa de `V-99000001`), B (verde), C (placa ilegible), D (placa de `V-99000002`, con deuda); placas ficticias | h1: datasets elegidos; lista de sets y placas acordadas con P1 (seed) |
| h1–4 | Notebook de Kaggle: ajuste fino del detector de vehículos y de placas (v0); `ml/app` con `/predict` y `/health` devolviendo el contrato (salida simulada primero); app Expo v0 (`mobile/`): cámara, grabar clip, `GET /api/time`, subida a Blob; `api/blob/upload.ts` y `lib/storage/blob.ts`; spike del client upload desde Expo | h4: la app sube un clip y llama a `/api/detections` en prod |
| h4–8 | `ml/`: decodificar con PTS, ByteTrack, EasyOCR con votación, cruce de `stopLine`; `lib/vision/{ml-client.ts,rules.ts,analyze.ts}` (Zod, doble llave); `POST /api/detections` (contra mock de dominio); túnel o host del servicio; `POST /api/cameras/[id]/light` | h8: set A → `VIOLATION` |
| h8–12 | Calibración en `/camaras` (puntos, homografía, error de reproyección, carriles, `speedZone`); velocidad y contravía en `ml/`; feed en vivo (polling `/api/violations?since=`); control de semáforo simulado; progreso por pasos | h12: E2E |
| h12–14 | `POST /api/sightings`; recorte de placa; `DEMO_VISION_CACHE`; botón "Enviar set demo" | h16: set D dispara alerta |
| h14–18 | Duerme | — |
| h18–24 | Evaluar detector y OCR en el split de prueba (mAP, exactitud de placa); casos borde de la demo (C, luz que cambia, cambio de ID); pruebas sintéticas de velocidad y contravía; tests de `rules`/`analyze` y pytest de `ml/` | h24: freeze |
| h24–36 | Bugs; clips de respaldo; túnel estable; operador en la demo | h30 ensayo |
**Depende de**: `registerDetection`/`registerSighting` (P1; mock), seed de cámaras con calibración que calce con los clips (coordinar con P1 en h1–4).
**Prompt de arranque**:
```
Eres el agente de Persona 2 (modelo de visión y app de cámara) de VíaClara. Lee AGENTS.md, docs/02-arquitectura.md §5-§6, docs/04-api.md §0, §1, §8, §9, docs/05-ui.md §3.2, docs/10-ml-y-app-movil.md, docs/velocidad-y-contravia-en-fotomultas.md y docs/09 §1, §2, §5.
Solo modifica archivos de P2 (docs/09 §1). Usa lib/contracts sin cambiarlo; si necesitas un cambio, propónlo aparte.
Todo es TypeScript estricto excepto ml/ (Python). No uses Claude ni otro LLM en el pipeline de visión. Detector PREENTRENADO con ajuste fino; no entrenes desde cero.
Pasos (PRs pequeños, skill incremental-implementation):
1) ml/: servidor FastAPI con POST /predict y GET /health exactamente como docs/04 §8 (primero con salida simulada); luego el pipeline real: decodificar el clip con PTS, detector + ByteTrack, EasyOCR con votación, homografía (cv2.findHomography), cruce de stopLine, velocidad entre dos líneas métricas con interpolación del instante de cruce y regla de contravía por carril. Notebook de ajuste fino en ml/train/ para Kaggle, con split train/val/test (separado por fuente) y métricas solo sobre test; no hay video propio de validación.
2) mobile/: app Expo (TypeScript): ajustes (URL API, CAMERA_API_KEY, código de cámara), vista de cámara, botón Grabar evento (clip 3–5 s, 30 fps), GET /api/time para clockOffsetMs, subida a Blob con token de /api/blob/upload y POST /api/detections con X-Camera-Key (docs/04 §1).
3) lib/vision/{ml-client.ts,rules.ts,analyze.ts}: llamada a /predict con ML_SERVICE_URL y ML_SERVICE_TOKEN, validación Zod, luz en el instante del cruce con los LightChange, doble llave; devuelve VisionResult con clipUrl, crossing, motion y modelVersion.
4) api/blob/upload.ts, api/time.ts, api/detections.ts (maxDuration=60 en vercel.json), api/cameras/*, api/cameras/[id]/light.ts; llama analyze() y luego registerDetection() (usa lib/domain/mock si no existe).
5) src/pages/Camaras.tsx: consola con feed en vivo, semáforo simulado, calibración (homografía + error de reproyección, carriles, speedZone) y botón "Enviar set demo".
Tests Vitest de rules y analyze con respuestas ML simuladas, y pytest en ml/. Verifica HU-01 de docs/01 con superpowers-verification-before-completion.
```

## 6. Persona 3 — Notificaciones, pagos C2P simulados, oficiales y alertas
**Tareas en orden**
| Bloque | Tarea | Entregable |
|---|---|---|
| h0–1 | App de Meta con WhatsApp: número de prueba, destinatarios verificados, token permanente (`p3-plan-de-trabajo.md` §3); revisar contratos | h1: credenciales en Vercel env |
| h1–4 | `lib/notify/whatsapp.ts` (doc 04 §7), `templates.ts`, `NOTIFY_DRY_RUN`, registro en `Notification` | h4: WhatsApp real desde prod a teléfono de demo |
| h4–8 | `lib/payments/{banks.ts,c2p.ts}` simulado; `POST /api/payments/c2p` (idempotencia, nunca guardar clave); `src/pages/Multa.tsx` y `/pagar` con componentes de P4 | h8: pagar multa seed |
| h8–12 | `notifyFineIssued/PaymentConfirmed` reales; `GET`/`POST /api/webhooks/whatsapp` (verificación, firma `X-Hub-Signature-256`, estados) | h12: E2E |
| h12–14 | `lib/geo/haversine.ts`; `/api/officers/session`, `/location`, `/[id]/alerts`; `/api/alerts/[id]/ack`; `lib/alerts/dispatch.ts`; `notifyOfficerAlert` | h16: alerta llega al teléfono 2 |
| h14–18 | Tests pagos/alerts/webhook | — |
| h18–22 | Duerme | — |
| h22–24 | Stretch: respuesta "PAGAR"/"APELAR" por WhatsApp; OTP del portal (con P1) | h24: freeze |
| h24–36 | Bugs; verificar ventana 24 h; teléfono del oficial en demo | h30 ensayo |
**Depende de**: `markFinePaid` (P1; mock), componentes `components/vc` (P4; usar HTML simple hasta h8), datos de oficiales en seed (P1).
**Prompt de arranque**:
```
Eres el agente de Persona 3 (notificaciones, pagos y alertas) de VíaClara. Lee AGENTS.md, docs/p3-plan-de-trabajo.md, docs/04-api.md §0, §5, §6, §7, §9, docs/05-ui.md §3.3, §3.4, docs/08-privacidad-y-riesgos.md y docs/09 §1, §2, §6.
Solo modifica archivos de P3 (docs/09 §1).
Pasos (PRs pequeños):
1) lib/notify/whatsapp.ts: POST https://graph.facebook.com/{WHATSAPP_GRAPH_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages con Authorization: Bearer WHATSAPP_ACCESS_TOKEN, solo mensajes type text (número de prueba, ventana de 24 h); lib/notify/templates.ts con los textos de docs/04 §7; respeta NOTIFY_DRY_RUN; registra Notification. Implementa notifyFineIssued, notifyPaymentConfirmed, notifyOfficerAlert con firma de lib/contracts.
2) lib/payments/c2p.ts SIMULADO (reglas de docs/04 §5; jamás persistir ni loguear c2pKey) y api/payments/c2p.ts con idempotencia y 409 ALREADY_PAID; llama markFinePaid.
3) src/pages/Multa.tsx y src/pages/Pagar.tsx mobile-first con banner "Demo — pago simulado".
4) api/webhooks/whatsapp.ts: GET de verificación con WHATSAPP_VERIFY_TOKEN; POST con verificación HMAC-SHA256 de X-Hub-Signature-256 (WHATSAPP_APP_SECRET) sobre el body crudo, actualización de Notification por providerId.
5) lib/geo/haversine.ts, lib/alerts/dispatch.ts (algoritmo docs/04 §6) y APIs de oficiales/alertas.
Tests Vitest para c2p, haversine, dispatch y webhook. Verifica HU-03, HU-04 y HU-06 de docs/01 antes de terminar.
```

## 7. Persona 4 — UI, sistema de diseño, pantallas públicas/oficial/admin, pitch
**Tareas en orden**
| Bloque | Tarea | Entregable |
|---|---|---|
| h0–1 | Dirección de diseño (doc 05 §1), `DESIGN.md` (skill `design-md`), revisar DTOs | h1: tokens acordados |
| h1–4 | Tokens en `src/index.css`, fuentes (Public Sans, IBM Plex Mono vía `@fontsource`), shadcn tematizado, `components/vc/*` (`Placa`, `EstadoBadge`, `Evidencia`, `Monto`, `DemoBanner`, `SemaforoMini`), `layout.tsx`, landing | h4: landing en prod |
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
2) Tokens de docs/05 §2 en src/index.css y Tailwind; fuentes Public Sans e IBM Plex Mono vía @fontsource; tematizar shadcn (Button, Input, Select, Card, Badge, Table, Sheet, Dialog, Skeleton, Sonner).
3) components/vc: Placa, EstadoBadge, Evidencia, Monto (es-VE, céntimos), DemoBanner, SemaforoMini.
4) src/pages/Landing.tsx, src/pages/Consulta.tsx, src/pages/AdminRevision.tsx con fixtures tipados con los DTOs de lib/contracts; luego src/pages/Oficial.tsx con Leaflet (import dinámico) y polling de alertas.
Mobile-first a 360 px, contraste AA, foco visible, fechas en America/Caracas. Verifica criterios de docs/05 §3 con playwright-cli/browser-testing-with-devtools antes de terminar.
```

## 8. Equidad de carga
| | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| Horas enfocadas estimadas | ~26 | ~26 | ~26 | ~26 |
| Riesgo técnico | medio (integración) | alto (visión) | medio-alto (APIs externas) | bajo-medio (volumen de pantallas) |
| Rol adicional | merge captain + QA lead | operador en demo | teléfono oficial en demo | presentador + entrega |
Si alguien termina antes: P1 ↔ ayuda con tests de cualquiera; P4 ↔ ayuda con UI de `/camaras`; P2/P3 ↔ stretch de su vertical. Reequilibrar en cada checkpoint (h8, h12, h16, h24).
