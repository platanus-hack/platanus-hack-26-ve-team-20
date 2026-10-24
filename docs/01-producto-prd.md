# 01 — PRD · VíaClara

## 1. Problema
- Las infracciones de semáforo (luz roja, flecha de giro) y de velocidad dependen hoy de que un fiscal esté presente; la fiscalización es esporádica y discrecional.
- Cuando existe una multa, el ciudadano no se entera a tiempo, no ve la evidencia y pagar es engorroso (taquillas, trámites presenciales).
- El ciudadano no tiene una forma simple y transparente de consultar su historial de infracciones.
- Los vehículos con multas impagas circulan sin consecuencia porque nadie los ve "en el momento".

> No citamos cifras de accidentalidad: no tenemos fuente verificada. Si el pitch las necesita, agregarlas solo con URL oficial.

## 2. Propuesta
Cámara en semáforo → IA detecta la infracción y lee la placa → multa con evidencia (fotos, hora, lugar) → WhatsApp al dueño con link → pago en un minuto con Pago Móvil C2P → estado actualizado y visible en portal público. Si la placa con deuda reaparece, el oficial más cercano recibe una alerta.

**Principio Trust**: cada multa trae su evidencia, pasa por revisión humana si hay duda, y es apelable.

## 3. Usuarios
| Usuario | Necesidad | Pantalla |
|---|---|---|
| Conductor / propietario | Enterarse, ver evidencia, pagar o apelar | WhatsApp → `/multa/[token]` → `/multa/[token]/pagar` |
| Público / ciudadano | Consultar historial por cédula | `/consulta` |
| Oficial de tránsito | Recibir alertas de vehículos con deuda cerca | `/oficial` (móvil) + WhatsApp |
| Operador municipal | Ver detecciones en vivo, revisar dudosas, aprobar/anular | `/camaras`, `/admin/revision` |

## 4. Alcance
### MVP (debe funcionar en la demo)
1. Simulador de cámara: elegir intersección/cámara y subir 2–3 frames (o usar los de `public/demo/`).
2. Detección de **luz roja** con Claude visión + regla geométrica de línea de pare.
3. Lectura de placa y match contra registro vehicular **falso** (seed).
4. Creación de `Violation` + `Evidence` + `Fine` (si confianza ≥ umbral) o envío a revisión.
5. Notificación WhatsApp (Kapso) con link a la multa; email (Resend) como respaldo.
6. Página de multa con evidencia + pago **C2P simulado** → `PAID`.
7. Portal por cédula con datos limitados.
8. Alerta a oficial cercano cuando una placa con multa impaga es vista (avistamiento).
9. Cola de revisión humana (aprobar / anular).

### Stretch (si sobra tiempo, en este orden)
1. Infracción de **flecha de giro** (misma lógica, polígono de giro + estado de flecha).
2. **Velocidad**: dos marcas de tiempo sobre distancia conocida entre dos líneas virtuales.
3. Flujo de **apelación** desde la página de multa.
4. Respuesta por WhatsApp ("PAGAR", "APELAR") vía webhook Kapso.
5. OTP por WhatsApp para ver detalle completo en el portal.
6. Resumen de voz de la multa con ElevenLabs (accesibilidad).
7. Financiamiento de multas con Cashea / Fina (solo mención/mock).

### Fuera de alcance
- Integración bancaria real, dinero real, conexión a registros oficiales (INTT, SAIME).
- Procesamiento de video en tiempo real / RTSP desde cámaras reales.
- Validez legal de la multa, firma digital oficial.
- App nativa.

## 5. Historias de usuario y criterios de aceptación

**HU-01 Detección de luz roja (Operador)**
Como operador, subo frames de una cámara y veo si hubo infracción.
- [ ] En `/camaras` puedo elegir cámara (seed) y subir 2–3 imágenes o elegir un set demo.
- [ ] En ≤ 20 s veo: estado del semáforo, placa leída, confianza, veredicto (`VIOLATION` / `NO_VIOLATION` / `NEEDS_REVIEW`).
- [ ] Se guarda la evidencia en Blob y se ve en la consola (feed en vivo, polling ≤ 3 s).
- [ ] Si confianza < `VISION_CONFIDENCE_THRESHOLD` o sin placa → `NEEDS_REVIEW`, sin multa.

**HU-02 Multa automática (Sistema)**
- [ ] Veredicto `VIOLATION` con placa registrada crea `Fine` con monto de ejemplo, `dueAt` y `publicToken` único.
- [ ] La misma placa + cámara en ventana de 60 s no crea multa duplicada.
- [ ] Placa no registrada → `NEEDS_REVIEW` con motivo `PLATE_NOT_FOUND`.

**HU-03 Notificación (Conductor)**
- [ ] Al crear la multa, el dueño recibe WhatsApp con: tipo de infracción, lugar, fecha/hora (Caracas), monto, link `APP_BASE_URL/multa/<token>`.
- [ ] Si WhatsApp falla, se intenta email; el resultado queda en `Notification` y `AuditLog`.
- [ ] `NOTIFY_DRY_RUN=true` no envía pero registra.

**HU-04 Pago C2P simulado (Conductor)**
- [ ] `/multa/[token]` muestra evidencia (frames, recorte de placa), monto, estado, banner "Demo — pago simulado".
- [ ] Formulario: banco (lista de ejemplo), teléfono, cédula, clave C2P (6–8 dígitos).
- [ ] Clave `000000` → rechazo simulado; cualquier otra válida → aprobado con referencia.
- [ ] Al aprobar: `Fine.status=PAID`, `Violation.status=PAID`, comprobante en pantalla, WhatsApp de confirmación.
- [ ] Reintentar pago de multa pagada → mensaje "Esta multa ya fue pagada", sin cobro.

**HU-05 Portal por cédula (Público)**
- [ ] `/consulta` acepta cédula (`V-`/`E-` + número).
- [ ] Muestra lista: fecha, tipo, intersección, estado, monto; placa enmascarada (`AB***CD`), sin nombre completo ni teléfono.
- [ ] Rate limit: 10 consultas / 10 min por IP; respuesta igual para cédula inexistente ("No hay infracciones registradas").

**HU-06 Alerta a oficial (Oficial)**
- [ ] El oficial abre `/oficial`, comparte ubicación (o usa posición seed) y queda "en servicio".
- [ ] Cuando una cámara ve una placa con multa impaga (`/api/sightings` o detección), se busca el oficial en servicio más cercano dentro de `ALERT_RADIUS_METERS` (haversine).
- [ ] El oficial recibe WhatsApp + la alerta aparece en `/oficial` con: placa, modelo/color, cámara/intersección, distancia, hora, # multas impagas. Sin dirección del dueño.
- [ ] Sin oficial en radio → `Alert.status=NO_OFFICER_NEARBY`, visible en consola.
- [ ] No re-alertar la misma placa en 10 min.

**HU-07 Revisión humana (Operador)**
- [ ] `/admin/revision` lista `NEEDS_REVIEW` con evidencia y salida de la IA.
- [ ] Puedo corregir la placa, aprobar (→ crea multa y notifica) o anular (→ `VOID` con motivo).
- [ ] Cada acción escribe `AuditLog` con actor.

## 6. Métricas de éxito de la demo
- Flujo completo en vivo (frame → WhatsApp en el teléfono de un juez/compañero → pago → `PAID`) en **< 60 s**.
- 0 pasos manuales ocultos durante el pitch (todo desde la UI).
- Alerta a oficial llega a un segundo teléfono en < 10 s tras el avistamiento.
- Plan B grabado (video) por si falla la red.
