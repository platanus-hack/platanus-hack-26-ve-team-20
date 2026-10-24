import type { VercelRequest } from '@vercel/node'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertSameOrigin, getClientIp, requireAdmin, requireCamera, requireCameraOrAdmin, requireOfficer, safeEqual,
} from '../../api/_lib/auth.ts'
import { ApiError } from '../../api/_lib/respond.ts'
import { MIN_PASSWORD_LENGTH, dummyHash, hashPassword, verifyPassword } from '../../lib/auth/password.ts'
import {
  COOKIE_NAMES, clearCookie, passwordFingerprint, readCookie, sessionCookie, signSession, verifySession,
} from '../../lib/auth/session.ts'

const SECRET = 'x'.repeat(48)
const NOW = new Date('2026-10-24T12:00:00.000Z')
afterEach(() => vi.unstubAllEnvs())

describe('contraseñas (scrypt)', () => {
  it('hash con formato autodescriptivo, sal distinta cada vez y verificación correcta', async () => {
    const a = await hashPassword('una-contraseña-larga')
    const b = await hashPassword('una-contraseña-larga')
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/)
    expect(a).not.toBe(b)
    expect(a).not.toContain('una-contraseña-larga')
    expect(await verifyPassword('una-contraseña-larga', a)).toBe(true)
    expect(await verifyPassword('una-contraseña-larga', b)).toBe(true)
    expect(await verifyPassword('otra-contraseña-larga', a)).toBe(false)
    expect(await verifyPassword('', a)).toBe(false)
  })

  it('rechaza contraseñas cortas al crear el hash', async () => {
    await expect(hashPassword('x'.repeat(MIN_PASSWORD_LENGTH - 1))).rejects.toThrow(String(MIN_PASSWORD_LENGTH))
  })

  it('un hash mal formado o manipulado nunca lanza: simplemente no coincide', async () => {
    const good = await hashPassword('una-contraseña-larga')
    const [s, n, r, p, salt] = good.split('$')
    const bad = [
      '', 'texto', 'bcrypt$1$2$3$a$b', 'scrypt$16384$8$1$solo-salt', `${s}$${n}$${r}$${p}$${salt}$`,
      `${s}$3$${r}$${p}$${salt}$AAAA`, // N no es potencia de 2
      `${s}$${2 ** 25}$${r}$${p}$${salt}$AAAA`, // N fuera de cotas
      `${s}$${n}$99$${p}$${salt}$AAAA`, // r fuera de cotas
      `${s}$${n}$${r}$${p}$${salt}$${'A'.repeat(86)}`, // hash ajeno
    ]
    for (const h of bad) expect(await verifyPassword('una-contraseña-larga', h), h).toBe(false)
  })

  it('el hash falso (para usuarios inexistentes) es válido pero no acepta contraseñas comunes', async () => {
    const d = await dummyHash()
    expect(await dummyHash()).toBe(d) // se calcula una sola vez
    expect(await verifyPassword('admin123456', d)).toBe(false)
  })
})

describe('sesiones firmadas', () => {
  const sign = (over: Partial<Parameters<typeof signSession>[0]> = {}) => {
    vi.stubEnv('SESSION_SECRET', SECRET)
    return signSession({ role: 'admin', sub: 'adm_1', ph: 'abc123', now: NOW, ...over })
  }

  it('firma y verifica: devuelve rol, sujeto, huella y vigencia', () => {
    const t = sign()
    expect(verifySession(t, 'admin', NOW)).toMatchObject({ r: 'admin', s: 'adm_1', ph: 'abc123' })
    expect(verifySession(t, 'admin', new Date(NOW.getTime() + 7 * 3600_000))).not.toBeNull()
  })

  it('caduca: 8 h para admin, 12 h para oficial; o el TTL indicado', () => {
    const t = sign()
    expect(verifySession(t, 'admin', new Date(NOW.getTime() + 8 * 3600_000 + 1000))).toBeNull()
    const o = sign({ role: 'officer', sub: 'off_1', ph: undefined })
    expect(verifySession(o, 'officer', new Date(NOW.getTime() + 11 * 3600_000))).not.toBeNull()
    expect(verifySession(o, 'officer', new Date(NOW.getTime() + 12 * 3600_000 + 1000))).toBeNull()
    expect(verifySession(sign({ ttlS: 60 }), 'admin', new Date(NOW.getTime() + 61_000))).toBeNull()
  })

  it('una sesión de un rol no sirve para otro', () => {
    expect(verifySession(sign(), 'officer', NOW)).toBeNull()
    expect(verifySession(sign({ role: 'officer', sub: 'o', ph: undefined }), 'admin', NOW)).toBeNull()
  })

  it('rechaza firma alterada, payload alterado, secreto distinto y formatos raros', () => {
    const t = sign()
    const [body, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ r: 'admin', s: 'otro', ph: 'abc123', iat: 0, exp: 9_999_999_999 })).toString('base64url')
    for (const bad of [`${forged}.${sig}`, `${body}.${sig!.slice(0, -2)}AA`, `${body}.`, `.${sig}`, `${t}.extra`, 'basura', '', undefined]) {
      expect(verifySession(bad, 'admin', NOW), String(bad)).toBeNull()
    }
    vi.stubEnv('SESSION_SECRET', 'y'.repeat(48))
    expect(verifySession(t, 'admin', NOW)).toBeNull()
  })

  it('falla cerrada sin SESSION_SECRET o con una demasiado corta', () => {
    const t = sign()
    vi.stubEnv('SESSION_SECRET', '')
    expect(verifySession(t, 'admin', NOW)).toBeNull()
    expect(() => signSession({ role: 'admin', sub: 'a', now: NOW })).toThrow('SESSION_SECRET')
    vi.stubEnv('SESSION_SECRET', 'corta')
    expect(verifySession(t, 'admin', NOW)).toBeNull()
    expect(() => signSession({ role: 'admin', sub: 'a', now: NOW })).toThrow('SESSION_SECRET')
  })

  it('la huella cambia con el hash de la contraseña', () => {
    expect(passwordFingerprint('h1')).toHaveLength(12)
    expect(passwordFingerprint('h1')).toBe(passwordFingerprint('h1'))
    expect(passwordFingerprint('h1')).not.toBe(passwordFingerprint('h2'))
  })
})

