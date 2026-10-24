// registerDetection (P1): convierte el resultado de visión (VisionResult) en Violation + Evidence +
// Fine, o en un caso de revisión humana. Docs: 02 §5, 03 §4, 04 §0/§9 y HU-02 de 01.
//
// Reglas:
//  - Idempotencia: la misma `idempotencyKey` devuelve la violación ya creada (sin crear otra).
//  - Dedup: misma placa + cámara + tipo con |occurredAt − nueva| < 60 s devuelve la existente.
//  - Una detección con confianza < umbral, sin placa o con placa no registrada NO genera multa:
//    va a NEEDS_REVIEW (docs/AGENTS.md regla 5).
//  - Todo cambio de estado pasa por `transition()` y queda en AuditLog.
//  - La notificación (red) va DESPUÉS de confirmar la transacción: P3 lee la multa de la base.
import {
  isPlausiblePlate,
  normalizePlate,
  type NotificationResult,
  type DispatchAlert,
  type NotifyFineIssued,
  type RegisterDetection,
  type RegisterSighting,
  type ReviewReason,
  type ViolationStatus,
  type VisionResult,
} from "../contracts/index.ts";
import type { Prisma, PrismaClient, Violation } from "../generated/prisma/client.ts";
import { audit, type Actor } from "./audit.ts";
import { InvalidTransitionError, NotFoundError } from "./errors.ts";
import { countUnpaidFines, createFine } from "./fines.ts";
import { transition } from "./state-machine.ts";

export const DEDUP_WINDOW_MS = 60_000;
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;
/**
 * Un veredicto NO_VIOLATION no tiene estado propio en `ViolationStatus`: se guarda como VOID con este
 * motivo, para que la consola de cámaras lo muestre en el feed. Quien liste violaciones puede
 * distinguirlas por `voidReason`.
 */
export const NO_VIOLATION_VOID_REASON = "NO_VIOLATION";

const ACTOR: Actor = { type: "SYSTEM", id: "registerDetection" };
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

export interface DetectionDeps {
  db: PrismaClient;
  /** lib/notify (P3): solo envía y registra `Notification`; el cambio a NOTIFIED lo hace este módulo. */
  notifyFineIssued: NotifyFineIssued;
  /** Avistamiento de la placa (se crea solo si el vehículo ya tenía multas impagas). */
  registerSighting: RegisterSighting;
  /** lib/alerts (P3): busca al oficial más cercano y le avisa. */
  dispatchAlert: DispatchAlert;
  /** Por defecto, `VISION_CONFIDENCE_THRESHOLD` o 0.8. */
  confidenceThreshold?: number;
}

type Outcome = Awaited<ReturnType<RegisterDetection>>;
/** Placa confiable de un vehículo que ya debía multas: la cámara "lo vio" y hay que alertar. */
interface SightingTrigger { plate: string; occurredAt: Date }
interface Persisted { outcome: Outcome; fineId?: string; sighting?: SightingTrigger }
type Decision =
  | { to: "FINED" }
  | { to: "NEEDS_REVIEW"; reason: ReviewReason }
  | { to: "VOID"; voidReason: string };

export function readConfidenceThreshold(raw: string | undefined = process.env["VISION_CONFIDENCE_THRESHOLD"]): number {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) && n > 0 && n <= 1 ? n : DEFAULT_CONFIDENCE_THRESHOLD;
}

/** Decide qué hacer con una detección. Función pura (sin base de datos). */
export function decide(
  r: Pick<VisionResult, "verdict" | "reviewReason" | "confidence" | "plateConfidence">,
  plate: string | null,
  vehicleExists: boolean,
  threshold: number,
): Decision {
  if (r.verdict === "NO_VIOLATION") return { to: "VOID", voidReason: NO_VIOLATION_VOID_REASON };
  if (r.verdict === "NEEDS_REVIEW") return { to: "NEEDS_REVIEW", reason: r.reviewReason ?? "MANUAL" };
  if (!plate || !isPlausiblePlate(plate)) return { to: "NEEDS_REVIEW", reason: "NO_PLATE" };
  if (r.confidence < threshold || r.plateConfidence < threshold) return { to: "NEEDS_REVIEW", reason: "LOW_CONFIDENCE" };
  if (!vehicleExists) return { to: "NEEDS_REVIEW", reason: "PLATE_NOT_FOUND" };
  return { to: "FINED" };
}

