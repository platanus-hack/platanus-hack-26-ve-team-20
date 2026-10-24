import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fineHandler from '../../api/fines/[token].ts'
import violationsHandler from '../../api/_p1/violations-list.ts'
import { hashPassword } from '../../lib/auth/password.ts'
import { COOKIE_NAMES, passwordFingerprint, signSession } from '../../lib/auth/session.ts'
import type { ViolationListDTO, FinePublicDTO } from '../../lib/contracts/index.ts'
import { db } from '../../lib/db.ts'
import { transition } from '../../lib/domain/state-machine.ts'

const RUN = Date.now().toString(36)
const SESSION_SECRET = `test-secret-${RUN}-`.padEnd(48, 'x')
const PLATE = `TW${String(Date.now() % 100_000).padStart(5, '0')}`
const PERSON = { cedula: `V9${String(Date.now()).slice(-7)}`, fullName: `Persona Test ${RUN}`, phone: '584129999999', email: `t${RUN}@example.com` }

const ids = {
  person: `test_${RUN}_per`, admin: `test_${RUN}_adm`, vehicle: `test_${RUN}_veh`,
  vioFined: `test_${RUN}_vio_a`, vioReview: `test_${RUN}_vio_b`, vioNoViolation: `test_${RUN}_vio_c`, vioPaid: `test_${RUN}_vio_e`,
}
const tokens = { fined: `test-token-${RUN}-aaaaaaaa`, paid: `test-token-${RUN}-eeeeeeee` }

type Res = { code: number; body: any; headers: Record<string, string> }
async function call(h: (req: VercelRequest, res: VercelResponse) => unknown, req: Record<string, unknown>): Promise<Res> {
  const out: Res = { code: 0, body: undefined, headers: {} }
  const res = {
    status(c: number) { out.code = c; return res },
    json(b: unknown) { out.body = b; return res },
    setHeader(k: string, v: string) { out.headers[k] = v; return res },
  }
  await h({ method: 'GET', headers: {}, query: {}, ...req } as unknown as VercelRequest, res as unknown as VercelResponse)
  return out
}
let admin: Record<string, string> = {}
const list = (query: Record<string, string> = {}) => call(violationsHandler, { headers: admin, query })
const idsOf = (r: Res) => (r.body.data as ViolationListDTO).items.map((i) => i.id)

function violation(id: string, status: 'NOTIFIED' | 'NEEDS_REVIEW' | 'VOID' | 'PAID', extra: Record<string, unknown> = {}) {
  return db.violation.create({
    data: {
      id, idempotencyKey: `test-read-${RUN}-${id}`, type: 'RED_LIGHT', status, cameraId: 'seed_cam_1', vehicleId: ids.vehicle,
      plateRead: PLATE, plateConfidence: 0.9, confidence: 0.9, occurredAt: new Date(), aiOutput: {}, ruleOutput: {},
      evidence: { create: { id: `${id}_ev`, kind: 'FRAME', url: 'https://example.com/t/f0.jpg', capturedAt: new Date(), meta: { lightState: 'RED' } } },
      ...extra,
    },
  })
}

beforeAll(async () => {
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) {
    throw new Error('Falta el seed: corre `pnpm db:seed` antes de `pnpm test:db`')
  }
  vi.stubEnv('SESSION_SECRET', SESSION_SECRET)
  const passwordHash = await hashPassword('contraseña-de-prueba')
  await db.adminUser.create({ data: { id: ids.admin, email: `admin-${RUN}@example.com`, name: 'Admin Test', passwordHash } })
  const token = signSession({ role: 'admin', sub: ids.admin, ph: passwordFingerprint(passwordHash) })
  admin = { cookie: `${COOKIE_NAMES.admin}=${token}` }
  await db.person.create({ data: { id: ids.person, ...PERSON } })
  await db.vehicle.create({ data: { id: ids.vehicle, plate: PLATE, make: 'Toyota', model: 'Corolla', color: 'gris', ownerId: ids.person } })

  const due = (days: number) => new Date(Date.now() + days * 86_400_000)
  await violation(ids.vioFined, 'NOTIFIED', {
    ruleOutput: { crossing: { crossedStopLine: true, lightState: 'RED' } }, measuredSpeedKmh: 42.1, laneId: 'C1', roadRelation: 'WITH_FLOW',
    fine: { create: { id: `${ids.vioFined}_fine`, publicToken: tokens.fined, amountCents: 2_500_000, dueAt: due(-2) } }, // vencida
  })
  await violation(ids.vioReview, 'NEEDS_REVIEW', { reviewReason: 'LOW_CONFIDENCE' })
  await violation(ids.vioNoViolation, 'VOID', { voidReason: 'NO_VIOLATION' })
  await violation(ids.vioPaid, 'PAID', {
    fine: { create: { id: `${ids.vioPaid}_fine`, publicToken: tokens.paid, amountCents: 100, dueAt: due(10), status: 'PAID', paidAt: new Date() } },
  })
  await db.payment.createMany({
    data: [
      { id: `test_${RUN}_pay_ok`, fineId: `${ids.vioPaid}_fine`, status: 'APPROVED', reference: 'SIM-TEST-OK', payerBankCode: '0102', payerPhone: '04120000001', payerCedula: 'V99000001', amountCents: 100, idempotencyKey: `test-pay-${RUN}-1` },
      { id: `test_${RUN}_pay_no`, fineId: `${ids.vioPaid}_fine`, status: 'REJECTED', reference: 'SIM-TEST-NO', payerBankCode: '0102', payerPhone: '04120000001', payerCedula: 'V99000001', amountCents: 100, idempotencyKey: `test-pay-${RUN}-2` },
    ],
  })
})

