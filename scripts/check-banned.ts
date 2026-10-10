/**
 * Enforce the AGENTS.md bans that Biome has no rule for: deferred-work markers
 * (TODO / FIXME / HACK), TypeScript error suppression comments, and `as any`.
 * Biome covers the rest (`any` annotations, `!`, console, var, empty catch).
 *
 * Scans every tracked source file; exits 1 listing each offending line.
 * Run: bun run scripts/check-banned.ts
 */
import { readFileSync } from 'node:fs'

const SOURCE_EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|sh|tf)$/
/** This file necessarily names the patterns it bans. */
const SELF = 'scripts/check-banned.ts'

const BANNED: readonly { pattern: RegExp; rule: string }[] = [
  { pattern: /\b(TODO|FIXME|HACK)\b/, rule: 'deferred-work marker (open an issue instead)' },
  { pattern: /@ts-(ignore|expect-error|nocheck)\b/, rule: 'TypeScript error suppression' },
  { pattern: /\bas any\b/, rule: '`as any` cast' },
]

const listed = Bun.spawnSync(['git', 'ls-files', '-z'], { stdout: 'pipe' })
if (listed.exitCode !== 0) {
  process.stderr.write('git ls-files failed\n')
  process.exit(1)
}
const files = new TextDecoder()
  .decode(listed.stdout)
  .split('\0')
  .filter((file) => SOURCE_EXTENSIONS.test(file) && file !== SELF)

const violations: string[] = []
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    for (const { pattern, rule } of BANNED) {
      if (pattern.test(line)) violations.push(`${file}:${index + 1}: ${rule}\n    ${line.trim()}`)
    }
  })
}

if (violations.length > 0) {
  process.stderr.write(`Banned patterns found (AGENTS.md conventions):\n${violations.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`check-banned: ${files.length} files clean\n`)