const json = (v: unknown) => (v ?? {}) as Prisma.InputJsonValue;

function existing(v: Violation & { fine: { id: string } | null }): Outcome {
  return { violationId: v.id, status: v.status, ...(v.fine && { fineId: v.fine.id }), duplicate: true };
}

/**
 * Serializa operaciones con la misma clave dentro de la transacción (evita carreras de dedup).
 * `$executeRaw` y no `$queryRaw`: la función devuelve `void`, que Prisma no sabe deserializar.
 */
function lock(tx: Prisma.TransactionClient, key: string): Promise<number> {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

async function persist(
  tx: Prisma.TransactionClient,
  r: VisionResult,
  threshold: number,
): Promise<Persisted> {
  // 1) Idempotencia.
  await lock(tx, `idem:${r.idempotencyKey}`);
  const same = await tx.violation.findUnique({ where: { idempotencyKey: r.idempotencyKey }, include: { fine: true } });
  if (same) return { outcome: existing(same) };

  const camera = await tx.camera.findUnique({ where: { id: r.cameraId } });
  if (!camera) throw new NotFoundError("Cámara", r.cameraId);

  // 2) Dedup de dominio (misma placa + cámara + tipo en ±60 s).
  const plate = r.plate ? normalizePlate(r.plate) : null;
  const occurredAt = new Date(r.occurredAt);
  if (plate) {
    await lock(tx, `dedup:${r.cameraId}|${plate}|${r.type}`);
    const near = await tx.violation.findFirst({
      where: {
        plateRead: plate,
        cameraId: r.cameraId,
        type: r.type,
        occurredAt: { gt: new Date(occurredAt.getTime() - DEDUP_WINDOW_MS), lt: new Date(occurredAt.getTime() + DEDUP_WINDOW_MS) },
      },
      include: { fine: true },
      orderBy: { createdAt: "asc" },
    });
    if (near) return { outcome: existing(near) };
  }

  // 3) Decisión.
  const vehicle = plate && isPlausiblePlate(plate) ? await tx.vehicle.findUnique({ where: { plate } }) : null;
  const decision = decide(r, plate, vehicle !== null, threshold);

  // Multas impagas ANTES de esta detección: si había y la placa es confiable, habrá alerta.
  const priorUnpaid = vehicle ? await countUnpaidFines(tx, vehicle.id) : 0;
  const sighting: SightingTrigger | undefined =
    plate && vehicle && priorUnpaid > 0 && r.plateConfidence >= threshold ? { plate, occurredAt } : undefined;

  // 4) Violación + evidencia (estado inicial DETECTED).
  const violation = await tx.violation.create({
    data: {
      type: r.type,
      status: "DETECTED",
      cameraId: r.cameraId,
      vehicleId: vehicle?.id ?? null,
      plateRead: plate,
      plateConfidence: r.plateConfidence,
      confidence: r.confidence,
      occurredAt,
      measuredSpeedKmh: r.motion.speedKmh,
      laneId: r.motion.laneId,
      roadRelation: r.motion.relation,
      modelVersion: r.modelVersion,
      aiOutput: json(r.aiOutput),
      ruleOutput: json({ verdict: r.verdict, crossing: r.crossing, rules: r.ruleOutput }),
      idempotencyKey: r.idempotencyKey,
      evidence: {
        create: [
          { kind: "CLIP", url: r.clipUrl, capturedAt: occurredAt },
          ...r.frames.map((f) => ({
            kind: "FRAME" as const,
            url: f.url,
            capturedAt: new Date(f.capturedAt),
            meta: json({ lightState: f.lightState, vehicleBox: f.vehicleBox ?? null }),
          })),
          ...(r.plateCropUrl ? [{ kind: "PLATE_CROP" as const, url: r.plateCropUrl, capturedAt: occurredAt }] : []),
        ],
      },
    },
  });
  await audit(tx, {
    actor: ACTOR,
    action: "VIOLATION_CREATED",
    entity: "Violation",
    entityId: violation.id,
    after: { status: "DETECTED", verdict: r.verdict, plate, confidence: r.confidence, decision: decision.to },
  });

  // 5) Estado final, siempre por la máquina de estados.
  switch (decision.to) {
    case "FINED": {
      const fine = await createFine(tx, { id: violation.id, type: r.type }, new Date());
      const fined = await transition(tx, violation.id, "FINED", ACTOR);
      return {
        outcome: { violationId: fined.id, status: fined.status, fineId: fine.id, duplicate: false },
        fineId: fine.id,
        ...(sighting && { sighting }),
      };
    }
    case "NEEDS_REVIEW": {
      const v = await transition(tx, violation.id, "NEEDS_REVIEW", ACTOR, { reviewReason: decision.reason });
      return { outcome: { violationId: v.id, status: v.status, duplicate: false }, ...(sighting && { sighting }) };
    }
    case "VOID": {
      const v = await transition(tx, violation.id, "VOID", ACTOR, { voidReason: decision.voidReason });
      return { outcome: { violationId: v.id, status: v.status, duplicate: false }, ...(sighting && { sighting }) };
    }
  }
}

/** Notifica la multa y, si el envío se registró (SENT o DRY_RUN), pasa FINED → NOTIFIED. Nunca lanza. */
async function notifyAndAdvance(deps: DetectionDeps, outcome: Outcome, fineId: string): Promise<ViolationStatus> {
  let result: NotificationResult | null = null;
  try {
    result = await deps.notifyFineIssued(fineId);
  } catch (err) {
    await audit(deps.db, {
      actor: ACTOR, action: "NOTIFY_FAILED", entity: "Fine", entityId: fineId,
      after: { error: err instanceof Error ? err.message : String(err) },
    });
    return outcome.status;
  }

  if (result.status === "FAILED") {
    await audit(deps.db, { actor: ACTOR, action: "NOTIFY_FAILED", entity: "Fine", entityId: fineId, after: { channel: result.channel } });
    return outcome.status;
  }

  try {
    return (await transition(deps.db, outcome.violationId, "NOTIFIED", ACTOR)).status;
  } catch (err) {
    // p. ej. la multa ya se pagó mientras tanto: se informa el estado real, sin perder la detección.
    if (err instanceof InvalidTransitionError) {
      return (await deps.db.violation.findUniqueOrThrow({ where: { id: outcome.violationId } })).status;
    }
    throw err;
  }
}

/** Registra el avistamiento y despacha la alerta al oficial más cercano. Nunca lanza. */
async function raiseAlert(deps: DetectionDeps, r: VisionResult, violationId: string, s: SightingTrigger): Promise<void> {
  try {
    const sighting = await deps.registerSighting({
      cameraId: r.cameraId,
      plate: s.plate,
      seenAt: s.occurredAt.toISOString(),
      evidenceUrl: r.clipUrl,
    });
    await deps.dispatchAlert(sighting.sightingId);
  } catch (err) {
    await audit(deps.db, {
      actor: ACTOR, action: "ALERT_FAILED", entity: "Violation", entityId: violationId,
      after: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}

export function createRegisterDetection(deps: DetectionDeps): RegisterDetection {
  return async (r) => {
    const threshold = deps.confidenceThreshold ?? readConfidenceThreshold();
    const { outcome, fineId, sighting } = await deps.db.$transaction((tx) => persist(tx, r, threshold), TX_OPTIONS);

    const result = fineId ? { ...outcome, status: await notifyAndAdvance(deps, outcome, fineId) } : outcome;
    if (sighting) await raiseAlert(deps, r, outcome.violationId, sighting);
    return result;
  };
}
