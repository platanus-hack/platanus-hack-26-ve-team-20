import { describe, expect, it, vi } from 'vitest'
import { createAnalyze, type AnalyzeDeps } from './analyze.ts'
import { MlServiceError, PredictResponseSchema } from './ml-client.ts'

const STARTED = '2026-10-24T14:03:10.000Z'
const T0 = Date.parse(STARTED)
const INPUT = { cameraId: 'cam_1', clipUrl: 'https://blob.test/a.mp4', startedAt: STARTED, clockOffsetMs: 0, idempotencyKey: 'idem-0001' }
const CAMERA = {
  code: 'CAM-001',
  calibration: { configVersion: 2, stopLine: [[0.3, 0.5], [0.7, 0.5]], lanes: [], parameters: { stopLineFrames: 3 } },
}
const ML = PredictResponseSchema.parse({
  modelVersion: 'vc-0.1', latencyMs: 3000,
  clip: { fps: 30, frameCount: 120, durationMs: 4000, timestampSource: 'pts' },
  tracks: [{ trackId: 1, class: 'car', stopLine: { crossed: true, atMs: 1800, framesConfirmed: 5 } }],
  plates: [{ trackId: 1, text: 'AB123CD', ocrConfidence: 0.9, votes: 7, bestFrameMs: 1500 }],
  keyFrames: [{ ms: 1800, jpegBase64: 'ZXNjZW5h' }],
  plateCropBase64: 'cGxhY2E=',
})

function deps(overrides: Partial<AnalyzeDeps> = {}): AnalyzeDeps {
  return {
    loadCamera: vi.fn(async () => CAMERA),
    loadLightChanges: vi.fn(async () => [{ state: 'RED', at: new Date(T0 - 5000) }]),
    saveImage: vi.fn(async (path: string) => `https://blob.test/${path}`),
    predict: vi.fn(async () => ML),
    ...overrides,
  }
}

describe('analyze', () => {
  it('cruce en rojo → VisionResult VIOLATION con evidencias en Blob', async () => {
    const d = deps()
    const r = await createAnalyze(d)(INPUT)
    expect(r).toMatchObject({
      verdict: 'VIOLATION', plate: 'AB123CD', clipUrl: INPUT.clipUrl, modelVersion: 'vc-0.1',
      occurredAt: new Date(T0 + 1800).toISOString(),
      crossing: { crossedStopLine: true, atMs: 1800, lightState: 'RED' },
      plateCropUrl: 'https://blob.test/evidence/cam_1/idem-0001/plate.jpg',
    })
    expect(r.frames).toEqual([{ url: 'https://blob.test/evidence/cam_1/idem-0001/frame-1800.jpg', capturedAt: r.occurredAt, lightState: 'RED' }])
    expect(JSON.stringify(r.aiOutput)).not.toContain('ZXNjZW5h')
    expect(d.predict).toHaveBeenCalledWith(expect.objectContaining({ cameraCode: 'CAM-001', clip: { url: INPUT.clipUrl, startedAt: STARTED } }))
  })

  it('servicio ML caído → NEEDS_REVIEW (ML_SERVICE_ERROR) sin perder el clip', async () => {
    const r = await createAnalyze(deps({ predict: vi.fn(async () => { throw new MlServiceError('caído') }) }))(INPUT)
    expect(r).toMatchObject({ verdict: 'NEEDS_REVIEW', reviewReason: 'ML_SERVICE_ERROR', clipUrl: INPUT.clipUrl })
  })

  it('cámara sin calibrar → NEEDS_REVIEW (ML_SERVICE_ERROR) sin llamar al servicio', async () => {
    const d = deps({ loadCamera: vi.fn(async () => ({ code: 'CAM-001', calibration: { configVersion: 1 } })) })
    const r = await createAnalyze(d)(INPUT)
    expect(r.reviewReason).toBe('ML_SERVICE_ERROR')
    expect(d.predict).not.toHaveBeenCalled()
  })

  it('confianza bajo el umbral → NEEDS_REVIEW (LOW_CONFIDENCE)', async () => {
    const r = await createAnalyze(deps({ threshold: 0.95 }))(INPUT)
    expect(r).toMatchObject({ verdict: 'NEEDS_REVIEW', reviewReason: 'LOW_CONFIDENCE' })
  })
})
