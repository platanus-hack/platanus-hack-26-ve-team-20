import type { VercelRequest, VercelResponse } from '@vercel/node'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import p1 from '../../api/p1.ts'
import { hashPassword } from '../../lib/auth/password.ts'
import { COOKIE_NAMES, passwordFingerprint, signSession } from '../../lib/auth/session.ts'
import { db } from '../../lib/db.ts'

// Flujo del ciudadano de punta a punta por el router real (api/p1.ts), igual que lo recorrerá el front.
// Nada se envía por WhatsApp: NOTIFY_DRY_RUN=true y el código de demo vale solo para la cédula de prueba.
const RUN = Date.now().toString(36)
const DIGITS = String(Date.now()).slice(-6)
const DEMO_CODE = '123456'
const PASSWORD = 'una-clave-larga-1'
const ip = (i: number) => `192.0.2.${160 + i}`
let n = 0
let tokenCounter = 0

type Res = { code: number; body: any; setCookie: string | undefined; headers: Record<string, string> }
async function http(route: string, o: { method?: string; body?: unknown; cookie?: string; query?: Record<string, string>; headers?: Record<string, string>; ip?: number } = {}): Promise<Res> {
  const out: Res = { code: 0, body: undefined, setCookie: undefined, headers: {} }
  const res = {
    status(c: number) { out.code = c; return res },
    json(b: unknown) { out.body = b; return res },
    setHeader(k: string, v: string) { out.headers[k] = v; if (k === 'Set-Cookie') out.setCookie = v; return res },
  }
  const headers = { 'x-vercel-forwarded-for': ip(o.ip ?? 0), ...(o.cookie && { cookie: o.cookie }), ...o.headers }
  await p1({ method: o.method ?? 'POST', headers, query: { route, ...o.query }, body: o.body ?? {} } as unknown as VercelRequest, res as unknown as VercelResponse)
  return out
}
const cookieOf = (r: Res) => (r.setCookie ?? '').split(';')[0] ?? ''

const personIds: string[] = []
const fineIds: string[] = []
const violationIds: string[] = []
const vehicleIds: string[] = []

async function newPerson(phone = '584264180319') {
  const i = ++n
  const id = `test_${RUN}_http${i}`
  const cedula = `V9${DIGITS}${i}`
  await db.person.create({ data: { id, cedula, fullName: 'Persona Test', phone } })
  personIds.push(id)
  return { id, cedula }
}

async function addFine(ownerId: string, key: string, o: { dueDays?: number; occurredDays?: number } = {}) {
  const vehId = `test_${RUN}_hveh_${ownerId}`
  if (!vehicleIds.includes(vehId)) {
    await db.vehicle.create({ data: { id: vehId, plate: `TH${String(++n).padStart(2, '0')}${DIGITS}`, make: 'Toyota', model: 'Yaris', color: 'azul', year: 2019, ownerId } })
    vehicleIds.push(vehId)
  }
  const vid = `test_${RUN}_hvio_${key}`
  await db.violation.create({
    data: {
      id: vid, idempotencyKey: `test-http-${RUN}-${key}`, type: 'RED_LIGHT', status: 'NOTIFIED', cameraId: 'seed_cam_1', vehicleId: vehId, plateRead: 'AB123CD',
      confidence: 0.9, occurredAt: new Date(Date.now() - (o.occurredDays ?? 2) * 86_400_000), aiOutput: {}, ruleOutput: {},
      fine: { create: { id: `${vid}_fine`, publicToken: `test-token-${RUN}-h${++tokenCounter}-padding`, amountCents: 100, dueAt: new Date(Date.now() + (o.dueDays ?? 10) * 86_400_000) } },
    },
  })
  violationIds.push(vid)
  fineIds.push(`${vid}_fine`)
  return `${vid}_fine`
}

/** Registra y verifica (con el código de demo) y devuelve la cookie de sesión. */
async function signUp(cedula: string, ipn: number) {
  vi.stubEnv('DEMO_CEDULA', cedula)
  vi.stubEnv('CITIZEN_DEMO_CODE', DEMO_CODE)
  const reg = await http('citizen-register', { body: { cedula, password: PASSWORD, email: `t${RUN}@example.com` }, ip: ipn })
  expect(reg.code, JSON.stringify(reg.body)).toBe(200)
  const ver = await http('citizen-verify', { body: { cedula, code: DEMO_CODE }, ip: ipn })
  expect(ver.code, JSON.stringify(ver.body)).toBe(200)
  return { reg, ver, cookie: cookieOf(ver) }
}

