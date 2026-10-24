# 12 — Historial de multas del policía · contrato para P1

La web `/oficial/multas` (historial, filtros por cédula y placa, detalle con auditoría, cambio de estado y CSV) ya existe con datos de demo en `src/lib/oficial/demo.ts`. Para conectarla a la base, P1 implementa los tres endpoints de abajo y se arranca la web con `VITE_OFICIAL_API=real` (`src/lib/oficial/real.ts` ya los llama con estas formas exactas).

Convenciones de `04-api.md`: respuesta `{ ok: true, data }` o `{ ok: false, error: { code, message, reason? } }`, `Cache-Control: no-store`, fechas ISO en UTC, dinero en céntimos. Auth **`officer`**: cookie de sesión del oficial (12 h, `SESSION_TTL_S.officer`); sin sesión válida → 401 `UNAUTHORIZED`. Los `POST` rechazan un `Origin` ajeno. Todo va dentro del router de P1 (`api/p1.ts` + reescritura en `vercel.json`), sin funciones nuevas.

> Login: lo hace otra persona (invitación por correo + contraseña). Hoy la web usa una sesión de demo (`oficial.a@example.com` / `demo1234`) detrás de `iniciarSesionOficial()`; ese trabajo solo reemplaza las funciones de sesión de `src/lib/oficial/real.ts`.

## 1. `GET /api/officer/fines?cedula=&plate=&cursor=&limit=` (officer)
- `cedula` (opcional): se normaliza con `normalizeCedula()`; coincidencia **exacta** con el titular del vehículo.
- `plate` (opcional): se normaliza con `normalizePlate()`; coincidencia por **prefijo** (`AB12` → `AB123CD`).
- Ambos se combinan (Y). Sin filtros lista todas las multas emitidas.
- Orden: `occurredAt` descendente (desempate por `id`). `limit` 1–100 (25 por defecto). `cursor` opaco; `nextCursor` es `null` en la última página.
- `status` incluye `OVERDUE` calculado (`effectiveFineStatus`).

```json
{ "ok": true, "data": { "items": [OfficerFineDTO], "nextCursor": "opaco" | null } }
```

## 2. `GET /api/officer/fines/:id` (officer)
`OfficerFineDetailDTO` (el ítem de la lista + vehículo, evidencia, pago/anulación y `audit[]` en orden cronológico). 404 `NOT_FOUND` si no existe.

## 3. `POST /api/officer/fines/:id/status` (officer)
Request `{ "action": "VOID" | "APPEAL_ACCEPT" | "APPEAL_REJECT", "reason": "≥ 10 caracteres" }` (Zod; `reason` con `trim`, 10–500).

| Estado actual (efectivo) | `action` | Nuevo estado de la multa | Violación (`transition()`) |
|---|---|---|---|
| `PENDING`, `OVERDUE` | `VOID` | `VOID` (`voidReason = reason`) | `FINED`/`NOTIFIED` → `VOID` |
| `APPEALED` | `APPEAL_ACCEPT` | `VOID` (`voidReason = reason`) | `APPEALED` → `VOID` |
| `APPEALED` | `APPEAL_REJECT` | `PENDING` (se muestra `OVERDUE` si `dueAt` ya pasó) | `APPEALED` → `NOTIFIED` |

Cualquier otra combinación (incluidas `PAID` y `VOID`, que son finales) → 409 `INVALID_TRANSITION`.

- Todo cambio pasa por `lib/domain/state-machine.ts` (`transition(db, violationId, to, actor, { voidReason, note: reason })`) y escribe `AuditLog` en la misma transacción con actor `{ type: "OFFICER", id: <oficial de la sesión> }`, `from`/`to` y el motivo. La fila se bloquea: dos oficiales a la vez → uno gana, el otro recibe 409.
- Response: `{ ok: true, data: OfficerFineDetailDTO }` ya actualizado (la web refresca la fila y la auditoría con él).
- Errores: 400 `VALIDATION_ERROR` (acción desconocida, motivo corto), 401 `UNAUTHORIZED`, 404 `NOT_FOUND`, 409 `INVALID_TRANSITION`.

## 3b. `POST /api/officer/fines/:id/resend` (officer)
Reenvía al **titular del vehículo** el mismo WhatsApp de la multa (tipo, lugar, fecha, placa enmascarada, monto y enlace con la evidencia y el pago), reutilizando `notifyFineIssued` de P3. Cada envío crea una `Notification` y una entrada de auditoría `FINE_NOTIFICATION_RESENT` (actor oficial), que el detalle muestra como «Notificación reenviada».
- Solo multas **pendientes o vencidas** (efectivas). Otra cosa → 409 `NO_REENVIABLE`. Sin titular → 409 `SIN_TITULAR`; titular sin teléfono → 409 `SIN_TELEFONO`.
- Máximo **3 por hora por multa** (compartido con el reenvío del ciudadano, `POST /api/citizen/fines/:id/resend`); el 4.º → 429 `RATE_LIMITED`. El intento se cuenta antes de enviar.
- Response: `{ status: "SENT" | "DRY_RUN" | "FAILED", telefono: "0412-***0001", fine: OfficerFineDetailDTO }` (la web refresca el detalle y la auditoría). `DRY_RUN` = el servidor no envía (`NOTIFY_DRY_RUN`). El teléfono nunca sale completo.
- La web ofrece el botón «Reenviar notificación» en el detalle y en cada fila de la lista (oficial) y en la lista y el detalle de «Mis multas» (ciudadano).

## 4. DTO propuestos (`lib/contracts`)
```ts
export type OfficerFineAction = "VOID" | "APPEAL_ACCEPT" | "APPEAL_REJECT";

export interface OfficerFineDTO {
  id: string;
  type: ViolationType;
  status: FineStatus;              // incluye OVERDUE calculado
  occurredAt: string;
  intersection: string;
  cameraCode: string;
  plate: string;                   // placa completa (el oficial la necesita para identificar el vehículo)
  cedulaMasked: string | null;     // maskCedula(): "V-****0001"; null si el vehículo no tiene titular
  amountCents: number;
  currency: "VES" | "USD";
  dueAt: string;
  verification: "AUTO" | "HUMAN";
  confidence: number;
}

export interface OfficerAuditEntryDTO {
  at: string;
  actor: { type: ActorType; label: string };   // label: "Sistema", "Operador de revisión", nombre del oficial…
  action: string;                               // FINE_CREATED, REVIEW_APPROVED, PAID, APPEALED, VOID, APPEAL_ACCEPT, APPEAL_REJECT…
  from: FineStatus | null;
  to: FineStatus | null;
  reason: string | null;
}

export interface OfficerFineDetailDTO extends OfficerFineDTO {
  vehicle: { brand: string; model: string; color: string; year: number } | null;
  evidence: Array<{ kind: EvidenceKind; url: string; capturedAt: string; lightState: LightState | null }>;
  paidAt: string | null;
  paymentReference: string | null;
  voidReason: string | null;
  appealedAt: string | null;
  audit: OfficerAuditEntryDTO[];
}
```

## 5. Privacidad (docs/08)
- La cédula sale **siempre enmascarada** (`maskCedula`), también en el CSV que genera la web. Nunca nombre, teléfono, correo ni `publicToken` del titular; un test debe fijar las claves exactas de las respuestas.
- El filtro por cédula recibe la cédula completa (la escribe el oficial) pero no la devuelve.
- Cada consulta con filtro de cédula escribe `AuditLog(OFFICER_FINES_LOOKUP)` con el id del oficial y una huella de la cédula, nunca la cédula (como `PORTAL_LOOKUP`).
