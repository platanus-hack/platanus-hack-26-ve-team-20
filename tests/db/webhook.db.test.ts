import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POST } from '../../api/webhooks/whatsapp.ts'
import { db } from '../../lib/db.ts'

// Webhook de WhatsApp contra la base real (`pnpm test:db`): eventos firmados como los manda Meta.
const RUN = `test_wh_${Date.now().toString(36)}`
const SECRET = 'secreto-de-prueba-webhook'
const WAMID_A = `wamid.${RUN}.A`
const WAMID_B = `wamid.${RUN}.B`
const fineId = `${RUN}_fine`
let previousSecret: string | undefined

function event(statuses: Array<{ id: string; status: string; ts: number; errors?: unknown[] }>) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      statuses: statuses.map((s) => ({ id: s.id, status: s.status, timestamp: String(s.ts), recipient_id: '584120000001', ...(s.errors && { errors: s.errors }) })),
    } }] }],
  })
}

function post(body: string) {
  const signature = `sha256=${createHmac('sha256', SECRET).update(body, 'utf8').digest('hex')}`
  return POST(new Request('https://example.test/api/webhooks/whatsapp', { method: 'POST', body, headers: { 'X-Hub-Signature-256': signature } }))
}

const statusOf = async (providerId: string) => (await db.notification.findFirstOrThrow({ where: { providerId } })).status

beforeAll(async () => {
  previousSecret = process.env.WHATSAPP_APP_SECRET
  process.env.WHATSAPP_APP_SECRET = SECRET
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) throw new Error('Falta el seed: corre `pnpm db:seed`')
  await db.violation.create({
    data: {
      id: RUN, idempotencyKey: `test-${RUN}`, type: 'RED_LIGHT', status: 'NOTIFIED', cameraId: 'seed_cam_1', confidence: 0.9,
      occurredAt: new Date(), aiOutput: {}, ruleOutput: {},
      fine: { create: { id: fineId, publicToken: `${RUN}-token-pad`, amountCents: 100, dueAt: new Date(Date.now() + 86_400_000) } },
    },
  })
  await db.notification.createMany({
    data: [
      { fineId, channel: 'WHATSAPP', to: '584120000001', template: 'FINE_ISSUED', status: 'SENT', providerId: WAMID_A },
      { fineId, channel: 'WHATSAPP', to: '584120000001', template: 'PAYMENT_CONFIRMED', status: 'SENT', providerId: WAMID_B },
    ],
  })
})

afterAll(async () => {
  process.env.WHATSAPP_APP_SECRET = previousSecret
  const ids = (await db.notification.findMany({ where: { fineId }, select: { id: true } })).map((n) => n.id)
  await db.auditLog.deleteMany({ where: { entity: 'Notification', entityId: { in: ids } } })
  await db.notification.deleteMany({ where: { fineId } })
  await db.fine.deleteMany({ where: { id: fineId } })
  await db.violation.deleteMany({ where: { id: RUN } })
  await db.$disconnect()
})

describe('webhook de WhatsApp contra la base', () => {
  it('entregado y leído suben el estado; un entregado atrasado no lo baja', async () => {
    const res = await post(event([{ id: WAMID_A, status: 'delivered', ts: 1_792_850_000 }, { id: WAMID_A, status: 'read', ts: 1_792_850_060 }]))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, data: { statuses: 2, updated: 2, unchanged: 0, notFound: 0 } })
    expect(await statusOf(WAMID_A)).toBe('READ')

    const late = await post(event([{ id: WAMID_A, status: 'delivered', ts: 1_792_850_000 }]))
    expect(await late.json()).toMatchObject({ data: { updated: 0, unchanged: 1 } })
    expect(await statusOf(WAMID_A)).toBe('READ')
  })

  it('un fallo de entrega guarda el error de Meta', async () => {
    await post(event([{ id: WAMID_B, status: 'failed', ts: 1_792_850_100, errors: [{ code: 131047, title: 'Re-engagement message' }] }]))
    const n = await db.notification.findFirstOrThrow({ where: { providerId: WAMID_B } })
    expect(n).toMatchObject({ status: 'FAILED', error: '131047: Re-engagement message' })
  })

  it('cada cambio queda auditado como WEBHOOK', async () => {
    const ids = (await db.notification.findMany({ where: { fineId }, select: { id: true } })).map((n) => n.id)
    const logs = await db.auditLog.findMany({ where: { entity: 'Notification', entityId: { in: ids } }, orderBy: { createdAt: 'asc' } })
    expect(logs.map((l) => (l.after as { status: string }).status)).toEqual(['DELIVERED', 'READ', 'FAILED'])
    expect(new Set(logs.map((l) => `${l.actorType}:${l.action}`))).toEqual(new Set(['WEBHOOK:NOTIFICATION_STATUS']))
  })

  it('un wamid desconocido no rompe nada y una firma falsa no toca la base', async () => {
    const unknown = await post(event([{ id: `wamid.${RUN}.desconocido`, status: 'delivered', ts: 1 }]))
    expect(await unknown.json()).toMatchObject({ data: { notFound: 1 } })

    const body = event([{ id: WAMID_B, status: 'read', ts: 2 }])
    const forged = await POST(new Request('https://example.test/x', { method: 'POST', body, headers: { 'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64) } }))
    expect(forged.status).toBe(401)
    expect(await statusOf(WAMID_B)).toBe('FAILED')
  })
})