beforeAll(async () => {
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) throw new Error('Falta el seed: corre `pnpm db:seed` antes de `pnpm test:db`')
  vi.stubEnv('SESSION_SECRET', `test-secret-${RUN}-`.padEnd(48, 'h'))
  vi.stubEnv('NOTIFY_DRY_RUN', 'true') // ningún mensaje real en las pruebas
  vi.stubEnv('CITIZEN_WHATSAPP_CODE', 'true') // estas pruebas cubren el flujo con código; el registro sin código va aparte
})

afterAll(async () => {
  vi.unstubAllEnvs()
  const accounts = await db.citizenAccount.findMany({ where: { personId: { in: personIds } }, select: { id: true } })
  await db.auditLog.deleteMany({ where: { OR: [{ ip: { startsWith: '192.0.2.16' } }, { ip: { startsWith: '192.0.2.17' } }, { ip: { startsWith: '192.0.2.18' } }, { entityId: { in: [...violationIds, ...fineIds, ...accounts.map((a) => a.id)] } }, { actorId: { in: accounts.map((a) => a.id) } }] } })
  await db.citizenRegistration.deleteMany({ where: { personId: { in: personIds } } })
  await db.citizenAccount.deleteMany({ where: { personId: { in: personIds } } })
  await db.notification.deleteMany({ where: { fineId: { in: fineIds } } })
  await db.fine.deleteMany({ where: { id: { in: fineIds } } })
  await db.violation.deleteMany({ where: { id: { in: violationIds } } })
  await db.vehicle.deleteMany({ where: { id: { in: vehicleIds } } })
  await db.person.deleteMany({ where: { id: { in: personIds } } })
  await db.$disconnect()
})

describe('flujo completo del ciudadano por HTTP', () => {
  it('registro → verificación → perfil → multas → apelación → contraseña → cierre de sesión → login', async () => {
    const p = await newPerson('584264180319')
    const pending = await addFine(p.id, `${p.id}-a`, { occurredDays: 2 })
    await addFine(p.id, `${p.id}-b`, { occurredDays: 40, dueDays: -4 })

    // 1) registro: solo se devuelve el teléfono ENMASCARADO
    const { reg, ver, cookie } = await signUp(p.cedula, 1)
    expect(reg.body.data).toEqual({ telefono: '0426-***0319' })
    expect(JSON.stringify(reg.body)).not.toContain('4180')

    // 2) la verificación abre la sesión: cookie HttpOnly, SameSite=Lax, 30 min
    expect(ver.setCookie).toMatch(/^vc_citizen=[\w%.-]+; Path=\/; Max-Age=1800; HttpOnly; SameSite=Lax/)
    expect(ver.body.data.user).toEqual({ cedula: p.cedula, telefono: '04264180319', correo: `t${RUN}@example.com` })
    expect(ver.body.data.vehicles).toEqual([expect.objectContaining({ brand: 'Toyota', year: 2019 })])

    // 3) perfil y renovación deslizante (?renew=0 no extiende la sesión)
    const me = await http('citizen-me', { method: 'GET', cookie })
    expect(me.code).toBe(200)
    expect(me.body.data.user.cedula).toBe(p.cedula)
    expect(me.setCookie).toMatch(/Max-Age=1800/)
    const noRenew = await http('citizen-me', { method: 'GET', cookie, query: { renew: '0' } })
    expect(noRenew.code).toBe(200)
    expect(noRenew.setCookie).toBeUndefined()

    // 4) multas y vehículos (propios, con token para pagar)
    const fines = await http('citizen-fines', { method: 'GET', cookie })
    expect(fines.code).toBe(200)
    expect(fines.body.data.items.map((f: any) => f.status)).toEqual(['PENDING', 'OVERDUE'])
    expect(fines.body.data.items[0].token).toMatch(/^test-token-/)
    expect((await http('citizen-fine', { method: 'GET', cookie, query: { id: pending } })).body.data).toMatchObject({ id: pending, status: 'PENDING' })
    expect((await http('citizen-vehicles', { method: 'GET', cookie })).body.data.items).toHaveLength(1)

    // 5) apelación
    const appeal = await http('citizen-appeal', { cookie, query: { id: pending } })
    expect(appeal.code).toBe(200)
    expect(appeal.body.data).toMatchObject({ id: pending, status: 'APPEALED' })
    expect(appeal.body.data.appealedAt).not.toBeNull()
    const again = await http('citizen-appeal', { cookie, query: { id: pending } })
    expect([again.code, again.body.error.reason]).toEqual([409, 'NO_APELABLE'])

    // 6) cambio de contraseña: sesión nueva para quien la cambió; la cookie anterior deja de valer
    const pw = await http('citizen-password', { cookie, body: { current: PASSWORD, next: 'otra-clave-nueva-2' } })
    expect(pw.code).toBe(200)
    const fresh = cookieOf(pw)
    expect(fresh).not.toBe('')
    expect((await http('citizen-me', { method: 'GET', cookie })).code).toBe(401)
    expect((await http('citizen-me', { method: 'GET', cookie: fresh })).code).toBe(200)

    // 7) cierre de sesión y nuevo login con la contraseña nueva
    const out = await http('citizen-logout', { cookie: fresh })
    expect(out.setCookie).toBe('vc_citizen=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')
    const bad = await http('citizen-login', { body: { cedula: p.cedula, password: PASSWORD }, ip: 2 })
    expect([bad.code, bad.body.error.reason]).toEqual([401, 'CREDENCIALES'])
    const login = await http('citizen-login', { body: { cedula: p.cedula, password: 'otra-clave-nueva-2' }, ip: 3 })
    expect(login.code).toBe(200)
    expect(login.body.data.user.cedula).toBe(p.cedula)
    expect((await http('citizen-me', { method: 'GET', cookie: cookieOf(login) })).code).toBe(200)
  })
})

