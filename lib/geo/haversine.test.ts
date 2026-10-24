import { describe, expect, it } from 'vitest'
import { EARTH_RADIUS_M, haversineMeters, isWithinRadius } from './haversine.ts'

// 1 grado sobre un círculo máximo = 2πR / 360
const ONE_DEGREE_M = (2 * Math.PI * EARTH_RADIUS_M) / 360 // ≈ 111 195,08 m

// Coordenada de la cámara de ejemplo de docs/04 §1 (Caracas)
const CAMERA = { lat: 10.4806, lng: -66.9036 }

describe('haversineMeters', () => {
  it('es 0 para el mismo punto', () => {
    expect(haversineMeters(CAMERA, CAMERA)).toBe(0)
  })

  it('1 grado sobre el ecuador y sobre un meridiano', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(ONE_DEGREE_M, 0)
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(ONE_DEGREE_M, 0)
    expect(ONE_DEGREE_M).toBeCloseTo(111_195.08, 1)
  })

  it('media vuelta al mundo entre antípodas, sin NaN', () => {
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(Math.PI * EARTH_RADIUS_M, 0)
  })

  it('distancias de la demo en Caracas, dentro de ±1 m', () => {
    // oficial ~400 m al norte de la cámara (0,0036° de latitud)
    const near = { lat: CAMERA.lat + 0.0036, lng: CAMERA.lng }
    expect(Math.abs(haversineMeters(CAMERA, near) - 0.0036 * ONE_DEGREE_M)).toBeLessThan(1)
    // oficial ~3 km al este: un grado de longitud se encoge con cos(latitud)
    const far = { lat: CAMERA.lat, lng: CAMERA.lng + 0.0275 }
    const expectedFar = 0.0275 * ONE_DEGREE_M * Math.cos((CAMERA.lat * Math.PI) / 180)
    expect(Math.abs(haversineMeters(CAMERA, far) - expectedFar)).toBeLessThan(1)
    expect(haversineMeters(CAMERA, far)).toBeGreaterThan(2_990)
    expect(haversineMeters(CAMERA, far)).toBeLessThan(3_020)
  })

  it('no depende del orden de los puntos', () => {
    const other = { lat: 10.5061, lng: -66.9146 }
    expect(haversineMeters(CAMERA, other)).toBe(haversineMeters(other, CAMERA))
  })
})

describe('isWithinRadius', () => {
  it('incluye el borde del radio y excluye lo que queda fuera', () => {
    const near = { lat: CAMERA.lat + 0.0036, lng: CAMERA.lng } // ~400 m
    const far = { lat: CAMERA.lat, lng: CAMERA.lng + 0.0275 } // ~3 km
    expect(isWithinRadius(CAMERA, near, 1500)).toBe(true)
    expect(isWithinRadius(CAMERA, far, 1500)).toBe(false)
    expect(isWithinRadius(CAMERA, near, haversineMeters(CAMERA, near))).toBe(true)
  })
})
