import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import detailHandler from '../../api/_p1/violation-detail.ts'
import reviewHandler from '../../api/_p1/violation-review.ts'
import { hashPassword } from '../../lib/auth/password.ts'
import { COOKIE_NAMES, passwordFingerprint, signSession } from '../../lib/auth/session.ts'
import type { NotificationResult, NotifyFineIssued, ViolationStatus } from '../../lib/contracts/index.ts'
import { db } from '../../lib/db.ts'
import { DomainError, InvalidTransitionError, NotFoundError } from '../../lib/domain/errors.ts'
import { getPublicFine } from '../../lib/domain/queries.ts'
import { createReviewViolation } from '../../lib/domain/review.ts'

const RUN = Date.now().toString(36)
const SUFFIX = String(Date.now() % 10_000).padStart(4, '0')
const PLATE_A = `TR01${SUFFIX}`
const PLATE_B = `TR02${SUFFIX}`
const id = (s: string) => `test_${RUN}_${s}`
const OPERATOR = { type: 'OPERATOR' as const, id: 'test-operator', ip: '192.0.2.77' }
const violationIds: string[] = []
let counter = 0

const sent: NotificationResult = { channel: 'WHATSAPP', status: 'DRY_RUN' }
const notifier = (result: NotificationResult = sent) => vi.fn<NotifyFineIssued>(async () => result)
const reviewer = (notify: NotifyFineIssued = notifier()) => createReviewViolation({ db, notifyFineIssued: notify })

/** Crea una violación `test_*`; por defecto en la cola de revisión. */
async function make(o: { status?: ViolationStatus; reason?: 'LOW_CONFIDENCE' | 'PLATE_NOT_FOUND' | 'NO_PLATE'; plateRead?: string | null; vehicleId?: string | null; fine?: boolean } = {}) {
  const vid = id(`vio${++counter}`)
  const status = o.status ?? 'NEEDS_REVIEW'
  await db.violation.create({
    data: {
      id: vid, idempotencyKey: `test-review-${RUN}-${counter}`, type: 'RED_LIGHT', status, cameraId: 'seed_cam_1',
      vehicleId: o.vehicleId === undefined ? null : o.vehicleId, plateRead: o.plateRead === undefined ? PLATE_A : o.plateRead,
      plateConfidence: 0.6, confidence: 0.6, occurredAt: new Date(), modelVersion: 'test-0.1',
      aiOutput: { model: 'test', plates: [{ text: 'AB12?CD' }] }, ruleOutput: { verdict: 'VIOLATION', crossing: { lightState: 'RED' } },
      ...(status === 'NEEDS_REVIEW' && { reviewReason: o.reason ?? 'LOW_CONFIDENCE' }),
      evidence: { create: { id: `${vid}_ev`, kind: 'FRAME', url: 'https://example.com/t/f0.jpg', capturedAt: new Date(), meta: { lightState: 'RED' } } },
      ...(o.fine && { fine: { create: { id: `${vid}_fine`, publicToken: `test-token-${vid}-pad`, amountCents: 100, dueAt: new Date(Date.now() + 86_400_000) } } }),
    },
  })
  violationIds.push(vid)
  return vid
}

const row = (vid: string) => db.violation.findUniqueOrThrow({ where: { id: vid }, include: { fine: true } })
const transitions = async (vid: string) =>
  (await db.auditLog.findMany({ where: { entityId: vid, action: 'VIOLATION_TRANSITION' } })).sort((a, b) => String((a.after as any).status).localeCompare(String((b.after as any).status)))

// --- helpers de handlers
type Res = { code: number; body: any }
async function call(h: (req: VercelRequest, res: VercelResponse) => unknown, req: Record<string, unknown>): Promise<Res> {
  const out: Res = { code: 0, body: undefined }
  const res = { status(c: number) { out.code = c; return res }, json(b: unknown) { out.body = b; return res }, setHeader() { return res } }
  await h({ method: 'POST', headers: {}, query: {}, ...req } as unknown as VercelRequest, res as unknown as VercelResponse)
  return out
}
let admin: Record<string, string> = {}
const review = (vid: string, body: unknown, headers: Record<string, string> = admin) => call(reviewHandler, { query: { id: vid }, body, headers })

