import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ActorType, FineStatus, ViolationStatus } from '../../lib/contracts/index.ts'
import { db } from '../../lib/db.ts'
import { DomainError, InvalidTransitionError, NotFoundError } from '../../lib/domain/errors.ts'
import { transition } from '../../lib/domain/state-machine.ts'

const actor = { type: 'OPERATOR' as const, id: 'test-operator', ip: '203.0.113.7' }
const RUN = Date.now().toString(36)
let counter = 0

/** Crea una violación `test_*` (con multa opcional) sobre la cámara del seed. */
async function make(status: ViolationStatus, fine?: FineStatus) {
  const id = `test_${RUN}_${++counter}`
  await db.violation.create({
    data: {
      id, idempotencyKey: `test-${id}`, type: 'RED_LIGHT', status, cameraId: 'seed_cam_1', confidence: 0.9,
      occurredAt: new Date(), aiOutput: {}, ruleOutput: {}, ...(status === 'NEEDS_REVIEW' && { reviewReason: 'LOW_CONFIDENCE' as const }),
      ...(fine && {
        fine: { create: { id: `${id}_fine`, publicToken: `test-token-${id}-pad`, amountCents: 100, dueAt: new Date(Date.now() + 86_400_000), status: fine } },
      }),
    },
  })
  return id
}

const stateOf = async (id: string) => {
  const v = await db.violation.findUniqueOrThrow({ where: { id }, include: { fine: true } })
  return { status: v.status, fine: v.fine?.status ?? null, paidAt: v.fine?.paidAt ?? null, voidReason: v.voidReason }
}
const audits = (id: string) => db.auditLog.findMany({ where: { entity: 'Violation', entityId: id }, orderBy: { createdAt: 'asc' } })

beforeAll(async () => {
  const cam = await db.camera.findUnique({ where: { id: 'seed_cam_1' } })
  if (!cam) throw new Error('Falta el seed: corre `pnpm db:seed` antes de `pnpm test:db`')
})

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { entityId: { startsWith: `test_${RUN}` } } })
  await db.fine.deleteMany({ where: { id: { startsWith: `test_${RUN}` } } })
  await db.violation.deleteMany({ where: { id: { startsWith: `test_${RUN}` } } })
  await db.$disconnect()
})

