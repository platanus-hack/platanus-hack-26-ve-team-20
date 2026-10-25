// POST /api/live/violations (vía api/p2.ts): multa del modo en vivo (ml/app/en_vivo.py). Dueño: P2.
// La manda el servicio ML de la Mac, no la app: se autentica con `Authorization: Bearer ML_SERVICE_TOKEN`.
// El motor solo multa a quien cruzó la línea con el semáforo en ROJO (el operador lo marca en vivo); aquí
// se sube la evidencia, se juzga la placa con la misma regla que los clips y se registra en el dominio.
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { VisionResult } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { registerDetectionDemo as registerDetection } from "../../lib/vision/registro-demo.ts";
import { assignDemoOwner } from "../../lib/vision/demo-owners.ts";
import { saveImage } from "../../lib/storage/blob.ts";
import { MIN_PLATE_VOTES, judgePlate } from "../../lib/vision/rules.ts";
import { ApiError, handler, sendOk } from "../_lib/respond.ts";

const jpeg = z.string().min(1).max(4_000_000);

export const LiveViolationSchema = z.object({
  cameraCode: z.string().min(1),
  occurredAt: z.iso.datetime({ offset: true }),
  trackId: z.number().int(),
  plate: z.string().min(1).max(20).nullable(),
  plateConfidence: z.number().min(0).max(1),
  votes: z.number().int().nonnegative(),
  rawReads: z.array(z.string()).max(20).default([]),
  modelVersion: z.string().min(1),
  idempotencyKey: z.string().min(8).max(100),
  sceneJpegBase64: jpeg,
  vehicleJpegBase64: jpeg.nullish(),
  plateJpegBase64: jpeg.nullish(),
  /** Placa del plan B (ml/app/adivinar.py: fotos realzadas); para la demo se acepta si confía >= GUESS_MIN. */
  plateGuessed: z.boolean().default(false),
});

const GUESS_MIN = 0.6;

function requireServiceToken(auth: string | undefined, env: Record<string, string | undefined> = process.env): void {
  const token = env["ML_SERVICE_TOKEN"];
  const expected = `Bearer ${token ?? ""}`;
  if (!token || typeof auth !== "string" || auth.length !== expected.length
    || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    throw new ApiError("UNAUTHORIZED", "Token del servicio ML inválido");
  }
}

export default handler(["POST"], async (req, res) => {
  requireServiceToken(req.headers.authorization);
  const body = LiveViolationSchema.parse(req.body);
  const camera = await db.camera.findUnique({ where: { code: body.cameraCode }, select: { id: true, active: true } });
  if (!camera?.active) throw new ApiError("NOT_FOUND", `Cámara ${body.cameraCode} no encontrada`);

  const threshold = Number(process.env["VISION_CONFIDENCE_THRESHOLD"]) || 0.8;
  // Decisión del equipo para la demo: una placa estimada con confianza alta se multa aunque pueda equivocarse.
  const guessed = body.plateGuessed && body.plate !== null && body.plateConfidence >= GUESS_MIN;
  const votes = guessed ? Math.max(body.votes, MIN_PLATE_VOTES) : body.votes;
  const read = body.plate ? { text: body.plate, ocrConfidence: body.plateConfidence, votes } : undefined;
  const check = judgePlate(read, guessed ? GUESS_MIN : threshold);

  const prefix = `evidence/${camera.id}/${body.idempotencyKey}`;
  const [sceneUrl, vehicleUrl, plateUrl] = await Promise.all([
    saveImage(`${prefix}/escena.jpg`, body.sceneJpegBase64),
    body.vehicleJpegBase64 ? saveImage(`${prefix}/vehiculo.jpg`, body.vehicleJpegBase64) : null,
    body.plateJpegBase64 ? saveImage(`${prefix}/placa.jpg`, body.plateJpegBase64) : null,
  ]);

  const result: VisionResult = {
    cameraId: camera.id,
    type: "RED_LIGHT",
    verdict: check.reviewReason ? "NEEDS_REVIEW" : "VIOLATION",
    ...(check.reviewReason ? { reviewReason: check.reviewReason } : {}),
    plate: check.plate,
    plateConfidence: check.plateConfidence,
    confidence: check.plateConfidence,
    occurredAt: body.occurredAt,
    frames: [
      { url: sceneUrl, capturedAt: body.occurredAt, lightState: "RED" },
      ...(vehicleUrl ? [{ url: vehicleUrl, capturedAt: body.occurredAt, lightState: "RED" as const }] : []),
    ],
    // shortcut: el modo en vivo no graba clip; la foto de escena ocupa su lugar. Grabar los últimos segundos si hace falta video.
    clipUrl: sceneUrl,
    crossing: { crossedStopLine: true, atMs: 0, lightState: "RED" },
    motion: { speedKmh: null, laneId: null, directionDeg: null, relation: "UNKNOWN" },
    modelVersion: body.modelVersion,
    ...(plateUrl ? { plateCropUrl: plateUrl } : {}),
    aiOutput: { source: "en-vivo", trackId: body.trackId, votes: body.votes, rawReads: body.rawReads, plateGuessed: body.plateGuessed },
    ruleOutput: check,
    idempotencyKey: body.idempotencyKey,
  };
  // Demo: una placa confiable que no existe se registra a nombre de un dueño de demo (DEMO_DUENOS_CEDULAS).
  if (result.verdict === "VIOLATION" && result.plate) await assignDemoOwner(db, result.plate);
  const registered = await registerDetection(result);
  sendOk(res, { ...registered, verdict: result.verdict, plate: result.plate });
});
