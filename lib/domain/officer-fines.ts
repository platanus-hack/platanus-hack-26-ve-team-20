// Historial de multas del oficial (P1, docs/12): lista con filtros, detalle con auditoría, cambio de estado
// (anular / resolver apelación) y reenvío de la notificación al titular. Solo se alcanza con sesión de oficial.
// Privacidad (docs/08): la cédula sale siempre enmascarada; nunca nombre, teléfono ni token público del titular.
import {
  maskCedula,
  type ActorType,
  type FineStatus,
  type NotificationResult,
  type OfficerAuditEntryDTO,
  type OfficerFineAction,
  type OfficerFineDetailDTO,
  type OfficerFineDTO,
  type OfficerFinePageDTO,
  type OfficerFinesQuery,
  type OfficerResendDTO,
} from "../contracts/index.ts";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { maskPhone } from "./citizen.ts";
import { DomainError, NotFoundError } from "./errors.ts";
import { consumeLimit } from "./rate-limit.ts";
import { effectiveFineStatus, transition } from "./state-machine.ts";

export const RESEND_ACTION = "FINE_NOTIFICATION_RESENT";
export const RESEND_MAX_PER_HOUR = 3;
const HOUR_MS = 3_600_000;

const include = {
  violation: { include: { camera: { include: { intersection: true } }, vehicle: { include: { owner: true } }, evidence: true } },
  payments: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.FineInclude;
type FineRow = Prisma.FineGetPayload<{ include: typeof include }>;

function toFineDTO(f: FineRow, now: Date): OfficerFineDTO {
  const v = f.violation;
  return {
    id: f.id,
    type: v.type,
    status: effectiveFineStatus(f, now),
    occurredAt: v.occurredAt.toISOString(),
    intersection: v.camera.intersection.name,
    cameraCode: v.camera.code,
    plate: v.vehicle?.plate ?? v.plateRead ?? "",
    cedulaMasked: v.vehicle?.owner ? maskCedula(v.vehicle.owner.cedula) : null,
    amountCents: f.amountCents,
    currency: f.currency,
    dueAt: f.dueAt.toISOString(),
    verification: v.reviewReason ? "HUMAN" : "AUTO",
    confidence: v.confidence,
  };
}

const ACTOR_LABEL: Record<ActorType, string> = {
  SYSTEM: "Sistema", OPERATOR: "Operador de revisión", OFFICER: "Oficial", CITIZEN: "Ciudadano", WEBHOOK: "Sistema",
};

interface AuditPayload { status?: string; fineStatus?: string | null; note?: string; voidReason?: string }
const asPayload = (j: unknown): AuditPayload => (j && typeof j === "object" ? (j as AuditPayload) : {});

/** Auditoría legible de una multa: transiciones de la violación + reenvíos de notificación, en orden cronológico. */
async function auditTrail(db: PrismaClient, fine: FineRow): Promise<OfficerAuditEntryDTO[]> {
  const logs = await db.auditLog.findMany({
    where: {
      OR: [
        { entity: "Violation", action: "VIOLATION_TRANSITION", entityId: fine.violationId },
        { entity: "Fine", action: RESEND_ACTION, entityId: fine.id },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  const officerIds = [...new Set(logs.filter((l) => l.actorType === "OFFICER" && l.actorId).map((l) => l.actorId as string))];
  const officers = officerIds.length ? await db.officer.findMany({ where: { id: { in: officerIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(officers.map((o) => [o.id, o.name]));

  const entries: OfficerAuditEntryDTO[] = [];
  for (const l of logs) {
    const before = asPayload(l.before);
    const after = asPayload(l.after);
    let action: string | null;
    if (l.action === RESEND_ACTION) action = "NOTIFICATION_RESENT";
    else
      switch (after.status) {
        case "FINED": action = "FINE_CREATED"; break;
        case "REVIEWED": action = "REVIEW_APPROVED"; break;
        case "PAID": action = "PAID"; break;
        case "APPEALED": action = "APPEALED"; break;
        case "VOID": action = before.status === "APPEALED" ? "APPEAL_ACCEPT" : "VOID"; break;
        case "NOTIFIED": action = before.status === "APPEALED" ? "APPEAL_REJECT" : null; break;
        default: action = null;
      }
    if (!action) continue;
    entries.push({
      at: l.createdAt.toISOString(),
      actor: { type: l.actorType as ActorType, label: (l.actorType === "OFFICER" && l.actorId && names.get(l.actorId)) || ACTOR_LABEL[l.actorType as ActorType] },
      action,
      from: (before.fineStatus as FineStatus | null | undefined) ?? null,
      to: (after.fineStatus as FineStatus | null | undefined) ?? null,
      reason: after.note ?? after.voidReason ?? null,
    });
  }
  return entries;
}

async function toDetail(db: PrismaClient, f: FineRow, now: Date): Promise<OfficerFineDetailDTO> {
  const v = f.violation;
  const trail = await auditTrail(db, f);
  const appealed = trail.find((e) => e.action === "APPEALED");
  const veh = v.vehicle;
  return {
    ...toFineDTO(f, now),
    vehicle: veh ? { brand: veh.make, model: veh.model, color: veh.color, year: veh.year ?? 0 } : null,
    evidence: [...v.evidence]
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime())
      .map((e) => {
        const light = (e.meta as { lightState?: string } | null)?.lightState;
        return { kind: e.kind, url: e.url, capturedAt: e.capturedAt.toISOString(), lightState: light === "RED" || light === "GREEN" || light === "YELLOW" ? light : null };
      }),
    paidAt: f.paidAt?.toISOString() ?? null,
    paymentReference: f.payments[0]?.reference ?? null,
    voidReason: v.voidReason,
    appealedAt: appealed?.at ?? null,
    audit: trail,
  };
}

const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
function decodeCursor(cursor: string): { at: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime()) || !id) throw new DomainError("VALIDATION_ERROR", "Cursor inválido");
  return { at, id };
}

export function createOfficerFinesService(deps: { db: PrismaClient; notify: (fineId: string) => Promise<NotificationResult>; now?: () => Date }) {
  const { db } = deps;
  const clock = () => (deps.now ? deps.now() : new Date());

  const load = async (id: string) => {
    const row = await db.fine.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundError("Multa", id);
    return row;
  };

  async function list(q: OfficerFinesQuery): Promise<OfficerFinePageDTO> {
    const now = clock();
    const vehicle: Prisma.VehicleWhereInput = {
      ...(q.cedula && { owner: { cedula: q.cedula } }),
      ...(q.plate && { plate: { startsWith: q.plate } }),
    };
    const after = q.cursor ? decodeCursor(q.cursor) : null;
    // AND: el filtro de vehículo y el cursor tocan `violation` y no deben pisarse.
    const and: Prisma.FineWhereInput[] = [
      ...(Object.keys(vehicle).length ? [{ violation: { vehicle } }] : []),
      ...(after
        ? [{ OR: [{ violation: { occurredAt: { lt: after.at } } }, { violation: { occurredAt: after.at }, id: { lt: after.id } }] }]
        : []),
    ];
    const rows = await db.fine.findMany({
      where: { AND: and },
      include,
      orderBy: [{ violation: { occurredAt: "desc" } }, { id: "desc" }],
      take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => toFineDTO(r, now)),
      nextCursor: rows.length > q.limit && last ? encodeCursor(last.violation.occurredAt, last.id) : null,
    };
  }

  async function detail(id: string): Promise<OfficerFineDetailDTO> {
    return toDetail(db, await load(id), clock());
  }

  const TARGET = { VOID: "VOID", APPEAL_ACCEPT: "VOID", APPEAL_REJECT: "NOTIFIED" } as const;

  async function changeStatus(input: { id: string; action: OfficerFineAction; reason: string; officerId: string; ip: string | null }): Promise<OfficerFineDetailDTO> {
    const now = clock();
    const row = await load(input.id);
    const status = effectiveFineStatus(row, now);
    const allowed = input.action === "VOID" ? status === "PENDING" || status === "OVERDUE" : status === "APPEALED";
    if (!allowed) throw new DomainError("INVALID_TRANSITION", `No se puede aplicar ${input.action} a una multa ${status}.`);
    const to = TARGET[input.action];
    await transition(db, row.violationId, to, { type: "OFFICER", id: input.officerId, ip: input.ip }, {
      note: input.reason,
      ...(to === "VOID" && { voidReason: input.reason }),
    });
    return toDetail(db, await load(input.id), clock());
  }

  /**
   * Reenvía al titular el mismo WhatsApp de la multa (tipo, lugar, fecha, placa, monto y enlace con la evidencia
   * y el pago). Solo multas por pagar (pendientes o vencidas); máximo 3 por hora por multa. Se audita siempre.
   */
  async function resendNotification(input: { id: string; officerId: string; ip: string | null }): Promise<OfficerResendDTO> {
    const now = clock();
    const row = await load(input.id);
    const status = effectiveFineStatus(row, now);
    if (status !== "PENDING" && status !== "OVERDUE") {
      throw new DomainError("CONFLICT", "Solo se puede reenviar la notificación de una multa pendiente o vencida.", "NO_REENVIABLE");
    }
    const owner = row.violation.vehicle?.owner;
    if (!owner) throw new DomainError("CONFLICT", "El vehículo no tiene un titular registrado a quien notificar.", "SIN_TITULAR");
    if (!owner.phone.trim()) throw new DomainError("CONFLICT", "El titular no tiene un teléfono registrado.", "SIN_TELEFONO");

    // Se cuenta antes de enviar (bajo bloqueo): reintentar sin parar no inunda al titular.
    await consumeLimit(
      db,
      { action: RESEND_ACTION, entityId: row.id, max: RESEND_MAX_PER_HOUR, windowMs: HOUR_MS, lockKey: `fine-resend:${row.id}` },
      { actor: { type: "OFFICER", id: input.officerId, ip: input.ip }, action: RESEND_ACTION, entity: "Fine", entityId: row.id },
      now,
    );
    const result = await deps.notify(row.id);
    return {
      status: result.status === "SENT" || result.status === "DRY_RUN" ? result.status : "FAILED",
      telefono: maskPhone(owner.phone),
      fine: await toDetail(db, await load(input.id), clock()),
    };
  }

  return { list, detail, changeStatus, resendNotification };
}
