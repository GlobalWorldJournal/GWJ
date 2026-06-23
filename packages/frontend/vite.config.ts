import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { InlineConfig } from 'vitest/node'

const test: InlineConfig = {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  css: true,
}

const config: UserConfig & { test: InlineConfig } = {
  plugins: [react(), tailwindcss()],
  test,
}

export default defineConfig(config)
