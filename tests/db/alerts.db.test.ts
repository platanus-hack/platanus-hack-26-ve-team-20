import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DispatchAlert, FineStatus, NotifyFineIssued, RegisterSighting, ViolationStatus, VisionResult } from '../../lib/contracts/index.ts'
import { db } from '../../lib/db.ts'
import { createRegisterSighting } from '../../lib/domain/sightings.ts'
import { createRegisterDetection } from '../../lib/domain/violations.ts'

// Enganche detección → avistamiento → alerta (docs/02 §5 paso 8, HU-06).
const RUN = Date.now().toString(36)
const SUFFIX = String(Date.now() % 10_000).padStart(4, '0')
const KEY_PREFIX = `test-alr-${RUN}`
const personId = `test_${RUN}_per`
let n = 0
const vehicleIds: string[] = []
const sightingIds: string[] = []

/** Dependencias con espías: registran los avistamientos creados y las alertas despachadas. */
function setup(dispatch?: DispatchAlert) {
  const real = createRegisterSighting(db)
  const registerSighting = vi.fn<RegisterSighting>(async (s) => {
    const out = await real(s)
    sightingIds.push(out.sightingId)
    return out
  })
  const dispatchAlert = vi.fn<DispatchAlert>(dispatch ?? (async () => ({ alertId: 'alr_test', status: 'SENT', officerId: 'o', distanceM: 420 })))
  const notifyFineIssued = vi.fn<NotifyFineIssued>(async () => ({ channel: 'WHATSAPP', status: 'DRY_RUN' }))
  const register = createRegisterDetection({ db, notifyFineIssued, registerSighting, dispatchAlert, confidenceThreshold: 0.8 })
  return { register, registerSighting, dispatchAlert }
}

async function vehicle(): Promise<{ id: string; plate: string }> {
  const id = `test_${RUN}_veh_${++n}`
  const plate = `TZ${String(n).padStart(2, '0')}${SUFFIX}`
  await db.vehicle.create({ data: { id, plate, make: 'Test', model: 'Auto', color: 'gris', ownerId: personId } })
  vehicleIds.push(id)
  return { id, plate }
}

/** Una multa ANTERIOR del vehículo (placa leída nula para no interferir con el dedup). */
async function priorFine(vehicleId: string, v: ViolationStatus = 'NOTIFIED', f: FineStatus = 'PENDING') {
  const id = `test_${RUN}_prior_${++n}`
  await db.violation.create({
    data: {
      id, idempotencyKey: `${KEY_PREFIX}-prior-${n}`, type: 'RED_LIGHT', status: v, cameraId: 'seed_cam_1', vehicleId, confidence: 0.9,
      occurredAt: new Date(Date.now() - 10 * 86_400_000), aiOutput: {}, ruleOutput: {},
      fine: { create: { id: `${id}_fine`, publicToken: `test-token-${id}-pad`, amountCents: 100, status: f, dueAt: new Date(Date.now() + 86_400_000) } },
    },
  })
}

function detection(plate: string | null, over: Partial<VisionResult> = {}): VisionResult {
  const at = new Date().toISOString()
  return {
    cameraId: 'seed_cam_1', type: 'RED_LIGHT', verdict: 'VIOLATION', plate, plateConfidence: 0.95, confidence: 0.92, occurredAt: at,
    frames: [{ url: 'https://example.com/t/f0.jpg', capturedAt: at, lightState: 'RED' }],
    clipUrl: 'https://example.com/t/clip.mp4',
    crossing: { crossedStopLine: true, atMs: 1800, lightState: 'RED' },
    motion: { speedKmh: null, laneId: null, directionDeg: null, relation: 'UNKNOWN' },
    modelVersion: 'test-0.1', aiOutput: {}, ruleOutput: {}, idempotencyKey: `${KEY_PREFIX}-${++n}`,
    ...over,
  }
}

beforeAll(async () => {
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) {
    throw new Error('Falta el seed: corre `pnpm db:seed` antes de `pnpm test:db`')
  }
  await db.person.create({ data: { id: personId, cedula: `V9${String(Date.now()).slice(-7)}`, fullName: 'Persona Test', phone: '584120000000' } })
})

