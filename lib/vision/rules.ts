// Reglas sobre la respuesta del servicio ML (docs/02-arquitectura.md §5, punto 6). Dueño: P2.
// El servicio solo dice CUÁNDO cruzó cada vehículo; aquí se decide con la luz real en ese instante.
// Doble llave: VIOLATION solo si el cruce está confirmado con luz RED y la placa es válida con confianza.
import {
  isPlausiblePlate, normalizePlate,
  type Crossing, type LightState, type MotionEstimate, type ReviewReason, type Verdict,
} from "../contracts/index.ts";
import type { PredictResponse } from "./ml-client.ts";

/** Parámetro de arranque, no validado: si la luz cambia a menos de esto del cruce, decide un humano. */
export const LIGHT_CHANGE_MARGIN_MS = 300;

/** Lecturas de OCR que deben coincidir: una sola lectura sale con confianza 1.0 aunque sea basura. */
export const MIN_PLATE_VOTES = 2;

export interface LightChangeLike { state: string; at: Date | string }

type VisionReviewReason = Extract<ReviewReason, "LOW_CONFIDENCE" | "NO_PLATE" | "MODEL_RULE_DISAGREE">;

export interface RuleResult {
  verdict: Verdict;
  reviewReason?: VisionReviewReason;
  trackId: number | null;
  plate: string | null;
  plateConfidence: number;
  crossing: Crossing;
  motion: MotionEstimate;
  /** Instante del cruce en hora del servidor (epoch ms), o null si nadie cruzó. */
  crossedAt: number | null;
}

/** Hora del servidor (epoch ms) de un instante del clip. `clockOffsetMs = serverNow − phoneNow` (docs/04 §1). */
export function toServerTime(startedAt: string, clockOffsetMs: number, atMs: number): number {
  return Date.parse(startedAt) + clockOffsetMs + atMs;
}

const time = (c: LightChangeLike) => (c.at instanceof Date ? c.at.getTime() : Date.parse(c.at));

function asLight(state: string): LightState {
  // Amarillo cuenta como verde (docs/10 §6).
  return state === "RED" ? "RED" : state === "GREEN" || state === "YELLOW" ? "GREEN" : "UNKNOWN";
}

/** Estado del semáforo en `t`: el último cambio en o antes de `t`; sin cambios previos, `UNKNOWN`. */
export function lightAt(changes: readonly LightChangeLike[], t: number): LightState {
  let best: LightChangeLike | undefined;
  for (const c of changes) if (time(c) <= t && (!best || time(c) >= time(best))) best = c;
  return best ? asLight(best.state) : "UNKNOWN";
}

function changesNear(changes: readonly LightChangeLike[], t: number): boolean {
  return changes.some((c) => Math.abs(time(c) - t) < LIGHT_CHANGE_MARGIN_MS);
}

export function evaluate(
  res: PredictResponse,
  ctx: {
    lightChanges: readonly LightChangeLike[];
    startedAt: string;
    clockOffsetMs: number;
    threshold: number;
    stopLineFrames?: number;
  },
): RuleResult {
  // shortcut: un VisionResult por clip; con varios cruces se toma el primero. Separar por track si los clips traen varios.
  const crosser = res.tracks
    .filter((t) => t.stopLine.crossed && t.stopLine.atMs !== null)
    .sort((a, b) => (a.stopLine.atMs ?? 0) - (b.stopLine.atMs ?? 0))[0];

  const motion: MotionEstimate = {
    speedKmh: crosser?.speedValid ? (crosser.speedKmh ?? null) : null,
    laneId: crosser?.laneId ?? null,
    directionDeg: crosser?.directionDeg ?? null,
    relation: crosser?.relation ?? "UNKNOWN",
  };

  if (!crosser || crosser.stopLine.atMs === null) {
    const lightState = lightAt(ctx.lightChanges, toServerTime(ctx.startedAt, ctx.clockOffsetMs, 0));
    return {
      verdict: "NO_VIOLATION", trackId: null, plate: null, plateConfidence: 0,
      crossing: { crossedStopLine: false, lightState }, motion, crossedAt: null,
    };
  }

  const atMs = crosser.stopLine.atMs;
  const crossedAt = toServerTime(ctx.startedAt, ctx.clockOffsetMs, atMs);
  const lightState = lightAt(ctx.lightChanges, crossedAt);
  const read = res.plates.find((p) => p.trackId === crosser.trackId);
  const plate = read ? normalizePlate(read.text) : null;
  const plateConfidence = read?.ocrConfidence ?? 0;
  const base = { trackId: crosser.trackId, plate, plateConfidence, crossing: { crossedStopLine: true, atMs, lightState }, motion, crossedAt };
  const review = (reviewReason: VisionReviewReason): RuleResult => ({ ...base, verdict: "NEEDS_REVIEW", reviewReason });

  if (lightState === "GREEN") return { ...base, verdict: "NO_VIOLATION" };
  const framesConfirmed = crosser.stopLine.framesConfirmed;
  const weakTrack = crosser.idSwitchSuspected
    || (ctx.stopLineFrames !== undefined && framesConfirmed != null && framesConfirmed < ctx.stopLineFrames);
  if (lightState === "UNKNOWN" || weakTrack || changesNear(ctx.lightChanges, crossedAt)) return review("MODEL_RULE_DISAGREE");
  // Aquí solo se juzga si la LECTURA es confiable; si la placa existe lo decide el dominio (PLATE_NOT_FOUND).
  if (!plate || !isPlausiblePlate(plate)) return review("NO_PLATE");
  if (plateConfidence < ctx.threshold || (read?.votes ?? 0) < MIN_PLATE_VOTES) return review("LOW_CONFIDENCE");
  return { ...base, verdict: "VIOLATION" };
}
