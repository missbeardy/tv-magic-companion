import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── TEMPORARY BYPASS ──────────────────────────────────────────────
  // We are forcing a 200 OK and printing the raw email to your logs
  const { plain, html, headers } = req.body
  const emailText = plain || html?.replace(/<[^>]+>/g, ' ') || ''
  
  console.log("🚨 !!! RAW EMAIL BODY FROM GOOGLE !!! 🚨", emailText)
  console.log("🚨 SUBJECT:", req.body.subject || headers?.subject)
  // ──────────────────────────────────────────────────────────────────

  return res.status(200).json({ success: true, message: "Bypassed for Google confirmation" })
}