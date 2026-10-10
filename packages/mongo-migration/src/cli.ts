/**
 * ONE-TIME MongoDB → PostgreSQL copy for the GWJ cutover. Runs as an ECS one-shot
 * from the backend image (see docs/POSTGRES-CUTOVER.md):
 *
 *   bun run /app/packages/mongo-migration/src/cli.ts copy   --source-database=gwj --target-database=gwj
 *   bun run /app/packages/mongo-migration/src/cli.ts verify --source-database=gwj --target-database=gwj
 *
 * Env: MONGO_URI (read-only use), DATABASE_URL. `copy` converges the target on
 * the source in one transaction and then verifies; `verify` writes nothing.
 * Prints one `MIGRATION {json}` line per fact and ends with
 * `MIGRATION_VERDICT=PASS|FAIL`; the exit code is 0 only on PASS.
 */
import { argv } from 'node:process';
import { runMigration, type MigrationMode } from './run';

function emit(line: string): void {
  process.stdout.write(`${line}\n`);
}

function flag(args: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return (
    args
      .find((a) => a.startsWith(prefix))
      ?.slice(prefix.length)
      .trim() || undefined
  );
}

function required(value: string | undefined, what: string): string {
  if (!value || value === '-') throw new Error(`${what} is required`);
  return value;
}

async function main(): Promise<boolean> {
  const args = argv.slice(2);
  const [mode] = args;
  if (mode !== 'copy' && mode !== 'verify')
    throw new Error('usage: cli.ts <copy|verify> --source-database=<db> --target-database=<db>');
  emit(`MIGRATION ${JSON.stringify({ event: 'start', mode, at: new Date().toISOString() })}`);
  const result = await runMigration({
    mode: mode satisfies MigrationMode,
    mongoUri: required(process.env.MONGO_URI, 'MONGO_URI'),
    sourceDatabase: required(flag(args, 'source-database'), '--source-database'),
    databaseUrl: required(process.env.DATABASE_URL, 'DATABASE_URL'),
    targetDatabase: required(flag(args, 'target-database'), '--target-database'),
    allowEmpty: args.includes('--allow-empty'),
    report: (event) => emit(`MIGRATION ${JSON.stringify(event)}`),
  });
  for (const reason of result.reasons)
    emit(`MIGRATION ${JSON.stringify({ event: 'fail-reason', reason })}`);
  return result.pass;
}

main()
  .then((pass) => {
    emit(`MIGRATION_VERDICT=${pass ? 'PASS' : 'FAIL'}`);
    process.exitCode = pass ? 0 : 1;
  })
  .catch((err: unknown) => {
    emit(
      `MIGRATION ${JSON.stringify({ event: 'error', message: err instanceof Error ? err.message : String(err) })}`,
    );
    emit('MIGRATION_VERDICT=FAIL');
    process.exitCode = 1;
  });
