// Datos de la cuenta del ciudadano (P1, docs/04 §0c): perfil, multas propias, vehículos y apelación.
// Solo se alcanzan con una sesión de ciudadano; toda consulta se acota al titular (`ownerId`), y una multa
// ajena responde igual que una inexistente (404), sin revelar que existe.
import type {
  CitizenFineDTO,
  CitizenResendDTO,
  NotificationResult,
  CitizenProfileDTO,
  CitizenVehicleDTO,
} from "../contracts/index.ts";
import type { Person, Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { maskPhone, phoneToLocal } from "./citizen.ts";
import { DomainError } from "./errors.ts";
import { consumeLimit } from "./rate-limit.ts";
import { effectiveFineStatus, transition } from "./state-machine.ts";

export function toProfile(person: Pick<Person, "cedula" | "phone" | "email">): CitizenProfileDTO {
  return { cedula: person.cedula, telefono: phoneToLocal(person.phone), correo: person.email };
}

const fineInclude = {
  violation: { include: { camera: { include: { intersection: true } }, vehicle: true, evidence: { orderBy: { capturedAt: "asc" } } } },
  payments: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.FineInclude;
type FineRow = Prisma.FineGetPayload<{ include: typeof fineInclude }>;

const ownedBy = (personId: string): Prisma.FineWhereInput => ({ violation: { vehicle: { ownerId: personId } } });

export function toCitizenFine(f: FineRow, appealedAt: Date | null, now: Date = new Date()): CitizenFineDTO {
  const v = f.violation;
  return {
    id: f.id,
    token: f.publicToken,
    plate: v.vehicle?.plate ?? v.plateRead ?? "",
    type: v.type,
    status: effectiveFineStatus(f, now),
    occurredAt: v.occurredAt.toISOString(),
    intersection: v.camera.intersection.name,
    cameraCode: v.camera.code,
    amountCents: f.amountCents,
    currency: f.currency,
    dueAt: f.dueAt.toISOString(),
    verification: v.reviewReason ? "HUMAN" : "AUTO",
    confidence: v.confidence,
    paidAt: f.paidAt?.toISOString() ?? null,
    paymentReference: f.payments[0]?.reference ?? null,
    voidReason: v.voidReason,
    appealedAt: appealedAt?.toISOString() ?? null,
    evidence: v.evidence.map((e) => ({ kind: e.kind, url: e.url, capturedAt: e.capturedAt.toISOString() })),
  };
}

/** Cuándo se apeló cada violación (la fecha no tiene columna propia: sale de la auditoría). */
async function appealDates(db: Pick<PrismaClient, "auditLog">, violationIds: string[]): Promise<Map<string, Date>> {
  if (violationIds.length === 0) return new Map();
  const logs = await db.auditLog.findMany({
    where: { entity: "Violation", action: "VIOLATION_TRANSITION", entityId: { in: violationIds }, after: { path: ["status"], equals: "APPEALED" } },
    orderBy: { createdAt: "asc" },
  });
  return new Map(logs.flatMap((l) => (l.entityId ? [[l.entityId, l.createdAt] as const] : [])));
}

/** Multas del titular, la infracción más reciente primero. */
export async function listCitizenFines(db: PrismaClient, personId: string, now: Date = new Date()): Promise<CitizenFineDTO[]> {
  const rows = await db.fine.findMany({ where: ownedBy(personId), include: fineInclude });
  const appealed = await appealDates(db, rows.filter((f) => f.status === "APPEALED").map((f) => f.violationId));
  return rows
    .map((f) => toCitizenFine(f, appealed.get(f.violationId) ?? null, now))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function getCitizenFine(db: PrismaClient, personId: string, fineId: string, now: Date = new Date()): Promise<CitizenFineDTO> {
  const row = await db.fine.findFirst({ where: { id: fineId, ...ownedBy(personId) }, include: fineInclude });
  if (!row) throw new DomainError("NOT_FOUND", "Multa no encontrada", "NO_ENCONTRADA");
  const appealed = row.status === "APPEALED" ? await appealDates(db, [row.violationId]) : new Map<string, Date>();
  return toCitizenFine(row, appealed.get(row.violationId) ?? null, now);
}

export async function listCitizenVehicles(db: PrismaClient, personId: string): Promise<CitizenVehicleDTO[]> {
  const rows = await db.vehicle.findMany({ where: { ownerId: personId }, orderBy: { plate: "asc" } });
  return rows.map((v) => ({ plate: v.plate, brand: v.make, model: v.model, color: v.color, year: v.year }));
}

/**
 * Apela una multa propia que aún se puede pagar (pendiente o vencida). Pasa por la máquina de estados
 * (`NOTIFIED`/`FINED` → `APPEALED`) y queda auditada con el ciudadano como actor.
 */
export async function appealCitizenFine(
  db: PrismaClient,
  input: { personId: string; accountId: string; fineId: string; ip: string | null },
  now: Date = new Date(),
): Promise<CitizenFineDTO> {
  const row = await db.fine.findFirst({ where: { id: input.fineId, ...ownedBy(input.personId) }, include: fineInclude });
  if (!row) throw new DomainError("NOT_FOUND", "Multa no encontrada", "NO_ENCONTRADA");
  if (!["PENDING", "OVERDUE"].includes(effectiveFineStatus(row, now))) {
    throw new DomainError("CONFLICT", "Esta multa ya no se puede apelar.", "NO_APELABLE");
  }
  await transition(db, row.violationId, "APPEALED", { type: "CITIZEN", id: input.accountId, ip: input.ip });
  return getCitizenFine(db, input.personId, input.fineId, now);
}

/** Misma acción y tope que el reenvío del oficial (`officer-fines.ts`): 3 por hora por multa, entre todos. */
const RESEND_ACTION = "FINE_NOTIFICATION_RESENT";

/**
 * El titular se reenvía a sí mismo el WhatsApp de una multa propia por pagar (pendiente o vencida), con el mismo
 * texto de la notificación original: tipo, lugar, fecha, placa, monto y el enlace con la evidencia y el pago.
 */
export async function resendCitizenFine(
  db: PrismaClient,
  input: { personId: string; accountId: string; fineId: string; ip: string | null },
  notify: (fineId: string) => Promise<NotificationResult>,
  now: Date = new Date(),
): Promise<CitizenResendDTO> {
  const row = await db.fine.findFirst({ where: { id: input.fineId, ...ownedBy(input.personId) }, include: { ...fineInclude, violation: { include: { ...fineInclude.violation.include, vehicle: { include: { owner: true } } } } } });
  if (!row) throw new DomainError("NOT_FOUND", "Multa no encontrada", "NO_ENCONTRADA");
  if (!["PENDING", "OVERDUE"].includes(effectiveFineStatus(row, now))) {
    throw new DomainError("CONFLICT", "Solo se puede reenviar la notificación de una multa pendiente o vencida.", "NO_REENVIABLE");
  }
  const phone = row.violation.vehicle?.owner.phone.trim();
  if (!phone) throw new DomainError("CONFLICT", "No tenemos un teléfono registrado para enviarle la notificación.", "SIN_TELEFONO");
  await consumeLimit(
    db,
    { action: RESEND_ACTION, entityId: row.id, max: 3, windowMs: 3_600_000, lockKey: `fine-resend:${row.id}` },
    { actor: { type: "CITIZEN", id: input.accountId, ip: input.ip }, action: RESEND_ACTION, entity: "Fine", entityId: row.id },
    now,
  );
  const result = await notify(row.id);
  return { status: result.status === "SENT" || result.status === "DRY_RUN" ? result.status : "FAILED", telefono: maskPhone(phone) };
}
