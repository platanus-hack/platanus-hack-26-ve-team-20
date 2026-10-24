import { afterEach, describe, expect, it, vi } from 'vitest'
import { appBaseUrlFromEnv, createNotifier, type FineMessageData, type NotificationOutcome, type NotificationRepo } from './notifier.ts'
import type { WhatsAppSendResult } from './whatsapp.ts'

const FINE: FineMessageData = {
  to: '584120000001',
  type: 'RED_LIGHT',
  intersection: 'Av. Demo Norte con Calle 1 (ejemplo)',
  occurredAt: new Date('2026-10-24T14:03:10Z'),
  plate: 'AB123CD',
  amountCents: 2_500_000,
  currency: 'VES',
  publicToken: 'tok-de-ejemplo-123',
}

function memoryRepo(overrides: Partial<NotificationRepo> = {}) {
  const rows: Array<{ id: string; fineId?: string; alertId?: string; to: string; template: string; outcome?: NotificationOutcome }> = []
  const repo: NotificationRepo = {
    async fineMessage(id) {
      return id === 'fine_1' ? FINE : id === 'fine_sin_dueno' ? { ...FINE, to: null } : null
    },
    async paymentMessage(id) {
      return id === 'fine_1' ? { to: FINE.to, plate: FINE.plate, reference: 'SIM-48213977' } : { to: FINE.to, plate: FINE.plate, reference: null }
    },
    async alertMessage(id) {
      if (id !== 'alr_1' && id !== 'alr_sin_oficial') return null
      return {
        to: id === 'alr_1' ? '584120000101' : null,
        plate: 'XY987ZT',
        vehicle: 'Ford Explorer blanca',
        unpaidCount: 2,
        intersection: 'Av. Demo Norte con Calle 1 (ejemplo)',
        seenAt: new Date(Date.now() - 2 * 60_000),
        distanceM: 420,
      }
    },
    async create(n) {
      rows.push({ id: `ntf_${rows.length + 1}`, ...n })
      return `ntf_${rows.length}`
    },
    async finish(id, outcome) {
      const row = rows.find((r) => r.id === id)
      if (row) row.outcome = outcome
    },
    ...overrides,
  }
  return { repo, rows }
}

function setup(result: WhatsAppSendResult = { status: 'SENT', providerId: 'wamid.X' }, repoOverrides: Partial<NotificationRepo> = {}) {
  const { repo, rows } = memoryRepo(repoOverrides)
  const send = vi.fn(async () => result)
  const notifier = createNotifier({ repo, send, appBaseUrl: 'https://smartvia-smart-via.vercel.app' })
  return { notifier, rows, send }
}

afterEach(() => vi.restoreAllMocks())

describe('notifyFineIssued', () => {
  it('envía el aviso al dueño y deja la Notification en SENT con el wamid', async () => {
    const s = setup()
    expect(await s.notifier.notifyFineIssued('fine_1')).toEqual({ channel: 'WHATSAPP', status: 'SENT', providerId: 'wamid.X' })
    expect(s.rows).toEqual([
      { id: 'ntf_1', fineId: 'fine_1', to: '584120000001', template: 'FINE_ISSUED', outcome: { status: 'SENT', providerId: 'wamid.X' } },
    ])
    const [msg] = s.send.mock.calls[0] as unknown as [{ to: string; body: string; callbackData: string }]
    expect(msg.to).toBe('584120000001')
    expect(msg.callbackData).toBe('fine:fine_1')
    expect(msg.body).toContain('placa AB***CD')
    expect(msg.body).toContain('https://smartvia-smart-via.vercel.app/multa/tok-de-ejemplo-123')
    expect(msg.body).not.toContain('AB123CD')
  })

  it('en DRY_RUN registra sin enviar de verdad', async () => {
    const s = setup({ status: 'DRY_RUN' })
    expect(await s.notifier.notifyFineIssued('fine_1')).toEqual({ channel: 'WHATSAPP', status: 'DRY_RUN' })
    expect(s.rows[0]?.outcome).toEqual({ status: 'DRY_RUN' })
  })

  it('si Meta falla queda FAILED con el motivo (p. ej. ventana de 24 h cerrada)', async () => {
    const s = setup({ status: 'FAILED', error: { reason: 'WINDOW_CLOSED', message: 'Re-engagement message', metaCode: 131047 } })
    expect(await s.notifier.notifyFineIssued('fine_1')).toEqual({ channel: 'WHATSAPP', status: 'FAILED' })
    expect(s.rows[0]?.outcome).toEqual({ status: 'FAILED', error: 'WINDOW_CLOSED (131047): Re-engagement message' })
  })

  it('sin teléfono del dueño registra FAILED sin llamar a Meta', async () => {
    const s = setup()
    expect((await s.notifier.notifyFineIssued('fine_sin_dueno')).status).toBe('FAILED')
    expect(s.send).not.toHaveBeenCalled()
    expect(s.rows[0]).toMatchObject({ to: '', outcome: { status: 'FAILED', error: 'Sin teléfono del destinatario' } })
  })

  it('multa inexistente o DB caída: devuelve FAILED y no lanza', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = setup()
    expect((await s.notifier.notifyFineIssued('no_existe')).status).toBe('FAILED')
    expect(s.rows).toEqual([])

    const broken = setup(undefined, {
      async fineMessage() {
        throw new Error('db caída')
      },
    })
    expect((await broken.notifier.notifyFineIssued('fine_1')).status).toBe('FAILED')
  })
})