describe('cookies', () => {
  it('la cookie de sesión es HttpOnly, SameSite=Lax y Secure en Vercel', () => {
    const dev = sessionCookie('admin', 'tok', { secure: false })
    expect(dev).toMatch(/^vc_admin=tok; Path=\/; Max-Age=28800; HttpOnly; SameSite=Lax$/)
    expect(sessionCookie('admin', 'tok', { secure: true })).toContain('; Secure')
    vi.stubEnv('VERCEL', '1')
    expect(sessionCookie('officer', 'tok')).toMatch(/^vc_officer=tok;.*Secure$/)
  })

  it('clearCookie la borra con Max-Age=0', () => {
    expect(clearCookie('admin', { secure: false })).toBe('vc_admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')
  })

  it('readCookie encuentra el valor entre varias cookies y no confunde prefijos', () => {
    expect(readCookie('a=1; vc_admin=abc.def; b=2', 'vc_admin')).toBe('abc.def')
    expect(readCookie('xvc_admin=mal; vc_admin=bien', 'vc_admin')).toBe('bien')
    expect(readCookie('a=1', 'vc_admin')).toBeUndefined()
    expect(readCookie(undefined, 'vc_admin')).toBeUndefined()
    expect(readCookie('vc_admin=a%2Bb', 'vc_admin')).toBe('a+b')
  })
})

const req = (headers: Record<string, string | string[]> = {}, method = 'GET') => ({ method, headers }) as unknown as VercelRequest
const code = async (fn: () => unknown) => {
  try { await fn() } catch (e) { return (e as ApiError).code }
  return 'OK'
}

describe('requireCamera / requireOfficer', () => {
  it('cámara: solo con X-Camera-Key correcta; sin CAMERA_API_KEY nadie entra', async () => {
    vi.stubEnv('CAMERA_API_KEY', 'clave-de-camara')
    expect(await code(() => requireCamera(req({ 'x-camera-key': 'clave-de-camara' })))).toBe('OK')
    const bad: Array<Record<string, string>> = [{}, { 'x-camera-key': 'otra' }, { 'x-camera-key': '' }]
    for (const h of bad) expect(await code(() => requireCamera(req(h)))).toBe('UNAUTHORIZED')
    vi.stubEnv('CAMERA_API_KEY', '')
    expect(await code(() => requireCamera(req({ 'x-camera-key': '' })))).toBe('UNAUTHORIZED')
    expect(await code(() => requireCamera(req({ 'x-camera-key': 'x' })))).toBe('UNAUTHORIZED')
  })

  it('oficial: cookie firmada del rol oficial; devuelve el id', () => {
    vi.stubEnv('SESSION_SECRET', SECRET)
    const token = signSession({ role: 'officer', sub: 'off_9' })
    expect(requireOfficer(req({ cookie: `${COOKIE_NAMES.officer}=${token}` }))).toEqual({ officerId: 'off_9' })
    const adminToken = signSession({ role: 'admin', sub: 'adm', ph: 'x' })
    expect(() => requireOfficer(req({ cookie: `${COOKIE_NAMES.officer}=${adminToken}` }))).toThrow(ApiError)
    expect(() => requireOfficer(req())).toThrow(ApiError)
  })

  it('safeEqual compara en tiempo constante y sin errores de largo', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })
})

