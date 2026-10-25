import { describe, expect, it, vi } from 'vitest'
import { assignDemoOwner, demoOwnerCedulas, esperaEntreWhatsappMs, notificarConTope, ownerFor } from './demo-owners.ts'

// Cédulas inventadas (las reales van solo en DEMO_DUENOS_CEDULAS, fuera del repo).
const DUENOS = ['V11111111', 'V22222222']

function fakeDb(opts: { existe?: boolean; persona?: boolean; choque?: boolean } = {}) {
  return {
    vehicle: {
      findUnique: vi.fn(async () => (opts.existe ? { id: 'veh_x' } : null)),
      create: vi.fn(async () => {
        if (opts.choque) throw Object.assign(new Error('unique'), { code: 'P2002' })
        return { id: 'veh_nuevo' }
      }),
    },
    person: { findUnique: vi.fn(async ({ where }: { where: { cedula: string } }) => (opts.persona === false ? null : { id: `per_${where.cedula}` })) },
    auditLog: { create: vi.fn(async () => ({})) },
  }
}

describe('demoOwnerCedulas', () => {
  it('lee y normaliza la lista de la variable de entorno', () => {
    expect(demoOwnerCedulas({ DEMO_DUENOS_CEDULAS: 'v-11.111.111, V22222222' })).toEqual(DUENOS)
    expect(demoOwnerCedulas({})).toEqual([])
  })
})

describe('ownerFor', () => {
  it('la misma placa siempre va al mismo dueño y se reparten entre los dos', () => {
    expect(ownerFor('AB123CD', DUENOS)).toBe(ownerFor('AB123CD', DUENOS))
    const placas = ['AB123CD', 'XY987ZT', 'AA161GE', 'WAC65N', 'MDJ88F', 'AD705JS', 'AF975NV', 'AC945MM']
    expect(new Set(placas.map((p) => ownerFor(p, DUENOS))).size).toBe(2)
    expect(ownerFor('AB123CD', [])).toBeUndefined()
  })
})

describe('assignDemoOwner', () => {
  it('crea el vehículo a nombre del dueño y lo audita', async () => {
    const db = fakeDb()
    const cedula = await assignDemoOwner(db as never, 'AB123CD', DUENOS)
    expect(cedula).toBe(ownerFor('AB123CD', DUENOS))
    expect(db.vehicle.create).toHaveBeenCalledWith({
      data: { plate: 'AB123CD', make: 'Sin datos', model: 'Sin datos', color: 'Sin datos', ownerId: `per_${cedula}` },
      select: { id: true },
    })
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'DEMO_VEHICLE_ASSIGNED', entityId: 'veh_nuevo' }) })
  })

  it.each([
    ['sin dueños configurados', {}, []],
    ['la placa ya está registrada', { existe: true }, DUENOS],
    ['el dueño no existe en la base', { persona: false }, DUENOS],
    ['otra multa la registró al mismo tiempo', { choque: true }, DUENOS],
  ] as const)('no asigna si %s', async (_caso, opts, duenos) => {
    const db = fakeDb(opts)
    expect(await assignDemoOwner(db as never, 'AB123CD', duenos)).toBeNull()
    expect(db.auditLog.create).not.toHaveBeenCalled()
  })
})

describe('notificarConTope', () => {
  function dbAvisos(cedula: string, reciente: boolean) {
    return {
      fine: { findUnique: vi.fn(async () => ({ violation: { vehicle: { ownerId: 'per_1', owner: { cedula } } } })) },
      notification: { findFirst: vi.fn(async () => (reciente ? { id: 'not_1' } : null)) },
    }
  }
  const enviado = { channel: 'WHATSAPP', status: 'SENT' } as const

  it('manda el primer WhatsApp de un dueño de demo', async () => {
    const notify = vi.fn(async () => enviado)
    const db = dbAvisos('V11111111', false)
    expect(await notificarConTope(notify, db as never, () => DUENOS, () => 3_600_000)('fin_1')).toEqual(enviado)
    const where = (db.notification.findFirst.mock.calls[0] as unknown as [{ where: { fine: unknown } }])[0].where
    expect(where.fine).toEqual({ violation: { vehicle: { ownerId: 'per_1' } } })
  })

  it('no manda otro si ya recibió uno en la ventana (la multa queda igual)', async () => {
    const notify = vi.fn(async () => enviado)
    const r = await notificarConTope(notify, dbAvisos('V11111111', true) as never, () => DUENOS, () => 3_600_000)('fin_2')
    expect(r).toEqual({ channel: 'WHATSAPP', status: 'DRY_RUN' })
    expect(notify).not.toHaveBeenCalled()
  })

  it('a los titulares que no son de demo no les cambia nada', async () => {
    const notify = vi.fn(async () => enviado)
    const db = dbAvisos('V99999999', true)
    expect(await notificarConTope(notify, db as never, () => DUENOS, () => 3_600_000)('fin_3')).toEqual(enviado)
    expect(db.notification.findFirst).not.toHaveBeenCalled()
  })

  it('la ventana se configura en minutos con DEMO_WHATSAPP_CADA_MIN (60 por defecto)', () => {
    expect(esperaEntreWhatsappMs({})).toBe(3_600_000)
    expect(esperaEntreWhatsappMs({ DEMO_WHATSAPP_CADA_MIN: '5' })).toBe(300_000)
  })
})
