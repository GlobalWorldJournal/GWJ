/**
 * Real-PostgreSQL test harness. Every `*.realdb.test.ts` file gets its OWN
 * throwaway database — created on the server named by `TEST_POSTGRES_URL`,
 * migrated by the production migrator (`runMigrations`, phase `all`), and dropped
 * afterwards — so files running in parallel never share rows and an unscoped
 * count cannot read a sibling file's fixtures.
 *
 * There is deliberately NO fallback: without `TEST_POSTGRES_URL` the suite FAILS.
 * A realdb test that skips is a green run that gated nothing.
 *
 *     TEST_POSTGRES_URL=postgres://user:pass@127.0.0.1:5432/postgres bun run test
 */
import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import { connectDb, disconnectDb, getDb } from '../db/client'
import { MIGRATIONS_FOLDER } from '../db/migrationsFolder'
import { runMigrations } from '../db/migrator'
import { sql } from 'drizzle-orm'

export interface TestDatabase {
  /** Connection string of the throwaway database (already connected via `connectDb`). */
  url: string
  name: string
  /** Empty every application table (identity sequences restart). */
  truncateAll(): Promise<void>
  /** Disconnect and drop the database. Call from `afterAll`. */
  drop(): Promise<void>
}

const silent = { info: () => undefined }

export function testAdminUrl(): string {
  const url = process.env.TEST_POSTGRES_URL
  if (!url) {
    throw new Error(
      'TEST_POSTGRES_URL is not set. The backend suite needs a real PostgreSQL server ' +
        '(e.g. `docker compose up -d postgres` then ' +
        'TEST_POSTGRES_URL=postgres://gwj:gwj@127.0.0.1:5432/postgres).',
    )
  }
  return url
}

/** Create an empty database on the test server; returns its URL and name. */
export async function createEmptyDatabase(prefix = 'gwj_test'): Promise<{ url: string; name: string }> {
  const adminUrl = testAdminUrl()
  const name = `${prefix}_${process.pid}_${randomBytes(4).toString('hex')}`
  const admin = postgres(adminUrl, { max: 1, onnotice: () => undefined })
  try {
    await admin.unsafe(`create database "${name}"`)
  } finally {
    await admin.end({ timeout: 5 })
  }
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  return { url: url.toString(), name }
}

export async function dropDatabase(name: string): Promise<void> {
  const admin = postgres(testAdminUrl(), { max: 1, onnotice: () => undefined })
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`)
  } finally {
    await admin.end({ timeout: 5 })
  }
}

/** A migrated throwaway database, connected as the process-wide pool. */
export async function useTestDatabase(): Promise<TestDatabase> {
  const { url, name } = await createEmptyDatabase()
  await runMigrations({
    databaseUrl: url,
    migrationsFolder: MIGRATIONS_FOLDER,
    run: 'all',
    expectedDatabase: name,
    dryRun: false,
    logger: silent,
  })
  await connectDb(url)
  return {
    url,
    name,
    async truncateAll() {
      await getDb().execute(sql`truncate articles, users, actor_keys, followers, takedown_requests restart identity`)
    },
    async drop() {
      await disconnectDb()
      await dropDatabase(name)
    },
  }
}
