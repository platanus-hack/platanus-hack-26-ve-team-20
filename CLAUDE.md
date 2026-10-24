# AGENTS.md — VíaClara

> Guía para agentes (Claude Code, Cursor, etc.) y humanos. Léela completa antes de tocar código. `CLAUDE.md` es una copia idéntica.

## 1. Qué es
**VíaClara**: multas de tránsito automáticas, con evidencia y pagables desde el teléfono.
Cámaras en semáforos detectan una infracción (MVP: **luz roja**), se lee la placa, se crea la multa con evidencia, el conductor recibe un **WhatsApp** (Kapso) con un link y paga con **Pago Móvil C2P (SIMULADO)**. Hay un **portal público por cédula** y, si una cámara ve una placa con multas impagas, se **alerta al oficial más cercano**.

Hackathon: Platanus Hack 26 Caracas (36 h, pitch de 3 min, track Trust). Único requisito técnico: **hosting en Vercel**.

## 2. Reglas no negociables
1. **Un flujo E2E primero.** Nada de features laterales hasta que funcione: frame → detección → placa → multa → WhatsApp → pago simulado → `PAID`. (Ver `docs/01-producto-prd.md` §MVP.)
2. **Pagos SIMULADOS.** Ningún dinero real, ningún banco real. Toda pantalla de pago muestra el banner "Demo — pago simulado".
3. **Solo datos FALSOS.** Cédulas, placas, teléfonos y nombres del seed son inventados y marcados como ejemplo. Los únicos teléfonos reales permitidos son los del equipo (vía env `DEMO_PHONE_*`), nunca en el repo.
4. **Cero secretos en código.** Todo por variables de entorno (lista abajo). `.env.local` está en `.gitignore`. Mantén `.env.example` actualizado.
5. **Revisión humana**: una detección con confianza < umbral o sin placa NO genera multa; va a la cola `/admin/revision`.
6. **Contratos primero.** Tipos y esquemas Zod viven en `lib/contracts/`. Cambiarlos requiere avisar al equipo (ver `docs/09-reparto-equipo.md`).
7. **Respeta la propiedad de carpetas** (doc 09). Si necesitas tocar carpeta ajena, PR pequeño y avisa al dueño.
8. No modifiques el repo de la organización desde agentes con force-push; PRs pequeños a `main`.

## 3. Stack
- **TypeScript estricto en todo el proyecto** (frontend y backend). Sin JavaScript plano.
- Frontend: **React puro (SPA) con Vite** + React Router, desplegado en **Vercel**. Sin Next.js.
- Backend: **Vercel Functions** en `/api` (TypeScript, runtime Node).
- Tailwind CSS + shadcn/ui (tematizado, ver `docs/05-ui.md`).
- Postgres (**Neon** vía Vercel Marketplace) + **Prisma**.
- **Vercel Blob** para evidencia (imágenes de frames, recortes de placa).
- **Claude API** (`@anthropic-ai/sdk`) visión sobre frames fijos.
- **Kapso** para WhatsApp; **Resend** para email (respaldo).
- Mapas: Leaflet + OpenStreetMap (sin API key).
- Tests: Vitest (unit) + Playwright (E2E).

## 4. Comandos
```bash
pnpm install
pnpm dev                     # Vite en http://localhost:5173 (solo SPA)
vercel dev                   # SPA + funciones /api juntas (http://localhost:3000)
pnpm prisma migrate dev      # aplica schema local
pnpm prisma db seed          # datos FALSOS de ejemplo (prisma/seed.ts)
pnpm prisma studio
pnpm lint && pnpm typecheck  # typecheck = tsc --noEmit
pnpm test                    # vitest
pnpm test:e2e                # playwright (requiere dev server)
vercel --prod                # o deploy automático desde el repo espejo personal
```

## 5. Estructura del repo (objetivo)
```
src/                                # SPA React + Vite (todo cliente)
  main.tsx, App.tsx                 # entrada y rutas (React Router) (P4)
  index.css                         # tokens Tailwind (P4)
  pages/
    Landing.tsx                     # /            landing pública (P4)
    Consulta.tsx                    # /consulta    portal por cédula (P4)
    Multa.tsx                       # /multa/:token       aterrizaje de multa (P3)
    Pagar.tsx                       # /multa/:token/pagar pago C2P simulado (P3)
    Camaras.tsx                     # /camaras     simulador de cámara + consola operador (P2)
    Oficial.tsx                     # /oficial     vista móvil del oficial (P4 UI, datos P3)
    AdminRevision.tsx               # /admin/revision cola de revisión humana (P4 UI, API P1)
  hooks/, lib/api-client.ts         # fetch tipado a /api con los contratos
api/                                # Vercel Functions (TypeScript, Node)
  detections.ts                     # POST analizar frames (P2)
  sightings.ts                      # POST placa vista (P2 → lib/alerts de P3)
  violations/index.ts               # GET lista (P1)
  violations/[id]/review.ts         # POST aprobar/rechazar (P1)
  fines/[token].ts                  # GET multa pública (P1)
  portal/lookup.ts                  # POST consulta por cédula (P1)
  payments/c2p.ts                   # POST pago simulado (P3)
  officers/location.ts              # POST ubicación oficial (P3)
  officers/[id]/alerts.ts           # GET alertas (P3)
  alerts/[id]/ack.ts                # POST acuse (P3)
  webhooks/kapso.ts                 # POST eventos Kapso (P3)
  blob/upload.ts                    # token client-upload Vercel Blob (P2)
lib/
  contracts/        # tipos + Zod compartidos (P1 dueño, todos revisan)
  db.ts             # Prisma client singleton (P1)
  domain/           # máquina de estados, multas, auditoría (P1)
  vision/           # prompt Claude, geometría, pipeline (P2)
  storage/          # Vercel Blob (P2)
  notify/           # kapso.ts, email.ts, templates.ts (P3)
  payments/         # c2p.ts simulado (P3)
  geo/              # haversine, oficial más cercano (P3)
  alerts/           # creación/despacho de alertas (P3)
components/ui/      # shadcn tematizado (P4)
components/<feature>/  # componentes de cada vertical (dueño de la vertical)
prisma/schema.prisma, prisma/seed.ts   # (P1)
public/demo/        # frames de ejemplo para el simulador (P2)
tests/              # e2e Playwright (P1 coordina QA)
docs/               # esta documentación
```

