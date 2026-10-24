// Autenticación por passcode (P1). F10 trae solo la guarda mínima de admin; F9 la extiende con la
// cookie firmada (docs/02 §7) y las guardas `camera` y `officer`.
import { createHash, timingSafeEqual } from "node:crypto";
import type { VercelRequest } from "@vercel/node";
import { ApiError } from "./respond.ts";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** Comparación en tiempo constante (se comparan hashes del mismo largo). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

function bearer(req: VercelRequest): string {
  const header = req.headers["authorization"];
  return typeof header === "string" && header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

/**
 * Exige `Authorization: Bearer <ADMIN_PASSCODE>`. Falla cerrada: sin `ADMIN_PASSCODE` configurada
 * nadie entra. Lanza ApiError UNAUTHORIZED (401) con el mismo mensaje en todos los casos.
 */
export function requireAdmin(req: VercelRequest): void {
  const expected = process.env["ADMIN_PASSCODE"];
  const given = bearer(req);
  if (!expected || !given || !safeEqual(given, expected)) throw new ApiError("UNAUTHORIZED", "No autorizado");
}
