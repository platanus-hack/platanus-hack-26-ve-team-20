// Datos FALSOS del seed (docs/03 §5). Funciones puras: no tocan la base ni leen el entorno, así se
// pueden probar. Todo lo sembrado tiene id con prefijo `seed_`; `pnpm demo:reset` lo usa para
// distinguirlo de lo que genera la demo. NUNCA poner aquí datos reales: los únicos teléfonos reales
// permitidos entran por DEMO_PHONE_DRIVER / DEMO_PHONE_OFFICER (variables de entorno).
import { createHash } from "node:crypto";
import { normalizeCedula, normalizePlate } from "../lib/contracts/index.ts";
import { FINE_AMOUNTS_EXAMPLE } from "../lib/domain/fines.ts";

export const SEED_PREFIX = "seed_";
const DAY = 86_400_000;
const HOUR = 3_600_000;

// Mismo monto de ejemplo que usa el dominio (lib/domain/fines.ts), en céntimos.
const AMOUNT_RED_LIGHT_CENTS = FINE_AMOUNTS_EXAMPLE.RED_LIGHT;

export interface SeedOptions {
  now: Date;
  /** DEMO_PHONE_DRIVER: reemplaza el teléfono falso de "Persona Ejemplo 1". */
  driverPhone?: string | undefined;
  /** DEMO_PHONE_OFFICER: reemplaza el teléfono falso de "Oficial Ejemplo A". */
  officerPhone?: string | undefined;
}

type Status = "NOTIFIED" | "PAID" | "VOID" | "NEEDS_REVIEW";
type FineState = "PENDING" | "PAID" | "VOID";

export interface SeedViolation {
  id: string;
  n: number;
  type: "RED_LIGHT";
  status: Status;
  reviewReason: "LOW_CONFIDENCE" | "PLATE_NOT_FOUND" | null;
  cameraId: string;
  vehiclePlate: string | null;
  plateRead: string;
  plateConfidence: number;
  confidence: number;
  occurredAt: Date;
  idempotencyKey: string;
  voidReason: string | null;
  evidence: { id: string; url: string; capturedAt: Date };
  fine: null | {
    id: string;
    publicToken: string;
    amountCents: number;
    currency: "VES";
    status: FineState;
    issuedAt: Date;
    dueAt: Date;
    paidAt: Date | null;
    payment: null | { id: string; reference: string; idempotencyKey: string };
  };
}

/** Calibración de EJEMPLO, igual en las 4 cámaras hasta calibrar las reales (docs/10 §5). */
export const CALIBRATION_EXAMPLE = {
  stopLine: [[0.38, 0.35], [0.62, 0.35]],
  homography: {
    example: true,
    imagePoints: [[0.3, 0.9], [0.7, 0.9], [0.6, 0.4], [0.4, 0.4]],
    groundPointsM: [[0, 0], [7, 0], [7, 25], [0, 25]],
    controlImage: [[0.52, 0.62], [0.44, 0.5]],
    controlGroundM: [[3.5, 8], [0.5, 15]],
    reprojectionErrorM: null,
  },
  lanes: [
    { id: "C1", polygon: [[0.5, 0.9], [0.7, 0.9], [0.6, 0.4], [0.5, 0.4]], allowedDirection: [0, 1], limitKmh: 40, limitSource: "reglamento_art_254_urbano" },
    { id: "C2", polygon: [[0.3, 0.9], [0.5, 0.9], [0.5, 0.4], [0.4, 0.4]], allowedDirection: [0, -1], limitKmh: 40, limitSource: "reglamento_art_254_urbano" },
  ],
  speedZone: { yAM: 3, yBM: 18, toleranceKmh: 10 },
  parameters: {
    minTrackFrames: 15, wrongWayWindowS: 1.0, wrongWayMinM: 2.0, wrongWayAngleDeg: 135, wrongWayChecks: 10, stopLineFrames: 3,
  },
} as const;

