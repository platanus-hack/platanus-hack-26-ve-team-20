import { describe, expect, it } from 'vitest'
import { fotosDeInfraccion, tieneFotos, type EvidenciaItem } from '../../src/components/evidencia/fotos.ts'

const at = '2026-10-24T14:03:10.000Z'
const item = (kind: EvidenciaItem['kind'], url: string): EvidenciaItem => ({ kind, url, capturedAt: at })

describe('fotosDeInfraccion', () => {
  it('reconoce escena, vehículo y placa del modo en vivo por el nombre, aunque vengan desordenadas', () => {
    const f = fotosDeInfraccion([
      item('CLIP', 'https://b/escena-a.jpg'),
      item('PLATE_CROP', 'https://b/placa-x.jpg'),
      item('FRAME', 'https://b/vehiculo-y.jpg'),
      item('FRAME', 'https://b/escena-z.jpg'),
    ])
    expect([f.escena?.url, f.vehiculo?.url, f.placa?.url]).toEqual(['https://b/escena-z.jpg', 'https://b/vehiculo-y.jpg', 'https://b/placa-x.jpg'])
  })

  it('sin nombres reconocibles usa el orden de los fotogramas (clips)', () => {
    const f = fotosDeInfraccion([item('FRAME', 'https://b/frame-1800.jpg'), item('FRAME', 'https://b/frame-2100.jpg'), item('PLATE_CROP', 'https://b/plate.jpg')])
    expect([f.escena?.url, f.vehiculo?.url, f.placa?.url]).toEqual(['https://b/frame-1800.jpg', 'https://b/frame-2100.jpg', 'https://b/plate.jpg'])
  })

  it('un video solo no cuenta como foto', () => {
    expect(tieneFotos([item('CLIP', 'https://b/clip.mp4')])).toBe(false)
    expect(tieneFotos([])).toBe(false)
  })
})
