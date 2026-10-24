// DTOs de respuesta de cada endpoint (docs/04-api.md §1–§6). Solo tipos: el SPA los importa.
import type {
  AlertStatus, EvidenceKind, FineStatus, LightState, ReviewReason, ViolationStatus, ViolationType,
} from "./common.ts";
import type { MotionEstimate, Crossing, RoadRelation } from "./vision.ts";
import type { Verdict } from "./common.ts";

// ---- §1 detecciones (P2)
export interface DetectionResultDTO {
  verdict: Verdict;
  violationId: string;
  status: ViolationStatus;
  fineId?: string;
  plate: string | null;
  confidence: number;
  crossing: Crossing;
  motion: MotionEstimate;
  duplicate: boolean;
  latencyMs: number;
}

export interface SightingResultDTO {
  sightingId: string;
  unpaidCount: number;
  alert: { alertId: string; status: AlertStatus; officerId?: string; distanceM?: number } | null;
}

// ---- Autenticación (P1)
export interface AdminSessionDTO { id: string; email: string; name: string }

// ---- invitaciones y cuentas de oficiales (docs/04 §0d)
export type OfficerInvitationStatus = "PENDING" | "USED" | "EXPIRED" | "REVOKED";
export interface OfficerInvitationDTO {
  id: string;
  email: string;
  name: string;
  status: OfficerInvitationStatus;
  expiresAt: string;
  createdAt: string;
  createdByName: string;
  /** Placa del oficial creado, cuando la invitación ya se usó. */
  officerBadge: string | null;
}
/** Oficial con cuenta propia, como lo ve el admin (teléfono enmascarado). */
export interface AdminOfficerDTO {
  id: string;
  badge: string;
  name: string;
  email: string | null;
  phone: string;
  active: boolean;
  onDuty: boolean;
  hasAccount: boolean;
  createdAt: string;
}
export interface OfficerSessionDTO { id: string; badge: string; name: string; email: string | null }

// ---- Cuenta del ciudadano (P1, docs/04 §0c)
export interface CitizenProfileDTO {
  cedula: string;
  /** Teléfono del titular en formato local (`04264180319`); solo se muestra a su dueño ya autenticado. */
  telefono: string;
  correo: string | null;
}

/** Multa propia de un ciudadano autenticado. Lleva la placa completa y el token (para pagar). */
export interface CitizenFineDTO {
  id: string;
  /** `publicToken` de la multa: lo usa `POST /api/payments/c2p`. */
  token: string;
  plate: string;
  type: ViolationType;
  /** `OVERDUE` se calcula (pendiente con fecha vencida). */
  status: FineStatus;
  occurredAt: string;
  intersection: string;
  cameraCode: string;
  amountCents: number;
  currency: string;
  dueAt: string;
  verification: "AUTO" | "HUMAN";
  confidence: number;
  paidAt: string | null;
  paymentReference: string | null;
  voidReason: string | null;
  appealedAt: string | null;
}

export interface CitizenVehicleDTO { plate: string; brand: string; model: string; color: string; year: number | null }

// ---- §2 violaciones y revisión (P1)
export interface ViolationListItemDTO {
  id: string;
  type: ViolationType;
  status: ViolationStatus;
  /** Veredicto para la UI: NO_VIOLATION = VOID con motivo NO_VIOLATION (docs/03 §4). */
  verdict: Verdict;
  reviewReason: ReviewReason | null;
  voidReason: string | null;
  camera: { code: string; intersection: string };
  plateRead: string | null;
  plateConfidence: number | null;
  confidence: number;
  /** Estado de la luz en el instante del cruce (solo detecciones del pipeline, no del seed). */
  lightState: LightState | null;
  motion: { speedKmh: number | null; laneId: string | null; relation: RoadRelation | null };
  occurredAt: string;
  /** Última modificación: el feed en vivo pagina con `since` sobre este campo. */
  updatedAt: string;
  evidence: Array<{ kind: EvidenceKind; url: string }>;
  fine: { token: string; status: FineStatus; amountCents: number; currency: string } | null;
}
export interface ViolationListDTO { items: ViolationListItemDTO[]; nextSince: string | null }

/** NOTIFIED: aprobada y avisada; FINED: aprobada pero el aviso falló (queda la multa); VOID: anulada. */
export interface ReviewResultDTO { status: Extract<ViolationStatus, "NOTIFIED" | "FINED" | "VOID">; fineId?: string }

/** Detalle de una violación para la pantalla de revisión: el ítem de la lista más la salida del modelo. */
export interface ViolationDetailDTO extends ViolationListItemDTO {
  modelVersion: string | null;
  /** Respuesta cruda validada del servicio ML. */
  aiOutput: unknown;
  /** Resultado de la regla: `{ verdict, crossing, rules }`. */
  ruleOutput: unknown;
}

// ---- §3 multa pública (P1)
export interface FinePublicDTO {
  token: string;
  status: FineStatus;
  overdue: boolean;
  type: ViolationType;
  occurredAt: string;
  intersection: string;
  cameraCode: string;
  plateMasked: string;
  vehicle: string | null;
  amountCents: number;
  currency: string;
  dueAt: string;
  verification: "AUTO" | "HUMAN";
  evidence: Array<{ kind: EvidenceKind; url: string; capturedAt: string; lightState?: LightState }>;
  paidAt: string | null;
  paymentReference: string | null;
}

// ---- §4 portal por cédula (P1)
export interface PortalLookupDTO {
  cedulaMasked: string;
  summary: { total: number; pending: number; paid: number };
  items: Array<{
    occurredAt: string;
    type: ViolationType;
    intersection: string;
    plateMasked: string;
    status: FineStatus;
    amountCents: number;
    currency: string;
    fineToken: string | null;
  }>;
}

// ---- §5 pagos (P3)
export interface C2PResultDTO { status: "APPROVED"; reference: string; paidAt: string; simulated: true }
/** Pago rechazado por el simulador: 200 con `ok: true` (el pedido fue válido; el "banco" dijo que no). */
export interface C2PRejectedDTO { status: "REJECTED"; failureCode: string; simulated: true }
export type C2PPaymentDTO = C2PResultDTO | C2PRejectedDTO;

// ---- §6 oficiales y alertas (P3)
export interface OfficerAlertDTO {
  id: string;
  status: AlertStatus;
  createdAt: string;
  plate: string;
  vehicle: string | null;
  unpaidCount: number;
  camera: { code: string; intersection: string; lat: number; lng: number };
  distanceM: number;
}
