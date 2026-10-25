// Una sola Vercel Function para las rutas de P2 (el plan Hobby admite 12 funciones por deploy).
// vercel.json reescribe las URLs públicas de docs/04 §1 a /api/p2?route=…, así que la app de cámara no
// cambia. Los handlers viven en api/_p2/ (el prefijo `_` evita que Vercel los cuente como funciones).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendError } from "./_lib/respond.ts";
import blobUpload from "./_p2/blob-upload.ts";
import cameraLight from "./_p2/camera-light.ts";
import cameras from "./_p2/cameras.ts";
import detections from "./_p2/detections.ts";
import evidence from "./_p2/evidence.ts";
import liveViolation from "./_p2/live-violation.ts";
import time from "./_p2/time.ts";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void;

/** route → handler. Cada handler valida su método y la clave de cámara con handler(). */
export const P2_ROUTES: Record<string, Handler> = {
  "time": time, //                 GET /api/time
  "blob-upload": blobUpload, //    POST /api/blob/upload
  "cameras": cameras, //           GET /api/cameras
  "camera-light": cameraLight, //  GET|POST /api/cameras/:id/light
  "detections": detections, //     POST /api/detections
  "evidence": evidence, //         GET /api/evidence?u=… (fotos del store privado de Blob)
  "live-violation": liveViolation, // POST /api/live/violations (desde el servicio ML, modo en vivo)
};

export default function p2(req: VercelRequest, res: VercelResponse) {
  const route = req.query["route"];
  const fn = typeof route === "string" ? P2_ROUTES[route] : undefined;
  if (!fn) return sendError(res, "NOT_FOUND", "Ruta no encontrada");
  return fn(req, res);
}
