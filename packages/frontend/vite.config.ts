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
  build: {
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code into its own long-lived chunks so a
        // change to app code doesn't bust the whole bundle's cache. react +
        // react-dom + react-router share a chunk (router depends on react); the
        // data layer and the markdown renderer (only needed on article pages)
        // are separate so they cache and load independently.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
  test,
}

export default defineConfig(config)
