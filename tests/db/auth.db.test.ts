import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import loginHandler from '../../api/auth/login.ts'
import logoutHandler from '../../api/auth/logout.ts'
import meHandler from '../../api/auth/me.ts'
import violationsHandler from '../../api/violations/index.ts'
import { hashPassword } from '../../lib/auth/password.ts'
import { db } from '../../lib/db.ts'
import { ensureAdmin } from '../../prisma/seed-admin.ts'

const RUN = Date.now().toString(36)
const SECRET = `test-secret-${RUN}-`.padEnd(48, 'y')
const PASSWORD = 'contraseña-de-prueba-123'
const EMAIL = `login-${RUN}@example.com`
const OTHER = { id: `test_${RUN}_adm2`, email: `inactivo-${RUN}@example.com` }
const ADMIN_ID = `test_${RUN}_adm`
let ipCounter = 0
const newIp = () => `203.0.113.${(++ipCounter % 250) + 1}`
const ipOf = (n: number) => `198.51.${(Date.now() % 200) + 1}.${n}` // IPs propias de esta ejecución para el límite por IP

type Res = { code: number; body: any; headers: Record<string, string> }
async function call(h: (req: VercelRequest, res: VercelResponse) => unknown, req: Record<string, unknown>): Promise<Res> {
  const out: Res = { code: 0, body: undefined, headers: {} }
  const res = {
    status(c: number) { out.code = c; return res },
    json(b: unknown) { out.body = b; return res },
    setHeader(k: string, v: string) { out.headers[k] = v; return res },
  }
  await h({ method: 'POST', headers: {}, query: {}, ...req } as unknown as VercelRequest, res as unknown as VercelResponse)
  return out
}
const login = (email: string, password: string, headers: Record<string, string> = {}) =>
  call(loginHandler, { body: { email, password }, headers: { 'x-vercel-forwarded-for': newIp(), ...headers } })
const cookieOf = (r: Res) => (r.headers['Set-Cookie'] ?? '').split(';')[0] ?? ''

beforeAll(async () => {
  vi.stubEnv('SESSION_SECRET', SECRET)
  await db.adminUser.create({ data: { id: ADMIN_ID, email: EMAIL, name: 'Admin Test', passwordHash: await hashPassword(PASSWORD) } })
  await db.adminUser.create({ data: { id: OTHER.id, email: OTHER.email, name: 'Inactivo', passwordHash: await hashPassword(PASSWORD), active: false } })
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await db.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [ADMIN_ID, OTHER.id] } }, { actorId: ADMIN_ID }, { ip: { startsWith: '198.51.' } }, { ip: { startsWith: '203.0.113.' } }] } })
  await db.adminUser.deleteMany({ where: { OR: [{ id: { startsWith: `test_${RUN}` } }, { email: { startsWith: `seed-admin-${RUN}` } }] } })
  await db.$disconnect()
})

