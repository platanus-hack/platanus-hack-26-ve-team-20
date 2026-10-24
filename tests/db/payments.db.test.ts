import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { C2PRequestSchema } from '../../lib/contracts/index.ts'
import { db } from '../../lib/db.ts'
import { createC2PSimulator } from '../../lib/payments/c2p.ts'
import { payFine } from '../../lib/payments/pay-fine.ts'
import { createPrismaPaymentStore } from '../../lib/payments/prisma-store.ts'

// Integración de api/payments/c2p contra la base real (`pnpm test:db`): filas `test_pay_*`.
const RUN = `test_pay_${Date.now().toString(36)}`
const ACTOR = { type: 'CITIZEN' as const, ip: '203.0.113.7' }
let counter = 0

const deps = {
  store: createPrismaPaymentStore(db),
  charge: createC2PSimulator({ sleep: async () => {} }),
  notifyPaymentConfirmed: async () => ({ channel: 'WHATSAPP' as const, status: 'DRY_RUN' as const }),
}

async function pendingFine() {
  const id = `${RUN}_${++counter}`
  const token = `${id}-token-pad`
  await db.violation.create({
    data: {
      id, idempotencyKey: `test-${id}`, type: 'RED_LIGHT', status: 'NOTIFIED', cameraId: 'seed_cam_1', confidence: 0.9,
      occurredAt: new Date(), aiOutput: {}, ruleOutput: {},
      fine: { create: { id: `${id}_fine`, publicToken: token, amountCents: 2_500_000, dueAt: new Date(Date.now() + 86_400_000) } },
    },
  })
  return { violationId: id, fineId: `${id}_fine`, token }
}

const request = (fineToken: string, idempotencyKey: string, c2pKey = '123456') =>
  C2PRequestSchema.parse({ fineToken, payerBankCode: '0134', payerPhone: '04120000001', payerCedula: 'V-99000001', c2pKey, idempotencyKey })

beforeAll(async () => {
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) throw new Error('Falta el seed: corre `pnpm db:seed`')
})

afterAll(async () => {
  const payments = await db.payment.findMany({ where: { fineId: { startsWith: RUN } }, select: { id: true } })
  await db.auditLog.deleteMany({ where: { OR: [{ entityId: { startsWith: RUN } }, { entityId: { in: payments.map((p) => p.id) } }] } })
  await db.payment.deleteMany({ where: { fineId: { startsWith: RUN } } })
  await db.fine.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.violation.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.$disconnect()
})

describe('pago C2P contra la base', () => {
  it('aprueba: Payment APPROVED, multa y violación PAID, auditoría de ambos', async () => {
    const f = await pendingFine()
    const r = await payFine(request(f.token, `${f.violationId}-k1`), ACTOR, deps)
    expect(r.kind === 'ok' && r.data.status).toBe('APPROVED')

    const v = await db.violation.findUniqueOrThrow({ where: { id: f.violationId }, include: { fine: { include: { payments: true } } } })
    expect(v.status).toBe('PAID')
    expect(v.fine?.status).toBe('PAID')
    expect(v.fine?.paidAt).not.toBeNull()
    expect(v.fine?.payments.map((p) => p.status)).toEqual(['APPROVED'])
    const paymentId = v.fine?.payments[0]?.id ?? ''
    expect(await db.auditLog.count({ where: { entity: 'Payment', entityId: paymentId, action: 'PAYMENT_APPROVED' } })).toBe(1)
    expect(await db.auditLog.count({ where: { entity: 'Violation', entityId: f.violationId, action: 'VIOLATION_TRANSITION' } })).toBe(1)
  })

  it('misma llave dos veces = un solo Payment', async () => {
    const f = await pendingFine()
    const a = await payFine(request(f.token, `${f.violationId}-k1`), ACTOR, deps)
    const b = await payFine(request(f.token, `${f.violationId}-k1`), ACTOR, deps)
    expect(b).toEqual(a)
    expect(await db.payment.count({ where: { fineId: f.fineId } })).toBe(1)
  })

  it('dos llaves a la vez: una aprobada y otra ALREADY_PAID', async () => {
    const f = await pendingFine()
    const results = await Promise.all([
      payFine(request(f.token, `${f.violationId}-a`), ACTOR, deps),
      payFine(request(f.token, `${f.violationId}-b`), ACTOR, deps),
    ])
    expect(results.map((r) => (r.kind === 'ok' ? r.data.status : r.code)).sort()).toEqual(['ALREADY_PAID', 'APPROVED'])
    const statuses = (await db.payment.findMany({ where: { fineId: f.fineId } })).map((p) => p.status).sort()
    expect(statuses).toEqual(['APPROVED', 'REJECTED'])
  })

  it('rechazo: Payment REJECTED y la multa sigue pendiente', async () => {
    const f = await pendingFine()
    const r = await payFine(request(f.token, `${f.violationId}-k1`, '000000'), ACTOR, deps)
    expect(r.kind === 'ok' && r.data.status).toBe('REJECTED')
    expect((await db.fine.findUniqueOrThrow({ where: { id: f.fineId } })).status).toBe('PENDING')
  })
})
