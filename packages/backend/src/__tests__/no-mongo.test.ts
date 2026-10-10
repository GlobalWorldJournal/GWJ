/**
 * Reintroduction gate: the backend is PostgreSQL-only. Fails on any import of a
 * Mongo driver, a Mongo env var or a mongodb:// URL in `src/`, and on a Mongo
 * package in `package.json`. (The one-time copy tool lives OUTSIDE this package,
 * in `packages/mongo-migration`, and is deleted with the Mongo host.)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SRC = join(PACKAGE_ROOT, 'src')

const FORBIDDEN = /from\s+['"](mongoose|mongodb)['"]|import\(\s*['"](mongoose|mongodb)['"]|\bMONGO(DB)?_URI\b|mongodb(\+srv)?:\/\//

/**
 * Files allowed to mention Mongo, each with the reason. Exact-count asserted
 * below: the list may only shrink deliberately, never grow one line at a time.
 */
const EXEMPT: Record<string, string> = {
  'src/__tests__/env.test.ts': 'asserts a leftover MONGO_URI is ignored during the cutover transition',
  'src/__tests__/no-mongo.test.ts': 'this gate',
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

describe('no MongoDB in @gwj/backend', () => {
  it('the pattern matches what it claims to (positive control)', () => {
    expect(FORBIDDEN.test(`import mongoose from 'mongoose'`)).toBe(true)
    expect(FORBIDDEN.test(`const { MongoClient } = await import('mongodb')`)).toBe(true)
    expect(FORBIDDEN.test('process.env.MONGO_URI')).toBe(true)
    expect(FORBIDDEN.test('mongodb://10.20.1.92:27017/gwj')).toBe(true)
    expect(FORBIDDEN.test(`import postgres from 'postgres'`)).toBe(false)
  })

  it('no source file outside the exemptions references a Mongo driver, env var or URL', () => {
    const files = walk(SRC).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(30)
    const offenders = files
      .map((f) => relative(PACKAGE_ROOT, f))
      .filter((rel) => !(rel in EXEMPT))
      .filter((rel) => FORBIDDEN.test(readFileSync(join(PACKAGE_ROOT, rel), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('the exemption list is exactly as long as reviewed', () => {
    expect(Object.keys(EXEMPT)).toHaveLength(2)
  })

  it('package.json depends on no Mongo package', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(deps.length).toBeGreaterThan(5)
    expect(deps.filter((d) => /mongo/i.test(d))).toEqual([])
  })
})
