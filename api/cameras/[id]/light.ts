// Semáforo simulado de una cámara (docs/10 §6). Dueño: P2.
// GET: estado actual. POST { state }: crea un LightChange con la hora del servidor (amarillo se guarda como GREEN).
import { LightRequestSchema } from "../../../lib/contracts/index.ts";
import { db } from "../../../lib/db.ts";
import { requireCameraKey } from "../../_lib/camera-key.ts";
import { ApiError, handler, sendOk } from "../../_lib/respond.ts";

export default handler(["GET", "POST"], async (req, res) => {
  // shortcut: protegido con la clave de cámara hasta que P1 publique la guarda de admin (api/_lib/auth.ts).
  requireCameraKey(req);
  const cameraId = String(req.query["id"] ?? "");
  const camera = await db.camera.findUnique({ where: { id: cameraId }, select: { id: true } });
  if (!camera) throw new ApiError("NOT_FOUND", "Cámara no encontrada");

  if (req.method === "POST") {
    const { state } = LightRequestSchema.parse(req.body);
    const change = await db.lightChange.create({ data: { cameraId, state: state === "RED" ? "RED" : "GREEN" } });
    return sendOk(res, { state: change.state, at: change.at.toISOString() }, 201);
  }
  const last = await db.lightChange.findFirst({ where: { cameraId }, orderBy: { at: "desc" } });
  sendOk(res, last ? { state: last.state, at: last.at.toISOString() } : { state: "UNKNOWN", at: null });
});
