import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(QUERY).matches
}

/**
 * Live `prefers-reduced-motion` reading, tracked as an external store so a mid-session
 * OS change takes effect without a reload.
 *
 * index.css already flattens CSS animations for these users, but JS-driven motion
 * (confetti, count-up tweens) has to opt out itself — a canvas particle burst is
 * exactly the kind of thing the setting exists to stop.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
