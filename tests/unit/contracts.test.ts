import { describe, expect, it } from 'vitest'
import {
  C2PRequestSchema,
  DetectionRequestSchema,
  PortalLookupRequestSchema,
  ReviewRequestSchema,
  isPlausiblePlate,
  maskCedula,
  maskPlate,
  normalizeCedula,
  normalizePlate,
} from '../../lib/contracts/index.ts'

describe('normalizePlate / normalizeCedula', () => {
  it('quita espacios, guiones y puntos y pasa a mayúsculas', () => {
    expect(normalizePlate('ab 123-cd')).toBe('AB123CD')
    expect(normalizeCedula('v-12.345.678')).toBe('V12345678')
    expect(normalizeCedula('V12345678')).toBe('V12345678')
  })
})

describe('máscaras', () => {
  it('enmascara placa y cédula', () => {
    expect(maskPlate('AB123CD')).toBe('AB***CD')
    expect(maskCedula('V-99000001')).toBe('V-****0001')
  })
})

describe('isPlausiblePlate', () => {
  it('rechaza placas con "?" o demasiado cortas', () => {
    expect(isPlausiblePlate('AB123CD')).toBe(true)
    expect(isPlausiblePlate('AB12?CD')).toBe(false)
    expect(isPlausiblePlate('AB1')).toBe(false)
  })
})

describe('esquemas de request', () => {
  it('PortalLookup normaliza la cédula', () => {
    expect(PortalLookupRequestSchema.parse({ cedula: 'v-99.000.001' }).cedula).toBe('V99000001')
    expect(() => PortalLookupRequestSchema.parse({ cedula: 'xx' })).toThrow()
  })

  it('C2P valida banco, teléfono y clave', () => {
    const base = {
      fineToken: 'x7GqAbCdEf12',
      payerBankCode: '0102',
      payerPhone: '04120000001',
      payerCedula: 'V-99000001',
      c2pKey: '12345678',
      idempotencyKey: 'uuid-1234-abcd',
    }
    expect(C2PRequestSchema.parse(base).payerCedula).toBe('V99000001')
    expect(() => C2PRequestSchema.parse({ ...base, c2pKey: '12' })).toThrow()
    expect(() => C2PRequestSchema.parse({ ...base, payerPhone: '02121234567' })).toThrow()
  })

  it('Review distingue APPROVE y VOID', () => {
    expect(ReviewRequestSchema.parse({ action: 'APPROVE', plate: 'ab-123-cd' })).toMatchObject({ plate: 'AB123CD' })
    expect(() => ReviewRequestSchema.parse({ action: 'VOID' })).toThrow()
  })

  it('Detection exige clip con URL y aplica valores por defecto', () => {
    const parsed = DetectionRequestSchema.parse({
      cameraCode: 'CAM-001',
      clip: { url: 'https://blob.example/clip.mp4', startedAt: '2026-10-24T14:03:10.100Z', durationMs: 4000 },
    })
    expect(parsed.type).toBe('RED_LIGHT')
    expect(parsed.clockOffsetMs).toBe(0)
    expect(() => DetectionRequestSchema.parse({ cameraCode: 'CAM-001' })).toThrow()
  })
})
