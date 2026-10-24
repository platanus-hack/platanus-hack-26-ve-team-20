// Decisión de una alerta a oficial (algoritmo de docs/04 §6), como función pura: sin DB ni red.
// lib/alerts/dispatch.ts (con Prisma, pendiente) carga los datos, llama decideAlert, guarda el Alert
// y llama notifyOfficerAlert. Las alertas dicen dónde está la cámara, nunca datos del dueño (docs/08 §3).
import { haversineMeters, type LatLng } from "../geo/haversine.ts";
import type { AlertStatus } from "../contracts/index.ts";

/** Misma placa: máximo 1 alerta cada 10 min (anti-acoso, docs/08 §3). */
export const SUPPRESSION_WINDOW_MS = 10 * 60_000;
/** Ubicaciones de oficial más viejas que esto se ignoran (docs/04 §6). */
export const LOCATION_MAX_AGE_MS = 10 * 60_000;
export const DEFAULT_ALERT_RADIUS_M = 1500;

/**
 * Qué alertas previas suprimen una nueva. Propuesta de P3 (docs/p3-plan-de-trabajo.md §7, decisión 5),
 * pendiente de acordar con P1: un NO_OFFICER_NEARBY o un SUPPRESSED no cuentan, para que un oficial
 * que entra en servicio minutos después sí reciba la alerta.
 */
export const SUPPRESSING_STATUSES: readonly AlertStatus[] = ["SENT", "ACKNOWLEDGED"];

export interface OfficerCandidate {
  id: string;
  onDuty: boolean;
  /** Última ubicación conocida; `null` si nunca compartió ubicación. */
  lastLocation: (LatLng & { recordedAt: Date }) | null;
}

export interface PreviousAlert {
  status: AlertStatus;
  createdAt: Date;
}

export interface AlertDecisionInput {
  /** Dónde se vio el vehículo: la cámara (o su intersección), no el ciudadano. */
  camera: LatLng;
  officers: readonly OfficerCandidate[];
  /** Alertas previas del mismo vehículo. */
  previousAlerts: readonly PreviousAlert[];
  now: Date;
  radiusM?: number;
}

export type AlertDecision =
  | { status: "SENT"; officerId: string; distanceM: number }
  | { status: "NO_OFFICER_NEARBY" }
  | { status: "SUPPRESSED" };

export function decideAlert(input: AlertDecisionInput): AlertDecision {
  const now = input.now.getTime();
  const radiusM = input.radiusM ?? DEFAULT_ALERT_RADIUS_M;

  const recentlyAlerted = input.previousAlerts.some(
    (a) => SUPPRESSING_STATUSES.includes(a.status) && now - a.createdAt.getTime() < SUPPRESSION_WINDOW_MS,
  );
  if (recentlyAlerted) return { status: "SUPPRESSED" };

  let best: { officerId: string; distanceM: number } | null = null;
  for (const officer of input.officers) {
    const loc = officer.lastLocation;
    if (!officer.onDuty || !loc || now - loc.recordedAt.getTime() >= LOCATION_MAX_AGE_MS) continue;
    const distanceM = haversineMeters(input.camera, loc);
    if (distanceM > radiusM) continue;
    // empate: el id menor, para que la decisión no dependa del orden de la consulta
    if (!best || distanceM < best.distanceM || (distanceM === best.distanceM && officer.id < best.officerId)) {
      best = { officerId: officer.id, distanceM };
    }
  }

  return best
    ? { status: "SENT", officerId: best.officerId, distanceM: Math.round(best.distanceM) }
    : { status: "NO_OFFICER_NEARBY" };
}

/** `ALERT_RADIUS_METERS` del entorno; 1500 si falta o no es un número positivo. */
export function alertRadiusFromEnv(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.ALERT_RADIUS_METERS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_ALERT_RADIUS_M;
}
