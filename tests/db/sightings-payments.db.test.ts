import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FineStatus, ViolationStatus } from '../../lib/contracts/index.ts'
import { db } from '../../lib/db.ts'
import { DomainError, InvalidTransitionError, NotFoundError } from '../../lib/domain/errors.ts'
import { createMarkFinePaid } from '../../lib/domain/payments.ts'
import { createRegisterSighting } from '../../lib/domain/sightings.ts'

const RUN = Date.now().toString(36)
const SUFFIX = String(Date.now() % 10_000).padStart(4, '0')
const personId = `test_${RUN}_per`
let n = 0
const vehicleIds: string[] = []
const violationIds: string[] = []
const fineIds: string[] = []
const sightingIds: string[] = []

const registerSighting = createRegisterSighting(db)
const markFinePaid = createMarkFinePaid(db)

async function vehicle(): Promise<{ id: string; plate: string }> {
  const id = `test_${RUN}_veh_${++n}`
  const plate = `TY${String(n).padStart(2, '0')}${SUFFIX}`
  await db.vehicle.create({ data: { id, plate, make: 'Test', model: 'Auto', color: 'gris', ownerId: personId } })
  vehicleIds.push(id)
  return { id, plate }
}

/** Violación `test_*` con multa, para un vehículo. */
async function withFine(vehicleId: string, o: { v?: ViolationStatus; f?: FineStatus; overdue?: boolean } = {}) {
  const id = `test_${RUN}_vio_${++n}`
  await db.violation.create({
    data: {
      id, idempotencyKey: `test-pay-${RUN}-${n}`, type: 'RED_LIGHT', status: o.v ?? 'NOTIFIED', cameraId: 'seed_cam_1', vehicleId,
      confidence: 0.9, occurredAt: new Date(Date.now() - 5 * 86_400_000), aiOutput: {}, ruleOutput: {},
      fine: {
        create: {
          id: `${id}_fine`, publicToken: `test-token-${id}-pad`, amountCents: 100, status: o.f ?? 'PENDING',
          dueAt: new Date(Date.now() + (o.overdue ? -86_400_000 : 86_400_000)),
        },
      },
    },
  })
  violationIds.push(id)
  fineIds.push(`${id}_fine`)
  return { violationId: id, fineId: `${id}_fine` }
}

async function payment(fineId: string, status: 'APPROVED' | 'REJECTED' | 'PENDING' = 'APPROVED') {
  const id = `test_${RUN}_pay_${++n}`
  await db.payment.create({
    data: { id, fineId, status, payerBankCode: '0102', payerPhone: '04120000001', payerCedula: 'V99000001', amountCents: 100, idempotencyKey: `test-pay-key-${RUN}-${n}` },
  })
  return id
}

const audits = (entityId: string) => db.auditLog.findMany({ where: { entityId } })

beforeAll(async () => {
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) {
    throw new Error('Falta el seed: corre `pnpm db:seed` antes de `pnpm test:db`')
  }
  await db.person.create({ data: { id: personId, cedula: `V9${String(Date.now()).slice(-7)}`, fullName: 'Persona Test', phone: '584120000000' } })
})

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { entityId: { in: [...violationIds, ...fineIds] } } })
  await db.payment.deleteMany({ where: { id: { startsWith: `test_${RUN}` } } })
  await db.sighting.deleteMany({ where: { id: { in: sightingIds } } })
  await db.fine.deleteMany({ where: { id: { in: fineIds } } })
  await db.violation.deleteMany({ where: { id: { in: violationIds } } })
  await db.vehicle.deleteMany({ where: { id: { in: vehicleIds } } })
  await db.person.deleteMany({ where: { id: personId } })
  await db.$disconnect()
})

