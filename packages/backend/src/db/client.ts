import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { logger } from '../logger'
import { assertPreDeployMigrationsApplied } from './migrator'
import { MIGRATIONS_FOLDER } from './migrationsFolder'

/**
 * The one column-naming convention. `drizzle.config.ts` (what the DDL CREATES)
 * and the runtime handle below (what queries REFERENCE) both read it, so the two
 * can never disagree about `published_at` vs `publishedAt`.
 */
export const DATABASE_CASING = 'snake_case'

export type Database = PostgresJsDatabase<Record<string, never>>

/**
 * Pool ceiling for ONE backend task. `oxy-postgres` is a shared instance; GWJ runs
 * a single small Fargate task and has no workload that needs more.
 */
const POOL_MAX = 5
const IDLE_TIMEOUT_SECONDS = 30
const CONNECT_TIMEOUT_SECONDS = 10
const CLOSE_TIMEOUT_SECONDS = 5

interface Handle {
  db: Database
  client: postgres.Sql
}

let handle: Handle | null = null

/** Build a drizzle handle over a fresh postgres.js pool (not registered globally). */
export function createDatabase(databaseUrl: string, max: number = POOL_MAX): Handle {
  const client = postgres(databaseUrl, {
    max,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    // Postgres NOTICEs are informational (e.g. "text-search query contains only
    // stop words" for a search of "the"); they are not errors and must not be
    // written to stdout by the driver's default console handler.
    onnotice: () => undefined,
  })
  return { db: drizzle(client, { casing: DATABASE_CASING }), client }
}

export interface ConnectOptions {
  /**
   * Refuse to connect when a `pre` migration shipped in this image is not applied
   * yet. On for the server; tests and the migrator itself turn it off.
   */
  requireMigrations?: boolean
}

/**
 * Open the process-wide pool and prove it with a round-trip. Idempotent.
 *
 * With `requireMigrations` (the server's default) it also refuses to serve on a
 * schema older than the code: the deploy runs the migration one-shot BEFORE the
 * rollout, so a pending `pre` migration here means that step did not happen, and
 * crash-looping (the ECS circuit breaker then rolls back) beats serving 500s.
 */
export async function connectDb(databaseUrl: string, options: ConnectOptions = {}): Promise<void> {
  if (handle) return
  const next = createDatabase(databaseUrl)
  try {
    const [row] = await next.client<{ database: string }[]>`select current_database() as database`
    if (options.requireMigrations ?? true) {
      await assertPreDeployMigrationsApplied(next.client, MIGRATIONS_FOLDER)
    }
    handle = next
    logger.info('postgres connected', { database: row?.database })
  } catch (err) {
    await next.client.end({ timeout: CLOSE_TIMEOUT_SECONDS })
    throw err
  }
}

/** The process-wide drizzle handle. Throws if {@link connectDb} has not run. */
export function getDb(): Database {
  if (!handle) throw new Error('Postgres is not connected: call connectDb() at bootstrap')
  return handle.db
}

/** Close the pool. Safe to call when not connected. */
export async function disconnectDb(): Promise<void> {
  if (!handle) return
  const { client } = handle
  handle = null
  await client.end({ timeout: CLOSE_TIMEOUT_SECONDS })
  logger.info('postgres disconnected')
}
