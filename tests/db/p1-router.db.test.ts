import type { VercelRequest, VercelResponse } from '@vercel/node'
import { describe, expect, it } from 'vitest'
import p1 from '../../api/p1.ts'

type Res = { code: number; body: any }
async function route(query: Record<string, unknown>, method = 'GET'): Promise<Res> {
  const out: Res = { code: 0, body: undefined }
  const res = { status(c: number) { out.code = c; return res }, json(b: unknown) { out.body = b; return res }, setHeader() { return res } }
  await p1({ method, headers: {}, query, body: {} } as unknown as VercelRequest, res as unknown as VercelResponse)
  return out
}

describe('router api/p1.ts (la única función de P1)', () => {
  it('una ruta desconocida o ausente es 404 NOT_FOUND', async () => {
    for (const query of [{}, { route: 'no-existe' }, { route: ['auth-me', 'auth-login'] }, { route: '__proto__' }, { route: 'constructor' }]) {
      const r = await route(query)
      expect(r.code, JSON.stringify(query)).toBe(404)
      expect(r.body.error.code).toBe('NOT_FOUND')
    }
  })

  it('enruta a cada handler: sin sesión, las rutas protegidas responden 401 y login valida el cuerpo', async () => {
    expect((await route({ route: 'auth-me' })).code).toBe(401)
    expect((await route({ route: 'violations-list' })).code).toBe(401)
    expect((await route({ route: 'violation-detail', id: 'x' })).code).toBe(401)
    expect((await route({ route: 'violation-review', id: 'x' }, 'POST')).code).toBe(401)
    expect((await route({ route: 'auth-login' }, 'POST')).code).toBe(400) // cuerpo vacío
    expect((await route({ route: 'auth-logout' }, 'POST')).code).toBe(200)
  })

  it('respeta el método de cada handler', async () => {
    expect((await route({ route: 'auth-me' }, 'POST')).code).toBe(400)
    expect((await route({ route: 'auth-login' }, 'GET')).code).toBe(400)
  })
})
