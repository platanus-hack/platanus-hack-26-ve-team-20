// GET/POST /api/webhooks/whatsapp — webhook de la WhatsApp Cloud API (docs/04 §7).
// Usa la firma Web de Vercel Functions (Request → Response) y no `handler()` de api/_lib/respond.ts:
// la firma X-Hub-Signature-256 se calcula sobre el body crudo, que el formato Node entrega ya parseado.
// Pendiente (paso 12): guardar los estados en Notification cuando exista Prisma (P1).
import { handleWebhookGet, handleWebhookPost, webhookConfigFromEnv } from "../../lib/notify/webhook.ts";

export function GET(request: Request): Response {
  return handleWebhookGet(request, webhookConfigFromEnv());
}

export function POST(request: Request): Promise<Response> {
  return handleWebhookPost(request, webhookConfigFromEnv());
}
