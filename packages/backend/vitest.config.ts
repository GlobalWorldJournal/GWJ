import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // `*.realdb.test.ts` files each create, migrate and drop their own database on
    // the server named by TEST_POSTGRES_URL (see src/test/postgres.ts).
    testTimeout: 30000,
    hookTimeout: 60000,
  },
})
