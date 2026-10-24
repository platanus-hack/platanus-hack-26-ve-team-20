# 11 — P1: features y entregables · VíaClara

Cómo se trabaja: **una feature = un entregable = un commit**. Al terminar cada una se corre la verificación, se hace el commit y se **para** hasta el visto bueno. Rama `daniel-morillo`; no se mezcla trabajo de dos features en un commit. Fuente: `docs/09` §4, `docs/07`, `docs/03`, `docs/04` y los criterios HU-02/05/07 de `docs/01`.

Verificación común a todas (`docs/AGENTS.md` §10): `pnpm lint && pnpm typecheck && pnpm test` en verde, sin secretos ni datos reales y `AuditLog` escrito donde cambie un estado.

## Mapa
| # | Feature | Entregable | Plan |
|---|---|---|---|
| F1 | Esqueleto web + API | `pnpm dev`/`build` funcionan; rutas placeholder; `/api/health` | h0–1 |
| F2 | Contratos y helpers de API | `lib/contracts` completo con tests; respuestas `{ ok, data }` | h0–1 |
| F3 | Primer deploy en Vercel | URL pública con SPA y `/api/health`; espejo sincronizado | h1–4 |
| F4 | Esquema de datos | Prisma schema + `lib/db.ts` + migración aplicada | h1–4 |
| F5 | Seed con datos falsos | `pnpm prisma db seed` idempotente + `pnpm demo:reset` | h1–4 |
| F6 | Máquina de estados + auditoría | `transition()` con `AuditLog` transaccional | h4–8 |
| F7 | Multas y `registerDetection` | Detección → `Violation` + `Fine` o `NEEDS_REVIEW`, con dedup | h4–8 |
| F8 | Avistamientos y pago | `registerSighting` y `markFinePaid` | h4–8 |
| F9 | Login de admin y guardas de sesión | Login con `AdminUser`, cookie firmada y guardas `admin` / `camera` / `officer` | h8–12 |
| F10 | API de lectura | `GET /api/violations` y `GET /api/fines/[token]` | h4–8 |
| F11 | Portal por cédula | `POST /api/portal/lookup` con rate limit | h12–14 |
| F12 | Revisión humana | `POST /api/violations/[id]/review` | h12–14 |
| F13 | Integración | Mocks reemplazados por módulos reales de P2/P3; happy path | h8–12 |
| F14 | QA y cierre | E2E Playwright, `demo:reset`, auditoría de seguridad | h14–36 |

Orden de ejecución: F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F10 → F9 → F11 → F12 → F13 → F14. F9 va después de F10 para que F10 nazca sin auth y F9 la añada de forma transversal; si prefieres auth primero, se invierten.

---

## F1 — Esqueleto web + API
**Objetivo**: base del repo sobre la que trabajan los cuatro roles.
**Alcance**: Vite + React 19 + TypeScript estricto (`strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`), Tailwind 4, React Router con las 7 rutas como placeholders, `api/health.ts` (Vercel Function), `vercel.json` (rewrite de SPA), Vitest, `oxlint`, `.gitignore` (incluye `.env.local` y `*:Zone.Identifier`), tres `tsconfig` (app, node, server).
**Fuera de alcance**: shadcn/ui y tema (P4), Prisma (F4), contratos (F2).
**Criterios de aceptación**
- [ ] `pnpm install && pnpm dev` abre la SPA; las 7 rutas resuelven.
- [ ] `pnpm build` y `pnpm typecheck` pasan sin errores; `pnpm lint` sin warnings propios.
- [ ] `GET /api/health` responde `{ ok: true, data }` (`vercel dev`).
- [ ] `.env.example` coincide con las variables de `AGENTS.md` §7.
**Verificación**: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
**Commit**: `feat(skeleton): vite react ts tailwind and vercel functions base`

