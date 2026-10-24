import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { hashPassword } from '../../lib/auth/password.ts'
import { db } from '../../lib/db.ts'
import {
  CODE_TTL_MS, MAX_CODE_ATTEMPTS, RESEND_COOLDOWN_MS, createCitizenService, type CitizenDeps,
} from '../../lib/domain/citizen.ts'
import { appealCitizenFine, getCitizenFine, listCitizenFines, listCitizenVehicles } from '../../lib/domain/citizen-data.ts'
import { DomainError } from '../../lib/domain/errors.ts'

const RUN = Date.now().toString(36)
const DIGITS = String(Date.now()).slice(-6)
let n = 0
const PASSWORD = 'una-clave-larga-1'
const ip = (i: number) => `192.0.2.${120 + i}`
const sent: Array<{ phone: string; code: string }> = []
const sendCode = vi.fn<CitizenDeps['sendCode']>(async (phone, code) => {
  sent.push({ phone, code })
  return { delivered: true }
})
const svc = (over: Partial<CitizenDeps> = {}) => createCitizenService({ db, sendCode, ...over })
const lastCode = () => sent.at(-1)!.code

const personIds: string[] = []
/** Cédulas cuyo titular crea el propio registro (no pasan por `person()`); se resuelven a ids al limpiar. */
const unknownCedulas: string[] = []
/** Titular de prueba con cédula inventada única (V9 + 7 dígitos). */
async function person(over: { phone?: string; email?: string | null } = {}) {
  const i = ++n
  const id = `test_${RUN}_per${i}`
  const cedula = `V9${DIGITS}${i}` // V + 9 dígitos como máximo (i < 100)
  await db.person.create({ data: { id, cedula, fullName: 'Persona Test', phone: over.phone ?? '584120000777', email: over.email ?? null } })
  personIds.push(id)
  return { id, cedula }
}

/** Cuenta ya creada (hash real) para probar login y contraseña sin pasar por el registro. */
async function account(personId: string, password = PASSWORD, active = true) {
  return db.citizenAccount.create({ data: { personId, passwordHash: await hashPassword(password, 8), active } })
}

let tokenCounter = 0
const vehicleIds: string[] = []
const violationIds: string[] = []
const fineIds: string[] = []
async function fine(ownerId: string, key: string, o: { v?: 'NOTIFIED' | 'PAID' | 'VOID'; f?: 'PENDING' | 'PAID' | 'VOID'; dueDays?: number; occurredDays?: number; review?: boolean } = {}) {
  const vehId = `test_${RUN}_veh_${ownerId}`
  if (!vehicleIds.includes(vehId)) {
    await db.vehicle.create({ data: { id: vehId, plate: `T${ownerId.slice(-3).toUpperCase()}${DIGITS}`.slice(0, 8), make: 'Toyota', model: 'Yaris', color: 'azul', year: 2019, ownerId } })
    vehicleIds.push(vehId)
  }
  const vid = `test_${RUN}_vio_${key}`
  await db.violation.create({
    data: {
      id: vid, idempotencyKey: `test-citizen-${RUN}-${key}`, type: 'RED_LIGHT', status: o.v ?? 'NOTIFIED', cameraId: 'seed_cam_1', vehicleId: vehId,
      plateRead: 'AB123CD', confidence: 0.9, occurredAt: new Date(Date.now() - (o.occurredDays ?? 2) * 86_400_000), aiOutput: {}, ruleOutput: {},
      ...(o.review && { reviewReason: 'LOW_CONFIDENCE' as const }),
      ...(o.v === 'VOID' && { voidReason: 'Vehículo de emergencia (prueba)' }),
      fine: { create: { id: `${vid}_fine`, publicToken: `test-token-${RUN}-${++tokenCounter}-padding`, amountCents: 100, status: o.f ?? 'PENDING', dueAt: new Date(Date.now() + (o.dueDays ?? 10) * 86_400_000), ...(o.f === 'PAID' && { paidAt: new Date() }) } },
    },
  })
  violationIds.push(vid)
  fineIds.push(`${vid}_fine`)
  return `${vid}_fine`
}

beforeAll(async () => {
  if (!(await db.camera.findUnique({ where: { id: 'seed_cam_1' } }))) throw new Error('Falta el seed: corre `pnpm db:seed` antes de `pnpm test:db`')
  vi.stubEnv('SESSION_SECRET', `test-secret-${RUN}-`.padEnd(48, 'c'))
})

