import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../lib/db.ts'
import { portalLookup } from '../../lib/domain/portal.ts'
import { getPublicFine } from '../../lib/domain/queries.ts'
import { applyDemoCitizen, buildDemoCitizen } from '../../prisma/seed-demo-citizen.ts'

const RUN = Date.now().toString(36)
const SUFFIX = String(Date.now() % 100_000).padStart(5, '0')
const CEDULA = `V9${String(Date.now()).slice(-7)}` // inventada; nunca una real
const PREFIX = `test_${RUN}_dc`
const PLATES = [`TD${SUFFIX}`, `TE${SUFFIX}`] as const
const IP = '192.0.2.99'

const build = (over: Partial<NonNullable<Parameters<typeof buildDemoCitizen>[0]>> = {}) =>
  buildDemoCitizen({ cedula: CEDULA, now: new Date(), idPrefix: PREFIX, plates: PLATES, ...over })!

beforeAll(async () => {
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) throw new Error('Falta el seed: corre `pnpm db:seed` antes de `pnpm test:db`')
})

afterAll(async () => {
  const vio = await db.violation.findMany({ where: { id: { startsWith: PREFIX } }, select: { id: true } })
  const ids = vio.map((v) => v.id)
  await db.auditLog.deleteMany({ where: { ip: IP } })
  await db.payment.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await db.evidence.deleteMany({ where: { violationId: { in: ids } } })
  await db.fine.deleteMany({ where: { violationId: { in: ids } } })
  await db.violation.deleteMany({ where: { id: { in: ids } } })
  await db.vehicle.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await db.person.deleteMany({ where: { id: { startsWith: PREFIX } } })
  await db.$disconnect()
})

describe('applyDemoCitizen', () => {
  it('siembra el titular, sus vehículos y sus 5 multas, y devuelve las impagas con su token', async () => {
    const out = await applyDemoCitizen(db, build({ phone: '584129999000' }))
    expect(out.applied).toBe(true)
    expect(out.pending).toHaveLength(3)
    expect(out.pending.map((p) => p.status).sort()).toEqual(['OVERDUE', 'PENDING', 'PENDING'])
    expect(out.pending.every((p) => /^[A-Za-z0-9_-]{24}$/.test(p.token))).toBe(true)

    expect(await db.person.findUniqueOrThrow({ where: { id: `${PREFIX}_per` } })).toMatchObject({ cedula: CEDULA, fullName: 'Persona Demo', phone: '584129999000' })
    expect(await db.vehicle.count({ where: { id: { startsWith: PREFIX } } })).toBe(2)
    expect(await db.fine.count({ where: { id: { startsWith: PREFIX } } })).toBe(5)
    expect(await db.payment.count({ where: { id: { startsWith: PREFIX } } })).toBe(1)
  })

  it('el portal y el link de pago funcionan con esa cédula', async () => {
    const out = await applyDemoCitizen(db, build())
    const dto = await portalLookup(db, { cedula: CEDULA, ip: IP })
    expect(dto.cedulaMasked).toBe(`V-****${CEDULA.slice(-4)}`)
    expect(dto.summary).toEqual({ total: 5, pending: 3, paid: 1 })
    expect(dto.items.map((i) => i.status).sort()).toEqual(['OVERDUE', 'PAID', 'PENDING', 'PENDING', 'VOID'])
    expect(JSON.stringify(dto)).not.toContain(CEDULA)

    const fine = await getPublicFine(db, out.pending.find((p) => p.status === 'PENDING')!.token)
    expect(fine).toMatchObject({ status: 'PENDING', overdue: false, type: 'RED_LIGHT', verification: 'AUTO' })
    expect(fine.plateMasked).toMatch(/^T[DE]\*\*\*\d{2}$/)
  })

  it('es idempotente: los tokens se conservan y las multas modificadas por la demo se restauran', async () => {
    const first = await applyDemoCitizen(db, build())
    const tokens = (r: typeof first) => r.pending.map((p) => p.token).sort()

    // La demo "paga" una multa y anula otra.
    await db.fine.update({ where: { id: `${PREFIX}_fine_1` }, data: { status: 'PAID', paidAt: new Date() } })
    await db.violation.update({ where: { id: `${PREFIX}_vio_1` }, data: { status: 'PAID' } })
    await db.fine.update({ where: { id: `${PREFIX}_fine_3` }, data: { status: 'VOID' } })

    const again = await applyDemoCitizen(db, build())
    expect(tokens(again)).toEqual(tokens(first)) // mismos links de pago
    expect((await db.fine.findUniqueOrThrow({ where: { id: `${PREFIX}_fine_1` } })).status).toBe('PENDING')
    expect((await db.fine.findUniqueOrThrow({ where: { id: `${PREFIX}_fine_3` } })).status).toBe('PENDING')
    expect((await db.violation.findUniqueOrThrow({ where: { id: `${PREFIX}_vio_1` } })).status).toBe('NOTIFIED')
    expect(await db.fine.count({ where: { id: { startsWith: PREFIX } } })).toBe(5)
    expect(await db.person.count({ where: { cedula: CEDULA } })).toBe(1)
  })

  it('si la cédula ya pertenece a otra persona, no la modifica', async () => {
    const owner = await db.person.findUniqueOrThrow({ where: { id: 'seed_per_1' } })
    const before = JSON.stringify(owner)
    const out = await applyDemoCitizen(db, build({ cedula: owner.cedula, idPrefix: `${PREFIX}_x`, plates: [`TF${SUFFIX}`, `TG${SUFFIX}`] }))
    expect(out).toMatchObject({ applied: false, pending: [] })
    expect(out.reason).toContain('otra persona')
    expect(JSON.stringify(await db.person.findUniqueOrThrow({ where: { id: 'seed_per_1' } }))).toBe(before)
    expect(await db.person.count({ where: { id: { startsWith: `${PREFIX}_x` } } })).toBe(0)
  })
})
