import { useEffect, useState } from 'react'
import { subscribeToasts, dismissToast, type ToastItem } from '../lib/toast'

const VARIANT_CLASS: Record<NonNullable<ToastItem['variant']>, string> = {
  error: 'bg-red-600',
  success: 'bg-green-600',
  info: 'bg-gray-800',
}

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => subscribeToasts(setItems), [])

  if (items.length === 0) return null

  return (
    <div className="fixed inset-x-0 bottom-4 z-[10000] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-xl px-4 py-2 text-sm text-white shadow-lg ${VARIANT_CLASS[t.variant ?? 'info']}`}
        >
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                dismissToast(t.id)
                t.action!.onClick()
              }}
              className="min-h-[44px] px-2 font-bold underline underline-offset-2"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismissToast(t.id)}
            className="min-h-[44px] px-1 opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
