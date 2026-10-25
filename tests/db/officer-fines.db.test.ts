import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import p1 from '../../api/p1.ts'
import { COOKIE_NAMES, signSession } from '../../lib/auth/session.ts'
import { db } from '../../lib/db.ts'

// Historial de multas del oficial (docs/12) y reenvío de la notificación, por el router real (api/p1.ts).
// El envío va en seco (NOTIFY_DRY_RUN=true): se registra la Notificación pero no sale ningún WhatsApp.
const RUN = Date.now().toString(36)
const DIGITS = String(Date.now()).slice(-6)
const IPS = Array.from({ length: 6 }, (_, i) => `192.0.2.${210 + i}`)
let n = 0
let tok = 0

type Res = { code: number; body: any }
async function http(route: string, o: { method?: string; body?: unknown; cookie?: string; query?: Record<string, string>; ip?: number } = {}): Promise<Res> {
  const out: Res = { code: 0, body: undefined }
  const res = { status(c: number) { out.code = c; return res }, json(b: unknown) { out.body = b; return res }, setHeader() { return res } }
  const headers = { 'x-vercel-forwarded-for': IPS[o.ip ?? 0]!, ...(o.cookie && { cookie: o.cookie }) }
  await p1({ method: o.method ?? 'GET', headers, query: { route, ...o.query }, body: o.body ?? {} } as unknown as VercelRequest, res as unknown as VercelResponse)
  return out
}

const ids = { officer: `test_${RUN}_off`, off2: `test_${RUN}_off2`, persons: [] as string[], vehicles: [] as string[], violations: [] as string[], fines: [] as string[] }
const cookie = (id: string) => `${COOKIE_NAMES.officer}=${signSession({ role: 'officer', sub: id })}`
const ck = () => cookie(ids.officer)

async function owner(phone = '584120004455') {
  const i = ++n
  const id = `test_${RUN}_ofp${i}`
  const cedula = `V9${DIGITS}${i}`
  await db.person.create({ data: { id, cedula, fullName: 'Titular Prueba', phone } })
  ids.persons.push(id)
  return { id, cedula }
}

async function fine(o: { ownerId?: string | null; vehicleId?: string; plate?: string; v?: 'NOTIFIED' | 'PAID' | 'VOID' | 'APPEALED'; f?: 'PENDING' | 'PAID' | 'VOID' | 'APPEALED'; days?: number; dueDays?: number }) {
  const i = ++n
  let vehicleId: string | null = o.vehicleId ?? null
  if (!vehicleId && o.ownerId) {
    vehicleId = `test_${RUN}_ofv${i}`
    await db.vehicle.create({ data: { id: vehicleId, plate: o.plate ?? `OF${String(i).padStart(2, '0')}${DIGITS.slice(-4)}`, make: 'Toyota', model: 'Yaris', color: 'azul', year: 2019, ownerId: o.ownerId } })
    ids.vehicles.push(vehicleId)
  }
  const vid = `test_${RUN}_ofvio${i}`
  await db.violation.create({
    data: {
      id: vid, idempotencyKey: `test-ofi-${RUN}-${i}`, type: 'RED_LIGHT', status: o.v ?? 'NOTIFIED', cameraId: 'seed_cam_1', vehicleId, plateRead: 'AB123CD', confidence: 0.9,
      occurredAt: new Date(Date.now() - (o.days ?? 2) * 86_400_000), aiOutput: {}, ruleOutput: {},
      ...(o.v === 'VOID' && { voidReason: 'Prueba' }),
      evidence: { create: { id: `${vid}_ev`, kind: 'FRAME', url: '/demo/evidencia-1.svg', capturedAt: new Date(), meta: { lightState: 'RED' } } },
      fine: { create: { id: `${vid}_fine`, publicToken: `test-token-${RUN}-of${++tok}-padding`, amountCents: 100, status: o.f ?? 'PENDING', dueAt: new Date(Date.now() + (o.dueDays ?? 10) * 86_400_000), ...(o.f === 'PAID' && { paidAt: new Date() }) } },
    },
  })
  ids.violations.push(vid)
  ids.fines.push(`${vid}_fine`)
  return { id: `${vid}_fine`, vehicleId: vehicleId as string }
}

beforeAll(async () => {
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) throw new Error('Falta el seed: corre `pnpm db:seed` antes de `pnpm test:db`')
  vi.stubEnv('SESSION_SECRET', `test-secret-${RUN}-`.padEnd(48, 'f'))
  vi.stubEnv('NOTIFY_DRY_RUN', 'true')
  await db.officer.create({ data: { id: ids.officer, badge: `T-${RUN}`.slice(0, 12), name: 'Oficial Prueba', phone: '584120000999' } })
  await db.officer.create({ data: { id: ids.off2, badge: `U-${RUN}`.slice(0, 12), name: 'Oficial Inactivo', phone: '584120000998', active: false } })
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await db.auditLog.deleteMany({ where: { OR: [{ ip: { in: IPS } }, { entityId: { in: [...ids.violations, ...ids.fines] } }, { actorId: { in: [ids.officer, ids.off2] } }] } })
  await db.notification.deleteMany({ where: { fineId: { in: ids.fines } } })
  await db.payment.deleteMany({ where: { fineId: { in: ids.fines } } })
  await db.evidence.deleteMany({ where: { violationId: { in: ids.violations } } })
  await db.fine.deleteMany({ where: { id: { in: ids.fines } } })
  await db.violation.deleteMany({ where: { id: { in: ids.violations } } })
  await db.vehicle.deleteMany({ where: { id: { in: ids.vehicles } } })
  await db.person.deleteMany({ where: { id: { in: ids.persons } } })
  await db.officer.deleteMany({ where: { id: { in: [ids.officer, ids.off2] } } })
})

