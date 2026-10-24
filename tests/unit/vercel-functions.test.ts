import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// El plan Hobby de Vercel rechaza el deploy con más de 12 Serverless Functions
// ("No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan").
// Cuenta como función cada .ts de api/ fuera de carpetas o archivos con prefijo `_`.
const HOBBY_MAX_FUNCTIONS = 12

function functions(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('_')) return []
    const p = join(dir, name)
    return statSync(p).isDirectory() ? functions(p) : name.endsWith('.ts') ? [p] : []
  })
}

describe('Vercel Functions', () => {
  it(`api/ tiene como máximo ${HOBBY_MAX_FUNCTIONS} funciones`, () => {
    const found = functions('api')
    expect(found.length, found.join('\n')).toBeLessThanOrEqual(HOBBY_MAX_FUNCTIONS)
  })

  it('cada ruta de P3 reescrita en vercel.json existe en api/p3.ts, y al revés', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites: Array<{ source: string; destination: string }> }
    const rewritten = vercel.rewrites
      .map((r) => /^\/api\/p3\?route=([\w-]+)/.exec(r.destination)?.[1])
      .filter((r): r is string => Boolean(r))
      .sort()
    const router = readFileSync('api/p3.ts', 'utf8')
    const block = /P3_ROUTES[^{]*\{([\s\S]*?)\n\};/.exec(router)?.[1] ?? ''
    const handled = [...block.matchAll(/^\s*"([\w-]+)":/gm)].map((m) => m[1]).sort()
    expect(handled.length).toBeGreaterThan(0)
    expect(rewritten).toEqual(handled)
  })

  it('cada ruta de P2 reescrita en vercel.json existe en api/p2.ts, y al revés', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites: Array<{ source: string; destination: string }> }
    const rewritten = vercel.rewrites
      .map((r) => /^\/api\/p2\?route=([\w-]+)/.exec(r.destination)?.[1])
      .filter((r): r is string => Boolean(r))
      .sort()
    const router = readFileSync('api/p2.ts', 'utf8')
    const block = /P2_ROUTES[^{]*\{([\s\S]*?)\n\};/.exec(router)?.[1] ?? ''
    const handled = [...block.matchAll(/^\s*"([\w-]+)":/gm)].map((m) => m[1]).sort()
    expect(handled.length).toBeGreaterThan(0)
    expect(rewritten).toEqual(handled)
  })

  it('las rewrites de la API van antes del fallback del SPA', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites: Array<{ source: string; destination: string }> }
    const spa = vercel.rewrites.findIndex((r) => r.destination === '/index.html')
    expect(spa).toBe(vercel.rewrites.length - 1)
  })
})
