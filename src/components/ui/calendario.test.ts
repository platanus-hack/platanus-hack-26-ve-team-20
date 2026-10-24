import { describe, expect, it } from 'vitest'
import { atajos, cuadricula, esDia, fechaCorta, nombreMes, ordenar, sumarDias, sumarMeses } from './calendario.ts'

describe('calendario', () => {
  it('la cuadrícula tiene 42 días, empieza en lunes y marca los del mes', () => {
    const c = cuadricula('2026-10') // el 1 de octubre de 2026 es jueves
    expect(c).toHaveLength(42)
    expect(c[0]).toEqual({ dia: '2026-09-28', delMes: false })
    expect(c[3]).toEqual({ dia: '2026-10-01', delMes: true })
    expect(c.filter((x) => x.delMes)).toHaveLength(31)
    expect(new Date(`${c[0]!.dia}T12:00:00Z`).getUTCDay()).toBe(1)
  })

  it('un mes que empieza en lunes no rellena días antes', () => {
    expect(cuadricula('2026-06')[0]).toEqual({ dia: '2026-06-01', delMes: true })
  })

  it('suma meses y días cruzando años', () => {
    expect(sumarMeses('2026-11', 3)).toBe('2027-02')
    expect(sumarMeses('2026-01', -1)).toBe('2025-12')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('formatea fechas y meses en español', () => {
    expect(fechaCorta('2026-01-01')).toBe('1 Ene 2026')
    expect(fechaCorta('2026-10-24')).toBe('24 Oct 2026')
    expect(nombreMes('2026-09')).toBe('Septiembre 2026')
  })

  it('ordena los extremos y valida días', () => {
    expect(ordenar('2026-10-24', '2026-01-01')).toEqual(['2026-01-01', '2026-10-24'])
    expect(esDia('2026-02-30')).toBe(true) // JS normaliza; el formato es lo que se exige
    expect(esDia('2026-2-3')).toBe(false)
    expect(esDia(null)).toBe(false)
  })

  it('los atajos terminan hoy', () => {
    const a = atajos('2026-10-24', '2020-01-01')
    expect(a.find((x) => x.id === 'mes')).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-24' })
    expect(a.find((x) => x.id === '30')).toMatchObject({ desde: '2026-09-25' })
    expect(a.find((x) => x.id === 'anio')).toMatchObject({ desde: '2026-01-01' })
    expect(a.find((x) => x.id === 'todo')).toMatchObject({ desde: '2020-01-01' })
  })
})
