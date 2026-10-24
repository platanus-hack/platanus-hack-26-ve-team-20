import { describe, expect, it, vi } from 'vitest'
import { C2PRequestSchema } from '../contracts/index.ts'
import { EXAMPLE_BANKS, isExampleBank } from './banks.ts'
import { createC2PSimulator } from './c2p.ts'

const request = (c2pKey: string) =>
  C2PRequestSchema.parse({
    fineToken: 'x7Gq-token-de-ejemplo',
    payerBankCode: '0102',
    payerPhone: '04120000001',
    payerCedula: 'V-99000001',
    c2pKey,
    idempotencyKey: 'intento-0001',
  })

const noWait = () => createC2PSimulator({ sleep: async () => {} })

describe('bancos de ejemplo', () => {
  it('códigos de 4 dígitos, sin repetir', () => {
    const codes = EXAMPLE_BANKS.map((b) => b.code)
    for (const code of codes) expect(code).toMatch(/^\d{4}$/)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('reconoce solo los bancos de la lista', () => {
    expect(isExampleBank('0102')).toBe(true)
    expect(isExampleBank('9999')).toBe(false)
  })
})

describe('simulador C2P (docs/04 §5)', () => {
  it('rechaza 000000 por clave inválida y 111111 por fondos insuficientes', async () => {
    const charge = noWait()
    expect(await charge(request('000000'))).toEqual({ status: 'REJECTED', failureCode: 'INVALID_KEY' })
    expect(await charge(request('111111'))).toEqual({ status: 'REJECTED', failureCode: 'INSUFFICIENT_FUNDS' })
  })

  it('aprueba cualquier otra clave con referencia SIM- de 8 dígitos', async () => {
    const charge = noWait()
    for (const key of ['123456', '00000000', '9876543']) {
      const r = await charge(request(key))
      expect(r.status).toBe('APPROVED')
      expect(r.reference).toMatch(/^SIM-\d{8}$/)
      expect(r.failureCode).toBeUndefined()
    }
  })

  it('rellena la referencia con ceros a la izquierda', async () => {
    const charge = createC2PSimulator({ sleep: async () => {}, randomIntInclusive: (min) => (min === 0 ? 42 : min) })
    expect((await charge(request('123456'))).reference).toBe('SIM-00000042')
  })

  it('espera entre 800 y 1500 ms por defecto, como un banco', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const charge = createC2PSimulator({ sleep })
    for (let i = 0; i < 20; i++) await charge(request('123456'))
    for (const [ms] of sleep.mock.calls) {
      expect(ms).toBeGreaterThanOrEqual(800)
      expect(ms).toBeLessThanOrEqual(1500)
    }
  })

  it('nunca devuelve la clave C2P', async () => {
    // referencia fija para que el azar no pueda contener la clave por casualidad
    const charge = createC2PSimulator({ sleep: async () => {}, randomIntInclusive: (min) => (min === 0 ? 12_345_678 : min) })
    for (const key of ['000000', '111111', '87654321']) {
      expect(JSON.stringify(await charge(request(key)))).not.toContain(key)
    }
  })
})
