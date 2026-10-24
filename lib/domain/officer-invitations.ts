// Invitaciones por correo para oficiales de tránsito (P1, docs/04 §0d).
//
// El admin invita a un correo; el oficial recibe un enlace con un token de 256 bits (solo se guarda su
// SHA-256), elige nombre opcional, teléfono y contraseña, y nace su cuenta de oficial con una placa
// `OF-NNNN`. El enlace vence a las 72 h, es de un solo uso y se puede revocar; invitar de nuevo al mismo
// correo anula la invitación pendiente anterior. Un correo ya registrado como oficial no se puede invitar.
import { createHash, randomBytes, randomInt } from "node:crypto";
import { dummyHash, hashPassword, verifyPassword } from "../auth/password.ts";
import type { AdminOfficerDTO, OfficerInvitationDTO, OfficerInvitationStatus, OfficerSessionDTO } from "../contracts/index.ts";
import type { Officer, OfficerInvitation, PrismaClient } from "../generated/prisma/client.ts";
import { audit } from "./audit.ts";
import { maskPhone } from "./citizen.ts";
import { DomainError, NotFoundError } from "./errors.ts";
import { assertUnderLimit, consumeLimit, settleLoginAttempt } from "./rate-limit.ts";

export const INVITATION_TTL_MS = 72 * 3_600_000;
const WINDOW_10_MIN = 10 * 60_000;
const A_ACCEPT = "OFFICER_INVITE_ATTEMPT";
const A_LOGIN_FAILED = "OFFICER_LOGIN_FAILED";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const hashInviteToken = sha;
const newToken = () => randomBytes(32).toString("base64url"); // 43 caracteres

export interface InviteEmail { to: string; name: string; url: string; expiresAt: Date }
export type InviteSendResult = { delivered: true } | { delivered: false; reason: string };

export interface OfficerInviteDeps {
  db: PrismaClient;
  /** Envía el correo. Nunca debe lanzar. */
  sendInvite: (email: InviteEmail) => Promise<InviteSendResult>;
  /** Origen público para armar el enlace (`APP_BASE_URL`). */
  baseUrl: () => string;
  now?: () => Date;
}

type InvitationRow = OfficerInvitation & { createdBy: { name: string }; officer: { badge: string } | null };

function statusOf(i: OfficerInvitation, now: Date): OfficerInvitationStatus {
  if (i.usedAt) return "USED";
  if (i.revokedAt) return "REVOKED";
  return i.expiresAt.getTime() <= now.getTime() ? "EXPIRED" : "PENDING";
}

function toInvitationDTO(i: InvitationRow, now: Date): OfficerInvitationDTO {
  return {
    id: i.id, email: i.email, name: i.name, status: statusOf(i, now), expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(), createdByName: i.createdBy.name, officerBadge: i.officer?.badge ?? null,
  };
}

const toOfficerDTO = (o: Officer): AdminOfficerDTO => ({
  id: o.id, badge: o.badge, name: o.name, email: o.email, phone: maskPhone(o.phone), active: o.active, onDuty: o.onDuty,
  hasAccount: Boolean(o.passwordHash), createdAt: o.createdAt.toISOString(),
});

export const toOfficerSession = (o: Pick<Officer, "id" | "badge" | "name" | "email">): OfficerSessionDTO => ({ id: o.id, badge: o.badge, name: o.name, email: o.email });

const INCLUDE = { createdBy: { select: { name: true } }, officer: { select: { badge: true } } } as const;
const invalid = () => new DomainError("NOT_FOUND", "La invitación no existe, venció o ya se usó.", "INVITACION_INVALIDA");

