import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from './_lib/auth.js'
import { getStripe, getPlatformUrl, getPriceIdForTier } from './_lib/stripe.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const stripe = getStripe()
  const supabase = getSupabaseAdmin()
  if (!stripe || !supabase) {
    return res.status(503).json({ error: 'Billing is not configured on this server' })
  }

  const auth = await authenticateRequest(req)
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!['manager', 'platform_admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only managers can manage billing' })
  }

  const { tier } = req.body as { tier?: 'pro' | 'enterprise' }
  if (tier !== 'pro' && tier !== 'enterprise') {
    return res.status(400).json({ error: 'Invalid tier. Choose pro or enterprise.' })
  }

  const priceId = getPriceIdForTier(tier)
  if (!priceId) {
    return res.status(503).json({ error: `Stripe price for ${tier} is not configured` })
  }

  const platformUrl = getPlatformUrl()
  let customerId = auth.org.stripe_customer_id

  try {
    if (!customerId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', auth.userId)
        .single()

      const customer = await stripe.customers.create({
        email: profile?.email ?? undefined,
        metadata: { org_id: auth.orgId },
      })
      customerId = customer.id

      await supabase
        .from('orgs')
        .update({ stripe_customer_id: customerId })
        .eq('id', auth.orgId)
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${platformUrl}/org-settings?billing=success`,
      cancel_url: `${platformUrl}/org-settings?billing=canceled`,
      metadata: { org_id: auth.orgId, tier },
      subscription_data: { metadata: { org_id: auth.orgId, tier } },
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Stripe checkout error:', err)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}