afterAll(async () => {
  vi.unstubAllEnvs()
  personIds.push(...(await db.person.findMany({ where: { cedula: { in: unknownCedulas } }, select: { id: true } })).map((p) => p.id))
  const accounts = await db.citizenAccount.findMany({ where: { personId: { in: personIds } }, select: { id: true } })
  await db.auditLog.deleteMany({ where: { OR: [{ ip: { startsWith: '192.0.2.1' } }, { entityId: { in: [...violationIds, ...fineIds, ...accounts.map((a) => a.id)] } }, { actorId: { in: accounts.map((a) => a.id) } }] } })
  await db.payment.deleteMany({ where: { fineId: { in: fineIds } } })
  await db.citizenRegistration.deleteMany({ where: { personId: { in: personIds } } })
  await db.citizenAccount.deleteMany({ where: { personId: { in: personIds } } })
  await db.evidence.deleteMany({ where: { violationId: { in: violationIds } } })
  await db.fine.deleteMany({ where: { id: { in: fineIds } } })
  await db.violation.deleteMany({ where: { id: { in: violationIds } } })
  await db.vehicle.deleteMany({ where: { id: { in: vehicleIds } } })
  await db.person.deleteMany({ where: { id: { in: personIds } } })
  await db.$disconnect()
})

const reasonOf = (e: unknown) => (e as DomainError).reason
const codeOf = (e: unknown) => (e as DomainError).code
const fail = (p: Promise<unknown>) => p.then(() => { throw new Error('debía fallar') }, (e: unknown) => e as DomainError)