describe('requireAdmin / requireCameraOrAdmin', () => {
  const user = { id: 'adm_1', email: 'a@x.com', name: 'Admin', passwordHash: 'scrypt$hash-actual', active: true }
  const db = (u: typeof user | null) => ({ adminUser: { findUnique: vi.fn(async () => u) } }) as never
  const cookie = (over: { sub?: string; ph?: string | undefined; role?: 'admin' | 'officer' } = {}) => {
    vi.stubEnv('SESSION_SECRET', SECRET)
    const t = signSession({ role: over.role ?? 'admin', sub: over.sub ?? user.id, ph: 'ph' in over ? over.ph : passwordFingerprint(user.passwordHash) })
    return { cookie: `${COOKIE_NAMES[over.role ?? 'admin']}=${t}` }
  }

  it('acepta una sesión válida y devuelve solo id, correo y nombre (nunca el hash)', async () => {
    const out = await requireAdmin(db(user), req(cookie()))
    expect(out).toEqual({ id: 'adm_1', email: 'a@x.com', name: 'Admin' })
    expect(JSON.stringify(out)).not.toContain('scrypt')
  })

  it('rechaza: sin cookie, cuenta inexistente, desactivada, contraseña cambiada, sesión sin huella o de oficial', async () => {
    expect(await code(() => requireAdmin(db(user), req()))).toBe('UNAUTHORIZED')
    expect(await code(() => requireAdmin(db(null), req(cookie())))).toBe('UNAUTHORIZED')
    expect(await code(() => requireAdmin(db({ ...user, active: false }), req(cookie())))).toBe('UNAUTHORIZED')
    expect(await code(() => requireAdmin(db({ ...user, passwordHash: 'scrypt$otro-hash' }), req(cookie())))).toBe('UNAUTHORIZED')
    expect(await code(() => requireAdmin(db(user), req(cookie({ ph: undefined }))))).toBe('UNAUTHORIZED')
    expect(await code(() => requireAdmin(db(user), req(cookie({ role: 'officer' }))))).toBe('UNAUTHORIZED')
  })

  it('sin SESSION_SECRET nadie entra, ni con una cookie que antes fue válida', async () => {
    const c = cookie()
    vi.stubEnv('SESSION_SECRET', '')
    expect(await code(() => requireAdmin(db(user), req(c)))).toBe('UNAUTHORIZED')
  })

  it('camera | admin: la clave de cámara o la sesión; una clave de cámara errónea no cae a admin', async () => {
    vi.stubEnv('CAMERA_API_KEY', 'clave-de-camara')
    expect(await requireCameraOrAdmin(db(null), req({ 'x-camera-key': 'clave-de-camara' }))).toEqual({ kind: 'camera' })
    const admin = await requireCameraOrAdmin(db(user), req(cookie()))
    expect(admin).toMatchObject({ kind: 'admin', admin: { id: 'adm_1' } })
    expect(await code(() => requireCameraOrAdmin(db(user), req({ 'x-camera-key': 'mala', ...cookie() })))).toBe('UNAUTHORIZED')
  })
})

describe('assertSameOrigin / getClientIp', () => {
  it('métodos seguros no se revisan; POST con Origin ajeno se rechaza', async () => {
    expect(await code(() => assertSameOrigin(req({ origin: 'https://evil.example', host: 'app.vercel.app' }, 'GET')))).toBe('OK')
    expect(await code(() => assertSameOrigin(req({ origin: 'https://app.vercel.app', host: 'app.vercel.app' }, 'POST')))).toBe('OK')
    expect(await code(() => assertSameOrigin(req({ origin: 'https://evil.example', host: 'app.vercel.app' }, 'POST')))).toBe('UNAUTHORIZED')
    expect(await code(() => assertSameOrigin(req({ origin: 'no-es-url', host: 'app.vercel.app' }, 'POST')))).toBe('UNAUTHORIZED')
  })

  it('sin Origin (curl, servidor a servidor) se permite; x-forwarded-host tiene prioridad sobre host', async () => {
    expect(await code(() => assertSameOrigin(req({ host: 'app.vercel.app' }, 'POST')))).toBe('OK')
    expect(await code(() => assertSameOrigin(req({ origin: 'https://app.com', host: 'interno', 'x-forwarded-host': 'app.com' }, 'POST')))).toBe('OK')
    // Con proxy, manda x-forwarded-host: un Origin que solo coincide con el host interno se rechaza.
    expect(await code(() => assertSameOrigin(req({ origin: 'https://interno', host: 'interno', 'x-forwarded-host': 'app.com' }, 'DELETE')))).toBe('UNAUTHORIZED')
  })

  it('la IP sale de las cabeceras de Vercel, la primera de la lista', () => {
    expect(getClientIp(req({ 'x-vercel-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7')
    expect(getClientIp(req({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2')
    expect(getClientIp(req({ 'x-forwarded-for': '192.0.2.9, 10.0.0.1' }))).toBe('192.0.2.9')
    expect(getClientIp(req())).toBeNull()
  })
})
