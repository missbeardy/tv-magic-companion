#!/usr/bin/env node
// dd4 verification: a SERIAL loop passes even with the old broken Map()-based limiter (each
// request completes before the next starts, so there's no real concurrency to expose the bug).
// This fires a burst of genuinely concurrent requests and checks that the DB-backed limiter
// throttles correctly even when hits land at the same instant.
//
// Usage: node scripts/verify-rate-limit.mjs <url> [concurrency] [authHeader]
// Example against local vercel dev (unauthenticated geocode-autocomplete, limit 30/min):
//   node scripts/verify-rate-limit.mjs http://localhost:3000/api/geocode?action=autocomplete 50
// Example against a preview deploy with an auth header:
//   node scripts/verify-rate-limit.mjs https://<preview>.vercel.app/api/anthropic 20 "Bearer <token>"

const [, , url, concurrencyArg, authHeader] = process.argv

if (!url) {
  console.error('Usage: node scripts/verify-rate-limit.mjs <url> [concurrency] [authHeader]')
  process.exit(1)
}

const concurrency = Number(concurrencyArg) || 50

const headers = { 'Content-Type': 'application/json' }
if (authHeader) headers.Authorization = authHeader

async function fireOne(i) {
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query: `burst-${i}` }) })
    return res.status
  } catch (err) {
    return `error:${err.message}`
  }
}

const results = await Promise.all(Array.from({ length: concurrency }, (_, i) => fireOne(i)))
const counts = {}
for (const status of results) {
  counts[status] = (counts[status] ?? 0) + 1
}

console.log(`Fired ${concurrency} concurrent requests to ${url}`)
console.log('Status code breakdown:', counts)

const rateLimited = counts[429] ?? 0
if (rateLimited === 0) {
  console.error(
    '\nFAIL: no 429s seen. Either the limit is set higher than this burst, or the limiter is not throttling.'
  )
  process.exit(1)
}
console.log(`\nOK: ${rateLimited}/${concurrency} requests were throttled with 429.`)
