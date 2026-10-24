// Firmas entre módulos (docs/04-api.md §0). Cada dueño implementa su módulo con `satisfies`
// y, mientras no exista, publica un mock con la misma firma en lib/<modulo>/mock.ts (USE_MOCKS=true).
import type { AlertStatus, Channel, ViolationStatus } from "./common.ts";
import type { C2PRequest } from "./requests.ts";
import type { VisionResult } from "./vision.ts";

export interface NotificationResult {
  channel: Channel;
  status: "SENT" | "FAILED" | "DRY_RUN";
  providerId?: string;
}

// lib/domain (P1)
export type RegisterDetection = (r: VisionResult) => Promise<{
  violationId: string; status: ViolationStatus; fineId?: string; duplicate: boolean;
}>;
export type RegisterSighting = (s: {
  cameraId: string; plate: string; seenAt: string; evidenceUrl?: string;
}) => Promise<{ sightingId: string; vehicleId?: string; unpaidCount: number }>;
export type MarkFinePaid = (fineId: string, paymentId: string) => Promise<void>;

// lib/notify (P3)
export type NotifyFineIssued = (fineId: string) => Promise<NotificationResult>;
export type NotifyPaymentConfirmed = (fineId: string) => Promise<NotificationResult>;
export type NotifyOfficerAlert = (alertId: string) => Promise<NotificationResult>;

// lib/alerts (P3)
export type DispatchAlert = (sightingId: string) => Promise<{
  alertId: string; status: AlertStatus; officerId?: string; distanceM?: number;
}>;

// lib/payments (P3)
export type ChargeC2P = (req: C2PRequest) => Promise<{
  status: "APPROVED" | "REJECTED"; reference?: string; failureCode?: string;
}>;

// lib/vision (P2)
export type Analyze = (input: {
  cameraId: string; clipUrl: string; startedAt: string; clockOffsetMs: number; idempotencyKey: string;
}) => Promise<VisionResult>;