beforeAll(async () => {
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) throw new Error('Falta el seed: corre `pnpm db:seed` antes de `pnpm test:db`')
  vi.stubEnv('SESSION_SECRET', `test-secret-${RUN}-`.padEnd(48, 'r'))
  await db.person.create({ data: { id: id('per'), cedula: `V9${String(Date.now()).slice(-7)}`, fullName: 'Persona Test', phone: '584120000000' } })
  await db.vehicle.create({ data: { id: id('vehA'), plate: PLATE_A, make: 'Toyota', model: 'Corolla', color: 'gris', ownerId: id('per') } })
  await db.vehicle.create({ data: { id: id('vehB'), plate: PLATE_B, make: 'Ford', model: 'Ka', color: 'rojo', ownerId: id('per') } })
  const passwordHash = await hashPassword('contraseña-de-prueba')
  await db.adminUser.create({ data: { id: id('adm'), email: `rev-${RUN}@example.com`, name: 'Admin Test', passwordHash } })
  admin = { cookie: `${COOKIE_NAMES.admin}=${signSession({ role: 'admin', sub: id('adm'), ph: passwordFingerprint(passwordHash) })}` }
})

afterAll(async () => {
  vi.unstubAllEnvs()
  const fines = violationIds.map((v) => `${v}_fine`)
  const created = await db.fine.findMany({ where: { violationId: { in: violationIds } }, select: { id: true } })
  await db.auditLog.deleteMany({ where: { entityId: { in: [...violationIds, ...fines, ...created.map((f) => f.id)] } } })
  await db.evidence.deleteMany({ where: { violationId: { in: violationIds } } })
  await db.fine.deleteMany({ where: { violationId: { in: violationIds } } })
  await db.violation.deleteMany({ where: { id: { in: violationIds } } })
  await db.vehicle.deleteMany({ where: { id: { startsWith: `test_${RUN}` } } })
  await db.adminUser.deleteMany({ where: { id: id('adm') } })
  await db.person.deleteMany({ where: { id: id('per') } })
  await db.$disconnect()
})

