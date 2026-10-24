// Red de choques en vivo: los teléfonos con /choques/nodo abierto laten cada segundo con su punto en el mapa
// de la demo. Al reportarse un choque se alerta a los que GRABAN dentro del radio (del reportero, o del punto
// si lo dispara la consola); cada uno recoge su alerta en el siguiente latido, guarda T−10 s → T+5 s de su
// buffer y sube el clip. Una alerta que llega cuando el buffer ya sobrescribió T−10 s queda MISSED.
import {
  CRASH,
  type CrashAlertDTO,
  type CrashAlertStatus,
  type CrashHeartbeatDTO,
  type CrashHeartbeatRequest,
  type CrashIncidentDTO,
  type CrashNetworkDTO,
  type CrashReportDTO,
  type CrashReportRequest,
} from "../contracts/index.ts";
import { audit, SYSTEM_ACTOR } from "../domain/audit.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { DomainError } from "../domain/errors.ts";

/** Nodos que se muestran en el mapa: los que latieron hace poco (los demás cerraron la página). */
const VISIBLE_MS = 20_000;
/** La pantalla en vivo muestra el último incidente de esta ventana. */
const INCIDENT_WINDOW_MS = 30 * 60_000;
/** Los incidentes (y sus clips) más viejos se borran al crear uno nuevo. */
const KEEP_MS = 60 * 60_000;

export interface Point { x: number; y: number }
export interface NodeLike extends Point { id: string; heading: number }

export const distanceM = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Pasado este tiempo desde el choque, el buffer de 30 s ya no tiene T−10 s. */
export const isLate = (occurredAt: Date, now: Date) => now.getTime() - occurredAt.getTime() > CRASH.BUFFER_MS - CRASH.PRE_MS;

/** Nodos a alertar: los que están a `radiusM` del centro, y siempre el reportero. */
export function selectTargets<T extends NodeLike>(nodes: T[], center: Point, radiusM: number, reporterId?: string): T[] {
  return nodes.filter((n) => n.id === reporterId || distanceM(n, center) <= radiusM);
}

/** Estado visible: una alerta pendiente que ya no llega a tiempo cuenta como perdida. */
export function visibleStatus(status: CrashAlertStatus, occurredAt: Date, now: Date): CrashAlertStatus {
  return status === "PENDING" && isLate(occurredAt, now) ? "MISSED" : status;
}

type Db = Pick<PrismaClient, "crashNode" | "crashIncident" | "crashAlert" | "auditLog" | "$transaction">;

export async function heartbeat(db: Db, input: CrashHeartbeatRequest, now = new Date()): Promise<CrashHeartbeatDTO> {
  const data = { name: input.name, x: input.x, y: input.y, heading: input.heading, recording: input.recording, lastSeenAt: now };
  const updated = input.nodeId ? await db.crashNode.updateMany({ where: { id: input.nodeId }, data }) : { count: 0 };
  const nodeId = updated.count === 1 && input.nodeId ? input.nodeId : (await db.crashNode.create({ data, select: { id: true } })).id;

  const pending = await db.crashAlert.findFirst({
    where: { nodeId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, incidentId: true, distanceM: true, incident: { select: { occurredAt: true } } },
  });
  let alert: CrashHeartbeatDTO["alert"] = null;
  if (pending) {
    const late = isLate(pending.incident.occurredAt, now);
    // updateMany con el estado en el where: si dos latidos llegan juntos, solo uno se lleva la alerta.
    const claimed = await db.crashAlert.updateMany({
      where: { id: pending.id, status: "PENDING" },
      data: late ? { status: "MISSED", deliveredAt: now } : { status: "CAPTURING", deliveredAt: now },
    });
    if (claimed.count === 1 && !late) {
      alert = { id: pending.id, incidentId: pending.incidentId, occurredAt: pending.incident.occurredAt.toISOString(), distanceM: pending.distanceM };
    }
  }
  return { serverNow: now.toISOString(), nodeId, alert };
}

const ALERT_SELECT = {
  id: true, nodeId: true, nodeX: true, nodeY: true, nodeHeading: true, distanceM: true, status: true,
  deliveredAt: true, clipT0S: true, clipDurationS: true, node: { select: { name: true } },
} as const;

const INCIDENT_SELECT = {
  id: true, x: true, y: true, radiusM: true, centerX: true, centerY: true, reporterId: true, occurredAt: true,
  alerts: { select: ALERT_SELECT, orderBy: { distanceM: "asc" } },
} as const;

interface IncidentRow {
  id: string; x: number; y: number; radiusM: number; centerX: number; centerY: number; reporterId: string | null; occurredAt: Date;
  alerts: Array<{
    id: string; nodeId: string; nodeX: number; nodeY: number; nodeHeading: number; distanceM: number; status: CrashAlertStatus;
    deliveredAt: Date | null; clipT0S: number | null; clipDurationS: number | null; node: { name: string };
  }>;
}

function toIncidentDTO(i: IncidentRow, now: Date): CrashIncidentDTO {
  return {
    id: i.id, x: i.x, y: i.y, radiusM: i.radiusM, centerX: i.centerX, centerY: i.centerY, reporterId: i.reporterId,
    occurredAt: i.occurredAt.toISOString(),
    alerts: i.alerts.map((a): CrashAlertDTO => {
      const status = visibleStatus(a.status, i.occurredAt, now);
      return {
        id: a.id, nodeId: a.nodeId, nodeName: a.node.name, x: a.nodeX, y: a.nodeY, heading: a.nodeHeading,
        distanceM: a.distanceM, status, deliveredAt: a.deliveredAt?.toISOString() ?? null,
        clipUrl: status === "UPLOADED" ? `/api/choques/clips/${a.id}` : null,
        clipT0S: a.clipT0S, clipDurationS: a.clipDurationS,
      };
    }),
  };
}

