import { describe, expect, it } from 'vitest'
import { celdaCsv, multasCsv } from './csv.ts'
import type { MultaOficial } from './demo.ts'

describe('celdaCsv', () => {
  it('neutraliza fórmulas', () => {
    for (const v of ['=1+1', '+58412', '-2', '@SUM(A1)', '\tx', '\rx']) expect(celdaCsv(v)).toBe(`"'${v}"`)
  })
  it('duplica comillas y siempre entrecomilla', () => {
    expect(celdaCsv('Av. "Demo"; Norte')).toBe('"Av. ""Demo""; Norte"')
    expect(celdaCsv('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"')
    expect(celdaCsv('AB123CD')).toBe('"AB123CD"')
  })
})

describe('multasCsv', () => {
  it('columnas de la tabla, `;`, coma decimal y cédula enmascarada', () => {
    const m: MultaOficial = {
      id: 'x', type: 'RED_LIGHT', status: 'PENDING', occurredAt: '2026-10-24T14:03:00Z', intersection: '=Av. Demo (ejemplo)',
      cameraCode: 'CAM-001', plate: 'AB123CD', cedulaMasked: 'V-****0001', amountCents: 125_050, currency: 'VES',
      dueAt: '2026-11-23T16:00:00Z', verification: 'AUTO', confidence: 0.9,
    }
    const [cabecera, fila] = multasCsv([m]).split('\r\n')
    expect(cabecera).toBe('"Fecha y hora";"Tipo";"Placa";"Cédula";"Intersección";"Monto (Bs.)";"Estado"')
    expect(fila).toBe('"24/10/2026 10:03";"Luz roja";"AB123CD";"V-****0001";"\'=Av. Demo (ejemplo)";"1250,50";"PENDIENTE"')
  })
})
