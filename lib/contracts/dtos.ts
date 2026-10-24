// DTOs de respuesta de cada endpoint (docs/04-api.md §1–§6). Solo tipos: el SPA los importa.
import type {
  AlertStatus, EvidenceKind, FineStatus, LightState, ReviewReason, ViolationStatus, ViolationType,
} from "./common.ts";
import type { MotionEstimate, Crossing } from "./vision.ts";
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

// ---- §2 violaciones y revisión (P1)
export interface ViolationListItemDTO {
  id: string;
  type: ViolationType;
  status: ViolationStatus;
  reviewReason: ReviewReason | null;
  camera: { code: string; intersection: string };
  plateRead: string | null;
  confidence: number;
  occurredAt: string;
  evidence: Array<{ kind: EvidenceKind; url: string }>;
  fine: { token: string; status: FineStatus; amountCents: number; currency: string } | null;
}
export interface ViolationListDTO { items: ViolationListItemDTO[]; nextSince: string | null }

export interface ReviewResultDTO { status: Extract<ViolationStatus, "NOTIFIED" | "VOID">; fineId?: string }

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
