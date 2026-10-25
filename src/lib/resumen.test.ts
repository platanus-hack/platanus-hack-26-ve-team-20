import { describe, expect, it } from 'vitest'
import type { Multa } from '@/lib/demo/api.ts'
import { infraccionesPorMes, pagadoPorMes } from './resumen.ts'

const pagada = (paidAt: string, amountCents: number) => ({ status: 'PAID', paidAt, amountCents }) as Multa

describe('pagadoPorMes', () => {
  it('acumula lo pagado en el año por mes y ignora lo pendiente y años anteriores', () => {
    const multas = [
      pagada('2026-06-18T13:40:00Z', 100_000),
      pagada('2026-08-05T15:12:00Z', 50_000),
      pagada('2025-09-01T12:00:00Z', 999_999),
      { status: 'PENDING', paidAt: null, amountCents: 70_000 } as Multa,
    ]
    const curva = pagadoPorMes(multas, new Date(2026, 9, 24))
    expect(curva.map((p) => p.nombre)).toEqual(['May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov'])
    expect(curva.map((p) => p.cents)).toEqual([0, 100_000, 100_000, 150_000, 150_000, 150_000, 150_000])
    expect(curva.at(-1)!.futuro).toBe(true)
  })
})

describe('infraccionesPorMes', () => {
  it('cuenta por mes del año en Caracas: total, por pagar y pagadas', () => {
    const multas = [
      { status: 'PENDING', occurredAt: '2026-10-24T14:03:00Z' },
      { status: 'OVERDUE', occurredAt: '2026-10-02T12:00:00Z' },
      { status: 'PAID', occurredAt: '2026-08-02T22:20:00Z' },
      { status: 'VOID', occurredAt: '2026-08-10T12:00:00Z' },
      { status: 'PAID', occurredAt: '2025-08-02T12:00:00Z' },
      // 1 de septiembre a las 02:00 UTC todavía es 31 de agosto en Caracas
      { status: 'PAID', occurredAt: '2026-09-01T02:00:00Z' },
    ] as Multa[]
    const meses = infraccionesPorMes(multas, 2026)
    expect(meses).toHaveLength(12)
    expect(meses[9]).toEqual({ mes: 'Oct', total: 2, porPagar: 2, pagadas: 0 })
    expect(meses[7]).toEqual({ mes: 'Ago', total: 3, porPagar: 0, pagadas: 2 })
    expect(meses[8]!.total).toBe(0)
  })
})
