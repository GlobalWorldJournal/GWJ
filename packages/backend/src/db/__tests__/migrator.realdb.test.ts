import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { MIGRATIONS_FOLDER } from '../migrationsFolder'
import { assertPreDeployMigrationsApplied, readAppliedMillis, readJournal, runMigrations } from '../migrator'
import { createEmptyDatabase, dropDatabase } from '../../test/postgres'

const silent = { info: () => undefined }
let target: { url: string; name: string }
let client: postgres.Sql

beforeAll(async () => {
  target = await createEmptyDatabase('gwj_migrator')
  client = postgres(target.url, { max: 1, onnotice: () => undefined })
})

afterAll(async () => {
  await client.end({ timeout: 5 })
  await dropDatabase(target.name)
})

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
    ).rejects.toThrow(/Refusing to migrate/)
    expect(await readAppliedMillis(client)).toEqual([])
  })

  it('the server refuses to boot on an unmigrated schema', async () => {
    await expect(assertPreDeployMigrationsApplied(client, MIGRATIONS_FOLDER)).rejects.toThrow(/not current/)
  })

  it('a dry run reports and writes nothing', async () => {
    const result = await runMigrations({
      databaseUrl: target.url,
      migrationsFolder: MIGRATIONS_FOLDER,
      run: 'pre',
      expectedDatabase: target.name,
      dryRun: true,
      logger: silent,
    })
    expect(result.applied).toEqual([])
    expect(await readAppliedMillis(client)).toEqual([])
  })

  it('applies the journal, records every entry, and is a no-op the second time', async () => {
    const journal = readJournal(MIGRATIONS_FOLDER)
    const first = await runMigrations({
      databaseUrl: target.url,
      migrationsFolder: MIGRATIONS_FOLDER,
      run: 'pre',
      expectedDatabase: target.name,
      dryRun: false,
      logger: silent,
    })
    expect(first.applied.length).toBeGreaterThan(0)
    expect((await readAppliedMillis(client)).sort()).toEqual(journal.map((j) => j.when).sort())
    await assertPreDeployMigrationsApplied(client, MIGRATIONS_FOLDER)

    const second = await runMigrations({
      databaseUrl: target.url,
      migrationsFolder: MIGRATIONS_FOLDER,
      run: 'post',
      expectedDatabase: target.name,
      dryRun: false,
      logger: silent,
    })
    expect(second.applied).toEqual([])
  })
})
