// Mapeo de filas de Prisma a los DTO públicos de lib/contracts (P1). Funciones puras: sin base de
// datos, así se prueban solas. Reglas de privacidad (docs/08): la multa pública NUNCA incluye
// cédula, teléfono ni nombre del dueño; la placa va enmascarada.
import {
  LIGHT_STATES,
  maskPlate,
  type FinePublicDTO,
  type LightState,
  type RoadRelation,
  type Verdict,
  type ViolationListItemDTO,
  type ViolationStatus,
} from "../contracts/index.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { NO_VIOLATION_VOID_REASON } from "./violations.ts";
import { effectiveFineStatus } from "./state-machine.ts";

export const violationListInclude = {
  camera: { include: { intersection: true } },
  evidence: { orderBy: { capturedAt: "asc" } },
  fine: true,
} satisfies Prisma.ViolationInclude;

export const publicFineInclude = {
  violation: {
    include: {
      camera: { include: { intersection: true } },
      vehicle: true,
      evidence: { orderBy: { capturedAt: "asc" } },
    },
  },
  payments: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.FineInclude;

export type ViolationListRow = Prisma.ViolationGetPayload<{ include: typeof violationListInclude }>;
export type PublicFineRow = Prisma.FineGetPayload<{ include: typeof publicFineInclude }>;

const RELATIONS: readonly RoadRelation[] = ["WITH_FLOW", "AGAINST_FLOW", "UNKNOWN"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asLightState(v: unknown): LightState | null {
  return typeof v === "string" && (LIGHT_STATES as readonly string[]).includes(v) ? (v as LightState) : null;
}

/** Veredicto que ve la UI. `NO_VIOLATION` no tiene estado propio: es un VOID con ese motivo. */
export function verdictOf(status: ViolationStatus, voidReason: string | null): Verdict {
  if (status === "NEEDS_REVIEW") return "NEEDS_REVIEW";
  if (status === "VOID" && voidReason === NO_VIOLATION_VOID_REASON) return "NO_VIOLATION";
  return "VIOLATION";
}

export function toViolationListItem(v: ViolationListRow, now: Date = new Date()): ViolationListItemDTO {
  const crossing = isRecord(v.ruleOutput) ? v.ruleOutput["crossing"] : undefined;
  return {
    id: v.id,
    type: v.type,
    status: v.status,
    verdict: verdictOf(v.status, v.voidReason),
    reviewReason: v.reviewReason,
    voidReason: v.voidReason,
    camera: { code: v.camera.code, intersection: v.camera.intersection.name },
    plateRead: v.plateRead,
    plateConfidence: v.plateConfidence,
    confidence: v.confidence,
    lightState: isRecord(crossing) ? asLightState(crossing["lightState"]) : null,
    motion: {
      speedKmh: v.measuredSpeedKmh,
      laneId: v.laneId,
      relation: (RELATIONS as readonly (string | null)[]).includes(v.roadRelation) ? (v.roadRelation as RoadRelation) : null,
    },
    occurredAt: v.occurredAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    evidence: v.evidence.map((e) => ({ kind: e.kind, url: e.url })),
    fine: v.fine
      ? {
          token: v.fine.publicToken,
          status: effectiveFineStatus(v.fine, now),
          amountCents: v.fine.amountCents,
          currency: v.fine.currency,
        }
      : null,
  };
}

export function toFinePublic(f: PublicFineRow, now: Date = new Date()): FinePublicDTO {
  const v = f.violation;
  const plate = v.plateRead ?? v.vehicle?.plate ?? "";
  const vehicle = v.vehicle ? `${v.vehicle.make} ${v.vehicle.model} ${v.vehicle.color}` : null;
  return {
    token: f.publicToken,
    status: f.status,
    overdue: effectiveFineStatus(f, now) === "OVERDUE",
    type: v.type,
    occurredAt: v.occurredAt.toISOString(),
    intersection: v.camera.intersection.name,
    cameraCode: v.camera.code,
    plateMasked: maskPlate(plate),
    vehicle,
    amountCents: f.amountCents,
    currency: f.currency,
    dueAt: f.dueAt.toISOString(),
    // HUMAN si la violación pasó por revisión (conserva su reviewReason); AUTO si se multó directo.
    verification: v.reviewReason ? "HUMAN" : "AUTO",
    evidence: v.evidence.map((e) => {
      const lightState = isRecord(e.meta) ? asLightState(e.meta["lightState"]) : null;
      return {
        kind: e.kind,
        url: e.url,
        capturedAt: e.capturedAt.toISOString(),
        ...(lightState && { lightState }),
      };
    }),
    paidAt: f.paidAt?.toISOString() ?? null,
    paymentReference: f.payments[0]?.reference ?? null,
  };
}
