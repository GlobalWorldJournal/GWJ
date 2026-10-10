import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // mongodb-memory-server may download its mongod binary on first run; the
    // target is a throwaway PostgreSQL database on TEST_POSTGRES_URL.
    testTimeout: 60000,
    hookTimeout: 180000,
  },
})
