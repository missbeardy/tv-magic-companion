// api/anthropic.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest, type AuthContext } from './_lib/auth.js'
import { canAccessFeature } from './_lib/tier.js'
import { withObservability } from './_lib/observability.js'
import { checkRateLimit, rateLimitIdentifier } from './_lib/rateLimit.js'
import { isUnderMonthlyAiCeiling, recordAiUsage } from './_lib/aiUsage.js'
import { buildCaptionPrompt, buildLeadExtractionPrompt, extractJsonObject } from './_lib/aiPrompts.js'
import { captureServerException } from './_lib/sentry.js'

const EXTRACTION_MODEL = 'claude-sonnet-4-6'
const CAPTION_MODEL = 'claude-haiku-4-5'

interface ClaudeCallResult {
  text: string
  totalTokens: number
}

/**
 * dd5: the server owns the model, the prompt, and the token budget for every action below.
 * There is no path left that forwards a client-supplied `messages` array — the generic proxy
 * that let any authenticated session run an arbitrary prompt on the platform's Anthropic key
 * has been deleted entirely (see DUE_DILIGENCE_REVIEW.md Phase 2 C3).
 */
async function callClaude(model: string, prompt: string, maxTokens: number): Promise<ClaudeCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('API key not configured')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = (await response.json()) as {
    error?: { message?: string }
    content?: Array<{ text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }

  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Claude API error (${response.status})`)
  }

  const text = data?.content?.[0]?.text
  if (typeof text !== 'string') {
    throw new Error('Unexpected response from Claude')
  }

  const totalTokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)

  return { text, totalTokens }
}

async function handleExtractLeadFields(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { rawText } = (req.body ?? {}) as { rawText?: string }
  if (!rawText?.trim()) {
    return res.status(400).json({ error: 'Missing rawText' })
  }

  try {
    const { text, totalTokens } = await callClaude(EXTRACTION_MODEL, buildLeadExtractionPrompt({ rawText }), 1000)
    void recordAiUsage(auth.orgId, totalTokens)

    const fields = JSON.parse(extractJsonObject(text))
    return res.status(200).json({ fields })
  } catch (err) {
    console.error('Lead field extraction failed:', err)
    captureServerException(err, { action: 'extract-lead-fields', orgId: auth.orgId })
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Extraction failed' })
  }
}

async function handleGenerateCaption(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const { jobContext, notes } = (req.body ?? {}) as { jobContext?: string; notes?: string }
  if (!notes?.trim()) {
    return res.status(400).json({ error: 'Missing notes' })
  }

  try {
    const { text, totalTokens } = await callClaude(
      CAPTION_MODEL,
      buildCaptionPrompt({ jobContext: jobContext ?? '', notes }),
      300
    )
    void recordAiUsage(auth.orgId, totalTokens)

    return res.status(200).json({ caption: text.trim() })
  } catch (err) {
    console.error('Caption generation failed:', err)
    captureServerException(err, { action: 'generate-caption', orgId: auth.orgId })
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Caption generation failed' })
  }
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await authenticateRequest(req)
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!canAccessFeature('ai_parsing', auth.org.subscription_tier)) {
    return res.status(403).json({
      error: 'AI parsing requires a Pro subscription',
      code: 'tier_required',
      requiredTier: 'pro',
    })
  }

  const identifier = rateLimitIdentifier(req.headers['x-forwarded-for'] as string | undefined, auth.userId)
  const allowed = await checkRateLimit({ scope: 'anthropic', identifier, limit: 10, windowMs: 60_000 })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }

  if (!(await isUnderMonthlyAiCeiling(auth.orgId))) {
    return res.status(429).json({ error: 'Monthly AI usage limit reached for this organisation. Contact support.' })
  }

  const action = typeof req.query.action === 'string' ? req.query.action : undefined
  if (action === 'extract-lead-fields') {
    return handleExtractLeadFields(req, res, auth)
  }
  if (action === 'generate-caption') {
    return handleGenerateCaption(req, res, auth)
  }

  return res.status(404).json({ error: 'Unknown action' })
}

export default withObservability(handler)