describe('notifyPaymentConfirmed', () => {
  it('confirma con la referencia del pago aprobado', async () => {
    const s = setup()
    expect((await s.notifier.notifyPaymentConfirmed('fine_1')).status).toBe('SENT')
    const [msg] = s.send.mock.calls[0] as unknown as [{ body: string; callbackData: string }]
    expect(msg.body).toBe('VíaClara (demo). Pago simulado recibido. Ref SIM-48213977. Multa AB***CD saldada.')
    expect(msg.callbackData).toBe('payment:fine_1')
    expect(s.rows[0]?.template).toBe('PAYMENT_CONFIRMED')
  })

  it('sin pago aprobado no envía nada', async () => {
    const s = setup()
    expect((await s.notifier.notifyPaymentConfirmed('fine_sin_pago')).status).toBe('FAILED')
    expect(s.send).not.toHaveBeenCalled()
  })
})

describe('notifyOfficerAlert', () => {
  it('avisa al oficial con placa completa, distancia y minutos, ligado a la alerta', async () => {
    const s = setup()
    expect((await s.notifier.notifyOfficerAlert('alr_1')).status).toBe('SENT')
    const [msg] = s.send.mock.calls[0] as unknown as [{ to: string; body: string; callbackData: string }]
    expect(msg.to).toBe('584120000101')
    expect(msg.callbackData).toBe('alert:alr_1')
    expect(msg.body).toBe(
      'VíaClara · Alerta: vehículo XY987ZT (Ford Explorer blanca) con 2 multas impagas visto en ' +
        'Av. Demo Norte con Calle 1 (ejemplo) hace 2 min, a 420 m de su posición. Verifique antes de actuar.',
    )
    expect(s.rows[0]).toMatchObject({ alertId: 'alr_1', template: 'OFFICER_ALERT', outcome: { status: 'SENT' } })
    expect(s.rows[0]?.fineId).toBeUndefined()
  })

  it('alerta sin oficial o inexistente: FAILED sin enviar', async () => {
    const s = setup()
    expect((await s.notifier.notifyOfficerAlert('alr_sin_oficial')).status).toBe('FAILED')
    expect((await s.notifier.notifyOfficerAlert('no_existe')).status).toBe('FAILED')
    expect(s.send).not.toHaveBeenCalled()
  })
})

describe('appBaseUrlFromEnv', () => {
  it('APP_BASE_URL, luego el dominio de producción de Vercel, luego localhost', () => {
    expect(appBaseUrlFromEnv({ APP_BASE_URL: 'https://a.example', VERCEL_PROJECT_PRODUCTION_URL: 'b.example' })).toBe('https://a.example')
    expect(appBaseUrlFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'b.example' })).toBe('https://b.example')
    expect(appBaseUrlFromEnv({})).toBe('http://localhost:3000')
  })
})

describe('lib/notify/index.ts', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('con USE_MOCKS=true usa los mocks sin tocar la DB', async () => {
    vi.stubEnv('USE_MOCKS', 'true')
    vi.stubEnv('DATABASE_URL', '')
    const { notifyFineIssued } = await import('./index.ts')
    expect(await notifyFineIssued('fine_1')).toMatchObject({ channel: 'WHATSAPP', status: 'DRY_RUN' })
  })
})
