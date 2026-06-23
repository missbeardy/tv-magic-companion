import type { VercelRequest, VercelResponse } from '@vercel/node'
import type Stripe from 'stripe'
import { getStripe } from './_lib/stripe.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { tierFromStripePriceId, type SubscriptionTier } from './_lib/tier.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

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