export function createOfficerInviteService(deps: OfficerInviteDeps) {
  const { db } = deps;
  const clock = () => (deps.now ? deps.now() : new Date());

  /** Crea la invitación y envía el correo. `inviteUrl` solo se devuelve si el correo no salió (el admin lo copia). */
  async function create(input: { email: string; name: string; adminId: string; ip: string | null }) {
    const now = clock();
    if (await db.officer.findUnique({ where: { email: input.email }, select: { id: true } })) {
      throw new DomainError("CONFLICT", "Ese correo ya pertenece a un oficial.", "CORREO_EN_USO");
    }
    const token = newToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const created = await db.$transaction(async (tx) => {
      // Una sola invitación vigente por correo.
      const revoked = await tx.officerInvitation.updateMany({ where: { email: input.email, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
      const row = await tx.officerInvitation.create({
        data: { email: input.email, name: input.name, tokenHash: sha(token), expiresAt, createdById: input.adminId },
        include: INCLUDE,
      });
      await audit(tx, {
        actor: { type: "OPERATOR", id: input.adminId, ip: input.ip }, action: "OFFICER_INVITED", entity: "OfficerInvitation", entityId: row.id,
        after: { replaced: revoked.count },
      });
      return row;
    }, { maxWait: 10_000, timeout: 20_000 });

    const url = `${deps.baseUrl().replace(/\/+$/, "")}/oficial/invitacion?token=${token}`;
    const sent = await deps.sendInvite({ to: input.email, name: input.name, url, expiresAt });
    return { invitation: toInvitationDTO(created, now), emailSent: sent.delivered, ...(sent.delivered ? {} : { inviteUrl: url }) };
  }

  async function list(): Promise<OfficerInvitationDTO[]> {
    const now = clock();
    const rows = await db.officerInvitation.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: INCLUDE });
    return rows.map((r) => toInvitationDTO(r, now));
  }

  async function revoke(input: { id: string; adminId: string; ip: string | null }): Promise<OfficerInvitationDTO> {
    const now = clock();
    const row = await db.officerInvitation.findUnique({ where: { id: input.id }, include: INCLUDE });
    if (!row) throw new NotFoundError("Invitación", input.id);
    if (row.usedAt) throw new DomainError("CONFLICT", "La invitación ya se usó.", "YA_USADA");
    if (row.revokedAt) return toInvitationDTO(row, now);
    const updated = await db.officerInvitation.update({ where: { id: row.id }, data: { revokedAt: now }, include: INCLUDE });
    await audit(db, { actor: { type: "OPERATOR", id: input.adminId, ip: input.ip }, action: "OFFICER_INVITE_REVOKED", entity: "OfficerInvitation", entityId: row.id });
    return toInvitationDTO(updated, now);
  }

  /** Limita los intentos por IP (aun con token válido) y devuelve la invitación vigente o falla igual para todo. */
  async function findValid(token: string, ip: string | null, now: Date) {
    const ipKey = ip ?? "unknown";
    await consumeLimit(
      db,
      { action: A_ACCEPT, ip: ipKey, max: 20, windowMs: WINDOW_10_MIN, lockKey: `officer-invite:ip:${ipKey}` },
      { actor: { type: "OFFICER", ip: ipKey }, action: A_ACCEPT, entity: "OfficerInvitation" },
      now,
    );
    const row = await db.officerInvitation.findUnique({ where: { tokenHash: sha(token) } });
    if (!row || statusOf(row, now) !== "PENDING") throw invalid();
    return row;
  }

  /** Para que la página del enlace salude al invitado antes de pedirle los datos. */
  async function preview(input: { token: string; ip: string | null }) {
    const row = await findValid(input.token, input.ip, clock());
    return { email: row.email, name: row.name, expiresAt: row.expiresAt.toISOString() };
  }

  function nextBadge(): string {
    return `OF-${randomInt(1000, 10_000)}`;
  }

  /** El oficial elige teléfono y contraseña; nace su cuenta y la invitación queda usada. */
  async function accept(input: { token: string; name?: string | undefined; phone: string; password: string; ip: string | null }): Promise<Officer> {
    const now = clock();
    const inv = await findValid(input.token, input.ip, now);
    const passwordHash = await hashPassword(input.password, 10);
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        return await db.$transaction(async (tx) => {
          const claimed = await tx.officerInvitation.updateMany({ where: { id: inv.id, usedAt: null, revokedAt: null }, data: { usedAt: now } });
          if (claimed.count === 0) throw invalid();
          const officer = await tx.officer.create({
            data: { badge: nextBadge(), name: input.name ?? inv.name, phone: input.phone, email: inv.email, passwordHash },
          });
          await tx.officerInvitation.update({ where: { id: inv.id }, data: { officerId: officer.id } });
          await audit(tx, { actor: { type: "OFFICER", id: officer.id, ip: input.ip }, action: "OFFICER_REGISTERED", entity: "Officer", entityId: officer.id });
          return officer;
        }, { maxWait: 10_000, timeout: 20_000 });
      } catch (e) {
        // Choque de placa o de correo (P2002): la placa se reintenta; el correo ya registrado no.
        const target = JSON.stringify((e as { meta?: { target?: unknown } }).meta?.target ?? "");
        if ((e as { code?: string }).code === "P2002" && target.includes("badge")) continue;
        if ((e as { code?: string }).code === "P2002") throw new DomainError("CONFLICT", "Ese correo ya pertenece a un oficial.", "CORREO_EN_USO");
        throw e;
      }
    }
    throw new DomainError("INTERNAL_ERROR", "No pudimos asignar una placa. Intente de nuevo.");
  }

  /** Login con correo y contraseña. Un único error para todos los fallos; 5 fallos por correo y 10 por IP cada 10 min. */
  async function login(input: { email: string; password: string; ip: string | null }): Promise<Officer> {
    const now = clock();
    const ipKey = input.ip ?? "unknown";
    const key = sha(input.email).slice(0, 16);
    await assertUnderLimit(db, { action: A_LOGIN_FAILED, ip: ipKey, max: 10, windowMs: WINDOW_10_MIN }, now);
    await assertUnderLimit(db, { action: A_LOGIN_FAILED, entityId: key, max: 5, windowMs: WINDOW_10_MIN }, now);
    const officer = await db.officer.findUnique({ where: { email: input.email } });
    const ok = await verifyPassword(input.password, officer?.passwordHash ?? (await dummyHash()));
    const good = Boolean(officer && officer.passwordHash && officer.active && ok);
    await settleLoginAttempt(
      db,
      [
        { action: A_LOGIN_FAILED, ip: ipKey, max: 10, windowMs: WINDOW_10_MIN, lockKey: `officer-login:ip:${ipKey}` },
        { action: A_LOGIN_FAILED, entityId: key, max: 5, windowMs: WINDOW_10_MIN, lockKey: `officer-login:email:${key}` },
      ],
      good ? null : { actor: { type: "OFFICER", ip: ipKey }, action: A_LOGIN_FAILED, entity: "Officer", entityId: key },
      now,
    );
    if (!officer || !good) throw new DomainError("UNAUTHORIZED", "Correo o contraseña incorrectos.", "CREDENCIALES");
    await audit(db, { actor: { type: "OFFICER", id: officer.id, ip: ipKey }, action: "OFFICER_LOGIN", entity: "Officer", entityId: officer.id });
    return officer;
  }

  async function listOfficers(): Promise<AdminOfficerDTO[]> {
    return (await db.officer.findMany({ orderBy: { createdAt: "desc" }, take: 500 })).map(toOfficerDTO);
  }

  /** Desactiva (o reactiva) un oficial: no podrá entrar con correo y contraseña, y sale de servicio. */
  async function setActive(input: { id: string; active: boolean; adminId: string; ip: string | null }): Promise<AdminOfficerDTO> {
    const before = await db.officer.findUnique({ where: { id: input.id } });
    if (!before) throw new NotFoundError("Oficial", input.id);
    const updated = await db.officer.update({ where: { id: input.id }, data: { active: input.active, ...(input.active ? {} : { onDuty: false }) } });
    await audit(db, {
      actor: { type: "OPERATOR", id: input.adminId, ip: input.ip }, action: input.active ? "OFFICER_ACTIVATED" : "OFFICER_DEACTIVATED",
      entity: "Officer", entityId: input.id, before: { active: before.active }, after: { active: updated.active },
    });
    return toOfficerDTO(updated);
  }

  return { create, list, revoke, preview, accept, login, listOfficers, setActive };
}
