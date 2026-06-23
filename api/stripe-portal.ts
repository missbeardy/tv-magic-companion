import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticateRequest } from './_lib/auth.js'
import { getStripe, getPlatformUrl } from './_lib/stripe.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const stripe = getStripe()
  if (!stripe) {
    return res.status(503).json({ error: 'Billing is not configured on this server' })
  }

  const auth = await authenticateRequest(req)
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' })
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
