import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Vercel compila api/ con el tsconfig.json de la raíz (ignora las references). Sin estas opciones
// emite `import "./x.ts"` y la función falla en runtime con FUNCTION_INVOCATION_FAILED.
describe('tsconfig.json raíz para Vercel Functions', () => {
  const raw = readFileSync('tsconfig.json', 'utf8').replace(/^\s*\/\/.*$/gm, '')
  const tsconfig = JSON.parse(raw) as { compilerOptions?: Record<string, unknown> }

  it('reescribe las extensiones .ts de los imports relativos al emitir', () => {
    expect(tsconfig.compilerOptions?.rewriteRelativeImportExtensions).toBe(true)
    expect(tsconfig.compilerOptions?.allowImportingTsExtensions).toBe(true)
  })
})
