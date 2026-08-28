import type { VercelRequest } from '@vercel/node'

/**
 * Read the raw request stream into a Buffer. Required when the route disables
 * Vercel's default body parser (`config.api.bodyParser = false`) so that
 * webhook HMAC signatures can be verified over the exact bytes the sender
 * signed. Used by the Stripe and Meta webhook paths.
 *
 * In-process invokes (platform simulator / tests) have no stream — fall back to
 * `req.body` so HMAC still runs over the same JSON string Meta would send.
 */
export async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const stream = req as VercelRequest & { readable?: boolean; on?: unknown; body?: unknown }
  const hasStream = typeof stream.on === 'function' && stream.readable !== false
  if (!hasStream) {
    if (Buffer.isBuffer(stream.body)) return stream.body
    if (typeof stream.body === 'string') return Buffer.from(stream.body)
    if (stream.body != null) return Buffer.from(JSON.stringify(stream.body))
    return Buffer.alloc(0)
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
