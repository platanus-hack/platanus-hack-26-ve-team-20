// Cuenta del ciudadano (P1, docs/04 §0c): cédula + contraseña que el propio ciudadano crea al registrarse.
//
// El registro exige un código de 6 dígitos por WhatsApp. Va al teléfono que escribe la persona (así cualquiera
// puede abrir cuenta: quien recibe el código prueba que el número es suyo) o, si no escribe ninguno, al que
// el sistema ya tiene para esa cédula. El servidor solo devuelve ese teléfono enmascarado.
// Límite conocido (decisión de producto para la demo): el código prueba la posesión del teléfono, no la
// identidad; quien conozca una cédula ajena puede abrir su cuenta con otro teléfono. Ver docs/08.
//
//  - El código se guarda como HMAC (con SESSION_SECRET), vence a los 10 min y admite 5 intentos.
//  - Reenvío: 30 s entre envíos. Registro: 10 por IP cada 10 min y 5 por cédula por hora.
//  - Login: 5 fallos por cédula y 10 por IP cada 10 min; mismo error para cédula desconocida, contraseña
//    errónea y cuenta desactivada, y se verifica siempre contra un hash (falso si no hay cuenta).
//  - Solo para demos: CITIZEN_DEMO_CODE + DEMO_CEDULA hacen válido ese código para esa cédula sin enviar
//    nada (así la presentación no depende de la ventana de 24 h de WhatsApp). Sin esas variables no existe.
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { dummyHash, hashPassword, verifyPassword } from "../auth/password.ts";
import { CITIZEN_MIN_PASSWORD } from "../contracts/index.ts";
import type { CitizenAccount, Person, PrismaClient } from "../generated/prisma/client.ts";
import { audit } from "./audit.ts";
import { DomainError } from "./errors.ts";
import { assertUnderLimit, consumeLimits } from "./rate-limit.ts";

export const CODE_TTL_MS = 10 * 60_000;
export const RESEND_COOLDOWN_MS = 30_000;
export const MAX_CODE_ATTEMPTS = 5;
const WINDOW_10_MIN = 10 * 60_000;
const WINDOW_1_H = 60 * 60_000;

const A_REGISTER = "CITIZEN_REGISTER";
const A_VERIFY = "CITIZEN_VERIFY";
const A_LOGIN_FAILED = "CITIZEN_LOGIN_FAILED";
const A_PASSWORD = "CITIZEN_PASSWORD_ATTEMPT";

const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** `584264180319` → `04264180319` (formato local que usa el front). */
export function phoneToLocal(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("58") && d.length === 12 ? `0${d.slice(2)}` : d;
}

/** `0426-***0319`: el único teléfono que se devuelve a quien aún no ha demostrado ser el titular. */
export function maskPhone(phone: string): string {
  const l = phoneToLocal(phone);
  return `${l.slice(0, 4)}-***${l.slice(-4)}`;
}

export function codeHash(personId: string, code: string): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET no está configurada o tiene menos de 32 caracteres");
  return createHmac("sha256", secret).update(`${personId}:${code}`).digest("hex");
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export interface CodeSendResult { delivered: boolean; reason?: string }

export interface CitizenDeps {
  db: PrismaClient;
  /** Envía el código por WhatsApp. Nunca debe lanzar. */
  sendCode: (phone: string, code: string) => Promise<CodeSendResult>;
  /** Solo demos: este código vale para esa cédula y no se envía nada. */
  demo?: () => { cedula: string; code: string } | undefined;
  now?: () => Date;
}

export interface CitizenSession { account: CitizenAccount; person: Person }

