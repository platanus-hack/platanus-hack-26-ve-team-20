import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoError } from './demo.ts'
import {
  apelarMulta, getMultas, getSesion, iniciarSesion, pagarMultas, reenviarNotificacion, reiniciarReal, sesionVencio, solicitarCodigo, verificarCodigo,
} from './real.ts'

const user = { cedula: 'V99000001', nombre: 'Ejemplo', telefono: '04120000777', correo: null }
const fine = (id: string, status = 'PENDING') => ({ id, token: `tok_${id}`, plate: 'AB123CD', status })

type Llamada = { url: string; init?: RequestInit }
let llamadas: Llamada[]
function simular(rutas: Record<string, { status?: number; body: unknown }>) {
  llamadas = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init })
    const r = rutas[url.split('?')[0]!]
    if (!r) throw new TypeError('sin ruta ' + url)
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  }))
}
const ok = (data: unknown) => ({ body: { ok: true, data } })
const falla = (status: number, code: string, reason?: string) => ({ status, body: { ok: false, error: { code, message: 'x', reason } } })

beforeEach(() => reiniciarReal())
afterEach(() => vi.unstubAllGlobals())

describe('cuenta real', () => {
  it('login: abre sesión local con la copia no sensible', async () => {
    simular({ '/api/citizen/login': ok({ user }) })
    const s = await iniciarSesion('v99000001', 'clave-larga')
    expect(s.cedula).toBe('V99000001')
    expect(getSesion()?.cedula).toBe('V99000001')
    expect(JSON.parse(llamadas[0]!.init!.body as string)).toEqual({ cedula: 'V99000001', password: 'clave-larga' })
    expect(JSON.stringify(getSesion())).not.toContain('clave-larga')
  })

  it('credenciales malas vuelven como CREDENCIALES (por reason)', async () => {
    simular({ '/api/citizen/login': falla(401, 'UNAUTHORIZED', 'CREDENCIALES') })
    await expect(iniciarSesion('V99000001', 'mala')).rejects.toMatchObject({ code: 'CREDENCIALES' })
    expect(getSesion()).toBeNull()
  })

  it('sin red lanza RED', async () => {
    simular({})
    await expect(iniciarSesion('V99000001', 'x')).rejects.toMatchObject({ code: 'RED' })
  })

  it('registro: teléfono enmascarado listo para mostrar y verificación abre sesión', async () => {
    simular({
      '/api/citizen/register': ok({ telefono: '0412-***0777' }),
      '/api/citizen/register/verify': ok({ user, vehicles: [{ plate: 'AB123CD', brand: 'X', model: 'Y', color: 'Z', year: null }] }),
    })
    const r = await solicitarCodigo({ cedula: 'V99000001', telefono: '04141111111', correo: null, clave: 'clave-larga' })
    expect(r.telefono).toBe('0412000' + '0777')
    const v = await verificarCodigo('123456')
    expect(v.vehiculos[0]!.plate).toBe('AB123CD')
    expect(getSesion()).not.toBeNull()
  })

  it('un 401 en una llamada protegida descarta la sesión y avisa', async () => {
    simular({ '/api/citizen/login': ok({ user }), '/api/citizen/fines': falla(401, 'UNAUTHORIZED') })
    await iniciarSesion('V99000001', 'clave-larga')
    await expect(getMultas()).rejects.toMatchObject({ code: 'SESION' })
    expect(getSesion()).toBeNull()
    expect(sesionVencio()).toBe(true)
  })

  it('sin sesión local no se llama al servidor', async () => {
    simular({})
    await expect(getMultas()).rejects.toBeInstanceOf(DemoError)
    expect(llamadas).toHaveLength(0)
  })

  it('paga cada multa con su token y mapea el rechazo', async () => {
    simular({
      '/api/citizen/login': ok({ user }),
      '/api/citizen/fines': ok({ items: [fine('a'), fine('b')] }),
      '/api/payments/c2p': ok({ status: 'REJECTED', failureCode: 'INSUFFICIENT_FUNDS' }),
    })
    await iniciarSesion('V99000001', 'clave-larga')
    const pago = { banco: '0102', telefono: '04120000777', cedula: 'V99000001', clave: '111111' }
    await expect(pagarMultas(['a'], pago)).rejects.toMatchObject({ code: 'FONDOS' })
    const c2p = llamadas.filter((l) => l.url === '/api/payments/c2p')
    expect(JSON.parse(c2p[0]!.init!.body as string).fineToken).toBe('tok_a')
  })

  it('apelar devuelve la multa sin exponer el token', async () => {
    simular({ '/api/citizen/login': ok({ user }), '/api/citizen/fines/a/appeal': ok(fine('a', 'APPEALED')) })
    await iniciarSesion('V99000001', 'clave-larga')
    const m = await apelarMulta('a')
    expect(m.status).toBe('APPEALED')
    expect('token' in m).toBe(false)
  })

  it('reenviar la notificación: POST a la multa y causas precisas del servidor', async () => {
    simular({ '/api/citizen/login': ok({ user }), '/api/citizen/fines/a/resend': ok({ status: 'SENT', telefono: '0412-***0777' }), '/api/citizen/fines/b/resend': falla(409, 'CONFLICT', 'NO_REENVIABLE'), '/api/citizen/fines/c/resend': falla(429, 'RATE_LIMITED') })
    await iniciarSesion('V99000001', 'clave-larga')
    expect(await reenviarNotificacion('a')).toEqual({ status: 'SENT', telefono: '0412-***0777' })
    expect(llamadas.at(-1)!.init!.method).toBe('POST')
    await expect(reenviarNotificacion('b')).rejects.toMatchObject({ code: 'NO_REENVIABLE' })
    await expect(reenviarNotificacion('c')).rejects.toMatchObject({ code: 'LIMITE' })
  })
})
