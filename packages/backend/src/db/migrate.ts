/**
 * `bun run db:migrate --target-database=<name> [--phase=pre|post|all]`
 *
 * The ONE way a migration reaches a database (production runs it as an ECS
 * one-shot from the backend image; see `.github/workflows/deploy-aws.yml`).
 * `--target-database` is required on every run, including `DRY_RUN=true`.
 */
import { argv } from 'node:process'
import { logger } from '../logger'
import { MIGRATIONS_FOLDER } from './migrationsFolder'
import { readPhase, readTargetDatabase, runMigrations } from './migrator'

function isDryRun(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.DRY_RUN ?? '').trim().toLowerCase())
}

async function main(): Promise<void> {
  const args = argv.slice(2)
  // Flags first: an operator who forgot one learns it before any socket opens.
  const expectedDatabase = readTargetDatabase(args)
  const run = readPhase(args)
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl || databaseUrl === '-') throw new Error('DATABASE_URL is not set')

  await runMigrations({
    databaseUrl,
    migrationsFolder: MIGRATIONS_FOLDER,
    run,
    expectedDatabase,
    dryRun: isDryRun(),
    logger,
  })
}

main().catch((err: unknown) => {
  logger.error('postgres migration failed', { message: err instanceof Error ? err.message : String(err) })
  process.exitCode = 1
})
