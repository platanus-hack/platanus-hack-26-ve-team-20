import { describe, expect, it, vi } from 'vitest'
import { emailConfigFromEnv, sendEmail, type EmailConfig } from '../../lib/notify/email.ts'
import { inviteEmailContent } from '../../lib/domain/officer-invite-sender.ts'

const config: EmailConfig = { apiKey: 're_test_no_real', from: 'SmartTraffic <no-responder@example.com>', dryRun: false }
const message = { to: 'agente@example.com', subject: 'Hola', text: 'cuerpo' }
const fake = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('sendEmail (Resend)', () => {
  it('envía con el remitente configurado y devuelve el id', async () => {
    const f = fake(200, { id: 'em_1' })
    expect(await sendEmail(message, { config, fetchImpl: f })).toEqual({ status: 'SENT', providerId: 'em_1' })
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer re_test_no_real')
    expect(JSON.parse(init.body as string)).toMatchObject({ from: config.from, to: ['agente@example.com'], subject: 'Hola' })
  })

  it('en seco no envía; sin configuración falla sin llamar a la red', async () => {
    const f = fake(200, { id: 'x' })
    expect(await sendEmail(message, { config: { ...config, dryRun: true }, fetchImpl: f })).toEqual({ status: 'DRY_RUN' })
    expect((await sendEmail(message, { config: { ...config, apiKey: '' }, fetchImpl: f })).status).toBe('FAILED')
    expect(f).not.toHaveBeenCalled()
  })

  it('un error HTTP o de red vuelve como fallo, sin lanzar ni exponer la clave', async () => {
    const http = await sendEmail(message, { config, fetchImpl: fake(403, { message: 'domain not verified' }) })
    expect(http).toMatchObject({ status: 'FAILED', reason: 'HTTP' })
    const boom = vi.fn(async () => { throw new TypeError('caído') }) as unknown as typeof fetch
    const net = await sendEmail(message, { config, fetchImpl: boom })
    expect(net).toMatchObject({ status: 'FAILED', reason: 'NETWORK' })
    expect(JSON.stringify([http, net])).not.toContain('re_test_no_real')
  })

  it('sin NOTIFY_DRY_RUN=false explícito la configuración queda en seco', () => {
    expect(emailConfigFromEnv({ RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.c' }).dryRun).toBe(true)
    expect(emailConfigFromEnv({ RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.c', NOTIFY_DRY_RUN: 'false' }).dryRun).toBe(false)
  })
})

describe('correo de invitación', () => {
  it('es formal, incluye el enlace y escapa el nombre en el HTML', () => {
    const c = inviteEmailContent({ to: 'a@b.c', name: '<b>Ana</b>', url: 'https://x.test/oficial/invitacion?token=abc', expiresAt: new Date(Date.now() + 3 * 86_400_000) })
    expect(c.text).toContain('https://x.test/oficial/invitacion?token=abc')
    expect(c.text).toMatch(/Usted/)
    expect(c.text).toContain('3 días')
    expect(c.html).not.toContain('<b>Ana</b>')
    expect(c.html).toContain('&lt;b&gt;Ana&lt;/b&gt;')
  })
})
