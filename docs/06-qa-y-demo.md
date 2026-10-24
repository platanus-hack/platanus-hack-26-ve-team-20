# 06 — QA y demo · VíaClara

Coordinador de QA: **P1** (después de h12); cada dueño prueba su vertical.

## 1. Plan de pruebas
### Unit (Vitest)
| Módulo | Casos |
|---|---|
| `lib/contracts` `normalizePlate`, `normalizeCedula` | espacios, guiones, minúsculas, `V-12.345.678` → `V12345678` |
| `lib/vision/rules` | luz en el instante del cruce (RED/GREEN/cambio dentro del clip); amarillo = verde; cruce sin confirmar; track con cambio de ID |
| `lib/vision/analyze` | doble llave: cruce + luz roja y placa válida con confianza; confianza bajo umbral; placa con `?`; respuesta ML inválida |
| `ml/` (pytest) | homografía y error de reproyección con puntos sintéticos; velocidad con tracks sintéticos e interpolación; contravía y falsos positivos (retroceso, movimiento lateral); OCR sobre placas de prueba; `/predict` contra el contrato de `04-api.md` §8 |
| `lib/domain/state-machine` | todas las transiciones válidas; inválidas lanzan `InvalidTransitionError`; escribe AuditLog |
| `lib/domain` dedup | misma placa+cámara en 30 s → duplicate; a 90 s → nueva |
| `lib/payments/c2p` | `000000` rechaza, `111111` sin fondos, otra aprueba; nunca devuelve/loguea la clave |
| `lib/geo/haversine` | distancias conocidas (dos puntos fijos), radio |
| `lib/alerts/dispatch` | oficial más cercano; ninguno en radio; ubicación vieja ignorada; supresión 10 min |
| webhook Kapso | firma válida/inválida; lote; evento repetido |

### E2E (Playwright, `tests/e2e/`)
1. `happy-path.spec.ts` (la app móvil no se automatiza con Playwright: usa `POST /api/detections` con el set demo A o el botón de `/camaras`): login admin → `/camaras` → set demo A → ver VIOLATION → abrir link de multa → pagar con clave `123456` → ver comprobante → `/consulta` con `V-99000001` muestra PAGADA.
2. `review.spec.ts`: set C → NEEDS_REVIEW → `/admin/revision` → corregir placa → aprobar → multa creada.
3. `officer-alert.spec.ts`: oficial OF-0001 con posición demo cerca → set D → alerta visible en `/oficial` ≤ 5 s → "Recibido".
4. `portal.spec.ts`: cédula inexistente → estado vacío; 11 consultas → 429.
Correr con `NOTIFY_DRY_RUN=true` y `DEMO_VISION_CACHE=true` en CI/local para no gastar ni depender de red.

## 2. Casos borde (y comportamiento esperado)
| Caso | Esperado |
|---|---|
| Placa no legible / `null` | `NEEDS_REVIEW` (`NO_PLATE`), sin multa, evidencia guardada |
| Confianza < umbral | `NEEDS_REVIEW` (`LOW_CONFIDENCE`) |
| Luz cambia dentro del clip o cambio de ID del tracker junto a la línea | se evalúa la luz en el instante del cruce; si es ambiguo → `NEEDS_REVIEW` (`MODEL_RULE_DISAGREE`) |
| Luz amarilla en t0 | `NO_VIOLATION` (MVP solo sanciona RED) |
| Placa no registrada | `NEEDS_REVIEW` (`PLATE_NOT_FOUND`) |
| Detección duplicada (mismo evento re-subido / doble clic) | misma violación, `duplicate: true` |
| Servicio ML caído / timeout / respuesta inválida | 1 reintento → `NEEDS_REVIEW` (`ML_SERVICE_ERROR`) |
| Clip con fps < 24, con huecos o sin homografía válida | `speedKmh = null`, sin sanción de velocidad; la regla de luz roja sigue evaluándose |
| Teléfono sin GPS | se usa la ubicación de la intersección del seed |
| Multa ya pagada | 409 `ALREADY_PAID`, UI muestra comprobante |
| Doble submit de pago | mismo `idempotencyKey` → un solo `Payment` |
| Clave C2P inválida | `REJECTED` con mensaje, se puede reintentar |
| WhatsApp falla (fuera de ventana 24 h / número inválido) | intento email; `Notification.FAILED` visible en consola |
| Ningún oficial cerca | `Alert.NO_OFFICER_NEARBY` visible en consola |
| Ubicación de oficial vieja (> 10 min) | ignorada |
| Misma placa vista 3 veces en 5 min | 1 alerta, resto `SUPPRESSED` |
| Token de multa inválido | 404 amable |
| Cédula con formato raro | normaliza o mensaje de formato |
| Vehículo de emergencia / cortejo (falso positivo legítimo) | operador anula con motivo |

