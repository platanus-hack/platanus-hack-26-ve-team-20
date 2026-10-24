// POST /api/detections (docs/04 §1): clip en Blob → analyze → registerDetection. Dueño: P2.
import { createHash } from "node:crypto";
import { DetectionRequestSchema } from "../lib/contracts/index.ts";
import { db } from "../lib/db.ts";
import { analyze } from "../lib/vision/index.ts";
import { registerDetectionStub as registerDetection } from "../lib/vision/register-detection-stub.ts";
import { requireCameraKey } from "./_lib/camera-key.ts";
import { ApiError, handler, sendOk } from "./_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  const startedMs = Date.now();
  requireCameraKey(req);
  const body = DetectionRequestSchema.parse(req.body);
  const camera = await db.camera.findUnique({ where: { code: body.cameraCode }, select: { id: true, active: true } });
  if (!camera?.active) throw new ApiError("NOT_FOUND", `Cámara ${body.cameraCode} no encontrada`);

  const idempotencyKey = body.idempotencyKey
    ?? createHash("sha256").update(`${camera.id}|${body.clip.url}`).digest("hex").slice(0, 32);
  const result = await analyze({
    cameraId: camera.id, clipUrl: body.clip.url, startedAt: body.clip.startedAt,
    clockOffsetMs: body.clockOffsetMs, idempotencyKey,
  });
  // Sin cruce en rojo no se crea violación.
  const registered = result.verdict === "NO_VIOLATION" ? null : await registerDetection(result);

  sendOk(res, {
    verdict: result.verdict,
    ...(result.reviewReason ? { reviewReason: result.reviewReason } : {}),
    violationId: registered?.violationId ?? null,
    status: registered?.status ?? null,
    fineId: registered?.fineId ?? null,
    plate: result.plate,
    confidence: result.confidence,
    crossing: result.crossing,
    motion: result.motion,
    duplicate: registered?.duplicate ?? false,
    latencyMs: Date.now() - startedMs,
  });
});