describe('autenticación y aislamiento', () => {
  const protectedRoutes: Array<[string, string, Record<string, string>?]> = [
    ['citizen-me', 'GET'], ['citizen-fines', 'GET'], ['citizen-fine', 'GET', { id: 'x' }], ['citizen-vehicles', 'GET'],
    ['citizen-appeal', 'POST', { id: 'x' }], ['citizen-password', 'POST'],
  ]

  it('todas las rutas protegidas dan 401 sin sesión y con cookies de otro rol, manipuladas o vencidas', async () => {
    const p = await newPerson()
    const { cookie } = await signUp(p.cedula, 4)
    const acc = await db.citizenAccount.findFirstOrThrow({ where: { personId: p.id } })
    const ph = passwordFingerprint(acc.passwordHash)
    const name = COOKIE_NAMES.citizen
    const forged = [
      '', // sin cookie
      `${name}=basura`,
      `${name}=${signSession({ role: 'admin', sub: acc.id, ph })}`, // sesión de admin con el id del ciudadano
      `${name}=${signSession({ role: 'officer', sub: acc.id })}`,
      `${name}=${signSession({ role: 'citizen', sub: acc.id, ph, now: new Date(Date.now() - 31 * 60_000) })}`, // vencida
      `${name}=${signSession({ role: 'citizen', sub: acc.id, ph: 'otra-huella' })}`, // huella equivocada
      `${name}=${signSession({ role: 'citizen', sub: 'cuenta-inexistente', ph })}`,
      `${cookie.slice(0, -3)}AAA`, // firma alterada
    ]
    for (const c of forged) {
      for (const [route, method, query] of protectedRoutes) {
        const r = await http(route, { method, cookie: c || undefined, ...(query && { query }), body: { current: 'x', next: 'y'.repeat(9) } })
        expect(r.code, `${route} con «${c.slice(0, 40)}»`).toBe(401)
        expect(r.body.error.code).toBe('UNAUTHORIZED')
      }
    }
    // y la cookie buena sí abre (control)
    expect((await http('citizen-me', { method: 'GET', cookie })).code).toBe(200)
  })

  it('un ciudadano no ve ni apela multas de otro (404) y su sesión no abre rutas de admin', async () => {
    const a = await newPerson()
    const b = await newPerson()
    const theirs = await addFine(b.id, `${b.id}-t`)
    const { cookie } = await signUp(a.cedula, 5)
    const get = await http('citizen-fine', { method: 'GET', cookie, query: { id: theirs } })
    const missing = await http('citizen-fine', { method: 'GET', cookie, query: { id: 'test_no_existe' } })
    expect([get.code, get.body.error.reason]).toEqual([404, 'NO_ENCONTRADA'])
    expect(get.body).toEqual(missing.body)
    expect((await http('citizen-appeal', { cookie, query: { id: theirs } })).code).toBe(404)
    expect((await db.fine.findUniqueOrThrow({ where: { id: theirs } })).status).toBe('PENDING')
    expect((await http('auth-me', { method: 'GET', cookie })).code).toBe(401)
    expect((await http('violations-list', { method: 'GET', cookie })).code).toBe(401)
    expect((await http('citizen-fines', { method: 'GET', cookie })).body.data.items).toEqual([])
  })

  it('desactivar la cuenta o cambiar su contraseña desde la base cierra las sesiones abiertas', async () => {
    const p = await newPerson()
    const { cookie } = await signUp(p.cedula, 6)
    const acc = await db.citizenAccount.findFirstOrThrow({ where: { personId: p.id } })
    await db.citizenAccount.update({ where: { id: acc.id }, data: { active: false } })
    expect((await http('citizen-me', { method: 'GET', cookie })).code).toBe(401)
    expect((await http('citizen-login', { body: { cedula: p.cedula, password: PASSWORD }, ip: 7 })).code).toBe(401)
    await db.citizenAccount.update({ where: { id: acc.id }, data: { active: true, passwordHash: await hashPassword('cambiada-por-admin-1', 8) } })
    expect((await http('citizen-me', { method: 'GET', cookie })).code).toBe(401)
  })
})

