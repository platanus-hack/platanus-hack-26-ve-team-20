import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CRASH } from '../contracts/index.ts'
import { distanceM, isLate, selectTargets, visibleStatus } from './network.ts'

const nodo = (id: string, x: number, y: number) => ({ id, x, y, heading: 0 })

describe('red de choques', () => {
  it('alerta a los nodos dentro del radio y siempre al reportero', () => {
    const nodos = [nodo('rep', 0, 0), nodo('cerca', 100, 0), nodo('lejos', 400, 0)]
    expect(selectTargets(nodos, { x: 0, y: 0 }, 150, 'rep').map((n) => n.id)).toEqual(['rep', 'cerca'])
    // radio medido desde otro centro: el reportero entra igual
    expect(selectTargets(nodos, { x: 400, y: 0 }, 50, 'rep').map((n) => n.id)).toEqual(['rep', 'lejos'])
    expect(distanceM({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('una alerta que llega después de T+20 s ya no encuentra T−10 s en el buffer', () => {
    const t0 = new Date('2026-10-25T12:00:00Z')
    const limite = CRASH.BUFFER_MS - CRASH.PRE_MS
    expect(isLate(t0, new Date(t0.getTime() + limite))).toBe(false)
    expect(isLate(t0, new Date(t0.getTime() + limite + 1))).toBe(true)
    expect(visibleStatus('PENDING', t0, new Date(t0.getTime() + limite + 1))).toBe('MISSED')
    expect(visibleStatus('CAPTURING', t0, new Date(t0.getTime() + limite + 1))).toBe('CAPTURING')
  })

  it('cada ruta de api/choques.ts tiene su rewrite en vercel.json, y al revés', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites: Array<{ destination: string }> }
    const rewritten = vercel.rewrites.map((r) => /^\/api\/choques\?route=([\w-]+)/.exec(r.destination)?.[1]).filter(Boolean).sort()
    const router = readFileSync('api/choques.ts', 'utf8')
    const block = /CHOQUES_ROUTES[^{]*\{([\s\S]*?)\n\};/.exec(router)?.[1] ?? ''
    const handled = [...block.matchAll(/^\s*"([\w-]+)":/gm)].map((m) => m[1]).sort()
    expect(handled.length).toBeGreaterThan(0)
    expect(rewritten).toEqual(handled)
  })
})
