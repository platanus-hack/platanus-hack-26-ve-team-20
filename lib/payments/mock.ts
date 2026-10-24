// Mock de lib/payments (P3) con la firma de lib/contracts/modules.ts. Se activa con USE_MOCKS=true
// mientras no exista lib/payments/c2p.ts. Mismas reglas que el simulador (docs/04 §5), sin espera.
// SIMULADO: no hay banco ni dinero. La clave C2P nunca se devuelve ni se loguea.
import type { ChargeC2P } from "../contracts/index.ts";

/** Referencia estable por idempotencyKey: el mismo intento siempre da la misma referencia. */
function mockReference(idempotencyKey: string): string {
  let hash = 0;
  for (const char of idempotencyKey) hash = (hash * 31 + char.charCodeAt(0)) % 100_000_000;
  return `SIM-${String(hash).padStart(8, "0")}`;
}

export const chargeC2P = (async (req) => {
  if (req.c2pKey === "000000") return { status: "REJECTED", failureCode: "INVALID_KEY" };
  if (req.c2pKey === "111111") return { status: "REJECTED", failureCode: "INSUFFICIENT_FUNDS" };
  return { status: "APPROVED", reference: mockReference(req.idempotencyKey) };
}) satisfies ChargeC2P;
