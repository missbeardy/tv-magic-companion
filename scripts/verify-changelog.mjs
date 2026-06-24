import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const changelogSrc = readFileSync(join(root, 'src/lib/changelog.ts'), 'utf8')

function getCurrentReleaseWeekId(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  const daysFromMonday = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - daysFromMonday)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

const weekStartsMatch = changelogSrc.match(/weekStarts:\s*'([^']+)'/)
const appVersionMatch = changelogSrc.match(/export const APP_VERSION = '([^']+)'/)
const itemsMatch = changelogSrc.match(/items:\s*\[([\s\S]*?)\],?\s*\n\}/)

const weekStarts = weekStartsMatch?.[1]
const appVersion = appVersionMatch?.[1]
const currentWeek = getCurrentReleaseWeekId()

let failed = false

if (!weekStarts) {
  console.error('verify-changelog: could not read WEEKLY_CHANGELOG.weekStarts')
  failed = true
} else if (!/^\d{2}-\d{2}-\d{4}$/.test(weekStarts)) {
  console.error(`verify-changelog: weekStarts "${weekStarts}" must be DD-MM-YYYY`)
  failed = true
} else if (weekStarts !== currentWeek) {
  console.error(
    `verify-changelog: WEEKLY_CHANGELOG.weekStarts (${weekStarts}) must be this week's Monday (${currentWeek}). On the first push after Monday, start a new week block.`
  )
  failed = true
}

if (!appVersion) {
  console.error('verify-changelog: could not read APP_VERSION')
  failed = true
} else if (pkg.version !== appVersion) {
  console.error(
    `verify-changelog: package.json version (${pkg.version}) must match APP_VERSION (${appVersion})`
  )
  failed = true
}

if (!itemsMatch || !itemsMatch[1].includes("'")) {
  console.error('verify-changelog: WEEKLY_CHANGELOG.items must contain at least one bullet')
  failed = true
}

if (failed) process.exit(1)
console.log(`verify-changelog: ok (week ${weekStarts}, v${pkg.version})`)