describe('registro: cédula + contraseña con código por WhatsApp', () => {
  it('flujo completo: el código va al teléfono DEL TITULAR y al verificarlo se crea la cuenta', async () => {
    const p = await person({ phone: '584261234567' })
    const s = svc()
    const out = await s.startRegistration({ cedula: p.cedula, password: PASSWORD, email: 'yo@example.com', ip: ip(1) })

    expect(out).toEqual({ telefono: '0426-***4567' })
    expect(sent.at(-1)).toMatchObject({ phone: '584261234567' })
    expect(lastCode()).toMatch(/^\d{6}$/)
    const reg = await db.citizenRegistration.findUniqueOrThrow({ where: { personId: p.id } })
    expect(reg.codeHash).toMatch(/^[0-9a-f]{64}$/)
    expect(reg.passwordHash).toMatch(/^scrypt\$/)
    expect(JSON.stringify(reg)).not.toContain(lastCode()) // el código no se guarda en claro
    expect(JSON.stringify(reg)).not.toContain(PASSWORD)
    expect(await db.citizenAccount.count({ where: { personId: p.id } })).toBe(0) // aún no hay cuenta

    const res = await s.verifyRegistration({ cedula: p.cedula, code: lastCode(), ip: ip(1) })
    expect(res.account).toMatchObject({ personId: p.id, active: true })
    expect(res.person.email).toBe('yo@example.com')
    expect(await db.citizenRegistration.count({ where: { personId: p.id } })).toBe(0)
    expect(await db.auditLog.count({ where: { action: 'CITIZEN_REGISTERED', entityId: res.account.id } })).toBe(1)
    // …y con esa contraseña ya se puede iniciar sesión
    expect((await s.login({ cedula: p.cedula, password: PASSWORD, ip: ip(1) })).account.id).toBe(res.account.id)
  })

  it('una cédula sin titular registrado no recibe nada', async () => {
    const before = sent.length
    const err = await fail(svc().startRegistration({ cedula: `V9${DIGITS}00`, password: PASSWORD, ip: ip(2) }))
    expect(codeOf(err)).toBe('NOT_FOUND')
    expect(reasonOf(err)).toBe('SIN_TITULAR')
    expect(sent).toHaveLength(before)
  })

  it('registro abierto: una cédula desconocida con teléfono crea el titular y envía el código a ESE teléfono', async () => {
    const cedula = `V9${DIGITS}01`
    unknownCedulas.push(cedula)
    const out = await svc().startRegistration({ cedula, password: PASSWORD, phone: '584141112233', ip: ip(4) })
    expect(out.telefono).toBe('0414-***2233')
    expect(sent.at(-1)).toMatchObject({ phone: '584141112233' })
    const created = await db.person.findUniqueOrThrow({ where: { cedula } })
    expect(created.phone).toBe('584141112233')
    // verificar abre la cuenta
    const session = await svc().verifyRegistration({ cedula, code: lastCode(), ip: ip(4) })
    expect(session.person.cedula).toBe(cedula)
    const again = await fail(svc().startRegistration({ cedula, password: PASSWORD, phone: '584141112233', ip: ip(4) }))
    expect(reasonOf(again)).toBe('YA_REGISTRADA')
  })

  it('sin código (requireCode false): el paso 1 crea la cuenta y abre sesión sin enviar nada', async () => {
    const cedula = `V9${DIGITS}02`
    unknownCedulas.push(cedula)
    const before = sent.length
    const out = await svc({ requireCode: () => false }).startRegistration({ cedula, password: PASSWORD, phone: '584141112244', email: 'sin.codigo@ejemplo.com', ip: ip(7) })
    expect(sent).toHaveLength(before)
    expect(out.telefono).toBe('0414-***2244')
    expect(out.session?.person.cedula).toBe(cedula)
    expect(out.session?.person.email).toBe('sin.codigo@ejemplo.com')
    expect(await db.citizenRegistration.count({ where: { person: { cedula } } })).toBe(0)
    // entra con la contraseña elegida, y no puede registrarse dos veces
    expect((await svc().login({ cedula, password: PASSWORD, ip: ip(7) })).person.cedula).toBe(cedula)
    expect(reasonOf(await fail(svc({ requireCode: () => false }).startRegistration({ cedula, password: PASSWORD, phone: '584141112244', ip: ip(7) })))).toBe('YA_REGISTRADA')
    const reg = await db.auditLog.findFirst({ where: { action: 'CITIZEN_REGISTERED', entityId: out.session?.account.id } })
    expect(reg?.after).toEqual({ verifiedBy: 'NONE' })
  })

  it('un titular conocido con teléfono escrito: el código va al escrito, pero su teléfono (con vehículos) no cambia', async () => {
    const p = await person({ phone: '584120000777' })
    await fine(p.id, `phone-${p.id}`) // le da un vehículo
    const out = await svc().startRegistration({ cedula: p.cedula, password: PASSWORD, phone: '584261234567', ip: ip(5) })
    expect(out.telefono).toBe('0426-***4567')
    expect(sent.at(-1)).toMatchObject({ phone: '584261234567' })
    await svc().verifyRegistration({ cedula: p.cedula, code: lastCode(), ip: ip(5) })
    expect((await db.person.findUniqueOrThrow({ where: { id: p.id } })).phone).toBe('584120000777')
  })

  it('un titular sin vehículos adopta el teléfono verificado, y el reenvío usa el mismo teléfono', async () => {
    const p = await person({ phone: '584120000777' })
    await svc().startRegistration({ cedula: p.cedula, password: PASSWORD, phone: '584161234567', ip: ip(6) })
    await db.citizenRegistration.updateMany({ where: { personId: p.id }, data: { lastSentAt: new Date(Date.now() - RESEND_COOLDOWN_MS - 1000) } })
    await svc().resendCode({ cedula: p.cedula, ip: ip(6) })
    expect(sent.at(-1)).toMatchObject({ phone: '584161234567' })
    await svc().verifyRegistration({ cedula: p.cedula, code: lastCode(), ip: ip(6) })
    expect((await db.person.findUniqueOrThrow({ where: { id: p.id } })).phone).toBe('584161234567')
  })

  it('una cédula con cuenta responde YA_REGISTRADA (409) y no envía nada', async () => {
    const p = await person()
    await account(p.id)
    const before = sent.length
    const err = await fail(svc().startRegistration({ cedula: p.cedula, password: PASSWORD, ip: ip(3) }))
    expect(codeOf(err)).toBe('CONFLICT')
    expect(reasonOf(err)).toBe('YA_REGISTRADA')
    expect(sent).toHaveLength(before)
  })

  it('30 s entre envíos: un segundo intento inmediato espera; pasado el plazo se emite un código NUEVO que invalida el anterior', async () => {
    const p = await person()
    const t0 = new Date()
    const at = (ms: number) => ({ now: () => new Date(t0.getTime() + ms) })
    await svc(at(0)).startRegistration({ cedula: p.cedula, password: PASSWORD, ip: ip(4) })
    const first = lastCode()

    const early = await fail(svc(at(10_000)).startRegistration({ cedula: p.cedula, password: PASSWORD, ip: ip(4) }))
    expect(reasonOf(early)).toBe('ESPERAR')
    expect(codeOf(early)).toBe('RATE_LIMITED')

    await svc(at(RESEND_COOLDOWN_MS + 1_000)).resendCode({ cedula: p.cedula, ip: ip(4) })
    const second = lastCode()
    expect(sent.filter((s) => s.phone === '584120000777').length).toBeGreaterThanOrEqual(2)
    if (second !== first) {
      expect(reasonOf(await fail(svc(at(RESEND_COOLDOWN_MS + 2_000)).verifyRegistration({ cedula: p.cedula, code: first, ip: ip(4) })))).toBe('CODIGO_INVALIDO')
    }
    await expect(svc(at(RESEND_COOLDOWN_MS + 3_000)).verifyRegistration({ cedula: p.cedula, code: second, ip: ip(4) })).resolves.toMatchObject({ person: { id: p.id } })
  })

  it('código incorrecto: cuenta intentos; tras 5, ni el correcto sirve (hay que pedir otro)', async () => {
    const p = await person()
    const s = svc()
    await s.startRegistration({ cedula: p.cedula, password: PASSWORD, ip: ip(5) })
    const good = lastCode()
    const wrong = good === '000000' ? '111111' : '000000'
    for (let i = 1; i <= MAX_CODE_ATTEMPTS; i++) {
      expect(reasonOf(await fail(s.verifyRegistration({ cedula: p.cedula, code: wrong, ip: ip(5) }))), `intento ${i}`).toBe('CODIGO_INVALIDO')
    }
    expect((await db.citizenRegistration.findUniqueOrThrow({ where: { personId: p.id } })).attempts).toBe(MAX_CODE_ATTEMPTS)
    const exhausted = await fail(s.verifyRegistration({ cedula: p.cedula, code: good, ip: ip(5) }))
    expect(reasonOf(exhausted)).toBe('CODIGO_AGOTADO')
    expect(codeOf(exhausted)).toBe('RATE_LIMITED')
    expect(await db.citizenRegistration.count({ where: { personId: p.id } })).toBe(0)
    expect(reasonOf(await fail(s.verifyRegistration({ cedula: p.cedula, code: good, ip: ip(5) })))).toBe('SIN_REGISTRO')
    expect(await db.citizenAccount.count({ where: { personId: p.id } })).toBe(0)
  })

  it('el código vence a los 10 minutos', async () => {
    const p = await person()
    await svc().startRegistration({ cedula: p.cedula, password: PASSWORD, ip: ip(6) })
    const late = svc({ now: () => new Date(Date.now() + CODE_TTL_MS + 1_000) })
    expect(reasonOf(await fail(late.verifyRegistration({ cedula: p.cedula, code: lastCode(), ip: ip(6) })))).toBe('CODIGO_VENCIDO')
    expect(await db.citizenAccount.count({ where: { personId: p.id } })).toBe(0)
  })

  it('reenviar sin registro pendiente → SIN_REGISTRO', async () => {
    const p = await person()
    expect(reasonOf(await fail(svc().resendCode({ cedula: p.cedula, ip: ip(7) })))).toBe('SIN_REGISTRO')
    expect(reasonOf(await fail(svc().verifyRegistration({ cedula: p.cedula, code: '123456', ip: ip(7) })))).toBe('SIN_REGISTRO')
  })

  it('si WhatsApp no entrega el código: ENVIO_FALLIDO, se borra el registro y se puede reintentar', async () => {
    const p = await person()
    const closed = svc({ sendCode: async () => ({ delivered: false, reason: 'WINDOW_CLOSED' }) })
    const err = await fail(closed.startRegistration({ cedula: p.cedula, password: PASSWORD, ip: ip(8) }))
    expect(codeOf(err)).toBe('UPSTREAM_ERROR')
    expect(reasonOf(err)).toBe('ENVIO_FALLIDO')
    expect(err.message).toMatch(/Escriba un mensaje/) // causa típica de la demo: ventana de 24 h cerrada
    expect(await db.citizenRegistration.count({ where: { personId: p.id } })).toBe(0)

    const other = await fail(svc({ sendCode: async () => ({ delivered: false, reason: 'META_ERROR' }) }).startRegistration({ cedula: p.cedula, password: PASSWORD, ip: ip(8) }))
    expect(other.message).not.toMatch(/Escriba un mensaje/)
    await expect(svc().startRegistration({ cedula: p.cedula, password: PASSWORD, ip: ip(8) })).resolves.toHaveProperty('telefono') // reintento sin esperar el enfriamiento
  })

  it('tres verificaciones simultáneas con el código correcto crean UNA sola cuenta', async () => {
    const p = await person()
    const s = svc()
    await s.startRegistration({ cedula: p.cedula, password: PASSWORD, ip: ip(9) })
    const code = lastCode()
    const results = await Promise.allSettled([1, 2, 3].map(() => s.verifyRegistration({ cedula: p.cedula, code, ip: ip(9) })))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await db.citizenAccount.count({ where: { personId: p.id } })).toBe(1)
  })

  it('límites: 10 registros por IP cada 10 min, y 5 por cédula por hora', async () => {
    const s = svc()
    for (let i = 0; i < 10; i++) await fail(s.startRegistration({ cedula: `V9${DIGITS}${String(10 + i)}`, password: PASSWORD, ip: ip(10) }))
    const blockedIp = await fail(s.startRegistration({ cedula: `V9${DIGITS}99`, password: PASSWORD, ip: ip(10) }))
    expect(codeOf(blockedIp)).toBe('RATE_LIMITED')
    expect(reasonOf(blockedIp)).toBeUndefined() // lo detuvo el limitador, no el enfriamiento

    const p = await person()
    const results: unknown[] = []
    for (let i = 0; i < 6; i++) results.push(await s.startRegistration({ cedula: p.cedula, password: PASSWORD, ip: ip(11 + i) }).catch((e: unknown) => e))
    const last = results[5] as DomainError
    expect(codeOf(last)).toBe('RATE_LIMITED')
    expect(reasonOf(last)).toBeUndefined()
  })

  it('SOLO DEMO: con código de demo para esa cédula no se envía nada y ese código vale; para las demás, no', async () => {
    const p = await person()
    const other = await person()
    const demo = svc({ demo: () => ({ cedula: p.cedula, code: '123456' }) })
    const before = sent.length
    await demo.startRegistration({ cedula: p.cedula, password: PASSWORD, ip: ip(20) })
    expect(sent).toHaveLength(before) // no se envió nada
    await expect(demo.verifyRegistration({ cedula: p.cedula, code: '123456', ip: ip(20) })).resolves.toMatchObject({ person: { id: p.id } })

    await demo.startRegistration({ cedula: other.cedula, password: PASSWORD, ip: ip(21) })
    expect(sent).toHaveLength(before + 1) // la otra cédula SÍ recibe un código real
    if (lastCode() !== '123456') {
      expect(reasonOf(await fail(demo.verifyRegistration({ cedula: other.cedula, code: '123456', ip: ip(21) })))).toBe('CODIGO_INVALIDO')
    }
  })
})

