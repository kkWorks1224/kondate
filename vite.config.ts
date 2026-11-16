import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), ...((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.VITEST ? [] : [cloudflare()])],
  server: { port: 5188 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never)