function fineToken(n: number): string {
  return createHash("sha256").update(`seed-fine-${n}`).digest("base64url").slice(0, 24);
}

export function buildSeed({ now, driverPhone, officerPhone }: SeedOptions) {
  const t = now.getTime();

  const intersections = [
    { id: "seed_int_1", name: "Av. Demo Norte con Calle 1 (ejemplo)", lat: 10.4961, lng: -66.853 },
    { id: "seed_int_2", name: "Av. Ejemplo Sur con Calle 5 (ejemplo)", lat: 10.489, lng: -66.881 },
    { id: "seed_int_3", name: "Autopista Demo con Calle 10 (ejemplo)", lat: 10.472, lng: -66.904 },
  ];

  const cameras = [
    { id: "seed_cam_1", code: "CAM-001", intersectionId: "seed_int_1" },
    { id: "seed_cam_2", code: "CAM-002", intersectionId: "seed_int_1" },
    { id: "seed_cam_3", code: "CAM-003", intersectionId: "seed_int_2" },
    { id: "seed_cam_4", code: "CAM-004", intersectionId: "seed_int_3" },
  ].map((c) => ({ ...c, configVersion: 1, speedLimitKmh: 40, active: true, ...CALIBRATION_EXAMPLE }));

  // V-99000001 = dueño de la placa de los clips demo (sin multas). V-99000002 = 2 multas impagas (alerta).
  const persons = Array.from({ length: 8 }, (_, i) => {
    const n = i + 1;
    return {
      id: `seed_per_${n}`,
      cedula: normalizeCedula(`V-9900000${n}`),
      fullName: `Persona Ejemplo ${n}`,
      phone: n === 1 && driverPhone ? driverPhone : `5841200000${String(n).padStart(2, "0")}`,
      email: `persona${n}@example.com`,
    };
  });

  const vehicleRows: Array<[number, string, string, string, string, number]> = [
    // [dueño, placa, marca, modelo, color, año]
    [1, "AB123CD", "Toyota", "Corolla", "gris", 2018],
    [2, "XY987ZT", "Ford", "F-150", "blanca", 2016],
    [3, "CD456EF", "Chevrolet", "Aveo", "rojo", 2012],
    [3, "GH789IJ", "Hyundai", "Accent", "negro", 2015],
    [4, "KL012MN", "Kia", "Rio", "azul", 2019],
    [4, "OP345QR", "Renault", "Logan", "plata", 2014],
    [5, "ST678UV", "Toyota", "Hilux", "verde", 2017],
    [6, "WX901YZ", "Ford", "Fiesta", "blanco", 2013],
    [7, "AA111BB", "Mazda", "3", "gris", 2020],
    [8, "CC222DD", "Chevrolet", "Spark", "amarillo", 2011],
  ];
  const vehicles = vehicleRows.map(([owner, plate, make, model, color, year], i) => ({
    id: `seed_veh_${i + 1}`,
    plate: normalizePlate(plate),
    make, model, color, year,
    ownerId: `seed_per_${owner}`,
  }));

  // [placa, estado, estado de la multa, ocurrió hace (días), vence en (días), pagada hace (días)]
  const rows: Array<[string | null, Status, FineState | null, number, number | null, number | null]> = [
    ["XY987ZT", "NOTIFIED", "PENDING", 3, 27, null],      // impaga
    ["XY987ZT", "NOTIFIED", "PENDING", 10, 20, null],     // impaga
    ["CD456EF", "PAID", "PAID", 20, 10, 18],
    ["GH789IJ", "PAID", "PAID", 35, -5, 33],
    ["KL012MN", "PAID", "PAID", 50, -20, 48],
    ["ST678UV", "PAID", "PAID", 12, 18, 10],
    ["OP345QR", "NOTIFIED", "PENDING", 60, -30, null],    // vencida
    ["WX901YZ", "NOTIFIED", "PENDING", 75, -45, null],    // vencida
    ["AA111BB", "NOTIFIED", "PENDING", 5, 25, null],      // vigente
    ["CC222DD", "VOID", "VOID", 40, -10, null],
    [null, "NEEDS_REVIEW", null, 0, null, null],          // confianza baja
    [null, "NEEDS_REVIEW", null, 1, null, null],          // placa no registrada
  ];

  const violations: SeedViolation[] = rows.map(([plate, status, fineState, daysAgo, dueIn, paidDaysAgo], i) => {
    const n = i + 1;
    const nn = String(n).padStart(2, "0");
    const review = status === "NEEDS_REVIEW";
    const lowConfidence = review && n === 11;
    const occurredAt = new Date(review && n === 11 ? t - 2 * HOUR : t - daysAgo * DAY);
    const vehiclePlate = plate ? normalizePlate(plate) : null;
    const issuedAt = new Date(occurredAt.getTime() + HOUR);
    return {
      id: `seed_vio_${nn}`,
      n,
      type: "RED_LIGHT",
      status,
      reviewReason: review ? (lowConfidence ? "LOW_CONFIDENCE" : "PLATE_NOT_FOUND") : null,
      cameraId: `seed_cam_${(i % 4) + 1}`,
      vehiclePlate,
      plateRead: vehiclePlate ?? (lowConfidence ? "AB12?CD" : "ZZ999ZZ"),
      plateConfidence: lowConfidence ? 0.55 : 0.93,
      confidence: lowConfidence ? 0.62 : 0.92,
      occurredAt,
      idempotencyKey: `seed-vio-${nn}`,
      voidReason: status === "VOID" ? "Vehículo de emergencia (ejemplo)" : null,
      evidence: { id: `seed_ev_${nn}`, url: `/demo/evidencia-${(n % 6) + 1}.svg`, capturedAt: occurredAt },
      fine: fineState && dueIn !== null
        ? {
            id: `seed_fine_${nn}`,
            publicToken: fineToken(n),
            amountCents: AMOUNT_RED_LIGHT_CENTS,
            currency: "VES",
            status: fineState,
            issuedAt,
            dueAt: new Date(t + dueIn * DAY),
            paidAt: paidDaysAgo !== null ? new Date(t - paidDaysAgo * DAY) : null,
            payment: fineState === "PAID"
              ? { id: `seed_pay_${nn}`, reference: `SIM-${String(10_000_000 + n)}`, idempotencyKey: `seed-pay-${nn}` }
              : null,
          }
        : null,
    };
  });

  const officers = [
    { id: "seed_off_1", badge: "OF-0001", name: "Oficial Ejemplo A", phone: officerPhone ?? "584120000101", onDuty: true },
    { id: "seed_off_2", badge: "OF-0002", name: "Oficial Ejemplo B", phone: "584120000102", onDuty: true },
    { id: "seed_off_3", badge: "OF-0003", name: "Oficial Ejemplo C", phone: "584120000103", onDuty: false },
  ];

  // OF-0001 a ≈ 400 m de CAM-001, OF-0002 a ≈ 3 km y OF-0003 con una posición vieja (> 10 min: no cuenta).
  // `recordedAt` se renueva en cada siembra; la alerta exige posiciones de < 10 min, por eso la demo
  // debe empezar con `pnpm demo:reset` o con el oficial actualizando su ubicación.
  const officerLocations = [
    { id: "seed_loc_1", officerId: "seed_off_1", lat: 10.4997, lng: -66.853, accuracyM: 20, recordedAt: now },
    { id: "seed_loc_2", officerId: "seed_off_2", lat: 10.4961, lng: -66.8245, accuracyM: 25, recordedAt: now },
    { id: "seed_loc_3", officerId: "seed_off_3", lat: 10.485, lng: -66.89, accuracyM: 30, recordedAt: new Date(t - 2 * HOUR) },
  ];

  return { intersections, cameras, persons, vehicles, violations, officers, officerLocations };
}

export type SeedData = ReturnType<typeof buildSeed>;
