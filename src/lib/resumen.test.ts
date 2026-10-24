import { describe, expect, it } from 'vitest'
import type { Multa } from '@/lib/demo/api.ts'
import { pagadoPorMes } from './resumen.ts'

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
