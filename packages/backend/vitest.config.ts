import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // mongodb-memory-server may download its mongod binary on first run.
    testTimeout: 60000,
    hookTimeout: 120000,
  },
})
