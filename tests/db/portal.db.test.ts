import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import lookupHandler from '../../api/portal/lookup.ts'
import type { PortalLookupDTO } from '../../lib/contracts/index.ts'
import { db } from '../../lib/db.ts'
import { portalLookup } from '../../lib/domain/portal.ts'

const RUN = Date.now().toString(36)
const DIGITS = String(Date.now()).slice(-7) // cédula de prueba: V9<7 dígitos>
const CEDULA = `V9${DIGITS}`
const OTHER_CEDULA = `V8${DIGITS}`
const NOBODY = `V7${DIGITS}`
const PERSON = { fullName: `Persona Privada ${RUN}`, phone: '584127777777', email: `privado-${RUN}@example.com` }
const PLATE = `TP${String(Date.now() % 100_000).padStart(5, '0')}`
const ips = { limit: '192.0.2.10', burst: '192.0.2.11', free: '192.0.2.12', window: '192.0.2.13', plain: '192.0.2.14' }
const id = (s: string) => `test_${RUN}_${s}`
const violationIds: string[] = []
const fineTokens: string[] = []

type Res = { code: number; body: any; headers: Record<string, string> }
async function call(req: Record<string, unknown>): Promise<Res> {
  const out: Res = { code: 0, body: undefined, headers: {} }
  const res = {
    status(c: number) { out.code = c; return res },
    json(b: unknown) { out.body = b; return res },
    setHeader(k: string, v: string) { out.headers[k] = v; return res },
  }
  await lookupHandler({ method: 'POST', headers: {}, query: {}, ...req } as unknown as VercelRequest, res as unknown as VercelResponse)
  return out
}
const lookup = (cedula: string, ip: string) => call({ body: { cedula }, headers: { 'x-vercel-forwarded-for': ip } })
const data = (r: Res) => r.body.data as PortalLookupDTO

async function violation(key: string, owner: 'main' | 'other', occurredDaysAgo: number, fine?: { status: 'PENDING' | 'PAID' | 'VOID' | 'APPEALED'; dueDays: number }) {
  const vid = id(key)
  const token = `test-token-${RUN}-${key}`.padEnd(30, '0')
  await db.violation.create({
    data: {
      id: vid, idempotencyKey: `test-portal-${RUN}-${key}`, type: 'RED_LIGHT', status: fine ? 'NOTIFIED' : 'NEEDS_REVIEW', reviewReason: fine ? null : 'LOW_CONFIDENCE',
      cameraId: 'seed_cam_1', vehicleId: owner === 'main' ? id('veh') : id('veh2'), plateRead: PLATE, confidence: 0.9,
      occurredAt: new Date(Date.now() - occurredDaysAgo * 86_400_000), aiOutput: {}, ruleOutput: {},
      ...(fine && { fine: { create: { id: `${vid}_fine`, publicToken: token, amountCents: 100, status: fine.status, dueAt: new Date(Date.now() + fine.dueDays * 86_400_000) } } }),
    },
  })
  violationIds.push(vid)
  if (fine) fineTokens.push(token)
}

beforeAll(async () => {
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) throw new Error('Falta el seed: corre `pnpm db:seed` antes de `pnpm test:db`')
  await db.person.create({ data: { id: id('per'), cedula: CEDULA, ...PERSON } })
  await db.person.create({ data: { id: id('per2'), cedula: OTHER_CEDULA, fullName: 'Otra Persona', phone: '584128888888' } })
  await db.vehicle.create({ data: { id: id('veh'), plate: PLATE, make: 'Toyota', model: 'Corolla', color: 'gris', ownerId: id('per') } })
  await db.vehicle.create({ data: { id: id('veh2'), plate: `${PLATE.slice(0, 6)}Q`, make: 'Ford', model: 'Ka', color: 'rojo', ownerId: id('per2') } })

  await violation('a', 'main', 2, { status: 'PENDING', dueDays: 20 }) // pendiente vigente
  await violation('b', 'main', 50, { status: 'PENDING', dueDays: -20 }) // pendiente vencida
  await violation('c', 'main', 30, { status: 'PAID', dueDays: -1 })
  await violation('d', 'main', 40, { status: 'VOID', dueDays: 5 })
  await violation('e', 'main', 10, { status: 'APPEALED', dueDays: 5 })
  await violation('f', 'main', 1) // en revisión: aún no es una multa, no debe aparecer
  await violation('g', 'other', 3, { status: 'PENDING', dueDays: 20 }) // de otra persona
})

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { OR: [{ ip: { startsWith: '192.0.2.' } }, { entityId: { in: violationIds } }] } })
  await db.evidence.deleteMany({ where: { violationId: { in: violationIds } } })
  await db.fine.deleteMany({ where: { violationId: { in: violationIds } } })
  await db.violation.deleteMany({ where: { id: { in: violationIds } } })
  await db.vehicle.deleteMany({ where: { id: { startsWith: `test_${RUN}` } } })
  await db.person.deleteMany({ where: { id: { startsWith: `test_${RUN}` } } })
  await db.$disconnect()
})