afterAll(async () => {
  const created = await db.violation.findMany({ where: { idempotencyKey: { startsWith: KEY_PREFIX } }, include: { fine: true } })
  const ids = created.flatMap((v) => [v.id, ...(v.fine ? [v.fine.id] : [])])
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } })
  await db.sighting.deleteMany({ where: { id: { in: sightingIds } } })
  await db.evidence.deleteMany({ where: { violationId: { in: created.map((v) => v.id) } } })
  await db.fine.deleteMany({ where: { violationId: { in: created.map((v) => v.id) } } })
  await db.violation.deleteMany({ where: { id: { in: created.map((v) => v.id) } } })
  await db.vehicle.deleteMany({ where: { id: { in: vehicleIds } } })
  await db.person.deleteMany({ where: { id: personId } })
  await db.$disconnect()
})

describe('registerDetection → registerSighting → dispatchAlert', () => {
  it('vehículo con multa impaga previa: crea el avistamiento y despacha UNA alerta', async () => {
    const v = await vehicle()
    await priorFine(v.id)
    const { register, registerSighting, dispatchAlert } = setup()

    const out = await register(detection(v.plate))

    expect(out).toMatchObject({ status: 'NOTIFIED', duplicate: false })
    expect(registerSighting).toHaveBeenCalledTimes(1)
    expect(registerSighting).toHaveBeenCalledWith(expect.objectContaining({ cameraId: 'seed_cam_1', plate: v.plate, evidenceUrl: 'https://example.com/t/clip.mp4' }))
    const sightingId = sightingIds.at(-1)!
    expect(dispatchAlert).toHaveBeenCalledTimes(1)
    expect(dispatchAlert).toHaveBeenCalledWith(sightingId)
    expect(await db.sighting.findUniqueOrThrow({ where: { id: sightingId } })).toMatchObject({ vehicleId: v.id, plateRead: v.plate })
  })

  it('sin multas previas no hay avistamiento ni alerta (aunque esta detección genere una multa)', async () => {
    const v = await vehicle()
    const { register, registerSighting, dispatchAlert } = setup()
    const out = await register(detection(v.plate))
    expect(out.fineId).toBeDefined()
    expect(registerSighting).not.toHaveBeenCalled()
    expect(dispatchAlert).not.toHaveBeenCalled()
  })

  it('multas previas pagadas o anuladas no cuentan', async () => {
    const v = await vehicle()
    await priorFine(v.id, 'PAID', 'PAID')
    await priorFine(v.id, 'VOID', 'VOID')
    const { register, dispatchAlert } = setup()
    await register(detection(v.plate))
    expect(dispatchAlert).not.toHaveBeenCalled()
  })

  it('la repetición de la misma detección no vuelve a alertar', async () => {
    const v = await vehicle()
    await priorFine(v.id)
    const { register, registerSighting, dispatchAlert } = setup()
    const r = detection(v.plate)
    await register(r)
    const again = await register(r)
    expect(again.duplicate).toBe(true)
    expect(registerSighting).toHaveBeenCalledTimes(1)
    expect(dispatchAlert).toHaveBeenCalledTimes(1)
  })

  it('un cruce en verde (NO_VIOLATION) de un vehículo con deuda también alerta: la cámara lo vio', async () => {
    const v = await vehicle()
    await priorFine(v.id)
    const { register, dispatchAlert } = setup()
    const out = await register(detection(v.plate, { verdict: 'NO_VIOLATION', crossing: { crossedStopLine: true, lightState: 'GREEN' } }))
    expect(out.status).toBe('VOID')
    expect(dispatchAlert).toHaveBeenCalledTimes(1)
  })

  it('no alerta si la placa no es confiable ni si el vehículo no está registrado', async () => {
    const v = await vehicle()
    await priorFine(v.id)
    const a = setup()
    await a.register(detection(v.plate, { plateConfidence: 0.5 })) // lectura dudosa: podría ser otro vehículo
    expect(a.dispatchAlert).not.toHaveBeenCalled()

    const b = setup()
    await b.register(detection(`ZA${SUFFIX}Q`))
    expect(b.dispatchAlert).not.toHaveBeenCalled()
  })

  it('si despachar la alerta falla, la detección igual se registra y el fallo se audita', async () => {
    const v = await vehicle()
    await priorFine(v.id)
    const { register } = setup(async () => {
      throw new Error('sin oficiales (prueba)')
    })
    const out = await register(detection(v.plate))
    expect(out).toMatchObject({ status: 'NOTIFIED', duplicate: false })
    const logs = await db.auditLog.findMany({ where: { entityId: out.violationId, action: 'ALERT_FAILED' } })
    expect(logs).toHaveLength(1)
    expect(logs[0]!.after).toMatchObject({ error: 'sin oficiales (prueba)' })
  })
})