describe('entradas, errores y fugas', () => {
  it('valida el cuerpo (400) y el método', async () => {
    const bodies: Array<[string, unknown]> = [
      ['citizen-register', { cedula: 'V99123456', password: '1234567' }], // contraseña corta
      ['citizen-register', { cedula: 'no', password: PASSWORD }],
      ['citizen-register', { cedula: 'V99123456', password: PASSWORD, email: 'no-es-correo' }],
      ['citizen-verify', { cedula: 'V99123456', code: '12345' }],
      ['citizen-resend', {}],
      ['citizen-login', { cedula: 'V99123456' }],
    ]
    for (const [route, body] of bodies) {
      const r = await http(route, { body, ip: 8 })
      expect(r.code, `${route} ${JSON.stringify(body)}`).toBe(400)
      expect(r.body.error.code).toBe('VALIDATION_ERROR')
    }
    expect((await http('citizen-login', { method: 'GET', ip: 8 })).code).toBe(400)
    expect((await http('citizen-me', { method: 'POST', ip: 8 })).code).toBe(400)
  })

  it('rechaza un Origin ajeno en los POST públicos (CSRF)', async () => {
    const p = await newPerson()
    const evil = { origin: 'https://evil.example', host: 'app.vercel.app' }
    for (const [route, body] of [['citizen-register', { cedula: p.cedula, password: PASSWORD }], ['citizen-login', { cedula: p.cedula, password: PASSWORD }], ['citizen-verify', { cedula: p.cedula, code: '123456' }]] as const) {
      expect((await http(route, { body, headers: evil, ip: 9 })).code, route).toBe(401)
    }
    expect(await db.citizenRegistration.count({ where: { personId: p.id } })).toBe(0)
  })

  it('una cédula sin titular devuelve 404 con su causa; los errores llevan `reason`', async () => {
    const r = await http('citizen-register', { body: { cedula: `V9${DIGITS}77`, password: PASSWORD }, ip: 10 })
    expect(r.code).toBe(404)
    expect(r.body.error).toMatchObject({ code: 'NOT_FOUND', reason: 'SIN_TITULAR' })
    const noReg = await http('citizen-verify', { body: { cedula: `V9${DIGITS}77`, code: '123456' }, ip: 10 })
    expect(noReg.body.error).toMatchObject({ code: 'NOT_FOUND', reason: 'SIN_REGISTRO' })
  })

  it('sin código de demo y con WhatsApp en dry-run el registro falla con ENVIO_FALLIDO (502) y no deja nada pendiente', async () => {
    const p = await newPerson()
    vi.stubEnv('CITIZEN_DEMO_CODE', '')
    vi.stubEnv('DEMO_CEDULA', '')
    const r = await http('citizen-register', { body: { cedula: p.cedula, password: PASSWORD }, ip: 11 })
    expect(r.code).toBe(502)
    expect(r.body.error).toMatchObject({ code: 'UPSTREAM_ERROR', reason: 'ENVIO_FALLIDO' })
    expect(await db.citizenRegistration.count({ where: { personId: p.id } })).toBe(0)
  })

  it('sin CITIZEN_WHATSAPP_CODE el registro crea la cuenta y abre la sesión en un solo paso, sin enviar nada', async () => {
    const p = await newPerson()
    vi.stubEnv('CITIZEN_WHATSAPP_CODE', '')
    try {
      const r = await http('citizen-register', { body: { cedula: p.cedula, password: PASSWORD }, ip: 14 })
      expect(r.code).toBe(200)
      expect(r.body.data).toMatchObject({ user: { cedula: p.cedula }, vehicles: [] })
      expect(cookieOf(r)).toBeTruthy()
      expect(await db.citizenAccount.count({ where: { personId: p.id } })).toBe(1)
      expect(await db.citizenRegistration.count({ where: { personId: p.id } })).toBe(0)
    } finally {
      vi.stubEnv('CITIZEN_WHATSAPP_CODE', 'true')
    }
  })

  it('ninguna respuesta filtra hashes de contraseña, HMAC de códigos ni secretos', async () => {
    const p = await newPerson()
    await addFine(p.id, `${p.id}-l`)
    const { reg, ver, cookie } = await signUp(p.cedula, 12)
    const responses = [
      reg, ver,
      await http('citizen-me', { method: 'GET', cookie }),
      await http('citizen-fines', { method: 'GET', cookie }),
      await http('citizen-vehicles', { method: 'GET', cookie }),
      await http('citizen-login', { body: { cedula: p.cedula, password: 'incorrecta-123' }, ip: 13 }),
    ]
    for (const r of responses) {
      const dump = JSON.stringify(r.body)
      expect(dump).not.toMatch(/scrypt\$/)
      expect(dump).not.toMatch(/[0-9a-f]{64}/)
      expect(dump).not.toContain(PASSWORD)
      expect(dump).not.toContain(DEMO_CODE)
      expect(dump).not.toContain('SESSION_SECRET')
    }
  })

  it('reenviar la notificación de una multa propia: 200 en seco, máximo 3 por hora, y las ajenas o pagadas no se reenvían', async () => {
    const p = await newPerson('584120004466')
    const other = await newPerson()
    const mine = await addFine(p.id, 'resend-mine')
    const paid = await addFine(p.id, 'resend-paid')
    await db.fine.update({ where: { id: paid }, data: { status: 'PAID', paidAt: new Date() } })
    const foreign = await addFine(other.id, 'resend-foreign')
    const { cookie } = await signUp(p.cedula, 14)

    expect((await http('citizen-fine-resend', { query: { id: mine } })).code).toBe(401)
    const ok = await http('citizen-fine-resend', { cookie, query: { id: mine }, ip: 14 })
    expect(ok.code, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.data).toEqual({ status: 'DRY_RUN', telefono: '0412-***4466' })
    expect(await db.notification.count({ where: { fineId: mine } })).toBe(1)

    expect((await http('citizen-fine-resend', { cookie, query: { id: foreign }, ip: 14 })).body.error.reason).toBe('NO_ENCONTRADA')
    expect((await http('citizen-fine-resend', { cookie, query: { id: paid }, ip: 14 })).body.error.reason).toBe('NO_REENVIABLE')

    for (let i = 0; i < 2; i++) expect((await http('citizen-fine-resend', { cookie, query: { id: mine }, ip: 14 })).code).toBe(200)
    expect((await http('citizen-fine-resend', { cookie, query: { id: mine }, ip: 14 })).code).toBe(429)
    expect(await db.notification.count({ where: { fineId: mine } })).toBe(3)
  })
})
