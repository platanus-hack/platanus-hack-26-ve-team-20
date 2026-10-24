// Textos de los WhatsApp (docs/04 §7). Se envían como `type: "text"` desde el número de prueba de Meta,
// así que son nuestros textos, no plantillas de Meta. Funciones puras: sin DB ni red.
// "usted" en comunicaciones oficiales (AGENTS.md §6); fechas en hora de Caracas.
import { maskPlate, normalizePlate, type ViolationType } from "../contracts/index.ts";

/** Valor de `Notification.template` (docs/03). */
export const NOTIFICATION_TEMPLATES = ["FINE_ISSUED", "PAYMENT_CONFIRMED", "OFFICER_ALERT"] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

const VIOLATION_LABELS: Record<ViolationType, string> = {
  RED_LIGHT: "luz roja",
  TURN_ARROW: "flecha de giro",
  SPEEDING: "exceso de velocidad",
};

// Intl usa el símbolo histórico "Bs.S" para VES; en los mensajes va "Bs.".
const CURRENCY_SYMBOLS: Record<string, string> = { VES: "Bs.", USD: "USD" };

/** Intl mete espacios no separables (p. ej. en "a. m."); en WhatsApp van espacios normales. */
function plainSpaces(text: string): string {
  return text.replace(/\s/g, " ");
}

/** `24/10/2026, 10:03 a. m.` en hora de Caracas. */
export function formatCaracasDateTime(at: Date | string): string {
  const formatted = new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(at));
  return plainSpaces(formatted);
}

/** Céntimos enteros → `Bs. 1.234,56`. */
export function formatAmount(amountCents: number, currency: string): string {
  const number = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    amountCents / 100,
  );
  return plainSpaces(`${CURRENCY_SYMBOLS[currency] ?? currency} ${number}`);
}

/** `420 m` por debajo de 1 km; `1,5 km` desde ahí. */
export function formatDistance(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return plainSpaces(`${new Intl.NumberFormat("es-VE", { maximumFractionDigits: 1 }).format(distanceM / 1000)} km`);
}

function minutesAgo(at: Date | string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(at).getTime()) / 60_000);
  return minutes < 1 ? "hace menos de 1 min" : `hace ${minutes} min`;
}

export function fineUrl(appBaseUrl: string, fineToken: string): string {
  return `${appBaseUrl.replace(/\/+$/, "")}/multa/${fineToken}`;
}

export interface FineIssuedInput {
  type: ViolationType;
  intersection: string;
  occurredAt: Date | string;
  plate: string;
  amountCents: number;
  currency: string;
  fineToken: string;
  appBaseUrl: string;
}

export function fineIssuedText(i: FineIssuedInput): string {
  return (
    `SmartTraffic (demo). Se registró una posible infracción: ${VIOLATION_LABELS[i.type]} en ${i.intersection}, ` +
    `${formatCaracasDateTime(i.occurredAt)} (hora de Caracas), vehículo placa ${maskPlate(i.plate)}. ` +
    `Monto de ejemplo: ${formatAmount(i.amountCents, i.currency)}. ` +
    `Vea la evidencia, pague o apele aquí: ${fineUrl(i.appBaseUrl, i.fineToken)}`
  );
}

export interface PaymentConfirmedInput {
  reference: string;
  plate: string;
}

export function paymentConfirmedText(i: PaymentConfirmedInput): string {
  return `SmartTraffic (demo). Pago simulado recibido. Ref ${i.reference}. Multa ${maskPlate(i.plate)} saldada.`;
}

export interface OfficerAlertInput {
  plate: string;
  vehicle: string;
  unpaidCount: number;
  intersection: string;
  seenAt: Date | string;
  distanceM: number;
  now?: Date;
}

/** El oficial ve la placa completa, pero nunca datos del dueño (docs/08 §3). */
export function officerAlertText(i: OfficerAlertInput): string {
  const fines = i.unpaidCount === 1 ? "1 multa impaga" : `${i.unpaidCount} multas impagas`;
  return (
    `SmartTraffic · Alerta: vehículo ${normalizePlate(i.plate)} (${i.vehicle}) con ${fines} visto en ${i.intersection} ` +
    `${minutesAgo(i.seenAt, i.now ?? new Date())}, a ${formatDistance(i.distanceM)} de su posición. ` +
    `Verifique antes de actuar.`
  );
}
