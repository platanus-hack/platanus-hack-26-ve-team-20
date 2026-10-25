import type { VercelRequest, VercelResponse } from '@vercel/node'
import { describe, expect, it, vi } from 'vitest'
import handler from '../../api/health.ts'

function fakeRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    setHeader: vi.fn(() => res),
  }
  return res
}

describe('GET /api/health', () => {
  it('responde { ok: true, data } con estado y hora', () => {
    const res = fakeRes()
    handler({ method: 'GET' } as VercelRequest, res as unknown as VercelResponse)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true, data: { status: 'ok', time: expect.any(String), whatsapp: expect.any(Object) } })
  })

  it('la huella de WhatsApp identifica el token sin mostrarlo', async () => {
    const { whatsappFingerprint } = await import('../../lib/notify/whatsapp.ts')
    const token = 'EAAtoken-de-prueba-no-real-1234567890'
    const h = whatsappFingerprint({ NOTIFY_DRY_RUN: 'false', WHATSAPP_ACCESS_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: '1141087575744689' })
    expect(h).toEqual({ dryRun: false, tokenLength: token.length, tokenSha256: expect.stringMatching(/^[0-9a-f]{8}$/), phoneNumberIdEnd: '4689', graphVersion: 'v23.0' })
    expect(JSON.stringify(h)).not.toContain('EAAtoken')
    // el mismo token con un carácter invisible pegado da la misma huella (se limpia antes)
    expect(whatsappFingerprint({ WHATSAPP_ACCESS_TOKEN: `${token}\u2060` })).toMatchObject({ tokenSha256: h.tokenSha256 })
  })

  it('rechaza otros métodos con el formato de error de la API', () => {
    const res = fakeRes()
    handler({ method: 'POST' } as VercelRequest, res as unknown as VercelResponse)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
    })
  })
})
