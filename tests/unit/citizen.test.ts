import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CitizenLoginSchema, CitizenPasswordSchema, CitizenRegisterSchema, CitizenResendSchema, CitizenVerifySchema,
} from '../../lib/contracts/index.ts'
import { codeHash, maskPhone, phoneToLocal, sendFailureMessage } from '../../lib/domain/citizen.ts'
import { createCodeSender } from '../../lib/domain/citizen-sender.ts'

afterEach(() => vi.unstubAllEnvs())

describe('teléfono', () => {
  it('convierte el formato internacional al local que usa el front', () => {
    expect(phoneToLocal('584264180319')).toBe('04264180319')
    expect(phoneToLocal('+58 426-418-0319')).toBe('04264180319')
    expect(phoneToLocal('04264180319')).toBe('04264180319') // ya local
  })

  it('el enmascarado solo deja el prefijo del operador y los 4 últimos dígitos', () => {
    expect(maskPhone('584264180319')).toBe('0426-***0319')
    const masked = maskPhone('584264180319')
    expect(masked).not.toContain('418') // los dígitos del medio nunca salen
  })
})

describe('codeHash', () => {
  it('es un HMAC determinista por titular y código, y distinto si cambia cualquiera', () => {
    vi.stubEnv('SESSION_SECRET', 's'.repeat(40))
    const a = codeHash('per_1', '123456')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(codeHash('per_1', '123456')).toBe(a)
    expect(codeHash('per_1', '123457')).not.toBe(a)
    expect(codeHash('per_2', '123456')).not.toBe(a)
    expect(a).not.toContain('123456')
  })

  it('cambia con el secreto y falla cerrado sin SESSION_SECRET válido', () => {
    vi.stubEnv('SESSION_SECRET', 's'.repeat(40))
    const a = codeHash('per_1', '123456')
    vi.stubEnv('SESSION_SECRET', 't'.repeat(40))
    expect(codeHash('per_1', '123456')).not.toBe(a)
    for (const bad of ['', 'corta']) {
      vi.stubEnv('SESSION_SECRET', bad)
      expect(() => codeHash('per_1', '123456')).toThrow('SESSION_SECRET')
    }
  })
})

describe('esquemas de entrada', () => {
  it('registro: cédula normalizada, contraseña de 8+ y correo opcional', () => {
    const ok = CitizenRegisterSchema.parse({ cedula: 'v-99.123.456', password: 'contraseña1' })
    expect(ok.cedula).toBe('V99123456')
    expect(CitizenRegisterSchema.parse({ cedula: 'E91234567', password: '12345678', email: ' Yo@Correo.COM ' }).email).toBe('yo@correo.com')
    expect(CitizenRegisterSchema.parse({ cedula: 'V99123456', password: '12345678', email: '' }).email).toBeNull()
    expect(CitizenRegisterSchema.parse({ cedula: 'V99123456', password: '12345678', email: null }).email).toBeNull()
    for (const bad of [
      { cedula: 'V99123456', password: '1234567' }, // 7 caracteres
      { cedula: 'V99123456', password: 'x'.repeat(201) },
      { cedula: 'J99123456', password: '12345678' }, // solo V/E para ciudadanos
      { cedula: '99123456', password: '12345678' }, // sin letra
      { cedula: 'V99123456', password: '12345678', email: 'no-es-correo' },
      { password: '12345678' },
    ]) expect(() => CitizenRegisterSchema.parse(bad), JSON.stringify(bad)).toThrow()
  })

  it('teléfono opcional: se normaliza a formato internacional y se rechaza lo que no es venezolano', () => {
    const phone = (v: unknown) => CitizenRegisterSchema.parse({ cedula: 'V99123456', password: '12345678', phone: v }).phone
    expect(phone('0412-123 4567')).toBe('584121234567')
    expect(phone('+58 (426) 123-4567')).toBe('584261234567')
    expect(phone('584141234567')).toBe('584141234567')
    expect(phone('')).toBeNull()
    expect(phone(null)).toBeNull()
    expect(CitizenRegisterSchema.parse({ cedula: 'V99123456', password: '12345678' }).phone).toBeUndefined()
    for (const bad of ['04991234567', '0412123456', '12345', 'abc', '+1 555 123 4567']) {
      expect(() => phone(bad), bad).toThrow()
    }
  })

  it('código: exactamente 6 dígitos', () => {
    expect(CitizenVerifySchema.parse({ cedula: 'V99123456', code: '012345' }).code).toBe('012345')
    for (const code of ['12345', '1234567', 'abcdef', '12 345', '']) {
      expect(() => CitizenVerifySchema.parse({ cedula: 'V99123456', code }), code).toThrow()
    }
  })

  it('reenvío, login y cambio de contraseña', () => {
    expect(CitizenResendSchema.parse({ cedula: 'v99123456' }).cedula).toBe('V99123456')
    expect(CitizenLoginSchema.parse({ cedula: 'V99123456', password: 'x' }).password).toBe('x')
    expect(() => CitizenLoginSchema.parse({ cedula: 'V99123456', password: '' })).toThrow()
    expect(CitizenPasswordSchema.parse({ current: 'a', next: '12345678' })).toEqual({ current: 'a', next: '12345678' })
    expect(() => CitizenPasswordSchema.parse({ current: 'a', next: '1234567' })).toThrow()
  })
})

