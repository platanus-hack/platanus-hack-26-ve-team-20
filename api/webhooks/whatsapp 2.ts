// GET/POST /api/webhooks/whatsapp — webhook de la WhatsApp Cloud API (docs/04 §7).
// Usa la firma Web de Vercel Functions (Request → Response) y no `handler()` de api/_lib/respond.ts:
// la firma X-Hub-Signature-256 se calcula sobre el body crudo, que el formato Node entrega ya parseado.
// La DB se carga al primer evento: el GET de verificación no la necesita.
import { handleWebhookGet, handleWebhookPost, webhookConfigFromEnv, type NotificationStatusStore } from "../../lib/notify/webhook.ts";

let store: Promise<NotificationStatusStore> | null = null;

const lazyStore: NotificationStatusStore = {
  async apply(event) {
    store ??= Promise.all([import("../../lib/db.ts"), import("../../lib/notify/webhook-store.ts")]).then(
      ([{ db }, { createPrismaStatusStore }]) => createPrismaStatusStore(db),
    );
    return (await store).apply(event);
  },
};

export function GET(request: Request): Response {
  return handleWebhookGet(request, webhookConfigFromEnv());
}

export function POST(request: Request): Promise<Response> {
  return handleWebhookPost(request, webhookConfigFromEnv(lazyStore));
}