describe('login con cédula y contraseña', () => {
  it('con la contraseña correcta devuelve la cuenta y el titular', async () => {
    const p = await person()
    const a = await account(p.id)
    const out = await svc().login({ cedula: p.cedula, password: PASSWORD, ip: ip(30) })
    expect(out.account.id).toBe(a.id)
    expect(out.person.id).toBe(p.id)
    expect(out.account.lastLoginAt).toBeInstanceOf(Date)
    expect(await db.auditLog.count({ where: { action: 'CITIZEN_LOGIN', entityId: a.id } })).toBe(1)
  })

  it('cédula inexistente, contraseña errónea y cuenta desactivada dan exactamente el mismo error', async () => {
    const p = await person()
    await account(p.id)
    const off = await person()
    await account(off.id, PASSWORD, false)
    const errors = [
      await fail(svc().login({ cedula: p.cedula, password: 'incorrecta-123', ip: ip(31) })),
      await fail(svc().login({ cedula: `V9${DIGITS}98`, password: PASSWORD, ip: ip(31) })),
      await fail(svc().login({ cedula: off.cedula, password: PASSWORD, ip: ip(31) })),
    ]
    for (const e of errors) expect([e.code, e.reason, e.message]).toEqual(['UNAUTHORIZED', 'CREDENCIALES', errors[0]!.message])
  })

  it('los fallos se auditan con una huella, nunca con la cédula ni la contraseña', async () => {
    const p = await person()
    await account(p.id)
    await fail(svc().login({ cedula: p.cedula, password: 'secreto-que-no-debe-quedar', ip: ip(32) }))
    const logs = await db.auditLog.findMany({ where: { action: 'CITIZEN_LOGIN_FAILED', ip: ip(32) } })
    expect(logs).toHaveLength(1)
    expect(logs[0]!.entityId).toMatch(/^[0-9a-f]{16}$/)
    const dump = JSON.stringify(logs[0])
    expect(dump).not.toContain(p.cedula)
    expect(dump).not.toContain('secreto-que-no-debe-quedar')
  })

  it('5 fallos por cédula bloquean esa cédula (aun con la contraseña correcta) y no a las demás', async () => {
    const p = await person()
    await account(p.id)
    const q = await person()
    await account(q.id)
    for (let i = 0; i < 5; i++) expect(reasonOf(await fail(svc().login({ cedula: p.cedula, password: 'mala-123456', ip: ip(33 + i) })))).toBe('CREDENCIALES')
    const blocked = await fail(svc().login({ cedula: p.cedula, password: PASSWORD, ip: ip(40) }))
    expect(codeOf(blocked)).toBe('RATE_LIMITED')
    await expect(svc().login({ cedula: q.cedula, password: PASSWORD, ip: ip(41) })).resolves.toBeDefined()
  })

  it('10 fallos desde una IP bloquean esa IP, sea cual sea la cédula', async () => {
    const p = await person()
    await account(p.id)
    for (let i = 0; i < 10; i++) await fail(svc().login({ cedula: `V9${DIGITS}${String(30 + i)}`, password: 'x', ip: ip(42) }))
    expect(codeOf(await fail(svc().login({ cedula: p.cedula, password: PASSWORD, ip: ip(42) })))).toBe('RATE_LIMITED')
    await expect(svc().login({ cedula: p.cedula, password: PASSWORD, ip: ip(43) })).resolves.toBeDefined()
  })
})

