/**
 * Minimal app-wide toast store. Module-level (no context threading) so plain
 * library code and event handlers can raise a toast the same way — mirrors the
 * subscribe pattern used by the offline queue. Render with <ToastHost/>.
 */

export type ToastVariant = 'error' | 'info' | 'success'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  message: string
  variant?: ToastVariant
  /** Optional action button (e.g. Retry). */
  action?: ToastAction
  /** Auto-dismiss delay in ms. 0 keeps it until dismissed. Default 6000. */
  durationMs?: number
}

export interface ToastItem extends ToastOptions {
  id: string
}

let items: ToastItem[] = []
let seq = 0
const listeners = new Set<(items: ToastItem[]) => void>()

function emit() {
  for (const listener of listeners) listener(items)
}

export function subscribeToasts(listener: (items: ToastItem[]) => void): () => void {
  listeners.add(listener)
  listener(items)
  return () => {
    listeners.delete(listener)
  }
}

export function showToast(opts: ToastOptions): string {
  const id = `toast-${++seq}`
  items = [...items, { variant: 'info', durationMs: 6000, ...opts, id }]
  emit()
  const duration = opts.durationMs ?? 6000
  if (duration > 0 && typeof setTimeout !== 'undefined') {
    setTimeout(() => dismissToast(id), duration)
  }
  return id
}

export function dismissToast(id: string): void {
  const next = items.filter((t) => t.id !== id)
  if (next.length !== items.length) {
    items = next
    emit()
  }
}

export function clearToasts(): void {
  if (items.length === 0) return
  items = []
  emit()
}
