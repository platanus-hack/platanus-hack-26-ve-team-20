// GET /api/evidence?u=<url> (vía api/p2.ts): sirve una foto de evidencia del store PRIVADO de Vercel Blob para
// mostrarla en los detalles de multa. Solo URLs de evidence/ en Vercel Blob; quien no tiene la URL (con sufijo
// aleatorio, viene en el DTO de la multa) no puede adivinarla. Dueño: P2.
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { isEvidenceUrl, readEvidence } from "../../lib/storage/blob.ts";
import { ApiError, handler } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  const url = String(req.query["u"] ?? "");
  if (!isEvidenceUrl(url)) throw new ApiError("VALIDATION_ERROR", "Evidencia no permitida");
  const blob = await readEvidence(url);
  if (!blob) throw new ApiError("NOT_FOUND", "Evidencia no encontrada");
  res.setHeader("Content-Type", blob.contentType);
  res.setHeader("Cache-Control", "private, max-age=86400, immutable"); // la URL lleva sufijo aleatorio: no cambia
  res.status(200);
  await pipeline(Readable.fromWeb(blob.stream as unknown as WebReadableStream<Uint8Array>), res);
});
