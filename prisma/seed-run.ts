// Escribe el seed en la base con `upsert` por id estable: correrlo varias veces no duplica filas y
// restaura el estado sembrado de las multas/violaciones que la demo haya cambiado.
import type { Prisma, PrismaClient } from "../lib/generated/prisma/client.ts";
import type { SeedData } from "./seed-data.ts";

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function applySeed(db: PrismaClient, data: SeedData): Promise<Record<string, number>> {
  for (const i of data.intersections) {
    await db.intersection.upsert({ where: { id: i.id }, create: i, update: i });
  }

  for (const c of data.cameras) {
    const fields = {
      code: c.code,
      intersectionId: c.intersectionId,
      stopLine: json(c.stopLine),
      homography: json(c.homography),
      lanes: json(c.lanes),
      speedZone: json(c.speedZone),
      parameters: json(c.parameters),
      configVersion: c.configVersion,
      speedLimitKmh: c.speedLimitKmh,
      active: c.active,
    };
    await db.camera.upsert({ where: { id: c.id }, create: { id: c.id, ...fields }, update: fields });
  }

  for (const p of data.persons) {
    const { id, ...fields } = p;
    await db.person.upsert({ where: { id }, create: p, update: fields });
  }

  const vehicleIdByPlate = new Map<string, string>();
  for (const v of data.vehicles) {
    const { id, ...fields } = v;
    await db.vehicle.upsert({ where: { id }, create: v, update: fields });
    vehicleIdByPlate.set(v.plate, id);
  }

  let fines = 0;
  let payments = 0;
  for (const v of data.violations) {
    const fields = {
      type: v.type,
      status: v.status,
      reviewReason: v.reviewReason,
      cameraId: v.cameraId,
      vehicleId: v.vehiclePlate ? (vehicleIdByPlate.get(v.vehiclePlate) ?? null) : null,
      plateRead: v.plateRead,
      plateConfidence: v.plateConfidence,
      confidence: v.confidence,
      occurredAt: v.occurredAt,
      modelVersion: "seed",
      aiOutput: json({ seed: true }),
      ruleOutput: json({ seed: true }),
      voidReason: v.voidReason,
    };
    await db.violation.upsert({
      where: { id: v.id },
      create: { id: v.id, idempotencyKey: v.idempotencyKey, ...fields },
      update: fields,
    });

    const ev = { violationId: v.id, kind: "FRAME" as const, url: v.evidence.url, capturedAt: v.evidence.capturedAt, meta: json({ lightState: "RED", seed: true }) };
    await db.evidence.upsert({ where: { id: v.evidence.id }, create: { id: v.evidence.id, ...ev }, update: ev });

    if (v.fine) {
      const f = v.fine;
      const fineFields = {
        violationId: v.id, publicToken: f.publicToken, amountCents: f.amountCents, currency: f.currency,
        status: f.status, issuedAt: f.issuedAt, dueAt: f.dueAt, paidAt: f.paidAt,
      };
      await db.fine.upsert({ where: { id: f.id }, create: { id: f.id, ...fineFields }, update: fineFields });
      fines += 1;

      if (f.payment) {
        const pay = {
          fineId: f.id, method: "C2P_SIMULATED", status: "APPROVED" as const, payerBankCode: "0102",
          payerPhone: "04120000001", payerCedula: "V99000001", amountCents: f.amountCents, reference: f.payment.reference,
        };
        await db.payment.upsert({
          where: { id: f.payment.id },
          create: { id: f.payment.id, idempotencyKey: f.payment.idempotencyKey, ...pay },
          update: pay,
        });
        payments += 1;
      }
    }
  }

  for (const o of data.officers) {
    const { id, ...fields } = o;
    await db.officer.upsert({ where: { id }, create: o, update: fields });
  }
  for (const l of data.officerLocations) {
    const { id, ...fields } = l;
    await db.officerLocation.upsert({ where: { id }, create: l, update: fields });
  }

  return {
    intersections: data.intersections.length,
    cameras: data.cameras.length,
    persons: data.persons.length,
    vehicles: data.vehicles.length,
    violations: data.violations.length,
    fines,
    payments,
    officers: data.officers.length,
    officerLocations: data.officerLocations.length,
  };
}
