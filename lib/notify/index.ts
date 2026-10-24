// lib/notify (P3): funciones de lib/contracts/modules.ts. Con USE_MOCKS=true usa mock.ts.
// La DB se carga al primer uso: importar este módulo no exige DATABASE_URL.
import type { NotifyFineIssued, NotifyPaymentConfirmed } from "../contracts/index.ts";
import * as mock from "./mock.ts";
import { appBaseUrlFromEnv, createNotifier } from "./notifier.ts";
import { sendWhatsAppText } from "./whatsapp.ts";

type Notifier = ReturnType<typeof createNotifier>;
let real: Promise<Notifier> | null = null;

function notifier(): Promise<Notifier> {
  real ??= (async () => {
    const [{ db }, { createPrismaNotificationRepo }] = await Promise.all([import("../db.ts"), import("./prisma-repo.ts")]);
    return createNotifier({ repo: createPrismaNotificationRepo(db), send: (m) => sendWhatsAppText(m), appBaseUrl: appBaseUrlFromEnv() });
  })();
  return real;
}

const useMocks = () => process.env.USE_MOCKS === "true";

export const notifyFineIssued = (async (fineId) =>
  useMocks() ? mock.notifyFineIssued(fineId) : (await notifier()).notifyFineIssued(fineId)) satisfies NotifyFineIssued;

export const notifyPaymentConfirmed = (async (fineId) =>
  useMocks()
    ? mock.notifyPaymentConfirmed(fineId)
    : (await notifier()).notifyPaymentConfirmed(fineId)) satisfies NotifyPaymentConfirmed;

// notifyOfficerAlert real llega con el paso 13 del plan de P3; mientras tanto, el mock.
export { notifyOfficerAlert } from "./mock.ts";
