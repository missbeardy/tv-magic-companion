import { useSyncExternalStore } from 'react'

/**
 * One shared 1-second ticker instead of every timer card (UnassignedTimer,
 * ContactFollowUpBadge, CountdownTimer) running its own setInterval — a leads
 * board with 50 cards used to mean up to 50 independent 1s intervals each
 * triggering their own re-render. The interval is created lazily on the first
 * subscriber and torn down when the last one unmounts, so a page with no
 * timers (e.g. /visualise) runs none at all.
 */
let now = Date.now()
let intervalId: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function tick(): void {
  now = Date.now()
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!intervalId) {
    intervalId = setInterval(tick, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }
}

function getSnapshot(): number {
  return now
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot)
}