## F2 — Contratos y helpers de API
**Objetivo**: un único lugar para tipos y esquemas que todos importan.
**Alcance**: `lib/contracts/{common,vision,dtos,requests,modules,index}.ts` según `docs/04` §0–§6 (enums, `VisionResult`, DTOs, esquemas Zod de requests, firmas entre módulos, `normalizePlate`, `normalizeCedula`, `maskPlate`, `maskCedula`); `api/_lib/respond.ts` (`sendOk`, `sendError`, `ApiError`, `handler`); `tests/unit/contracts.test.ts`.
**Criterios de aceptación**
- [ ] Los tipos de `docs/04` §0 existen sin cambios de nombre ni de forma, salvo los acordados (`Crossing`, `MotionEstimate`, `clipUrl`).
- [ ] `src/` solo puede importar `@contracts`; `tsconfig.app.json` no incluye otro código de servidor.
- [ ] Tests: normalización, máscaras, placa plausible y esquemas (`C2P`, `PortalLookup`, `Review`, `Detection`).
- [ ] `api/health.ts` pasa a usar `handler`/`sendOk`.
**Aviso al equipo al mergear**: P2 y P3 importan estos contratos; cualquier cambio posterior sigue `docs/09` §2.
**Commit**: `feat(contracts): shared types, zod schemas and api helpers`

## F3 — Primer deploy en Vercel
**Objetivo**: confirmar pronto que el stack despliega (requisito de Platanus) y que las funciones aceptan imports `.ts`.
**Acciones tuyas**: crear el proyecto en Vercel desde el repo espejo personal y confirmar el doble push (`docs/09` §3).
**Alcance**: ajustes de `vercel.json` si hace falta, `APP_BASE_URL` documentado, nota en `AGENTS.md` con la URL real.
**Criterios de aceptación**
- [ ] La URL de producción sirve la SPA y las rutas profundas (`/multa/abc`) no dan 404.
- [ ] `GET <url>/api/health` responde `{ ok: true }`.
- [ ] Un push a `main` del espejo dispara deploy.
**Riesgo a cerrar**: imports relativos con `.ts` en Vercel Functions con `"type": "module"`. Si fallan, se cambia la convención en esta feature.
**Commit**: `chore(deploy): vercel config and production url`

## F4 — Esquema de datos
**Alcance**: `prisma/schema.prisma` según `docs/03` §2 (con `Camera` de homografía/carriles y `LightChange`), `lib/db.ts` (singleton), `prisma.config`/generador según la versión instalada, migración inicial.
**Acciones tuyas**: crear el proyecto de Supabase y pasar `DATABASE_URL` (pooler en modo transacción, puerto 6543, `?pgbouncer=true`) y `DIRECT_URL` (conexión directa, puerto 5432) por variables de entorno; nunca en el repo.
**Criterios de aceptación**
- [ ] `pnpm prisma migrate dev` crea todas las tablas de `docs/03`.
- [ ] `lib/db.ts` no abre conexiones nuevas en recarga (singleton).
- [ ] Los enums de Prisma coinciden con los de `lib/contracts/common.ts` (test que los compara).
- [ ] Todas las tablas tienen **RLS activado sin políticas** (la migración lo hace): Supabase expone por defecto una API REST sobre `public` y no usamos `supabase-js`; Prisma conecta como `postgres` y no se ve afectado.
**Commit**: `feat(db): prisma schema and client`

## F5 — Seed con datos falsos
**Alcance**: `prisma/seed.ts` con la tabla de `docs/03` §5 (3 intersecciones, 4 cámaras con calibración de ejemplo, 8 personas `V-99000001..8`, 10 vehículos, 12 violaciones/multas, 3 oficiales y 3 ubicaciones); lee `DEMO_PHONE_DRIVER` y `DEMO_PHONE_OFFICER` solo de env; `pnpm demo:reset`.
**Criterios de aceptación**
- [ ] Correrlo dos veces no duplica filas (`upsert`).
- [ ] `V-99000001` tiene la placa de los clips demo y ninguna multa; `V-99000002` tiene 2 multas impagas.
- [ ] Ningún teléfono ni dato real en el repo; todo marcado como ejemplo.
- [ ] `pnpm demo:reset` borra lo creado hoy y vuelve a sembrar.
**Commit**: `feat(db): idempotent fake-data seed and demo reset`