export async function network(db: Db, now = new Date()): Promise<CrashNetworkDTO> {
  const [nodes, incident] = await Promise.all([
    db.crashNode.findMany({ where: { lastSeenAt: { gte: new Date(now.getTime() - VISIBLE_MS) } }, orderBy: { createdAt: "asc" } }),
    db.crashIncident.findFirst({
      where: { occurredAt: { gte: new Date(now.getTime() - INCIDENT_WINDOW_MS) } },
      orderBy: { occurredAt: "desc" },
      select: INCIDENT_SELECT,
    }),
  ]);
  return {
    serverNow: now.toISOString(),
    nodes: nodes.map((n) => ({
      id: n.id, name: n.name, x: n.x, y: n.y, heading: n.heading,
      recording: n.recording && now.getTime() - n.lastSeenAt.getTime() <= CRASH.ACTIVE_MS,
      lastSeenAgoMs: now.getTime() - n.lastSeenAt.getTime(),
    })),
    incident: incident ? toIncidentDTO(incident, now) : null,
  };
}

export async function report(db: Db, input: CrashReportRequest, now = new Date()): Promise<CrashReportDTO> {
  const recording = await db.crashNode.findMany({
    where: { recording: true, lastSeenAt: { gte: new Date(now.getTime() - CRASH.ACTIVE_MS) } },
    select: { id: true, x: true, y: true, heading: true },
  });
  const reporter = input.reporterId ? recording.find((n) => n.id === input.reporterId) : undefined;
  if (input.reporterId && !reporter) throw new DomainError("CONFLICT", "Su teléfono no está grabando en la red. Active la cámara y espere un segundo.");
  const center = reporter ?? { x: input.x, y: input.y };
  const targets = selectTargets(recording, center, input.radiusM, reporter?.id);
  const crash = { x: input.x, y: input.y };

  const incident = await db.$transaction(async (tx) => {
    await tx.crashIncident.deleteMany({ where: { occurredAt: { lt: new Date(now.getTime() - KEEP_MS) } } });
    const created = await tx.crashIncident.create({
      data: {
        x: crash.x, y: crash.y, radiusM: input.radiusM, centerX: center.x, centerY: center.y, reporterId: reporter?.id ?? null, occurredAt: now,
        alerts: {
          create: targets.map((n) => ({
            nodeId: n.id, nodeX: n.x, nodeY: n.y, nodeHeading: n.heading, distanceM: distanceM(n, crash),
            // El reportero ya está guardando: no espera su latido.
            ...(n.id === reporter?.id ? { status: "CAPTURING" as const, deliveredAt: now } : {}),
          })),
        },
      },
      select: INCIDENT_SELECT,
    });
    await audit(tx, {
      actor: reporter ? { type: "CITIZEN", id: reporter.id } : SYSTEM_ACTOR,
      action: "CRASH_REPORTED",
      entity: "CrashIncident",
      entityId: created.id,
      after: { x: crash.x, y: crash.y, radiusM: input.radiusM, alerted: targets.length },
    });
    return created;
  });

  const own = reporter ? incident.alerts.find((a) => a.nodeId === reporter.id) : undefined;
  return {
    incident: toIncidentDTO(incident, now),
    ownAlert: own ? { id: own.id, incidentId: incident.id, occurredAt: incident.occurredAt.toISOString(), distanceM: own.distanceM } : null,
  };
}

export async function uploadClip(
  db: Db,
  alertId: string,
  clip: Uint8Array,
  meta: { type: string; t0: number; duration: number },
  now = new Date(),
): Promise<{ clipUrl: string }> {
  if (clip.byteLength === 0) throw new DomainError("VALIDATION_ERROR", "El clip está vacío");
  if (clip.byteLength > CRASH.CLIP_MAX_BYTES) throw new DomainError("VALIDATION_ERROR", "El clip pesa demasiado");
  const r = await db.crashAlert.updateMany({
    where: { id: alertId, status: { in: ["PENDING", "CAPTURING"] } },
    data: { status: "UPLOADED", clip: new Uint8Array(clip), clipType: meta.type, clipT0S: meta.t0, clipDurationS: meta.duration, uploadedAt: now },
  });
  if (r.count === 0) throw new DomainError("NOT_FOUND", "La alerta no existe o ya tiene clip");
  return { clipUrl: `/api/choques/clips/${alertId}` };
}

export async function markMissed(db: Db, alertId: string): Promise<{ status: CrashAlertStatus }> {
  const r = await db.crashAlert.updateMany({ where: { id: alertId, status: { in: ["PENDING", "CAPTURING"] } }, data: { status: "MISSED" } });
  if (r.count === 0) throw new DomainError("NOT_FOUND", "La alerta no existe o ya se resolvió");
  return { status: "MISSED" };
}

export async function readClip(db: Db, alertId: string): Promise<{ bytes: Uint8Array; type: string }> {
  const a = await db.crashAlert.findFirst({ where: { id: alertId, status: "UPLOADED" }, select: { clip: true, clipType: true } });
  if (!a?.clip) throw new DomainError("NOT_FOUND", "Clip no encontrado");
  return { bytes: a.clip, type: a.clipType ?? "video/webm" };
}
