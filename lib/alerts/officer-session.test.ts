import { describe, expect, it } from 'vitest'
import {
  clearSessionCookie,
  createSessionToken,
  passcodeMatches,
  SESSION_TTL_S,
  sessionCookie,
  verifySessionToken,
} from './officer-session.ts'

const PASS = 'codigo-de-oficial-de-prueba'
const NOW = Date.parse('2026-10-24T14:00:00Z')

describe('sesión del oficial', () => {
  it('firma y verifica el officerId', () => {
    const token = createSessionToken('seed_off_1', PASS, NOW)
    expect(token).toMatch(/^seed_off_1\.\d+\.[\w-]+$/)
    expect(verifySessionToken(token, PASS, NOW + 60_000)).toBe('seed_off_1')
  })

  it('rechaza token alterado, de otro passcode, vencido o vacío', () => {
    const token = createSessionToken('seed_off_1', PASS, NOW)
    expect(verifySessionToken(token.replace('seed_off_1', 'seed_off_2'), PASS, NOW)).toBeNull()
    expect(verifySessionToken(token, 'otro-codigo', NOW)).toBeNull()
    expect(verifySessionToken(token, PASS, NOW + SESSION_TTL_S * 1000 + 1)).toBeNull()
    expect(verifySessionToken(undefined, PASS, NOW)).toBeNull()
    expect(verifySessionToken('basura', PASS, NOW)).toBeNull()
    expect(verifySessionToken(token, '', NOW)).toBeNull()
  })

  it('compara el passcode sin aceptar el vacío', () => {
    expect(passcodeMatches(PASS, PASS)).toBe(true)
    expect(passcodeMatches('otro', PASS)).toBe(false)
    expect(passcodeMatches('', '')).toBe(false)
  })

  it('cookie httpOnly, SameSite=Lax y Secure solo en https', () => {
    expect(sessionCookie('t', { secure: true })).toBe(`vc_officer=t; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_S}; Secure`)
    expect(sessionCookie('t', { secure: false })).not.toContain('Secure')
    expect(clearSessionCookie({ secure: false })).toBe('vc_officer=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
  })
})
