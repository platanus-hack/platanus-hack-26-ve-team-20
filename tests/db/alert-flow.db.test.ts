import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import ack from '../../api/alerts/[id]/ack.ts'
import alerts from '../../api/officers/[id]/alerts.ts'
import location from '../../api/officers/location.ts'
import session from '../../api/officers/session.ts'
import { createDispatcher } from '../../lib/alerts/dispatch.ts'
import { db } from '../../lib/db.ts'
import { createNotifier } from '../../lib/notify/notifier.ts'
import { createPrismaNotificationRepo } from '../../lib/notify/prisma-repo.ts'
import { call, clearTestAttempts, sessionCookieFrom } from './_http.ts'

// E2E de HU-06 a nivel API + DB (lo que hará tests/e2e/officer-alert.spec.ts cuando existan /oficial
// de P4, /api/sightings de P2 y Playwright de P1): el oficial inicia sesión y comparte ubicación, una
// cámara ve un vehículo con deuda, la alerta le llega (WhatsApp falso) y la confirma desde su lista.
const RUN = `test_flow_${Date.now().toString(36)}`
const sfx = Date.now().toString().slice(-4)
const PASS = 'codigo-oficial-flujo'
const BADGE = `F-${sfx}`
const CAM = { lat: 10.4961, lng: -66.853 } // intersección de CAM-001 en el seed
const send = vi.fn(async () => ({ status: 'SENT' as const, providerId: `wamid.${RUN}` }))
const notifier = createNotifier({ repo: createPrismaNotificationRepo(db), send, appBaseUrl: 'https://example.test' })
const { dispatchAlert } = createDispatcher({ db, notifyOfficerAlert: notifier.notifyOfficerAlert })
let previousPass: string | undefined
let n = 0

async function vehicleWithDebt(tag: string, unpaid: number) {
  const id = `${RUN}_${tag}`
  await db.person.create({ data: { id: `${id}_per`, cedula: `V5${sfx}${tag.charCodeAt(0)}`.slice(0, 10), fullName: 'Dueño Flujo (ejemplo)', phone: '584120000397' } })
  await db.vehicle.create({ data: { id: `${id}_veh`, plate: `${tag.toUpperCase()}${sfx}ZT`, make: 'Toyota', model: 'Hilux', color: 'roja', ownerId: `${id}_per` } })
  for (let i = 0; i < unpaid; i++) {
    await db.violation.create({
      data: {
        id: `${id}_vio${i}`, idempotencyKey: `test-${id}-${i}`, type: 'RED_LIGHT', status: 'NOTIFIED', cameraId: 'seed_cam_1', vehicleId: `${id}_veh`,
        confidence: 0.9, occurredAt: new Date(), aiOutput: {}, ruleOutput: {},
        fine: { create: { id: `${id}_fine${i}`, publicToken: `${id}-tok-${i}-pad`, amountCents: 100, dueAt: new Date(Date.now() + 86_400_000) } },
      },
    })
  }
  return { vehicleId: `${id}_veh`, plate: `${tag.toUpperCase()}${sfx}ZT` }
}

/** Lo que hará registerSighting (P1) cuando P2 llame a /api/sightings: guardar el avistamiento. */
const sight = async (vehicleId: string, plate: string) =>
  (await db.sighting.create({ data: { id: `${RUN}_s${++n}`, cameraId: 'seed_cam_1', vehicleId, plateRead: plate, seenAt: new Date() } })).id

beforeAll(async () => {
  await clearTestAttempts(db)
  previousPass = process.env.OFFICER_PASSCODE
  process.env.OFFICER_PASSCODE = PASS
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) throw new Error('Falta el seed: corre `pnpm db:seed`')
  await db.officer.create({ data: { id: `${RUN}_off`, badge: BADGE, name: 'Oficial Flujo (ejemplo)', phone: '584120000301', onDuty: false } })
})

