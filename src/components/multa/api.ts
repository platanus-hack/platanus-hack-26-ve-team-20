// Acceso a la API para /multa y /pagar, con los tipos de lib/contracts.
// Si la API no responde (endpoint aún no existe o `pnpm dev` sin funciones) y el token es de ejemplo,
// se usan los datos de fixtures.ts y un pago simulado en el navegador. Con la API arriba, manda la API.
import type { ApiResponse, C2PPaymentDTO, C2PRequest, ErrorCode, FinePublicDTO } from '@contracts'
import { fixtureFine } from './fixtures.ts'

export type Source = 'api' | 'fixture'

export type FineLoad =
  | { kind: 'ok'; fine: FinePublicDTO; source: Source }
  | { kind: 'not_found' }
  | { kind: 'unavailable' }

export type PaymentOutcome =
  | { kind: 'approved'; reference: string; paidAt: string }
  | { kind: 'rejected'; failureCode: string }
  | { kind: 'already_paid' }
  | { kind: 'error'; code: ErrorCode | 'NETWORK'; message: string }

/** `null` si no hubo respuesta JSON de la API (sin red, o el SPA devolvió index.html). */
async function requestJson<T>(input: string, init?: RequestInit): Promise<ApiResponse<T> | null> {
  try {
    const res = await fetch(input, { ...init, headers: { Accept: 'application/json', ...init?.headers } })
    if (!res.headers.get('content-type')?.includes('application/json')) return null
    return (await res.json()) as ApiResponse<T>
  } catch {
    return null
  }
}

export async function loadFine(token: string): Promise<FineLoad> {
  const res = await requestJson<FinePublicDTO>(`/api/fines/${encodeURIComponent(token)}`)
  if (res?.ok) return { kind: 'ok', fine: res.data, source: 'api' }
  if (res && res.error.code === 'NOT_FOUND') return { kind: 'not_found' }
  const fixture = fixtureFine(token)
  if (fixture) return { kind: 'ok', fine: fixture, source: 'fixture' }
  return { kind: 'unavailable' }
}

export async function payFine(req: C2PRequest, source: Source): Promise<PaymentOutcome> {
  if (source === 'fixture') return simulateLocally(req)
  const res = await requestJson<C2PPaymentDTO>('/api/payments/c2p', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res) return { kind: 'error', code: 'NETWORK', message: 'No pudimos conectar con el servidor. Intente de nuevo.' }
  if (!res.ok) {
    if (res.error.code === 'ALREADY_PAID') return { kind: 'already_paid' }
    return { kind: 'error', code: res.error.code, message: res.error.message }
  }
  return res.data.status === 'APPROVED'
    ? { kind: 'approved', reference: res.data.reference, paidAt: res.data.paidAt }
    : { kind: 'rejected', failureCode: res.data.failureCode }
}

// Solo para multas de ejemplo, sin servidor: mismas reglas que lib/payments/c2p.ts (docs/04 §5).
async function simulateLocally(req: C2PRequest): Promise<PaymentOutcome> {
  await new Promise((resolve) => setTimeout(resolve, 900))
  if (req.c2pKey === '000000') return { kind: 'rejected', failureCode: 'INVALID_KEY' }
  if (req.c2pKey === '111111') return { kind: 'rejected', failureCode: 'INSUFFICIENT_FUNDS' }
  const digits = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
  return { kind: 'approved', reference: `SIM-${String(digits % 100_000_000).padStart(8, '0')}`, paidAt: new Date().toISOString() }
}
