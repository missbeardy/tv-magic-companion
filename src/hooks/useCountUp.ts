import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

/**
 * Tween a number from 0 up to `target` on a rAF loop, easing out so the last digits
 * settle rather than snapping. Returns `target` immediately when the user has asked for
 * reduced motion, when there is no rAF (SSR/jsdom), or when the target is already zero.
 *
 * `key` participates in the run identity, so passing a week id restarts the count when
 * the week changes but not on an unrelated re-render.
 */
export function useCountUp(target: number, options?: { durationMs?: number; key?: string }): number {
  const reducedMotion = usePrefersReducedMotion()
  const durationMs = options?.durationMs ?? 900
  const runId = `${options?.key ?? ''}:${target}`

  const shouldAnimate =
    !reducedMotion && target !== 0 && typeof requestAnimationFrame !== 'undefined'

  const [tween, setTween] = useState(() => ({ runId, value: shouldAnimate ? 0 : target }))

  // Render-phase reset: a new run starts from zero (or lands immediately) without an
  // extra committed frame showing the previous week's figure.
  if (tween.runId !== runId) {
    setTween({ runId, value: shouldAnimate ? 0 : target })
  }

  useEffect(() => {
    if (!shouldAnimate) return

    let frame = 0
    const start = performance.now()

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      // easeOutCubic — fast off the line, gentle landing.
      const eased = 1 - Math.pow(1 - progress, 3)
      setTween({ runId, value: progress < 1 ? target * eased : target })
      if (progress < 1) frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [runId, target, durationMs, shouldAnimate])

  // The discarded pass of a render-phase reset must not flash the final figure.
  return tween.runId === runId ? tween.value : shouldAnimate ? 0 : target
}
