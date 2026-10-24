import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import c2p from '../../api/payments/c2p.ts'
import { db } from '../../lib/db.ts'
import { call, clearTestAttempts } from './_http.ts'

// POST /api/payments/c2p a través del handler real contra la base (`pnpm test:db`). Respuestas HTTP de
// docs/04 §5. NOTIFY_DRY_RUN=true: la confirmación por WhatsApp se registra pero no se envía.
const RUN = `test_papi_${Date.now().toString(36)}`
let previousDryRun: string | undefined
let counter = 0

async function pendingFine() {
  const id = `${RUN}_${++counter}`
  await db.violation.create({
    data: {
      id, idempotencyKey: `test-${id}`, type: 'RED_LIGHT', status: 'NOTIFIED', cameraId: 'seed_cam_1', confidence: 0.9,
      occurredAt: new Date(), aiOutput: {}, ruleOutput: {},
      fine: { create: { id: `${id}_fine`, publicToken: `${id}-token-pad`, amountCents: 2_500_000, dueAt: new Date(Date.now() + 86_400_000) } },
    },
  })
  return { fineId: `${id}_fine`, token: `${id}-token-pad` }
}

const body = (fineToken: string, idempotencyKey: string, c2pKey = '123456') => ({
  fineToken, payerBankCode: '0134', payerPhone: '04120000001', payerCedula: 'V-99000001', c2pKey, idempotencyKey,
})

beforeAll(async () => {
  await clearTestAttempts(db)
  previousDryRun = process.env.NOTIFY_DRY_RUN
  process.env.NOTIFY_DRY_RUN = 'true'
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) throw new Error('Falta el seed: corre `pnpm db:seed`')
})

afterAll(async () => {
  process.env.NOTIFY_DRY_RUN = previousDryRun
  const fines = { startsWith: RUN }
  const payments = (await db.payment.findMany({ where: { fineId: fines }, select: { id: true } })).map((p) => p.id)
  const ntfs = (await db.notification.findMany({ where: { fineId: fines }, select: { id: true } })).map((x) => x.id)
  await db.auditLog.deleteMany({ where: { OR: [{ entityId: { startsWith: RUN } }, { entityId: { in: [...payments, ...ntfs] } }] } })
  await db.notification.deleteMany({ where: { fineId: fines } })
  await db.payment.deleteMany({ where: { fineId: fines } })
  await db.fine.deleteMany({ where: { id: fines } })
  await db.violation.deleteMany({ where: { id: { startsWith: RUN } } })
  await clearTestAttempts(db)
  await db.$disconnect()
})

describe('POST /api/payments/c2p', () => {
  it('aprobado → 200; misma llave → mismo resultado; otra llave → 409 ALREADY_PAID', async () => {
    const f = await pendingFine()
    const first = await call(c2p, { method: 'POST', body: body(f.token, `${RUN}-k1`), ip: '198.51.100.1' })
    expect(first.statusCode).toBe(200)
    expect(first.body).toMatchObject({ ok: true, data: { status: 'APPROVED', reference: expect.stringMatching(/^SIM-\d{8}$/), simulated: true } })

    const replay = await call(c2p, { method: 'POST', body: body(f.token, `${RUN}-k1`), ip: '198.51.100.1' })
    expect(replay.body).toEqual(first.body)

    const second = await call(c2p, { method: 'POST', body: body(f.token, `${RUN}-k2`), ip: '198.51.100.1' })
    expect(second.statusCode).toBe(409)
    expect(second.body).toMatchObject({ ok: false, error: { code: 'ALREADY_PAID' } })

    const confirmation = await db.notification.findFirst({ where: { fineId: f.fineId, template: 'PAYMENT_CONFIRMED' } })
    expect(confirmation).not.toBeNull()
  })

  it('rechazo del simulador → 200 con REJECTED', async () => {
    const f = await pendingFine()
    const res = await call(c2p, { method: 'POST', body: body(f.token, `${RUN}-k3`, '000000'), ip: '198.51.100.2' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, data: { status: 'REJECTED', failureCode: 'INVALID_KEY', simulated: true } })
  })

  it('datos inválidos → 400 sin repetir la clave; multa inexistente → 404; GET → rechazado', async () => {
    const bad = await call(c2p, { method: 'POST', body: { ...body('x', 'corta'), c2pKey: '12' }, ip: '198.51.100.3' })
    expect(bad.statusCode).toBe(400)
    expect(bad.body).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } })

    const secret = '87654321'
    const leaky = await call(c2p, { method: 'POST', body: { ...body('x', 'corta', secret), payerPhone: '123' }, ip: '198.51.100.3' })
    expect(JSON.stringify(leaky.body)).not.toContain(secret)

    const missing = await call(c2p, { method: 'POST', body: body('token-que-no-existe-123', `${RUN}-k4`), ip: '198.51.100.3' })
    expect(missing.statusCode).toBe(404)

    expect((await call(c2p, { method: 'GET', ip: '198.51.100.3' })).statusCode).toBe(400)
  })

  it('más de 10 intentos en 10 min desde la misma IP → 429', async () => {
    const codes: number[] = []
    for (let i = 0; i < 11; i++) codes.push((await call(c2p, { method: 'POST', body: {}, ip: '198.51.100.250' })).statusCode)
    expect(codes.slice(0, 10).every((c) => c === 400)).toBe(true)
    expect(codes[10]).toBe(429)
  })
})
