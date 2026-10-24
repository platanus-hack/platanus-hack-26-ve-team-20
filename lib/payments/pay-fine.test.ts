import { describe, expect, it, vi } from 'vitest'
import { C2PRequestSchema, type ChargeC2P, type FineStatus } from '../contracts/index.ts'
import { createC2PSimulator } from './c2p.ts'
import { payFine, type NewPayment, type PaymentStore, type StoredPayment } from './pay-fine.ts'
import { createRateLimiter } from './rate-limit.ts'

const ACTOR = { type: 'CITIZEN' as const, ip: '203.0.113.7' }

/** Store en memoria con las mismas reglas que prisma-store.ts. */
function memoryStore(fines: Array<{ token: string; status: FineStatus }>) {
  const fineRows = fines.map((f, i) => ({ id: `fine_${i + 1}`, violationId: `vio_${i + 1}`, token: f.token, status: f.status, amountCents: 2_500_000, paidAt: null as Date | null }))
  const payments: Array<NewPayment & { id: string; status: StoredPayment['status']; reference: string | null; failureCode: string | null }> = []
  const store: PaymentStore = {
    async findPaymentByKey(key) {
      const p = payments.find((x) => x.idempotencyKey === key)
      if (!p) return null
      const fine = fineRows.find((f) => f.id === p.fineId)
      return { id: p.id, fineId: p.fineId, status: p.status, reference: p.reference, failureCode: p.failureCode, finePaidAt: fine?.paidAt ?? null }
    },
    async findFineByToken(token) {
      const f = fineRows.find((x) => x.token === token)
      return f ? { id: f.id, violationId: f.violationId, status: f.status, amountCents: f.amountCents } : null
    },
    async createPendingPayment(payment) {
      if (payments.some((p) => p.idempotencyKey === payment.idempotencyKey)) return 'DUPLICATE_KEY'
      const row = { ...payment, id: `pay_${payments.length + 1}`, status: 'PENDING' as const, reference: null, failureCode: null }
      payments.push(row)
      return { id: row.id }
    },
    async markRejected(id, failureCode) {
      Object.assign(payments.find((p) => p.id === id) ?? {}, { status: 'REJECTED', failureCode })
    },
    async markApproved(id, fine, reference) {
      const row = fineRows.find((f) => f.id === fine.id)
      const payment = payments.find((p) => p.id === id)
      if (!row || !payment) throw new Error('no existe')
      if (row.status !== 'PENDING') {
        Object.assign(payment, { status: 'REJECTED', failureCode: row.status === 'PAID' ? 'ALREADY_PAID' : 'NOT_PAYABLE' })
        return row.status === 'PAID' ? 'ALREADY_PAID' : 'NOT_PAYABLE'
      }
      row.status = 'PAID'
      row.paidAt = new Date('2026-10-24T14:10:00Z')
      Object.assign(payment, { status: 'APPROVED', reference })
      return { paidAt: row.paidAt }
    },
  }
  return { store, payments, fineRows }
}

const request = (overrides: Partial<Record<string, string>> = {}) =>
  C2PRequestSchema.parse({
    fineToken: 'token-de-multa-pendiente',
    payerBankCode: '0134',
    payerPhone: '04120000001',
    payerCedula: 'V-99000001',
    c2pKey: '123456',
    idempotencyKey: 'intento-0001',
    ...overrides,
  })

function setup(status: FineStatus = 'PENDING') {
  const mem = memoryStore([
    { token: 'token-de-multa-pendiente', status },
    { token: 'token-de-otra-multa', status: 'PENDING' },
  ])
  const charge = vi.fn(createC2PSimulator({ sleep: async () => {}, randomIntInclusive: (min) => (min === 0 ? 48_213_977 : min) }))
  const notifyPaymentConfirmed = vi.fn(async () => ({ channel: 'WHATSAPP' as const, status: 'DRY_RUN' as const }))
  return { ...mem, charge, notifyPaymentConfirmed, deps: { store: mem.store, charge: charge as ChargeC2P, notifyPaymentConfirmed } }
}

