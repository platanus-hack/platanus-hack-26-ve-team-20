import type { VercelRequest } from '@vercel/node'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireAdmin } from '../../api/_lib/auth.ts'
import { ApiError } from '../../api/_lib/respond.ts'
import { toFinePublic, toViolationListItem, verdictOf, type PublicFineRow, type ViolationListRow } from '../../lib/domain/dto.ts'
import { DomainError } from '../../lib/domain/errors.ts'
import { parseStatuses } from '../../lib/domain/queries.ts'

const NOW = new Date('2026-10-24T12:00:00.000Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

function violationRow(over: Record<string, unknown> = {}, fine: Record<string, unknown> | null = {}): ViolationListRow {
  return {
    id: 'vio_1', type: 'RED_LIGHT', status: 'NOTIFIED', reviewReason: null, voidReason: null,
    plateRead: 'AB123CD', plateConfidence: 0.95, confidence: 0.92, occurredAt: day(-1), updatedAt: day(0),
    measuredSpeedKmh: 42.1, laneId: 'C1', roadRelation: 'WITH_FLOW',
    ruleOutput: { verdict: 'VIOLATION', crossing: { crossedStopLine: true, lightState: 'RED' }, rules: {} },
    camera: { code: 'CAM-001', intersection: { name: 'Av. Demo Norte con Calle 1 (ejemplo)' } },
    evidence: [{ kind: 'CLIP', url: 'https://x/clip.mp4' }, { kind: 'FRAME', url: 'https://x/f0.jpg' }],
    fine: fine && { publicToken: 'tok_0123456789abcdef', status: 'PENDING', amountCents: 2_500_000, currency: 'VES', dueAt: day(10), ...fine },
    ...over,
  } as unknown as ViolationListRow
}

function fineRow(over: Record<string, unknown> = {}, violation: Record<string, unknown> = {}): PublicFineRow {
  return {
    publicToken: 'tok_0123456789abcdef', status: 'PENDING', amountCents: 2_500_000, currency: 'VES',
    dueAt: day(10), paidAt: null, payments: [],
    violation: {
      type: 'RED_LIGHT', occurredAt: day(-1), plateRead: 'AB123CD', reviewReason: null,
      camera: { code: 'CAM-001', intersection: { name: 'Av. Demo Norte con Calle 1 (ejemplo)' } },
      vehicle: { plate: 'AB123CD', make: 'Toyota', model: 'Corolla', color: 'gris' },
      evidence: [
        { kind: 'FRAME', url: 'https://x/f0.jpg', capturedAt: day(-1), meta: { lightState: 'RED' } },
        { kind: 'PLATE_CROP', url: 'https://x/p.jpg', capturedAt: day(-1), meta: null },
        { kind: 'FRAME', url: 'https://x/f1.jpg', capturedAt: day(-1), meta: { lightState: 'basura' } },
      ],
      ...violation,
    },
    ...over,
  } as unknown as PublicFineRow
}

describe('verdictOf', () => {
  it('NO_VIOLATION es un VOID con ese motivo; el resto se deduce del estado', () => {
    expect(verdictOf('VOID', 'NO_VIOLATION')).toBe('NO_VIOLATION')
    expect(verdictOf('VOID', 'Vehículo de emergencia')).toBe('VIOLATION') // anulada por un operador
    expect(verdictOf('NEEDS_REVIEW', null)).toBe('NEEDS_REVIEW')
    for (const s of ['FINED', 'NOTIFIED', 'PAID', 'APPEALED', 'REVIEWED', 'DETECTED'] as const) {
      expect(verdictOf(s, null)).toBe('VIOLATION')
    }
  })
})

describe('toViolationListItem', () => {
  it('mapea cámara, evidencia, movimiento y la luz en el cruce', () => {
    const dto = toViolationListItem(violationRow(), NOW)
    expect(dto).toMatchObject({
      id: 'vio_1', verdict: 'VIOLATION', camera: { code: 'CAM-001', intersection: 'Av. Demo Norte con Calle 1 (ejemplo)' },
      lightState: 'RED', motion: { speedKmh: 42.1, laneId: 'C1', relation: 'WITH_FLOW' },
      occurredAt: day(-1).toISOString(), updatedAt: day(0).toISOString(),
      evidence: [{ kind: 'CLIP', url: 'https://x/clip.mp4' }, { kind: 'FRAME', url: 'https://x/f0.jpg' }],
      fine: { token: 'tok_0123456789abcdef', status: 'PENDING', amountCents: 2_500_000, currency: 'VES' },
    })
  })

  it('una multa vencida se informa como OVERDUE (se calcula, no se guarda)', () => {
    expect(toViolationListItem(violationRow({}, { dueAt: day(-3) }), NOW).fine?.status).toBe('OVERDUE')
    expect(toViolationListItem(violationRow({}, { status: 'PAID', dueAt: day(-3) }), NOW).fine?.status).toBe('PAID')
  })

  it('sin multa → fine null; filas del seed (ruleOutput sin crossing) → lightState null', () => {
    const dto = toViolationListItem(violationRow({ ruleOutput: { seed: true }, roadRelation: 'raro' }, null), NOW)
    expect(dto.fine).toBeNull()
    expect(dto.lightState).toBeNull()
    expect(dto.motion.relation).toBeNull()
    expect(toViolationListItem(violationRow({ ruleOutput: null }), NOW).lightState).toBeNull()
  })

  it('un NO_VIOLATION se distingue por su veredicto, con el motivo a la vista', () => {
    const dto = toViolationListItem(violationRow({ status: 'VOID', voidReason: 'NO_VIOLATION' }, null), NOW)
    expect(dto).toMatchObject({ verdict: 'NO_VIOLATION', voidReason: 'NO_VIOLATION' })
  })
})

describe('toFinePublic (privacidad)', () => {
  it('expone SOLO las claves del contrato: ningún dato personal puede colarse', () => {
    const dto = toFinePublic(fineRow(), NOW)
    expect(Object.keys(dto).sort()).toEqual([
      'amountCents', 'cameraCode', 'currency', 'dueAt', 'evidence', 'intersection', 'occurredAt', 'overdue',
      'paidAt', 'paymentReference', 'plateMasked', 'status', 'token', 'type', 'vehicle', 'verification',
    ])
  })

  it('no filtra cédula, teléfono ni nombre aunque la fila los traiga', () => {
    const row = fineRow({}, {
      owner: { cedula: 'V99000001', fullName: 'Persona Ejemplo 1', phone: '584120000001', email: 'persona1@example.com' },
      vehicle: { plate: 'AB123CD', make: 'Toyota', model: 'Corolla', color: 'gris', ownerId: 'x', owner: { cedula: 'V99000001', phone: '584120000001' } },
    })
    const json = JSON.stringify(toFinePublic(row, NOW))
    for (const secret of ['V99000001', 'Persona Ejemplo', '584120000001', 'example.com', 'ownerId']) {
      expect(json).not.toContain(secret)
    }
  })

  it('placa enmascarada, descripción del vehículo y campos calculados', () => {
    expect(toFinePublic(fineRow(), NOW)).toMatchObject({
      plateMasked: 'AB***CD', vehicle: 'Toyota Corolla gris', overdue: false, verification: 'AUTO', status: 'PENDING', paidAt: null, paymentReference: null,
    })
    expect(toFinePublic(fineRow({ dueAt: day(-1) }), NOW)).toMatchObject({ overdue: true, status: 'PENDING' })
    expect(toFinePublic(fineRow({}, { reviewReason: 'LOW_CONFIDENCE' }), NOW).verification).toBe('HUMAN')
    expect(toFinePublic(fineRow({}, { vehicle: null, plateRead: 'AB12?CD' }), NOW)).toMatchObject({ vehicle: null, plateMasked: 'AB***CD' })
  })

  it('multa pagada: no está vencida y trae la referencia del pago aprobado', () => {
    const dto = toFinePublic(fineRow({ status: 'PAID', dueAt: day(-5), paidAt: day(-2), payments: [{ reference: 'SIM-10000003' }] }), NOW)
    expect(dto).toMatchObject({ status: 'PAID', overdue: false, paidAt: day(-2).toISOString(), paymentReference: 'SIM-10000003' })
  })

  it('la evidencia incluye lightState solo si es un valor válido', () => {
    const ev = toFinePublic(fineRow(), NOW).evidence
    expect(ev[0]).toMatchObject({ kind: 'FRAME', lightState: 'RED' })
    expect(ev[1]).not.toHaveProperty('lightState')
    expect(ev[2]).not.toHaveProperty('lightState')
  })
})

describe('parseStatuses', () => {
  it('acepta uno o varios estados y rechaza los inválidos con VALIDATION_ERROR', () => {
    expect(parseStatuses(undefined)).toBeUndefined()
    expect(parseStatuses('')).toBeUndefined()
    expect(parseStatuses('NEEDS_REVIEW')).toEqual(['NEEDS_REVIEW'])
    expect(parseStatuses('FINED, NOTIFIED')).toEqual(['FINED', 'NOTIFIED'])
    const err = (() => {
      try { parseStatuses('FINED,NOPE') } catch (e) { return e }
    })()
    expect(err).toBeInstanceOf(DomainError)
    expect((err as DomainError).code).toBe('VALIDATION_ERROR')
  })
})

describe('requireAdmin', () => {
  afterEach(() => vi.unstubAllEnvs())
  const req = (authorization?: string) => ({ headers: authorization ? { authorization } : {} }) as unknown as VercelRequest
  const code = (r: VercelRequest) => {
    try { requireAdmin(r) } catch (e) { return (e as ApiError).code }
    return 'OK'
  }

  it('acepta solo el passcode correcto como Bearer', () => {
    vi.stubEnv('ADMIN_PASSCODE', 'secreto-demo')
    expect(code(req('Bearer secreto-demo'))).toBe('OK')
    expect(code(req('Bearer otro'))).toBe('UNAUTHORIZED')
    expect(code(req('secreto-demo'))).toBe('UNAUTHORIZED')
    expect(code(req())).toBe('UNAUTHORIZED')
    expect(code(req('Bearer '))).toBe('UNAUTHORIZED')
  })

  it('falla cerrada: sin ADMIN_PASSCODE configurada nadie entra, ni con token vacío', () => {
    vi.stubEnv('ADMIN_PASSCODE', '')
    expect(code(req('Bearer '))).toBe('UNAUTHORIZED')
    expect(code(req('Bearer x'))).toBe('UNAUTHORIZED')
  })
})
