import { cacheGet, cachePut } from './offlineQueue'

// Read-through cache of the last successful leads / calendar fetch, per user, so
// the field app still shows today's jobs (names, phones, addresses) when a later
// fetch fails on no signal. Cache-on-read only — NOT a sync engine. Backed by the
// offline-queue IndexedDB (larger quota than localStorage, off the main thread).

const LEADS_PREFIX = 'leads-cache:'
const EVENTS_PREFIX = 'events-cache:'
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000 // 12h — a day's work is still useful

interface Envelope<T> {
  data: T[]
  cachedAt: number
}

export interface CachedLeads<T = unknown> {
  leads: T[]
  cachedAt: number
}

export interface CachedEvents<T = unknown> {
  events: T[]
  cachedAt: number
}

async function readEnvelope<T>(key: string, ttlMs: number): Promise<Envelope<T> | null> {
  const env = await cacheGet<Envelope<T>>(key)
  if (!env || !Array.isArray(env.data) || typeof env.cachedAt !== 'number') return null
  if (Date.now() - env.cachedAt > ttlMs) return null
  return env
}

export async function saveLeadsCache(userId: string, leads: unknown[]): Promise<void> {
  if (!userId) return
  await cachePut(LEADS_PREFIX + userId, { data: leads, cachedAt: Date.now() } satisfies Envelope<unknown>)
}

export async function loadLeadsCache(
  userId: string,
  ttlMs = DEFAULT_TTL_MS
): Promise<CachedLeads | null> {
  if (!userId) return null
  const env = await readEnvelope<unknown>(LEADS_PREFIX + userId, ttlMs)
  return env ? { leads: env.data, cachedAt: env.cachedAt } : null
}

export async function saveEventsCache(userId: string, events: unknown[]): Promise<void> {
  if (!userId) return
  await cachePut(EVENTS_PREFIX + userId, { data: events, cachedAt: Date.now() } satisfies Envelope<unknown>)
}

export async function loadEventsCache(
  userId: string,
  ttlMs = DEFAULT_TTL_MS
): Promise<CachedEvents | null> {
  if (!userId) return null
  const env = await readEnvelope<unknown>(EVENTS_PREFIX + userId, ttlMs)
  return env ? { events: env.data, cachedAt: env.cachedAt } : null
}