describe('payFine (docs/04 §5)', () => {
  it('aprueba, deja la multa PAID y confirma por WhatsApp', async () => {
    const s = setup()
    const r = await payFine(request(), ACTOR, s.deps)
    expect(r).toEqual({ kind: 'ok', data: { status: 'APPROVED', reference: 'SIM-48213977', paidAt: '2026-10-24T14:10:00.000Z', simulated: true } })
    expect(s.fineRows[0]?.status).toBe('PAID')
    expect(s.payments).toHaveLength(1)
    expect(s.payments[0]).toMatchObject({ status: 'APPROVED', amountCents: 2_500_000, payerCedula: 'V99000001' })
    expect(s.notifyPaymentConfirmed).toHaveBeenCalledExactlyOnceWith('fine_1')
  })

  it('un rechazo no paga ni notifica, y se puede reintentar con otra llave', async () => {
    const s = setup()
    const rejected = await payFine(request({ c2pKey: '000000' }), ACTOR, s.deps)
    expect(rejected).toEqual({ kind: 'ok', data: { status: 'REJECTED', failureCode: 'INVALID_KEY', simulated: true } })
    expect(s.fineRows[0]?.status).toBe('PENDING')
    expect(s.notifyPaymentConfirmed).not.toHaveBeenCalled()

    const retry = await payFine(request({ idempotencyKey: 'intento-0002' }), ACTOR, s.deps)
    expect(retry.kind === 'ok' && retry.data.status).toBe('APPROVED')
    expect(s.payments.map((p) => p.status)).toEqual(['REJECTED', 'APPROVED'])
  })

  it('la misma llave devuelve el mismo resultado sin cobrar otra vez (doble clic)', async () => {
    const s = setup()
    const first = await payFine(request(), ACTOR, s.deps)
    const second = await payFine(request(), ACTOR, s.deps)
    expect(second).toEqual(first)
    expect(s.charge).toHaveBeenCalledTimes(1)
    expect(s.payments).toHaveLength(1)

    const rejectedKey = request({ c2pKey: '111111', idempotencyKey: 'intento-rechazado', fineToken: 'token-de-otra-multa' })
    const r1 = await payFine(rejectedKey, ACTOR, s.deps)
    const r2 = await payFine(rejectedKey, ACTOR, s.deps)
    expect(r2).toEqual(r1)
  })

  it('multa ya pagada = ALREADY_PAID sin cobrar', async () => {
    const s = setup('PAID')
    expect(await payFine(request(), ACTOR, s.deps)).toEqual({ kind: 'error', code: 'ALREADY_PAID', message: 'Esta multa ya fue pagada' })
    expect(s.charge).not.toHaveBeenCalled()
  })

  it('dos pagos simultáneos con llaves distintas: solo uno se aprueba', async () => {
    const s = setup()
    const [a, b] = await Promise.all([
      payFine(request({ idempotencyKey: 'intento-a' }), ACTOR, s.deps),
      payFine(request({ idempotencyKey: 'intento-b' }), ACTOR, s.deps),
    ])
    const outcomes = [a, b].map((r) => (r.kind === 'ok' ? r.data.status : r.code)).sort()
    expect(outcomes).toEqual(['ALREADY_PAID', 'APPROVED'])
    expect(s.payments.map((p) => p.status).sort()).toEqual(['APPROVED', 'REJECTED'])
    expect(s.notifyPaymentConfirmed).toHaveBeenCalledTimes(1)
  })

  it('valida banco, token, estado de la multa y llaves ajenas', async () => {
    const s = setup()
    expect(await payFine(request({ payerBankCode: '9999' }), ACTOR, s.deps)).toMatchObject({ kind: 'error', code: 'VALIDATION_ERROR' })
    expect(await payFine(request({ fineToken: 'token-que-no-existe' }), ACTOR, s.deps)).toMatchObject({ kind: 'error', code: 'NOT_FOUND' })

    await payFine(request(), ACTOR, s.deps)
    const reused = await payFine(request({ fineToken: 'token-de-otra-multa' }), ACTOR, s.deps)
    expect(reused).toMatchObject({ kind: 'error', code: 'CONFLICT' })

    const voided = setup('VOID')
    expect(await payFine(request(), ACTOR, voided.deps)).toMatchObject({ kind: 'error', code: 'CONFLICT' })
    expect(voided.charge).not.toHaveBeenCalled()
  })

  it('nunca guarda ni devuelve la clave C2P', async () => {
    const s = setup()
    const key = '87654321'
    const r = await payFine(request({ c2pKey: key }), ACTOR, s.deps)
    expect(JSON.stringify(r)).not.toContain(key)
    expect(JSON.stringify(s.payments)).not.toContain(key)
  })
})

describe('createRateLimiter', () => {
  it('permite hasta el límite dentro de la ventana y libera después', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 })
    expect([limiter.hit('ip', 0), limiter.hit('ip', 10), limiter.hit('ip', 20)]).toEqual([true, true, false])
    expect(limiter.hit('otra-ip', 20)).toBe(true)
    expect(limiter.hit('ip', 1001)).toBe(true)
  })
})