describe('aprobar (APPROVE)', () => {
  it('con vehículo conocido: crea la multa, avisa una vez y termina en NOTIFIED', async () => {
    const vid = await make({ vehicleId: id('vehA') })
    const notify = notifier()
    const out = await reviewer(notify)(vid, { action: 'APPROVE', note: 'placa legible en el frame 2' }, OPERATOR)

    expect(out).toMatchObject({ status: 'NOTIFIED' })
    expect(out.fineId).toBeDefined()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(out.fineId)
    const v = await row(vid)
    expect(v).toMatchObject({ status: 'NOTIFIED', fine: { status: 'PENDING', id: out.fineId } })
    expect(v.fine!.dueAt.getTime()).toBeGreaterThan(Date.now())
    // La multa queda marcada como verificada por una persona.
    expect((await getPublicFine(db, v.fine!.publicToken)).verification).toBe('HUMAN')
  })

  it('audita cada paso: el operador decide (REVIEWED, FINED) y el sistema avisa (NOTIFIED)', async () => {
    const vid = await make({ vehicleId: id('vehA') })
    await reviewer()(vid, { action: 'APPROVE', note: 'revisado a mano' }, OPERATOR)
    const logs = await transitions(vid)
    const byStatus = Object.fromEntries(logs.map((l) => [(l.after as any).status, l]))
    expect(Object.keys(byStatus).sort()).toEqual(['FINED', 'NOTIFIED', 'REVIEWED'])
    for (const s of ['REVIEWED', 'FINED']) {
      expect(byStatus[s]).toMatchObject({ actorType: 'OPERATOR', actorId: 'test-operator', ip: '192.0.2.77' })
    }
    expect(byStatus['NOTIFIED']).toMatchObject({ actorType: 'SYSTEM' })
    expect(byStatus['REVIEWED']!.after).toMatchObject({ note: 'revisado a mano' })
    expect(byStatus['REVIEWED']!.before).toMatchObject({ status: 'NEEDS_REVIEW' })
  })

  it('corrige la placa: enlaza el vehículo correcto y registra la placa anterior en la auditoría', async () => {
    const vid = await make({ reason: 'PLATE_NOT_FOUND', plateRead: 'ZZ999ZZ', vehicleId: null })
    const out = await reviewer()(vid, { action: 'APPROVE', plate: `${PLATE_B.slice(0, 4)}-${PLATE_B.slice(4)}`.toLowerCase() }, OPERATOR)
    expect(out.status).toBe('NOTIFIED')
    expect(await row(vid)).toMatchObject({ plateRead: PLATE_B, vehicleId: id('vehB') })
    const reviewed = (await transitions(vid)).find((l) => (l.after as any).status === 'REVIEWED')!
    expect(reviewed.before).toMatchObject({ plateRead: 'ZZ999ZZ' })
    expect(reviewed.after).toMatchObject({ plateRead: PLATE_B })
  })

  it('sin placa indicada intenta con la placa leída; si corresponde a un vehículo registrado, aprueba', async () => {
    const vid = await make({ plateRead: PLATE_A, vehicleId: null, reason: 'LOW_CONFIDENCE' })
    expect((await reviewer()(vid, { action: 'APPROVE' }, OPERATOR)).status).toBe('NOTIFIED')
    expect((await row(vid)).vehicleId).toBe(id('vehA'))
  })

  it('sin vehículo conocido ni placa válida → VALIDATION_ERROR y no cambia nada', async () => {
    const notify = notifier()
    const noPlate = await make({ reason: 'NO_PLATE', plateRead: null, vehicleId: null })
    const unknownRead = await make({ reason: 'PLATE_NOT_FOUND', plateRead: 'ZZ999ZZ', vehicleId: null })
    const unregistered = await make({ plateRead: 'ZZ999ZZ', vehicleId: null })
    const badFormat = await make({ plateRead: null, vehicleId: null })

    const cases: Array<[string, Record<string, unknown>]> = [
      [noPlate, { action: 'APPROVE' }],
      [unknownRead, { action: 'APPROVE' }],
      [unregistered, { action: 'APPROVE', plate: `ZY${SUFFIX}Q` }], // formato válido pero no registrada
      [badFormat, { action: 'APPROVE', plate: 'A1' }], // formato inválido
    ]
    for (const [vid, input] of cases) {
      const err = await reviewer(notify)(vid, input as never, OPERATOR).catch((e: unknown) => e)
      expect(err, vid).toBeInstanceOf(DomainError)
      expect((err as DomainError).code).toBe('VALIDATION_ERROR')
      expect(await row(vid)).toMatchObject({ status: 'NEEDS_REVIEW', fine: null })
      expect(await transitions(vid)).toHaveLength(0)
    }
    expect(notify).not.toHaveBeenCalled()
  })

  it('solo se aprueba desde NEEDS_REVIEW: cualquier otro estado es INVALID_TRANSITION y no cambia', async () => {
    for (const status of ['REVIEWED', 'FINED', 'NOTIFIED', 'PAID', 'VOID', 'DETECTED'] as const) {
      const vid = await make({ status, vehicleId: id('vehA') })
      const err = await reviewer()(vid, { action: 'APPROVE' }, OPERATOR).catch((e: unknown) => e)
      expect(err, status).toBeInstanceOf(InvalidTransitionError)
      expect((err as InvalidTransitionError).code).toBe('INVALID_TRANSITION')
      expect((await row(vid)).status).toBe(status)
    }
  })

  it('tres operadores aprobando a la vez: una sola multa y un solo aviso', async () => {
    const vid = await make({ vehicleId: id('vehA') })
    const notify = notifier()
    const results = await Promise.allSettled([1, 2, 3].map(() => reviewer(notify)(vid, { action: 'APPROVE' }, OPERATOR)).flat())
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(failed).toHaveLength(2)
    expect(failed.every((f) => f.reason instanceof InvalidTransitionError)).toBe(true)
    expect(await db.fine.count({ where: { violationId: vid } })).toBe(1)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('si el aviso falla, la multa queda emitida y la violación en FINED (se audita NOTIFY_FAILED)', async () => {
    const vid = await make({ vehicleId: id('vehA') })
    const out = await reviewer(notifier({ channel: 'WHATSAPP', status: 'FAILED' }))(vid, { action: 'APPROVE' }, OPERATOR)
    expect(out.status).toBe('FINED')
    expect(out.fineId).toBeDefined()
    expect(await row(vid)).toMatchObject({ status: 'FINED', fine: { id: out.fineId } })
    expect(await db.auditLog.count({ where: { entityId: out.fineId, action: 'NOTIFY_FAILED' } })).toBe(1)
  })
})

describe('anular (VOID)', () => {
  it('anula con motivo, sin crear multa, y audita al operador', async () => {
    const vid = await make()
    const out = await reviewer()(vid, { action: 'VOID', reason: 'Vehículo de emergencia (prueba)' }, OPERATOR)
    expect(out).toEqual({ status: 'VOID' })
    expect(await row(vid)).toMatchObject({ status: 'VOID', voidReason: 'Vehículo de emergencia (prueba)', fine: null })
    expect((await transitions(vid))[0]).toMatchObject({ actorType: 'OPERATOR', actorId: 'test-operator', after: { status: 'VOID', voidReason: 'Vehículo de emergencia (prueba)' } })
  })

  it('también anula una multa ya emitida (la multa pasa a VOID)', async () => {
    const vid = await make({ status: 'NOTIFIED', vehicleId: id('vehA'), fine: true })
    await reviewer()(vid, { action: 'VOID', reason: 'Error de lectura (prueba)' }, OPERATOR)
    expect(await row(vid)).toMatchObject({ status: 'VOID', fine: { status: 'VOID' } })
  })

  it('una violación pagada o ya anulada no se puede anular; una inexistente es 404', async () => {
    for (const status of ['PAID', 'VOID'] as const) {
      const vid = await make({ status, vehicleId: id('vehA') })
      await expect(reviewer()(vid, { action: 'VOID', reason: 'x' }, OPERATOR)).rejects.toBeInstanceOf(InvalidTransitionError)
      expect((await row(vid)).status).toBe(status)
    }
    await expect(reviewer()(id('no-existe'), { action: 'VOID', reason: 'x' }, OPERATOR)).rejects.toBeInstanceOf(NotFoundError)
    await expect(reviewer()(id('no-existe'), { action: 'APPROVE' }, OPERATOR)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('POST /api/violations/[id]/review (HTTP)', () => {
  it('exige sesión de admin (401) y valida el cuerpo (400)', async () => {
    const vid = await make({ vehicleId: id('vehA') })
    expect((await review(vid, { action: 'VOID', reason: 'x' }, {})).code).toBe(401)
    expect((await review(vid, { action: 'VOID', reason: 'x' }, { cookie: `${COOKIE_NAMES.admin}=basura` })).code).toBe(401)
    for (const body of [{}, { action: 'VOID' }, { action: 'VOID', reason: '' }, { action: 'APPROVE', plate: 123 }, { action: 'OTRA' }, null]) {
      const r = await review(vid, body)
      expect(r.code, JSON.stringify(body)).toBe(400)
      expect(r.body.error.code).toBe('VALIDATION_ERROR')
    }
    expect((await row(vid)).status).toBe('NEEDS_REVIEW')
    expect((await call(reviewHandler, { method: 'GET', query: { id: vid }, headers: admin })).code).toBe(400)
  })

  it('aprueba (200) con el operador de la sesión como actor; la segunda aprobación es 409', async () => {
    const vid = await make({ vehicleId: id('vehA') })
    const ok = await review(vid, { action: 'APPROVE', note: 'ok por http' })
    expect(ok.code).toBe(200)
    expect(ok.body).toMatchObject({ ok: true, data: { status: 'NOTIFIED' } })
    expect(ok.body.data.fineId).toBeDefined()
    const reviewed = (await transitions(vid)).find((l) => (l.after as any).status === 'REVIEWED')!
    expect(reviewed).toMatchObject({ actorType: 'OPERATOR', actorId: id('adm') })

    const again = await review(vid, { action: 'APPROVE' })
    expect(again.code).toBe(409)
    expect(again.body.error.code).toBe('INVALID_TRANSITION')
  })

  it('anula (200), una violación inexistente es 404 y los errores de dominio llevan su código', async () => {
    const vid = await make()
    expect((await review(vid, { action: 'VOID', reason: 'http' })).body).toEqual({ ok: true, data: { status: 'VOID' } })
    expect((await review(vid, { action: 'VOID', reason: 'otra vez' })).code).toBe(409)
    const missing = await review(id('no-existe'), { action: 'VOID', reason: 'x' })
    expect(missing.code).toBe(404)
    expect(missing.body.error.code).toBe('NOT_FOUND')
    const sin = await make({ reason: 'NO_PLATE', plateRead: null, vehicleId: null })
    const invalid = await review(sin, { action: 'APPROVE' })
    expect(invalid.code).toBe(400)
    expect(invalid.body.error.message).toContain('placa')
  })
})

describe('GET /api/violations/[id] (detalle para la revisión)', () => {
  it('devuelve el ítem con la salida del modelo y de la regla', async () => {
    const vid = await make({ vehicleId: id('vehA') })
    const r = await call(detailHandler, { method: 'GET', query: { id: vid }, headers: admin })
    expect(r.code).toBe(200)
    expect(r.body.data).toMatchObject({
      id: vid, status: 'NEEDS_REVIEW', verdict: 'NEEDS_REVIEW', reviewReason: 'LOW_CONFIDENCE', camera: { code: 'CAM-001' },
      modelVersion: 'test-0.1', aiOutput: { model: 'test' }, ruleOutput: { verdict: 'VIOLATION' }, lightState: 'RED',
      evidence: [{ kind: 'FRAME' }],
    })
  })

  it('exige sesión (401), 404 si no existe y solo acepta GET', async () => {
    const vid = await make()
    expect((await call(detailHandler, { method: 'GET', query: { id: vid } })).code).toBe(401)
    expect((await call(detailHandler, { method: 'GET', query: { id: id('no-existe') }, headers: admin })).code).toBe(404)
    expect((await call(detailHandler, { method: 'POST', query: { id: vid }, headers: admin })).code).toBe(400)
  })
})
