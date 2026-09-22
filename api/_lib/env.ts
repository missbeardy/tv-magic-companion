/** Server env vars every inbound/cron path depends on. SUPABASE_URL alone
 * also accepts the VITE_SUPABASE_URL fallback getSupabaseAdmin() uses. */
const REQUIRED_SERVER_ENV = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'TWILIO_AUTH_TOKEN',
  'INBOUND_SECRET',
  'CRON_SECRET',
  'META_APP_SECRET',
  'RESEND_API_KEY',
] as const

/** Which required server env vars are unset in this runtime. Empty = fully configured. */
export function missingServerEnv(): string[] {
  const missing: string[] = []

  if (!process.env.SUPABASE_URL?.trim() && !process.env.VITE_SUPABASE_URL?.trim()) {
    missing.push('SUPABASE_URL')
  }

  for (const key of REQUIRED_SERVER_ENV) {
    if (!process.env[key]?.trim()) missing.push(key)
  }

  return missing
}
