// "Ciudadano de la demo": una cédula REAL del equipo (la de quien presenta) con datos FALSOS para que
// el portal, el pago y el WhatsApp se puedan probar con ella. La cédula NUNCA va en el repo: entra por
// DEMO_CEDULA (entorno), igual que DEMO_PHONE_DRIVER. Todo lo demás es inventado: el nombre, las
// placas, las intersecciones y los montos. Ids con prefijo `seed_demo_`, así `demo:reset` no los borra.
import { nanoid } from "nanoid";
import { normalizeCedula } from "../lib/contracts/index.ts";
import { FINE_AMOUNTS_EXAMPLE } from "../lib/domain/fines.ts";
import type { PrismaClient } from "../lib/generated/prisma/client.ts";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const DEMO_CITIZEN_PREFIX = "seed_demo";
export const DEMO_CITIZEN_PLATES = ["DM001AA", "DM002BB"] as const;
const FAKE_PHONE = "584120000900";

export interface DemoCitizenOptions {
  /** DEMO_CEDULA. Sin valor (o con formato inválido) no se siembra nada. */
  cedula?: string | undefined;
  /** DEMO_PHONE_DRIVER: el WhatsApp de la prueba. Sin él, un teléfono falso. */
  phone?: string | undefined;
  now: Date;
  /** Prefijo de los ids; solo lo cambian las pruebas para no chocar con la cuenta real. */
  idPrefix?: string;
  /** Placas de los 2 vehículos; solo las cambian las pruebas (la placa es única). */
  plates?: readonly [string, string];
}

type FineState = "PENDING" | "PAID" | "VOID";
interface Row { n: number; plate: 0 | 1; status: "NOTIFIED" | "PAID" | "VOID"; fine: FineState; daysAgo: number; dueIn: number; paidDaysAgo?: number }

// 5 multas: 3 impagas (una vencida), 1 pagada y 1 anulada, repartidas en 2 vehículos.
const ROWS: Row[] = [
  { n: 1, plate: 0, status: "NOTIFIED", fine: "PENDING", daysAgo: 2, dueIn: 28 }, // impaga y vigente
  { n: 2, plate: 0, status: "NOTIFIED", fine: "PENDING", daysAgo: 45, dueIn: -15 }, // vencida
  { n: 3, plate: 1, status: "NOTIFIED", fine: "PENDING", daysAgo: 5, dueIn: 25 }, // impaga y vigente
  { n: 4, plate: 1, status: "PAID", fine: "PAID", daysAgo: 20, dueIn: 10, paidDaysAgo: 18 },
  { n: 5, plate: 0, status: "VOID", fine: "VOID", daysAgo: 60, dueIn: -30 },
];

/** Cédula normalizada si es válida; `null` si falta o no tiene forma de cédula. */
export function parseDemoCedula(raw: string | undefined): string | null {
  const c = raw ? normalizeCedula(raw) : "";
  return /^[VEJGP]\d{5,9}$/.test(c) ? c : null;
}

export function buildDemoCitizen(opts: DemoCitizenOptions) {
  const cedula = parseDemoCedula(opts.cedula);
  if (!cedula) return null;
  const p = opts.idPrefix ?? DEMO_CITIZEN_PREFIX;
  const plates = opts.plates ?? DEMO_CITIZEN_PLATES;
  const t = opts.now.getTime();

  const person = { id: `${p}_per`, cedula, fullName: "Persona Demo", phone: opts.phone || FAKE_PHONE, email: "persona.demo@example.com" };
  const vehicles = [
    { id: `${p}_veh_1`, plate: plates[0], make: "Toyota", model: "Yaris", color: "azul", year: 2019, ownerId: person.id },
    { id: `${p}_veh_2`, plate: plates[1], make: "Chevrolet", model: "Spark", color: "rojo", year: 2016, ownerId: person.id },
  ];
  const violations = ROWS.map((r) => {
    const occurredAt = new Date(t - r.daysAgo * DAY);
    const id = `${p}_vio_${r.n}`;
    return {
      id,
      n: r.n,
      status: r.status,
      cameraId: `seed_cam_${((r.n - 1) % 4) + 1}`,
      vehicleId: vehicles[r.plate]!.id,
      plate: vehicles[r.plate]!.plate,
      occurredAt,
      idempotencyKey: `${p}-vio-${r.n}`,
      voidReason: r.status === "VOID" ? "Vehículo de emergencia (ejemplo)" : null,
      evidence: { id: `${p}_ev_${r.n}`, url: `https://example.com/seed/evidencia-demo-${r.n}.jpg`, capturedAt: occurredAt },
      fine: {
        id: `${p}_fine_${r.n}`,
        status: r.fine,
        amountCents: FINE_AMOUNTS_EXAMPLE.RED_LIGHT,
        issuedAt: new Date(occurredAt.getTime() + HOUR),
        dueAt: new Date(t + r.dueIn * DAY),
        paidAt: r.paidDaysAgo !== undefined ? new Date(t - r.paidDaysAgo * DAY) : null,
        payment: r.fine === "PAID" ? { id: `${p}_pay_${r.n}`, reference: `SIM-2000000${r.n}`, idempotencyKey: `${p}-pay-${r.n}` } : null,
      },
    };
  });
  return { person, vehicles, violations };
}

