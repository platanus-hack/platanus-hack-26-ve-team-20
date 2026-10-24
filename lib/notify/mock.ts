// Mock de lib/notify (P3) con las firmas de lib/contracts/modules.ts. Se activa con USE_MOCKS=true
// mientras no exista el módulo real. No envía nada: siempre DRY_RUN, como NOTIFY_DRY_RUN=true.
import type {
  NotificationResult,
  NotifyFineIssued,
  NotifyOfficerAlert,
  NotifyPaymentConfirmed,
} from "../contracts/index.ts";

function dryRun(ref: string): NotificationResult {
  return { channel: "WHATSAPP", status: "DRY_RUN", providerId: `mock-wamid-${ref}` };
}

export const notifyFineIssued = (async (fineId) => dryRun(`fine-${fineId}`)) satisfies NotifyFineIssued;

export const notifyPaymentConfirmed = (async (fineId) =>
  dryRun(`payment-${fineId}`)) satisfies NotifyPaymentConfirmed;

export const notifyOfficerAlert = (async (alertId) => dryRun(`alert-${alertId}`)) satisfies NotifyOfficerAlert;
