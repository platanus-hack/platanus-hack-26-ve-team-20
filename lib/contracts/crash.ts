// Red de choques en vivo (/choques/nodo y /choques/vivo). Los teléfonos que tienen la página abierta graban
// en un buffer circular; al reportarse un choque, el servidor alerta a los que graban dentro del radio y cada
// uno sube su ventana T−10 s → T+5 s. Las posiciones son metros del mapa de la demo (no GPS).
import { z } from "zod";

export const CRASH = {
  /** Mapa de la demo, en metros. */
  WORLD_W: 800,
  WORLD_H: 480,
  /** Un nodo sin latido en este tiempo deja de contar como presente. */
  ACTIVE_MS: 8_000,
  BUFFER_MS: 30_000,
  PRE_MS: 10_000,
  POST_MS: 5_000,
  /** Límite de cuerpo de una Vercel Function (4,5 MB) con margen. */
  CLIP_MAX_BYTES: 4_000_000,
  /** Cubre todo el mapa de la demo (800 × 480 m): todos los teléfonos que graban entran en la alerta. */
  DEFAULT_RADIUS_M: 1000,
} as const;

export const CRASH_ALERT_STATUSES = ["PENDING", "CAPTURING", "UPLOADED", "MISSED"] as const;
export type CrashAlertStatus = (typeof CRASH_ALERT_STATUSES)[number];

const x = z.number().min(0).max(CRASH.WORLD_W);
const y = z.number().min(0).max(CRASH.WORLD_H);
const nodeId = z.string().min(1).max(40);

export const CrashHeartbeatRequestSchema = z.object({
  nodeId: nodeId.optional(),
  name: z.string().trim().min(1).max(24),
  x,
  y,
  heading: z.number().min(-360).max(360),
  recording: z.boolean(),
});
export type CrashHeartbeatRequest = z.infer<typeof CrashHeartbeatRequestSchema>;

export const CrashReportRequestSchema = z.object({
  x,
  y,
  radiusM: z.number().int().min(50).max(1000),
  /** Teléfono que lo vio; sin él (consola), el radio se mide desde el punto del choque. */
  reporterId: nodeId.optional(),
});
export type CrashReportRequest = z.infer<typeof CrashReportRequestSchema>;

export const CrashAlertUpdateSchema = z.object({ status: z.literal("MISSED") });

/** Query de la subida del clip (el cuerpo es el video crudo). */
export const CrashClipQuerySchema = z.object({
  id: z.string().min(1),
  type: z.string().regex(/^video\/[\w.+-]+(;[\w=,.\s-]+)?$/).max(80),
  /** Segundo del clip en que ocurrió el choque. */
  t0: z.coerce.number().min(0).max(60),
  duration: z.coerce.number().min(0).max(120),
});

export interface CrashNodeDTO {
  id: string;
  name: string;
  x: number;
  y: number;
  heading: number;
  recording: boolean;
  lastSeenAgoMs: number;
}

export interface CrashAlertDTO {
  id: string;
  nodeId: string;
  nodeName: string;
  /** Dónde estaba el nodo al ocurrir el choque. */
  x: number;
  y: number;
  heading: number;
  distanceM: number;
  status: CrashAlertStatus;
  deliveredAt: string | null;
  clipUrl: string | null;
  clipT0S: number | null;
  clipDurationS: number | null;
}

export interface CrashIncidentDTO {
  id: string;
  x: number;
  y: number;
  radiusM: number;
  /** Desde dónde se midió el radio: el reportero o el punto del choque. */
  centerX: number;
  centerY: number;
  reporterId: string | null;
  occurredAt: string;
  alerts: CrashAlertDTO[];
}

export interface CrashNetworkDTO {
  serverNow: string;
  nodes: CrashNodeDTO[];
  incident: CrashIncidentDTO | null;
}

/** Respuesta del latido: la alerta que este nodo debe capturar ahora, si hay. */
export interface CrashHeartbeatDTO {
  serverNow: string;
  nodeId: string;
  alert: { id: string; incidentId: string; occurredAt: string; distanceM: number } | null;
}

export interface CrashReportDTO {
  incident: CrashIncidentDTO;
  /** Si reportó un teléfono, su propia alerta (ya en CAPTURING) para que guarde sin esperar el latido. */
  ownAlert: CrashHeartbeatDTO["alert"];
}
