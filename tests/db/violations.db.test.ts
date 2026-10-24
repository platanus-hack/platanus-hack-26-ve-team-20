import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DispatchAlert, NotificationResult, NotifyFineIssued, VisionResult } from '../../lib/contracts/index.ts'
import { db } from '../../lib/db.ts'
import { NotFoundError } from '../../lib/domain/errors.ts'
import { FINE_AMOUNTS_EXAMPLE } from '../../lib/domain/fines.ts'
import { createRegisterSighting } from '../../lib/domain/sightings.ts'
import { NO_VIOLATION_VOID_REASON, createRegisterDetection } from '../../lib/domain/violations.ts'

const RUN = Date.now().toString(36)
const SUFFIX = String(Date.now() % 10_000).padStart(4, '0')
const KEY_PREFIX = `test-det-${RUN}`
let counter = 0
const plates: string[] = []

const dryRun: NotificationResult = { channel: 'WHATSAPP', status: 'DRY_RUN', providerId: 'test' }
function notifier(result: NotificationResult | Error = dryRun) {
  return vi.fn<NotifyFineIssued>(async () => {
    if (result instanceof Error) throw result
    return result
  })
}
const make = (notify: NotifyFineIssued = notifier(), confidenceThreshold = 0.8) =>
  createRegisterDetection({
    db,
    notifyFineIssued: notify,
    registerSighting: createRegisterSighting(db),
    // Los vehículos de estas pruebas no tienen multas previas, así que no debería llamarse.
    dispatchAlert: vi.fn<DispatchAlert>(async () => ({ alertId: 'test', status: 'SENT' })),
    confidenceThreshold,
  })

const personId = `test_${RUN}_per`
/** Placa única por prueba, registrada a nombre de la persona de prueba. */
async function vehicle(): Promise<string> {
  const plate = `TX${String(++counter).padStart(2, '0')}${SUFFIX}`
  await db.vehicle.create({ data: { id: `test_${RUN}_veh_${counter}`, plate, make: 'Test', model: 'Auto', color: 'gris', ownerId: personId } })
  plates.push(plate)
  return plate
}

function detection(plate: string | null, over: Partial<VisionResult> = {}): VisionResult {
  const at = over.occurredAt ?? new Date().toISOString()
  return {
    cameraId: 'seed_cam_1', type: 'RED_LIGHT', verdict: 'VIOLATION', plate, plateConfidence: 0.95, confidence: 0.92,
    occurredAt: at,
    frames: [
      { url: 'https://example.com/t/f0.jpg', capturedAt: at, lightState: 'RED', vehicleBox: { x: 0.3, y: 0.5, w: 0.2, h: 0.2 } },
      { url: 'https://example.com/t/f1.jpg', capturedAt: at, lightState: 'RED' },
    ],
    clipUrl: 'https://example.com/t/clip.mp4', plateCropUrl: 'https://example.com/t/plate.jpg',
    crossing: { crossedStopLine: true, atMs: 1800, lightState: 'RED' },
    motion: { speedKmh: 42.1, laneId: 'C1', directionDeg: 2, relation: 'WITH_FLOW' },
    modelVersion: 'test-0.1', aiOutput: { test: true }, ruleOutput: { ok: true },
    idempotencyKey: `${KEY_PREFIX}-${++counter}`,
    ...over,
  }
}

const row = (id: string) =>
  db.violation.findUniqueOrThrow({ where: { id }, include: { fine: true, evidence: true } })
const actionsOf = async (id: string) =>
  (await db.auditLog.findMany({ where: { entityId: id } })).map((a) => a.action).sort()

beforeAll(async () => {
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) {
    throw new Error('Falta el seed: corre `pnpm db:seed` antes de `pnpm test:db`')
  }
  await db.person.create({ data: { id: personId, cedula: `V9${String(Date.now()).slice(-7)}`, fullName: 'Persona Test', phone: '584120000000' } })
})

afterAll(async () => {
  const violations = await db.violation.findMany({ where: { idempotencyKey: { startsWith: KEY_PREFIX } }, include: { fine: true } })
  const ids = violations.flatMap((v) => [v.id, ...(v.fine ? [v.fine.id] : [])])
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } })
  await db.evidence.deleteMany({ where: { violationId: { in: violations.map((v) => v.id) } } })
  await db.fine.deleteMany({ where: { violationId: { in: violations.map((v) => v.id) } } })
  await db.violation.deleteMany({ where: { id: { in: violations.map((v) => v.id) } } })
  // Una 2ª detección de un vehículo que ya tiene multa crea un avistamiento (alerta): se limpia aquí.
  await db.sighting.deleteMany({ where: { plateRead: { in: plates } } })
  await db.vehicle.deleteMany({ where: { id: { startsWith: `test_${RUN}` } } })
  await db.person.deleteMany({ where: { id: personId } })
  await db.$disconnect()
})