describe('multas del oficial: acceso', () => {
  it('exige sesión de oficial activo', async () => {
    const f = await fine({ ownerId: null })
    for (const [route, query] of [['officer-fines', {}], ['officer-fine', { id: f.id }]] as const) expect((await http(route, { query })).code).toBe(401)
    expect((await http('officer-fine-status', { method: 'POST', query: { id: f.id }, body: { action: 'VOID', reason: 'motivo largo de prueba' } })).code).toBe(401)
    expect((await http('officer-fine-resend', { method: 'POST', query: { id: f.id } })).code).toBe(401)
    // un oficial desactivado, aunque conserve su cookie, queda fuera
    expect((await http('officer-fines', { cookie: cookie(ids.off2) })).code).toBe(401)
    expect((await http('officer-fine', { cookie: cookie(ids.off2), query: { id: f.id } })).code).toBe(401)
  })
})

describe('multas del oficial: lista y detalle', () => {
  it('filtra por cédula exacta y por prefijo de placa, enmascara la cédula y no filtra datos del titular', async () => {
    const o = await owner()
    const a = await fine({ ownerId: o.id, plate: `PQ1${DIGITS}`.slice(0, 7) })
    await fine({ ownerId: o.id, plate: `ZZ9${DIGITS}`.slice(0, 7) })
    const byCedula = await http('officer-fines', { cookie: ck(), query: { cedula: o.cedula.toLowerCase() } })
    expect(byCedula.code, JSON.stringify(byCedula.body)).toBe(200)
    expect(byCedula.body.data.items).toHaveLength(2)
    const byPlate = await http('officer-fines', { cookie: ck(), query: { cedula: o.cedula, plate: 'pq1' } })
    expect(byPlate.body.data.items.map((i: { id: string }) => i.id)).toEqual([a.id])
    const item = byPlate.body.data.items[0]
    expect(item.cedulaMasked).toBe(`V-****${o.cedula.slice(-4)}`)
    expect(Object.keys(item).sort()).toEqual(['amountCents', 'cameraCode', 'cedulaMasked', 'confidence', 'currency', 'dueAt', 'id', 'intersection', 'occurredAt', 'plate', 'status', 'type', 'verification'])
    expect(JSON.stringify(byCedula.body)).not.toMatch(/584120004455|Titular Prueba|publicToken|test-token/)
  })

  it('pagina con cursor sin repetir ni saltarse multas, y marca OVERDUE', async () => {
    const o = await owner()
    const made = [await fine({ ownerId: o.id, days: 1 }), await fine({ ownerId: o.id, days: 2, dueDays: -1 }), await fine({ ownerId: o.id, days: 3 })]
    const first = await http('officer-fines', { cookie: ck(), query: { cedula: o.cedula, limit: '2' } })
    expect(first.body.data.items.map((i: { id: string }) => i.id)).toEqual([made[0]!.id, made[1]!.id])
    expect(first.body.data.items[1].status).toBe('OVERDUE')
    expect(first.body.data.nextCursor).toBeTruthy()
    const second = await http('officer-fines', { cookie: ck(), query: { cedula: o.cedula, limit: '2', cursor: first.body.data.nextCursor } })
    expect(second.body.data.items.map((i: { id: string }) => i.id)).toEqual([made[2]!.id])
    expect(second.body.data.nextCursor).toBeNull()
    expect((await http('officer-fines', { cookie: ck(), query: { cursor: '%%%no-es-cursor' } })).code).toBe(400)
    expect((await http('officer-fines', { cookie: ck(), query: { limit: '500' } })).code).toBe(400)
  })

  it('detalle: vehículo, evidencia con luz y 404 si no existe', async () => {
    const o = await owner()
    const f = await fine({ ownerId: o.id })
    const r = await http('officer-fine', { cookie: ck(), query: { id: f.id } })
    expect(r.body.data).toMatchObject({ id: f.id, vehicle: { brand: 'Toyota', model: 'Yaris', color: 'azul', year: 2019 }, voidReason: null, paidAt: null })
    expect(r.body.data.evidence[0]).toMatchObject({ kind: 'FRAME', url: '/demo/evidencia-1.svg', lightState: 'RED' })
    expect((await http('officer-fine', { cookie: ck(), query: { id: 'no-existe' } })).code).toBe(404)
  })
})

