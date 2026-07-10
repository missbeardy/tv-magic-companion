import type { VercelRequest, VercelResponse } from '@vercel/node'
import type Stripe from 'stripe'
import { authenticateRequestDetailed, authErrorMessage } from './_lib/auth.js'
import { getStripe, getPlatformUrl, getPriceIdForTier, validatePriceId } from './_lib/stripe.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { tierFromStripePriceId, type SubscriptionTier } from './_lib/tier.js'
import { readRawBody } from './_lib/rawBody.js'

/** Single function for Hobby plan (12-function limit). Routes via vercel.json rewrites. */
export const config = {
  api: {
    bodyParser: false,
  },
}

type StripeAction = 'checkout' | 'portal' | 'webhook'

function resolveAction(req: VercelRequest): StripeAction | null {
  const queryAction = req.query.action
  if (queryAction === 'checkout' || queryAction === 'portal' || queryAction === 'webhook') {
    return queryAction
  }
  const path = req.url?.split('?')[0] ?? ''
  if (path.includes('stripe-webhook')) return 'webhook'
  if (path.includes('stripe-portal')) return 'portal'
  if (path.includes('stripe-checkout')) return 'checkout'
  return null
}

async function readJsonBody<T>(req: VercelRequest): Promise<T> {
  const raw = await readRawBody(req)
  if (raw.length === 0) return {} as T
  return JSON.parse(raw.toString('utf8')) as T
}

async function syncOrgFromSubscription(
  orgId: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return

  const priceId = subscription.items.data[0]?.price?.id
  const tierFromMeta = subscription.metadata?.tier as SubscriptionTier | undefined
  const tier = tierFromMeta ?? (priceId ? tierFromStripePriceId(priceId) : null) ?? 'basic'

  const billingStatus =
    subscription.status === 'active' || subscription.status === 'trialing'
      ? subscription.status
      : subscription.status === 'past_due'
        ? 'past_due'
        : 'canceled'

  const effectiveTier: SubscriptionTier =
    subscription.status === 'active' || subscription.status === 'trialing'
      ? tier
      : 'basic'

  await supabase
    .from('orgs')
    .update({
      stripe_subscription_id: subscription.id,
      stripe_customer_id:
        typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
      subscription_tier: effectiveTier,
      billing_status: billingStatus,
      subscription_expires_at: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
    })
    .eq('id', orgId)
}

async function handleCheckout(req: VercelRequest, res: VercelResponse) {
  const stripe = getStripe()
  const supabase = getSupabaseAdmin()
  if (!stripe || !supabase) {
    return res.status(503).json({ error: 'Billing is not configured on this server' })
  }

  let tier: 'pro' | 'enterprise' | undefined
  try {
    const body = await readJsonBody<{ tier?: 'pro' | 'enterprise' }>(req)
    tier = body.tier
  } catch {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  const { auth, reason } = await authenticateRequestDetailed(req)
  if (!auth) {
    return res.status(401).json({ error: authErrorMessage(reason) })
  }

  if (!['manager', 'platform_admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only managers can manage billing' })
  }

  if (tier !== 'pro' && tier !== 'enterprise') {
    return res.status(400).json({ error: 'Invalid tier. Choose pro or enterprise.' })
  }

  const priceId = getPriceIdForTier(tier)
  if (!priceId) {
    return res.status(503).json({ error: `Stripe price for ${tier} is not configured` })
  }

  const envName = tier === 'pro' ? 'STRIPE_PRICE_PRO' : 'STRIPE_PRICE_ENTERPRISE'
  const priceError = validatePriceId(priceId, envName)
  if (priceError) {
    return res.status(503).json({ error: priceError })
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

async function handlePortal(req: VercelRequest, res: VercelResponse) {
  const stripe = getStripe()
  if (!stripe) {
    return res.status(503).json({ error: 'Billing is not configured on this server' })
  }

  const { auth, reason } = await authenticateRequestDetailed(req)
  if (!auth) {
    return res.status(401).json({ error: authErrorMessage(reason) })
  }

  if (!['manager', 'platform_admin'].includes(auth.role)) {
    return res.status(403).json({ error: 'Only managers can manage billing' })
  }

  if (!auth.org.stripe_customer_id) {
    return res.status(400).json({ error: 'No billing account for this organisation yet' })
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: auth.org.stripe_customer_id,
      return_url: `${getPlatformUrl()}/org-settings`,
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Stripe portal error:', err)
    return res.status(500).json({ error: 'Failed to open billing portal' })
  }
}

async function handleWebhook(req: VercelRequest, res: VercelResponse) {
  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !webhookSecret) {
    return res.status(503).json({ error: 'Stripe webhook not configured' })
  }

  const signature = req.headers['stripe-signature']
  if (typeof signature !== 'string') {
    return res.status(400).json({ error: 'Missing stripe-signature header' })
  }

  let event: Stripe.Event
  try {
    const rawBody = await readRawBody(req)
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('Stripe webhook signature failed:', err)
    return res.status(400).json({ error: 'Invalid webhook signature' })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId = session.metadata?.org_id
        if (orgId && typeof session.subscription === 'string') {
          const subscription = await stripe.subscriptions.retrieve(session.subscription)
          await syncOrgFromSubscription(orgId, subscription)
        }
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const orgId = subscription.metadata?.org_id
        if (orgId) {
          await syncOrgFromSubscription(orgId, subscription)
        }
        break
      }
      default:
        break
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('Stripe webhook handler error:', err)
    return res.status(500).json({ error: 'Webhook handler failed' })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const action = resolveAction(req)
  if (!action) {
    return res.status(404).json({ error: 'Unknown Stripe action' })
  }

  switch (action) {
    case 'checkout':
      return handleCheckout(req, res)
    case 'portal':
      return handlePortal(req, res)
    case 'webhook':
      return handleWebhook(req, res)
    default:
      return res.status(404).json({ error: 'Unknown Stripe action' })
  }
}
