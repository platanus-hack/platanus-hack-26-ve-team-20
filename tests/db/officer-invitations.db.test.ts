import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import p1 from '../../api/p1.ts'
import { hashPassword } from '../../lib/auth/password.ts'
import { COOKIE_NAMES, passwordFingerprint, signSession } from '../../lib/auth/session.ts'
import { db } from '../../lib/db.ts'
import { hashInviteToken } from '../../lib/domain/officer-invitations.ts'

// Invitaciones de oficiales de punta a punta por el router real (api/p1.ts). El correo va en seco
// (NOTIFY_DRY_RUN sin "false"): la respuesta trae `inviteUrl` y de ahí sale el token.
const RUN = Date.now().toString(36)
const PASSWORD = 'clave-de-oficial-1'
const IPS = Array.from({ length: 10 }, (_, i) => `192.0.2.${200 + i}`)
let n = 0

type Res = { code: number; body: any; setCookie: string | undefined }
async function http(route: string, o: { method?: string; body?: unknown; cookie?: string; query?: Record<string, string>; ip?: number } = {}): Promise<Res> {
  const out: Res = { code: 0, body: undefined, setCookie: undefined }
  const res = {
    status(c: number) { out.code = c; return res },
    json(b: unknown) { out.body = b; return res },
    setHeader(k: string, v: string) { if (k === 'Set-Cookie') out.setCookie = v; return res },
  }
  const headers = { 'x-vercel-forwarded-for': IPS[o.ip ?? 0]!, ...(o.cookie && { cookie: o.cookie }) }
  await p1({ method: o.method ?? 'POST', headers, query: { route, ...o.query }, body: o.body ?? {} } as unknown as VercelRequest, res as unknown as VercelResponse)
  return out
}

let adminId = ''
let adminCookie = ''
const emails: string[] = []
const email = () => {
  const e = `test_${RUN}_${++n}@example.com`
  emails.push(e)
  return e
}
const tokenOf = (r: Res) => new URL(r.body.data.inviteUrl).searchParams.get('token')!
const invite = (e: string, name = 'Agente Prueba', ip = 0) => http('admin-invitations', { cookie: adminCookie, body: { email: e, name }, ip })
const PHONE = '0412-555 0101'

beforeAll(async () => {
  vi.stubEnv('SESSION_SECRET', `test-secret-${RUN}-`.padEnd(48, 'o'))
  vi.stubEnv('NOTIFY_DRY_RUN', 'true')
  vi.stubEnv('APP_BASE_URL', 'https://app.example.test')
  const passwordHash = await hashPassword('clave-admin-de-prueba', 10)
  adminId = `test_${RUN}_admin`
  await db.adminUser.create({ data: { id: adminId, email: `test_${RUN}_admin@example.com`, name: 'Admin Prueba', passwordHash } })
  adminCookie = `${COOKIE_NAMES.admin}=${signSession({ role: 'admin', sub: adminId, ph: passwordFingerprint(passwordHash) })}`
})

afterAll(async () => {
  vi.unstubAllEnvs()
  const officers = await db.officer.findMany({ where: { email: { in: emails } }, select: { id: true } })
  const invitations = await db.officerInvitation.findMany({ where: { email: { in: emails } }, select: { id: true } })
  const ids = [adminId, ...officers.map((o) => o.id), ...invitations.map((i) => i.id)]
  await db.auditLog.deleteMany({ where: { OR: [{ ip: { in: IPS } }, { entityId: { in: ids } }, { actorId: { in: ids } }] } })
  await db.officerInvitation.deleteMany({ where: { email: { in: emails } } })
  await db.officer.deleteMany({ where: { email: { in: emails } } })
  await db.adminUser.deleteMany({ where: { id: adminId } })
})

