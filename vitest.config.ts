import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@contracts': fileURLToPath(new URL('./lib/contracts/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
    include: ['tests/unit/**/*.test.ts', 'lib/**/*.test.ts'],
  },
})
