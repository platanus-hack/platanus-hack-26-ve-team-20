// Sesión del oficial (docs/02 §7, docs/04 §6): cookie httpOnly firmada con HMAC. La emite P3 en
// POST /api/officers/session; la clave sale de OFFICER_PASSCODE, así que cambiarlo cierra todas las sesiones.
// Formato: `<officerId>.<expira en segundos>.<firma base64url>`. Sin estado en el servidor.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const OFFICER_COOKIE = "vc_officer";
export const SESSION_TTL_S = 12 * 60 * 60;

function key(passcode: string): Buffer {
  return createHash("sha256").update(`viaclara:officer-session:${passcode}`).digest();
}

function sign(payload: string, passcode: string): string {
  return createHmac("sha256", key(passcode)).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function passcodeMatches(given: string, expected: string): boolean {
  return expected.length > 0 && safeEqual(given, expected);
}

export function createSessionToken(officerId: string, passcode: string, now = Date.now()): string {
  const payload = `${officerId}.${Math.floor(now / 1000) + SESSION_TTL_S}`;
  return `${payload}.${sign(payload, passcode)}`;
}

/** officerId de una cookie válida y vigente; `null` si falta, está alterada o venció. */
export function verifySessionToken(token: string | undefined, passcode: string, now = Date.now()): string | null {
  if (!token || !passcode) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [officerId, expires, signature] = parts as [string, string, string];
  if (!officerId || !/^\d+$/.test(expires) || !safeEqual(signature, sign(`${officerId}.${expires}`, passcode))) return null;
  return Number(expires) * 1000 > now ? officerId : null;
}

/** Cabecera Set-Cookie. `secure` en https (en local con http el navegador la descartaría). */
export function sessionCookie(token: string, { secure }: { secure: boolean }): string {
  return `${OFFICER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_S}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie({ secure }: { secure: boolean }): string {
  return `${OFFICER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
