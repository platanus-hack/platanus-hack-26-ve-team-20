// Sesiones sin estado: cookie firmada con HMAC-SHA256 (docs/02 §7). Sin dependencias.
//   <payload base64url JSON>.<firma base64url>
// El secreto es SESSION_SECRET (≥ 32 caracteres). Falla cerrada: sin secreto no se firma ni se acepta nada.
// La cookie es HttpOnly + SameSite=Lax (+ Secure en Vercel). Revocación: la sesión de admin guarda una
// huella del hash de la contraseña (`ph`), así que cambiar la contraseña o desactivar la cuenta la invalida.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type SessionRole = "admin" | "officer";

export interface SessionPayload {
  r: SessionRole;
  /** Sujeto: id del AdminUser o del Officer. */
  s: string;
  /** Huella de la contraseña (solo admin). */
  ph?: string;
  iat: number;
  exp: number;
}

export const COOKIE_NAMES: Record<SessionRole, string> = { admin: "vc_admin", officer: "vc_officer" };
export const SESSION_TTL_S: Record<SessionRole, number> = { admin: 8 * 3600, officer: 12 * 3600 };
export const MIN_SECRET_LENGTH = 32;

function secret(): string | null {
  const s = process.env["SESSION_SECRET"];
  return s && s.length >= MIN_SECRET_LENGTH ? s : null;
}

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");
const mac = (key: string, data: string) => createHmac("sha256", key).update(data).digest();

/** Huella corta del hash de contraseña, para invalidar sesiones al cambiarla. */
export function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 12);
}

export interface SignInput { role: SessionRole; sub: string; ph?: string; ttlS?: number; now?: Date }

export function signSession({ role, sub, ph, ttlS, now = new Date() }: SignInput): string {
  const key = secret();
  if (!key) throw new Error(`SESSION_SECRET no está configurada o tiene menos de ${MIN_SECRET_LENGTH} caracteres`);
  const iat = Math.floor(now.getTime() / 1000);
  const payload: SessionPayload = { r: role, s: sub, ...(ph && { ph }), iat, exp: iat + (ttlS ?? SESSION_TTL_S[role]) };
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(mac(key, body))}`;
}

/** Devuelve el payload si la firma, el rol y la vigencia son válidos; `null` en cualquier otro caso. */
export function verifySession(token: string | undefined, role: SessionRole, now: Date = new Date()): SessionPayload | null {
  const key = secret();
  if (!key || !token) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = mac(key, body);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (p.r !== role || typeof p.s !== "string" || !p.s || typeof p.exp !== "number" || typeof p.iat !== "number") return null;
    if (p.exp <= Math.floor(now.getTime() / 1000)) return null;
    return p as SessionPayload;
  } catch {
    return null;
  }
}

/** Valor de una cookie en la cabecera `Cookie`. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export interface CookieOptions { secure?: boolean }
const isSecureEnv = () => Boolean(process.env["VERCEL"]);

/** `Set-Cookie` de la sesión: HttpOnly, SameSite=Lax y Secure en Vercel (HTTPS). */
export function sessionCookie(role: SessionRole, token: string, opts: CookieOptions = {}): string {
  const secure = opts.secure ?? isSecureEnv();
  return [
    `${COOKIE_NAMES[role]}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${SESSION_TTL_S[role]}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** `Set-Cookie` que borra la sesión. */
export function clearCookie(role: SessionRole, opts: CookieOptions = {}): string {
  const secure = opts.secure ?? isSecureEnv();
  return [`${COOKIE_NAMES[role]}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : [])].join("; ");
}
