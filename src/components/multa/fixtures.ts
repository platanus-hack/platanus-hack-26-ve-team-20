// Multas de EJEMPLO para ver /multa y /pagar mientras no existen GET /api/fines/[token] (P1) ni
// POST /api/payments/c2p (P3). Solo se usan si la API no responde (p. ej. con `pnpm dev`, sin funciones).
// Datos ficticios, con la forma exacta de FinePublicDTO (docs/04 §3).
import type { FinePublicDTO } from '@contracts'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const isoFromNow = (ms: number) => new Date(Date.now() + ms).toISOString()

function frames(occurredAt: string): FinePublicDTO['evidence'] {
  const t = new Date(occurredAt).getTime()
  return [
    { kind: 'FRAME', url: '', capturedAt: new Date(t - 400).toISOString(), lightState: 'RED' },
    { kind: 'FRAME', url: '', capturedAt: new Date(t).toISOString(), lightState: 'RED' },
    { kind: 'PLATE_CROP', url: '', capturedAt: new Date(t + 200).toISOString() },
  ]
}

function base(token: string, occurredAt: string): FinePublicDTO {
  return {
    token,
    status: 'PENDING',
    overdue: false,
    type: 'RED_LIGHT',
    occurredAt,
    intersection: 'Av. Demo Norte con Calle 1',
    cameraCode: 'CAM-001',
    plateMasked: 'AB***CD',
    vehicle: 'Toyota Corolla gris',
    amountCents: 2_500_000,
    currency: 'VES',
    dueAt: isoFromNow(29 * DAY),
    verification: 'AUTO',
    evidence: frames(occurredAt),
    paidAt: null,
    paymentReference: null,
  }
}

export function fixtureFine(token: string): FinePublicDTO | null {
  if (token === 'demo-pendiente') return base(token, isoFromNow(-2 * HOUR))
  if (token === 'demo-vencida') {
    return { ...base(token, isoFromNow(-40 * DAY)), overdue: true, dueAt: isoFromNow(-10 * DAY), verification: 'HUMAN' }
  }
  if (token === 'demo-pagada') {
    return { ...base(token, isoFromNow(-3 * DAY)), status: 'PAID', paidAt: isoFromNow(-2 * DAY), paymentReference: 'SIM-48213977' }
  }
  return null
}

export const FIXTURE_TOKENS = ['demo-pendiente', 'demo-vencida', 'demo-pagada'] as const
