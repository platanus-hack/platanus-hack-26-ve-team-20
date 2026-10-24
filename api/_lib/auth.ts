// Guardas de autenticación de la API (P1). docs/04 convenciones y docs/02 §7:
//   admin   → cookie firmada `vc_admin` emitida por POST /api/auth/login (cuenta en AdminUser)
//   camera  → cabecera `X-Camera-Key` = CAMERA_API_KEY (la app móvil)
//   officer → cookie firmada `vc_officer` que emite P3 con `issueOfficerSession`
// Todas fallan cerradas y responden el mismo 401 sin decir qué falló.
import { createHash, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { AdminSessionDTO } from "../../lib/contracts/index.ts";
import {
  COOKIE_NAMES,
  clearCookie,
  passwordFingerprint,
  readCookie,
  sessionCookie,
  signSession,
  verifySession,
} from "../../lib/auth/session.ts";
import type { CitizenAccount, Person, PrismaClient } from "../../lib/generated/prisma/client.ts";
import { ApiError } from "./respond.ts";

const sha256 = (s: string) => createHash("sha256").update(s).digest();
const unauthorized = () => new ApiError("UNAUTHORIZED", "No autorizado");

/** Comparación en tiempo constante (se comparan hashes del mismo largo). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

const header = (req: VercelRequest, name: string): string | undefined => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/** IP del cliente tal como la informa Vercel (no se confía en cabeceras arbitrarias fuera de Vercel). */
export function getClientIp(req: VercelRequest): string | null {
  const forwarded = header(req, "x-vercel-forwarded-for") ?? header(req, "x-real-ip") ?? header(req, "x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || null;
}

/**
 * Defensa CSRF adicional a SameSite=Lax: en métodos que modifican, si el navegador envía `Origin`,
 * debe coincidir con el host de la petición. Sin `Origin` (curl, tests, servidor a servidor) se permite.
 */
export function assertSameOrigin(req: VercelRequest): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method ?? "GET")) return;
  const origin = header(req, "origin");
  if (!origin) return;
  const host = header(req, "x-forwarded-host") ?? header(req, "host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw unauthorized();
  }
  if (!host || originHost !== host) throw unauthorized();
}

// ---------------------------------------------------------------- admin
type AdminDb = Pick<PrismaClient, "adminUser">;

/**
 * Exige una sesión de admin válida: cookie firmada y vigente, cuenta activa y contraseña sin cambios
 * desde que se emitió (desactivar la cuenta o cambiar la contraseña cierra las sesiones abiertas).
 */
export async function requireAdmin(db: AdminDb, req: VercelRequest): Promise<AdminSessionDTO> {
  assertSameOrigin(req);
  const token = readCookie(header(req, "cookie"), COOKIE_NAMES.admin);
  const session = verifySession(token, "admin");
  if (!session) throw unauthorized();
  const user = await db.adminUser.findUnique({ where: { id: session.s } });
  if (!user || !user.active || !session.ph || session.ph !== passwordFingerprint(user.passwordHash)) throw unauthorized();
  return { id: user.id, email: user.email, name: user.name };
}

/** Emite la cookie de sesión de admin. */
export function issueAdminSession(res: VercelResponse, user: { id: string; passwordHash: string }): void {
  const token = signSession({ role: "admin", sub: user.id, ph: passwordFingerprint(user.passwordHash) });
  res.setHeader("Set-Cookie", sessionCookie("admin", token));
}

export function clearAdminSession(res: VercelResponse): void {
  res.setHeader("Set-Cookie", clearCookie("admin"));
}

// ---------------------------------------------------------------- camera
/** Exige `X-Camera-Key` = CAMERA_API_KEY. Sin la variable configurada nadie entra. */
export function requireCamera(req: VercelRequest): void {
  const expected = process.env["CAMERA_API_KEY"];
  const given = header(req, "x-camera-key");
  if (!expected || !given || !safeEqual(given, expected)) throw unauthorized();
}

/** Para endpoints "camera | admin" (docs/04 §1): acepta la clave de cámara o una sesión de admin. */
export async function requireCameraOrAdmin(db: AdminDb, req: VercelRequest): Promise<{ kind: "camera" } | { kind: "admin"; admin: AdminSessionDTO }> {
  if (header(req, "x-camera-key")) {
    requireCamera(req);
    return { kind: "camera" };
  }
  return { kind: "admin", admin: await requireAdmin(db, req) };
}

// ---------------------------------------------------------------- officer
/** Sesión de oficial válida Y oficial existente y activo (desactivarlo corta el acceso a los datos). */
export async function requireActiveOfficer(db: Pick<PrismaClient, "officer">, req: VercelRequest): Promise<{ officerId: string }> {
  const { officerId } = requireOfficer(req);
  const officer = await db.officer.findUnique({ where: { id: officerId }, select: { active: true } });
  if (!officer || !officer.active) throw unauthorized();
  return { officerId };
}

/** Lo llama P3 en `POST /api/officers/session` después de validar passcode y placa del oficial. */
export function issueOfficerSession(res: VercelResponse, officerId: string): void {
  res.setHeader("Set-Cookie", sessionCookie("officer", signSession({ role: "officer", sub: officerId })));
}

/** Devuelve el id del oficial de la sesión. Quien lo llama debe comprobar que el oficial exista y esté activo. */
export function requireOfficer(req: VercelRequest): { officerId: string } {
  assertSameOrigin(req);
  const session = verifySession(readCookie(header(req, "cookie"), COOKIE_NAMES.officer), "officer");
  if (!session) throw unauthorized();
  return { officerId: session.s };
}

// ---------------------------------------------------------------- ciudadano
type CitizenDb = Pick<PrismaClient, "citizenAccount">;
export interface CitizenAuth { account: CitizenAccount; person: Person }

/** Emite (o renueva) la cookie de sesión del ciudadano: 30 min desde ahora. */
export function issueCitizenSession(res: VercelResponse, account: Pick<CitizenAccount, "id" | "passwordHash">): void {
  const token = signSession({ role: "citizen", sub: account.id, ph: passwordFingerprint(account.passwordHash) });
  res.setHeader("Set-Cookie", sessionCookie("citizen", token));
}

export function clearCitizenSession(res: VercelResponse): void {
  res.setHeader("Set-Cookie", clearCookie("citizen"));
}

/**
 * Exige una sesión de ciudadano válida: cookie firmada y vigente, cuenta activa y contraseña sin cambios
 * desde que se emitió. Con `res`, la sesión se renueva (30 min más) salvo `renew: false` (sondeos que no
 * deben mantener la sesión abierta). Mismo 401 para todos los fallos.
 */
export async function requireCitizen(
  db: CitizenDb,
  req: VercelRequest,
  res?: VercelResponse,
  opts: { renew?: boolean } = {},
): Promise<CitizenAuth> {
  assertSameOrigin(req);
  const session = verifySession(readCookie(header(req, "cookie"), COOKIE_NAMES.citizen), "citizen");
  if (!session) throw unauthorized();
  const account = await db.citizenAccount.findUnique({ where: { id: session.s }, include: { person: true } });
  if (!account || !account.active || !session.ph || session.ph !== passwordFingerprint(account.passwordHash)) throw unauthorized();
  if (res && opts.renew !== false) issueCitizenSession(res, account);
  const { person, ...plain } = account;
  return { account: plain, person };
}
