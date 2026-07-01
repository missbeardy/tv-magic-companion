import { createHmac } from 'crypto'

/** Compute Twilio webhook signature (must match verifyTwilioSignature in inbound-sms.ts). */
export function computeTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => k + params[k])
    .join('')
  const signatureBase = url + sortedParams
  return createHmac('sha1', authToken).update(signatureBase).digest('base64')
}
