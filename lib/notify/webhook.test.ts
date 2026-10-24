import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  handleWebhookGet,
  handleWebhookPost,
  nextNotificationStatus,
  parseWebhookPayload,
  verifyWebhookChallenge,
  verifyWebhookSignature,
  type NotificationStatusStore,
  type WebhookStatusEvent,
} from './webhook.ts'

const APP_SECRET = 'secreto-de-app-de-prueba'
const VERIFY_TOKEN = 'verify-token-de-prueba'
const sign = (body: string, secret = APP_SECRET) => `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`

// Forma de un evento real de Meta (campo `messages`), con datos falsos
const PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '1037765382761710',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15556313722', phone_number_id: '1141087575744689' },
            statuses: [
              { id: 'wamid.A', status: 'delivered', timestamp: '1792850000', recipient_id: '584120000001', biz_opaque_callback_data: 'fine:fine_1' },
              { id: 'wamid.A', status: 'read', timestamp: '1792850060', recipient_id: '584120000001' },
              { id: 'wamid.B', status: 'failed', timestamp: '1792850100', recipient_id: '584120000002', errors: [{ code: 131047, title: 'Re-engagement message' }] },
              { id: 'wamid.C', status: 'algo-nuevo', timestamp: '1792850200' },
            ],
            messages: [{ from: '584120000001', id: 'wamid.IN1', timestamp: '1792850300', type: 'text', text: { body: 'PAGAR' } }],
          },
        },
      ],
    },
  ],
}

function post(body: string, signature: string | null) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (signature !== null) headers.set('X-Hub-Signature-256', signature)
  return new Request('https://example.test/api/webhooks/whatsapp', { method: 'POST', body, headers })
}

function storeReturning(outcomes: Record<string, 'UPDATED' | 'UNCHANGED' | 'NOT_FOUND'>) {
  const seen: WebhookStatusEvent[] = []
  const store: NotificationStatusStore = {
    async apply(event) {
      seen.push(event)
      return outcomes[`${event.providerId}:${event.status}`] ?? 'NOT_FOUND'
    },
  }
  return { store, seen }
}

describe('verificación del GET (hub.challenge)', () => {
  const params = (mode: string, token: string, challenge = '12345') =>
    new URLSearchParams({ 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge })

  it('devuelve el challenge solo con el token correcto', () => {
    expect(verifyWebhookChallenge(params('subscribe', VERIFY_TOKEN), VERIFY_TOKEN)).toBe('12345')
    expect(verifyWebhookChallenge(params('subscribe', 'otro'), VERIFY_TOKEN)).toBeNull()
    expect(verifyWebhookChallenge(params('unsubscribe', VERIFY_TOKEN), VERIFY_TOKEN)).toBeNull()
    expect(verifyWebhookChallenge(params('subscribe', ''), '')).toBeNull()
  })

  it('responde el challenge en texto plano o 403', async () => {
    const ok = handleWebhookGet(
      new Request(`https://example.test/api/webhooks/whatsapp?${params('subscribe', VERIFY_TOKEN, 'abc')}`),
      { verifyToken: VERIFY_TOKEN },
    )
    expect(ok.status).toBe(200)
    expect(await ok.text()).toBe('abc')
    const bad = handleWebhookGet(new Request(`https://example.test/x?${params('subscribe', 'otro')}`), { verifyToken: VERIFY_TOKEN })
    expect(bad.status).toBe(403)
  })
})

describe('firma X-Hub-Signature-256', () => {
  const body = JSON.stringify(PAYLOAD)

  it('acepta la firma correcta sobre el body crudo', () => {
    expect(verifyWebhookSignature(body, sign(body), APP_SECRET)).toBe(true)
    expect(verifyWebhookSignature(body, sign(body).toUpperCase().replace('SHA256=', 'sha256='), APP_SECRET)).toBe(true)
  })

  it('rechaza firma de otra clave, body alterado, formato raro o sin secreto', () => {
    expect(verifyWebhookSignature(body, sign(body, 'otra-clave'), APP_SECRET)).toBe(false)
    expect(verifyWebhookSignature(`${body} `, sign(body), APP_SECRET)).toBe(false)
    expect(verifyWebhookSignature(body, 'sha1=abc', APP_SECRET)).toBe(false)
    expect(verifyWebhookSignature(body, null, APP_SECRET)).toBe(false)
    expect(verifyWebhookSignature(body, sign(body, ''), '')).toBe(false)
  })
})

