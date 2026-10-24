import { describe, expect, it, vi } from 'vitest'
import { assignDemoOwner, demoOwnerCedulas, ownerFor } from './demo-owners.ts'

// Cédulas inventadas (las reales van solo en DEMO_DUENOS_CEDULAS, fuera del repo).
const DUENOS = ['V11111111', 'V22222222']

function fakeDb(opts: { existe?: boolean; persona?: boolean; choque?: boolean; reciente?: boolean } = {}) {
  return {
    vehicle: {
      findUnique: vi.fn(async () => (opts.existe ? { id: 'veh_x' } : null)),
      create: vi.fn(async () => {
        if (opts.choque) throw Object.assign(new Error('unique'), { code: 'P2002' })
        return { id: 'veh_nuevo' }
      }),
    },
    person: { findUnique: vi.fn(async ({ where }: { where: { cedula: string } }) => (opts.persona === false ? null : { id: `per_${where.cedula}` })) },
    auditLog: { create: vi.fn(async () => ({})), findFirst: vi.fn(async () => (opts.reciente ? { id: 'aud_1' } : null)) },
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
    ['ese dueño ya recibió una placa nueva hace menos de 2 minutos (tope anti-spam)', { reciente: true }, DUENOS],
  ] as const)('no asigna si %s', async (_caso, opts, duenos) => {
    const db = fakeDb(opts)
    expect(await assignDemoOwner(db as never, 'AB123CD', duenos)).toBeNull()
    expect(db.auditLog.create).not.toHaveBeenCalled()
  })
})

describe('tope anti-spam', () => {
  it('busca la última asignación de ESE dueño dentro de la ventana', async () => {
    const db = fakeDb()
    const antes = Date.now()
    await assignDemoOwner(db as never, 'AB123CD', DUENOS, 120_000)
    const where = (db.auditLog.findFirst.mock.calls[0] as unknown as [{ where: { action: string; after: unknown; createdAt: { gt: Date } } }])[0].where
    expect(where.action).toBe('DEMO_VEHICLE_ASSIGNED')
    expect(where.after).toEqual({ path: ['ownerId'], equals: `per_${ownerFor('AB123CD', DUENOS)}` })
    expect(antes - where.createdAt.gt.getTime()).toBeGreaterThanOrEqual(119_000)
  })

  it('la espera se configura en minutos con DEMO_ESPERA_MIN (2 por defecto)', async () => {
    const { esperaEntreAsignacionesMs } = await import('./demo-owners.ts')
    expect(esperaEntreAsignacionesMs({})).toBe(120_000)
    expect(esperaEntreAsignacionesMs({ DEMO_ESPERA_MIN: '5' })).toBe(300_000)
    expect(esperaEntreAsignacionesMs({ DEMO_ESPERA_MIN: '0' })).toBe(0)
  })
})
