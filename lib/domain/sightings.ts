// registerSighting (P1): una cámara vio una placa. Guarda el avistamiento y cuenta las multas
// impagas del vehículo (para decidir si hay que alertar a un oficial: lo hace P3 con dispatchAlert).
//
// Privacidad (docs/08): el avistamiento guarda solo placa, cámara y hora; la alerta mostrará dónde
// fue visto el vehículo, nunca datos del dueño. En producción, los avistamientos de placas sin
// multas deberían borrarse a las 24–72 h.
import { normalizePlate, type RegisterSighting } from "../contracts/index.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { NotFoundError } from "./errors.ts";
import { countUnpaidFines } from "./fines.ts";

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

export function createRegisterSighting(db: PrismaClient): RegisterSighting {
  return (s) =>
    db.$transaction(async (tx) => {
      const camera = await tx.camera.findUnique({ where: { id: s.cameraId } });
      if (!camera) throw new NotFoundError("Cámara", s.cameraId);

      const plate = normalizePlate(s.plate);
      const vehicle = await tx.vehicle.findUnique({ where: { plate } });
      const unpaidCount = vehicle ? await countUnpaidFines(tx, vehicle.id) : 0;

      const sighting = await tx.sighting.create({
        data: {
          cameraId: s.cameraId,
          vehicleId: vehicle?.id ?? null,
          plateRead: plate,
          seenAt: new Date(s.seenAt),
          evidenceUrl: s.evidenceUrl ?? null,
        },
      });

      return { sightingId: sighting.id, ...(vehicle && { vehicleId: vehicle.id }), unpaidCount };
    }, TX_OPTIONS);
}
