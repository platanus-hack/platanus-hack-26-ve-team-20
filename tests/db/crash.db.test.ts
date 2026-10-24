import { afterAll, describe, expect, it } from 'vitest'
import { CRASH } from '../../lib/contracts/index.ts'
import { heartbeat, network, readClip, report, uploadClip } from '../../lib/crash/network.ts'
import { db } from '../../lib/db.ts'

// Flujo completo de la red de choques contra la base real. Los nodos usan nombres test_* y se borran al final.
const nodos: string[] = []
const incidentes: string[] = []

afterAll(async () => {
  await db.crashIncident.deleteMany({ where: { id: { in: incidentes } } })
  await db.crashNode.deleteMany({ where: { id: { in: nodos } } })
  await db.auditLog.deleteMany({ where: { entity: 'CrashIncident', entityId: { in: incidentes } } })
})

async function unir(name: string, x: number, recording = true) {
  const r = await heartbeat(db, { name, x, y: 240, heading: 0, recording })
  nodos.push(r.nodeId)
  return r.nodeId
}

describe('red de choques (db)', () => {
  it('reporte → alerta en el latido → clip subido y servido', async () => {
    const rep = await unir('test_rep', 100)
    const cerca = await unir('test_cerca', 200)
    const lejos = await unir('test_lejos', 700)
    const sinCamara = await unir('test_sin_camara', 150, false)

    const { incident, ownAlert } = await report(db, { x: 118, y: 240, radiusM: 150, reporterId: rep })
    incidentes.push(incident.id)
    const alertados = incident.alerts.map((a) => a.nodeId)
    expect(alertados).toContain(rep)
    expect(alertados).toContain(cerca)
    expect(alertados).not.toContain(lejos)
    expect(alertados).not.toContain(sinCamara) // solo los que graban
    expect(ownAlert?.id).toBeTruthy()
    expect(incident.alerts.find((a) => a.nodeId === rep)?.status).toBe('CAPTURING')

    // el cercano recoge su alerta en el siguiente latido, una sola vez
    const latido = await heartbeat(db, { nodeId: cerca, name: 'test_cerca', x: 200, y: 240, heading: 0, recording: true })
    expect(latido.alert?.incidentId).toBe(incident.id)
    const otro = await heartbeat(db, { nodeId: cerca, name: 'test_cerca', x: 200, y: 240, heading: 0, recording: true })
    expect(otro.alert).toBeNull()

    const video = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])
    const subido = await uploadClip(db, latido.alert!.id, video, { type: 'video/webm', t0: 11.5, duration: 16.5 })
    expect(subido.clipUrl).toContain(latido.alert!.id)
    await expect(uploadClip(db, latido.alert!.id, video, { type: 'video/webm', t0: 1, duration: 1 })).rejects.toThrow()

    const clip = await readClip(db, latido.alert!.id)
    expect([...clip.bytes]).toEqual([...video])
    expect(clip.type).toBe('video/webm')

    const red = await network(db)
    const vista = red.incident?.alerts.find((a) => a.nodeId === cerca)
    expect(vista?.status).toBe('UPLOADED')
    expect(vista?.clipT0S).toBe(11.5)
    expect(red.nodes.find((n) => n.id === sinCamara)?.recording).toBe(false)
  })

  it('una alerta recogida tarde queda perdida', async () => {
    const a = await unir('test_tarde_a', 640)
    const b = await unir('test_tarde_b', 660)
    const t0 = new Date(Date.now() - (CRASH.BUFFER_MS - CRASH.PRE_MS) - 5_000)
    const { incident } = await report(db, { x: 650, y: 240, radiusM: 30 }, t0)
    incidentes.push(incident.id)
    expect(incident.alerts.map((x) => x.nodeId)).toEqual(expect.arrayContaining([a, b]))
    const latido = await heartbeat(db, { nodeId: b, name: 'test_tarde_b', x: 660, y: 240, heading: 0, recording: true })
    expect(latido.alert).toBeNull()
    expect(await db.crashAlert.findFirst({ where: { incidentId: incident.id, nodeId: b }, select: { status: true } })).toEqual({ status: 'MISSED' })
  })

  it('un reportero que no está grabando no puede reportar', async () => {
    const quieto = await unir('test_quieto', 500, false)
    await expect(report(db, { x: 500, y: 240, radiusM: 150, reporterId: quieto })).rejects.toThrow(/no está grabando/)
  })
})