## 6. Convenciones
- TS estricto, sin `any`. Validación con **Zod** en todo borde (funciones de `/api`, webhooks, salida de Claude).
- Las funciones de `/api` devuelven `{ ok: true, data }` o `{ ok: false, error: { code, message } }`.
- Dinero en **céntimos enteros** (`amountCents`) + `currency` ("VES" o "USD" de ejemplo). Nunca float.
- Fechas en UTC en DB; mostrar en `America/Caracas`.
- Placas normalizadas: mayúsculas, sin espacios/guiones (`normalizePlate()` en `lib/contracts`).
- Todo el frontend es cliente (SPA): datos vía `fetch` a `/api` con los tipos de `lib/contracts`. Sin Server Components ni `"use client"`.
- Lógica de servidor solo en `api/` y `lib/`: `src/` solo importa `lib/contracts`, nunca `lib/db`, `lib/vision`, etc.
- Todo cambio de estado de dominio pasa por `lib/domain/state-machine.ts` y escribe `AuditLog`.
- Copys de UI en español (Venezuela), tuteo neutro-formal ("usted" en notificaciones oficiales).
- Commits: Conventional Commits (`feat(vision): ...`). Ramas `p1/...`, `p2/...`, etc.

## 7. Variables de entorno
| Variable | Uso | Dueño |
|---|---|---|
| `DATABASE_URL` | Postgres Neon (pooled) | P1 |
| `DIRECT_URL` | Neon directo para migraciones | P1 |
| `ANTHROPIC_API_KEY` | Claude visión | P2 |
| `ANTHROPIC_MODEL` | modelo con visión (configurable) | P2 |
| `VISION_CONFIDENCE_THRESHOLD` | p.ej. `0.8` | P2 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | P2 |
| `KAPSO_API_KEY` | Kapso | P3 |
| `KAPSO_PHONE_NUMBER_ID` | número WhatsApp emisor | P3 |
| `KAPSO_WEBHOOK_SECRET` | verificar `X-Webhook-Signature` | P3 |
| `KAPSO_TEMPLATE_FINE` | nombre de plantilla aprobada (opcional) | P3 |
| `RESEND_API_KEY`, `EMAIL_FROM` | email respaldo | P3 |
| `APP_BASE_URL` | p.ej. `https://<pendiente>.vercel.app` | P1 |
| `ADMIN_PASSCODE` | acceso simple a `/admin` y `/camaras` | P1 |
| `OFFICER_PASSCODE` | acceso simple a `/oficial` | P3 |
| `DEMO_PHONE_DRIVER`, `DEMO_PHONE_OFFICER` | teléfonos reales del equipo para la demo | P3 |
| `ALERT_RADIUS_METERS` | p.ej. `1500` | P3 |
| `NOTIFY_DRY_RUN` | `true` = no envía, solo registra | P3 |

## 8. Qué leer para qué
| Necesito… | Leer |
|---|---|
| Índice | `docs/00-indice.md` |
| Alcance, historias, criterios | `docs/01-producto-prd.md` |
| Componentes, diagramas, límites Vercel | `docs/02-arquitectura.md` |
| Prisma, estados, seed | `docs/03-modelo-de-datos.md` |
| Endpoints, webhooks, prompt Claude | `docs/04-api.md` |
| Pantallas, tokens de diseño | `docs/05-ui.md` |
| Tests, demo, guion del pitch | `docs/06-qa-y-demo.md` |
| Plan por horas | `docs/07-plan-36h.md` |
| Privacidad y riesgos | `docs/08-privacidad-y-riesgos.md` |
| Quién hace qué, ramas, prompts de arranque | `docs/09-reparto-equipo.md` |

## 9. Skills (`.claude/skills`)
Úsalas; no reinventes procesos:
- **Definir/acotar**: `shape`, `grilling`, `scoping-features`, `idea-refine`, `planning-and-task-breakdown`.
- **Diseño/UI**: `design-md`, `frontend-ui-engineering`, `minimalist-ui`, `web-design-guidelines`, `vercel-react-best-practices`.
- **Construir**: `incremental-implementation`, `api-and-interface-design`.
- **Verificar**: `superpowers-verification-before-completion` (antes de decir "listo"), `playwright-cli`, `browser-testing-with-devtools`, `bug-hunt`, `code-review-and-quality`, `security-audit`.
- **Entregar**: `deploy-to-vercel`, `deliver`, `ship`, `planning-git-commits`.
- **Pitch**: `creating-html-presentations`.

Regla: antes de declarar una tarea terminada, corre `superpowers-verification-before-completion` y verifica los criterios de aceptación del doc correspondiente.

## 10. Definition of Done (cualquier tarea)
- Cumple criterios de aceptación del doc.
- `pnpm lint && pnpm typecheck && pnpm test` en verde.
- Probado en el deploy de Vercel (preview o prod), no solo local.
- Sin secretos, sin datos reales, `AuditLog` escrito si cambia estado.
