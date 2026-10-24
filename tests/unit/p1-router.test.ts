import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// api/p1.ts es UNA sola Vercel Function que atiende todas las rutas de P1 (el plan Hobby admite 12).
// Si vercel.json y el router se desincronizan, una URL pública deja de funcionar sin avisar.
// Se lee el texto de los archivos (no se importa el router: arrastra lib/db.ts, que exige DATABASE_URL).
type Rewrite = { source: string; destination: string }
const rewrites = (JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites: Rewrite[] }).rewrites
const routerSource = readFileSync('api/p1.ts', 'utf8')

const rewrittenRoutes = rewrites
  .map((r) => /^\/api\/p1\?route=([\w-]+)/.exec(r.destination)?.[1])
  .filter((r): r is string => Boolean(r))
const block = /P1_ROUTES[^{]*\{([\s\S]*?)\n\};/.exec(routerSource)?.[1] ?? ''
const handled = [...block.matchAll(/^\s*"([\w-]+)":\s*(\w+)/gm)].map((m) => ({ route: m[1]!, fn: m[2]! }))

describe('api/p1.ts ↔ vercel.json', () => {
  it('cada ruta del router tiene su reescritura, y al revés', () => {
    expect(handled.length).toBeGreaterThan(0)
    expect(rewrittenRoutes.sort()).toEqual(handled.map((h) => h.route).sort())
  })

  it('cada handler importado existe en api/_p1/', () => {
    for (const { fn } of handled) {
      const file = new RegExp(`import ${fn} from "(\\./_p1/[\\w-]+\\.ts)"`).exec(routerSource)?.[1]
      expect(file, `import de ${fn}`).toBeDefined()
      expect(existsSync(`api/${file!.slice(2)}`), file).toBe(true)
    }
  })

  it('las reescrituras con parámetro pasan `id` y las específicas van antes que las genéricas', () => {
    const idx = (s: string) => rewrites.findIndex((r) => r.source === s)
    expect(rewrites.find((r) => r.source === '/api/violations/:id')?.destination).toContain('&id=:id')
    expect(idx('/api/violations/:id/review')).toBeGreaterThanOrEqual(0)
    expect(idx('/api/violations/:id/review')).toBeLessThan(idx('/api/violations/:id'))
  })

  it('ninguna reescritura de la API queda detrás del fallback del SPA', () => {
    const spa = rewrites.findIndex((r) => r.destination === '/index.html')
    expect(spa).toBe(rewrites.length - 1)
    expect(rewrites.slice(spa + 1)).toEqual([])
  })

  it('las URLs públicas de docs/04 siguen cubiertas', () => {
    const sources = new Set(rewrites.map((r) => r.source))
    for (const url of ['/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/violations', '/api/violations/:id', '/api/violations/:id/review']) {
      expect(sources.has(url), url).toBe(true)
    }
  })
})
