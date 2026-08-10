import { getSupabaseAdmin } from './supabaseAdmin.js'

/** Per-org monthly Anthropic token ceiling — override per-environment if a franchise needs more. */
export const AI_MONTHLY_TOKEN_CEILING = Number(process.env.AI_MONTHLY_TOKEN_CEILING) || 200_000

/** 'YYYY-MM' for `date` in UTC — stable month bucketing regardless of server timezone. */
export function aiUsageMonthKey(date = new Date()): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * Soft cost ceiling, not a security boundary (unlike dd4's rate limiter) — a plain read-before-
 * spend check, not atomic. A few concurrent requests landing right at the boundary in the same
 * instant could slip through; that's an acceptable trade for a monthly abuse/cost guard, not
 * something worth the complexity of a hard lock around every Claude call.
 */
export async function isUnderMonthlyAiCeiling(orgId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return true

  const { data, error } = await supabase
    .from('ai_usage_monthly')
    .select('tokens_used')
    .eq('org_id', orgId)
    .eq('month', aiUsageMonthKey())
    .maybeSingle()

  if (error) {
    console.error('AI usage ceiling check failed (failing open):', error.message)
    return true
  }

  return (data?.tokens_used ?? 0) < AI_MONTHLY_TOKEN_CEILING
}

/** Call after a Claude response returns, with its actual usage.input_tokens + usage.output_tokens. */
export async function recordAiUsage(orgId: string, tokens: number): Promise<void> {
  if (tokens <= 0) return
  const supabase = getSupabaseAdmin()
  if (!supabase) return

  const { error } = await supabase.rpc('increment_ai_usage', {
    p_org_id: orgId,
    p_month: aiUsageMonthKey(),
    p_tokens: tokens,
  })

  if (error) {
    console.error('Recording AI usage failed (non-fatal):', error.message)
  }
}
