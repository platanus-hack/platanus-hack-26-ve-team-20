import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  NO_VIOLATION_VOID_REASON,
  decide,
  readConfidenceThreshold,
} from '../../lib/domain/violations.ts'
import {
  FINE_AMOUNTS_EXAMPLE,
  FINE_DUE_DAYS,
  fineDueAt,
  newPublicToken,
} from '../../lib/domain/fines.ts'
import { VIOLATION_TYPES } from '../../lib/contracts/index.ts'

const ok = { verdict: 'VIOLATION' as const, confidence: 0.92, plateConfidence: 0.95 }
const T = 0.8

describe('decide()', () => {
  it('VIOLATION con placa válida, confianza suficiente y vehículo registrado → multa', () => {
    expect(decide(ok, 'AB123CD', true, T)).toEqual({ to: 'FINED' })
  })

  it('el umbral es inclusivo: confianza igual al umbral sí multa', () => {
    expect(decide({ ...ok, confidence: 0.8, plateConfidence: 0.8 }, 'AB123CD', true, T)).toEqual({ to: 'FINED' })
  })

  it('sin placa o con "?" → NEEDS_REVIEW (NO_PLATE)', () => {
    expect(decide(ok, null, false, T)).toEqual({ to: 'NEEDS_REVIEW', reason: 'NO_PLATE' })
    expect(decide(ok, 'AB12?CD', false, T)).toEqual({ to: 'NEEDS_REVIEW', reason: 'NO_PLATE' })
    expect(decide(ok, 'AB1', false, T)).toEqual({ to: 'NEEDS_REVIEW', reason: 'NO_PLATE' })
  })

  it('confianza del veredicto o de la placa bajo el umbral → LOW_CONFIDENCE', () => {
    expect(decide({ ...ok, confidence: 0.79 }, 'AB123CD', true, T)).toEqual({ to: 'NEEDS_REVIEW', reason: 'LOW_CONFIDENCE' })
    expect(decide({ ...ok, plateConfidence: 0.5 }, 'AB123CD', true, T)).toEqual({ to: 'NEEDS_REVIEW', reason: 'LOW_CONFIDENCE' })
  })

  it('placa legible pero no registrada → PLATE_NOT_FOUND', () => {
    expect(decide(ok, 'ZZ999ZZ', false, T)).toEqual({ to: 'NEEDS_REVIEW', reason: 'PLATE_NOT_FOUND' })
  })

  it('el orden de los motivos es: placa, confianza, registro', () => {
    expect(decide({ ...ok, confidence: 0.1 }, null, false, T)).toMatchObject({ reason: 'NO_PLATE' })
    expect(decide({ ...ok, confidence: 0.1 }, 'ZZ999ZZ', false, T)).toMatchObject({ reason: 'LOW_CONFIDENCE' })
  })

  it('respeta el veredicto del modelo: NEEDS_REVIEW conserva su motivo (o MANUAL) y NO_VIOLATION anula', () => {
    expect(decide({ ...ok, verdict: 'NEEDS_REVIEW', reviewReason: 'ML_SERVICE_ERROR' }, null, false, T))
      .toEqual({ to: 'NEEDS_REVIEW', reason: 'ML_SERVICE_ERROR' })
    expect(decide({ ...ok, verdict: 'NEEDS_REVIEW' }, 'AB123CD', true, T)).toEqual({ to: 'NEEDS_REVIEW', reason: 'MANUAL' })
    expect(decide({ ...ok, verdict: 'NO_VIOLATION' }, 'AB123CD', true, T)).toEqual({ to: 'VOID', voidReason: NO_VIOLATION_VOID_REASON })
  })
})

describe('readConfidenceThreshold()', () => {
  it('usa el valor válido (0, 1] y cae al 0.8 por defecto en cualquier otro caso', () => {
    expect(readConfidenceThreshold('0.9')).toBe(0.9)
    expect(readConfidenceThreshold('1')).toBe(1)
    for (const bad of [undefined, '', 'abc', '0', '-1', '1.5']) {
      expect(readConfidenceThreshold(bad)).toBe(DEFAULT_CONFIDENCE_THRESHOLD)
    }
  })
})

describe('fines', () => {
  it('hay un monto de ejemplo, entero y positivo, para cada tipo de violación', () => {
    for (const type of VIOLATION_TYPES) {
      expect(Number.isInteger(FINE_AMOUNTS_EXAMPLE[type])).toBe(true)
      expect(FINE_AMOUNTS_EXAMPLE[type]).toBeGreaterThan(0)
    }
  })

  it('vence a los 30 días de emitida', () => {
    const issued = new Date('2026-10-24T12:00:00Z')
    expect(FINE_DUE_DAYS).toBe(30)
    expect(fineDueAt(issued).toISOString()).toBe('2026-11-23T12:00:00.000Z')
  })

  it('el token público tiene 24 caracteres seguros para URL y no se repite', () => {
    const tokens = Array.from({ length: 500 }, newPublicToken)
    expect(tokens.every((t) => /^[A-Za-z0-9_-]{24}$/.test(t))).toBe(true)
    expect(new Set(tokens).size).toBe(tokens.length)
  })
})
