// src/components/BottomSheet.tsx
import { useEffect } from 'react'
import { X } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  title?: string
  hideHeader?: boolean
  /** Show X button top-right when `hideHeader` is true (custom in-sheet title). */
  showCloseButton?: boolean
  footer?: React.ReactNode
  children: React.ReactNode
}

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  hideHeader = false,
  showCloseButton = false,
  footer,
  children,
}: Props) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative w-full bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        {/* Handle + optional close when using custom in-sheet header */}
        {hideHeader && showCloseButton ? (
          <div className="relative shrink-0 pt-3 pb-1">
            <div className="flex justify-center">
              <div className="w-9 h-1 rounded-full bg-gray-200" />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-2 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-9 h-1 rounded-full bg-gray-200" />
          </div>
        )}

        {/* Header */}
        {title && !hideHeader && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
            <h2 className="font-display font-semibold text-gray-900 text-base">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 px-5 pt-2 pb-4 border-t border-gray-100" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}