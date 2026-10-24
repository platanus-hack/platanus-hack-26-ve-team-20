// Salida de lib/vision (P2) → entrada de lib/domain (P1). docs/04-api.md §0.
import type { LightState, ReviewReason, Verdict, ViolationType } from "./common.ts";

/** Caja normalizada 0..1 (origen arriba-izquierda). */
export interface Box { x: number; y: number; w: number; h: number }

/** Fotograma clave guardado como evidencia. `capturedAt` = hora real (PTS + inicio del clip). */
export interface FrameInput { url: string; capturedAt: string /* ISO */ }

export type RoadRelation = "WITH_FLOW" | "AGAINST_FLOW" | "UNKNOWN";

/** Estimación demo del servicio ML (no sancionatoria). */
export interface MotionEstimate {
  speedKmh: number | null;        // null sin homografía válida, fps < 24 o track dudoso
  laneId: string | null;
  directionDeg: number | null;    // ángulo del movimiento en el plano del suelo
  relation: RoadRelation;         // respecto a la dirección permitida del carril
}

export interface Crossing { crossedStopLine: boolean; atMs?: number; lightState: LightState }

export interface VisionResult {
  cameraId: string;
  type: ViolationType;
  verdict: Verdict;
  reviewReason?: Extract<ReviewReason, "LOW_CONFIDENCE" | "NO_PLATE" | "MODEL_RULE_DISAGREE" | "ML_SERVICE_ERROR">;
  plate: string | null;           // normalizada
  plateConfidence: number;        // 0..1
  confidence: number;             // 0..1
  occurredAt: string;             // ISO
  frames: Array<FrameInput & { lightState: LightState; vehicleBox?: Box }>;   // fotogramas clave
  clipUrl: string;                // clip en Blob (evidencia)
  crossing: Crossing;
  motion: MotionEstimate;
  modelVersion: string;
  plateCropUrl?: string;
  aiOutput: unknown;              // respuesta cruda del servicio ML
  ruleOutput: unknown;            // resultado de la regla (lib/vision/rules)
  idempotencyKey: string;
}
