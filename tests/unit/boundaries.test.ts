import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// docs/AGENTS.md §6: `src/` solo importa `lib/contracts` del código compartido.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

const SERVER_ONLY = /from\s+['"](?:[./]*\/)?(?:lib\/(?!contracts)|api\/|prisma\/|@prisma\/client|@vercel\/(?:node|blob))/

describe('límites entre cliente y servidor', () => {
  it('src/ no importa código de servidor', () => {
    const offenders = files('src').filter((f) => SERVER_ONLY.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('src/ no usa rutas relativas hacia lib/ ni api/', () => {
    const offenders = files('src').filter((f) => /from\s+['"](?:\.\.\/)+(?:lib|api)\//.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('lib/contracts no importa nada de servidor (solo zod y sus propios archivos)', () => {
    const bad = files('lib/contracts').flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)]
        .map((m) => m[1] ?? '')
        .filter((spec) => !(spec === 'zod' || spec.startsWith('./')))
        .map((spec) => `${f}: ${spec}`),
    )
    expect(bad).toEqual([])
  })
})
