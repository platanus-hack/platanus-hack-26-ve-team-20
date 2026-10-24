// Multas (P1): montos de ejemplo, vencimiento y token público. Dinero siempre en céntimos enteros.
import { nanoid } from "nanoid";
import type { ViolationType } from "../contracts/index.ts";
import type { Fine, Prisma } from "../generated/prisma/client.ts";

// MONTOS DE EJEMPLO, no legales. VES en céntimos (2.500.000 = Bs. 25.000,00 de ejemplo).
export const FINE_AMOUNTS_EXAMPLE: Record<ViolationType, number> = {
  RED_LIGHT: 2_500_000,
  TURN_ARROW: 2_000_000,
  SPEEDING: 3_500_000,
};

export const FINE_CURRENCY = "VES";
/** Plazo de pago de ejemplo. */
export const FINE_DUE_DAYS = 30;

export function fineDueAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + FINE_DUE_DAYS * 86_400_000);
}

/** Token público (la "llave" del link de la multa): 24 caracteres aleatorios, no secuencial. */
export function newPublicToken(): string {
  return nanoid(24);
}

/** Multas impagas de un vehículo: status PENDING (incluye las vencidas; OVERDUE no se guarda). */
export function countUnpaidFines(
  tx: Pick<Prisma.TransactionClient, "fine">,
  vehicleId: string,
): Promise<number> {
  return tx.fine.count({ where: { status: "PENDING", violation: { vehicleId } } });
}

/** Crea la multa de una violación con monto de ejemplo, vencimiento a 30 días y token único. */
export function createFine(
  tx: Pick<Prisma.TransactionClient, "fine">,
  violation: { id: string; type: ViolationType },
  issuedAt: Date = new Date(),
): Promise<Fine> {
  return tx.fine.create({
    data: {
      violationId: violation.id,
      publicToken: newPublicToken(),
      amountCents: FINE_AMOUNTS_EXAMPLE[violation.type],
      currency: FINE_CURRENCY,
      status: "PENDING",
      issuedAt,
      dueAt: fineDueAt(issuedAt),
    },
  });
}
