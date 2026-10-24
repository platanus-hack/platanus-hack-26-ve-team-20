import { describe, expect, it } from 'vitest'
import {
  PORTAL_MAX_ITEMS, cedulaCandidates, toPortalLookup, type PortalFineRow,
} from '../../lib/domain/portal.ts'

const NOW = new Date('2026-10-24T12:00:00.000Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

let n = 0
function fine(over: { status?: string; dueIn?: number; occurred?: number; plate?: string | null; plateRead?: string | null; type?: string } = {}): PortalFineRow {
  n += 1
  return {
    id: `f${n}`, publicToken: `secret-token-${n}-0000000000`, status: over.status ?? 'PENDING', amountCents: 2_500_000, currency: 'VES',
    dueAt: day(over.dueIn ?? 10),
    violation: {
      type: over.type ?? 'RED_LIGHT', occurredAt: day(over.occurred ?? -n), plateRead: over.plateRead ?? 'AB123CD',
      vehicle: over.plate === null ? null : { plate: over.plate ?? 'AB123CD', ownerId: 'x' },
      camera: { code: 'CAM-001', intersection: { name: 'Av. Demo Norte con Calle 1 (ejemplo)' } },
    },
  } as unknown as PortalFineRow
}

describe('cedulaCandidates', () => {
  it('con prefijo busca solo esa cédula; sin prefijo prueba V y E', () => {
    expect(cedulaCandidates('V-99.000.001')).toEqual(['V99000001'])
    expect(cedulaCandidates('e-12.345.678')).toEqual(['E12345678'])
    expect(cedulaCandidates('J123456789')).toEqual(['J123456789'])
    expect(cedulaCandidates('99000001')).toEqual(['V99000001', 'E99000001'])
    expect(cedulaCandidates(' 99.000.001 ')).toEqual(['V99000001', 'E99000001'])
  })
})

describe('toPortalLookup', () => {
  it('cuenta pendientes (incluidas las vencidas) y pagadas; anuladas y apeladas solo suman al total', () => {
    const dto = toPortalLookup('V99000001', [
      fine({ status: 'PENDING', dueIn: 10 }),
      fine({ status: 'PENDING', dueIn: -3 }), // vencida
      fine({ status: 'PAID', dueIn: -30 }),
      fine({ status: 'VOID' }),
      fine({ status: 'APPEALED' }),
    ], NOW)
    expect(dto.summary).toEqual({ total: 5, pending: 2, paid: 1 })
  })

  it('una multa vencida se muestra como OVERDUE; una pagada nunca vence', () => {
    const dto = toPortalLookup('V99000001', [fine({ status: 'PENDING', dueIn: -3, occurred: -1 }), fine({ status: 'PAID', dueIn: -30, occurred: -2 })], NOW)
    expect(dto.items.map((i) => i.status)).toEqual(['OVERDUE', 'PAID'])
  })

  it('ordena por fecha de la infracción, la más reciente primero', () => {
    const dto = toPortalLookup('V99000001', [fine({ occurred: -10 }), fine({ occurred: -1 }), fine({ occurred: -5 })], NOW)
    expect(dto.items.map((i) => i.occurredAt)).toEqual([day(-1), day(-5), day(-10)].map((d) => d.toISOString()))
  })

  it('enmascara cédula y placa, y nunca expone el token de la multa (solo tras OTP)', () => {
    const dto = toPortalLookup('V99000001', [fine()], NOW)
    expect(dto.cedulaMasked).toBe('V-****0001')
    expect(dto.items[0]).toMatchObject({ plateMasked: 'AB***CD', intersection: 'Av. Demo Norte con Calle 1 (ejemplo)', fineToken: null, amountCents: 2_500_000, currency: 'VES' })
    const json = JSON.stringify(dto)
    expect(json).not.toContain('secret-token')
    expect(json).not.toContain('99000001')
    expect(json).not.toContain('AB123CD')
  })

  it('usa la placa del vehículo registrado y, si no hubiera, la leída', () => {
    expect(toPortalLookup('V1', [fine({ plate: 'ZZ999ZZ', plateRead: 'AB123CD' })], NOW).items[0]!.plateMasked).toBe('ZZ***ZZ')
    expect(toPortalLookup('V1', [fine({ plate: null, plateRead: 'AB123CD' })], NOW).items[0]!.plateMasked).toBe('AB***CD')
  })

  it('expone SOLO las claves del contrato (ningún dato personal puede colarse)', () => {
    const dto = toPortalLookup('V99000001', [fine()], NOW)
    expect(Object.keys(dto).sort()).toEqual(['cedulaMasked', 'items', 'summary'])
    expect(Object.keys(dto.summary).sort()).toEqual(['paid', 'pending', 'total'])
    expect(Object.keys(dto.items[0]!).sort()).toEqual(['amountCents', 'currency', 'fineToken', 'intersection', 'occurredAt', 'plateMasked', 'status', 'type'])
  })

  it('sin multas: misma forma, todo en cero y lista vacía', () => {
    expect(toPortalLookup('V99000001', [], NOW)).toEqual({ cedulaMasked: 'V-****0001', summary: { total: 0, pending: 0, paid: 0 }, items: [] })
  })

  it(`lista como máximo ${PORTAL_MAX_ITEMS} multas pero el resumen cuenta todas`, () => {
    const many = Array.from({ length: PORTAL_MAX_ITEMS + 25 }, (_, i) => fine({ occurred: -i - 1 }))
    const dto = toPortalLookup('V1', many, NOW)
    expect(dto.items).toHaveLength(PORTAL_MAX_ITEMS)
    expect(dto.summary.total).toBe(PORTAL_MAX_ITEMS + 25)
  })
})
