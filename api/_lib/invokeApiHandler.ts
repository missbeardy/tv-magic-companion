import type { VercelRequest, VercelResponse } from '@vercel/node'

export interface HandlerInvokeResult {
  status: number
  body: unknown
  raw: string
}

type ApiHandler = (
  req: VercelRequest,
  res: VercelResponse
) => void | VercelResponse | Promise<void | VercelResponse>

/** Run a Vercel API handler in-process (avoids preview deployment-protection HTML on self-fetch). */
export async function invokeApiHandler(
  handler: ApiHandler,
  partialReq: Pick<VercelRequest, 'method' | 'url' | 'headers' | 'body' | 'query'>
): Promise<HandlerInvokeResult> {
  const normalizedHeaders: Record<string, string> = {}
  for (const [key, value] of Object.entries(partialReq.headers ?? {})) {
    if (typeof value === 'string') {
      normalizedHeaders[key.toLowerCase()] = value
    }
  }

  const req = {
    method: partialReq.method,
    url: partialReq.url,
    headers: normalizedHeaders,
    body: partialReq.body,
    query: partialReq.query ?? {},
  } as VercelRequest

  let statusCode = 200
  let raw = ''
  let body: unknown = null

  const res = {
    status(code: number) {
      statusCode = code
      return res
    },
    setHeader() {
      return res
    },
    json(data: unknown) {
      body = data
      raw = JSON.stringify(data)
      return res
    },
    send(data: string | Buffer) {
      raw = typeof data === 'string' ? data : data.toString()
      body = raw
      try {
        body = JSON.parse(raw)
      } catch {
        // TwiML or plain text
      }
      return res
    },
    end(data?: string | Buffer) {
      if (data !== undefined) {
        res.send(data)
      }
      return res
    },
  } as unknown as VercelResponse

  await handler(req, res)

  return { status: statusCode, body, raw }
}