## 3. Checklist de demo (h30 y antes del pitch)
- [ ] Deploy de producción en Vercel accesible desde 4G (no solo wifi del evento).
- [ ] `pnpm demo:reset` corrido; seed con `DEMO_PHONE_DRIVER` y `DEMO_PHONE_OFFICER` correctos.
- [ ] Ambos teléfonos de demo enviaron "hola" al número Kapso (ventana 24 h abierta) o plantilla aprobada.
- [ ] `NOTIFY_DRY_RUN=false` en prod. `DEMO_VISION_CACHE` listo como plan B (toggle).
- [ ] Oficial OF-0001 logueado en el teléfono 2, "En servicio", posición demo cerca de CAM-001.
- [ ] Servicio ML (`ml/`) y su túnel arriba; `GET /health` responde. Teléfono-cámara (app Expo) en trípode fijo, con `CAM-001` configurada y la `CAMERA_API_KEY`; cámara calibrada (error de reproyección ≤ 0,15 m) y semáforo simulado en ROJO.
- [ ] Pestañas abiertas: `/camaras` (logueado), `/consulta`, `/admin/revision`.
- [ ] Brillo de pantallas al máximo, notificaciones de otras apps silenciadas, teléfono 1 en duplicación de pantalla o cámara de documentos.
- [ ] Video plan B (≤ 60 s) del flujo completo grabado y en el escritorio.
- [ ] `project-logo.png`, `README.md`, `project-description.md`, `platanus-hack-project.jsonc` con `deploy-url` real.

## 4. Guion de pitch (3:00)
| Tiempo | Quién | Qué se dice / hace |
|---|---|---|
| 0:00–0:20 | Presentador | Gancho: "Un carro se come la luz roja frente a una escuela. Hoy, si no hay un fiscal ahí, no pasa nada. Y si te multan, ni te enteras ni sabes por qué." Nombre: **VíaClara — la multa llega con la prueba, y se paga en un minuto.** |
| 0:20–0:35 | Presentador | Cómo funciona en 3 pasos (slide): Detecta → Notifica → Paga. Track Trust: evidencia + revisión humana + apelación. |
| 0:35–1:25 | Operador (demo en vivo) | El teléfono-cámara (app Expo, CAM-001) apunta a la maqueta/pantalla con el set "luz roja" y se pulsa **Grabar evento**; `/camaras` lo muestra en vivo. Se ve paso a paso: semáforo ROJO, placa leída, cruce de línea, multa creada. **Suena el teléfono**: WhatsApp con el link. Se muestra en pantalla. |
| 1:25–1:55 | Operador | Abre el link: evidencia con hora y luz roja; "Pagar con Pago Móvil C2P" (banner: simulado); banco, teléfono, cédula, clave → comprobante. Estado PAGADA en consola. |
| 1:55–2:15 | Operador | `/consulta` con cédula ficticia: historial, datos limitados (placa enmascarada). |
| 2:15–2:35 | Operador + teléfono 2 | Set "vehículo con deuda": la cámara lo ve → **teléfono del oficial vibra**: alerta con placa y distancia, en el mapa. |
| 2:35–2:50 | Presentador | Confianza: si la IA duda, va a revisión humana (mostrar cola 3 s); toda acción auditada; datos ficticios. Producción: detección en el borde (YOLO + ALPR) y Claude como segundo revisor; integración C2P con banco/agregador. |
| 2:50–3:00 | Presentador | Cierre: "Calles más seguras con multas justas, transparentes y fáciles de pagar. VíaClara." Stack: modelo propio entrenado con Kaggle, app Expo, Kapso, Vercel. |

Reglas del pitch: nadie lee slides; si algo falla > 5 s, pasar al video plan B sin disculpas largas; ensayar 3 veces con cronómetro (h30, h32, h34).
