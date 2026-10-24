import { describe, expect, it } from 'vitest'
import { haversineMeters } from '../geo/haversine.ts'
import { alertRadiusFromEnv, decideAlert, type OfficerCandidate } from './decide.ts'

// Cámara de ejemplo (docs/04 §1) y oficiales como en el seed de docs/03 §5
const CAMERA = { lat: 10.4806, lng: -66.9036 }
const NOW = new Date('2026-10-24T14:00:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

const officer = (id: string, dLat: number, ageMin = 1, onDuty = true): OfficerCandidate => ({
  id,
  onDuty,
  lastLocation: { lat: CAMERA.lat + dLat, lng: CAMERA.lng, recordedAt: minutesAgo(ageMin) },
})
const NEAR = officer('of_a', 0.0036) // ~400 m
const FAR = officer('of_b', 0.027) // ~3 km
const NO_LOCATION: OfficerCandidate = { id: 'of_c', onDuty: true, lastLocation: null }

describe('decideAlert (docs/04 §6)', () => {
  it('escenario de la demo: elige al oficial a ~400 m', () => {
    expect(decideAlert({ camera: CAMERA, officers: [FAR, NO_LOCATION, NEAR], previousAlerts: [], now: NOW })).toEqual({
      status: 'SENT',
      officerId: 'of_a',
      distanceM: 400,
    })
  })

  it('nadie dentro del radio = NO_OFFICER_NEARBY', () => {
    expect(decideAlert({ camera: CAMERA, officers: [FAR, NO_LOCATION], previousAlerts: [], now: NOW })).toEqual({
      status: 'NO_OFFICER_NEARBY',
    })
    expect(decideAlert({ camera: CAMERA, officers: [], previousAlerts: [], now: NOW }).status).toBe('NO_OFFICER_NEARBY')
  })

  it('ignora oficiales fuera de servicio y ubicaciones de 10 min o más', () => {
    const offDuty = officer('of_d', 0.001, 1, false)
    const stale = officer('of_e', 0.001, 10)
    const fresh = officer('of_f', 0.004, 9)
    expect(decideAlert({ camera: CAMERA, officers: [offDuty, stale, fresh], previousAlerts: [], now: NOW })).toMatchObject({
      status: 'SENT',
      officerId: 'of_f',
    })
    expect(decideAlert({ camera: CAMERA, officers: [offDuty, stale], previousAlerts: [], now: NOW }).status).toBe('NO_OFFICER_NEARBY')
  })

  it('respeta el radio configurado, incluido el borde', () => {
    expect(decideAlert({ camera: CAMERA, officers: [FAR], previousAlerts: [], now: NOW, radiusM: 5000 })).toMatchObject({
      status: 'SENT',
      officerId: 'of_b',
    })
    expect(decideAlert({ camera: CAMERA, officers: [NEAR], previousAlerts: [], now: NOW, radiusM: 300 }).status).toBe('NO_OFFICER_NEARBY')
    const edge = NEAR.lastLocation ? haversineMeters(CAMERA, NEAR.lastLocation) : 0
    const exact = decideAlert({ camera: CAMERA, officers: [NEAR], previousAlerts: [], now: NOW, radiusM: edge })
    expect(exact.status).toBe('SENT')
  })

  it('en empate de distancia elige el id menor, sin importar el orden', () => {
    const twinB = officer('of_z', 0.002)
    const twinA = officer('of_m', 0.002)
    expect(decideAlert({ camera: CAMERA, officers: [twinB, twinA], previousAlerts: [], now: NOW })).toMatchObject({ officerId: 'of_m' })
    expect(decideAlert({ camera: CAMERA, officers: [twinA, twinB], previousAlerts: [], now: NOW })).toMatchObject({ officerId: 'of_m' })
  })

  it('suprime si la misma placa ya alertó a un oficial hace menos de 10 min', () => {
    for (const status of ['SENT', 'ACKNOWLEDGED'] as const) {
      expect(
        decideAlert({ camera: CAMERA, officers: [NEAR], previousAlerts: [{ status, createdAt: minutesAgo(9) }], now: NOW }),
      ).toEqual({ status: 'SUPPRESSED' })
    }
  })

  it('no suprime por alertas de hace 10 min o más, ni por las que no llegaron a nadie', () => {
    const decide = (status: 'SENT' | 'NO_OFFICER_NEARBY' | 'SUPPRESSED', ageMin: number) =>
      decideAlert({ camera: CAMERA, officers: [NEAR], previousAlerts: [{ status, createdAt: minutesAgo(ageMin) }], now: NOW })
    expect(decide('SENT', 10).status).toBe('SENT')
    expect(decide('NO_OFFICER_NEARBY', 2).status).toBe('SENT')
    expect(decide('SUPPRESSED', 2).status).toBe('SENT')
  })

  it('la misma placa vista 3 veces en 5 min da 1 alerta y 2 suprimidas (docs/06 §2)', () => {
    const previous: { status: 'SENT' | 'SUPPRESSED'; createdAt: Date }[] = []
    const outcomes = [0, 2, 5].map((minute) => {
      const now = new Date(NOW.getTime() + minute * 60_000)
      const officers = [{ ...NEAR, lastLocation: { ...CAMERA, lat: CAMERA.lat + 0.0036, recordedAt: now } }]
      const d = decideAlert({ camera: CAMERA, officers, previousAlerts: previous, now })
      if (d.status === 'SENT' || d.status === 'SUPPRESSED') previous.push({ status: d.status, createdAt: now })
      return d.status
    })
    expect(outcomes).toEqual(['SENT', 'SUPPRESSED', 'SUPPRESSED'])
  })
})

describe('alertRadiusFromEnv', () => {
  it('usa ALERT_RADIUS_METERS o 1500 si falta o no sirve', () => {
    expect(alertRadiusFromEnv({ ALERT_RADIUS_METERS: '2500' })).toBe(2500)
    expect(alertRadiusFromEnv({})).toBe(1500)
    expect(alertRadiusFromEnv({ ALERT_RADIUS_METERS: '' })).toBe(1500)
    expect(alertRadiusFromEnv({ ALERT_RADIUS_METERS: 'mucho' })).toBe(1500)
    expect(alertRadiusFromEnv({ ALERT_RADIUS_METERS: '-5' })).toBe(1500)
  })
})
