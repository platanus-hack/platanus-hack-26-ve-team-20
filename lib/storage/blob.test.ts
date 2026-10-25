import { describe, expect, it, vi } from 'vitest'

const blob = vi.hoisted(() => ({ put: vi.fn(async () => ({ url: 'https://abc.private.blob.vercel-storage.com/evidence/x-1.jpg' })), get: vi.fn() }))
vi.mock('@vercel/blob', () => blob)
const { isEvidenceUrl, readEvidence, saveImage } = await import('./blob.ts')

describe('evidencia en Vercel Blob (store privado)', () => {
  it('sube las fotos como privadas', async () => {
    await saveImage('evidence/cam/k/escena.jpg', 'AAAA')
    expect(blob.put).toHaveBeenCalledWith('evidence/cam/k/escena.jpg', expect.any(Buffer), expect.objectContaining({ access: 'private', addRandomSuffix: true }))
  })

  it.each([
    ['https://abc.private.blob.vercel-storage.com/evidence/cam/k/escena-x.jpg', true],
    ['https://abc.public.blob.vercel-storage.com/evidence/a.jpg', true],
    ['https://abc.private.blob.vercel-storage.com/otra-cosa/a.jpg', false],
    ['https://evil.example.com/evidence/a.jpg', false],
    ['http://abc.private.blob.vercel-storage.com/evidence/a.jpg', false],
    ['no es una url', false],
  ])('isEvidenceUrl(%s) = %s', (url, ok) => {
    expect(isEvidenceUrl(url)).toBe(ok)
  })

  it('lee la evidencia privada y devuelve null si no existe', async () => {
    blob.get.mockResolvedValueOnce({ statusCode: 200, stream: 'S', blob: { contentType: 'image/jpeg' } })
    expect(await readEvidence('https://abc.private.blob.vercel-storage.com/evidence/a.jpg')).toEqual({ stream: 'S', contentType: 'image/jpeg' })
    expect(blob.get).toHaveBeenCalledWith(expect.any(String), { access: 'private' })
    blob.get.mockResolvedValueOnce(null)
    expect(await readEvidence('https://abc.private.blob.vercel-storage.com/evidence/b.jpg')).toBeNull()
  })
})
