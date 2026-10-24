// Helpers de sesión del oficial para api/officers y api/alerts (P3). El prefijo `_` evita que Vercel
// lo publique como función. La cookie se firma con OFFICER_PASSCODE (lib/alerts/officer-session.ts).
import type { VercelRequest } from "@vercel/node";
import { DomainError } from "../../lib/domain/errors.ts";
import { OFFICER_COOKIE, verifySessionToken } from "../../lib/alerts/officer-session.ts";
import { ApiError } from "../_lib/respond.ts";

export const officerPasscode = () => process.env.OFFICER_PASSCODE ?? "";

export function isHttps(req: VercelRequest): boolean {
  const proto = req.headers["x-forwarded-proto"];
  return (Array.isArray(proto) ? proto[0] : proto) === "https" || process.env.NODE_ENV === "production";
}

export function clientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket?.remoteAddress || "unknown";
}

/** officerId de la cookie o 401. */
export function requireOfficer(req: VercelRequest): string {
  const officerId = verifySessionToken(req.cookies?.[OFFICER_COOKIE], officerPasscode());
  if (!officerId) throw new ApiError("UNAUTHORIZED", "Inicie sesión como oficial");
  return officerId;
}

/** Convierte los errores de lib/domain en ApiError para que handler() responda con su código. */
export async function domainErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DomainError) throw new ApiError(err.code, err.message);
    throw err;
  }
}
