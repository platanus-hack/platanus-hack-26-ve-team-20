import { describe, expect, it, vi } from 'vitest'
import { emailConfigFromEnv, sendEmail, type EmailConfig } from '../../lib/notify/email.ts'
import { inviteEmailContent } from '../../lib/domain/officer-invite-sender.ts'

const message = { to: 'agente@example.com', subject: 'Hola', text: 'cuerpo' }

describe('sendEmail (SMTP)', () => {
  const smtp = { host: 'smtp.example.test', port: 465, user: 'cuenta@example.test', pass: 'contraseña-secreta-no-real' }
  const smtpConfig: EmailConfig = { from: 'SmartTraffic <cuenta@example.test>', dryRun: false, smtp }

  it('envía por SMTP con el remitente configurado', async () => {
    const smtpImpl = vi.fn(async () => ({ messageId: '<id@example.test>' }))
    const r = await sendEmail(message, { config: smtpConfig, smtpImpl })
    expect(r).toEqual({ status: 'SENT', providerId: '<id@example.test>' })
    expect(smtpImpl).toHaveBeenCalledWith(smtp, { from: smtpConfig.from, to: 'agente@example.com', subject: 'Hola', text: 'cuerpo' })
  })

  it('un rechazo del servidor vuelve como fallo SMTP sin exponer credenciales', async () => {
    const smtpImpl = vi.fn(async () => { throw new Error('535 Invalid login for cuenta@example.test pass=contraseña-secreta-no-real') })
    const r = await sendEmail(message, { config: smtpConfig, smtpImpl })
    expect(r).toMatchObject({ status: 'FAILED', reason: 'SMTP' })
    expect(JSON.stringify(r)).not.toContain('contraseña-secreta-no-real')
    expect(JSON.stringify(r)).not.toContain('cuenta@example.test')
  })

  it('en seco no abre conexión; sin SMTP o sin remitente falla', async () => {
    const smtpImpl = vi.fn(async () => ({ messageId: 'x' }))
    expect(await sendEmail(message, { config: { ...smtpConfig, dryRun: true }, smtpImpl })).toEqual({ status: 'DRY_RUN' })
    expect((await sendEmail(message, { config: { ...smtpConfig, from: '' }, smtpImpl })).status).toBe('FAILED')
    expect((await sendEmail(message, { config: { from: 'a@b.c', dryRun: false }, smtpImpl })).status).toBe('FAILED')
    expect(emailConfigFromEnv({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' }).dryRun).toBe(true) // sin NOTIFY_DRY_RUN=false no envía
    expect(smtpImpl).not.toHaveBeenCalled()
  })

  it('la configuración lee SMTP_*; el remitente por defecto es el usuario; puerto por defecto 465', () => {
    const env = { SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'yo@gmail.com', SMTP_PASS: 'abcd efgh', NOTIFY_DRY_RUN: 'false' }
    expect(emailConfigFromEnv(env)).toMatchObject({ from: 'yo@gmail.com', dryRun: false, smtp: { host: 'smtp.gmail.com', port: 465, user: 'yo@gmail.com', pass: 'abcd efgh' } })
    expect(emailConfigFromEnv({ ...env, SMTP_PORT: '587', EMAIL_FROM: 'ST <yo@gmail.com>' })).toMatchObject({ from: 'ST <yo@gmail.com>', smtp: { port: 587 } })
    expect(emailConfigFromEnv({ ...env, SMTP_PASS: '' }).smtp).toBeUndefined() // incompleto: no hay SMTP
    expect(emailConfigFromEnv({ EMAIL_FROM: 'a@b.c' }).smtp).toBeUndefined()
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
