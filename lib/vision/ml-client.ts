// Cliente del servicio de inferencia `ml/` (docs/04-api.md §8). Dueño: P2.
// La respuesta es un borde de confianza: se valida con Zod antes de usarla.
import { z } from "zod";

const TIMEOUT_MS = 45_000;

const point = z.tuple([z.number(), z.number()]);
const box = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

/** Calibración que se manda al servicio; se arma desde las columnas Json de `Camera`. */
export const CalibrationSchema = z.object({
  configVersion: z.number().int(),
  homography: z.object({ imagePoints: z.array(point), groundPointsM: z.array(point) }).nullish(),
  stopLine: z.tuple([point, point]),
  lanes: z.array(z.object({ id: z.string(), polygon: z.array(point), allowedDirection: point })).default([]),
  speedZone: z.object({ yAM: z.number(), yBM: z.number() }).nullish(),
  parameters: z.record(z.string(), z.number()).default({}),
});
export type Calibration = z.infer<typeof CalibrationSchema>;

export interface PredictRequest {
  cameraCode: string;
  clip: { url: string; startedAt: string };
  calibration: Calibration;
}

export const PredictResponseSchema = z.object({
  modelVersion: z.string().min(1),
  latencyMs: z.number(),
  simulated: z.boolean().default(false),
  clip: z.object({
    fps: z.number(),
    frameCount: z.number().int(),
    durationMs: z.number(),
    timestampSource: z.enum(["pts", "fps"]),
  }),
  tracks: z.array(z.object({
    trackId: z.number().int(),
    class: z.string(),
    firstMs: z.number().nullish(),
    lastMs: z.number().nullish(),
    framesSeen: z.number().int().nullish(),
    idSwitchSuspected: z.boolean().default(false),
    laneId: z.string().nullish(),
    stopLine: z.object({ crossed: z.boolean(), atMs: z.number().nullable(), framesConfirmed: z.number().int().nullish() }),
    speedKmh: z.number().nullish(),
    speedValid: z.boolean().default(false),
    directionDeg: z.number().nullish(),
    relation: z.enum(["WITH_FLOW", "AGAINST_FLOW", "UNKNOWN"]).default("UNKNOWN"),
  })),
  plates: z.array(z.object({
    trackId: z.number().int(),
    text: z.string(),
    ocrConfidence: z.number().min(0).max(1),
    votes: z.number().int(),
    bestFrameMs: z.number(),
    rawReads: z.array(z.string()).default([]),
  })),
  keyFrames: z.array(z.object({
    ms: z.number(),
    jpegBase64: z.string().min(1),
    vehicleBox: box.nullish(),
    plateBox: box.nullish(),
  })),
  plateCropBase64: z.string().nullish(),
});
export type PredictResponse = z.infer<typeof PredictResponseSchema>;

/** Cualquier fallo del servicio ML; analyze lo convierte en `NEEDS_REVIEW` (`ML_SERVICE_ERROR`). */
export class MlServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MlServiceError";
  }
}

export interface MlConfig { url: string; token: string }

export function mlConfigFromEnv(env: Record<string, string | undefined> = process.env): MlConfig {
  const url = env["ML_SERVICE_URL"];
  const token = env["ML_SERVICE_TOKEN"];
  if (!url || !token) throw new MlServiceError("Faltan ML_SERVICE_URL o ML_SERVICE_TOKEN");
  return { url: url.replace(/\/+$/, ""), token };
}

/** POST /predict con timeout de 45 s y 1 reintento (no se reintenta tras un timeout: no cabe en los 60 s). */
export async function predict(
  req: PredictRequest,
  options: { config?: MlConfig; fetchImpl?: typeof fetch } = {},
): Promise<PredictResponse> {
  const config = options.config ?? mlConfigFromEnv();
  const doFetch = options.fetchImpl ?? fetch;

  let lastError: MlServiceError | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await doFetch(`${config.url}/predict`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new MlServiceError(`El servicio ML no respondió en ${TIMEOUT_MS / 1000} s`);
      }
      lastError = new MlServiceError("No se pudo conectar con el servicio ML");
      continue;
    }
    if (response.status >= 500) {
      lastError = new MlServiceError(`Servicio ML respondió ${response.status}`);
      continue;
    }
    if (!response.ok) throw new MlServiceError(`Servicio ML respondió ${response.status}`);
    const parsed = PredictResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new MlServiceError("Respuesta del servicio ML inválida");
    return parsed.data;
  }
  throw lastError ?? new MlServiceError("Servicio ML no disponible");
}
