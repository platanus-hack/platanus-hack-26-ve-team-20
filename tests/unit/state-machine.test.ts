import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VIOLATION_STATUSES, type ViolationStatus } from '../../lib/contracts/index.ts'
import { InvalidTransitionError } from '../../lib/domain/errors.ts'
import {
  VIOLATION_TRANSITIONS,
  canTransition,
  effectiveFineStatus,
  fineStatusFor,
} from '../../lib/domain/state-machine.ts'

describe('tabla de transiciones', () => {
  it('coincide exactamente con docs/03 §3', () => {
    const doc = readFileSync('docs/03-modelo-de-datos.md', 'utf8')
    const block = /VIOLATION_TRANSITIONS[^{]*\{([\s\S]*?)\n\};/.exec(doc)?.[1]
    expect(block).toBeDefined()
    const fromDoc = Object.fromEntries(
      [...block!.matchAll(/^\s*(\w+):\s*\[([^\]]*)\]/gm)].map(([, from, tos]) => [
        from,
        [...tos!.matchAll(/"(\w+)"/g)].map((m) => m[1]),
      ]),
    )
    expect(VIOLATION_TRANSITIONS).toEqual(fromDoc)
  })

  it('define todos los estados y solo apunta a estados válidos', () => {
    expect(Object.keys(VIOLATION_TRANSITIONS).sort()).toEqual([...VIOLATION_STATUSES].sort())
    for (const targets of Object.values(VIOLATION_TRANSITIONS)) {
      for (const t of targets) expect(VIOLATION_STATUSES).toContain(t)
    }
  })

  it('PAID y VOID son terminales y no hay transiciones a sí mismo', () => {
    expect(VIOLATION_TRANSITIONS.PAID).toEqual([])
    expect(VIOLATION_TRANSITIONS.VOID).toEqual([])
    for (const [from, targets] of Object.entries(VIOLATION_TRANSITIONS)) {
      expect(targets).not.toContain(from as ViolationStatus)
    }
  })

  it('todo estado es alcanzable desde DETECTED', () => {
    const seen = new Set<ViolationStatus>(['DETECTED'])
    const queue: ViolationStatus[] = ['DETECTED']
    while (queue.length) {
      for (const next of VIOLATION_TRANSITIONS[queue.shift()!]) {
        if (!seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      }
    }
    expect([...seen].sort()).toEqual([...VIOLATION_STATUSES].sort())
  })

  it('canTransition acepta las válidas y rechaza el resto (matriz completa)', () => {
    for (const from of VIOLATION_STATUSES) {
      for (const to of VIOLATION_STATUSES) {
        expect(canTransition(from, to)).toBe(VIOLATION_TRANSITIONS[from].includes(to))
      }
    }
    expect(canTransition('DETECTED', 'PAID')).toBe(false) // no se puede pagar sin multa
    expect(canTransition('PAID', 'VOID')).toBe(false)
    expect(canTransition('APPEALED', 'NOTIFIED')).toBe(true) // apelación rechazada
  })
})

describe('sincronización de la multa', () => {
  it('fineStatusFor mapea el estado de la violación al de la multa', () => {
    expect(fineStatusFor('FINED')).toBe('PENDING')
    expect(fineStatusFor('NOTIFIED')).toBe('PENDING')
    expect(fineStatusFor('PAID')).toBe('PAID')
    expect(fineStatusFor('APPEALED')).toBe('APPEALED')
    expect(fineStatusFor('VOID')).toBe('VOID')
    for (const s of ['DETECTED', 'NEEDS_REVIEW', 'REVIEWED'] as const) expect(fineStatusFor(s)).toBeNull()
  })

  it('OVERDUE se calcula: PENDING con dueAt vencido', () => {
    const now = new Date('2026-10-24T12:00:00Z')
    const past = new Date('2026-10-01T00:00:00Z')
    const future = new Date('2026-11-01T00:00:00Z')
    expect(effectiveFineStatus({ status: 'PENDING', dueAt: past }, now)).toBe('OVERDUE')
    expect(effectiveFineStatus({ status: 'PENDING', dueAt: future }, now)).toBe('PENDING')
    expect(effectiveFineStatus({ status: 'PAID', dueAt: past }, now)).toBe('PAID') // pagada no vence
    expect(effectiveFineStatus({ status: 'VOID', dueAt: past }, now)).toBe('VOID')
  })
})

describe('InvalidTransitionError', () => {
  it('lleva el código de la API (409), el origen y el destino', () => {
    const err = new InvalidTransitionError('PAID', 'VOID')
    expect(err.code).toBe('INVALID_TRANSITION')
    expect(err.from).toBe('PAID')
    expect(err.to).toBe('VOID')
    expect(err.name).toBe('InvalidTransitionError')
    expect(err.message).toContain('PAID')
    expect(err).toBeInstanceOf(Error)
  })
})
