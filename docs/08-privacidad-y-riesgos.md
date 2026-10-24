# 08 — Privacidad, legalidad, ética y riesgos · VíaClara

> Este proyecto es un prototipo de hackathon. No tiene validez legal ni conexión con organismos oficiales. Todo dato es ficticio.

## 1. Datos y principios
- **Solo datos falsos**: cédulas `V-99000001…`, placas inventadas, teléfonos `58412000000X`, nombres "Persona Ejemplo N". Nunca cargar cédulas, placas o fotos de personas reales. Los frames demo usan placas ficticias (editadas o generadas) y no muestran rostros identificables (difuminar si aparecen).
- **Minimización**: guardar solo lo necesario para la multa (frames del evento, placa, hora, cámara). Sin reconocimiento facial, sin perfiles de movimiento.
- **Retención (propuesta producción)**: avistamientos sin infracción se borran a las 24–72 h; evidencia de multas pagadas/anuladas según norma aplicable.
- **Secretos** solo en env vars de Vercel; la clave C2P **nunca** se guarda ni se loguea.

## 2. Portal por cédula (exposición de datos personales)
Riesgo: cualquiera que conozca una cédula puede ver historial de otra persona.
Mitigaciones (MVP marcado ✔, stretch ◻):
- ✔ Información limitada: fecha, tipo, intersección, estado, monto; placa enmascarada `AB***CD`; cédula enmascarada; **sin** nombre, teléfono, dirección ni fotos.
- ✔ Respuesta idéntica para cédula inexistente y sin multas (evita enumeración).
- ✔ Rate limit por IP (10/10 min) + `AuditLog(PORTAL_LOOKUP)`.
- ◻ Captcha (p.ej. Turnstile) tras N intentos.
- ◻ OTP al teléfono del titular (WhatsApp) para ver evidencia y pagar desde el portal.
- La evidencia completa solo se ve con el `publicToken` enviado al dueño.

## 3. Alertas a oficiales
- La alerta indica **dónde fue visto el vehículo (cámara)** y la distancia del oficial a esa cámara; no rastrea al ciudadano ni muestra su domicilio, nombre o cédula.
- Solo oficiales "en servicio" con passcode; su ubicación se usa solo para calcular cercanía y se descarta después de un tiempo (propuesta: 24 h).
- Supresión anti-acoso: misma placa máx. 1 alerta cada 10 min.
- Texto de alerta incluye "Verifique antes de actuar": la alerta es informativa, no una orden de detención.
- Todo queda en `AuditLog` (quién recibió, cuándo, acuse).

## 4. Debido proceso y errores (Trust)
- **Revisión humana** obligatoria para casos dudosos (confianza baja, placa dudosa, discrepancia IA/regla, placa no registrada).
- **Doble llave**: IA + regla geométrica deben coincidir para multa automática.
- Propuesta producción: toda multa revisada por un funcionario antes de ser firme; en el MVP la multa automática se rotula "Verificado automáticamente".
- **Apelación** (stretch en MVP, obligatoria en producción): botón en la página de multa; estado `APPEALED` congela el cobro.
- Excepciones legítimas: vehículos de emergencia, desvíos ordenados por un fiscal, falla de semáforo → anulación con motivo.
- Placas clonadas/robadas: la evidencia (modelo, color) se muestra para que el dueño pueda disputar.
- Sesgos/errores de OCR: medir tasa de falsos positivos con set de prueba propio antes de cualquier piloto.

## 5. Marco legal (pendiente de validar)
- La base legal de infracciones, montos y procedimiento en Venezuela (Ley de Transporte Terrestre y reglamentos/ordenanzas municipales) **no fue verificada** para este documento; no se citan artículos ni montos. Los montos del sistema son **de ejemplo**.
- Un piloto real requeriría: convenio con alcaldía/autoridad de tránsito, acceso autorizado al registro vehicular, homologación de cámaras, protocolo de notificación válido, y cumplimiento de protección de datos personales.
- Pagos reales requerirían convenio con banco/agregador para C2P y conciliación.

## 6. Riesgos técnicos del hackathon
| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| El modelo lee mal la placa, o el tracker cambia de ID, o la velocidad sale imprecisa | Alta | Alto | Ajuste fino en datasets de Kaggle con split train/val/test, clips demo controlados, doble llave, revisión humana, velocidad solo como estimación, `DEMO_VISION_CACHE` como plan B |
| WhatsApp no llega (ventana 24 h cerrada / número no verificado) | Media | Alto | Teléfonos de demo escriben "hola" antes de cada prueba y del pitch; solo números verificados en el número de prueba; mostrar estado en consola |
| Wifi del evento caído | Media | Alto | Hotspot 4G; video plan B |
| Límite 4.5 MB / timeout en Vercel | Baja | Medio | Clip por client upload a Blob; `maxDuration=60`; clip corto (3–5 s) |
| Conflictos de git entre 4 personas | Media | Medio | Propiedad de carpetas (doc 09), PRs pequeños, merge captain |
| Repo espejo desincronizado | Media | Medio | P1 hace `git pull && git push` tras cada merge |
| Servicio ML caído o túnel inestable | Media | Alto | Host/túnel estable con `GET /health`, 1 reintento → `NEEDS_REVIEW`, caché de demo |
| Licencia/uso de datasets y pesos | Media | Medio | Revisar licencias de Kaggle; Ultralytics es AGPL-3.0 (RF-DETR es Apache-2.0); no redistribuir imágenes con personas o placas reales |
| Cámara movida o homografía mal calibrada | Media | Alto | Trípode fijo, error de reproyección ≤ 0,15 m, foto de referencia por cámara, `configVersion` en cada detección |
| Percepción de "vigilancia" por jueces | Media | Medio | Mensaje explícito de privacidad, sin reconocimiento facial, alertas acotadas, revisión humana |
