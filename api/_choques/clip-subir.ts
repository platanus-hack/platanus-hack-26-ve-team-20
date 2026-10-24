// POST /api/choques/alertas/:id/clip?type=video/webm&t0=12.4&duration=17.1, cuerpo = video crudo
// (application/octet-stream, < 4 MB). `t0` es el segundo del clip en que ocurrió el choque.
import type { VercelRequest } from "@vercel/node";
import { CrashClipQuerySchema } from "../../lib/contracts/index.ts";
import { uploadClip } from "../../lib/crash/network.ts";
import { db } from "../../lib/db.ts";
import { ApiError, handler, sendOk } from "../_lib/respond.ts";

/** @vercel/node entrega el cuerpo application/octet-stream como Buffer en `req.body`. */
function rawBody(req: VercelRequest): Uint8Array {
  const body: unknown = req.body;
  if (body instanceof Uint8Array) return body;
  throw new ApiError("VALIDATION_ERROR", "Envíe el video como application/octet-stream");
}

export default handler(["POST"], async (req, res) => {
  const q = CrashClipQuerySchema.parse(req.query);
  sendOk(res, await uploadClip(db, q.id, rawBody(req), { type: q.type, t0: q.t0, duration: q.duration }), 201);
});
