// Esquemas Zod de los requests de cada endpoint (docs/04-api.md). Validación en todo borde.
import { z } from "zod";
import { VIOLATION_TYPES, normalizeCedula, normalizePlate } from "./common.ts";

const isoDate = z.iso.datetime({ offset: true });
const normalized01 = z.number().min(0).max(1);
const point = z.tuple([normalized01, normalized01]);
const groundPoint = z.tuple([z.number(), z.number()]);

// ---- §1 detecciones y cámaras (P2)
export const DetectionRequestSchema = z.object({
  cameraCode: z.string().min(1),
  type: z.enum(VIOLATION_TYPES).default("RED_LIGHT"),
  clip: z.object({
    url: z.url(),
    startedAt: isoDate,
    durationMs: z.number().int().positive().max(30_000),
  }),
  clockOffsetMs: z.number().int().default(0),
  device: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().nonnegative().optional(),
  }).optional(),
  idempotencyKey: z.string().min(8).max(100).optional(),
});
export type DetectionRequest = z.infer<typeof DetectionRequestSchema>;

export const SightingRequestSchema = z.union([
  z.object({
    cameraId: z.string().min(1),
    plate: z.string().min(1).transform(normalizePlate),
    seenAt: isoDate,
    evidenceUrl: z.url().optional(),
  }),
  z.object({
    cameraCode: z.string().min(1),
    clip: DetectionRequestSchema.shape.clip,
    clockOffsetMs: z.number().int().default(0),
  }),
]);
export type SightingRequest = z.infer<typeof SightingRequestSchema>;

export const CameraPatchSchema = z.object({
  stopLine: z.tuple([point, point]),
  homography: z.object({
    imagePoints: z.array(point).min(4),
    groundPointsM: z.array(groundPoint).min(4),
    controlImage: z.array(point).optional(),
    controlGroundM: z.array(groundPoint).optional(),
  }),
  lanes: z.array(z.object({
    id: z.string().min(1),
    polygon: z.array(point).min(3),
    allowedDirection: z.tuple([z.number(), z.number()]),
    limitKmh: z.number().positive().optional(),
    limitSource: z.string().optional(),
  })),
  speedZone: z.object({ yAM: z.number(), yBM: z.number(), toleranceKmh: z.number().nonnegative().optional() }),
  parameters: z.record(z.string(), z.number()),
}).partial();
export type CameraPatch = z.infer<typeof CameraPatchSchema>;

export const LightRequestSchema = z.object({ state: z.enum(["RED", "GREEN", "YELLOW"]) });
export type LightRequest = z.infer<typeof LightRequestSchema>;

// ---- §2 revisión (P1)
export const ReviewRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("APPROVE"),
    plate: z.string().min(1).transform(normalizePlate).optional(),
    note: z.string().max(500).optional(),
  }),
  z.object({ action: z.literal("VOID"), reason: z.string().min(1).max(500) }),
]);
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;

export const ViolationsQuerySchema = z.object({
  status: z.string().optional(),
  since: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ViolationsQuery = z.infer<typeof ViolationsQuerySchema>;

// ---- §4 portal por cédula (P1)
export const PortalLookupRequestSchema = z.object({
  cedula: z.string().min(5).max(20).transform(normalizeCedula).pipe(z.string().regex(/^[VEJGP]?\d{5,9}$/)),
});
export type PortalLookupRequest = z.infer<typeof PortalLookupRequestSchema>;

// ---- §5 pagos C2P simulados (P3)
export const C2PRequestSchema = z.object({
  fineToken: z.string().min(10),
  payerBankCode: z.string().regex(/^\d{4}$/),
  payerPhone: z.string().regex(/^04(12|14|16|24|26)\d{7}$/),
  payerCedula: z.string().min(5).max(20).transform(normalizeCedula),
  c2pKey: z.string().regex(/^\d{6,8}$/),   // nunca se persiste ni se loguea
  idempotencyKey: z.string().min(8).max(100),
});
export type C2PRequest = z.infer<typeof C2PRequestSchema>;

// ---- §6 oficiales y alertas (P3)
export const OfficerSessionRequestSchema = z.object({
  passcode: z.string().min(1),
  badge: z.string().min(1),
});
export type OfficerSessionRequest = z.infer<typeof OfficerSessionRequestSchema>;

export const OfficerLocationRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
  onDuty: z.boolean(),
});
export type OfficerLocationRequest = z.infer<typeof OfficerLocationRequestSchema>;