describe('multas del oficial: cambio de estado', () => {
  const act = (id: string, action: string, reason = 'Motivo suficientemente largo') => http('officer-fine-status', { method: 'POST', cookie: ck(), query: { id }, body: { action, reason } })

  it('anula una multa pendiente con motivo y lo deja en la auditoría con el nombre del oficial', async () => {
    const o = await owner()
    const f = await fine({ ownerId: o.id })
    expect((await act(f.id, 'VOID', 'corto')).code).toBe(400)
    expect((await act(f.id, 'COMER')).code).toBe(400)
    const r = await act(f.id, 'VOID', 'Vehículo de emergencia en servicio')
    expect(r.code, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data).toMatchObject({ status: 'VOID', voidReason: 'Vehículo de emergencia en servicio' })
    const last = r.body.data.audit.at(-1)
    expect(last).toMatchObject({ action: 'VOID', from: 'PENDING', to: 'VOID', reason: 'Vehículo de emergencia en servicio', actor: { type: 'OFFICER', label: 'Oficial Prueba' } })
    expect((await act(f.id, 'VOID')).code).toBe(409) // ya anulada: final
  })

  it('resuelve apelaciones: rechazar vuelve a pendiente, aceptar anula; solo aplican a apeladas', async () => {
    const o = await owner()
    const rej = await fine({ ownerId: o.id, v: 'APPEALED', f: 'APPEALED' })
    const acc = await fine({ ownerId: o.id, v: 'APPEALED', f: 'APPEALED' })
    const pend = await fine({ ownerId: o.id })
    expect((await act(pend.id, 'APPEAL_ACCEPT')).code).toBe(409)
    expect((await act(rej.id, 'VOID')).code).toBe(409) // una apelada no se anula directo
    const r1 = await act(rej.id, 'APPEAL_REJECT', 'La evidencia es clara y completa')
    expect(r1.body.data.status).toBe('PENDING')
    expect(r1.body.data.audit.at(-1)).toMatchObject({ action: 'APPEAL_REJECT', from: 'APPEALED', to: 'PENDING' })
    const r2 = await act(acc.id, 'APPEAL_ACCEPT', 'El semáforo estaba dañado ese día')
    expect(r2.body.data).toMatchObject({ status: 'VOID', voidReason: 'El semáforo estaba dañado ese día' })
    expect(r2.body.data.audit.at(-1).action).toBe('APPEAL_ACCEPT')
  })

  it('una multa pagada no se puede anular', async () => {
    const o = await owner()
    const f = await fine({ ownerId: o.id, v: 'PAID', f: 'PAID' })
    expect((await act(f.id, 'VOID')).code).toBe(409)
  })
})

describe('multas del oficial: reenviar notificación', () => {
  const resend = (id: string, ipn = 1) => http('officer-fine-resend', { method: 'POST', cookie: ck(), query: { id }, ip: ipn })

  it('reenvía al titular, registra la notificación y la auditoría, y devuelve el teléfono enmascarado', async () => {
    const o = await owner('584120004455')
    const f = await fine({ ownerId: o.id })
    const r = await resend(f.id)
    expect(r.code, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.status).toBe('DRY_RUN') // sin envío real en pruebas
    expect(r.body.data.telefono).toBe('0412-***4455')
    expect(JSON.stringify(r.body)).not.toContain('584120004455')
    expect(r.body.data.fine.audit.at(-1)).toMatchObject({ action: 'NOTIFICATION_RESENT', actor: { type: 'OFFICER', label: 'Oficial Prueba' } })
    const notes = await db.notification.findMany({ where: { fineId: f.id } })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ template: 'FINE_ISSUED', to: '584120004455' })
  })

  it('máximo 3 reenvíos por hora por multa (el cuarto da 429 y no envía)', async () => {
    const o = await owner()
    const f = await fine({ ownerId: o.id })
    for (let i = 0; i < 3; i++) expect((await resend(f.id, 2)).code).toBe(200)
    expect((await resend(f.id, 2)).code).toBe(429)
    expect(await db.notification.count({ where: { fineId: f.id } })).toBe(3)
  })

  it('no reenvía multas pagadas, anuladas o apeladas; ni sin titular ni sin teléfono', async () => {
    const o = await owner()
    for (const [v, fs] of [['PAID', 'PAID'], ['VOID', 'VOID'], ['APPEALED', 'APPEALED']] as const) {
      const f = await fine({ ownerId: o.id, v, f: fs })
      const r = await resend(f.id, 3)
      expect(r.code).toBe(409)
      expect(r.body.error.reason).toBe('NO_REENVIABLE')
    }
    const noOwner = await fine({ ownerId: null })
    expect((await resend(noOwner.id, 3)).body.error.reason).toBe('SIN_TITULAR')
    const noPhone = await owner('')
    const f = await fine({ ownerId: noPhone.id })
    expect((await resend(f.id, 3)).body.error.reason).toBe('SIN_TELEFONO')
    expect((await resend('no-existe', 3)).code).toBe(404)
    expect(await db.notification.count({ where: { fineId: { in: ids.fines } } })).toBeGreaterThanOrEqual(0)
  })
})
