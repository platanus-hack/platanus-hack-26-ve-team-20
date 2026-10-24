import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { PrismaClient } from '../../lib/generated/prisma/client.ts'

// Llama a un handler de api/ (formato Node de Vercel) con una petición simulada, sin servidor.
// Las IPs son de rangos de documentación (TEST-NET-2/3): nunca coinciden con tráfico real.

// api/_lib/auth.ts (P1) firma las sesiones con SESSION_SECRET; en local puede faltar.
process.env.SESSION_SECRET ||= 'secreto-de-sesion-solo-para-tests-db-0123456789'

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
  const headers: Record<string, string> = { 'x-forwarded-for': ip, ...(cookie && { cookie: `vc_officer=${cookie}` }) }
  const req = { method, body, query, headers, cookies: {}, socket: {} }
  await fn(req as unknown as VercelRequest, api as unknown as VercelResponse)
  return res
}

export const sessionCookieFrom = (res: FakeRes) => /vc_officer=([^;]*)/.exec(res.headers['set-cookie'] ?? '')?.[1] ?? ''

/** Borra los registros de intentos (límites de P1) que dejan las IPs de prueba. */
export function clearTestAttempts(db: PrismaClient) {
  return db.auditLog.deleteMany({
    where: {
      action: { in: ['OFFICER_LOGIN_FAILED', 'OFFICER_LOGIN', 'PAYMENT_ATTEMPT'] },
      OR: [{ ip: { startsWith: '203.0.113.' } }, { ip: { startsWith: '198.51.100.' } }],
    },
  })
}