describe('parseWebhookPayload', () => {
  it('extrae estados y mensajes, e ignora el elemento desconocido', () => {
    const parsed = parseWebhookPayload(PAYLOAD)
    expect(parsed?.statuses).toEqual([
      { providerId: 'wamid.A', status: 'DELIVERED', at: new Date(1_792_850_000_000), callbackData: 'fine:fine_1' },
      { providerId: 'wamid.A', status: 'READ', at: new Date(1_792_850_060_000) },
      { providerId: 'wamid.B', status: 'FAILED', at: new Date(1_792_850_100_000), error: '131047: Re-engagement message' },
    ])
    expect(parsed?.messages).toEqual([{ id: 'wamid.IN1', from: '584120000001', at: new Date(1_792_850_300_000), text: 'PAGAR' }])
  })

  it('devuelve null si no es un evento de WhatsApp Business', () => {
    expect(parseWebhookPayload({ object: 'page', entry: [] })).toBeNull()
    expect(parseWebhookPayload('hola')).toBeNull()
  })
})

describe('nextNotificationStatus', () => {
  it('sube de estado y nunca baja', () => {
    expect(nextNotificationStatus('SENT', 'DELIVERED')).toBe('DELIVERED')
    expect(nextNotificationStatus('DELIVERED', 'READ')).toBe('READ')
    expect(nextNotificationStatus('SENT', 'READ')).toBe('READ')
    expect(nextNotificationStatus('READ', 'DELIVERED')).toBeNull()
    expect(nextNotificationStatus('DELIVERED', 'DELIVERED')).toBeNull()
  })

  it('FAILED solo antes de la entrega, y una entrega posterior lo corrige', () => {
    expect(nextNotificationStatus('SENT', 'FAILED')).toBe('FAILED')
    expect(nextNotificationStatus('DELIVERED', 'FAILED')).toBeNull()
    expect(nextNotificationStatus('FAILED', 'DELIVERED')).toBe('DELIVERED')
  })

  it('un DRY_RUN nunca cambia', () => {
    expect(nextNotificationStatus('DRY_RUN', 'DELIVERED')).toBeNull()
  })
})

describe('handleWebhookPost', () => {
  afterEach(() => vi.restoreAllMocks())
  const body = JSON.stringify(PAYLOAD)

  it('con firma válida aplica cada estado y cuenta los resultados', async () => {
    const { store, seen } = storeReturning({ 'wamid.A:DELIVERED': 'UPDATED', 'wamid.A:READ': 'UPDATED', 'wamid.B:FAILED': 'UNCHANGED' })
    const res = await handleWebhookPost(post(body, sign(body)), { appSecret: APP_SECRET, verifyToken: VERIFY_TOKEN, store })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, data: { statuses: 3, updated: 2, unchanged: 1, notFound: 0, messages: 1 } })
    expect(seen.map((e) => `${e.providerId}:${e.status}`)).toEqual(['wamid.A:DELIVERED', 'wamid.A:READ', 'wamid.B:FAILED'])
  })

  it('firma inválida o ausente = 401 sin tocar el store', async () => {
    const { store, seen } = storeReturning({})
    const config = { appSecret: APP_SECRET, verifyToken: VERIFY_TOKEN, store }
    expect((await handleWebhookPost(post(body, sign(body, 'otra')), config)).status).toBe(401)
    expect((await handleWebhookPost(post(body, null), config)).status).toBe(401)
    expect(seen).toEqual([])
  })

  it('body firmado que no es JSON o no es de WhatsApp = 400', async () => {
    const { store } = storeReturning({})
    const config = { appSecret: APP_SECRET, verifyToken: VERIFY_TOKEN, store }
    expect((await handleWebhookPost(post('no-json', sign('no-json')), config)).status).toBe(400)
    const page = JSON.stringify({ object: 'page', entry: [] })
    expect((await handleWebhookPost(post(page, sign(page)), config)).status).toBe(400)
  })

  it('si el store falla responde 500 para que Meta reintente', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store: NotificationStatusStore = {
      async apply() {
        throw new Error('db caída')
      },
    }
    const res = await handleWebhookPost(post(body, sign(body)), { appSecret: APP_SECRET, verifyToken: VERIFY_TOKEN, store })
    expect(res.status).toBe(500)
  })

  it('sin clave secreta configurada no acepta nada', async () => {
    const { store } = storeReturning({})
    const res = await handleWebhookPost(post(body, sign(body, '')), { appSecret: '', verifyToken: VERIFY_TOKEN, store })
    expect(res.status).toBe(500)
  })
})

describe('api/webhooks/whatsapp.ts', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('lee el verify token del entorno', async () => {
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', VERIFY_TOKEN)
    const { GET } = await import('../../api/webhooks/whatsapp.ts')
    const query = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'xyz' })
    const res = GET(new Request(`https://example.test/api/webhooks/whatsapp?${query}`))
    expect(await res.text()).toBe('xyz')
  })
})
