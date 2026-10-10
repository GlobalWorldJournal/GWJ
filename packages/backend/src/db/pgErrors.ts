/**
 * SQLSTATE predicates that survive drizzle's error wrapping.
 *
 * drizzle wraps a driver failure in its own `DrizzleQueryError`, so `code` and
 * `constraint_name` live on `cause`, not on the caught error. A predicate reading
 * `err.code` directly matches nothing and every guard built on it is silently off.
 */
export const UNIQUE_VIOLATION = '23505'

const MAX_CAUSE_DEPTH = 8

function readField(err: unknown, field: 'code' | 'constraint_name'): string | undefined {
  let current: unknown = err
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== null && typeof current === 'object'; depth += 1) {
    const value: unknown = Reflect.get(current, field)
    if (typeof value === 'string') return value
    current = Reflect.get(current, 'cause')
  }
  return undefined
}

export function pgErrorCode(err: unknown): string | undefined {
  return readField(err, 'code')
}

export function constraintNameOf(err: unknown): string | undefined {
  return readField(err, 'constraint_name')
}

export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === UNIQUE_VIOLATION
}