describe('POST /api/portal/lookup', () => {
  it('devuelve el historial del titular: resumen, orden, estados y montos', async () => {
    const r = await lookup(CEDULA, ips.plain)
    expect(r.code).toBe(200)
    expect(r.headers['Cache-Control']).toBe('no-store')
    const dto = data(r)
    expect(dto.cedulaMasked).toBe(`V-****${DIGITS.slice(-4)}`)
    // 5 multas (la de revisión no cuenta): 2 pendientes (una vencida), 1 pagada, 1 anulada, 1 apelada
    expect(dto.summary).toEqual({ total: 5, pending: 2, paid: 1 })
    expect(dto.items.map((i) => i.status)).toEqual(['PENDING', 'APPEALED', 'PAID', 'VOID', 'OVERDUE']) // por fecha, la más reciente primero
    expect(dto.items[0]).toMatchObject({ type: 'RED_LIGHT', amountCents: 100, currency: 'VES', fineToken: null, plateMasked: `${PLATE.slice(0, 2)}***${PLATE.slice(-2)}` })
  })

  it('acepta la cédula con puntos, guiones, minúsculas y sin prefijo', async () => {
    const forms = [CEDULA, `v-${DIGITS.slice(0, 1)}.${DIGITS.slice(1, 4)}.${DIGITS.slice(4)}`.replace('v-', 'v-9'), DIGITS.padStart(8, '9'), `V-9${DIGITS}`]
    const outs = await Promise.all(forms.map((f) => lookup(f, ips.plain)))
    for (const [i, o] of outs.entries()) {
      expect(o.code, forms[i]).toBe(200)
      expect(data(o).summary.total, forms[i]).toBe(5)
    }
  })

  it('cada titular ve solo sus multas', async () => {
    const dto = data(await lookup(OTHER_CEDULA, ips.plain))
    expect(dto.summary).toEqual({ total: 1, pending: 1, paid: 0 })
    expect(dto.items[0]!.plateMasked).not.toContain(PLATE.slice(2, 5))
  })

  it('NO expone nombre, teléfono, correo, cédula completa, placa completa ni tokens de multa', async () => {
    const json = JSON.stringify((await lookup(CEDULA, ips.plain)).body)
    for (const secret of [PERSON.fullName, PERSON.phone, PERSON.email, CEDULA, DIGITS, PLATE, 'Corolla', ...fineTokens]) {
      expect(json, `no debe filtrar ${secret}`).not.toContain(secret)
    }
  })

  it('una cédula sin multas o inexistente responde 200 con la misma forma y todo en cero', async () => {
    const known = data(await lookup(CEDULA, ips.plain))
    const none = await lookup(NOBODY, ips.plain)
    expect(none.code).toBe(200)
    expect(data(none)).toEqual({ cedulaMasked: `V-****${DIGITS.slice(-4)}`, summary: { total: 0, pending: 0, paid: 0 }, items: [] })
    expect(Object.keys(data(none)).sort()).toEqual(Object.keys(known).sort())
    expect(Object.keys(data(none).summary).sort()).toEqual(Object.keys(known.summary).sort())
  })

  it('valida la entrada (400) y solo acepta POST', async () => {
    for (const cedula of ['', 'abc', '12', 'V1', 'X99000001', 'V12345678901', '<script>']) {
      const r = await call({ body: { cedula }, headers: { 'x-vercel-forwarded-for': ips.plain } })
      expect(r.code, cedula).toBe(400)
      expect(r.body.error.code).toBe('VALIDATION_ERROR')
    }
    expect((await call({ body: {} })).code).toBe(400)
    expect((await call({ method: 'GET' })).code).toBe(400)
  })

  it('audita cada consulta con la IP y una huella de la cédula, nunca la cédula', async () => {
    const ip = ips.free
    await lookup(CEDULA, ip)
    const logs = await db.auditLog.findMany({ where: { action: 'PORTAL_LOOKUP', ip } })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ actorType: 'CITIZEN', entity: 'Person' })
    expect(logs[0]!.entityId).toMatch(/^[0-9a-f]{16}$/)
    const dump = JSON.stringify(logs[0])
    expect(dump).not.toContain(DIGITS)
    expect(dump).not.toContain(PERSON.fullName)
  })
})

describe('límite de consultas: 10 por IP cada 10 minutos', () => {
  it('la consulta 11 desde la misma IP recibe 429 RATE_LIMITED y no se registra', async () => {
    const ip = ips.limit
    for (let i = 1; i <= 10; i++) expect((await lookup(CEDULA, ip)).code, `consulta ${i}`).toBe(200)
    const blocked = await lookup(CEDULA, ip)
    expect(blocked.code).toBe(429)
    expect(blocked.body).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } })
    expect(await db.auditLog.count({ where: { action: 'PORTAL_LOOKUP', ip } })).toBe(10) // las bloqueadas no alargan la ventana
    expect((await lookup(NOBODY, ip)).code).toBe(429) // sea cual sea la cédula
    expect((await lookup(CEDULA, ips.free)).code).toBe(200) // otra IP no se ve afectada
  })

  it('15 consultas simultáneas desde una IP: exactamente 10 pasan y 5 se bloquean', async () => {
    const ip = ips.burst
    const outs = await Promise.all(Array.from({ length: 15 }, () => lookup(CEDULA, ip)))
    expect(outs.filter((o) => o.code === 200)).toHaveLength(10)
    expect(outs.filter((o) => o.code === 429)).toHaveLength(5)
    expect(await db.auditLog.count({ where: { action: 'PORTAL_LOOKUP', ip } })).toBe(10)
  })

  it('la ventana se desliza: pasados 10 minutos la IP vuelve a poder consultar', async () => {
    const ip = ips.window
    for (let i = 0; i < 10; i++) await portalLookup(db, { cedula: CEDULA, ip })
    await expect(portalLookup(db, { cedula: CEDULA, ip })).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    const later = new Date(Date.now() + 10 * 60_000 + 5_000)
    await expect(portalLookup(db, { cedula: CEDULA, ip }, later)).resolves.toMatchObject({ summary: { total: 5 } })
  })
})
