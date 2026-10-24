import { describe, expect, it } from 'vitest'
import { C2PRequestSchema } from '../contracts/index.ts'
import { chargeC2P } from './mock.ts'

const request = (c2pKey: string, idempotencyKey = 'intento-0001') =>
  C2PRequestSchema.parse({
    fineToken: 'x7Gq-token-de-ejemplo',
    payerBankCode: '0102',
    payerPhone: '04120000001',
    payerCedula: 'V-99000001',
    c2pKey,
    idempotencyKey,
  })

describe('mock de lib/payments', () => {
  it('rechaza las claves de prueba con su código', async () => {
    expect(await chargeC2P(request('000000'))).toEqual({ status: 'REJECTED', failureCode: 'INVALID_KEY' })
    expect(await chargeC2P(request('111111'))).toEqual({ status: 'REJECTED', failureCode: 'INSUFFICIENT_FUNDS' })
  })

  it('aprueba cualquier otra clave con referencia SIM- de 8 dígitos', async () => {
    const r = await chargeC2P(request('123456'))
    expect(r.status).toBe('APPROVED')
    expect(r.reference).toMatch(/^SIM-\d{8}$/)
  })

  it('da la misma referencia para el mismo intento y otra para uno distinto', async () => {
    const a = await chargeC2P(request('123456', 'intento-0001'))
    const b = await chargeC2P(request('654321', 'intento-0001'))
    const c = await chargeC2P(request('123456', 'intento-0002'))
    expect(a.reference).toBe(b.reference)
    expect(a.reference).not.toBe(c.reference)
  })

  it('nunca devuelve la clave C2P', async () => {
    for (const key of ['000000', '111111', '87654321']) {
      expect(JSON.stringify(await chargeC2P(request(key)))).not.toContain(key)
    }
  })
})
