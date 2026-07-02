import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let attempted = false

/** Mirror VITE_* client vars to server names when only the Vite keys are set. */
export function aliasViteServerEnv(): void {
  if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL
  }
  if (!process.env.PLATFORM_URL && process.env.VITE_PLATFORM_URL) {
    process.env.PLATFORM_URL = process.env.VITE_PLATFORM_URL
  }
  if (!process.env.CLOUDMAILIN_INBOUND_BASE && process.env.VITE_CLOUDMAILIN_INBOUND_BASE) {
    process.env.CLOUDMAILIN_INBOUND_BASE = process.env.VITE_CLOUDMAILIN_INBOUND_BASE
  }
}

/** Load .env.local / .env into process.env when vercel dev does not inject them. */
export function loadLocalEnvIfNeeded(): void {
  if (attempted) {
    aliasViteServerEnv()
    return
  }
  attempted = true
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) {
    aliasViteServerEnv()
    return
  }

  const candidates = ['.env.development.local', '.env.local', '.env']
  for (const name of candidates) {
    const filePath = resolve(process.cwd(), name)
    if (!existsSync(filePath)) continue
    applyEnvFile(readFileSync(filePath, 'utf8'))
  }
  aliasViteServerEnv()
}

loadLocalEnvIfNeeded()

function applyEnvFile(contents: string): void {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}
