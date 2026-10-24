import { describe, expect, it, vi } from 'vitest'
import {
  describeWhatsAppError,
  normalizeWhatsAppNumber,
  sendWhatsAppText,
  whatsappConfigFromEnv,
  type WhatsAppConfig,
} from './whatsapp.ts'

const CONFIG: WhatsAppConfig = {
  accessToken: 'token-de-prueba-no-real',
  phoneNumberId: '1141087575744689',
  graphVersion: 'v23.0',
  dryRun: false,
}
const MESSAGE = { to: '+58 412-000-0001', body: 'SmartTraffic (demo). Hola', callbackData: 'fine:fine_1' }

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

describe('whatsappConfigFromEnv', () => {
  it('sin NOTIFY_DRY_RUN no envía nada', () => {
    expect(whatsappConfigFromEnv({}).dryRun).toBe(true)
    expect(whatsappConfigFromEnv({ NOTIFY_DRY_RUN: '' }).dryRun).toBe(true)
  })

  it('lee las variables de WhatsApp', () => {
    expect(
      whatsappConfigFromEnv({
        NOTIFY_DRY_RUN: 'false',
        WHATSAPP_ACCESS_TOKEN: 't',
        WHATSAPP_PHONE_NUMBER_ID: '123',
        WHATSAPP_GRAPH_VERSION: 'v24.0',
      }),
    ).toEqual({ accessToken: 't', phoneNumberId: '123', graphVersion: 'v24.0', dryRun: false })
  })
})

describe('normalizeWhatsAppNumber', () => {
  it('deja solo dígitos y rechaza lo que no es un número internacional', () => {
    expect(normalizeWhatsAppNumber('+58 (412) 000-0001')).toBe('584120000001')
    expect(normalizeWhatsAppNumber('0412abc')).toBeNull()
    expect(normalizeWhatsAppNumber('123')).toBeNull()
  })
})

describe('sendWhatsAppText', () => {
  it('envía un texto a la Graph API y devuelve el wamid', async () => {
    const fetchImpl = fakeFetch(200, { messaging_product: 'whatsapp', messages: [{ id: 'wamid.ABC' }] })
    const r = await sendWhatsAppText(MESSAGE, { config: CONFIG, fetchImpl })
    expect(r).toEqual({ status: 'SENT', providerId: 'wamid.ABC' })

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v23.0/1141087575744689/messages')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-de-prueba-no-real')
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '584120000001',
      type: 'text',
      text: { body: 'SmartTraffic (demo). Hola', preview_url: true },
      biz_opaque_callback_data: 'fine:fine_1',
    })
  })

  it('en DRY_RUN no llama a Meta', async () => {
    const fetchImpl = fakeFetch(200, {})
    expect(await sendWhatsAppText(MESSAGE, { config: { ...CONFIG, dryRun: true }, fetchImpl })).toEqual({ status: 'DRY_RUN' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reconoce la ventana de 24 h cerrada', async () => {
    const fetchImpl = fakeFetch(400, { error: { message: 'Re-engagement message', code: 131047 } })
    const r = await sendWhatsAppText(MESSAGE, { config: CONFIG, fetchImpl })
    expect(r).toEqual({ status: 'FAILED', error: { reason: 'WINDOW_CLOSED', message: 'Re-engagement message', metaCode: 131047 } })
  })

  it('reconoce un destinatario no verificado en el número de prueba', async () => {
    const fetchImpl = fakeFetch(400, { error: { message: 'Recipient phone number not in allowed list', code: 131030 } })
    const r = await sendWhatsAppText(MESSAGE, { config: CONFIG, fetchImpl })
    expect(r.status === 'FAILED' && r.error.reason).toBe('RECIPIENT_NOT_ALLOWED')
  })

  it('otros errores de Meta quedan como META_ERROR con su código', async () => {
    const fetchImpl = fakeFetch(401, { error: { message: 'Invalid OAuth access token', code: 190 } })
    const r = await sendWhatsAppText(MESSAGE, { config: CONFIG, fetchImpl })
    expect(r).toEqual({ status: 'FAILED', error: { reason: 'META_ERROR', message: 'Invalid OAuth access token', metaCode: 190 } })
  })

  it('no lanza si falla la red o la respuesta no sirve', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const net = await sendWhatsAppText(MESSAGE, { config: CONFIG, fetchImpl: offline })
    expect(net.status === 'FAILED' && net.error.reason).toBe('NETWORK')

    const slow = vi.fn(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError')
    })
    const timeout = await sendWhatsAppText(MESSAGE, { config: CONFIG, fetchImpl: slow })
    expect(timeout.status === 'FAILED' && timeout.error.reason).toBe('TIMEOUT')

    const noId = await sendWhatsAppText(MESSAGE, { config: CONFIG, fetchImpl: fakeFetch(200, { messages: [] }) })
    expect(noId.status === 'FAILED' && noId.error.reason).toBe('INVALID_RESPONSE')

    const html = vi.fn(async () => new Response('<html>', { status: 502 }))
    const notJson = await sendWhatsAppText(MESSAGE, { config: CONFIG, fetchImpl: html })
    expect(notJson.status === 'FAILED' && notJson.error.reason).toBe('INVALID_RESPONSE')
  })

  it('valida destinatario, mensaje y configuración antes de llamar a Meta', async () => {
    const fetchImpl = fakeFetch(200, {})
    const badTo = await sendWhatsAppText({ ...MESSAGE, to: 'abc' }, { config: CONFIG, fetchImpl })
    expect(badTo.status === 'FAILED' && badTo.error.reason).toBe('INVALID_RECIPIENT')
    const empty = await sendWhatsAppText({ ...MESSAGE, body: '  ' }, { config: CONFIG, fetchImpl })
    expect(empty.status === 'FAILED' && empty.error.reason).toBe('CONFIG')
    const noToken = await sendWhatsAppText(MESSAGE, { config: { ...CONFIG, accessToken: '' }, fetchImpl })
    expect(noToken.status === 'FAILED' && noToken.error.reason).toBe('CONFIG')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('el token nunca aparece en el resultado', async () => {
    const fetchImpl = fakeFetch(401, { error: { message: 'Invalid OAuth access token', code: 190 } })
    const r = await sendWhatsAppText(MESSAGE, { config: CONFIG, fetchImpl })
    expect(JSON.stringify(r)).not.toContain(CONFIG.accessToken)
  })
})

describe('describeWhatsAppError', () => {
  it('arma el texto para Notification.error', () => {
    expect(describeWhatsAppError({ reason: 'WINDOW_CLOSED', message: 'Re-engagement message', metaCode: 131047 })).toBe(
      'WINDOW_CLOSED (131047): Re-engagement message',
    )
    expect(describeWhatsAppError({ reason: 'NETWORK', message: 'No se pudo conectar con Meta' })).toBe(
      'NETWORK: No se pudo conectar con Meta',
    )
  })
})
