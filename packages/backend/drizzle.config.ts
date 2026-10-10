import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit is used ONLY to GENERATE migrations (`bun run db:generate`), never
 * to apply them — `src/db/migrate.ts` is the only applier.
 *
 * After every `db:generate`, open the new `drizzle/<tag>.sql`, read it for
 * statements you did not intend, and add exactly ONE marker line:
 *
 *     -- oxy:deploy-phase=pre     additive
 *     -- oxy:deploy-phase=post    drops / renames / narrowed constraints
 *
 * Generation is offline (schema vs. the last snapshot); no database is opened.
 * `casing` must equal `DATABASE_CASING` in `src/db/client.ts`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema',
  out: './drizzle',
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
