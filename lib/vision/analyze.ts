// Post-proceso del clip (docs/04-api.md §8): servicio ML → reglas → evidencias → VisionResult. Dueño: P2.
// Nunca pierde el clip: si el servicio ML falla o la calibración no sirve, devuelve NEEDS_REVIEW
// (`ML_SERVICE_ERROR`) con la URL del clip para que lo revise un humano.
import type { Analyze, VisionResult } from "../contracts/index.ts";
import { CalibrationSchema, MlServiceError, predict as defaultPredict, type PredictResponse } from "./ml-client.ts";
import { LIGHT_CHANGE_MARGIN_MS, evaluate, lightAt, toServerTime, type LightChangeLike } from "./rules.ts";

export interface AnalyzeDeps {
  /** `calibration` = columnas de `Camera` (stopLine, homography, lanes, speedZone, parameters, configVersion). */
  loadCamera(cameraId: string): Promise<{ code: string; calibration: unknown }>;
  /** Cambios de luz de la cámara hasta `until` (incluye el último anterior al clip). */
  loadLightChanges(cameraId: string, until: Date): Promise<LightChangeLike[]>;
  /** Guarda un JPEG (base64) como evidencia y devuelve su URL pública. */
  saveImage(path: string, jpegBase64: string): Promise<string>;
  predict?: typeof defaultPredict;
  threshold?: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function createAnalyze(deps: AnalyzeDeps): Analyze {
  const predict = deps.predict ?? defaultPredict;
  const threshold = deps.threshold ?? 0.8;

  return async (input) => {
    const at = (ms: number) => toServerTime(input.startedAt, input.clockOffsetMs, ms);
    const camera = await deps.loadCamera(input.cameraId);

    let res: PredictResponse;
    let stopLineFrames: number | undefined;
    try {
      const calibration = CalibrationSchema.parse(camera.calibration);
      stopLineFrames = calibration.parameters["stopLineFrames"];
      res = await predict({ cameraCode: camera.code, clip: { url: input.clipUrl, startedAt: input.startedAt }, calibration });
    } catch (err) {
      if (!(err instanceof MlServiceError) && !(err instanceof Error && err.name === "ZodError")) throw err;
      return {
        cameraId: input.cameraId, type: "RED_LIGHT", verdict: "NEEDS_REVIEW", reviewReason: "ML_SERVICE_ERROR",
        plate: null, plateConfidence: 0, confidence: 0, occurredAt: iso(at(0)), frames: [], clipUrl: input.clipUrl,
        crossing: { crossedStopLine: false, lightState: "UNKNOWN" },
        motion: { speedKmh: null, laneId: null, directionDeg: null, relation: "UNKNOWN" },
        modelVersion: "unknown", aiOutput: { error: err.message }, ruleOutput: null, idempotencyKey: input.idempotencyKey,
      };
    }

    const lightChanges = await deps.loadLightChanges(input.cameraId, new Date(at(res.clip.durationMs) + LIGHT_CHANGE_MARGIN_MS));
    const rule = evaluate(res, { lightChanges, startedAt: input.startedAt, clockOffsetMs: input.clockOffsetMs, threshold, stopLineFrames });

    const prefix = `evidence/${input.cameraId}/${input.idempotencyKey}`;
    const frames: VisionResult["frames"] = await Promise.all(res.keyFrames.map(async (k) => ({
      url: await deps.saveImage(`${prefix}/frame-${Math.round(k.ms)}.jpg`, k.jpegBase64),
      capturedAt: iso(at(k.ms)),
      lightState: lightAt(lightChanges, at(k.ms)),
      ...(k.vehicleBox ? { vehicleBox: k.vehicleBox } : {}),
    })));
    const plateCropUrl = res.plateCropBase64 ? await deps.saveImage(`${prefix}/plate.jpg`, res.plateCropBase64) : undefined;

    return {
      cameraId: input.cameraId,
      type: "RED_LIGHT",
      verdict: rule.verdict,
      ...(rule.reviewReason ? { reviewReason: rule.reviewReason } : {}),
      plate: rule.plate,
      plateConfidence: rule.plateConfidence,
      // El motor no expone la confianza del detector: la del OCR votado es la más baja de la cadena.
      confidence: rule.plateConfidence,
      occurredAt: iso(rule.crossedAt ?? at(0)),
      frames,
      clipUrl: input.clipUrl,
      crossing: rule.crossing,
      motion: rule.motion,
      modelVersion: res.modelVersion,
      ...(plateCropUrl ? { plateCropUrl } : {}),
      // Sin los JPEG en base64: ya están en Blob y pesarían en la DB.
      aiOutput: {
        ...res,
        keyFrames: res.keyFrames.map((k) => ({ ms: k.ms, vehicleBox: k.vehicleBox, plateBox: k.plateBox })),
        plateCropBase64: undefined,
        incidents: res.incidents.map((i) => ({ ...i, sceneJpegBase64: undefined })),
      },
      ruleOutput: rule,
      idempotencyKey: input.idempotencyKey,
    };
  };
}
