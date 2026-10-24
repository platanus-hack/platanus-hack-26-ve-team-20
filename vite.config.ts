import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// `pnpm dev` sirve solo la SPA; `vercel dev` levanta SPA + funciones de /api juntas.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@contracts': fileURLToPath(new URL('./lib/contracts/index.ts', import.meta.url)),
    },
  },
})
