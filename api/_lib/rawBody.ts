import type { VercelRequest } from '@vercel/node'

/**
 * Read the raw request stream into a Buffer. Required when the route disables
 * Vercel's default body parser (`config.api.bodyParser = false`) so that
 * webhook HMAC signatures can be verified over the exact bytes the sender
 * signed. Used by the Stripe and Meta webhook paths.
 */
export async function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
