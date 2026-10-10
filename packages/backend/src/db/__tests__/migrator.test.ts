import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  planLedgerRun,
  planMigrationRun,
  readMigrationPhases,
  readPhase,
  readTargetDatabase,
  type DeployPhase,
  type JournalEntry,
} from '../migrator'

const e = (tag: string, when: number): JournalEntry => ({ tag, when })
const phases = (pairs: [string, DeployPhase][]) => new Map(pairs)

function folderWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gwj-migrator-test-'))
  mkdirSync(join(dir, 'meta'))
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
  return dir
}

describe('readMigrationPhases', () => {
  it('reads one marker per file', () => {
    const dir = folderWith({ 'a.sql': '-- oxy:deploy-phase=pre\nCREATE TABLE x();', 'b.sql': '-- oxy:deploy-phase=post\nDROP TABLE x;' })
    expect([...readMigrationPhases(['a', 'b'], dir)]).toEqual([
      ['a', 'pre'],
      ['b', 'post'],
    ])
  })

  it('refuses unmarked, doubly-marked and misspelled files, naming every one', () => {
    const dir = folderWith({
      'a.sql': 'CREATE TABLE x();',
      'b.sql': '-- oxy:deploy-phase=pre\n-- oxy:deploy-phase=post\n',
      'c.sql': '-- oxy:deploy-phase=predeploy\n',
    })
    expect(() => readMigrationPhases(['a', 'b', 'c'], dir)).toThrow(/a: .*found 0[\s\S]*b: .*found 2[\s\S]*c: unrecognised/)
  })
})

describe('planLedgerRun', () => {
  const journal = [e('0000', 100), e('0001', 200), e('0002', 300)]

  it('applies everything on an empty ledger and only newer entries afterwards', () => {
    expect(planLedgerRun(journal, [])).toEqual(journal)
    expect(planLedgerRun(journal, [100, 200])).toEqual([e('0002', 300)])
    expect(planLedgerRun(journal, [100, 200, 300])).toEqual([])
  })

  it('refuses an entry below the high-water mark that was never applied (drizzle would skip it silently)', () => {
    expect(() => planLedgerRun(journal, [100, 300])).toThrow(/0001 can never be applied/)
  })
})

describe('planMigrationRun', () => {
  const pending = [e('a', 1), e('b', 2), e('c', 3)]

  it('pre applies up to the first post and defers the rest', () => {
    const plan = planMigrationRun(pending, phases([['a', 'pre'], ['b', 'post'], ['c', 'post']]), 'pre')
    expect(plan.apply.map((x) => x.tag)).toEqual(['a'])
    expect(plan.deferred.map((x) => x.tag)).toEqual(['b', 'c'])
  })

  it('pre refuses a pre queued behind an unapplied post', () => {
    expect(() => planMigrationRun(pending, phases([['a', 'pre'], ['b', 'post'], ['c', 'pre']]), 'pre')).toThrow(
      /c \(pre\) is queued behind/,
    )
  })

  it('post refuses while a pre is still pending (the pre-deploy step did not run)', () => {
    expect(() => planMigrationRun(pending, phases([['a', 'pre'], ['b', 'post'], ['c', 'post']]), 'post')).toThrow(
      /a \(pre\) still pending/,
    )
  })

  it('all applies everything', () => {
    expect(planMigrationRun(pending, phases([['a', 'post'], ['b', 'pre'], ['c', 'post']]), 'all').apply).toHaveLength(3)
  })
})

describe('CLI flags', () => {
  it('requires --target-database', () => {
    expect(() => readTargetDatabase([])).toThrow(/--target-database/)
    expect(() => readTargetDatabase(['--target-database='])).toThrow(/--target-database/)
    expect(readTargetDatabase(['--target-database=gwj'])).toBe('gwj')
  })

  it('defaults --phase to all and rejects an unknown phase instead of falling back', () => {
    expect(readPhase([])).toBe('all')
    expect(readPhase(['--phase=post'])).toBe('post')
    expect(() => readPhase(['--phase=pre-deploy'])).toThrow(/Unrecognised/)
  })
})
