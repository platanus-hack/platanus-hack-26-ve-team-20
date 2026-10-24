# 07 — Plan 36 h · VíaClara

Equipo de 4 en paralelo. Detalle completo de cada persona (archivos, contratos, prompts de arranque): **`09-reparto-equipo.md`**.
Horas relativas al inicio del hack (h0). Ajustar a la hora real de inicio.

## 1. Roles
| Persona | Vertical | Rol funcional (Producto / Código / UI / QA) |
|---|---|---|
| **P1** | Backend core: Prisma, seed, dominio y máquina de estados, APIs de violaciones/multas/portal, auth simple, integración | Código (lead integrador) + QA (lead desde h12) |
| **P2** | Visión: detector preentrenado con ajuste fino (Kaggle, Python), servicio de inferencia, app móvil Expo (cámara), homografía y reglas, evidencia, avistamientos | Código + ML (alcance ampliado, ver doc 09 §5) |
| **P3** | Notificaciones y pagos: WhatsApp Cloud API de Meta (línea propia), Resend, C2P simulado, oficiales, alertas por proximidad | Código |
| **P4** | Frontend/UI: sistema de diseño, landing, portal cédula, vista oficial, cola de revisión, pitch y demo | UI + Producto (dueño del pitch) |

## 2. Checkpoints de integración (todo el equipo)
| Hora | Checkpoint | Criterio "hecho" |
|---|---|---|
| **h1** | Contratos congelados | `lib/contracts/index.ts` mergeado con tipos y firmas (doc 04 §0); mocks por módulo acordados; env vars repartidas |
| **h4** | Esqueleto en Vercel | Vite/React + Tailwind + shadcn + Prisma/Neon + seed corriendo en prod; todas las rutas y funciones `/api` existen (placeholder); repo espejo y Vercel conectados |
| **h8** | Verticales con mocks | Cada vertical funciona aislada contra mocks: P2 analiza clips reales del teléfono, P3 envía WhatsApp real, P1 crea multas por API, P4 pantallas con datos seed |
| **h12** | **E2E happy path** | frame demo A → multa → WhatsApp real → pago simulado → PAID, en prod |
| h16 | Flujos secundarios | Revisión humana + portal cédula + alerta a oficial funcionando en prod |
| h14–h22 | Sueño escalonado | Siempre 2 personas despiertas (ver tabla) |
| **h24** | **Feature freeze** | Solo bugs, pulido UI, copy, demo. Stretch solo si todo lo anterior está verde |
| h27 | Video plan B grabado | ≤ 60 s del flujo completo |
| **h30** | **Ensayo de demo 1** | Pitch completo cronometrado con datos reales del deploy; lista de fallos |
| h32 | Ensayo 2 + archivos de entrega | jsonc con deploy-url real, README, descripción, logo |
| h34 | Ensayo 3, congelar deploy | No más merges a `main` salvo bloqueantes |
| h36 | Entrega | — |

## 3. Plan por persona y bloque
| Bloque | P1 Backend core | P2 Visión | P3 Notif. y pagos | P4 UI + pitch |
|---|---|---|---|---|
| h0–1 | Repo, base Vite/React/TS, contratos (con todos), `.env.example` | Revisar contratos `VisionResult` y `/predict`; elegir datasets de Kaggle; grabar clips demo con el teléfono | App de Meta con WhatsApp, número de prueba, token permanente, plantillas a revisión, arrancar línea propia; revisar contratos notify/pay | Dirección de diseño, tokens, revisar contratos de pantallas |
| h1–4 | Prisma schema, Neon, migración, seed v1, deploy Vercel + espejo | Ajuste fino v0 del detector (notebook de Kaggle); app Expo v0 (grabar clip y subirlo); `/api/blob/upload`; `/camaras` básico (ver feed) | `lib/notify/whatsapp.ts` enviando mensaje real; `templates.ts` | shadcn tematizado, `components/vc/*`, layout, landing |
| h4–8 | `lib/domain` (state machine, registerDetection, dedup, fines, audit); `/api/violations`, `/api/fines/[token]` | Servicio `ml/` `/predict` v0; `lib/vision/ml-client.ts` + Zod; `rules.ts`; `/api/detections` contra mock de dominio | `lib/payments/c2p.ts` + `/api/payments/c2p`; páginas `/multa/[token]` y `/pagar` | `/consulta` y `/admin/revision` con mocks; `<Evidencia>`, `<Placa>` |
| h8–12 | Integrar P2→dominio→P3; auth passcode; `markFinePaid` | Modelo v1 (placa, tracking, homografía y velocidad); semáforo simulado; sets demo A/B/C/D calibrados; feed en vivo en consola | Webhook de WhatsApp (verificación y estados); email Resend; integrar pago con dominio | Pulir pantallas de multa/pago (con P3); estado de pasos en consola (con P2) |
| **h12** | **E2E happy path (todos)** | | | |
| h12–16 | `/api/portal/lookup` + rate limit; `/api/violations/[id]/review`; tests E2E happy path | `/api/sightings`; recorte de placa; caché de visión (plan B); túnel estable del servicio ML | Oficiales: sesión, ubicación, `lib/geo`, `lib/alerts/dispatch`, `/api/officers/*` | `/oficial` (mapa Leaflet, alertas, toggle servicio); conectar portal y revisión a APIs reales |
| h14–18 | trabaja | **duerme** | trabaja | **duerme** |
| h16–18 | Tests unit dominio; `demo:reset` | — | Tests alerts/pagos; WhatsApp al oficial | — |
| h18–22 | **duerme** | Pulido modelo/OCR, casos borde (C), contravía | **duerme** | Pitch deck (HTML), accesibilidad, responsive |
| h22–24 | E2E de revisión y portal; revisar logs prod | Stretch multa por velocidad/contravía (si verde) | Stretch respuesta WhatsApp "PAGAR"; OTP portal | Slides con capturas reales |
| **h24** | **Feature freeze** | | | |
| h24–30 | Bug bash + QA lead; seguridad (`security-audit`) | Bugs visión; preparar frames de respaldo | Bugs notificaciones; verificar ventana 24 h y teléfonos | Video plan B (h27), pulido final de UI, copy |
| h30–34 | Ensayos; congelar `main` | Operador en demo | Teléfono del oficial en demo | Presentador; archivos de entrega |
| h34–36 | Deploy final verificado | Respaldo | Respaldo | Entrega en plataforma |

## 4. Orden de prioridad si vamos atrasados
1. Happy path (h12) — sin esto no hay demo.
2. Alerta a oficial (es el "wow" #2).
3. Portal cédula.
4. Revisión humana (mínimo: lista + aprobar).
5. Todo lo demás (stretch).

Recortes permitidos: email (dejar solo WhatsApp), edición de calibración en UI (dejar seed), mapa (dejar lista con distancia), apelación.

## 5. Carga estimada (horas de trabajo enfocado)
| Persona | Horas | Comentario |
|---|---|---|
| P1 | ~26 h | Más carga temprana (infra) y QA tardío |
| P2 | ~26 h | Riesgo técnico más alto (ajuste fino + homografía + app móvil); tiene caché como red |
| P3 | ~26 h | Más integraciones externas (WhatsApp con Meta directo, Resend) |
| P4 | ~26 h | UI de 4 pantallas + pitch + video |
Cada persona: ~4 h sueño + ~6 h comidas/pausas/ensayos.