describe('transition() — estado y auditoría', () => {
  it('cambia el estado y escribe un AuditLog con actor, antes y después', async () => {
    const id = await make('NOTIFIED', 'PENDING')
    const out = await transition(db, id, 'PAID', actor)
    expect(out.status).toBe('PAID')

    const [log, ...rest] = await audits(id)
    expect(rest).toHaveLength(0)
    expect(log).toMatchObject({
      actorType: 'OPERATOR', actorId: 'test-operator', ip: '203.0.113.7',
      action: 'VIOLATION_TRANSITION', entity: 'Violation', entityId: id,
      before: { status: 'NOTIFIED', fineStatus: 'PENDING' },
      after: { status: 'PAID', fineStatus: 'PAID' },
    })
  })

  it('una transición inválida lanza InvalidTransitionError y no escribe nada', async () => {
    const id = await make('PAID', 'PAID')
    const err = await transition(db, id, 'VOID', actor, { voidReason: 'x' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(InvalidTransitionError)
    expect((err as InvalidTransitionError).code).toBe('INVALID_TRANSITION')
    expect(await audits(id)).toHaveLength(0)
    expect((await stateOf(id)).status).toBe('PAID')
  })

  it('si falla la auditoría, el cambio de estado se revierte (misma transacción)', async () => {
    const id = await make('NOTIFIED', 'PENDING')
    const bogus = { type: 'BOGUS' as unknown as ActorType }
    await expect(transition(db, id, 'PAID', bogus)).rejects.toThrow()
    expect(await stateOf(id)).toMatchObject({ status: 'NOTIFIED', fine: 'PENDING', paidAt: null })
    expect(await audits(id)).toHaveLength(0)
  })

  it('violación inexistente → NotFoundError', async () => {
    await expect(transition(db, `test_${RUN}_nope`, 'FINED', actor)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('transition() — sincronización de la multa', () => {
  it('FINED → NOTIFIED mantiene la multa PENDING', async () => {
    const id = await make('FINED', 'PENDING')
    await transition(db, id, 'NOTIFIED', actor)
    expect(await stateOf(id)).toMatchObject({ status: 'NOTIFIED', fine: 'PENDING' })
  })

  it('PAID marca la multa PAID y fija paidAt', async () => {
    const id = await make('NOTIFIED', 'PENDING')
    await transition(db, id, 'PAID', actor)
    const s = await stateOf(id)
    expect(s).toMatchObject({ status: 'PAID', fine: 'PAID' })
    expect(s.paidAt).toBeInstanceOf(Date)
  })

  it('APPEALED → NOTIFIED (apelación rechazada) devuelve la multa a PENDING', async () => {
    const id = await make('NOTIFIED', 'PENDING')
    await transition(db, id, 'APPEALED', actor)
    expect((await stateOf(id)).fine).toBe('APPEALED')
    await transition(db, id, 'NOTIFIED', actor)
    expect((await stateOf(id)).fine).toBe('PENDING')
    expect(await audits(id)).toHaveLength(2)
  })

  it('VOID anula la multa y guarda el motivo', async () => {
    const id = await make('NOTIFIED', 'PENDING')
    await transition(db, id, 'VOID', actor, { voidReason: 'Vehículo de emergencia (prueba)' })
    expect(await stateOf(id)).toMatchObject({ status: 'VOID', fine: 'VOID', voidReason: 'Vehículo de emergencia (prueba)' })
  })

  it('sin multa (NEEDS_REVIEW → REVIEWED) no toca ninguna multa', async () => {
    const id = await make('NEEDS_REVIEW')
    await transition(db, id, 'REVIEWED', actor)
    expect(await stateOf(id)).toMatchObject({ status: 'REVIEWED', fine: null })
  })
})

describe('transition() — reglas de motivo', () => {
  it('NEEDS_REVIEW exige motivo y lo guarda', async () => {
    const a = await make('DETECTED')
    const err = await transition(db, a, 'NEEDS_REVIEW', actor).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DomainError)
    expect((err as DomainError).code).toBe('VALIDATION_ERROR')

    await transition(db, a, 'NEEDS_REVIEW', actor, { reviewReason: 'NO_PLATE' })
    expect((await db.violation.findUniqueOrThrow({ where: { id: a } })).reviewReason).toBe('NO_PLATE')
  })

  it('VOID exige voidReason', async () => {
    const id = await make('DETECTED')
    await expect(transition(db, id, 'VOID', actor)).rejects.toBeInstanceOf(DomainError)
    expect((await stateOf(id)).status).toBe('DETECTED')
  })
})

describe('transition() — concurrencia y composición', () => {
  it('dos transiciones simultáneas se serializan: una gana, la otra falla y hay un solo AuditLog', async () => {
    const id = await make('NOTIFIED', 'PENDING')
    const results = await Promise.allSettled([
      transition(db, id, 'PAID', actor),
      transition(db, id, 'VOID', actor, { voidReason: 'carrera (prueba)' }),
    ])
    const ok = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(failed[0]!.reason).toBeInstanceOf(InvalidTransitionError)

    const logs = await audits(id)
    expect(logs).toHaveLength(1)
    const s = await stateOf(id)
    expect(s.status).toBe((logs[0]!.after as { status: string }).status)
    expect(['PAID', 'VOID']).toContain(s.status)
  })

  it('se puede componer en una transacción externa y se revierte con ella', async () => {
    const id = await make('NOTIFIED', 'PENDING')
    await expect(
      db.$transaction(async (tx) => {
        await transition(tx, id, 'PAID', actor)
        throw new Error('falla posterior en la misma transacción')
      }),
    ).rejects.toThrow('falla posterior')
    expect(await stateOf(id)).toMatchObject({ status: 'NOTIFIED', fine: 'PENDING' })
    expect(await audits(id)).toHaveLength(0)

    await db.$transaction(async (tx) => {
      await transition(tx, id, 'PAID', actor)
    })
    expect((await stateOf(id)).status).toBe('PAID')
    expect(await audits(id)).toHaveLength(1)
  })
})
