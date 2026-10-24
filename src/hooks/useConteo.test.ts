import { describe, expect, it } from 'vitest'
import { conteoEn } from './useConteo.ts'

describe('conteoEn', () => {
  it('va de 0 al monto exacto', () => {
    expect(conteoEn(250000, 0)).toBe(0)
    expect(conteoEn(250000, 1)).toBe(250000)
    expect(conteoEn(250000, 2)).toBe(250000)
  })
  it('arranca rápido y frena al final (salida cúbica)', () => {
    expect(conteoEn(1000, 0.5)).toBe(875)
    const pasos = [0, 0.25, 0.5, 0.75, 1].map((t) => conteoEn(1000, t))
    expect(pasos).toEqual([...pasos].sort((a, b) => a - b))
  })
})
