// NotificationStatusStore con Prisma para el webhook de WhatsApp (docs/04 §7). Busca la Notification
// por providerId (wamid), aplica nextNotificationStatus (nunca baja de estado) y audita el cambio.
// La fila se bloquea para que dos eventos del mismo mensaje no se pisen.
import { audit } from "../domain/audit.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { nextNotificationStatus, type NotificationStatusStore } from "./webhook.ts";

const WEBHOOK_ACTOR = { type: "WEBHOOK" as const, id: "meta-whatsapp" };

export function createPrismaStatusStore(db: PrismaClient): NotificationStatusStore {
  return {
    async apply(event) {
      return db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Notification" WHERE "providerId" = ${event.providerId} ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`;
        const id = rows[0]?.id;
        if (!id) return "NOT_FOUND";

        const current = await tx.notification.findUniqueOrThrow({ where: { id }, select: { status: true } });
        const next = nextNotificationStatus(current.status, event.status);
        if (!next) return "UNCHANGED";

        await tx.notification.update({
          where: { id },
          data: { status: next, ...(next === "FAILED" && { error: event.error ?? "Meta informó un fallo de entrega" }) },
        });
        await audit(tx, {
          actor: WEBHOOK_ACTOR,
          action: "NOTIFICATION_STATUS",
          entity: "Notification",
          entityId: id,
          before: { status: current.status },
          after: { status: next, at: event.at.toISOString(), ...(event.error && { error: event.error }) },
        });
        return "UPDATED";
      });
    },
  };
}
