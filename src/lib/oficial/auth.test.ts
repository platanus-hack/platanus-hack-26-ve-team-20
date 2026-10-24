import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoError } from '../demo/demo.ts'
import * as real from './auth.ts'
import { aceptarInvitacion, getSesionOficial, listarMultas, reiniciarOficial, telefonoValido, verificarInvitacion } from './api.ts'

const codigo = (p: Promise<unknown>) => p.then(() => 'OK', (e: unknown) => (e instanceof DemoError ? e.code : String(e)))
const TOKEN = 'A'.repeat(43)
const CLAVE = 'clave-larga-123'
const officer = { id: 'of_1', badge: 'OF-0007', name: 'Oficial Siete (ejemplo)', email: 'siete@example.com' }

beforeEach(() => reiniciarOficial())
afterEach(() => vi.unstubAllGlobals())

describe('invitación (demo)', () => {
  it('demo-invitacion es válida; cualquier otro token no', async () => {
    expect((await verificarInvitacion('demo-invitacion')).email).toBe('nuevo.oficial@example.com')
    expect(await codigo(verificarInvitacion('otro'))).toBe('NO_ENCONTRADA')
    expect(await codigo(verificarInvitacion(''))).toBe('NO_ENCONTRADA')
  })

  it('teléfono con el mismo formato que el contrato', () => {
    for (const t of ['04121234567', '0412-123 4567', '+58 412 1234567', '584261234567']) expect(telefonoValido(t)).toBe(true)
    for (const t of ['0413123456', '02121234567', '0412123456', '']) expect(telefonoValido(t)).toBe(false)
  })

  it('valida teléfono y contraseña antes de crear la cuenta', async () => {
    const base = { token: 'demo-invitacion', phone: '04121234567', password: CLAVE }
    expect(await codigo(aceptarInvitacion({ ...base, phone: '123' }))).toBe('VALIDACION')
    expect(await codigo(aceptarInvitacion({ ...base, password: 'corta1234' }))).toBe('VALIDACION')
    expect(await codigo(aceptarInvitacion({ ...base, token: 'otro' }))).toBe('NO_ENCONTRADA')
    expect(getSesionOficial()).toBeNull()
  })

  it('aceptar abre la sesión sin token ni contraseña, y los datos de ejemplo la aceptan', async () => {
    const s = await aceptarInvitacion({ token: 'demo-invitacion', name: '  Ana Pérez (ejemplo) ', phone: '0412-123 4567', password: CLAVE })
    expect(s).toMatchObject({ badge: 'OF-0042', name: 'Ana Pérez (ejemplo)', email: 'nuevo.oficial@example.com' })
    const guardada = JSON.stringify(getSesionOficial())
    expect(guardada).not.toContain('demo-invitacion')
    expect(guardada).not.toContain(CLAVE)
    expect(await codigo(listarMultas())).toBe('OK')
  })
})

describe('acceso real (fetch simulado)', () => {
  let cuerpos: unknown[]
  function responder(status: number, body: unknown) {
    cuerpos = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      cuerpos.push(init?.body && JSON.parse(init.body as string))
      return new Response(JSON.stringify(body), { status })
    }))
  }
  const falla = (code: string, reason?: string) => ({ ok: false, error: { code, message: 'Mensaje del servidor', reason } })

  it('login: guarda solo el DTO, sin contraseña, y abre los datos de ejemplo', async () => {
    responder(200, { ok: true, data: { officer: { ...officer, extra: 'x' } } })
    await real.iniciarSesionOficial(' Siete@Example.com ', CLAVE)
    expect(cuerpos[0]).toEqual({ email: 'siete@example.com', password: CLAVE })
    const s = getSesionOficial()
    expect(Object.keys(s ?? {}).sort()).toEqual(['badge', 'email', 'expira', 'id', 'name'])
    expect(JSON.stringify(s)).not.toContain(CLAVE)
    expect(await codigo(listarMultas())).toBe('OK')
  })

  it('aceptar: 201 guarda la sesión sin el token', async () => {
    responder(201, { ok: true, data: { officer } })
    const s = await real.aceptarInvitacion({ token: TOKEN, name: 'Siete', phone: '04121234567', password: CLAVE })
    expect(s.badge).toBe('OF-0007')
    expect(cuerpos[0]).toEqual({ token: TOKEN, name: 'Siete', phone: '04121234567', password: CLAVE })
    expect(JSON.stringify(getSesionOficial())).not.toContain(TOKEN)
  })

  it('mapea los errores del servidor', async () => {
    responder(404, falla('NOT_FOUND', 'INVITACION_INVALIDA'))
    expect(await codigo(real.verificarInvitacion(TOKEN))).toBe('NO_ENCONTRADA')
    responder(401, falla('UNAUTHORIZED', 'CREDENCIALES'))
    expect(await codigo(real.iniciarSesionOficial('a@example.com', 'x'))).toBe('CREDENCIALES')
    responder(429, falla('RATE_LIMITED'))
    expect(await codigo(real.iniciarSesionOficial('a@example.com', 'x'))).toBe('LIMITE')
    responder(500, falla('INTERNAL_ERROR'))
    expect(await codigo(real.aceptarInvitacion({ token: TOKEN, phone: '04121234567', password: CLAVE }))).toBe('RED')
    responder(400, falla('VALIDATION_ERROR'))
    await expect(real.aceptarInvitacion({ token: TOKEN, phone: '04121234567', password: CLAVE })).rejects.toMatchObject({ code: 'VALIDACION', message: 'Mensaje del servidor' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('sin red') }))
    expect(await codigo(real.iniciarSesionOficial('a@example.com', 'x'))).toBe('RED')
    expect(getSesionOficial()).toBeNull()
  })

  it('un token mal formado es inválido sin ir al servidor', async () => {
    responder(200, { ok: true, data: {} })
    expect(await codigo(real.verificarInvitacion('corto'))).toBe('NO_ENCONTRADA')
    expect(cuerpos).toEqual([])
  })
})
