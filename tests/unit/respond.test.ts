import type { VercelRequest, VercelResponse } from '@vercel/node'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError, handler } from '../../api/_lib/respond.ts'

function fakeRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    setHeader: vi.fn(() => res),
  }
  return res
}
const asRes = (r: ReturnType<typeof fakeRes>) => r as unknown as VercelResponse
const req = (method: string) => ({ method }) as VercelRequest

describe('handler()', () => {
  it('rechaza métodos no permitidos con Allow y 400', async () => {
    const res = fakeRes()
    await handler(['GET'], () => {})(req('POST'), asRes(res))
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET')
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('convierte ZodError en 400 VALIDATION_ERROR con el campo', async () => {
    const res = fakeRes()
    await handler(['POST'], () => {
      z.object({ cedula: z.string().min(5) }).parse({ cedula: 'x' })
    })(req('POST'), asRes(res))
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: expect.stringContaining('cedula') },
    })
  })

  it('convierte ApiError en el código HTTP de su error', async () => {
    const res = fakeRes()
    await handler(['GET'], () => {
      throw new ApiError('NOT_FOUND', 'Multa no encontrada')
    })(req('GET'), asRes(res))
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: { code: 'NOT_FOUND', message: 'Multa no encontrada' } })
  })

  it('un error desconocido es 500 y no filtra el detalle', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = fakeRes()
    await handler(['GET'], () => {
      throw new Error('password=secreto en la cadena de conexión')
    })(req('GET'), asRes(res))
    expect(res.status).toHaveBeenCalledWith(500)
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secreto')
    spy.mockRestore()
  })
})
