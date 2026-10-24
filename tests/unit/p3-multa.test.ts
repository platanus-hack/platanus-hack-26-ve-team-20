import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadFine, payFine } from '../../src/components/multa/api.ts'
import { EMPTY_FORM, rejectionMessage, toC2PRequest, validateC2PForm } from '../../src/components/multa/c2p-form.ts'
import { fixtureFine } from '../../src/components/multa/fixtures.ts'
import { formatAmount, formatDateTime, isPayable, statusLabel } from '../../src/components/multa/format.ts'

const VALID = { bankCode: '0102', phone: '0412-123 4567', cedulaPrefix: 'V' as const, cedulaNumber: '12.345.678', c2pKey: '123456' }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('formulario C2P', () => {
  it('acepta datos válidos y arma el pedido con el schema de contratos', () => {
    expect(validateC2PForm(VALID)).toEqual({})
    expect(toC2PRequest(VALID, 'x7Gq-token-de-ejemplo', 'intento-0001')).toEqual({
      fineToken: 'x7Gq-token-de-ejemplo',
      payerBankCode: '0102',
      payerPhone: '04121234567',
      payerCedula: 'V12345678',
      c2pKey: '123456',
      idempotencyKey: 'intento-0001',
    })
  })

  it('marca cada campo vacío con un mensaje en español', () => {
    expect(validateC2PForm(EMPTY_FORM)).toEqual({
      bankCode: 'Seleccione su banco.',
      phone: 'Ingrese el teléfono afiliado a Pago Móvil.',
      cedulaNumber: 'Ingrese su número de cédula.',
      c2pKey: 'Ingrese la clave C2P que generó en su banco.',
    })
  })

  it('rechaza formatos inválidos', () => {
    const errors = validateC2PForm({ bankCode: '9999', phone: '02121234567', cedulaPrefix: 'E', cedulaNumber: '12', c2pKey: '12345' })
    expect(Object.keys(errors).sort()).toEqual(['bankCode', 'c2pKey', 'cedulaNumber', 'phone'])
  })

  it('explica los rechazos del simulador', () => {
    expect(rejectionMessage('INVALID_KEY')).toMatch(/clave C2P no es válida/)
    expect(rejectionMessage('INSUFFICIENT_FUNDS')).toMatch(/fondos suficientes/)
    expect(rejectionMessage('OTRO')).toMatch(/rechazó el pago/)
  })
})

describe('formatos de pantalla', () => {
  it('monto, fecha en Caracas y estado', () => {
    expect(formatAmount(2_500_000, 'VES')).toBe('Bs. 25.000,00')
    expect(formatDateTime('2026-10-24T14:03:10Z')).toBe('24/10/2026, 10:03 a. m.')
    expect(statusLabel('PENDING', false)).toEqual({ text: 'Pendiente', tone: 'red' })
    expect(statusLabel('PENDING', true)).toEqual({ text: 'Pendiente · vencida', tone: 'red' })
    expect(statusLabel('PAID', false)).toEqual({ text: 'Pagada', tone: 'green' })
    expect(isPayable('PENDING')).toBe(true)
    expect(isPayable('PAID')).toBe(false)
  })
})

describe('loadFine', () => {
  it('usa la API cuando responde', async () => {
    const fine = { ...fixtureFine('demo-pendiente'), token: 'real-token-123' }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, data: fine })))
    expect(await loadFine('real-token-123')).toMatchObject({ kind: 'ok', source: 'api', fine: { token: 'real-token-123' } })
  })

  it('respeta el 404 de la API aunque el token sea de ejemplo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'x' } }, 404)))
    expect(await loadFine('demo-pendiente')).toEqual({ kind: 'not_found' })
  })

  it('sin API (el SPA devuelve HTML) usa los datos de ejemplo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } })))
    expect(await loadFine('demo-pagada')).toMatchObject({ kind: 'ok', source: 'fixture', fine: { status: 'PAID' } })
    expect(await loadFine('token-desconocido')).toEqual({ kind: 'unavailable' })
  })

  it('sin red y sin multa de ejemplo = unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))))
    expect(await loadFine('token-desconocido')).toEqual({ kind: 'unavailable' })
  })
})

describe('payFine', () => {
  const req = toC2PRequest(VALID, 'x7Gq-token-de-ejemplo', 'intento-0001')

  it('traduce las respuestas de la API', async () => {
    const approved = { ok: true, data: { status: 'APPROVED', reference: 'SIM-12345678', paidAt: '2026-10-24T14:10:00Z', simulated: true } }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(approved)))
    expect(await payFine(req, 'api')).toEqual({ kind: 'approved', reference: 'SIM-12345678', paidAt: '2026-10-24T14:10:00Z' })

    const rejected = { ok: true, data: { status: 'REJECTED', failureCode: 'INVALID_KEY', simulated: true } }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(rejected)))
    expect(await payFine(req, 'api')).toEqual({ kind: 'rejected', failureCode: 'INVALID_KEY' })

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false, error: { code: 'ALREADY_PAID', message: 'x' } }, 409)))
    expect(await payFine(req, 'api')).toEqual({ kind: 'already_paid' })
  })

  it('envía el pedido una sola vez por intento, con su idempotencyKey', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, data: { status: 'APPROVED', reference: 'SIM-1', paidAt: 'x', simulated: true } }))
    vi.stubGlobal('fetch', fetchMock)
    await payFine(req, 'api')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/payments/c2p')
    expect(JSON.parse(String(init.body))).toMatchObject({ idempotencyKey: 'intento-0001', fineToken: 'x7Gq-token-de-ejemplo' })
  })

  it('con datos de ejemplo simula en el navegador con las reglas de docs/04 §5', async () => {
    vi.useFakeTimers()
    const run = async (c2pKey: string) => {
      const p = payFine({ ...req, c2pKey }, 'fixture')
      await vi.advanceTimersByTimeAsync(1000)
      return p
    }
    expect(await run('000000')).toEqual({ kind: 'rejected', failureCode: 'INVALID_KEY' })
    expect(await run('111111')).toEqual({ kind: 'rejected', failureCode: 'INSUFFICIENT_FUNDS' })
    expect(await run('123456')).toMatchObject({ kind: 'approved', reference: expect.stringMatching(/^SIM-\d{8}$/) })
  })
})
