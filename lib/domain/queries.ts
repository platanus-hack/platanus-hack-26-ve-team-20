// Consultas de lectura (P1) que alimentan GET /api/violations y GET /api/fines/[token].
import { VIOLATION_STATUSES, type FinePublicDTO, type ViolationListDTO, type ViolationStatus } from "../contracts/index.ts";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import {
  publicFineInclude,
  toFinePublic,
  toViolationListItem,
  violationListInclude,
} from "./dto.ts";
import { DomainError, NotFoundError } from "./errors.ts";

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;
/** Los tokens de multa son nanoid(24); se aceptan formas razonables y todo lo demás es "no existe". */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{10,64}$/;

export interface ListViolationsQuery {
  /** Uno o varios estados separados por coma, p. ej. `NEEDS_REVIEW` o `FINED,NOTIFIED`. */
  status?: string | undefined;
  /** Solo lo modificado después de este instante (feed en vivo). */
  since?: string | undefined;
  limit?: number | undefined;
}

export function parseStatuses(raw: string | undefined): ViolationStatus[] | undefined {
  if (!raw) return undefined;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const invalid = list.filter((s) => !(VIOLATION_STATUSES as readonly string[]).includes(s));
  if (invalid.length > 0) throw new DomainError("VALIDATION_ERROR", `status inválido: ${invalid.join(", ")}`);
  return list as ViolationStatus[];
}

/**
 * Lista violaciones, las más recientemente modificadas primero. `nextSince` es la última
 * modificación más reciente devuelta: el cliente la manda como `since` en el siguiente sondeo. Si hay
 * más de `limit` novedades se devuelven las más nuevas (es un feed en vivo, no un historial completo).
 */
export async function listViolations(
  db: Pick<PrismaClient, "violation">,
  q: ListViolationsQuery = {},
  now: Date = new Date(),
): Promise<ViolationListDTO> {
  const statuses = parseStatuses(q.status);
  const since = q.since ? new Date(q.since) : undefined;
  if (since && Number.isNaN(since.getTime())) throw new DomainError("VALIDATION_ERROR", "since inválido");
  const limit = Math.min(Math.max(Math.trunc(q.limit ?? DEFAULT_LIST_LIMIT), 1), MAX_LIST_LIMIT);

  const where: Prisma.ViolationWhereInput = {
    ...(statuses && { status: { in: statuses } }),
    ...(since && { updatedAt: { gt: since } }),
  };
  const rows = await db.violation.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit,
    include: violationListInclude,
  });

  return {
    items: rows.map((r) => toViolationListItem(r, now)),
    nextSince: rows[0]?.updatedAt.toISOString() ?? null,
  };
}

/** Multa por su token público. Un token mal formado o inexistente es 404 (no revela cuál de los dos). */
export async function getPublicFine(
  db: Pick<PrismaClient, "fine">,
  token: string,
  now: Date = new Date(),
): Promise<FinePublicDTO> {
  if (!TOKEN_PATTERN.test(token)) throw new NotFoundError("Multa", "");
  const fine = await db.fine.findUnique({ where: { publicToken: token }, include: publicFineInclude });
  if (!fine) throw new NotFoundError("Multa", "");
  return toFinePublic(fine, now);
}
