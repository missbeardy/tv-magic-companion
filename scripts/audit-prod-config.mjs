#!/usr/bin/env node
/**
 * Audit what is actually deployed against what is in this repo.
 *
 * Written 26-08-2026 after a production notification outage that nothing caught for
 * 16 days. The edge function `notify-message` was live at v3 (12-07) while the repo had
 * migrated push off OneSignal on 10-08 — `supabase/functions/*` ships only via a manual
 * `supabase functions deploy`, never with Vercel, so a merge to main leaves it frozen.
 * The stale function still returned 2xx, so every layer above it reported success.
 *
 * The second half of that outage was a missing `PLATFORM_URL` secret: the new code would
 * have failed closed with a console.error nobody reads, even after a correct deploy.
 *
 * Both are invisible from the repo alone. This script goes and looks.
 *
 * Read-only. Never writes to Supabase or Vercel. Exits 1 on any FAIL so CI can gate on it.
 *
 *   node scripts/audit-prod-config.mjs
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  required — sbp_… personal access token
 *   SUPABASE_PROJECT_REF   defaults to the prod project
 *   VERCEL_TOKEN           optional — without it the Vercel env checks are SKIPPED, not passed
 *   VERCEL_PROJECT_ID      defaults to .vercel/project.json
 *   VERCEL_TEAM_ID         defaults to .vercel/project.json orgId
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'abnheynzugpicikxwwmv'
const FUNCTIONS_DIR = 'supabase/functions'

/**
 * Vercel production vars whose absence breaks something *silently*.
 *
 * This list is deliberately short and hand-curated rather than derived from every
 * `process.env.X` in the tree. Most of those are optional and have fallbacks, so
 * deriving it produces two dozen false alarms and the check stops being read. A var
 * belongs here only when the code degrades to a no-op instead of an error.
 */
const REQUIRED_VERCEL_PROD = {
  SENTRY_DSN:
    'api/_lib/sentry.ts no-ops when unset, so captureServerException reports nothing and every swallowed handler error is invisible',
  VAPID_PUBLIC_KEY: 'web push cannot be signed; sendWebPushToUsers returns an empty result',
  VAPID_PRIVATE_KEY: 'web push cannot be signed; sendWebPushToUsers returns an empty result',
  VAPID_SUBJECT: 'web push cannot be signed; sendWebPushToUsers returns an empty result',
  PUSH_SHARED_SECRET: 'the notify-message edge function cannot reach the push sender',
  PLATFORM_URL: 'links in outbound email/SMS lose their host',
  TWILIO_AUTH_TOKEN: 'inbound SMS fails signature verification and every message is dropped',
}

const findings = []
const notes = []
const fail = (area, message, detail) => findings.push({ area, message, detail })
const note = (area, message) => notes.push({ area, message })

async function api(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.json()
}

/** Last commit touching a path, as an epoch ms, or null when git has no history for it. */
function lastCommitMs(path) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', path], {
      encoding: 'utf8',
    }).trim()
    return out ? Number(out) * 1000 : null
  } catch {
    return null
  }
}

function repoFunctionSlugs() {
  if (!existsSync(FUNCTIONS_DIR)) return []
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
}

