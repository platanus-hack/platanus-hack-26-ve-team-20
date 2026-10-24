// `analyze` real: Prisma (cámara y LightChange) + Vercel Blob (evidencia) + servicio ML. Dueño: P2. Solo servidor.
import type { Analyze } from "../contracts/index.ts";
import { db } from "../db.ts";
import { saveImage } from "../storage/blob.ts";
import { createAnalyze } from "./analyze.ts";

export const analyze: Analyze = createAnalyze({
  async loadCamera(cameraId) {
    const c = await db.camera.findUniqueOrThrow({ where: { id: cameraId } });
    return {
      code: c.code,
      calibration: {
        configVersion: c.configVersion, stopLine: c.stopLine, homography: c.homography,
        lanes: c.lanes, speedZone: c.speedZone, parameters: c.parameters ?? {},
      },
    };
  },
  // Los últimos 50 cambios hasta el fin del clip bastan para saber la luz en cualquier instante del clip.
  loadLightChanges: (cameraId, until) =>
    db.lightChange.findMany({ where: { cameraId, at: { lte: until } }, orderBy: { at: "desc" }, take: 50 }),
  saveImage,
  threshold: Number(process.env["VISION_CONFIDENCE_THRESHOLD"]) || 0.8,
});
