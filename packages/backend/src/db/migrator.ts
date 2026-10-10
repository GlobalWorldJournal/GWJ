/**
 * The migration ledger, the deploy-phase planner and the runner.
 *
 * GWJ applies migrations with drizzle-orm's own migrator (one ledger,
 * `drizzle.__drizzle_migrations`), wrapped in the guards below. Nothing else may
 * apply a migration — never `drizzle-kit migrate`.
 *
 * ## Deploy phases
 *
 * Every generated `.sql` file must carry exactly one marker line:
 *
 *     -- oxy:deploy-phase=pre     additive; safe while the PREVIOUS image serves
 *     -- oxy:deploy-phase=post    drops/renames/narrows; only once the NEW image is live
 *
 * (The marker spelling is shared with the other PostgreSQL backends on the same
 * RDS instance so one operator habit and one grep cover all of them.) The deploy
 * runs `--phase=pre` before the rollout and `--phase=post` after it. An unmarked
 * file is a hard failure before any DDL runs.
 *
 * ## The ledger is a HIGH-WATER MARK
 *
 * drizzle applies a journal entry only when its `when` is strictly newer than the
 * newest applied one. So a `pre` queued behind an unapplied `post` cannot be
 * applied without the `post`, and an entry whose `when` sits below the high-water
 * mark is skipped in silence forever. Both are refused loudly here.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

export const MIGRATIONS_SCHEMA = 'drizzle'
export const MIGRATIONS_TABLE = '__drizzle_migrations'

export type DeployPhase = 'pre' | 'post'
export type MigrationRun = DeployPhase | 'all'
export const MIGRATION_RUNS: readonly MigrationRun[] = ['pre', 'post', 'all']

const MARKER_LINE = /^-- oxy:deploy-phase=(.*)$/
const CLOSE_TIMEOUT_SECONDS = 5

export interface JournalEntry {
  tag: string
  when: number
}

export interface MigrationLogger {
  info(message: string, fields?: Record<string, unknown>): void
}

function isJournalEntry(value: unknown): value is JournalEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.tag === 'string' && typeof entry.when === 'number'
}

/** Read `meta/_journal.json`; throws on anything but a well-formed entry list. */
export function readJournal(folder: string): JournalEntry[] {
  const path = join(folder, 'meta', '_journal.json')
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const entries =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).entries : undefined
  if (!Array.isArray(entries) || !entries.every(isJournalEntry)) {
    throw new Error(`The migration journal at ${path} has no usable \`entries\` array`)
  }
  return entries
}

/** The phase each migration declares. Throws, listing EVERY problem, if any file is unmarked or ambiguous. */
export function readMigrationPhases(tags: readonly string[], folder: string): Map<string, DeployPhase> {
  const phases = new Map<string, DeployPhase>()
  const problems: string[] = []
  for (const tag of tags) {
    const contents = readFileSync(join(folder, `${tag}.sql`), 'utf8')
    const values: string[] = []
    for (const line of contents.split('\n')) {
      const match = MARKER_LINE.exec(line.replace(/\r$/, ''))
      if (match?.[1] !== undefined) values.push(match[1])
    }
    const [value] = values
    if (values.length !== 1 || value === undefined) {
      problems.push(`${tag}: expected exactly one \`-- oxy:deploy-phase=pre|post\` line, found ${values.length}`)
    } else if (value !== 'pre' && value !== 'post') {
      problems.push(`${tag}: unrecognised deploy phase ${JSON.stringify(value)}`)
    } else {
      phases.set(tag, value)
    }
  }
  if (problems.length > 0) {
    throw new Error(`Refusing to migrate — deploy-phase markers:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  }
  return phases
}

/**
 * Entries still to apply, given the `created_at` (journal `when`) of every applied
 * row. Throws when an entry is below the high-water mark yet not applied: drizzle
 * would skip it in silence and report success.
 */
export function planLedgerRun(entries: readonly JournalEntry[], appliedMillis: readonly number[]): JournalEntry[] {
  if (appliedMillis.length === 0) return [...entries]
  const highWater = Math.max(...appliedMillis)
  const applied = new Set(appliedMillis)
  const unreachable = entries.filter((e) => e.when <= highWater && !applied.has(e.when))
  if (unreachable.length > 0) {
    throw new Error(
      `${unreachable.map((e) => e.tag).join(', ')} can never be applied: the ledger's high-water mark ` +
        `(${highWater}) is newer than their journal \`when\`. Regenerate them on top of main; never edit the ledger.`,
    )
  }
  return entries.filter((e) => e.when > highWater)
}

