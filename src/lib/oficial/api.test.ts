import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoError } from '../demo/demo.ts'
import {
  accionesPermitidas, cambiarEstado, getMulta, getSesionOficial, iniciarSesionOficial, listarMultas, listarTodas, reenviarNotificacion, reiniciarOficial,
} from './api.ts'
import { destino } from './demo.ts'

const codigo = (p: Promise<unknown>) => p.then(() => 'OK', (e: unknown) => (e instanceof DemoError ? e.code : String(e)))
const MOTIVO = 'Evidencia insuficiente en el fotograma'

beforeEach(async () => {
  reiniciarOficial()
  await iniciarSesionOficial('oficial.a@example.com', 'demo1234')
})
afterEach(() => { vi.useRealTimers() })

describe('sesión', () => {
  it('rechaza una clave incorrecta', async () => {
    reiniciarOficial()
    expect(await codigo(iniciarSesionOficial('oficial.a@example.com', 'clave-mal'))).toBe('CREDENCIALES')
    expect(getSesionOficial()).toBeNull()
  })
  it('vence a las 12 h', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-24T12:00:00Z'), toFake: ['Date'] })
    await iniciarSesionOficial('Oficial.A@example.com ', 'demo1234')
    vi.setSystemTime(new Date('2026-10-24T23:59:00Z'))
    expect(await codigo(listarMultas())).toBe('OK')
    vi.setSystemTime(new Date('2026-10-25T00:01:00Z'))
    expect(await codigo(listarMultas())).toBe('SESION')
  })
})

describe('filtros', () => {
  it('cédula exacta, normalizada y enmascarada en la respuesta', async () => {
    const { items } = await listarMultas({ cedula: 'v-99.000.002' })
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((m) => m.cedulaMasked === 'V-****0002')).toBe(true)
    expect((await listarMultas({ cedula: 'V9900000' })).items).toEqual([])
  })
  it('placa por prefijo, normalizada', async () => {
    const { items } = await listarMultas({ placa: 'ab-12' })
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((m) => m.plate === 'AB123CD')).toBe(true)
  })
  it('combina cédula y placa', async () => {
    expect((await listarMultas({ cedula: 'V99000001', placa: 'XY' })).items).toEqual([])
  })
  it('la más reciente primero y páginas de 25', async () => {
    const p1 = await listarMultas()
    expect(p1.items).toHaveLength(25)
    expect(p1.nextCursor).not.toBeNull()
    const fechas = p1.items.map((m) => m.occurredAt)
    expect(fechas).toEqual([...fechas].sort().reverse())
    const p2 = await listarMultas({ cursor: p1.nextCursor })
    expect(p2.nextCursor).toBeNull()
    expect((await listarTodas({})).length).toBe(p1.items.length + p2.items.length)
  })
  it('nunca expone nombre, teléfono ni cédula completa', async () => {
    const m = await getMulta('m1')
    const json = JSON.stringify(m)
    expect(json).not.toMatch(/99000001|telefono|0412|nombre/i)
  })
})

