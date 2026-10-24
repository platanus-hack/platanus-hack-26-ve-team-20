import { describe, expect, it } from 'vitest'
import { PredictResponseSchema, type PredictResponse } from './ml-client.ts'
import { evaluate, lightAt, toServerTime } from './rules.ts'

const STARTED = '2026-10-24T14:03:10.000Z'
const T0 = Date.parse(STARTED)

// Respuesta del servicio ML: un carro cruza a los 1800 ms con placa AB123CD.
function response(overrides: { atMs?: number | null; plate?: string | null; conf?: number; idSwitch?: boolean; votes?: number } = {}): PredictResponse {
  const { atMs = 1800, plate = 'AB123CD', conf = 0.9, idSwitch = false, votes = 6 } = overrides
  return PredictResponseSchema.parse({
    modelVersion: 'vc-0.1',
    latencyMs: 10,
    clip: { fps: 30, frameCount: 120, durationMs: 4000, timestampSource: 'pts' },
    tracks: [{
      trackId: 1, class: 'car', idSwitchSuspected: idSwitch,
      stopLine: { crossed: atMs !== null, atMs, framesConfirmed: 5 },
    }],
    plates: plate === null ? [] : [{ trackId: 1, text: plate, ocrConfidence: conf, votes, bestFrameMs: 1500 }],
    keyFrames: [],
  })
}

const red = [{ state: 'RED', at: new Date(T0 - 5000) }]
const ctx = (lightChanges: Array<{ state: string; at: Date | string }>, clockOffsetMs = 0) =>
  ({ lightChanges, startedAt: STARTED, clockOffsetMs, threshold: 0.8, stopLineFrames: 3 })

describe('lightAt', () => {
  const changes = [
    { state: 'GREEN', at: new Date(T0) },
    { state: 'RED', at: new Date(T0 + 1000) },
    { state: 'YELLOW', at: new Date(T0 + 3000) },
  ]
  it('usa el último cambio en o antes del instante, sin importar el orden', () => {
    expect(lightAt([...changes].reverse(), T0 + 1500)).toBe('RED')
    expect(lightAt(changes, T0 + 1000)).toBe('RED')
    expect(lightAt(changes, T0 + 999)).toBe('GREEN')
  })
  it('amarillo cuenta como verde y sin historia es UNKNOWN', () => {
    expect(lightAt(changes, T0 + 3500)).toBe('GREEN')
    expect(lightAt(changes, T0 - 1)).toBe('UNKNOWN')
  })
})

describe('toServerTime', () => {
  it('suma el offset del reloj del teléfono y el instante del clip', () => {
    expect(toServerTime(STARTED, -230, 1800)).toBe(T0 - 230 + 1800)
  })
})

describe('evaluate (doble llave)', () => {
  it('cruce con luz roja y placa válida → VIOLATION', () => {
    const r = evaluate(response(), ctx(red))
    expect(r.verdict).toBe('VIOLATION')
    expect(r.plate).toBe('AB123CD')
    expect(r.crossing).toEqual({ crossedStopLine: true, atMs: 1800, lightState: 'RED' })
    expect(r.crossedAt).toBe(T0 + 1800)
  })

  it('cruce en verde → NO_VIOLATION', () => {
    expect(evaluate(response(), ctx([{ state: 'GREEN', at: new Date(T0 - 5000) }])).verdict).toBe('NO_VIOLATION')
  })

  it('la luz se evalúa en el instante del cruce, con el offset del reloj', () => {
    // Rojo desde T0+2000: el cruce a 1800 ms fue en verde, salvo que el teléfono vaya 500 ms atrasado.
    const changes = [{ state: 'GREEN', at: new Date(T0 - 5000) }, { state: 'RED', at: new Date(T0 + 2000) }]
    expect(evaluate(response(), ctx(changes)).verdict).toBe('NO_VIOLATION')
    expect(evaluate(response(), ctx(changes, 500)).verdict).toBe('VIOLATION')
  })

  it('nadie cruza → NO_VIOLATION sin placa', () => {
    const r = evaluate(response({ atMs: null }), ctx(red))
    expect(r.verdict).toBe('NO_VIOLATION')
    expect(r.crossing.crossedStopLine).toBe(false)
  })

  it.each([
    ['sin placa', { plate: null }, 'NO_PLATE'],
    ['placa con ?', { plate: 'AB12?CD' }, 'NO_PLATE'],
    ['placa fuera de formato venezolano', { plate: 'ABC1234' }, 'NO_PLATE'],
    ['confianza bajo el umbral', { conf: 0.6 }, 'LOW_CONFIDENCE'],
    ['una sola lectura de OCR (confianza 1.0 engañosa)', { conf: 1, votes: 1 }, 'LOW_CONFIDENCE'],
    ['cambio de ID sospechado', { idSwitch: true }, 'MODEL_RULE_DISAGREE'],
  ] as const)('%s → NEEDS_REVIEW', (_name, overrides, reason) => {
    const r = evaluate(response(overrides), ctx(red))
    expect(r.verdict).toBe('NEEDS_REVIEW')
    expect(r.reviewReason).toBe(reason)
  })

  it('luz que cambia en el instante del cruce o sin semáforo registrado → MODEL_RULE_DISAGREE', () => {
    const justChanged = [{ state: 'GREEN', at: new Date(T0) }, { state: 'RED', at: new Date(T0 + 1700) }]
    expect(evaluate(response(), ctx(justChanged)).reviewReason).toBe('MODEL_RULE_DISAGREE')
    expect(evaluate(response(), ctx([])).reviewReason).toBe('MODEL_RULE_DISAGREE')
  })

  it('acepta placas de moto, de carga y del formato antiguo', () => {
    expect(evaluate(response({ plate: 'AB1C23D' }), ctx(red)).verdict).toBe('VIOLATION')
    expect(evaluate(response({ plate: 'AHA79M' }), ctx(red)).verdict).toBe('VIOLATION')
    expect(evaluate(response({ plate: 'a12-bc3d' }), ctx(red)).plate).toBe('A12BC3D')
  })
})
