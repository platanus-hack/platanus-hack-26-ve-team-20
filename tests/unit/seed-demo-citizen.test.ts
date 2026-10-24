import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isPlausiblePlate } from '../../lib/contracts/index.ts'
import { buildSeed } from '../../prisma/seed-data.ts'
import {
  DEMO_CITIZEN_PLATES, buildDemoCitizen, formatDemoCitizen, parseDemoCedula,
} from '../../prisma/seed-demo-citizen.ts'

const NOW = new Date('2026-10-24T15:00:00.000Z')
const FAKE = 'V99123456' // cédula inventada: las pruebas nunca usan una real

describe('parseDemoCedula', () => {
  it('normaliza cédulas válidas y descarta lo demás', () => {
    expect(parseDemoCedula('v-99.123.456')).toBe('V99123456')
    expect(parseDemoCedula(' E-91234567 ')).toBe('E91234567')
    for (const bad of [undefined, '', 'abc', '99123456', 'V12', 'V123456789012', 'X99123456']) {
      expect(parseDemoCedula(bad), String(bad)).toBeNull()
    }
  })
})

describe('buildDemoCitizen', () => {
  it('sin DEMO_CEDULA válida no siembra nada', () => {
    expect(buildDemoCitizen({ now: NOW })).toBeNull()
    expect(buildDemoCitizen({ cedula: 'no-es-cedula', now: NOW })).toBeNull()
  })

  const c = buildDemoCitizen({ cedula: FAKE, now: NOW })!

  it('crea un titular con 2 vehículos y 5 multas: 3 impagas (una vencida), 1 pagada y 1 anulada', () => {
    expect(c.person).toMatchObject({ cedula: FAKE, fullName: 'Persona Demo' })
    expect(c.vehicles).toHaveLength(2)
    expect(c.violations).toHaveLength(5)
    const f = c.violations.map((v) => v.fine)
    expect(f.filter((x) => x.status === 'PENDING')).toHaveLength(3)
    expect(f.filter((x) => x.status === 'PENDING' && x.dueAt < NOW)).toHaveLength(1)
    expect(f.filter((x) => x.status === 'PAID')).toHaveLength(1)
    expect(f.filter((x) => x.status === 'VOID')).toHaveLength(1)
    expect(c.violations.every((v) => v.fine.amountCents > 0 && Number.isInteger(v.fine.amountCents))).toBe(true)
  })

  it('la multa pagada trae su pago y fecha; las demás no', () => {
    for (const v of c.violations) {
      expect(Boolean(v.fine.payment), `multa ${v.n}`).toBe(v.fine.status === 'PAID')
      expect(v.fine.paidAt !== null, `multa ${v.n}`).toBe(v.fine.status === 'PAID')
    }
  })

  it('datos FALSOS: placas inventadas, plausibles y distintas a las del seed; nombre ficticio', () => {
    const plates = c.vehicles.map((v) => v.plate)
    expect(plates).toEqual([...DEMO_CITIZEN_PLATES])
    expect(plates.every(isPlausiblePlate)).toBe(true)
    const seedPlates = buildSeed({ now: NOW }).vehicles.map((v) => v.plate)
    expect(plates.filter((p) => seedPlates.includes(p))).toEqual([])
    expect(JSON.stringify(c)).not.toMatch(/\b58414|\b58424|\b58416/) // sin teléfonos móviles reales
  })

  it('todos los ids llevan el prefijo seed_demo (demo:reset no los borra) y las cámaras existen en el seed', () => {
    const ids = [c.person.id, ...c.vehicles.map((v) => v.id), ...c.violations.flatMap((v) => [v.id, v.evidence.id, v.fine.id, ...(v.fine.payment ? [v.fine.payment.id] : [])])]
    expect(ids.every((id) => id.startsWith('seed_demo_'))).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    const cams = buildSeed({ now: NOW }).cameras.map((x) => x.id)
    expect(c.violations.every((v) => cams.includes(v.cameraId))).toBe(true)
  })

  it('el teléfono real solo entra por parámetro (DEMO_PHONE_DRIVER); sin él, uno falso', () => {
    expect(c.person.phone).toBe('584120000900')
    expect(buildDemoCitizen({ cedula: FAKE, phone: '584140000000', now: NOW })!.person.phone).toBe('584140000000')
  })

  it('es determinista (mismos ids siempre) y acepta otro prefijo y otras placas', () => {
    const later = buildDemoCitizen({ cedula: FAKE, now: new Date(NOW.getTime() + 86_400_000) })!
    expect(later.violations.map((v) => v.id)).toEqual(c.violations.map((v) => v.id))
    const other = buildDemoCitizen({ cedula: FAKE, now: NOW, idPrefix: 'test_x', plates: ['TT001AA', 'TT002BB'] })!
    expect(other.person.id).toBe('test_x_per')
    expect(other.vehicles.map((v) => v.plate)).toEqual(['TT001AA', 'TT002BB'])
  })
})

describe('formatDemoCitizen', () => {
  it('imprime los enlaces de pago de las impagas sin imprimir la cédula', () => {
    const lines = formatDemoCitizen({ applied: true, pending: [{ plateMasked: 'DM***AA', status: 'PENDING', token: 'tok123456789012345678901' }, { plateMasked: 'DM***AA', status: 'OVERDUE', token: 'tok999999999999999999999' }] }, 'https://app.example/')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('https://app.example/multa/tok123456789012345678901')
    expect(lines.join('\n')).not.toContain(FAKE)
  })

  it('si no se aplicó, explica por qué', () => {
    expect(formatDemoCitizen({ applied: false, reason: 'ya existe otra persona', pending: [] }, 'x')).toEqual(['demo: ya existe otra persona'])
  })
})

describe('guardia: ninguna cédula real en el repo', () => {
  // Las cédulas inventadas del proyecto empiezan por 9 (V99000001…). Una cédula venezolana real tiene
  // 6–8 dígitos y casi nunca empieza por 9, así que cualquier otra aparecida en archivos versionados es
  // un dato real que se coló: debe vivir solo en el entorno (DEMO_CEDULA).
  // Números obviamente de ejemplo: un solo dígito repetido (11111111) o una secuencia (12345678, 7654321).
  const isObviousDummy = (d: string) => /^(\d)\1+$/.test(d) || '0123456789'.includes(d) || '9876543210'.includes(d)
  const PATTERN = /\b[VE]-?(\d{1,2}\.?\d{3}\.?\d{3})\b/gi

  it('los archivos versionados no contienen cédulas que no sean inventadas', () => {
    const files = execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.md', '*.json', '*.jsonc', '*.sql', '*.example'], { encoding: 'utf8', maxBuffer: 50_000_000 })
      .split('\n')
      .filter((f) => f && !f.startsWith('.claude/') && !f.includes('pnpm-lock') && !f.endsWith('.map'))
    const offenders: string[] = []
    for (const f of files) {
      let text: string
      try { text = readFileSync(f, 'utf8') } catch { continue }
      for (const m of text.matchAll(PATTERN)) {
        const digits = m[1]!.replace(/\./g, '')
        if (!digits.startsWith('9') && !isObviousDummy(digits)) offenders.push(`${f}: …${digits.slice(-3)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