describe('createCodeSender (WhatsApp)', () => {
  const config = { accessToken: 'tok-de-prueba', phoneNumberId: '12345', graphVersion: 'v23.0', dryRun: false }
  const fakeFetch = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it('envía el código al teléfono indicado y lo da por entregado', async () => {
    const f = fakeFetch(200, { messages: [{ id: 'wamid.1' }] })
    const out = await createCodeSender({ config, fetchImpl: f })('584120000777', '482913')
    expect(out).toEqual({ delivered: true })
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!
    expect(url).toContain('/12345/messages')
    const sent = JSON.parse(init.body as string)
    expect(sent.to).toBe('584120000777')
    expect(sent.text.body).toContain('482913')
    expect(sent.text.body).toMatch(/usted/i) // trato formal
  })

  it('con WHATSAPP_TEMPLATE_CODE usa la plantilla de autenticación (cuerpo y botón con el código)', async () => {
    vi.stubEnv('WHATSAPP_TEMPLATE_CODE', 'smarttraffic_codigo')
    const f = fakeFetch(200, { messages: [{ id: 'wamid.2' }] })
    expect(await createCodeSender({ config, fetchImpl: f })('584120000777', '482913')).toEqual({ delivered: true })
    const [, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!
    const sent = JSON.parse(init.body as string)
    expect(sent.type).toBe('template')
    expect(sent.template.name).toBe('smarttraffic_codigo')
    expect(sent.template.language.code).toBe('es')
    expect(sent.template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: '482913' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '482913' }] },
    ])
    expect(sent.text).toBeUndefined()
  })

  it('con NOTIFY_DRY_RUN no envía y lo informa como no entregado', async () => {
    const f = fakeFetch(200, {})
    expect(await createCodeSender({ config: { ...config, dryRun: true }, fetchImpl: f })('584120000777', '482913')).toEqual({ delivered: false, reason: 'DRY_RUN' })
    expect(f).not.toHaveBeenCalled()
  })

  it('un fallo de Meta (ventana de 24 h cerrada) vuelve como no entregado con su causa', async () => {
    const f = fakeFetch(400, { error: { message: 'Re-engagement message', code: 131047 } })
    expect(await createCodeSender({ config, fetchImpl: f })('584120000777', '482913')).toEqual({ delivered: false, reason: 'WINDOW_CLOSED' })
  })

  it('nunca lanza ni deja el código en un mensaje de error', async () => {
    const boom = vi.fn(async () => { throw new TypeError('red caída') }) as unknown as typeof fetch
    const out = await createCodeSender({ config, fetchImpl: boom })('584120000777', '482913')
    expect(out.delivered).toBe(false)
    expect(JSON.stringify(out)).not.toContain('482913')
    expect((await createCodeSender({ config, fetchImpl: boom })('no-es-telefono', '482913')).delivered).toBe(false)
  })
})

describe('mensaje cuando el código no sale', () => {
  it('dice qué pasó según el motivo', () => {
    expect(sendFailureMessage('DRY_RUN')).toMatch(/desactivado/)
    expect(sendFailureMessage('CONFIG')).toMatch(/no está configurado/)
    expect(sendFailureMessage('WINDOW_CLOSED')).toMatch(/Escriba un mensaje/)
    expect(sendFailureMessage('RECIPIENT_NOT_ALLOWED')).toMatch(/número autorizado/)
    expect(sendFailureMessage('NETWORK')).toMatch(/unos minutos/)
  })
})
