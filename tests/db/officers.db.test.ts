import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import ack from '../../api/_p3/alert-ack.ts'
import alerts from '../../api/_p3/officer-alerts.ts'
import location from '../../api/_p3/officer-location.ts'
import session from '../../api/_p3/officer-session.ts'
import { db } from '../../lib/db.ts'
import { call, clearTestAttempts, sessionCookieFrom } from './_http.ts'

// APIs del oficial contra la base real (`pnpm test:db`), llamando a los handlers con peticiones simuladas.
const RUN = `test_ofc_${Date.now().toString(36)}`
const sfx = Date.now().toString().slice(-4)
const PASS = 'codigo-oficial-de-prueba'
const BADGE = `T-${sfx}-A`
let previousPass: string | undefined
let mineAlertId = ''
let otherAlertId = ''


beforeAll(async () => {
  await clearTestAttempts(db)
  previousPass = process.env.OFFICER_PASSCODE
  process.env.OFFICER_PASSCODE = PASS
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) throw new Error('Falta el seed: corre `pnpm db:seed`')
  await db.officer.create({ data: { id: `${RUN}_a`, badge: BADGE, name: 'Oficial Prueba A (ejemplo)', phone: '584120000201', onDuty: false } })
  await db.officer.create({ data: { id: `${RUN}_b`, badge: `T-${sfx}-B`, name: 'Oficial Prueba B (ejemplo)', phone: '584120000202', onDuty: true } })
  await db.person.create({ data: { id: `${RUN}_per`, cedula: `V6${sfx}123`, fullName: 'Dueño Secreto (ejemplo)', phone: '584120000299' } })
  await db.vehicle.create({ data: { id: `${RUN}_veh`, plate: `OF${sfx}AA`, make: 'Ford', model: 'Explorer', color: 'blanca', ownerId: `${RUN}_per` } })
  for (const [i, officerId] of [[1, `${RUN}_a`], [2, `${RUN}_b`]] as const) {
    await db.sighting.create({ data: { id: `${RUN}_s${i}`, cameraId: 'seed_cam_1', vehicleId: `${RUN}_veh`, plateRead: `OF${sfx}AA`, seenAt: new Date() } })
    const a = await db.alert.create({ data: { vehicleId: `${RUN}_veh`, sightingId: `${RUN}_s${i}`, officerId, distanceM: 420, unpaidCount: 2, status: 'SENT' } })
    if (i === 1) mineAlertId = a.id
    else otherAlertId = a.id
  }
})

afterAll(async () => {
  process.env.OFFICER_PASSCODE = previousPass
  await db.auditLog.deleteMany({ where: { OR: [{ entityId: { startsWith: RUN } }, { entityId: { in: [mineAlertId, otherAlertId] } }] } })
  await db.alert.deleteMany({ where: { sightingId: { startsWith: RUN } } })
  await db.sighting.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.officerLocation.deleteMany({ where: { officerId: { startsWith: RUN } } })
  await db.officer.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.vehicle.deleteMany({ where: { id: { startsWith: RUN } } })
  await db.person.deleteMany({ where: { id: { startsWith: RUN } } })
  await clearTestAttempts(db)
  await db.$disconnect()
})

describe('APIs del oficial (docs/04 §6)', () => {
  let cookie = ''

  it('sesión: código o placa incorrectos = 401; correctos = cookie firmada', async () => {
    expect((await call(session, { method: 'POST', body: { passcode: 'mal', badge: BADGE } })).statusCode).toBe(401)
    expect((await call(session, { method: 'POST', body: { passcode: PASS, badge: 'NO-EXISTE' } })).statusCode).toBe(401)
    const ok = await call(session, { method: 'POST', body: { passcode: PASS, badge: BADGE.toLowerCase() } })
    expect(ok.statusCode).toBe(200)
    expect(ok.body).toMatchObject({ ok: true, data: { id: `${RUN}_a`, badge: BADGE } })
    expect(ok.headers['set-cookie']).toMatch(/HttpOnly; SameSite=Lax/)
    cookie = sessionCookieFrom(ok)
    expect(cookie).not.toBe('')
  })

  it('ubicación: sin cookie 401; con cookie guarda la posición y pone en servicio', async () => {
    const body = { lat: 10.4997, lng: -66.853, accuracyM: 20, onDuty: true }
    expect((await call(location, { method: 'POST', body })).statusCode).toBe(401)
    const ok = await call(location, { method: 'POST', body, cookie })
    expect(ok.statusCode).toBe(200)
    expect(ok.body).toMatchObject({ ok: true, data: { onDuty: true } })
    expect((await db.officer.findUniqueOrThrow({ where: { id: `${RUN}_a` } })).onDuty).toBe(true)
    expect(await db.officerLocation.count({ where: { officerId: `${RUN}_a` } })).toBe(1)
    expect(await db.auditLog.count({ where: { entityId: `${RUN}_a`, action: 'OFFICER_DUTY' } })).toBe(1)
  })

  it('alertas: solo las propias, sin datos del dueño', async () => {
    const res = await call(alerts, { query: { id: `${RUN}_a` }, cookie })
    expect(res.statusCode).toBe(200)
    const items = (res.body as { data: { items: Array<Record<string, unknown>> } }).data.items
    expect(items.map((i) => i.id)).toEqual([mineAlertId])
    expect(items[0]).toMatchObject({ status: 'SENT', plate: `OF${sfx}AA`, vehicle: 'Ford Explorer blanca', unpaidCount: 2, distanceM: 420, camera: { code: 'CAM-001' } })
    const text = JSON.stringify(res.body)
    expect(text).not.toContain('Dueño Secreto')
    expect(text).not.toContain('584120000299')
    expect((await call(alerts, { query: { id: `${RUN}_b` }, cookie })).statusCode).toBe(401)
  })

  it('acuse: confirma la propia (idempotente) y no la de otro oficial', async () => {
    const first = await call(ack, { method: 'POST', query: { id: mineAlertId }, cookie })
    expect(first.body).toMatchObject({ ok: true, data: { status: 'ACKNOWLEDGED' } })
    const again = await call(ack, { method: 'POST', query: { id: mineAlertId }, cookie })
    expect(again.statusCode).toBe(200)
    const row = await db.alert.findUniqueOrThrow({ where: { id: mineAlertId } })
    expect(row.status).toBe('ACKNOWLEDGED')
    expect(row.ackAt).not.toBeNull()
    expect(await db.auditLog.count({ where: { entityId: mineAlertId, action: 'ALERT_ACK' } })).toBe(1)
    expect((await call(ack, { method: 'POST', query: { id: otherAlertId }, cookie })).statusCode).toBe(404)
  })

  it('cerrar sesión borra la cookie', async () => {
    const res = await call(session, { method: 'DELETE' })
    expect(res.headers['set-cookie']).toMatch(/vc_officer=; .*Max-Age=0/)
  })
})
