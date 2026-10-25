import { describe, expect, it } from 'vitest'
import { planSincronizado } from './sincronizar.ts'

describe('planSincronizado', () => {
  it('adelanta cada clip al mismo instante antes del choque: lo que todos tienen en común', () => {
    // el último choque real: el choque cae en el segundo 11,18 · 5,29 · 17,48 de cada clip
    const { previoS, iniciosS } = planSincronizado([11.18, 5.29, 17.48], 10)
    expect(previoS).toBeCloseTo(5.29)
    expect(iniciosS.map((t) => Number(t.toFixed(2)))).toEqual([5.89, 0, 12.19])
    // todos muestran el choque a los 5,29 s de arrancar
    iniciosS.forEach((inicio, i) => expect([11.18, 5.29, 17.48][i]! - inicio).toBeCloseTo(previoS))
  })

  it('no retrocede más de T−10 s aunque todos tengan más buffer', () => {
    expect(planSincronizado([14, 18], 10)).toEqual({ previoS: 10, iniciosS: [4, 8] })
  })
})