export type DemoCitizen = NonNullable<ReturnType<typeof buildDemoCitizen>>;

export interface DemoCitizenResult {
  applied: boolean;
  reason?: string;
  /** Multas impagas con su token, para probar `/multa/<token>`. */
  pending: Array<{ plateMasked: string; status: string; token: string }>;
}

/**
 * Siembra al ciudadano de la demo. Idempotente: el token de cada multa se crea una sola vez (aleatorio)
 * y se conserva en las siguientes siembras; el resto se restaura. No toca a una persona que ya exista con
 * esa cédula bajo otro id (p. ej. un titular del seed): avisa y no hace nada.
 */
export async function applyDemoCitizen(db: PrismaClient, data: DemoCitizen): Promise<DemoCitizenResult> {
  const taken = await db.person.findUnique({ where: { cedula: data.person.cedula } });
  if (taken && taken.id !== data.person.id) {
    return { applied: false, reason: "ya existe otra persona con esa cédula (no se modifica)", pending: [] };
  }

  const { id: personId, ...personFields } = data.person;
  await db.person.upsert({ where: { id: personId }, create: data.person, update: personFields });
  for (const v of data.vehicles) {
    const { id, ...fields } = v;
    await db.vehicle.upsert({ where: { id }, create: v, update: fields });
  }

  const pending: DemoCitizenResult["pending"] = [];
  for (const v of data.violations) {
    const fields = {
      type: "RED_LIGHT" as const, status: v.status, reviewReason: null, cameraId: v.cameraId, vehicleId: v.vehicleId,
      plateRead: v.plate, plateConfidence: 0.95, confidence: 0.93, occurredAt: v.occurredAt, modelVersion: "seed",
      aiOutput: { seed: true }, ruleOutput: { seed: true }, voidReason: v.voidReason,
    };
    await db.violation.upsert({ where: { id: v.id }, create: { id: v.id, idempotencyKey: v.idempotencyKey, ...fields }, update: fields });
    const ev = { violationId: v.id, kind: "FRAME" as const, url: v.evidence.url, capturedAt: v.evidence.capturedAt, meta: { lightState: "RED", seed: true } };
    await db.evidence.upsert({ where: { id: v.evidence.id }, create: { id: v.evidence.id, ...ev }, update: ev });

    const f = v.fine;
    const fineFields = { violationId: v.id, amountCents: f.amountCents, currency: "VES", status: f.status, issuedAt: f.issuedAt, dueAt: f.dueAt, paidAt: f.paidAt };
    const saved = await db.fine.upsert({ where: { id: f.id }, create: { id: f.id, publicToken: nanoid(24), ...fineFields }, update: fineFields });
    if (f.payment) {
      const pay = { fineId: f.id, method: "C2P_SIMULATED", status: "APPROVED" as const, payerBankCode: "0102", payerPhone: "04120000001", payerCedula: data.person.cedula, amountCents: f.amountCents, reference: f.payment.reference };
      await db.payment.upsert({ where: { id: f.payment.id }, create: { id: f.payment.id, idempotencyKey: f.payment.idempotencyKey, ...pay }, update: pay });
    }
    if (f.status === "PENDING") {
      pending.push({ plateMasked: `${v.plate.slice(0, 2)}***${v.plate.slice(-2)}`, status: f.dueAt < new Date() ? "OVERDUE" : "PENDING", token: saved.publicToken });
    }
  }
  return { applied: true, pending };
}

/** Líneas para la consola tras sembrar: los enlaces de pago de las multas impagas (nunca la cédula). */
export function formatDemoCitizen(result: DemoCitizenResult, baseUrl: string): string[] {
  if (!result.applied) return [`demo: ${result.reason ?? "no se sembró"}`];
  return [
    `demo: ciudadano de la demo listo (cédula de DEMO_CEDULA) · ${result.pending.length} multas impagas:`,
    ...result.pending.map((p) => `  ${p.plateMasked}  ${p.status.padEnd(7)}  ${baseUrl.replace(/\/$/, "")}/multa/${p.token}`),
  ];
}