describe('invitaciones de oficiales', () => {
  it('las rutas de admin exigen sesión de admin', async () => {
    expect((await http('admin-invitations', { method: 'GET' })).code).toBe(401)
    expect((await http('admin-invitations', { body: { email: email(), name: 'Sin Sesion' } })).code).toBe(401)
    expect((await http('admin-officers', { method: 'GET' })).code).toBe(401)
    expect((await http('admin-invitation-revoke', { query: { id: 'x' } })).code).toBe(401)
    expect((await http('admin-officer-active', { query: { id: 'x' }, body: { active: false } })).code).toBe(401)
  })

  it('crea la invitación: enlace con token de 43 caracteres y solo su hash en la base', async () => {
    const e = email()
    const r = await invite(e, 'Ana Oficial')
    expect(r.code, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.emailSent).toBe(false) // en seco
    const url = new URL(r.body.data.inviteUrl)
    expect(url.origin + url.pathname).toBe('https://app.example.test/oficial/invitacion')
    const token = tokenOf(r)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const row = await db.officerInvitation.findFirstOrThrow({ where: { email: e } })
    expect(row.tokenHash).toBe(hashInviteToken(token))
    expect(JSON.stringify(row)).not.toContain(token)
    expect(r.body.data.invitation).toMatchObject({ email: e, name: 'Ana Oficial', status: 'PENDING', createdByName: 'Admin Prueba' })
    const list = await http('admin-invitations', { method: 'GET', cookie: adminCookie })
    expect(list.body.data.items.find((i: { id: string }) => i.id === row.id)?.status).toBe('PENDING')
    expect(JSON.stringify(list.body)).not.toContain(token)
  })

  it('valida el correo y el nombre', async () => {
    expect((await invite('no-es-correo')).code).toBe(400)
    expect((await invite(email(), 'x')).code).toBe(400)
  })

  it('el enlace se comprueba, se acepta una sola vez y abre sesión de oficial', async () => {
    const e = email()
    const token = tokenOf(await invite(e, 'Beto Agente', 1))
    const check = await http('officer-invitation', { body: { token }, ip: 1 })
    expect(check.body.data).toMatchObject({ email: e, name: 'Beto Agente' })

    const bad = await http('officer-accept', { body: { token, phone: PHONE, password: 'corta' }, ip: 1 })
    expect(bad.code).toBe(400) // contraseña de menos de 10

    const ok = await http('officer-accept', { body: { token, phone: PHONE, password: PASSWORD }, ip: 1 })
    expect(ok.code, JSON.stringify(ok.body)).toBe(201)
    expect(ok.body.data.officer).toMatchObject({ name: 'Beto Agente', email: e })
    expect(ok.body.data.officer.badge).toMatch(/^OF-\d{4}$/)
    expect(ok.setCookie).toContain(`${COOKIE_NAMES.officer}=`)
    const officer = await db.officer.findUniqueOrThrow({ where: { email: e } })
    expect(officer.phone).toBe('584125550101')
    expect(officer.passwordHash).toMatch(/^scrypt/)
    expect(JSON.stringify(officer)).not.toContain(PASSWORD)

    // un solo uso
    expect((await http('officer-accept', { body: { token, phone: PHONE, password: PASSWORD }, ip: 1 })).body.error.reason).toBe('INVITACION_INVALIDA')
    expect((await http('officer-invitation', { body: { token }, ip: 1 })).code).toBe(404)
    const list = await http('admin-invitations', { method: 'GET', cookie: adminCookie })
    expect(list.body.data.items.find((i: { email: string }) => i.email === e)).toMatchObject({ status: 'USED', officerBadge: officer.badge })
  })

  it('token inexistente o mal formado: 404 igual que uno vencido; no se filtra nada', async () => {
    const unknown = 'A'.repeat(43)
    const r = await http('officer-invitation', { body: { token: unknown }, ip: 2 })
    expect(r.code).toBe(404)
    expect(r.body.error.reason).toBe('INVITACION_INVALIDA')
    expect((await http('officer-invitation', { body: { token: 'corto' }, ip: 2 })).code).toBe(400)

    const e = email()
    const token = tokenOf(await invite(e, 'Vence Pronto', 2))
    await db.officerInvitation.updateMany({ where: { email: e }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await http('officer-invitation', { body: { token }, ip: 2 })).body.error.reason).toBe('INVITACION_INVALIDA')
    expect((await http('officer-accept', { body: { token, phone: PHONE, password: PASSWORD }, ip: 2 })).code).toBe(404)
    const list = await http('admin-invitations', { method: 'GET', cookie: adminCookie })
    expect(list.body.data.items.find((i: { email: string }) => i.email === e).status).toBe('EXPIRED')
  })

  it('invitar de nuevo al mismo correo anula la anterior; revocar la deja inservible', async () => {
    const e = email()
    const first = tokenOf(await invite(e, 'Doble Invitado', 3))
    const second = await invite(e, 'Doble Invitado', 3)
    expect((await http('officer-invitation', { body: { token: first }, ip: 3 })).code).toBe(404)
    expect((await http('officer-invitation', { body: { token: tokenOf(second) }, ip: 3 })).code).toBe(200)

    const id = second.body.data.invitation.id
    const revoked = await http('admin-invitation-revoke', { cookie: adminCookie, query: { id }, ip: 3 })
    expect(revoked.body.data.status).toBe('REVOKED')
    expect((await http('admin-invitation-revoke', { cookie: adminCookie, query: { id }, ip: 3 })).code).toBe(200) // idempotente
    expect((await http('officer-accept', { body: { token: tokenOf(second), phone: PHONE, password: PASSWORD }, ip: 3 })).code).toBe(404)
    expect((await http('admin-invitation-revoke', { cookie: adminCookie, query: { id: 'no-existe' }, ip: 3 })).code).toBe(404)
  })

  it('un correo que ya es oficial no se puede invitar; una invitación usada no se revoca', async () => {
    const e = email()
    const inv = await invite(e, 'Ya Es Oficial', 4)
    await http('officer-accept', { body: { token: tokenOf(inv), phone: PHONE, password: PASSWORD }, ip: 4 })
    const again = await invite(e, 'Ya Es Oficial', 4)
    expect(again.code).toBe(409)
    expect(again.body.error.reason).toBe('CORREO_EN_USO')
    expect((await http('admin-invitation-revoke', { cookie: adminCookie, query: { id: inv.body.data.invitation.id }, ip: 4 })).code).toBe(409)
  })

  it('login por correo y contraseña; un solo error; desactivar corta el acceso', async () => {
    const e = email()
    await http('officer-accept', { body: { token: tokenOf(await invite(e, 'Con Login', 5)), phone: PHONE, password: PASSWORD }, ip: 5 })
    const officer = await db.officer.findUniqueOrThrow({ where: { email: e } })

    const ok = await http('officer-login', { body: { email: e.toUpperCase(), password: PASSWORD }, ip: 5 })
    expect(ok.code, JSON.stringify(ok.body)).toBe(200)
    expect(ok.setCookie).toContain(`${COOKIE_NAMES.officer}=`)
    expect(ok.body.data.officer.id).toBe(officer.id)

    const wrong = await http('officer-login', { body: { email: e, password: 'otra-clave-larga-1' }, ip: 5 })
    const unknown = await http('officer-login', { body: { email: email(), password: 'otra-clave-larga-1' }, ip: 5 })
    expect(wrong.code).toBe(401)
    expect(wrong.body).toEqual(unknown.body)
    expect(wrong.body.error.reason).toBe('CREDENCIALES')

    const off = await http('admin-officer-active', { cookie: adminCookie, query: { id: officer.id }, body: { active: false }, ip: 5 })
    expect(off.body.data).toMatchObject({ active: false, onDuty: false })
    expect((await http('officer-login', { body: { email: e, password: PASSWORD }, ip: 5 })).code).toBe(401)
    await http('admin-officer-active', { cookie: adminCookie, query: { id: officer.id }, body: { active: true }, ip: 5 })
    expect((await http('officer-login', { body: { email: e, password: PASSWORD }, ip: 5 })).code).toBe(200)
    const audits = await db.auditLog.findMany({ where: { entity: 'Officer', entityId: officer.id }, select: { action: true } })
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['OFFICER_REGISTERED', 'OFFICER_DEACTIVATED', 'OFFICER_ACTIVATED', 'OFFICER_LOGIN']))
  })

  it('el listado de oficiales enmascara el teléfono y nunca trae hashes', async () => {
    const e = email()
    await http('officer-accept', { body: { token: tokenOf(await invite(e, 'Lista Oficial', 6)), phone: '0414-777 8899', password: PASSWORD }, ip: 6 })
    const r = await http('admin-officers', { method: 'GET', cookie: adminCookie, ip: 6 })
    const mine = r.body.data.items.find((o: { email: string }) => o.email === e)
    expect(mine).toMatchObject({ phone: '0414-***8899', active: true, hasAccount: true })
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|scrypt/)
  })

  it('bloquea el login tras 5 fallos por correo', async () => {
    const e = email()
    for (let i = 0; i < 5; i++) await http('officer-login', { body: { email: e, password: 'mala-clave-larga' }, ip: 7 })
    const blocked = await http('officer-login', { body: { email: e, password: 'mala-clave-larga' }, ip: 7 })
    expect(blocked.code).toBe(429)
  })

  it('intentos simultáneos no se pasan del límite: solo 5 obtienen respuesta, el resto 429', async () => {
    const e = email()
    await http('officer-accept', { body: { token: tokenOf(await invite(e, 'Concurrente', 8)), phone: PHONE, password: PASSWORD }, ip: 8 })
    const results = await Promise.all(Array.from({ length: 12 }, () => http('officer-login', { body: { email: e, password: 'mala-clave-larga' }, ip: 9 })))
    expect(results.filter((r) => r.code === 401)).toHaveLength(5)
    expect(results.filter((r) => r.code === 429)).toHaveLength(7)
    // ya bloqueado: ni la contraseña correcta entra
    expect((await http('officer-login', { body: { email: e, password: PASSWORD }, ip: 9 })).code).toBe(429)
  })
})