describe('registerDetection — camino feliz (HU-02)', () => {
  it('crea violación, evidencia y multa, notifica una vez y termina en NOTIFIED', async () => {
    const plate = await vehicle()
    const notify = notifier()
    const out = await make(notify)(detection(plate))

    expect(out).toMatchObject({ status: 'NOTIFIED', duplicate: false })
    expect(out.fineId).toBeDefined()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(out.fineId)

    const v = await row(out.violationId)
    expect(v).toMatchObject({
      status: 'NOTIFIED', plateRead: plate, measuredSpeedKmh: 42.1, laneId: 'C1', roadRelation: 'WITH_FLOW', modelVersion: 'test-0.1',
    })
    expect(v.vehicleId).toMatch(/^test_/)
    expect(v.fine).toMatchObject({ status: 'PENDING', amountCents: FINE_AMOUNTS_EXAMPLE.RED_LIGHT, currency: 'VES' })
    expect(v.fine!.publicToken).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(Math.round((v.fine!.dueAt.getTime() - v.fine!.issuedAt.getTime()) / 86_400_000)).toBe(30)
    expect(v.evidence.map((e) => e.kind).sort()).toEqual(['CLIP', 'FRAME', 'FRAME', 'PLATE_CROP'])
    expect(await actionsOf(out.violationId)).toEqual(['VIOLATION_CREATED', 'VIOLATION_TRANSITION', 'VIOLATION_TRANSITION'])
  })

  it('si la notificación queda FAILED, la multa existe y la violación sigue en FINED', async () => {
    const plate = await vehicle()
    const out = await make(notifier({ channel: 'WHATSAPP', status: 'FAILED' }))(detection(plate))
    expect(out).toMatchObject({ status: 'FINED', duplicate: false })
    expect((await row(out.violationId)).fine).not.toBeNull()
    expect(await actionsOf(out.fineId!)).toEqual(['NOTIFY_FAILED'])
  })

  it('si notify lanza, la detección no se pierde: queda FINED y se audita', async () => {
    const plate = await vehicle()
    const out = await make(notifier(new Error('Meta caído (prueba)')))(detection(plate))
    expect(out.status).toBe('FINED')
    expect(await actionsOf(out.fineId!)).toEqual(['NOTIFY_FAILED'])
  })
})

