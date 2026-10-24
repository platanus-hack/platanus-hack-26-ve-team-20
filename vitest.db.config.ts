import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Pruebas de integración contra la base real (`pnpm test:db`). Usan filas con id `test_*` que
// borran al terminar y requieren el seed aplicado (cámara `seed_cam_1`). Van aparte de `pnpm test`
// para que este siga sin depender de la red.
try {
  process.loadEnvFile('.env.local')
} catch {
  // sin .env.local: se usan las variables del entorno
}

export default defineConfig({
  resolve: {
    alias: {
      '@contracts': fileURLToPath(new URL('./lib/contracts/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/db/**/*.db.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