## F6 — Máquina de estados + auditoría
**Alcance**: `lib/domain/state-machine.ts` con `VIOLATION_TRANSITIONS`, `InvalidTransitionError` y `transition(violation, to, actor)`; `lib/domain/audit.ts`; sincronización de `Fine.status` (`PENDING` / `PAID` / `APPEALED` / `VOID`, `OVERDUE` calculado).
**Criterios de aceptación**
- [ ] Todas las transiciones válidas de `docs/03` §3 pasan; las inválidas lanzan `InvalidTransitionError`.
- [ ] Cada transición escribe `AuditLog` (actor, antes, después) en la **misma transacción**; si falla la auditoría, no cambia el estado.
- [ ] Tests unitarios de la tabla de transiciones; tests contra BD para la transacción.
**Commit**: `feat(domain): violation state machine with audit log`

## F7 — Multas y `registerDetection`
**Alcance**: `lib/domain/fines.ts` (`FINE_AMOUNTS_EXAMPLE`, token `nanoid(24)`, `dueAt` +30 días), `lib/domain/violations.ts` con `registerDetection`, y mocks `lib/notify/mock.ts` y `lib/alerts/mock.ts` con la firma de `lib/contracts/modules.ts`.
**Criterios de aceptación (HU-02)**
- [ ] `VIOLATION` con placa registrada y confianza ≥ `VISION_CONFIDENCE_THRESHOLD` crea `Violation` + `Evidence` + `Fine` (monto de ejemplo, `dueAt`, `publicToken` único) y pasa a `FINED` → `NOTIFIED` vía el mock.
- [ ] Placa no registrada → `NEEDS_REVIEW` (`PLATE_NOT_FOUND`); confianza baja o sin placa → `NEEDS_REVIEW`; `NEEDS_REVIEW`/`NO_VIOLATION` del modelo se respetan.
- [ ] Misma placa + cámara + tipo en < 60 s → no crea otra multa (`duplicate: true`); misma `idempotencyKey` → mismo resultado.
- [ ] Tests: dedup a 30 s y a 90 s, idempotencia, rutas de decisión.
**Commit**: `feat(domain): fines and registerDetection with dedup`

## F8 — Avistamientos y pago
**Alcance**: `registerSighting` (busca vehículo, cuenta multas `PENDING`, crea `Sighting`) y `markFinePaid` (`Fine` y `Violation` a `PAID` con auditoría, idempotente).
**Criterios de aceptación**
- [ ] `registerSighting` devuelve `unpaidCount` correcto (incluye vencidas) y no falla con placa desconocida.
- [ ] `markFinePaid` sobre una multa ya pagada lanza `ALREADY_PAID`; sobre pendiente deja ambos en `PAID` y escribe `AuditLog`.
**Commit**: `feat(domain): sightings and markFinePaid`

## F10 — API de lectura
**Alcance**: `GET /api/violations?status&since&limit` (→ `ViolationListDTO`, `nextSince`) y `GET /api/fines/[token]` (→ `FinePublicDTO`), con mappers a DTO, placa enmascarada y sin cédula ni teléfono.
**Criterios de aceptación**
- [ ] Respuestas con la forma exacta de `docs/04` §2 y §3; query validada con Zod.
- [ ] Token inexistente → 404 `NOT_FOUND`; `overdue` calculado.
- [ ] Ningún campo personal en la multa pública (test que lo comprueba).
**Commit**: `feat(api): violations list and public fine`

