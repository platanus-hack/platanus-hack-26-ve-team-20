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

describe('sendEmail (SMTP)', () => {
  const smtp = { host: 'smtp.example.test', port: 465, user: 'cuenta@example.test', pass: 'contraseña-secreta-no-real' }
  const smtpConfig: EmailConfig = { apiKey: '', from: 'SmartTraffic <cuenta@example.test>', dryRun: false, smtp }

  it('envía por SMTP con el remitente y tiene prioridad sobre Resend', async () => {
    const smtpImpl = vi.fn(async () => ({ messageId: '<id@example.test>' }))
    const f = fake(200, { id: 'no-debe-usarse' })
    const r = await sendEmail(message, { config: { ...smtpConfig, apiKey: 're_x' }, smtpImpl, fetchImpl: f })
    expect(r).toEqual({ status: 'SENT', providerId: '<id@example.test>' })
    expect(smtpImpl).toHaveBeenCalledWith(smtp, { from: smtpConfig.from, to: 'agente@example.com', subject: 'Hola', text: 'cuerpo' })
    expect(f).not.toHaveBeenCalled()
  })

  it('un rechazo del servidor vuelve como fallo SMTP sin exponer credenciales', async () => {
    const smtpImpl = vi.fn(async () => { throw new Error('535 Invalid login for cuenta@example.test pass=contraseña-secreta-no-real') })
    const r = await sendEmail(message, { config: smtpConfig, smtpImpl })
    expect(r).toMatchObject({ status: 'FAILED', reason: 'SMTP' })
    expect(JSON.stringify(r)).not.toContain('contraseña-secreta-no-real')
    expect(JSON.stringify(r)).not.toContain('cuenta@example.test')
  })

  it('en seco no abre conexión; sin remitente falla', async () => {
    const smtpImpl = vi.fn(async () => ({ messageId: 'x' }))
    expect(await sendEmail(message, { config: { ...smtpConfig, dryRun: true }, smtpImpl })).toEqual({ status: 'DRY_RUN' })
    expect((await sendEmail(message, { config: { ...smtpConfig, from: '' }, smtpImpl })).status).toBe('FAILED')
    expect(smtpImpl).not.toHaveBeenCalled()
  })

  it('la configuración lee SMTP_*; el remitente por defecto es el usuario; puerto por defecto 465', () => {
    const env = { SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'yo@gmail.com', SMTP_PASS: 'abcd efgh', NOTIFY_DRY_RUN: 'false' }
    expect(emailConfigFromEnv(env)).toMatchObject({ from: 'yo@gmail.com', dryRun: false, smtp: { host: 'smtp.gmail.com', port: 465, user: 'yo@gmail.com', pass: 'abcd efgh' } })
    expect(emailConfigFromEnv({ ...env, SMTP_PORT: '587', EMAIL_FROM: 'ST <yo@gmail.com>' })).toMatchObject({ from: 'ST <yo@gmail.com>', smtp: { port: 587 } })
    expect(emailConfigFromEnv({ ...env, SMTP_PASS: '' }).smtp).toBeUndefined() // incompleto: no hay SMTP
    expect(emailConfigFromEnv({ RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.c' }).smtp).toBeUndefined()
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
