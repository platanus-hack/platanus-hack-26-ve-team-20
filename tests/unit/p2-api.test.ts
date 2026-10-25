import type { VercelRequest, VercelResponse } from '@vercel/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VisionResult } from '../../lib/contracts/index.ts'

const mocks = vi.hoisted(() => ({
  db: {
    camera: { findUnique: vi.fn(), findMany: vi.fn() },
    lightChange: { create: vi.fn(), findFirst: vi.fn() },
  },
  analyze: vi.fn(),
  registerDetection: vi.fn(),
  assignDemoOwner: vi.fn(async () => null),
  saveImage: vi.fn(async (path: string) => `https://blob.test/${path}`),
  handleUpload: vi.fn(),
}))
vi.mock('../../lib/db.ts', () => ({ db: mocks.db }))
vi.mock('../../lib/vision/index.ts', () => ({ analyze: mocks.analyze }))
vi.mock('../../lib/vision/registro-demo.ts', () => ({ registerDetectionDemo: mocks.registerDetection }))
vi.mock('../../lib/vision/demo-owners.ts', () => ({ assignDemoOwner: mocks.assignDemoOwner }))
vi.mock('../../lib/storage/blob.ts', () => ({ saveImage: mocks.saveImage, isEvidenceUrl: (u: string) => u.startsWith('https://x.private.blob.vercel-storage.com/evidence/'), readEvidence: vi.fn(async () => null), CLIP_PREFIX: 'evidence/clips/', CLIP_CONTENT_TYPES: ['video/mp4', 'video/quicktime'], CLIP_MAX_BYTES: 30 * 1024 * 1024 }))
vi.mock('@vercel/blob/client', () => ({ handleUpload: mocks.handleUpload }))

const { default: time } = await import('../../api/_p2/time.ts')
const { default: upload } = await import('../../api/_p2/blob-upload.ts')
const { default: light } = await import('../../api/_p2/camera-light.ts')
const { default: detections } = await import('../../api/_p2/detections.ts')
const { default: live } = await import('../../api/_p2/live-violation.ts')
const { default: evidencia } = await import('../../api/_p2/evidence.ts')

const KEY = 'clave-de-camara-de-prueba'
process.env['CAMERA_API_KEY'] = KEY

function fakeRes() {
  const res = { status: vi.fn(() => res), json: vi.fn(() => res), setHeader: vi.fn(() => res) }
  return res
}
async function call(
  fn: (req: VercelRequest, res: VercelResponse) => unknown,
  req: { method: string; body?: unknown; query?: Record<string, string>; key?: string | null },
) {
  const res = fakeRes()
  const headers = req.key === null ? {} : { 'x-camera-key': req.key ?? KEY }
  await fn({ method: req.method, body: req.body, query: req.query ?? {}, headers } as unknown as VercelRequest, res as unknown as VercelResponse)
  const [status] = res.status.mock.calls.at(-1) as unknown as [number]
  const [body] = res.json.mock.calls.at(-1) as unknown as [unknown]
  return { status, body }
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/time', () => {
  it('devuelve la hora del servidor sin clave', async () => {
    const { status, body } = await call(time, { method: 'GET', key: null })
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, data: { now: expect.any(String) } })
  })
})

describe('X-Camera-Key', () => {
  it.each([null, 'otra-clave-de-camara-xx'])('rechaza clave %s', async (key) => {
    const { status, body } = await call(detections, { method: 'POST', body: {}, key })
    expect(status).toBe(401)
    expect(body).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } })
  })
})

describe('POST /api/blob/upload', () => {
  const tokenRequest = (pathname: string) => ({
    type: 'blob.generate-client-token', payload: { pathname, multipart: false, clientPayload: null },
  })

  it('genera el token solo para evidence/clips/ con tipos y tamaño acotados', async () => {
    mocks.handleUpload.mockResolvedValue({ type: 'blob.generate-client-token', clientToken: 'tok' })
    const { status, body } = await call(upload, { method: 'POST', body: tokenRequest('evidence/clips/a.mp4') })
    expect(status).toBe(200)
    expect(body).toEqual({ type: 'blob.generate-client-token', clientToken: 'tok' })
    const opts = mocks.handleUpload.mock.calls[0]![0] as { onBeforeGenerateToken: () => Promise<unknown> }
    await expect(opts.onBeforeGenerateToken()).resolves.toMatchObject({
      allowedContentTypes: ['video/mp4', 'video/quicktime'], maximumSizeInBytes: 30 * 1024 * 1024,
    })
  })

  it('rechaza rutas fuera de evidence/clips/', async () => {
    const { status } = await call(upload, { method: 'POST', body: tokenRequest('otra/cosa.mp4') })
    expect(status).toBe(400)
    expect(mocks.handleUpload).not.toHaveBeenCalled()
  })
})