afterAll(async () => {
  vi.unstubAllEnvs()
  const vio = Object.values(ids).filter((i) => i.includes('_vio_'))
  await db.auditLog.deleteMany({ where: { entityId: { in: vio } } })
  await db.payment.deleteMany({ where: { id: { startsWith: `test_${RUN}` } } })
  await db.evidence.deleteMany({ where: { violationId: { in: vio } } })
  await db.fine.deleteMany({ where: { violationId: { in: vio } } })
  await db.violation.deleteMany({ where: { id: { in: vio } } })
  await db.vehicle.deleteMany({ where: { id: ids.vehicle } })
  await db.person.deleteMany({ where: { id: ids.person } })
  await db.adminUser.deleteMany({ where: { id: ids.admin } })
  await db.$disconnect()
})

describe('GET /api/violations', () => {
  it('exige una sesión de admin (401) y responde 200 con ella', async () => {
    const forged = `${COOKIE_NAMES.admin}=${signSession({ role: 'officer', sub: ids.admin })}` // sesión de otro rol
    for (const headers of [{}, { cookie: `${COOKIE_NAMES.admin}=basura` }, { cookie: forged }, { authorization: 'Bearer cualquiera' }]) {
      const r = await call(violationsHandler, { headers })
      expect(r.code).toBe(401)
      expect(r.body).toEqual({ ok: false, error: { code: 'UNAUTHORIZED', message: 'No autorizado' } })
    }
    const ok = await list({ status: 'NEEDS_REVIEW' })
    expect(ok.code).toBe(200)
    expect(ok.body.ok).toBe(true)
    expect(ok.headers['Cache-Control']).toBe('no-store')
  })

  it('devuelve el seed completo por defecto con la forma del contrato', async () => {
    const r = await list({ limit: '200' })
    const items = (r.body.data as ViolationListDTO).items
    expect(items.length).toBeGreaterThanOrEqual(12)
    const seeded = items.find((i) => i.id === 'seed_vio_01')!
    expect(seeded).toMatchObject({ type: 'RED_LIGHT', camera: { code: 'CAM-001' }, plateRead: 'XY987ZT', lightState: null })
    expect(seeded.fine?.token).toHaveLength(24)
    expect(seeded.evidence.length).toBeGreaterThan(0)
    expect(Date.parse(items[0]!.updatedAt)).toBeGreaterThanOrEqual(Date.parse(items.at(-1)!.updatedAt)) // más recientes primero
  })

  it('filtra por estado (uno o varios) y expone verdict, fine OVERDUE, luz y movimiento', async () => {
    const review = await list({ status: 'NEEDS_REVIEW', limit: '200' })
    expect((review.body.data as ViolationListDTO).items.every((i) => i.status === 'NEEDS_REVIEW')).toBe(true)
    expect(idsOf(review)).toContain(ids.vioReview)
    expect(idsOf(review)).not.toContain(ids.vioFined)

    const both = await list({ status: 'NEEDS_REVIEW,VOID', limit: '200' })
    expect(idsOf(both)).toEqual(expect.arrayContaining([ids.vioReview, ids.vioNoViolation]))

    const items = (await list({ status: 'NOTIFIED,VOID', limit: '200' })).body.data.items as ViolationListDTO['items']
    expect(items.find((i) => i.id === ids.vioFined)).toMatchObject({
      verdict: 'VIOLATION', lightState: 'RED', motion: { speedKmh: 42.1, laneId: 'C1', relation: 'WITH_FLOW' },
      fine: { token: tokens.fined, status: 'OVERDUE', amountCents: 2_500_000 },
    })
    expect(items.find((i) => i.id === ids.vioNoViolation)).toMatchObject({ verdict: 'NO_VIOLATION', voidReason: 'NO_VIOLATION', fine: null })
  })

  it('valida la consulta: estado, since y limit inválidos → 400 VALIDATION_ERROR', async () => {
    const invalid: Array<Record<string, string>> = [{ status: 'NOPE' }, { since: 'ayer' }, { limit: '0' }, { limit: 'abc' }, { limit: '9999' }]
    for (const query of invalid) {
      const r = await list(query)
      expect(r.code, JSON.stringify(query)).toBe(400)
      expect(r.body.error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('limit acota la cantidad y nextSince es la modificación más reciente', async () => {
    const r = await list({ limit: '2' })
    const data = r.body.data as ViolationListDTO
    expect(data.items).toHaveLength(2)
    expect(data.nextSince).toBe(data.items[0]!.updatedAt)
  })

  it('feed en vivo: `since` trae solo lo modificado después, y un cambio de estado vuelve a aparecer', async () => {
    const row = await db.violation.findUniqueOrThrow({ where: { id: ids.vioReview } })
    const justBefore = new Date(row.updatedAt.getTime() - 1).toISOString()

    expect(idsOf(await list({ since: justBefore, limit: '200' }))).toContain(ids.vioReview)
    expect(idsOf(await list({ since: row.updatedAt.toISOString(), limit: '200' }))).not.toContain(ids.vioReview) // gt estricto

    await transition(db, ids.vioReview, 'REVIEWED', { type: 'OPERATOR', id: 'test' })
    const after = await list({ since: row.updatedAt.toISOString(), status: 'REVIEWED', limit: '200' })
    expect((after.body.data as ViolationListDTO).items.find((i) => i.id === ids.vioReview)).toMatchObject({ status: 'REVIEWED' })

    const empty = await list({ since: new Date(Date.now() + 60_000).toISOString() })
    expect(empty.body.data).toEqual({ items: [], nextSince: null })
  })

  it('solo acepta GET', async () => {
    const r = await call(violationsHandler, { method: 'POST', headers: admin })
    expect(r.code).toBe(400)
  })
})

describe('GET /api/fines/[token]', () => {
  const get = (token: unknown) => call(fineHandler, { query: { token } })

  it('devuelve la multa pública sin datos personales y sin caché', async () => {
    const r = await get(tokens.fined)
    expect(r.code).toBe(200)
    expect(r.headers['Cache-Control']).toBe('no-store')
    const fine = r.body.data as FinePublicDTO
    expect(fine).toMatchObject({
      token: tokens.fined, status: 'PENDING', overdue: true, type: 'RED_LIGHT', cameraCode: 'CAM-001',
      plateMasked: `${PLATE.slice(0, 2)}***${PLATE.slice(-2)}`, vehicle: 'Toyota Corolla gris',
      amountCents: 2_500_000, currency: 'VES', verification: 'AUTO', paidAt: null, paymentReference: null,
    })
    expect(fine.evidence).toEqual([expect.objectContaining({ kind: 'FRAME', lightState: 'RED' })])

    const json = JSON.stringify(r.body)
    for (const secret of [PERSON.cedula, PERSON.fullName, PERSON.phone, PERSON.email, PLATE]) {
      expect(json, `no debe filtrar ${secret}`).not.toContain(secret)
    }
  })

  it('una multa pagada muestra la referencia del pago APROBADO (no la del rechazado)', async () => {
    const fine = (await get(tokens.paid)).body.data as FinePublicDTO
    expect(fine).toMatchObject({ status: 'PAID', overdue: false, paymentReference: 'SIM-TEST-OK' })
    expect(fine.paidAt).not.toBeNull()
  })

  it('funciona con una multa del seed', async () => {
    const seeded = await db.fine.findUniqueOrThrow({ where: { id: 'seed_fine_01' } })
    const r = await get(seeded.publicToken)
    expect(r.code).toBe(200)
    expect(r.body.data).toMatchObject({ cameraCode: 'CAM-001', plateMasked: 'XY***ZT', vehicle: 'Ford F-150 blanca' })
  })

  it('token inexistente o mal formado → 404 NOT_FOUND con la misma respuesta (no revela cuál)', async () => {
    const unknown = await get('abcdefghijklmnopqrstuvwx')
    const malformed = await get('x')
    const weird = await get('../../etc/passwd')
    for (const r of [unknown, malformed, weird]) {
      expect(r.code).toBe(404)
      expect(r.body).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'Multa no encontrada: ' } })
    }
    expect((await get(undefined)).code).toBe(404)
  })

  it('acepta el token como arreglo (query repetida) y solo responde a GET', async () => {
    expect((await get([tokens.fined, 'otro'])).code).toBe(200)
    expect((await call(fineHandler, { method: 'DELETE', query: { token: tokens.fined } })).code).toBe(400)
  })
})