describe('cambio de contraseña', () => {
  it('exige la actual, una nueva distinta, y deja de valer la anterior', async () => {
    const p = await person()
    const a = await account(p.id)
    const s = svc()
    expect(reasonOf(await fail(s.changePassword({ accountId: a.id, current: 'no-es-la-actual', next: 'otra-clave-nueva', ip: ip(50) })))).toBe('CLAVE_ACTUAL')
    expect(reasonOf(await fail(s.changePassword({ accountId: a.id, current: PASSWORD, next: PASSWORD, ip: ip(50) })))).toBe('CLAVE_IGUAL')

    const updated = await s.changePassword({ accountId: a.id, current: PASSWORD, next: 'otra-clave-nueva', ip: ip(50) })
    expect(updated.passwordHash).not.toBe(a.passwordHash) // cambia la huella: las sesiones abiertas dejan de valer
    expect(reasonOf(await fail(s.login({ cedula: p.cedula, password: PASSWORD, ip: ip(51) })))).toBe('CREDENCIALES')
    await expect(s.login({ cedula: p.cedula, password: 'otra-clave-nueva', ip: ip(51) })).resolves.toBeDefined()
    expect(await db.auditLog.count({ where: { action: 'CITIZEN_PASSWORD_CHANGED', entityId: a.id } })).toBe(1)
  })

  it('limita los intentos: tras 5 en 10 minutos, el sexto se rechaza', async () => {
    const p = await person()
    const a = await account(p.id)
    for (let i = 0; i < 5; i++) await fail(svc().changePassword({ accountId: a.id, current: 'incorrecta-1', next: 'otra-clave-nueva', ip: ip(52) }))
    expect(codeOf(await fail(svc().changePassword({ accountId: a.id, current: PASSWORD, next: 'otra-clave-nueva', ip: ip(52) })))).toBe('RATE_LIMITED')
  })
})