describe('registerDetection — idempotencia y dedup', () => {
  it('la misma idempotencyKey devuelve la violación existente sin notificar ni crear nada', async () => {
    const plate = await vehicle()
    const notify = notifier()
    const r = detection(plate)
    const first = await make(notify)(r)
    const again = await make(notify)(r)

    expect(again).toMatchObject({ violationId: first.violationId, fineId: first.fineId, status: 'NOTIFIED', duplicate: true })
    expect(notify).toHaveBeenCalledTimes(1)
    expect(await db.violation.count({ where: { idempotencyKey: r.idempotencyKey } })).toBe(1)
  })

  it('misma placa + cámara + tipo dentro de 60 s es duplicado; fuera de la ventana, no', async () => {
    const plate = await vehicle()
    const t0 = Date.now()
    const at = (s: number) => new Date(t0 + s * 1000).toISOString()
    const notify = notifier()
    const reg = make(notify)

    const first = await reg(detection(plate, { occurredAt: at(0) }))
    const at30 = await reg(detection(plate, { occurredAt: at(30) }))
    const at59 = await reg(detection(plate, { occurredAt: at(59) }))
    const atMinus59 = await reg(detection(plate, { occurredAt: at(-59) }))
    expect([at30, at59, atMinus59].every((o) => o.duplicate && o.violationId === first.violationId)).toBe(true)

    const at61 = await reg(detection(plate, { occurredAt: at(61) }))
    const at90 = await reg(detection(plate, { occurredAt: at(90) }))
    expect(at61.duplicate).toBe(false)
    expect(at61.violationId).not.toBe(first.violationId)
    expect(at90.duplicate).toBe(true) // a 29 s de la anterior (at61)
    expect(at90.violationId).toBe(at61.violationId)
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('otra cámara o el mismo tipo en otra cámara NO es duplicado', async () => {
    const plate = await vehicle()
    const t = new Date().toISOString()
    const reg = make()
    const a = await reg(detection(plate, { occurredAt: t, cameraId: 'seed_cam_1' }))
    const b = await reg(detection(plate, { occurredAt: t, cameraId: 'seed_cam_2' }))
    expect(b.duplicate).toBe(false)
    expect(b.violationId).not.toBe(a.violationId)
  })

  it('tres detecciones simultáneas de la misma placa crean una sola violación', async () => {
    const plate = await vehicle()
    const notify = notifier()
    const reg = make(notify)
    const t = new Date().toISOString()
    const outs = await Promise.all([1, 2, 3].map(() => reg(detection(plate, { occurredAt: t }))))
    expect(new Set(outs.map((o) => o.violationId)).size).toBe(1)
    expect(outs.filter((o) => !o.duplicate)).toHaveLength(1)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('tres peticiones con la misma idempotencyKey crean una sola violación', async () => {
    const plate = await vehicle()
    const reg = make()
    const r = detection(plate)
    const outs = await Promise.all([1, 2, 3].map(() => reg(r)))
    expect(new Set(outs.map((o) => o.violationId)).size).toBe(1)
    expect(await db.violation.count({ where: { idempotencyKey: r.idempotencyKey } })).toBe(1)
  })
})

describe('registerDetection — casos de revisión humana (no generan multa)', () => {
  async function review(r: VisionResult, threshold = 0.8) {
    const notify = notifier()
    const out = await make(notify, threshold)(r)
    const v = await row(out.violationId)
    expect(out.fineId).toBeUndefined()
    expect(v.fine).toBeNull()
    expect(notify).not.toHaveBeenCalled()
    return { out, v }
  }

  it('placa no registrada → NEEDS_REVIEW (PLATE_NOT_FOUND)', async () => {
    const { out, v } = await review(detection(`ZN${SUFFIX}Q`))
    expect(out.status).toBe('NEEDS_REVIEW')
    expect(v).toMatchObject({ reviewReason: 'PLATE_NOT_FOUND', vehicleId: null })
  })

  it('confianza baja → NEEDS_REVIEW (LOW_CONFIDENCE) pero enlaza el vehículo conocido', async () => {
    const plate = await vehicle()
    const { v } = await review(detection(plate, { confidence: 0.5 }))
    expect(v).toMatchObject({ status: 'NEEDS_REVIEW', reviewReason: 'LOW_CONFIDENCE' })
    expect(v.vehicleId).toMatch(/^test_/)
  })

  it('el umbral configurable se respeta (0.95 rechaza 0.92)', async () => {
    const plate = await vehicle()
    const { v } = await review(detection(plate), 0.95)
    expect(v.reviewReason).toBe('LOW_CONFIDENCE')
  })

  it('sin placa o con "?" → NEEDS_REVIEW (NO_PLATE)', async () => {
    const noPlate = await review(detection(null, { plateConfidence: 0 }))
    expect(noPlate.v).toMatchObject({ reviewReason: 'NO_PLATE', plateRead: null })
    const dudosa = await review(detection(`AB1${SUFFIX.slice(0, 1)}?CD`))
    expect(dudosa.v.reviewReason).toBe('NO_PLATE')
  })

  it('veredicto NEEDS_REVIEW del modelo (servicio ML caído) conserva su motivo', async () => {
    const { v } = await review(detection(null, { verdict: 'NEEDS_REVIEW', reviewReason: 'ML_SERVICE_ERROR', plateConfidence: 0, confidence: 0 }))
    expect(v).toMatchObject({ status: 'NEEDS_REVIEW', reviewReason: 'ML_SERVICE_ERROR' })
  })
})

describe('registerDetection — NO_VIOLATION y errores', () => {
  it('NO_VIOLATION se guarda como VOID con motivo NO_VIOLATION (visible en el feed) y no multa', async () => {
    const plate = await vehicle()
    const notify = notifier()
    const out = await make(notify)(detection(plate, { verdict: 'NO_VIOLATION', crossing: { crossedStopLine: true, lightState: 'GREEN' } }))
    expect(out).toMatchObject({ status: 'VOID', duplicate: false })
    expect(out.fineId).toBeUndefined()
    expect(notify).not.toHaveBeenCalled()
    const v = await row(out.violationId)
    expect(v.voidReason).toBe(NO_VIOLATION_VOID_REASON)
    expect(v.ruleOutput).toMatchObject({ verdict: 'NO_VIOLATION', crossing: { lightState: 'GREEN' } })
  })

  it('cámara inexistente → NotFoundError y no queda nada creado', async () => {
    const plate = await vehicle()
    const r = detection(plate, { cameraId: 'no-existe' })
    await expect(make()(r)).rejects.toBeInstanceOf(NotFoundError)
    expect(await db.violation.count({ where: { idempotencyKey: r.idempotencyKey } })).toBe(0)
  })
})
