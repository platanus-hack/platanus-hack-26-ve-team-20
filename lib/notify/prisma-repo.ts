// NotificationRepo con Prisma (lib/db.ts de P1). Escribe Notification y su AuditLog; nunca guarda
// el texto del mensaje ni el teléfono en la auditoría.
import { audit, SYSTEM_ACTOR } from "../domain/audit.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";
import type { NotificationRepo } from "./notifier.ts";

export function createPrismaNotificationRepo(db: PrismaClient): NotificationRepo {
  return {
    async fineMessage(fineId) {
      const fine = await db.fine.findUnique({
        where: { id: fineId },
        include: {
          violation: { include: { vehicle: { include: { owner: true } }, camera: { include: { intersection: true } } } },
        },
      });
      if (!fine) return null;
      const v = fine.violation;
      return {
        to: v.vehicle?.owner.phone ?? null,
        type: v.type,
        intersection: v.camera.intersection.name,
        occurredAt: v.occurredAt,
        plate: v.vehicle?.plate ?? v.plateRead ?? "",
        amountCents: fine.amountCents,
        currency: fine.currency,
        publicToken: fine.publicToken,
      };
    },

    async paymentMessage(fineId) {
      const fine = await db.fine.findUnique({
        where: { id: fineId },
        include: {
          violation: { include: { vehicle: { include: { owner: true } } } },
          payments: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      if (!fine) return null;
      const v = fine.violation;
      return {
        to: v.vehicle?.owner.phone ?? null,
        plate: v.vehicle?.plate ?? v.plateRead ?? "",
        reference: fine.payments[0]?.reference ?? null,
      };
    },

    async create({ fineId, to, template }) {
      const n = await db.notification.create({ data: { fineId, to, template, channel: "WHATSAPP", status: "QUEUED" }, select: { id: true } });
      return n.id;
    },

    async finish(notificationId, outcome) {
      await db.$transaction(async (tx) => {
        const n = await tx.notification.update({
          where: { id: notificationId },
          data: {
            status: outcome.status,
            ...(outcome.status === "SENT" && { providerId: outcome.providerId }),
            ...(outcome.status === "FAILED" && { error: outcome.error }),
          },
        });
        await audit(tx, {
          actor: SYSTEM_ACTOR,
          action: "NOTIFICATION_SENT",
          entity: "Notification",
          entityId: notificationId,
          after: { template: n.template, fineId: n.fineId, status: n.status, error: n.error },
        });
      });
    },
  };
}