describe('/api/cameras/[id]/light', () => {
  it('amarillo se guarda como GREEN', async () => {
    mocks.db.camera.findUnique.mockResolvedValue({ id: 'cam_1' })
    mocks.db.lightChange.create.mockImplementation(async ({ data }) => ({ ...data, at: new Date('2026-10-24T14:00:00Z') }))
    const { status, body } = await call(light, { method: 'POST', query: { id: 'cam_1' }, body: { state: 'YELLOW' } })
    expect(status).toBe(201)
    expect(mocks.db.lightChange.create).toHaveBeenCalledWith({ data: { cameraId: 'cam_1', state: 'GREEN' } })
    expect(body).toEqual({ ok: true, data: { state: 'GREEN', at: '2026-10-24T14:00:00.000Z' } })
  })

  it('sin cambios registrados el estado es UNKNOWN', async () => {
    mocks.db.camera.findUnique.mockResolvedValue({ id: 'cam_1' })
    mocks.db.lightChange.findFirst.mockResolvedValue(null)
    const { body } = await call(light, { method: 'GET', query: { id: 'cam_1' } })
    expect(body).toEqual({ ok: true, data: { state: 'UNKNOWN', at: null } })
  })

  it('cámara inexistente → 404', async () => {
    mocks.db.camera.findUnique.mockResolvedValue(null)
    const { status } = await call(light, { method: 'POST', query: { id: 'x' }, body: { state: 'RED' } })
    expect(status).toBe(404)
  })
})

describe('POST /api/detections', () => {
  const body = {
    cameraCode: 'CAM-001',
    clip: { url: 'https://blob.test/evidence/clips/a.mp4', startedAt: '2026-10-24T14:03:10.100Z', durationMs: 4000 },
    clockOffsetMs: -230,
  }
  const vision = (verdict: VisionResult['verdict']): Partial<VisionResult> => ({
    verdict, plate: 'AB123CD', confidence: 0.9,
    crossing: { crossedStopLine: true, atMs: 1800, lightState: 'RED' },
    motion: { speedKmh: null, laneId: null, directionDeg: null, relation: 'UNKNOWN' },
  })

  beforeEach(() => {
    mocks.registerDetection.mockImplementation(async (r: VisionResult) => ({
      violationId: 'vio_1', status: r.verdict === 'NO_VIOLATION' ? 'VOID' : 'FINED', fineId: 'fine_1', duplicate: false,
    }))
  })

  it('analiza el clip de la cámara y registra la violación', async () => {
    mocks.db.camera.findUnique.mockResolvedValue({ id: 'cam_1', active: true })
    mocks.analyze.mockImplementation(async (i: { idempotencyKey: string }) => ({ ...vision('VIOLATION'), idempotencyKey: i.idempotencyKey }))
    const { status, body: res } = await call(detections, { method: 'POST', body })
    expect(status).toBe(200)
    expect(mocks.analyze).toHaveBeenCalledWith(expect.objectContaining({
      cameraId: 'cam_1', clipUrl: body.clip.url, startedAt: body.clip.startedAt, clockOffsetMs: -230,
      idempotencyKey: expect.stringMatching(/^[0-9a-f]{32}$/),
    }))
    expect(res).toMatchObject({ ok: true, data: { verdict: 'VIOLATION', plate: 'AB123CD', violationId: expect.any(String), duplicate: false } })
  })

  it('la misma URL de clip da la misma llave de idempotencia', async () => {
    mocks.db.camera.findUnique.mockResolvedValue({ id: 'cam_1', active: true })
    mocks.analyze.mockResolvedValue(vision('NO_VIOLATION'))
    await call(detections, { method: 'POST', body })
    await call(detections, { method: 'POST', body })
    const keys = mocks.analyze.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey)
    expect(keys[0]).toBe(keys[1])
  })

  it('sin infracción también se registra (P1 la guarda como VOID para el feed)', async () => {
    mocks.db.camera.findUnique.mockResolvedValue({ id: 'cam_1', active: true })
    mocks.analyze.mockResolvedValue(vision('NO_VIOLATION'))
    const { body: res } = await call(detections, { method: 'POST', body })
    expect(mocks.registerDetection).toHaveBeenCalledOnce()
    expect(res).toMatchObject({ ok: true, data: { verdict: 'NO_VIOLATION', status: 'VOID' } })
  })

  it('cámara desconocida → 404; body inválido → 400', async () => {
    mocks.db.camera.findUnique.mockResolvedValue(null)
    expect((await call(detections, { method: 'POST', body })).status).toBe(404)
    expect((await call(detections, { method: 'POST', body: { cameraCode: 'CAM-001' } })).status).toBe(400)
  })
})

