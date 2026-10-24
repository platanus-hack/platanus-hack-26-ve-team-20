// Contratos comunes (docs/04-api.md convenciones + docs/03 enums). Dueño: P1.
// Sin `enum` de TS (erasableSyntaxOnly): arreglos `as const` + tipos derivados.

export const VIOLATION_TYPES = ["RED_LIGHT", "TURN_ARROW", "SPEEDING"] as const;
export type ViolationType = (typeof VIOLATION_TYPES)[number];

export const VIOLATION_STATUSES = [
  "DETECTED", "NEEDS_REVIEW", "REVIEWED", "FINED", "NOTIFIED", "PAID", "APPEALED", "VOID",
] as const;
export type ViolationStatus = (typeof VIOLATION_STATUSES)[number];

export const REVIEW_REASONS = [
  "LOW_CONFIDENCE", "NO_PLATE", "PLATE_NOT_FOUND", "MODEL_RULE_DISAGREE", "ML_SERVICE_ERROR", "MANUAL",
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const FINE_STATUSES = ["PENDING", "PAID", "OVERDUE", "APPEALED", "VOID"] as const;
export type FineStatus = (typeof FINE_STATUSES)[number];

export const PAYMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const CHANNELS = ["WHATSAPP", "EMAIL"] as const;
export type Channel = (typeof CHANNELS)[number];

export const NOTIFICATION_STATUSES = ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED", "DRY_RUN"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const ALERT_STATUSES = ["SENT", "ACKNOWLEDGED", "NO_OFFICER_NEARBY", "SUPPRESSED"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const EVIDENCE_KINDS = ["CLIP", "FRAME", "PLATE_CROP", "ANNOTATED"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const ACTOR_TYPES = ["SYSTEM", "OPERATOR", "OFFICER", "CITIZEN", "WEBHOOK"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const VERDICTS = ["VIOLATION", "NO_VIOLATION", "NEEDS_REVIEW"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const LIGHT_STATES = ["RED", "YELLOW", "GREEN", "UNKNOWN"] as const;
export type LightState = (typeof LIGHT_STATES)[number];

// ---------------------------------------------------------------- respuestas de la API
export const ERROR_CODES = [
  "VALIDATION_ERROR", "UNAUTHORIZED", "NOT_FOUND", "CONFLICT", "INVALID_TRANSITION",
  "ALREADY_PAID", "RATE_LIMITED", "UPSTREAM_ERROR", "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiOk<T> { ok: true; data: T }
export interface ApiErr { ok: false; error: { code: ErrorCode; message: string; reason?: string } }
export type ApiResponse<T> = ApiOk<T> | ApiErr;

/** Código HTTP que corresponde a cada código de error (docs/04 convenciones). */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  ALREADY_PAID: 409,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500,
};

// ---------------------------------------------------------------- normalización
/** Placa normalizada: mayúsculas, sin espacios, guiones ni puntos. */
export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[\s.-]/g, "");
}

/** Placa con formato plausible: 5–8 caracteres alfanuméricos, sin `?` (carácter dudoso del OCR). */
export function isPlausiblePlate(plate: string): boolean {
  return /^[A-Z0-9]{5,8}$/.test(plate);
}

/** `v-12.345.678` → `V12345678`. */
export function normalizeCedula(input: string): string {
  return input.toUpperCase().replace(/[\s.-]/g, "");
}

/** `AB123CD` → `AB***CD` (docs/04 §3). Placas cortas se enmascaran por completo. */
export function maskPlate(plate: string): string {
  const p = normalizePlate(plate);
  if (p.length < 5) return "*".repeat(p.length);
  return `${p.slice(0, 2)}${"*".repeat(p.length - 4)}${p.slice(-2)}`;
}

/** `V99000001` → `V-****0001` (docs/04 §4). */
export function maskCedula(cedula: string): string {
  const c = normalizeCedula(cedula);
  const letter = /^[A-Z]/.test(c) ? c.slice(0, 1) : "";
  const digits = letter ? c.slice(1) : c;
  return `${letter}${letter ? "-" : ""}****${digits.slice(-4)}`;
}
