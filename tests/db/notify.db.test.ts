import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db.ts'
import { createNotifier } from '../../lib/notify/notifier.ts'
import { createPrismaNotificationRepo } from '../../lib/notify/prisma-repo.ts'

// Integración de lib/notify contra la base real (`pnpm test:db`), SIN enviar WhatsApp: `send` es falso.
// Usa el vehículo del seed AB123CD (dueño V-99000001, teléfono falso salvo DEMO_PHONE_DRIVER).
const RUN = `test_ntf_${Date.now().toString(36)}`
const send = vi.fn(async () => ({ status: 'SENT' as const, providerId: `wamid.${RUN}` }))
const notifier = createNotifier({ repo: createPrismaNotificationRepo(db), send, appBaseUrl: 'https://example.test' })
let fineId = ''
let ownerPhone = ''

beforeAll(async () => {
  const vehicle = await db.vehicle.findUnique({ where: { plate: 'AB123CD' }, include: { owner: true } })
  if (!vehicle) throw new Error('Falta el seed: corre `pnpm db:seed`')
  ownerPhone = vehicle.owner.phone
  await db.violation.create({
    data: {
      id: RUN, idempotencyKey: `test-${RUN}`, type: 'RED_LIGHT', status: 'FINED', cameraId: 'seed_cam_1', vehicleId: vehicle.id,
      plateRead: 'AB123CD', confidence: 0.9, occurredAt: new Date(), aiOutput: {}, ruleOutput: {},
      fine: { create: { id: `${RUN}_fine`, publicToken: `${RUN}-token-pad`, amountCents: 2_500_000, dueAt: new Date(Date.now() + 86_400_000) } },
    },
  })
  fineId = `${RUN}_fine`
  await db.payment.create({
    data: { fineId, status: 'APPROVED', payerBankCode: '0134', payerPhone: '04120000001', payerCedula: 'V99000001', amountCents: 2_500_000, reference: 'SIM-00000001', idempotencyKey: `${RUN}-pay` },
  })
})

afterAll(async () => {
  const ids = (await db.notification.findMany({ where: { fineId }, select: { id: true } })).map((n) => n.id)
  await db.auditLog.deleteMany({ where: { entity: 'Notification', entityId: { in: ids } } })
  await db.notification.deleteMany({ where: { fineId } })
  await db.payment.deleteMany({ where: { fineId } })
  await db.fine.deleteMany({ where: { id: fineId } })
  await db.violation.deleteMany({ where: { id: RUN } })
  await db.$disconnect()
})

describe('notificaciones contra la base', () => {
  it('aviso de multa: envía al dueño y guarda Notification SENT con su AuditLog', async () => {
    expect(await notifier.notifyFineIssued(fineId)).toEqual({ channel: 'WHATSAPP', status: 'SENT', providerId: `wamid.${RUN}` })
    const n = await db.notification.findFirstOrThrow({ where: { fineId, template: 'FINE_ISSUED' } })
    expect(n).toMatchObject({ channel: 'WHATSAPP', to: ownerPhone, status: 'SENT', providerId: `wamid.${RUN}`, error: null })
    const log = await db.auditLog.findFirstOrThrow({ where: { entity: 'Notification', entityId: n.id } })
    expect(log).toMatchObject({ action: 'NOTIFICATION_SENT', actorType: 'SYSTEM' })
    expect(JSON.stringify(log.after)).not.toContain(ownerPhone)
  })

  it('confirmación de pago con la referencia aprobada', async () => {
    expect((await notifier.notifyPaymentConfirmed(fineId)).status).toBe('SENT')
    const n = await db.notification.findFirstOrThrow({ where: { fineId, template: 'PAYMENT_CONFIRMED' } })
    expect(n.status).toBe('SENT')
    const calls = send.mock.calls as unknown as Array<[{ body: string }]>
    expect(calls.at(-1)?.[0].body).toContain('Ref SIM-00000001')
  })
})