describe('transiciones', () => {
  it('solo las permitidas por estado', () => {
    expect(accionesPermitidas('PENDING')).toEqual(['VOID'])
    expect(accionesPermitidas('OVERDUE')).toEqual(['VOID'])
    expect(accionesPermitidas('APPEALED')).toEqual(['APPEAL_ACCEPT', 'APPEAL_REJECT'])
    expect(accionesPermitidas('PAID')).toEqual([])
    expect(accionesPermitidas('VOID')).toEqual([])
  })
  it('rechazar apelación vuelve a PENDIENTE o VENCIDA según el plazo', () => {
    const ahora = new Date('2026-10-24T12:00:00Z')
    expect(destino({ status: 'APPEALED', dueAt: '2026-11-01T00:00:00Z' }, 'APPEAL_REJECT', ahora)).toBe('PENDING')
    expect(destino({ status: 'APPEALED', dueAt: '2026-10-01T00:00:00Z' }, 'APPEAL_REJECT', ahora)).toBe('OVERDUE')
    expect(destino({ status: 'APPEALED', dueAt: '2026-10-01T00:00:00Z' }, 'APPEAL_ACCEPT', ahora)).toBe('VOID')
  })
  it('anula una PENDIENTE y una VENCIDA', async () => {
    expect((await cambiarEstado('m1', 'VOID', MOTIVO)).status).toBe('VOID')
    expect((await cambiarEstado('m2', 'VOID', MOTIVO)).status).toBe('VOID')
  })
  it('prohíbe el resto', async () => {
    expect(await codigo(cambiarEstado('m3', 'VOID', MOTIVO))).toBe('TRANSICION') // PAGADA
    expect(await codigo(cambiarEstado('m6', 'APPEAL_ACCEPT', MOTIVO))).toBe('TRANSICION') // ANULADA
    expect(await codigo(cambiarEstado('m1', 'APPEAL_REJECT', MOTIVO))).toBe('TRANSICION') // PENDIENTE
    expect(await codigo(cambiarEstado('o1', 'VOID', MOTIVO))).toBe('TRANSICION') // APELADA
    expect(await codigo(cambiarEstado('nope', 'VOID', MOTIVO))).toBe('NO_ENCONTRADA')
  })
  it('una ANULADA ya no admite otro cambio', async () => {
    await cambiarEstado('o1', 'APPEAL_ACCEPT', MOTIVO)
    expect(await codigo(cambiarEstado('o1', 'APPEAL_REJECT', MOTIVO))).toBe('TRANSICION')
  })
  it('exige motivo de al menos 10 caracteres (sin contar espacios de borde)', async () => {
    expect(await codigo(cambiarEstado('m1', 'VOID', '   corto    '))).toBe('VALIDACION')
    expect((await getMulta('m1')).status).toBe('PENDING')
  })
  it('escribe la auditoría con el oficial como actor', async () => {
    const antes = (await getMulta('o2')).audit.length
    const m = await cambiarEstado('o2', 'APPEAL_REJECT', `  ${MOTIVO}  `)
    expect(m.audit).toHaveLength(antes + 1)
    expect(m.audit.at(-1)).toMatchObject({
      actor: { type: 'OFFICER', label: 'Oficial A (ejemplo)' }, action: 'APPEAL_REJECT', from: 'APPEALED', to: m.status, reason: MOTIVO,
    })
    // persiste
    expect((await getMulta('o2')).audit).toHaveLength(antes + 1)
  })
  it('cada multa del demo trae su auditoría inicial', async () => {
    const { items } = await listarMultas({ limit: 100 })
    for (const { id } of items) expect((await getMulta(id)).audit.some((a) => a.action === 'FINE_CREATED')).toBe(true)
  })
})

describe('reenviar notificación', () => {
  it('solo las multas por pagar; deja la entrada en la auditoría con el nombre del oficial', async () => {
    const todas = await listarTodas({})
    const porPagar = todas.find((m) => m.status === 'PENDING' || m.status === 'OVERDUE')!
    const r = await reenviarNotificacion(porPagar.id)
    expect(r.status).toBe('SENT')
    expect(r.telefono).toMatch(/\*\*\*/)
    expect(r.fine.audit.at(-1)).toMatchObject({ action: 'NOTIFICATION_RESENT', actor: { type: 'OFFICER' } })
    expect((await getMulta(porPagar.id)).audit.at(-1)!.action).toBe('NOTIFICATION_RESENT')
    const cerrada = todas.find((m) => m.status === 'PAID' || m.status === 'VOID')!
    expect(await codigo(reenviarNotificacion(cerrada.id))).toBe('NO_REENVIABLE')
    expect(await codigo(reenviarNotificacion('no-existe'))).toBe('NO_ENCONTRADA')
  })
})
