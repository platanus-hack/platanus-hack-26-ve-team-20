import type { VercelRequest, VercelResponse } from '@vercel/node'

// Llama a un handler de api/ (formato Node de Vercel) con una petición simulada, sin servidor.
export interface FakeRes {
  statusCode: number
  body: unknown
  headers: Record<string, string>
}

export interface FakeReq {
  method?: string
  body?: unknown
  query?: Record<string, string>
  cookie?: string
  ip?: string
}

export async function call(fn: (req: VercelRequest, res: VercelResponse) => unknown, { method = 'GET', body, query = {}, cookie, ip = '203.0.113.9' }: FakeReq = {}) {
  const res: FakeRes = { statusCode: 200, body: undefined, headers: {} }
  const api = {
    status(code: number) {
      res.statusCode = code
      return api
    },
    json(b: unknown) {
      res.body = b
      return api
    },
    setHeader(k: string, v: string) {
      res.headers[k.toLowerCase()] = v
      return api
    },
  }
  const req = { method, body, query, headers: { 'x-forwarded-for': ip }, cookies: cookie ? { vc_officer: cookie } : {}, socket: {} }
  await fn(req as unknown as VercelRequest, api as unknown as VercelResponse)
  return res
}

export const sessionCookieFrom = (res: FakeRes) => /vc_officer=([^;]*)/.exec(res.headers['set-cookie'] ?? '')?.[1] ?? ''
