import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { MIGRATIONS_FOLDER } from '../migrationsFolder';
import {
  assertPreDeployMigrationsApplied,
  readAppliedMillis,
  readJournal,
  runMigrations,
} from '../migrator';
import { createEmptyDatabase, dropDatabase } from '../../test/postgres';

const silent = { info: () => undefined };
let target: { url: string; name: string };
let client: postgres.Sql;

beforeAll(async () => {
  target = await createEmptyDatabase('gwj_migrator');
  client = postgres(target.url, { max: 1, onnotice: () => undefined });
});

afterAll(async () => {
  await client.end({ timeout: 5 });
  await dropDatabase(target.name);
});

describe('runMigrations against a real server', () => {
  it('refuses a mismatched --target-database and writes NOTHING, not even the ledger', async () => {
    await expect(
      runMigrations({
        databaseUrl: target.url,
        migrationsFolder: MIGRATIONS_FOLDER,
        run: 'all',
        expectedDatabase: 'gwj',
        dryRun: false,
        logger: silent,
      }),
    ).rejects.toThrow(/Refusing to migrate/);
    expect(await readAppliedMillis(client)).toEqual([]);
  });

  it('the server refuses to boot on an unmigrated schema', async () => {
    await expect(assertPreDeployMigrationsApplied(client, MIGRATIONS_FOLDER)).rejects.toThrow(
      /not current/,
    );
  });

  it('a dry run reports and writes nothing', async () => {
    const result = await runMigrations({
      databaseUrl: target.url,
      migrationsFolder: MIGRATIONS_FOLDER,
      run: 'pre',
      expectedDatabase: target.name,
      dryRun: true,
      logger: silent,
    });
    expect(result.applied).toEqual([]);
    expect(await readAppliedMillis(client)).toEqual([]);
  });

  it('a fresh database takes the whole journal, after which every phase is a no-op', async () => {
    // A brand-new database (local compose, a new environment) migrates with
    // `all`; the deploy's pre/post split only applies on top of an existing
    // ledger, and its ordering rules are unit-tested in migrator.test.ts.
    const journal = readJournal(MIGRATIONS_FOLDER);
    const run = (phase: 'pre' | 'post' | 'all') =>
      runMigrations({
        databaseUrl: target.url,
        migrationsFolder: MIGRATIONS_FOLDER,
        run: phase,
        expectedDatabase: target.name,
        dryRun: false,
        logger: silent,
      });

    const first = await run('all');
    expect(first.applied.length).toBe(journal.length);
    expect((await readAppliedMillis(client)).sort()).toEqual(journal.map((j) => j.when).sort());
    await assertPreDeployMigrationsApplied(client, MIGRATIONS_FOLDER);

    expect((await run('pre')).applied).toEqual([]);
    expect((await run('post')).applied).toEqual([]);
  });
});