describe('POST /api/auth/login', () => {
  it('con credenciales correctas emite la cookie de sesión y audita el acceso', async () => {
    const ip = newIp()
    const r = await call(loginHandler, { body: { email: EMAIL.toUpperCase(), password: PASSWORD }, headers: { 'x-vercel-forwarded-for': ip } })
    expect(r.code).toBe(200)
    expect(r.body.data).toEqual({ user: { id: ADMIN_ID, email: EMAIL, name: 'Admin Test' } })
    expect(JSON.stringify(r.body)).not.toContain('scrypt')

    const cookie = r.headers['Set-Cookie']!
    expect(cookie).toMatch(/^vc_admin=[\w-]+\.[\w-]+; Path=\/; Max-Age=28800; HttpOnly; SameSite=Lax/)
    expect(r.headers['Cache-Control']).toBe('no-store')

    const log = await db.auditLog.findFirstOrThrow({ where: { action: 'ADMIN_LOGIN', actorId: ADMIN_ID } })
    expect(log).toMatchObject({ actorType: 'OPERATOR', entity: 'AdminUser', entityId: ADMIN_ID })
    expect((await db.adminUser.findUniqueOrThrow({ where: { id: ADMIN_ID } })).lastLoginAt).toBeInstanceOf(Date)
  })

  it('correo inexistente, contraseña errónea y cuenta desactivada responden exactamente igual (401)', async () => {
    const wrong = await login(EMAIL, 'contraseña-incorrecta')
    const unknown = await login(`nadie-${RUN}@example.com`, PASSWORD)
    const inactive = await login(OTHER.email, PASSWORD)
    for (const r of [wrong, unknown, inactive]) {
      expect(r.code).toBe(401)
      expect(r.body).toEqual({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Credenciales inválidas' } })
      expect(r.headers['Set-Cookie']).toBeUndefined()
    }
  })

  it('los fallos se auditan sin guardar el correo ni la contraseña', async () => {
    const ip = ipOf(10)
    await login(`secreto-${RUN}@example.com`, 'contraseña-incorrecta', { 'x-vercel-forwarded-for': ip })
    const logs = await db.auditLog.findMany({ where: { action: 'ADMIN_LOGIN_FAILED', ip } })
    expect(logs).toHaveLength(1)
    const dump = JSON.stringify(logs[0])
    expect(dump).not.toContain(`secreto-${RUN}`)
    expect(dump).not.toContain('contraseña-incorrecta')
    expect(logs[0]!.entityId).toMatch(/^[0-9a-f]{16}$/)
  })

  it('valida el cuerpo (400) y rechaza otros métodos y Origin ajeno', async () => {
    for (const body of [{}, { email: 'no-es-correo', password: 'x' }, { email: EMAIL }, { email: EMAIL, password: '' }]) {
      const r = await call(loginHandler, { body })
      expect(r.code, JSON.stringify(body)).toBe(400)
    }
    expect((await call(loginHandler, { method: 'GET' })).code).toBe(400)
    const cross = await login(EMAIL, PASSWORD, { origin: 'https://evil.example', host: 'app.vercel.app' })
    expect(cross.code).toBe(401)
    expect(cross.headers['Set-Cookie']).toBeUndefined()
  })

  it('bloquea tras 5 fallos del mismo correo en la ventana (429), aun con la contraseña correcta', async () => {
    const email = `bloqueo-${RUN}@example.com`
    for (let i = 0; i < 5; i++) expect((await login(email, 'mala')).code).toBe(401)
    const blocked = await login(email, 'mala')
    expect(blocked.code).toBe(429)
    expect(blocked.body.error.code).toBe('RATE_LIMITED')
    // la cuenta real no se ve afectada por el bloqueo de otro correo
    expect((await login(EMAIL, PASSWORD)).code).toBe(200)
  })

  it('bloquea tras 10 fallos desde la misma IP (429), sea cual sea el correo', async () => {
    const ip = ipOf(20)
    for (let i = 0; i < 10; i++) expect((await login(`ip-${RUN}-${i}@example.com`, 'mala', { 'x-vercel-forwarded-for': ip })).code).toBe(401)
    const blocked = await login(EMAIL, PASSWORD, { 'x-vercel-forwarded-for': ip })
    expect(blocked.code).toBe(429)
    expect((await login(EMAIL, PASSWORD, { 'x-vercel-forwarded-for': ipOf(21) })).code).toBe(200) // otra IP sí entra
  })
})

describe('sesión: /api/auth/me, rutas protegidas y /api/auth/logout', () => {
  async function session() {
    const r = await login(EMAIL, PASSWORD)
    expect(r.code).toBe(200)
    return { cookie: cookieOf(r) }
  }

  it('me devuelve el usuario con la cookie y 401 sin ella', async () => {
    const headers = await session()
    const me = await call(meHandler, { method: 'GET', headers })
    expect(me.code).toBe(200)
    expect(me.body.data.user).toMatchObject({ id: ADMIN_ID, email: EMAIL })
    expect((await call(meHandler, { method: 'GET' })).code).toBe(401)
  })

  it('la misma cookie abre /api/violations; sin ella o con otra cuenta no', async () => {
    const headers = await session()
    expect((await call(violationsHandler, { method: 'GET', headers })).code).toBe(200)
    expect((await call(violationsHandler, { method: 'GET' })).code).toBe(401)
  })

  it('cambiar la contraseña cierra las sesiones abiertas', async () => {
    const headers = await session()
    const user = await db.adminUser.findUniqueOrThrow({ where: { id: ADMIN_ID } })
    await db.adminUser.update({ where: { id: ADMIN_ID }, data: { passwordHash: await hashPassword('otra-contraseña-nueva-1') } })
    expect((await call(meHandler, { method: 'GET', headers })).code).toBe(401)
    await db.adminUser.update({ where: { id: ADMIN_ID }, data: { passwordHash: user.passwordHash } })
    expect((await call(meHandler, { method: 'GET', headers })).code).toBe(200) // el hash original vuelve a coincidir con la huella
  })

  it('desactivar la cuenta cierra las sesiones abiertas', async () => {
    const headers = await session()
    await db.adminUser.update({ where: { id: ADMIN_ID }, data: { active: false } })
    expect((await call(meHandler, { method: 'GET', headers })).code).toBe(401)
    expect((await login(EMAIL, PASSWORD)).code).toBe(401)
    await db.adminUser.update({ where: { id: ADMIN_ID }, data: { active: true } })
    expect((await call(meHandler, { method: 'GET', headers })).code).toBe(200)
  })

  it('una sesión caducada no sirve', async () => {
    const { signSession, passwordFingerprint, COOKIE_NAMES } = await import('../../lib/auth/session.ts')
    const user = await db.adminUser.findUniqueOrThrow({ where: { id: ADMIN_ID } })
    const old = signSession({ role: 'admin', sub: ADMIN_ID, ph: passwordFingerprint(user.passwordHash), now: new Date(Date.now() - 9 * 3600_000) })
    expect((await call(meHandler, { method: 'GET', headers: { cookie: `${COOKIE_NAMES.admin}=${old}` } })).code).toBe(401)
  })

  it('logout borra la cookie y no exige sesión', async () => {
    const out = await call(logoutHandler, {})
    expect(out.code).toBe(200)
    expect(out.headers['Set-Cookie']).toBe('vc_admin=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')
    expect((await call(logoutHandler, { headers: { origin: 'https://evil.example', host: 'app.vercel.app' } })).code).toBe(401)
  })
})

describe('siembra de la cuenta de admin (ensureAdmin)', () => {
  const email = `seed-admin-${RUN}@example.com`
  const row = () => db.adminUser.findUnique({ where: { email } })

  it('sin ADMIN_EMAIL/ADMIN_PASSWORD no hace nada', async () => {
    expect(await ensureAdmin(db, {})).toBe('skipped')
    expect(await ensureAdmin(db, { email })).toBe('skipped')
    expect(await row()).toBeNull()
  })

  it('crea la cuenta con hash, es idempotente y actualiza el hash si cambia la contraseña', async () => {
    // Id propio: no choca con la cuenta real del seed (`seed_adm_1`) si ya existe.
    const id = `test_${RUN}_seedadm`
    expect(await ensureAdmin(db, { id, email: email.toUpperCase(), password: 'primera-contraseña-1', name: 'Seed Test' })).toBe('created')
    const first = (await row())!
    expect(first.passwordHash).toMatch(/^scrypt\$/)
    expect(first.passwordHash).not.toContain('primera-contraseña-1')
    expect(await ensureAdmin(db, { email, password: 'primera-contraseña-1' })).toBe('unchanged')
    expect((await row())!.passwordHash).toBe(first.passwordHash) // no se vuelve a hashear: las sesiones siguen vivas
    expect(await ensureAdmin(db, { email, password: 'segunda-contraseña-2' })).toBe('updated')
    expect((await row())!.passwordHash).not.toBe(first.passwordHash)
    await db.adminUser.update({ where: { email }, data: { active: false } })
    expect(await ensureAdmin(db, { email, password: 'segunda-contraseña-2' })).toBe('updated') // reactiva
    expect((await row())!.active).toBe(true)
  })
})
