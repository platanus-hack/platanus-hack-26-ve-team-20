// Operaciones del oficial (docs/04 §6, HU-06) sobre la DB de P1. Cada una recibe el officerId de la
// sesión: un oficial nunca lee ni confirma alertas de otro. Las alertas muestran dónde está la cámara
// y el vehículo, nunca datos del dueño (docs/08 §3).
import { audit } from "../domain/audit.ts";
import { DomainError, NotFoundError } from "../domain/errors.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";
import type { OfficerAlertDTO, OfficerLocationRequest } from "../contracts/index.ts";

// Igual que P1 (lib/domain/payments.ts): margen para el pooler de Supabase y funciones en frío.
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

/** Ventana por defecto del listado de alertas si el cliente no manda `since`. */
export const DEFAULT_ALERTS_WINDOW_MS = 12 * 60 * 60_000;

export async function findOfficerByBadge(db: PrismaClient, badge: string) {
  return db.officer.findUnique({ where: { badge }, select: { id: true, badge: true, name: true, onDuty: true } });
}

export async function recordLocation(db: PrismaClient, officerId: string, req: OfficerLocationRequest) {
  return db.$transaction(async (tx) => {
    const officer = await tx.officer.findUnique({ where: { id: officerId }, select: { onDuty: true } });
    if (!officer) throw new NotFoundError("Oficial", officerId);
    const location = await tx.officerLocation.create({
      data: { officerId, lat: req.lat, lng: req.lng, accuracyM: req.accuracyM ?? null },
      select: { recordedAt: true },
    });
    if (officer.onDuty !== req.onDuty) {
      await tx.officer.update({ where: { id: officerId }, data: { onDuty: req.onDuty } });
      // solo se audita el cambio de servicio: la posición llega cada 30 s y no es un evento
      await audit(tx, {
        actor: { type: "OFFICER", id: officerId },
        action: "OFFICER_DUTY",
        entity: "Officer",
        entityId: officerId,
        before: { onDuty: officer.onDuty },
        after: { onDuty: req.onDuty },
      });
    }
    return { recordedAt: location.recordedAt.toISOString(), onDuty: req.onDuty };
  }, TX_OPTIONS);
}

export async function listOfficerAlerts(db: PrismaClient, officerId: string, since?: string, now = new Date()): Promise<OfficerAlertDTO[]> {
  const from = since ? new Date(since) : new Date(now.getTime() - DEFAULT_ALERTS_WINDOW_MS);
  const alerts = await db.alert.findMany({
    where: { officerId, createdAt: { gt: from } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { vehicle: true, sighting: { include: { camera: { include: { intersection: true } } } } },
  });
  return alerts.map((a) => ({
    id: a.id,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    plate: a.vehicle.plate,
    vehicle: `${a.vehicle.make} ${a.vehicle.model} ${a.vehicle.color}`,
    unpaidCount: a.unpaidCount,
    camera: {
      code: a.sighting.camera.code,
      intersection: a.sighting.camera.intersection.name,
      lat: a.sighting.camera.intersection.lat,
      lng: a.sighting.camera.intersection.lng,
    },
    distanceM: a.distanceM ?? 0,
  }));
}

/** SENT → ACKNOWLEDGED. Repetir el acuse devuelve el mismo resultado. */
export async function acknowledgeAlert(db: PrismaClient, officerId: string, alertId: string) {
  return db.$transaction(async (tx) => {
    const alert = await tx.alert.findFirst({ where: { id: alertId, officerId }, select: { status: true, ackAt: true } });
    if (!alert) throw new NotFoundError("Alerta", alertId);
    if (alert.status === "ACKNOWLEDGED") return { status: "ACKNOWLEDGED" as const, ackAt: (alert.ackAt ?? new Date()).toISOString() };
    if (alert.status !== "SENT") throw new DomainError("CONFLICT", "Esta alerta no se puede confirmar");

    const ackAt = new Date();
    const { count } = await tx.alert.updateMany({ where: { id: alertId, officerId, status: "SENT" }, data: { status: "ACKNOWLEDGED", ackAt } });
    if (count === 1) {
      await audit(tx, {
        actor: { type: "OFFICER", id: officerId },
        action: "ALERT_ACK",
        entity: "Alert",
        entityId: alertId,
        before: { status: "SENT" },
        after: { status: "ACKNOWLEDGED" },
      });
    }
    return { status: "ACKNOWLEDGED" as const, ackAt: ackAt.toISOString() };
  }, TX_OPTIONS);
}
