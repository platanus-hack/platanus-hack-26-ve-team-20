// Portal público por cédula (P1, HU-05 / docs/04 §4). Datos LIMITADOS por diseño: sin nombre,
// teléfono ni correo; la placa va enmascarada; el token de la multa no se expone (solo tras OTP,
// stretch). La respuesta tiene siempre la misma forma exista o no la cédula.
import { createHash } from "node:crypto";
import {
  maskCedula,
  maskPlate,
  normalizeCedula,
  type FineStatus,
  type PortalLookupDTO,
} from "../contracts/index.ts";
import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { consumeLimit } from "./rate-limit.ts";
import { effectiveFineStatus } from "./state-machine.ts";

export const PORTAL_ACTION = "PORTAL_LOOKUP";
export const PORTAL_MAX_LOOKUPS = 10;
export const PORTAL_WINDOW_MS = 10 * 60_000;
/** Máximo de multas que se listan (el resumen siempre cuenta todas). */
export const PORTAL_MAX_ITEMS = 50;

/**
 * Cédulas que se buscan. Con prefijo explícito (`V`, `E`, `J`, `G`, `P`) es solo esa; sin prefijo se
 * prueba como venezolano (`V`) y extranjero (`E`), porque el ciudadano suele escribir solo el número.
 */
export function cedulaCandidates(input: string): string[] {
  const c = normalizeCedula(input);
  return /^[A-Z]/.test(c) ? [c] : [`V${c}`, `E${c}`];
}

export const portalFineInclude = {
  violation: { include: { camera: { include: { intersection: true } }, vehicle: true } },
} satisfies Prisma.FineInclude;
export type PortalFineRow = Prisma.FineGetPayload<{ include: typeof portalFineInclude }>;

const UNPAID: readonly FineStatus[] = ["PENDING", "OVERDUE"];

/** Arma la respuesta a partir de las multas del titular. Pura: no toca la base. */
export function toPortalLookup(cedula: string, fines: PortalFineRow[], now: Date = new Date()): PortalLookupDTO {
  const rows = fines
    .map((f) => ({ f, status: effectiveFineStatus(f, now) }))
    .sort((a, b) => b.f.violation.occurredAt.getTime() - a.f.violation.occurredAt.getTime());
  return {
    cedulaMasked: maskCedula(cedula),
    summary: {
      total: rows.length,
      pending: rows.filter((r) => UNPAID.includes(r.status)).length,
      paid: rows.filter((r) => r.status === "PAID").length,
    },
    items: rows.slice(0, PORTAL_MAX_ITEMS).map(({ f, status }) => ({
      occurredAt: f.violation.occurredAt.toISOString(),
      type: f.violation.type,
      intersection: f.violation.camera.intersection.name,
      plateMasked: maskPlate(f.violation.vehicle?.plate ?? f.violation.plateRead ?? ""),
      status,
      amountCents: f.amountCents,
      currency: f.currency,
      fineToken: null,
    })),
  };
}

export async function findFinesByCedula(db: Pick<PrismaClient, "fine">, cedula: string): Promise<PortalFineRow[]> {
  return db.fine.findMany({
    where: { violation: { vehicle: { owner: { cedula: { in: cedulaCandidates(cedula) } } } } },
    include: portalFineInclude,
  });
}

/**
 * Consulta por cédula con límite de {@link PORTAL_MAX_LOOKUPS} consultas por IP cada 10 minutos
 * (`RateLimitedError` → 429). Cada consulta permitida queda en el AuditLog con la IP y una huella de
 * la cédula (nunca la cédula en claro).
 */
export async function portalLookup(
  db: PrismaClient,
  input: { cedula: string; ip: string | null },
  now: Date = new Date(),
): Promise<PortalLookupDTO> {
  const ip = input.ip ?? "unknown";
  const cedula = cedulaCandidates(input.cedula)[0]!;
  await consumeLimit(
    db,
    { action: PORTAL_ACTION, ip, max: PORTAL_MAX_LOOKUPS, windowMs: PORTAL_WINDOW_MS, lockKey: `portal:${ip}` },
    {
      actor: { type: "CITIZEN", ip },
      action: PORTAL_ACTION,
      entity: "Person",
      entityId: createHash("sha256").update(cedula).digest("hex").slice(0, 16),
    },
    now,
  );
  return toPortalLookup(cedula, await findFinesByCedula(db, input.cedula), now);
}
