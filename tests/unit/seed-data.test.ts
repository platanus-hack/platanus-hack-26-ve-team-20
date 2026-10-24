import { describe, expect, it } from 'vitest'
import { buildSeed, SEED_PREFIX } from '../../prisma/seed-data.ts'
import { isPlausiblePlate, normalizeCedula, normalizePlate } from '../../lib/contracts/index.ts'

const now = new Date('2026-10-24T15:00:00.000Z')
const seed = buildSeed({ now })

describe('seed: cantidades de docs/03 §5', () => {
  it('3 intersecciones, 4 cámaras, 8 personas, 10 vehículos, 12 violaciones, 3 oficiales, 3 ubicaciones', () => {
    expect(seed.intersections).toHaveLength(3)
    expect(seed.cameras.map((c) => c.code)).toEqual(['CAM-001', 'CAM-002', 'CAM-003', 'CAM-004'])
    expect(seed.persons).toHaveLength(8)
    expect(seed.vehicles).toHaveLength(10)
    expect(seed.violations).toHaveLength(12)
    expect(seed.officers.map((o) => o.badge)).toEqual(['OF-0001', 'OF-0002', 'OF-0003'])
    expect(seed.officerLocations).toHaveLength(3)
  })

  it('historial mixto: pagadas, notificadas (vencidas y vigentes), anulada y 2 en revisión', () => {
    const by = (s: string) => seed.violations.filter((v) => v.status === s)
    expect(by('PAID')).toHaveLength(4)
    expect(by('VOID')).toHaveLength(1)
    expect(by('NEEDS_REVIEW')).toHaveLength(2)
    const notified = by('NOTIFIED').filter((v) => v.fine?.status === 'PENDING')
    expect(notified.filter((v) => v.fine!.dueAt < now)).toHaveLength(2) // vencidas
    expect(notified.filter((v) => v.fine!.dueAt >= now)).toHaveLength(3) // vigentes (2 de V-99000002 + 1)
    expect(by('NEEDS_REVIEW').map((v) => v.reviewReason).sort()).toEqual(['LOW_CONFIDENCE', 'PLATE_NOT_FOUND'])
    expect(by('NEEDS_REVIEW').every((v) => v.fine === null && v.vehiclePlate === null)).toBe(true)
  })
})

describe('seed: personajes de la demo', () => {
  const owner = (cedula: string) => seed.persons.find((p) => p.cedula === normalizeCedula(cedula))!
  const finesOf = (cedula: string) => {
    const ids = new Set(seed.vehicles.filter((v) => v.ownerId === owner(cedula).id).map((v) => v.plate))
    return seed.violations.filter((v) => v.vehiclePlate && ids.has(v.vehiclePlate))
  }

  it('V-99000001 es dueño de la placa de los clips demo y no tiene multas', () => {
    expect(finesOf('V-99000001')).toHaveLength(0)
    expect(seed.vehicles.find((v) => v.ownerId === owner('V-99000001').id)?.plate).toBe('AB123CD')
  })

  it('V-99000002 tiene exactamente 2 multas impagas y vigentes (flujo de alerta)', () => {
    const unpaid = finesOf('V-99000002').filter((v) => v.fine?.status === 'PENDING')
    expect(unpaid).toHaveLength(2)
    expect(unpaid.every((v) => v.fine!.dueAt >= now)).toBe(true)
  })

  it('los oficiales: OF-0001 cerca de CAM-001, OF-0002 lejos y OF-0003 con posición vieja', () => {
    const [near, far, stale] = seed.officerLocations
    expect(now.getTime() - near!.recordedAt.getTime()).toBeLessThan(10 * 60_000)
    expect(now.getTime() - far!.recordedAt.getTime()).toBeLessThan(10 * 60_000)
    expect(now.getTime() - stale!.recordedAt.getTime()).toBeGreaterThan(10 * 60_000)
    expect(seed.officers[2]!.onDuty).toBe(false)
  })
})

describe('seed: integridad y datos falsos', () => {
  it('todos los ids llevan el prefijo seed_ (demo:reset depende de esto)', () => {
    const ids = [
      ...seed.intersections, ...seed.cameras, ...seed.persons, ...seed.vehicles, ...seed.officers, ...seed.officerLocations,
      ...seed.violations, ...seed.violations.map((v) => v.evidence),
      ...seed.violations.flatMap((v) => (v.fine ? [v.fine] : [])),
      ...seed.violations.flatMap((v) => (v.fine?.payment ? [v.fine.payment] : [])),
    ].map((r) => r.id)
    expect(ids.every((id) => id.startsWith(SEED_PREFIX))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('placas normalizadas, plausibles y únicas; cédulas y tokens únicos', () => {
    const plates = seed.vehicles.map((v) => v.plate)
    expect(plates.every((p) => p === normalizePlate(p) && isPlausiblePlate(p))).toBe(true)
    expect(new Set(plates).size).toBe(plates.length)
    expect(new Set(seed.persons.map((p) => p.cedula)).size).toBe(8)
    const tokens = seed.violations.flatMap((v) => (v.fine ? [v.fine.publicToken] : []))
    expect(new Set(tokens).size).toBe(tokens.length)
    expect(tokens.every((t) => t.length >= 22)).toBe(true)
  })

  it('las multas son consistentes con su violación', () => {
    for (const v of seed.violations) {
      if (v.status === 'PAID') expect(v.fine?.paidAt).not.toBeNull()
      if (v.status === 'PAID') expect(v.fine?.payment).not.toBeNull()
      if (v.fine && v.fine.status !== 'PAID') expect(v.fine.paidAt).toBeNull()
      expect(Number.isInteger(v.fine?.amountCents ?? 0)).toBe(true) // céntimos enteros
    }
  })

  it('es determinista: mismos ids y tokens en cada siembra (idempotencia)', () => {
    const again = buildSeed({ now: new Date(now.getTime() + 86_400_000) })
    expect(again.violations.map((v) => v.id)).toEqual(seed.violations.map((v) => v.id))
    expect(again.violations.map((v) => v.fine?.publicToken)).toEqual(seed.violations.map((v) => v.fine?.publicToken))
  })

  it('solo teléfonos falsos por defecto; los reales entran únicamente por parámetro (env)', () => {
    const phones = [...seed.persons.map((p) => p.phone), ...seed.officers.map((o) => o.phone)]
    expect(phones.every((p) => /^5841200000\d{2}$/.test(p) || /^58412000010\d$/.test(p))).toBe(true)
    const withEnv = buildSeed({ now, driverPhone: '584140000000', officerPhone: '584240000000' })
    expect(withEnv.persons[0]!.phone).toBe('584140000000')
    expect(withEnv.officers[0]!.phone).toBe('584240000000')
    expect(withEnv.persons[1]!.phone).not.toBe('584140000000')
  })
})
