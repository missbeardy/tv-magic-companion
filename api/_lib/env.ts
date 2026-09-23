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

/**
 * Mobile Message (T1.18). Not in REQUIRED_SERVER_ENV: every org defaults to
 * `orgs.sms_provider = 'twilio'`, so these only become required once an org is switched.
 * The send path skips and the `?provider=mm` webhook 503s when they are missing.
 */
export const MOBILE_MESSAGE_ENV = [
  'MOBILE_MESSAGE_API_USERNAME',
  'MOBILE_MESSAGE_API_PASSWORD',
  'MOBILE_MESSAGE_WEBHOOK_SECRET',
] as const

/** Which Mobile Message env vars are unset. Empty = ready to switch an org over. */
export function missingMobileMessageEnv(): string[] {
  return MOBILE_MESSAGE_ENV.filter((key) => !process.env[key]?.trim())
}
