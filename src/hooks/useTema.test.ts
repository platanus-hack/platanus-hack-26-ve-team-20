import { describe, expect, it } from 'vitest'
import { aplicarTema, normalizarTema } from './useTema.ts'

describe('normalizarTema', () => {
  it('acepta solo claro u oscuro; lo demás sigue al sistema', () => {
    expect(normalizarTema('claro')).toBe('claro')
    expect(normalizarTema('oscuro')).toBe('oscuro')
    expect(normalizarTema(null)).toBe('sistema')
    expect(normalizarTema('verde')).toBe('sistema')
  })
})

describe('aplicarTema', () => {
  const raiz = () => {
    const attrs = new Map<string, string>()
    return {
      attrs,
      setAttribute: (k: string, v: string) => { attrs.set(k, v) },
      removeAttribute: (k: string) => { attrs.delete(k) },
    }
  }

  it('fija data-tema con claro u oscuro', () => {
    const r = raiz()
    aplicarTema('oscuro', r)
    expect(r.attrs.get('data-tema')).toBe('oscuro')
    aplicarTema('claro', r)
    expect(r.attrs.get('data-tema')).toBe('claro')
  })

  it('con sistema quita el atributo para que mande prefers-color-scheme', () => {
    const r = raiz()
    aplicarTema('oscuro', r)
    aplicarTema('sistema', r)
    expect(r.attrs.has('data-tema')).toBe(false)
  })
})
