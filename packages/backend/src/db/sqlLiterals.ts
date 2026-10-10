import { sql, type SQL } from 'drizzle-orm';

/**
 * Render a closed value set as a SQL `IN (...)` list for a `check()` constraint.
 *
 * `sql.raw` is deliberate: a value INTERPOLATED into a `check()` becomes the
 * literal `$1` in the migration drizzle-kit generates, which then fails at APPLY
 * time. The values come from compile-time tuples in `@gwj/shared-types` (never
 * user input), and each one is asserted to be a plain identifier-like token
 * before it is spliced, so nothing here can carry a quote.
 */
export function sqlInList(values: readonly string[]): SQL {
  for (const value of values) {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new Error(`Refusing to render ${JSON.stringify(value)} into a CHECK constraint`);
    }
  }
  return sql.raw(`(${values.map((v) => `'${v}'`).join(', ')})`);
}
