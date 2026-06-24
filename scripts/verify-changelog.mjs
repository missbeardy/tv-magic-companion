import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const changelogSrc = readFileSync(join(root, 'src/lib/changelog.ts'), 'utf8')

const versionMatch = changelogSrc.match(
  /export const CHANGELOG[\s\S]*?version:\s*'([^']+)'/
)

const changelogVersion = versionMatch?.[1]

let failed = false

if (!changelogVersion) {
  console.error('verify-changelog: could not read CHANGELOG[0].version')
  failed = true
} else if (pkg.version !== changelogVersion) {
  console.error(
    `verify-changelog: package.json version (${pkg.version}) must match CHANGELOG[0].version (${changelogVersion})`
  )
  failed = true
}

const dateMatches = [...changelogSrc.matchAll(/date:\s*'([^']+)'/g)]
for (const [, date] of dateMatches) {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(date)) {
    console.error(
      `verify-changelog: date "${date}" must be DD-MM-YYYY (e.g. 24-06-2026)`
    )
    failed = true
  }
}

if (failed) process.exit(1)
console.log(`verify-changelog: ok (${pkg.version})`)