describe('multas, vehículos y apelación de la cuenta', () => {
  it('lista solo las multas propias, con token, estado calculado y referencia de pago', async () => {
    const p = await person()
    const mine = {
      pending: await fine(p.id, `${p.id}-a`, { occurredDays: 2, dueDays: 20 }),
      overdue: await fine(p.id, `${p.id}-b`, { occurredDays: 40, dueDays: -5 }),
      paid: await fine(p.id, `${p.id}-c`, { v: 'PAID', f: 'PAID', occurredDays: 20, review: true }),
      void: await fine(p.id, `${p.id}-d`, { v: 'VOID', f: 'VOID', occurredDays: 60 }),
    }
    await db.payment.create({ data: { id: `test_${RUN}_pay_${p.id}`, fineId: mine.paid, status: 'APPROVED', reference: 'SIM-TEST-77', payerBankCode: '0102', payerPhone: '04120000001', payerCedula: p.cedula, amountCents: 100, idempotencyKey: `test-pay-${RUN}-${p.id}` } })
    const stranger = await person()
    await fine(stranger.id, `${stranger.id}-x`)

    const list = await listCitizenFines(db, p.id)
    expect(list.map((f) => f.id)).toEqual([mine.pending, mine.paid, mine.overdue, mine.void]) // la infracción más reciente primero
    const by = Object.fromEntries(list.map((f) => [f.id, f]))
    expect(by[mine.pending]).toMatchObject({ status: 'PENDING', verification: 'AUTO', currency: 'VES', cameraCode: 'CAM-001', appealedAt: null })
    expect(by[mine.overdue]!.status).toBe('OVERDUE')
    expect(by[mine.paid]).toMatchObject({ status: 'PAID', verification: 'HUMAN', paymentReference: 'SIM-TEST-77' })
    expect(by[mine.paid]!.paidAt).not.toBeNull()
    expect(by[mine.void]).toMatchObject({ status: 'VOID', voidReason: 'Vehículo de emergencia (prueba)' })
    expect(list.every((f) => f.token.length >= 20 && /^T/.test(f.plate))).toBe(true)
  })

  it('una multa ajena responde igual que una inexistente (404 NO_ENCONTRADA)', async () => {
    const p = await person()
    const q = await person()
    const theirs = await fine(q.id, `${q.id}-y`)
    const a = await fail(getCitizenFine(db, p.id, theirs))
    const b = await fail(getCitizenFine(db, p.id, 'test_no_existe'))
    expect([a.code, a.reason, a.message]).toEqual([b.code, b.reason, b.message])
    expect(a.code).toBe('NOT_FOUND')
    expect((await getCitizenFine(db, q.id, theirs)).id).toBe(theirs)
  })

  it('apelar una multa propia pendiente la pasa a APPEALED, audita al ciudadano y registra la fecha', async () => {
    const p = await person()
    const acc = await account(p.id)
    const id = await fine(p.id, `${p.id}-z`)
    const out = await appealCitizenFine(db, { personId: p.id, accountId: acc.id, fineId: id, ip: ip(60) })
    expect(out.status).toBe('APPEALED')
    expect(out.appealedAt).not.toBeNull()
    expect(Date.now() - Date.parse(out.appealedAt!)).toBeLessThan(60_000)
    const log = await db.auditLog.findFirstOrThrow({ where: { entity: 'Violation', action: 'VIOLATION_TRANSITION', entityId: `${id.replace('_fine', '')}` } })
    expect(log).toMatchObject({ actorType: 'CITIZEN', actorId: acc.id, ip: ip(60) })
    expect((await listCitizenFines(db, p.id))[0]!.appealedAt).not.toBeNull()
  })

  it('una multa vencida también se puede apelar; una pagada, anulada, ya apelada o ajena, no', async () => {
    const p = await person()
    const acc = await account(p.id)
    const input = (fineId: string) => ({ personId: p.id, accountId: acc.id, fineId, ip: ip(61) })
    const overdue = await fine(p.id, `${p.id}-o`, { dueDays: -3, occurredDays: 40 })
    expect((await appealCitizenFine(db, input(overdue))).status).toBe('APPEALED')

    for (const id of [await fine(p.id, `${p.id}-p`, { v: 'PAID', f: 'PAID' }), await fine(p.id, `${p.id}-v`, { v: 'VOID', f: 'VOID' }), overdue]) {
      const err = await fail(appealCitizenFine(db, input(id)))
      expect([err.code, err.reason]).toEqual(['CONFLICT', 'NO_APELABLE'])
    }
    const q = await person()
    const theirs = await fine(q.id, `${q.id}-w`)
    expect(codeOf(await fail(appealCitizenFine(db, input(theirs))))).toBe('NOT_FOUND')
    expect((await db.fine.findUniqueOrThrow({ where: { id: theirs } })).status).toBe('PENDING') // la ajena no se tocó
  })

  it('lista los vehículos del titular', async () => {
    const p = await person()
    await fine(p.id, `${p.id}-v1`)
    const list = await listCitizenVehicles(db, p.id)
    expect(list).toEqual([expect.objectContaining({ brand: 'Toyota', model: 'Yaris', color: 'azul', year: 2019 })])
    expect(await listCitizenVehicles(db, (await person()).id)).toEqual([])
  })
})
