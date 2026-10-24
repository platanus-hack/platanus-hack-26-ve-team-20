// Lista de cámaras activas con su calibración (docs/04 §1). Dueño: P2.
import { db } from "../../lib/db.ts";
import { requireCameraKey } from "../_lib/camera-key.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  requireCameraKey(req);
  const cameras = await db.camera.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    select: {
      id: true, code: true, stopLine: true, homography: true, lanes: true, speedZone: true,
      parameters: true, configVersion: true, refFrameUrl: true,
    },
  });
  sendOk(res, cameras);
});