describe('POST /api/live/violations (modo en vivo)', () => {
  const TOKEN = 'token-servicio-ml-de-prueba'
  process.env['ML_SERVICE_TOKEN'] = TOKEN
  const multa = {
    cameraCode: 'CAM-001', occurredAt: '2026-10-24T14:03:10.000Z', trackId: 5, plate: 'XYZ12K',
    plateConfidence: 0.9, votes: 4, rawReads: ['XYZ12K'], modelVersion: 'vc-0.1',
    idempotencyKey: 'en-vivo-0001', sceneJpegBase64: 'ZXNjZW5h', vehicleJpegBase64: 'dmVo', plateJpegBase64: 'cGxhY2E=',
  }
  async function enviar(body: unknown, auth: string | null = `Bearer ${TOKEN}`) {
    const res = fakeRes()
    const headers = auth === null ? {} : { authorization: auth }
    await live({ method: 'POST', body, query: {}, headers } as unknown as VercelRequest, res as unknown as VercelResponse)
    const [status] = res.status.mock.calls.at(-1) as unknown as [number]
    const [json] = res.json.mock.calls.at(-1) as unknown as [unknown]
    return { status, body: json }
  }

  beforeEach(() => {
    mocks.db.camera.findUnique.mockResolvedValue({ id: 'cam_1', active: true })
    mocks.registerDetection.mockImplementation(async (r: VisionResult) => ({
      violationId: 'vio_1', status: r.verdict === 'VIOLATION' ? 'FINED' : 'NEEDS_REVIEW', duplicate: false,
    }))
  })

  it.each([null, 'Bearer otro-token', KEY])('rechaza credenciales inválidas (%s)', async (auth) => {
    expect((await enviar(multa, auth)).status).toBe(401)
    expect(mocks.registerDetection).not.toHaveBeenCalled()
  })

  it('placa confiable → VIOLATION con la evidencia en Blob y luz RED', async () => {
    const { status, body } = await enviar(multa)
    expect(status).toBe(200)
    expect(body).toMatchObject({ ok: true, data: { verdict: 'VIOLATION', plate: 'XYZ12K', status: 'FINED' } })
    const r = mocks.registerDetection.mock.calls[0]![0] as VisionResult
    expect(r).toMatchObject({
      cameraId: 'cam_1', type: 'RED_LIGHT', idempotencyKey: 'en-vivo-0001',
      crossing: { crossedStopLine: true, lightState: 'RED' },
      clipUrl: 'https://blob.test/evidence/cam_1/en-vivo-0001/escena.jpg',
      plateCropUrl: 'https://blob.test/evidence/cam_1/en-vivo-0001/placa.jpg',
    })
    expect(r.frames).toHaveLength(2)
  })

  it('placa confiable nueva → se asigna a un dueño de demo antes de registrar la multa', async () => {
    await enviar(multa)
    expect(mocks.assignDemoOwner).toHaveBeenCalledWith(expect.anything(), 'XYZ12K')
    expect(mocks.assignDemoOwner.mock.invocationCallOrder[0]).toBeLessThan(mocks.registerDetection.mock.invocationCallOrder[0]!)
  })

  it('placa dudosa → no se asigna dueño', async () => {
    await enviar({ ...multa, votes: 1 })
    expect(mocks.assignDemoOwner).not.toHaveBeenCalled()
  })

  it('placa estimada (plan B) con confianza >= 70 % → se multa aunque tenga una sola lectura', async () => {
    const { body } = await enviar({ ...multa, plateGuessed: true, plateConfidence: 0.74, votes: 1 })
    expect(body).toMatchObject({ ok: true, data: { verdict: 'VIOLATION', plate: 'XYZ12K' } })
    expect(mocks.registerDetection.mock.calls[0]![0]).toMatchObject({ aiOutput: { plateGuessed: true } })
  })

  it('placa estimada con menos de 70 % → revisión humana', async () => {
    const { body } = await enviar({ ...multa, plateGuessed: true, plateConfidence: 0.65, votes: 3 })
    expect(body).toMatchObject({ ok: true, data: { verdict: 'NEEDS_REVIEW' } })
  })

  it('placa no leída → NEEDS_REVIEW (NO_PLATE); se registra igual con su evidencia', async () => {
    const { body } = await enviar({ ...multa, plate: null, plateConfidence: 0, votes: 0, plateJpegBase64: null })
    expect(body).toMatchObject({ ok: true, data: { verdict: 'NEEDS_REVIEW', status: 'NEEDS_REVIEW' } })
    expect(mocks.registerDetection.mock.calls[0]![0]).toMatchObject({ reviewReason: 'NO_PLATE', plate: null })
  })

  it('cámara desconocida → 404', async () => {
    mocks.db.camera.findUnique.mockResolvedValue(null)
    expect((await enviar(multa)).status).toBe(404)
  })
})

describe('GET /api/evidence', () => {
  it('rechaza URLs que no son evidencia de Vercel Blob (no es un proxy abierto)', async () => {
    const { status } = await call(evidencia, { method: 'GET', query: { u: 'https://evil.example.com/evidence/a.jpg' }, key: null })
    expect(status).toBe(400)
  })

  it('404 si la evidencia no existe', async () => {
    const { status } = await call(evidencia, { method: 'GET', query: { u: 'https://x.private.blob.vercel-storage.com/evidence/a.jpg' }, key: null })
    expect(status).toBe(404)
  })
})
