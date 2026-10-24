// dispatchAlert (docs/04 §6, HU-06) con Prisma: carga el avistamiento, los oficiales en servicio y las
// alertas recientes del vehículo, decide con decideAlert (función pura), guarda el Alert y, si hay
// oficial, le avisa por WhatsApp. La ubicación de la cámara es la de su intersección (decisión 4 de
// docs/p3-plan-de-trabajo.md §7): ni Camera ni Sighting guardan lat/lng.
import { audit } from "../domain/audit.ts";
import { DomainError, NotFoundError } from "../domain/errors.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";
import type { DispatchAlert, NotifyOfficerAlert } from "../contracts/index.ts";
import { DEFAULT_ALERT_RADIUS_M, decideAlert, LOCATION_MAX_AGE_MS, SUPPRESSION_WINDOW_MS } from "./decide.ts";

// Igual que P1 (lib/domain/payments.ts): margen para el pooler de Supabase y funciones en frío.
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

export interface DispatcherDeps {
  db: PrismaClient;
  notifyOfficerAlert: NotifyOfficerAlert;
  radiusM?: number;
  now?: () => Date;
}

export function createDispatcher({ db, notifyOfficerAlert, radiusM = DEFAULT_ALERT_RADIUS_M, now = () => new Date() }: DispatcherDeps) {
  const dispatchAlert = (async (sightingId) => {
    const alert = await db.$transaction(async (tx) => {
      const sighting = await tx.sighting.findUnique({
        where: { id: sightingId },
        include: { alert: true, camera: { include: { intersection: true } } },
      });
      if (!sighting) throw new NotFoundError("Avistamiento", sightingId);
      if (sighting.alert) return { ...sighting.alert, isNew: false };
      if (!sighting.vehicleId) throw new DomainError("VALIDATION_ERROR", "El avistamiento no tiene vehículo registrado");
      const vehicleId = sighting.vehicleId;

      // Un avistamiento a la vez por vehículo: la supresión de 10 min no se salta por concurrencia.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`alert:${vehicleId}`}))`;

      // en una transacción interactiva todo va por una sola conexión: consultas en serie
      const at = now();
      const unpaidCount = await tx.fine.count({ where: { status: "PENDING", violation: { vehicleId } } });
      const previousAlerts = await tx.alert.findMany({
        where: { vehicleId, createdAt: { gt: new Date(at.getTime() - SUPPRESSION_WINDOW_MS) } },
        select: { status: true, createdAt: true },
      });
      const officers = await tx.officer.findMany({
        where: { onDuty: true },
        include: {
          locations: {
            where: { recordedAt: { gt: new Date(at.getTime() - LOCATION_MAX_AGE_MS) } },
            orderBy: { recordedAt: "desc" },
            take: 1,
          },
        },
      });

      const decision = decideAlert({
        camera: { lat: sighting.camera.intersection.lat, lng: sighting.camera.intersection.lng },
        officers: officers.map((o) => ({ id: o.id, onDuty: o.onDuty, lastLocation: o.locations[0] ?? null })),
        previousAlerts,
        now: at,
        radiusM,
      });

      const created = await tx.alert.create({
        data: {
          vehicleId,
          sightingId,
          unpaidCount,
          status: decision.status,
          ...(decision.status === "SENT" && { officerId: decision.officerId, distanceM: decision.distanceM }),
        },
      });
      await audit(tx, {
        actor: { type: "SYSTEM" },
        action: "ALERT_DISPATCHED",
        entity: "Alert",
        entityId: created.id,
        after: { status: created.status, officerId: created.officerId, distanceM: created.distanceM, unpaidCount, cameraId: sighting.cameraId },
      });
      return { ...created, isNew: true };
    }, TX_OPTIONS);

    // fuera de la transacción: el WhatsApp no debe retener el candado; nunca lanza
    if (alert.isNew && alert.status === "SENT") await notifyOfficerAlert(alert.id);
    return {
      alertId: alert.id,
      status: alert.status,
      ...(alert.officerId && { officerId: alert.officerId }),
      ...(alert.distanceM !== null && { distanceM: alert.distanceM }),
    };
  }) satisfies DispatchAlert;

  return { dispatchAlert };
}