/** Every Deno.env.get("X") across supabase/functions. */
function edgeFunctionEnvRefs() {
  const refs = new Set()
  for (const slug of repoFunctionSlugs()) {
    const file = join(FUNCTIONS_DIR, slug, 'index.ts')
    if (!existsSync(file)) continue
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/Deno\.env\.get\(\s*["']([A-Z0-9_]+)["']\s*\)/g)) {
      refs.add(m[1])
    }
  }
  return refs
}

/**
 * Supabase injects these into every function. They are not in the secrets list and
 * setting them is explicitly discouraged, so absence is correct, not a finding.
 */
const SUPABASE_INJECTED = new Set([
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
])

async function auditSupabase(token) {
  const [deployed, secrets] = await Promise.all([
    api(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`, token),
    api(`https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`, token),
  ])

  const inRepo = new Set(repoFunctionSlugs())

  for (const fn of deployed) {
    const path = join(FUNCTIONS_DIR, fn.slug, 'index.ts')

    if (!inRepo.has(fn.slug)) {
      fail(
        'edge-orphan',
        `"${fn.slug}" is live in production with no source in this repo`,
        `v${fn.version}, last deployed ${new Date(fn.updated_at).toISOString().slice(0, 10)}. Nobody can review, change or redeploy it.`
      )
      continue
    }

    const committed = lastCommitMs(path)
    if (committed === null) {
      note('edge-drift', `"${fn.slug}" has no git history yet — skipping the drift check`)
      continue
    }
    if (committed > fn.updated_at) {
      fail(
        'edge-drift',
        `"${fn.slug}" is stale in production`,
        `deployed ${new Date(fn.updated_at).toISOString().slice(0, 10)} (v${fn.version}), repo last changed ${new Date(committed).toISOString().slice(0, 10)}. Run: supabase functions deploy ${fn.slug} --project-ref ${PROJECT_REF}`
      )
    }
  }

  // Deployed-but-absent is only half of it — a function the repo has and prod does not
  // is equally a lie, and reads as "shipped" to anyone browsing the tree.
  const deployedSlugs = new Set(deployed.map((f) => f.slug))
  for (const slug of inRepo) {
    if (!deployedSlugs.has(slug)) {
      fail('edge-missing', `"${slug}" exists in the repo but was never deployed`, null)
    }
  }

  const configured = new Set(secrets.map((s) => s.name))
  for (const ref of edgeFunctionEnvRefs()) {
    if (SUPABASE_INJECTED.has(ref)) continue
    if (!configured.has(ref)) {
      fail(
        'edge-secret',
        `edge functions read ${ref}, which is not set on the Supabase project`,
        'The function will take its fail-closed branch and report success anyway.'
      )
    }
  }
}

async function auditVercel(token) {
  let projectId = process.env.VERCEL_PROJECT_ID
  let teamId = process.env.VERCEL_TEAM_ID
  if ((!projectId || !teamId) && existsSync('.vercel/project.json')) {
    const linked = JSON.parse(readFileSync('.vercel/project.json', 'utf8'))
    projectId ||= linked.projectId
    teamId ||= linked.orgId
  }
  if (!projectId) {
    note('vercel-env', 'SKIPPED — no VERCEL_PROJECT_ID and no .vercel/project.json')
    return
  }

  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
  const { envs } = await api(`https://api.vercel.com/v9/projects/${projectId}/env${qs}`, token)
  const inProd = new Set(
    envs.filter((e) => (e.target ?? []).includes('production')).map((e) => e.key)
  )

  for (const [key, consequence] of Object.entries(REQUIRED_VERCEL_PROD)) {
    if (!inProd.has(key)) {
      fail('vercel-env', `${key} is not set in Vercel production`, consequence)
    }
  }
}

async function main() {
  const supabaseToken = process.env.SUPABASE_ACCESS_TOKEN
  if (!supabaseToken) {
    console.error('SUPABASE_ACCESS_TOKEN is required (sbp_… personal access token).')
    process.exit(2)
  }

  await auditSupabase(supabaseToken)

  const vercelToken = process.env.VERCEL_TOKEN
  if (vercelToken) {
    await auditVercel(vercelToken)
  } else {
    // Loud, because a skipped check that reads like a pass is the exact failure mode
    // this whole script exists to catch.
    note('vercel-env', 'SKIPPED — VERCEL_TOKEN not set. This is not a pass.')
  }

  for (const n of notes) console.log(`  skip  ${n.area}: ${n.message}`)

  if (!findings.length) {
    console.log('\nProd config audit: no drift found.')
    return
  }

  console.log(`\nProd config audit: ${findings.length} finding(s)\n`)
  for (const f of findings) {
    console.log(`  FAIL  [${f.area}] ${f.message}`)
    if (f.detail) console.log(`        ${f.detail}`)
  }
  console.log('')
  process.exit(1)
}

main().catch((err) => {
  console.error('Audit could not complete:', err.message)
  process.exit(2)
})
