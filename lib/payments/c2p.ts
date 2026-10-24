// Simulador de Pago Móvil C2P (docs/04 §5). SIMULADO: no hay banco, agregador ni dinero.
// Tiene la misma firma (ChargeC2P) que tendría un adaptador bancario real.
// La clave C2P nunca se devuelve, se guarda ni se loguea. La idempotencia la resuelve
// api/payments/c2p.ts con Payment.idempotencyKey, no este módulo.
import { randomInt } from "node:crypto";
import type { ChargeC2P } from "../contracts/index.ts";

/** Claves que el simulador rechaza a propósito para probar los errores. */
export const SIMULATED_REJECTIONS: Readonly<Record<string, string>> = {
  "000000": "INVALID_KEY",
  "111111": "INSUFFICIENT_FUNDS",
};

export interface C2PSimulatorOptions {
  /** Rango de la espera simulada del banco, en ms. */
  delayMs?: { min: number; max: number };
  sleep?: (ms: number) => Promise<void>;
  /** Entero en [min, max]; por defecto `crypto.randomInt`. */
  randomIntInclusive?: (min: number, max: number) => number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createC2PSimulator(options: C2PSimulatorOptions = {}): ChargeC2P {
  const { min, max } = options.delayMs ?? { min: 800, max: 1500 };
  const sleep = options.sleep ?? wait;
  const pick = options.randomIntInclusive ?? ((lo: number, hi: number) => randomInt(lo, hi + 1));

  return async (req) => {
    await sleep(pick(min, max));
    const failureCode = SIMULATED_REJECTIONS[req.c2pKey];
    if (failureCode) return { status: "REJECTED", failureCode };
    return { status: "APPROVED", reference: `SIM-${String(pick(0, 99_999_999)).padStart(8, "0")}` };
  };
}

export const chargeC2P = createC2PSimulator() satisfies ChargeC2P;
