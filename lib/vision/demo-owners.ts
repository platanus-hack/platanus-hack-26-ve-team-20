// Demo: las placas que el modelo lee con confianza y no están registradas se dan de alta a nombre de los dueños
// de demo, para que la multa se emita y les llegue (sin esto el dominio la manda a revisión por
// PLATE_NOT_FOUND). Las cédulas van en DEMO_DUENOS_CEDULAS ("V…,V…"), nunca en el repo (AGENTS.md regla 3).
// Cada placa va siempre al mismo dueño (según un hash de la placa). Todas las multas se asignan (salen en la cuenta);
// el tope anti-spam está en el WhatsApp: un dueño de demo recibe como mucho uno cada DEMO_WHATSAPP_CADA_MIN minutos
// (60 por defecto), contado en la tabla Notification, así sirve con varias instancias. Dueño: P2.
import { createHash } from "node:crypto";
import { normalizeCedula } from "../contracts/index.ts";
import { audit } from "../domain/audit.ts";
import type { NotifyFineIssued } from "../contracts/index.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";

type Db = Pick<PrismaClient, "vehicle" | "person" | "auditLog">;

export const ACCION_ASIGNADA = "DEMO_VEHICLE_ASSIGNED";

export function esperaEntreWhatsappMs(env: Record<string, string | undefined> = process.env): number {
  const min = Number(env["DEMO_WHATSAPP_CADA_MIN"]);
  return (Number.isFinite(min) && min >= 0 ? min : 60) * 60_000;
}

export function demoOwnerCedulas(env: Record<string, string | undefined> = process.env): string[] {
  return (env["DEMO_DUENOS_CEDULAS"] ?? "").split(",").map((c) => normalizeCedula(c.trim())).filter(Boolean);
}

/** Dueño fijo para una placa: el mismo cada vez que vuelva a pasar. */
export function ownerFor(plate: string, cedulas: readonly string[]): string | undefined {
  if (cedulas.length === 0) return undefined;
  return cedulas[createHash("sha256").update(plate).digest()[0]! % cedulas.length];
}

/**
 * Si la placa no existe, crea el vehículo a nombre de su dueño de demo y lo audita. No hace nada si no hay
 * dueños configurados, si la placa ya existe o si el dueño no está en la base. Devuelve la cédula asignada.
 */
export async function assignDemoOwner(db: Db, plate: string, cedulas: readonly string[] = demoOwnerCedulas()): Promise<string | null> {
  const cedula = ownerFor(plate, cedulas);
  if (!cedula || (await db.vehicle.findUnique({ where: { plate }, select: { id: true } }))) return null;
  const owner = await db.person.findUnique({ where: { cedula }, select: { id: true } });
  if (!owner) {
    console.warn("[demo-owners] el dueño de demo no existe en la base; la placa queda sin dueño");
    return null;
  }
  try {
    const vehicle = await db.vehicle.create({
      data: { plate, make: "Sin datos", model: "Sin datos", color: "Sin datos", ownerId: owner.id },
      select: { id: true },
    });
    await audit(db, {
      actor: { type: "SYSTEM", id: "demo-owners" }, action: ACCION_ASIGNADA, entity: "Vehicle",
      entityId: vehicle.id, after: { plate, ownerId: owner.id },
    });
    return cedula;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return null; // otra multa registró la misma placa a la vez
    throw e;
  }
}

type DbAvisos = Pick<PrismaClient, "fine" | "notification">;

/**
 * Envuelve el aviso de multa: a un dueño de demo solo se le manda un WhatsApp por ventana; las demás multas quedan
 * registradas (y salen en su cuenta) sin mensaje. Para el resto de los titulares no cambia nada.
 * shortcut: dos multas del mismo dueño en el mismo instante pueden mandar dos mensajes (no hay bloqueo entre ellas).
 */
export function notificarConTope(
  notify: NotifyFineIssued, db: DbAvisos, cedulas: () => readonly string[] = demoOwnerCedulas,
  esperaMs: () => number = esperaEntreWhatsappMs,
): NotifyFineIssued {
  return async (fineId) => {
    const fine = await db.fine.findUnique({
      where: { id: fineId },
      select: { violation: { select: { vehicle: { select: { ownerId: true, owner: { select: { cedula: true } } } } } } },
    });
    const vehicle = fine?.violation.vehicle;
    if (vehicle && cedulas().includes(vehicle.owner.cedula)) {
      const reciente = await db.notification.findFirst({
        where: {
          template: "FINE_ISSUED", status: { in: ["QUEUED", "SENT", "DELIVERED", "READ"] },
          createdAt: { gt: new Date(Date.now() - esperaMs()) }, fine: { violation: { vehicle: { ownerId: vehicle.ownerId } } },
        },
        select: { id: true },
      });
      if (reciente) return { channel: "WHATSAPP", status: "DRY_RUN" }; // ya recibió su WhatsApp en esta ventana
    }
    return notify(fineId);
  };
}
