import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDispatcher } from '../../lib/alerts/dispatch.ts'
import { db } from '../../lib/db.ts'
import { createNotifier } from '../../lib/notify/notifier.ts'
import { createPrismaNotificationRepo } from '../../lib/notify/prisma-repo.ts'

// dispatchAlert contra la base real (`pnpm test:db`), SIN enviar WhatsApp (`send` falso).
// Cámara del seed seed_cam_1 → intersección seed_int_1 (10.4961, -66.853).
const RUN = `test_alr_${Date.now().toString(36)}`
const suffix = Date.now().toString().slice(-4)
const CAM = { lat: 10.4961, lng: -66.853 }
const send = vi.fn(async () => ({ status: 'SENT' as const, providerId: `wamid.${RUN}` }))
const notifier = createNotifier({ repo: createPrismaNotificationRepo(db), send, appBaseUrl: 'https://example.test' })
const notifyOfficerAlert = vi.fn(notifier.notifyOfficerAlert)
const { dispatchAlert } = createDispatcher({ db, notifyOfficerAlert })

async function vehicleWithDebt(tag: string, unpaid: number) {
  const id = `${RUN}_${tag}`
  await db.person.create({ data: { id: `${id}_per`, cedula: `V8${suffix}${tag.length}${unpaid}${tag.charCodeAt(0)}`.slice(0, 10), fullName: 'Persona Prueba (ejemplo)', phone: '584120000099' } })
  await db.vehicle.create({ data: { id: `${id}_veh`, plate: `${tag.toUpperCase().slice(0, 2)}${suffix}${tag.length}`, make: 'Ford', model: 'Explorer', color: 'blanca', ownerId: `${id}_per` } })
  for (let i = 0; i < unpaid; i++) {
    await db.violation.create({
      data: {
        id: `${id}_vio${i}`, idempotencyKey: `test-${id}-${i}`, type: 'RED_LIGHT', status: 'NOTIFIED', cameraId: 'seed_cam_1', vehicleId: `${id}_veh`,
        confidence: 0.9, occurredAt: new Date(), aiOutput: {}, ruleOutput: {},
        fine: { create: { id: `${id}_fine${i}`, publicToken: `${id}-tok-${i}-pad`, amountCents: 100, dueAt: new Date(Date.now() + 86_400_000) } },
      },
    })
  }
  return `${id}_veh`
}

let n = 0
const sighting = async (vehicleId: string) => {
  const s = await db.sighting.create({ data: { id: `${RUN}_s${++n}`, cameraId: 'seed_cam_1', vehicleId, plateRead: 'X', seenAt: new Date() } })
  return s.id
}

let vehicleA = ''
let vehicleB = ''

beforeAll(async () => {
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) throw new Error('Falta el seed: corre `pnpm db:seed`')
  const officer = (tag: string, onDuty: boolean, dLat: number) =>
    db.officer.create({
      data: {
        id: `${RUN}_${tag}`, badge: `T-${suffix}-${tag}`, name: `Oficial Prueba ${tag} (ejemplo)`, phone: `58412000${suffix}`, onDuty,
        locations: { create: { lat: CAM.lat + dLat, lng: CAM.lng, recordedAt: new Date() } },
      },
    })
  await officer('near', true, 0.0003) // ~33 m
  await officer('far', true, 0.027) // ~3 km
  await officer('off', false, 0.0001) // más cerca, pero fuera de servicio
  vehicleA = await vehicleWithDebt('aa', 2)
  vehicleB = await vehicleWithDebt('bb', 1)
})

afterAll(async () => {
  const alerts = (await db.alert.findMany({ where: { sightingId: { startsWith: RUN } }, select: { id: true } })).map((a) => a.id)
  const ntfs = (await db.notification.findMany({ where: { alertId: { in: alerts } }, select: { id: true } })).map((x) => x.id)
  await db.auditLog.deleteMany({ where: { entityId: { in: [...alerts, ...ntfs] } } })
  await db.notification.deleteMany({ where: { id: { in: ntfs } } })
  await db.alert.deleteMany({ where: { id: { in: alerts } } })
  await db.sighting.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.officerLocation.deleteMany({ where: { officerId: { startsWith: RUN } } })
  await db.officer.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.fine.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.violation.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.vehicle.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.person.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.$disconnect()
})

describe('dispatchAlert contra la base', () => {
  it('alerta al oficial en servicio más cercano y le escribe por WhatsApp', async () => {
    const s1 = await sighting(vehicleA)
    const r = await dispatchAlert(s1)
    expect(r).toMatchObject({ status: 'SENT', officerId: `${RUN}_near` })
    expect(r.distanceM).toBeLessThan(60)

    const alert = await db.alert.findUniqueOrThrow({ where: { id: r.alertId } })
    expect(alert).toMatchObject({ vehicleId: vehicleA, sightingId: s1, unpaidCount: 2, status: 'SENT', officerId: `${RUN}_near` })
    const ntf = await db.notification.findFirstOrThrow({ where: { alertId: r.alertId } })
    expect(ntf).toMatchObject({ template: 'OFFICER_ALERT', status: 'SENT', fineId: null })
    const calls = send.mock.calls as unknown as Array<[{ body: string }]>
    expect(calls.at(-1)?.[0].body).toMatch(/con 2 multas impagas visto en Av\. Demo Norte con Calle 1 \(ejemplo\) hace menos de 1 min, a \d+ m de su posición/)
    expect(await db.auditLog.count({ where: { entity: 'Alert', entityId: r.alertId, action: 'ALERT_DISPATCHED' } })).toBe(1)
  })

  it('la misma placa otra vez en < 10 min queda SUPPRESSED, sin WhatsApp', async () => {
    const before = notifyOfficerAlert.mock.calls.length
    const r = await dispatchAlert(await sighting(vehicleA))
    expect(r).toEqual({ alertId: r.alertId, status: 'SUPPRESSED' })
    expect(notifyOfficerAlert.mock.calls.length).toBe(before)
  })

  it('repetir el mismo avistamiento devuelve la misma alerta (idempotente)', async () => {
    const s = await sighting(vehicleB)
    const a = await dispatchAlert(s)
    const calls = notifyOfficerAlert.mock.calls.length
    const b = await dispatchAlert(s)
    expect(b).toEqual(a)
    expect(notifyOfficerAlert.mock.calls.length).toBe(calls)
  })

  it('dos avistamientos simultáneos de la misma placa: una alerta y una suprimida', async () => {
    const vehicleC = await vehicleWithDebt('cc', 1)
    const [x, y] = await Promise.all([dispatchAlert(await sighting(vehicleC)), dispatchAlert(await sighting(vehicleC))])
    expect([x.status, y.status].sort()).toEqual(['SENT', 'SUPPRESSED'])
  })

  it('avistamiento inexistente o sin vehículo: error de dominio', async () => {
    await expect(dispatchAlert(`${RUN}_no_existe`)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const loose = await db.sighting.create({ data: { id: `${RUN}_loose`, cameraId: 'seed_cam_1', plateRead: 'ZZ999ZZ', seenAt: new Date() } })
    await expect(dispatchAlert(loose.id)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
})
