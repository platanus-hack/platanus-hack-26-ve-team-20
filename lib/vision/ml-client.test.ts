import { describe, expect, it, vi } from 'vitest'
import { MlServiceError, mlConfigFromEnv, predict, type PredictRequest } from './ml-client.ts'

const CONFIG = { url: 'http://ml.test', token: 'token-de-prueba' }
const REQ: PredictRequest = {
  cameraCode: 'CAM-001',
  clip: { url: 'https://blob.test/evidence/clips/a.mp4', startedAt: '2026-10-24T14:03:10.100Z' },
  calibration: { configVersion: 1, stopLine: [[0.3, 0.5], [0.7, 0.5]], lanes: [], parameters: {} },
}
const OK_BODY = {
  modelVersion: 'vc-0.1', latencyMs: 3200,
  clip: { fps: 30, frameCount: 120, durationMs: 4000, timestampSource: 'pts' },
  tracks: [{ trackId: 1, class: 'car', stopLine: { crossed: true, atMs: 1800 } }],
  plates: [{ trackId: 1, text: 'AB123CD', ocrConfidence: 0.88, votes: 7, bestFrameMs: 1500 }],
  keyFrames: [{ ms: 1500, jpegBase64: 'AAAA' }],
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('mlConfigFromEnv', () => {
  it('exige URL y token, y quita la barra final', () => {
    expect(() => mlConfigFromEnv({})).toThrow(MlServiceError)
    expect(mlConfigFromEnv({ ML_SERVICE_URL: 'http://x/', ML_SERVICE_TOKEN: 't' })).toEqual({ url: 'http://x', token: 't' })
  })
})

describe('predict', () => {
  it('manda el Bearer y valida la respuesta', async () => {
    const fetchImpl = vi.fn(async () => json(200, OK_BODY))
    const res = await predict(REQ, { config: CONFIG, fetchImpl })
    expect(res.tracks[0]?.stopLine.atMs).toBe(1800)
    expect(res.tracks[0]?.relation).toBe('UNKNOWN')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://ml.test/predict')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer token-de-prueba')
  })

  it('acepta respuestas sin choques (servicio viejo) y valida los choques cuando vienen', async () => {
    const sinChoques = await predict(REQ, { config: CONFIG, fetchImpl: vi.fn(async () => json(200, OK_BODY)) })
    expect(sinChoques.incidents).toEqual([])
    const incident = {
      kind: 'CRASH', atMs: 2100, confidence: 0.81, box: { x: 0.3, y: 0.3, w: 0.2, h: 0.2 },
      vehicles: [{ trackId: 3, class: 'car', plate: null, ocrConfidence: 0, votes: 0 }],
    }
    const conChoque = await predict(REQ, { config: CONFIG, fetchImpl: vi.fn(async () => json(200, { ...OK_BODY, incidents: [incident] })) })
    expect(conChoque.incidents[0]).toMatchObject({ kind: 'CRASH', vehicles: [{ trackId: 3, plate: null, rawReads: [] }] })
    const malo = vi.fn(async () => json(200, { ...OK_BODY, incidents: [{ ...incident, kind: 'MULTA' }] }))
    await expect(predict(REQ, { config: CONFIG, fetchImpl: malo })).rejects.toThrow('inválida')
  })

  it('reintenta una vez ante un 5xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(json(200, OK_BODY))
    await expect(predict(REQ, { config: CONFIG, fetchImpl })).resolves.toMatchObject({ modelVersion: 'vc-0.1' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('no reintenta un 4xx', async () => {
    const fetchImpl = vi.fn(async () => json(422, { detail: 'clip ilegible' }))
    await expect(predict(REQ, { config: CONFIG, fetchImpl })).rejects.toThrow(MlServiceError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('respuesta con forma inválida → MlServiceError', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ...OK_BODY, plates: [{ text: 'AB123CD' }] }))
    await expect(predict(REQ, { config: CONFIG, fetchImpl })).rejects.toThrow('inválida')
  })

  it('red caída dos veces → MlServiceError', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed') })
    await expect(predict(REQ, { config: CONFIG, fetchImpl })).rejects.toThrow(MlServiceError)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