export interface MigrationRunPlan {
  apply: JournalEntry[]
  deferred: JournalEntry[]
}

/** Split pending entries for one deploy phase, refusing the orderings that cannot work. */
export function planMigrationRun(
  pending: readonly JournalEntry[],
  phases: ReadonlyMap<string, DeployPhase>,
  run: MigrationRun,
): MigrationRunPlan {
  if (run === 'all') return { apply: [...pending], deferred: [] }

  if (run === 'post') {
    const stranded = pending.filter((e) => phases.get(e.tag) === 'pre')
    if (stranded.length > 0) {
      throw new Error(
        `${stranded.map((e) => e.tag).join(', ')} (pre) still pending after the rollout: the pre-deploy ` +
          'step did not apply it, so the serving image reads a schema this database does not have.',
      )
    }
    return { apply: [...pending], deferred: [] }
  }

  const firstPost = pending.findIndex((e) => phases.get(e.tag) === 'post')
  if (firstPost === -1) return { apply: [...pending], deferred: [] }
  const deferred = pending.slice(firstPost)
  const stranded = deferred.find((e) => phases.get(e.tag) === 'pre')
  if (stranded) {
    throw new Error(
      `${stranded.tag} (pre) is queued behind an unapplied post migration; the ledger cannot skip it. ` +
        'Ship them in separate releases.',
    )
  }
  return { apply: pending.slice(0, firstPost), deferred }
}