## F9 — Login de admin y guardas de sesión
**Decisión (del equipo)**: el acceso de admin/operador es un **login** con cuentas en la base (`AdminUser`, hash scrypt), no un passcode compartido. El oficial sigue con `OFFICER_PASSCODE` + placa (P3) y la app móvil con `X-Camera-Key`.
**Alcance**: modelo `AdminUser` + migración con RLS; `lib/auth/{password,session}.ts` (scrypt y cookie HMAC); `api/auth/{login,logout,me}.ts`; guardas `requireAdmin`, `requireCamera`, `requireCameraOrAdmin`, `requireOfficer` y `issueOfficerSession` en `api/_lib/auth.ts`; límite de intentos con `AuditLog`; `ensureAdmin` en el seed (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
**Criterios de aceptación**
- [x] Sin sesión válida → 401 `UNAUTHORIZED`; con credenciales correctas se emite la cookie `HttpOnly; SameSite=Lax` (+ `Secure` en Vercel), firmada con `SESSION_SECRET`.
- [x] Correo inexistente, contraseña errónea y cuenta desactivada dan exactamente el mismo 401, sin diferencia observable de tiempo (hash falso).
- [x] 5 fallos por correo o 10 por IP en 10 min → 429, aun con la contraseña correcta; los fallos se auditan sin guardar correo ni contraseña.
- [x] Desactivar la cuenta o cambiar la contraseña cierra las sesiones abiertas; las sesiones caducan a las 8 h.
- [x] Falla cerrada: sin `SESSION_SECRET` (o < 32 caracteres) o sin `CAMERA_API_KEY` nadie entra.
- [x] La contraseña nunca se guarda ni se loguea en claro; solo el hash.
- [x] Probado empaquetado como función de Vercel (`vercel build`) contra la base real.
**Commit**: `feat(auth): admin login with signed sessions and guards`

## F11 — Portal por cédula
**Alcance**: `POST /api/portal/lookup` con normalización, respuesta de forma idéntica exista o no la cédula, rate limit 10/10 min/IP y `AuditLog(PORTAL_LOOKUP, ip)`.
**Criterios de aceptación (HU-05)**
- [ ] `v-99.000.001` equivale a `V99000001`; placa enmascarada, sin nombre completo ni teléfono; `fineToken` = `null`.
- [ ] Cédula inexistente → misma forma y "sin infracciones".
- [ ] La consulta 11 en 10 min → 429 `RATE_LIMITED`.
**Commit**: `feat(api): portal lookup with rate limit and audit`

## F12 — Revisión humana
**Alcance**: `POST /api/violations/[id]/review` (`APPROVE` con corrección de placa opcional → `REVIEWED` → `FINED` → `NOTIFIED`; `VOID` con motivo).
**Criterios de aceptación (HU-07)**
- [ ] `APPROVE` crea la multa y notifica (mock); la placa corregida se normaliza y se busca el vehículo.
- [ ] Transición inválida → 409 `INVALID_TRANSITION`; cada acción escribe `AuditLog` con actor.
**Commit**: `feat(api): violation review approve and void`

## F13 — Integración
**Alcance**: reemplazar `lib/notify/mock.ts` y `lib/alerts/mock.ts` por los módulos de P3 y conectar `api/detections.ts` de P2 con `registerDetection`; script de camino feliz.
**Depende de**: P2 y P3. Se define el alcance exacto al llegar.
**Criterios de aceptación**: clip demo A → multa → WhatsApp real → pago simulado → `PAID` en producción.
**Commit**: `feat(integration): replace mocks with real modules`

## F14 — QA y cierre
**Alcance**: Playwright (`happy-path`, `review`, `officer-alert`, `portal`), `pnpm demo:reset`, `security-audit`, revisión de logs de Vercel, deploy final.
**Criterios de aceptación**: los 4 E2E de `docs/06` en verde; sin hallazgos críticos de seguridad.
**Commit**: uno por bloque (`test(e2e): ...`, `fix(security): ...`).

---

## Decisiones tomadas
1. **shadcn/ui**: lo inicializa P4 (posee `src/components/ui` e `index.css`); P1 no lo instala.
2. **Base de datos**: Supabase (Postgres) con Prisma, **un solo proyecto** para desarrollo y producción. Consecuencia: `pnpm demo:reset` y las migraciones tocan la base de la demo; hay que ejecutarlos con cuidado y nunca borrar datos fuera del rango "creado hoy".
3. **Linter**: `oxlint` (viene con Vite); `docs/09` ya no menciona ESLint.
4. **Componentes**: `src/components/**` (no en la raíz); actualizado en `AGENTS.md`, `docs/05` y `docs/09`.
5. **Orden**: F10 (lectura) antes que F9 (auth).
