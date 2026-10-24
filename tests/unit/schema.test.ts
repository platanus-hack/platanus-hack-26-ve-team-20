import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as contracts from '../../lib/contracts/index.ts'

const schema = readFileSync('prisma/schema.prisma', 'utf8')

function prismaEnum(name: string): string[] {
  const m = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema)
  if (!m?.[1]) throw new Error(`enum ${name} no existe en prisma/schema.prisma`)
  return m[1].split('\n').map((l) => l.trim()).filter(Boolean)
}

describe('enums de Prisma vs lib/contracts', () => {
  const pairs: Array<[string, readonly string[]]> = [
    ['ViolationType', contracts.VIOLATION_TYPES],
    ['ViolationStatus', contracts.VIOLATION_STATUSES],
    ['ReviewReason', contracts.REVIEW_REASONS],
    ['FineStatus', contracts.FINE_STATUSES],
    ['PaymentStatus', contracts.PAYMENT_STATUSES],
    ['Channel', contracts.CHANNELS],
    ['NotificationStatus', contracts.NOTIFICATION_STATUSES],
    ['AlertStatus', contracts.ALERT_STATUSES],
    ['EvidenceKind', contracts.EVIDENCE_KINDS],
    ['ActorType', contracts.ACTOR_TYPES],
  ]
  it.each(pairs)('%s coincide', (name, values) => {
    expect(prismaEnum(name)).toEqual([...values])
  })
})

describe('migraciones', () => {
  const dir = 'prisma/migrations'
  const sql = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readFileSync(join(dir, d.name, 'migration.sql'), 'utf8'))
    .join('\n')

  it('cada tabla creada tiene RLS activado (Supabase expone `public` por REST)', () => {
    const created = [...sql.matchAll(/^CREATE TABLE "(\w+)"/gm)].map((m) => m[1])
    const secured = [...sql.matchAll(/ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY/g)].map((m) => m[1])
    expect(created.length).toBeGreaterThan(0)
    expect(created.filter((t) => !secured.includes(t))).toEqual([])
  })

  it('el schema declara todos los modelos de docs/03 (19, con AdminUser, cuentas de ciudadano e invitaciones de oficiales)', () => {
    expect([...schema.matchAll(/^model (\w+) \{/gm)]).toHaveLength(19)
  })
})

describe('lib/db', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    delete (globalThis as { prisma?: unknown }).prisma
  })

  it('reutiliza el mismo cliente al recargar el módulo (singleton)', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@localhost:6543/postgres')
    vi.stubEnv('NODE_ENV', 'development')
    const first = (await import('../../lib/db.ts')).db
    vi.resetModules()
    const second = (await import('../../lib/db.ts')).db
    expect(second).toBe(first)
  })

  it('falla con un mensaje claro si falta DATABASE_URL', async () => {
    vi.stubEnv('DATABASE_URL', '')
    await expect(import('../../lib/db.ts')).rejects.toThrow('DATABASE_URL')
  })
})