export function createCitizenService(deps: CitizenDeps) {
  const { db } = deps;
  const clock = () => (deps.now ? deps.now() : new Date());

  const generateCode = (cedula: string): string => {
    const demo = deps.demo?.();
    return demo && demo.cedula === cedula ? demo.code : String(randomInt(0, 1_000_000)).padStart(6, "0");
  };

  /** Envía el código; si no se pudo entregar, borra el registro (para poder reintentar) y avisa. */
  async function deliver(phone: string, cedula: string, code: string, registrationId: string): Promise<void> {
    const demo = deps.demo?.();
    if (demo && demo.cedula === cedula && demo.code === code) return; // demo: no se envía nada
    const sent = await deps.sendCode(phone, code);
    if (sent.delivered) return;
    await db.citizenRegistration.deleteMany({ where: { id: registrationId } });
    const closed = sent.reason === "WINDOW_CLOSED" || sent.reason === "RECIPIENT_NOT_ALLOWED";
    throw new DomainError(
      "UPSTREAM_ERROR",
      closed
        ? "No pudimos enviar el código. Escriba un mensaje al WhatsApp de SmartTraffic y vuelva a intentarlo."
        : "No pudimos enviar el código por WhatsApp. Intente de nuevo en unos minutos.",
      "ENVIO_FALLIDO",
    );
  }

  const personOf = (cedula: string) =>
    db.person.findUnique({ where: { cedula }, include: { citizenAccount: true, citizenRegistration: true } });

  /** Paso 1: valida, guarda la contraseña elegida y envía el código. Devuelve el teléfono enmascarado. */
  async function startRegistration(input: { cedula: string; password: string; phone?: string | null | undefined; email?: string | null | undefined; ip: string | null }) {
    const now = clock();
    const key = sha16(input.cedula);
    const ip = input.ip ?? "unknown";
    await consumeLimits(
      db,
      [
        { action: A_REGISTER, ip, max: 10, windowMs: WINDOW_10_MIN, lockKey: `citizen-reg:ip:${ip}` },
        { action: A_REGISTER, entityId: key, max: 5, windowMs: WINDOW_1_H, lockKey: `citizen-reg:ced:${key}` },
      ],
      { actor: { type: "CITIZEN", ip }, action: A_REGISTER, entity: "Person", entityId: key },
      now,
    );

    let person = await personOf(input.cedula);
    if (!person) {
      // Sin titular conocido solo se puede abrir cuenta si la persona da un teléfono donde probar que es suya.
      if (!input.phone) throw new DomainError("NOT_FOUND", "No encontramos un titular registrado con esa cédula.", "SIN_TITULAR");
      person = await db.person.upsert({
        where: { cedula: input.cedula },
        create: { cedula: input.cedula, fullName: "Ciudadano", phone: input.phone },
        update: {},
        include: { citizenAccount: true, citizenRegistration: true },
      });
    }
    if (person.citizenAccount) throw new DomainError("CONFLICT", "Esa cédula ya tiene una cuenta. Inicie sesión.", "YA_REGISTRADA");
    const pending = person.citizenRegistration;
    if (pending && now.getTime() - pending.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new DomainError("RATE_LIMITED", "Espere unos segundos antes de pedir otro código.", "ESPERAR");
    }

    const code = generateCode(input.cedula);
    const fields = {
      passwordHash: await hashPassword(input.password, CITIZEN_MIN_PASSWORD),
      email: input.email ?? null,
      codeHash: codeHash(person.id, code),
      phone: input.phone ?? null,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      lastSentAt: now,
    };
    const reg = await db.citizenRegistration.upsert({ where: { personId: person.id }, create: { personId: person.id, ...fields }, update: fields });
    const target = input.phone ?? person.phone;
    await deliver(target, input.cedula, code, reg.id);
    return { telefono: maskPhone(target) };
  }

  /** Nuevo código para un registro pendiente (30 s entre envíos). */
  async function resendCode(input: { cedula: string; ip: string | null }) {
    const now = clock();
    const key = sha16(input.cedula);
    const ip = input.ip ?? "unknown";
    await consumeLimits(
      db,
      [
        { action: A_REGISTER, ip, max: 10, windowMs: WINDOW_10_MIN, lockKey: `citizen-reg:ip:${ip}` },
        { action: A_REGISTER, entityId: key, max: 5, windowMs: WINDOW_1_H, lockKey: `citizen-reg:ced:${key}` },
      ],
      { actor: { type: "CITIZEN", ip }, action: A_REGISTER, entity: "Person", entityId: key },
      now,
    );
    const person = await personOf(input.cedula);
    const pending = person?.citizenRegistration;
    if (!person || !pending) throw new DomainError("NOT_FOUND", "No hay un registro pendiente para esa cédula.", "SIN_REGISTRO");
    if (now.getTime() - pending.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new DomainError("RATE_LIMITED", "Espere unos segundos antes de pedir otro código.", "ESPERAR");
    }
    const code = generateCode(input.cedula);
    await db.citizenRegistration.update({
      where: { id: pending.id },
      data: { codeHash: codeHash(person.id, code), expiresAt: new Date(now.getTime() + CODE_TTL_MS), attempts: 0, lastSentAt: now },
    });
    const target = pending.phone ?? person.phone;
    await deliver(target, input.cedula, code, pending.id);
    return { telefono: maskPhone(target) };
  }

  /** Paso 2: con el código correcto se crea la cuenta (con la contraseña del paso 1). */
  async function verifyRegistration(input: { cedula: string; code: string; ip: string | null }): Promise<CitizenSession> {
    const now = clock();
    const ip = input.ip ?? "unknown";
    await consumeLimits(
      db,
      [{ action: A_VERIFY, ip, max: 20, windowMs: WINDOW_10_MIN, lockKey: `citizen-verify:ip:${ip}` }],
      { actor: { type: "CITIZEN", ip }, action: A_VERIFY, entity: "Person", entityId: sha16(input.cedula) },
      now,
    );

    const person = await personOf(input.cedula);
    const reg = person?.citizenRegistration;
    if (!person || !reg) throw new DomainError("NOT_FOUND", "No hay un registro pendiente para esa cédula.", "SIN_REGISTRO");
    if (reg.expiresAt.getTime() <= now.getTime()) throw new DomainError("VALIDATION_ERROR", "El código venció. Solicite uno nuevo.", "CODIGO_VENCIDO");
    if (reg.attempts >= MAX_CODE_ATTEMPTS) {
      await db.citizenRegistration.deleteMany({ where: { id: reg.id } });
      throw new DomainError("RATE_LIMITED", "Demasiados intentos. Solicite un código nuevo.", "CODIGO_AGOTADO");
    }
    if (!sameHex(reg.codeHash, codeHash(person.id, input.code))) {
      await db.citizenRegistration.update({ where: { id: reg.id }, data: { attempts: { increment: 1 } } });
      throw new DomainError("VALIDATION_ERROR", "El código no es correcto.", "CODIGO_INVALIDO");
    }

    return db.$transaction(async (tx) => {
      // Reclamar la fila: solo una verificación simultánea puede borrarla y crear la cuenta.
      const claimed = await tx.citizenRegistration.deleteMany({ where: { id: reg.id } });
      if (claimed.count === 0) throw new DomainError("CONFLICT", "Esa cédula ya tiene una cuenta. Inicie sesión.", "YA_REGISTRADA");
      const account = await tx.citizenAccount.create({ data: { personId: person.id, passwordHash: reg.passwordHash, lastLoginAt: now } });
      // El teléfono verificado pasa a ser el del perfil solo si el titular no tiene vehículos (no era un titular
      // conocido): a un titular real no se le cambia el teléfono al que se notifican sus multas.
      const adoptPhone = reg.phone && reg.phone !== person.phone && (await tx.vehicle.count({ where: { ownerId: person.id } })) === 0;
      const data = { ...(reg.email && { email: reg.email }), ...(adoptPhone && { phone: reg.phone as string }) };
      const updated = Object.keys(data).length ? await tx.person.update({ where: { id: person.id }, data }) : person;
      await audit(tx, { actor: { type: "CITIZEN", id: account.id, ip }, action: "CITIZEN_REGISTERED", entity: "CitizenAccount", entityId: account.id });
      return { account, person: updated };
    }, { maxWait: 10_000, timeout: 20_000 });
  }

  /** Login con cédula y contraseña. Un único error para todos los fallos. */
  async function login(input: { cedula: string; password: string; ip: string | null }): Promise<CitizenSession> {
    const now = clock();
    const key = sha16(input.cedula);
    const ip = input.ip ?? "unknown";
    await assertUnderLimit(db, { action: A_LOGIN_FAILED, ip, max: 10, windowMs: WINDOW_10_MIN }, now);
    await assertUnderLimit(db, { action: A_LOGIN_FAILED, entityId: key, max: 5, windowMs: WINDOW_10_MIN }, now);

    const person = await db.person.findUnique({ where: { cedula: input.cedula }, include: { citizenAccount: true } });
    const account = person?.citizenAccount ?? null;
    const ok = await verifyPassword(input.password, account?.passwordHash ?? (await dummyHash()));
    if (!person || !account || !account.active || !ok) {
      await audit(db, { actor: { type: "CITIZEN", ip }, action: A_LOGIN_FAILED, entity: "Person", entityId: key });
      throw new DomainError("UNAUTHORIZED", "Cédula o contraseña incorrectas.", "CREDENCIALES");
    }
    const updated = await db.citizenAccount.update({ where: { id: account.id }, data: { lastLoginAt: now } });
    await audit(db, { actor: { type: "CITIZEN", id: account.id, ip }, action: "CITIZEN_LOGIN", entity: "CitizenAccount", entityId: account.id });
    const { citizenAccount: _omit, ...plain } = person;
    return { account: updated, person: plain };
  }

  /** Cambia la contraseña (la anterior debe ser correcta). Las sesiones abiertas dejan de valer. */
  async function changePassword(input: { accountId: string; current: string; next: string; ip: string | null }): Promise<CitizenAccount> {
    const now = clock();
    const ip = input.ip ?? "unknown";
    await consumeLimits(
      db,
      [{ action: A_PASSWORD, entityId: input.accountId, max: 5, windowMs: WINDOW_10_MIN, lockKey: `citizen-pw:${input.accountId}` }],
      { actor: { type: "CITIZEN", id: input.accountId, ip }, action: A_PASSWORD, entity: "CitizenAccount", entityId: input.accountId },
      now,
    );
    const account = await db.citizenAccount.findUnique({ where: { id: input.accountId } });
    if (!account || !account.active) throw new DomainError("UNAUTHORIZED", "No autorizado", "SESION");
    if (!(await verifyPassword(input.current, account.passwordHash))) {
      throw new DomainError("VALIDATION_ERROR", "La contraseña actual no es correcta.", "CLAVE_ACTUAL");
    }
    if (input.next === input.current) throw new DomainError("VALIDATION_ERROR", "La contraseña nueva debe ser distinta.", "CLAVE_IGUAL");
    const updated = await db.citizenAccount.update({ where: { id: account.id }, data: { passwordHash: await hashPassword(input.next, CITIZEN_MIN_PASSWORD) } });
    await audit(db, { actor: { type: "CITIZEN", id: account.id, ip }, action: "CITIZEN_PASSWORD_CHANGED", entity: "CitizenAccount", entityId: account.id });
    return updated;
  }

  return { startRegistration, resendCode, verifyRegistration, login, changePassword };
}

export type CitizenService = ReturnType<typeof createCitizenService>;
