// Demo: las placas que el modelo lee con confianza y no están registradas se dan de alta a nombre de los dueños
// de demo, para que la multa se emita y les llegue (sin esto el dominio la manda a revisión por
// PLATE_NOT_FOUND). Las cédulas van en DEMO_DUENOS_CEDULAS ("V…,V…"), nunca en el repo (AGENTS.md regla 3).
// Cada placa va siempre al mismo dueño (según un hash de la placa). Tope anti-spam: a cada dueño se le asigna como
// mucho una placa nueva cada DEMO_ESPERA_MIN minutos (2 por defecto); las demás multas quedan en revisión
// (PLATE_NOT_FOUND) y no mandan WhatsApp. Se cuenta en el AuditLog, así sirve con varias instancias. Dueño: P2.
import { createHash } from "node:crypto";
import { normalizeCedula } from "../contracts/index.ts";
import { audit } from "../domain/audit.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";

type Db = Pick<PrismaClient, "vehicle" | "person" | "auditLog">;

export const ACCION_ASIGNADA = "DEMO_VEHICLE_ASSIGNED";

export function esperaEntreAsignacionesMs(env: Record<string, string | undefined> = process.env): number {
  const min = Number(env["DEMO_ESPERA_MIN"]);
  return (Number.isFinite(min) && min >= 0 ? min : 2) * 60_000;
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
 * dueños configurados, si la placa ya existe, si el dueño no está en la base o si ya recibió una placa nueva
 * hace menos de `esperaMs`. Devuelve la cédula asignada.
 */
export async function assignDemoOwner(
  db: Db, plate: string, cedulas: readonly string[] = demoOwnerCedulas(), esperaMs: number = esperaEntreAsignacionesMs(),
): Promise<string | null> {
  const cedula = ownerFor(plate, cedulas);
  if (!cedula || (await db.vehicle.findUnique({ where: { plate }, select: { id: true } }))) return null;
  const owner = await db.person.findUnique({ where: { cedula }, select: { id: true } });
  if (!owner) {
    console.warn("[demo-owners] el dueño de demo no existe en la base; la placa queda sin dueño");
    return null;
  }
  const reciente = await db.auditLog.findFirst({
    where: { action: ACCION_ASIGNADA, after: { path: ["ownerId"], equals: owner.id }, createdAt: { gt: new Date(Date.now() - esperaMs) } },
    select: { id: true },
  });
  if (reciente) return null; // tope anti-spam: esta multa queda en revisión, sin WhatsApp
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