describe('registerSighting', () => {
  it('cuenta las multas impagas (PENDING, incluidas las vencidas) y no las pagadas ni anuladas', async () => {
    const v = await vehicle()
    await withFine(v.id) // vigente
    await withFine(v.id, { overdue: true }) // vencida: sigue impaga
    await withFine(v.id, { v: 'PAID', f: 'PAID' })
    await withFine(v.id, { v: 'VOID', f: 'VOID' })

    const out = await registerSighting({ cameraId: 'seed_cam_1', plate: v.plate, seenAt: new Date().toISOString(), evidenceUrl: 'https://example.com/t/clip.mp4' })
    sightingIds.push(out.sightingId)
    expect(out).toMatchObject({ vehicleId: v.id, unpaidCount: 2 })

    const row = await db.sighting.findUniqueOrThrow({ where: { id: out.sightingId } })
    expect(row).toMatchObject({ cameraId: 'seed_cam_1', vehicleId: v.id, plateRead: v.plate, evidenceUrl: 'https://example.com/t/clip.mp4' })
  })

  it('vehículo sin multas → unpaidCount 0 pero se registra', async () => {
    const v = await vehicle()
    const out = await registerSighting({ cameraId: 'seed_cam_1', plate: v.plate, seenAt: new Date().toISOString() })
    sightingIds.push(out.sightingId)
    expect(out).toMatchObject({ vehicleId: v.id, unpaidCount: 0 })
  })

  it('placa desconocida: no falla, no hay vehicleId y se guarda el avistamiento', async () => {
    const out = await registerSighting({ cameraId: 'seed_cam_1', plate: `ZS${SUFFIX}Q`, seenAt: new Date().toISOString() })
    sightingIds.push(out.sightingId)
    expect(out.vehicleId).toBeUndefined()
    expect(out.unpaidCount).toBe(0)
    expect((await db.sighting.findUniqueOrThrow({ where: { id: out.sightingId } })).vehicleId).toBeNull()
  })

  it('normaliza la placa (minúsculas, guiones, espacios)', async () => {
    const v = await vehicle()
    const sloppy = `${v.plate.slice(0, 2)}-${v.plate.slice(2, 4)} ${v.plate.slice(4)}`.toLowerCase()
    const out = await registerSighting({ cameraId: 'seed_cam_1', plate: sloppy, seenAt: new Date().toISOString() })
    sightingIds.push(out.sightingId)
    expect(out.vehicleId).toBe(v.id)
  })

  it('cámara inexistente → NotFoundError y no guarda nada', async () => {
    // Se cuenta por una placa propia: la base es compartida y otros procesos también crean avistamientos.
    const plate = `ZC${SUFFIX}Q`
    await expect(registerSighting({ cameraId: 'no-existe', plate, seenAt: new Date().toISOString() })).rejects.toBeInstanceOf(NotFoundError)
    expect(await db.sighting.count({ where: { plateRead: plate } })).toBe(0)
  })
})

describe('markFinePaid', () => {
  it('marca multa y violación PAID, fija paidAt y audita con el id del pago (sin datos del pagador)', async () => {
    const v = await vehicle()
    const { violationId, fineId } = await withFine(v.id)
    const paymentId = await payment(fineId)

    await markFinePaid(fineId, paymentId)

    const row = await db.violation.findUniqueOrThrow({ where: { id: violationId }, include: { fine: true } })
    expect(row.status).toBe('PAID')
    expect(row.fine).toMatchObject({ status: 'PAID' })
    expect(row.fine!.paidAt).toBeInstanceOf(Date)

    const [log, ...rest] = await audits(violationId)
    expect(rest).toHaveLength(0)
    expect(log).toMatchObject({ actorType: 'CITIZEN', actorId: `payment:${paymentId}`, action: 'VIOLATION_TRANSITION' })
    expect(JSON.stringify(log)).not.toContain('V99000001')
  })

  it('también paga una multa en FINED (aún sin notificar)', async () => {
    const v = await vehicle()
    const { violationId, fineId } = await withFine(v.id, { v: 'FINED' })
    await markFinePaid(fineId, await payment(fineId))
    expect((await db.violation.findUniqueOrThrow({ where: { id: violationId } })).status).toBe('PAID')
  })

  it('una multa ya pagada → ALREADY_PAID (409) y no cambia nada', async () => {
    const v = await vehicle()
    const { violationId, fineId } = await withFine(v.id)
    await markFinePaid(fineId, await payment(fineId))

    const err = await markFinePaid(fineId, await payment(fineId)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DomainError)
    expect((err as DomainError).code).toBe('ALREADY_PAID')
    expect(await audits(violationId)).toHaveLength(1)
  })

  it('dos pagos simultáneos de la misma multa: uno se aplica y el otro recibe ALREADY_PAID', async () => {
    const v = await vehicle()
    const { violationId, fineId } = await withFine(v.id)
    const [p1, p2] = [await payment(fineId), await payment(fineId)]

    const results = await Promise.allSettled([markFinePaid(fineId, p1), markFinePaid(fineId, p2)])
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect((failed[0]!.reason as DomainError).code).toBe('ALREADY_PAID')
    expect(await audits(violationId)).toHaveLength(1)
  })

  it('rechaza pagos no aprobados o de otra multa (VALIDATION_ERROR) y deja la multa intacta', async () => {
    const v = await vehicle()
    const a = await withFine(v.id)
    const b = await withFine(v.id)

    for (const bad of [await payment(a.fineId, 'REJECTED'), await payment(a.fineId, 'PENDING'), await payment(b.fineId)]) {
      const err = await markFinePaid(a.fineId, bad).catch((e: unknown) => e)
      expect((err as DomainError).code).toBe('VALIDATION_ERROR')
    }
    const row = await db.violation.findUniqueOrThrow({ where: { id: a.violationId }, include: { fine: true } })
    expect(row).toMatchObject({ status: 'NOTIFIED', fine: { status: 'PENDING', paidAt: null } })
  })

  it('multa o pago inexistentes → NotFoundError', async () => {
    const v = await vehicle()
    const { fineId } = await withFine(v.id)
    await expect(markFinePaid('test_no_existe', 'x')).rejects.toBeInstanceOf(NotFoundError)
    await expect(markFinePaid(fineId, 'test_no_existe')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('una multa anulada no se puede pagar (transición inválida)', async () => {
    const v = await vehicle()
    const { fineId } = await withFine(v.id, { v: 'VOID', f: 'VOID' })
    await expect(markFinePaid(fineId, await payment(fineId))).rejects.toBeInstanceOf(InvalidTransitionError)
  })
})