/** `created_at` of every applied migration (empty when the ledger does not exist yet). */
export async function readAppliedMillis(client: postgres.Sql): Promise<number[]> {
  const [ledger] = await client<{ present: boolean }[]>`
    select to_regclass(${`${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`}) is not null as present`
  if (!ledger?.present) return []
  const rows = await client<{ created_at: string | null }[]>`
    select created_at from ${client(MIGRATIONS_SCHEMA)}.${client(MIGRATIONS_TABLE)}`
  // bigint decodes as a STRING under postgres.js.
  return rows.flatMap((r) => (r.created_at === null ? [] : [Number(r.created_at)]))
}

/**
 * Throw if any `pre` migration in `folder` is not applied. Pending `post`
 * migrations are expected between the rollout and the post-deploy step.
 */
export async function assertPreDeployMigrationsApplied(client: postgres.Sql, folder: string): Promise<void> {
  const entries = readJournal(folder)
  const phases = readMigrationPhases(
    entries.map((e) => e.tag),
    folder,
  )
  const pending = planLedgerRun(entries, await readAppliedMillis(client))
  const missing = pending.filter((e) => phases.get(e.tag) === 'pre')
  if (missing.length > 0) {
    throw new Error(
      `Postgres schema is not current: ${missing.length} pre-deploy migration(s) are not applied ` +
        `(${missing.map((e) => e.tag).join(', ')}). Run the migration one-shot before serving.`,
    )
  }
}

/** Refuse unless the connection reaches the database the operator named. */
export async function assertMigrationTarget(client: postgres.Sql, expected: string): Promise<void> {
  const [row] = await client<{ database: string }[]>`select current_database() as database`
  const actual = row?.database
  if (actual !== expected) {
    throw new Error(
      `Refusing to migrate: --target-database=${JSON.stringify(expected)} but DATABASE_URL reaches ` +
        `${JSON.stringify(actual)}. No DDL has been applied.`,
    )
  }
}

/** `--target-database=<name>` is REQUIRED: a migrator aimed at the wrong database reports success over an untouched one. */
export function readTargetDatabase(argv: readonly string[]): string {
  const prefix = '--target-database='
  const value = argv.find((a) => a.startsWith(prefix))?.slice(prefix.length).trim()
  if (!value) {
    throw new Error('Missing --target-database=<name> (e.g. --target-database=gwj for production).')
  }
  return value
}

/** `--phase=pre|post|all`, default `all`. An unknown value throws rather than falling back. */
export function readPhase(argv: readonly string[]): MigrationRun {
  const prefix = '--phase='
  const raw = argv.find((a) => a.startsWith(prefix))?.slice(prefix.length).trim()
  if (raw === undefined) return 'all'
  const run = MIGRATION_RUNS.find((r) => r === raw)
  if (!run) throw new Error(`Unrecognised --phase=${JSON.stringify(raw)}. Use one of: ${MIGRATION_RUNS.join(', ')}.`)
  return run
}

/** Copy a journal PREFIX into a temp folder so drizzle's migrator stops before the deferred entries. */
function materializeJournalPrefix(entries: readonly JournalEntry[], count: number, source: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'gwj-migrate-prefix-'))
  mkdirSync(join(folder, 'meta'), { recursive: true })
  const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as Record<string, unknown>
  const retained = entries.slice(0, count)
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: retained }))
  for (const entry of retained) copyFileSync(join(source, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`))
  return folder
}

export interface RunMigrationsOptions {
  databaseUrl: string
  migrationsFolder: string
  run: MigrationRun
  /** Required: the database the connection must reach. */
  expectedDatabase: string
  dryRun: boolean
  logger: MigrationLogger
}

export interface RunMigrationsResult {
  applied: string[]
  deferred: string[]
}

export async function runMigrations(options: RunMigrationsOptions): Promise<RunMigrationsResult> {
  const entries = readJournal(options.migrationsFolder)
  const phases = readMigrationPhases(
    entries.map((e) => e.tag),
    options.migrationsFolder,
  )
  const client = postgres(options.databaseUrl, { max: 1, onnotice: () => undefined })
  let prefixFolder: string | null = null
  try {
    await assertMigrationTarget(client, options.expectedDatabase)
    const pending = planLedgerRun(entries, await readAppliedMillis(client))
    const plan = planMigrationRun(pending, phases, options.run)
    const tags = plan.apply.map((e) => e.tag)
    const deferred = plan.deferred.map((e) => e.tag)
    if (deferred.length > 0) {
      options.logger.info('migrations deferred to a later phase', { phase: options.run, deferred })
    }
    if (tags.length === 0) {
      options.logger.info('no migrations to apply', { phase: options.run, journalEntries: entries.length })
      return { applied: [], deferred }
    }
    if (options.dryRun) {
      options.logger.info('DRY RUN — nothing written', { phase: options.run, wouldApply: tags })
      return { applied: [], deferred }
    }

    let folder = options.migrationsFolder
    const last = plan.apply[plan.apply.length - 1]
    if (deferred.length > 0 && last) {
      prefixFolder = materializeJournalPrefix(entries, entries.indexOf(last) + 1, options.migrationsFolder)
      folder = prefixFolder
    }
    options.logger.info('applying migrations', { phase: options.run, migrations: tags })
    await migrate(drizzle(client), {
      migrationsFolder: folder,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    })

    // A green migrator over nothing looks like a green migrator over everything:
    // read the ledger back and prove each entry landed.
    const appliedNow = new Set(await readAppliedMillis(client))
    const missing = plan.apply.filter((e) => !appliedNow.has(e.when))
    if (missing.length > 0) {
      throw new Error(`Migrator reported success but ${missing.map((e) => e.tag).join(', ')} is not in the ledger`)
    }
    options.logger.info('applied migrations', { phase: options.run, migrations: tags })
    return { applied: tags, deferred }
  } finally {
    if (prefixFolder) rmSync(prefixFolder, { recursive: true, force: true })
    await client.end({ timeout: CLOSE_TIMEOUT_SECONDS })
  }
}