afterAll(async () => {
  process.env.OFFICER_PASSCODE = previousPass
  const alertIds = (await db.alert.findMany({ where: { sightingId: { startsWith: RUN } }, select: { id: true } })).map((a) => a.id)
  const ntfIds = (await db.notification.findMany({ where: { alertId: { in: alertIds } }, select: { id: true } })).map((x) => x.id)
  await db.auditLog.deleteMany({ where: { OR: [{ entityId: { startsWith: RUN } }, { entityId: { in: [...alertIds, ...ntfIds] } }] } })
  await db.notification.deleteMany({ where: { id: { in: ntfIds } } })
  await db.alert.deleteMany({ where: { id: { in: alertIds } } })
  await db.sighting.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.officerLocation.deleteMany({ where: { officerId: { startsWith: RUN } } })
  await db.officer.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.fine.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.violation.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.vehicle.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.person.deleteMany({ where: { id: { startsWith: RUN } } })
  await clearTestAttempts(db)
  await db.$disconnect()
})

describe('HU-06: alerta al oficial de punta a punta', () => {
  let cookie = ''
  let alertId = ''
  const officerId = `${RUN}_off`

  it('1. el oficial inicia sesión y queda en servicio cerca de la cámara', async () => {
    const login = await call(session, { method: 'POST', body: { passcode: PASS, badge: BADGE } })
    expect(login.statusCode).toBe(200)
    cookie = sessionCookieFrom(login)
    const loc = await call(location, { method: 'POST', cookie, body: { lat: CAM.lat + 0.0003, lng: CAM.lng, accuracyM: 15, onDuty: true } })
    expect(loc.body).toMatchObject({ ok: true, data: { onDuty: true } })
  })

  it('2. una cámara ve un vehículo con 2 multas impagas: la alerta le llega en menos de 5 s', async () => {
    const car = await vehicleWithDebt('xy', 2)
    const started = Date.now()
    const r = await dispatchAlert(await sight(car.vehicleId, car.plate))
    expect(Date.now() - started).toBeLessThan(5000)
    expect(r).toMatchObject({ status: 'SENT', officerId })
    alertId = r.alertId

    const calls = send.mock.calls as unknown as Array<[{ to: string; body: string }]>
    expect(calls.at(-1)?.[0]).toMatchObject({ to: '584120000301' })
    expect(calls.at(-1)?.[0].body).toContain(`vehículo ${car.plate} (Toyota Hilux roja) con 2 multas impagas`)
  })

  it('3. la alerta aparece en su lista con placa, vehículo, cámara y distancia, sin datos del dueño', async () => {
    const res = await call(alerts, { cookie, query: { id: officerId } })
    const items = (res.body as { data: { items: Array<Record<string, unknown>> } }).data.items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: alertId, status: 'SENT', vehicle: 'Toyota Hilux roja', unpaidCount: 2, camera: { code: 'CAM-001', lat: CAM.lat, lng: CAM.lng } })
    expect(JSON.stringify(res.body)).not.toMatch(/Dueño Flujo|584120000397|V5\d+/)
  })

  it('4. el oficial pulsa "Recibido"', async () => {
    const res = await call(ack, { method: 'POST', cookie, query: { id: alertId } })
    expect(res.body).toMatchObject({ ok: true, data: { status: 'ACKNOWLEDGED' } })
    const list = await call(alerts, { cookie, query: { id: officerId } })
    expect((list.body as { data: { items: Array<{ status: string }> } }).data.items[0]?.status).toBe('ACKNOWLEDGED')
  })

  it('5. la misma placa vista otra vez en 10 min no vuelve a alertar', async () => {
    const before = send.mock.calls.length
    const car = await db.vehicle.findFirstOrThrow({ where: { id: `${RUN}_xy_veh` } })
    expect((await dispatchAlert(await sight(car.id, car.plate))).status).toBe('SUPPRESSED')
    expect(send.mock.calls.length).toBe(before)
    const list = await call(alerts, { cookie, query: { id: officerId } })
    expect((list.body as { data: { items: unknown[] } }).data.items).toHaveLength(1)
  })

  it('6. fuera de servicio, el oficial ya no recibe alertas nuevas', async () => {
    await call(location, { method: 'POST', cookie, body: { lat: CAM.lat + 0.0003, lng: CAM.lng, onDuty: false } })
    const other = await vehicleWithDebt('qw', 1)
    const r = await dispatchAlert(await sight(other.vehicleId, other.plate))
    // en la base compartida puede haber otro oficial en servicio cerca; lo que importa es que no sea este
    expect(r.officerId).not.toBe(officerId)
  })
})
