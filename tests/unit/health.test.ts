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
    expect(res.json).toHaveBeenCalledWith({ ok: true, data: { status: 'ok', time: expect.any(String) } })
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
