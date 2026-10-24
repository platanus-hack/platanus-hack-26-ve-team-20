// Autenticación de la app de cámara: header `X-Camera-Key` = CAMERA_API_KEY (docs/04 §1). Dueño: P2.
import { timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "@vercel/node";
import { ApiError } from "../_lib/respond.ts";

export function requireCameraKey(req: VercelRequest, env: Record<string, string | undefined> = process.env): void {
  const expected = env["CAMERA_API_KEY"];
  const got = req.headers["x-camera-key"];
  if (!expected || typeof got !== "string" || got.length !== expected.length
    || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    throw new ApiError("UNAUTHORIZED", "Clave de cámara inválida");
  }
}
