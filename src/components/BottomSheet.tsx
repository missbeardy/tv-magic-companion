// src/components/BottomSheet.tsx
import { useEffect } from 'react'
import { X } from 'lucide-react'

/** Leave visible backdrop above the sheet (standard bottom-drawer cap). */
const SHEET_MAX_HEIGHT = 'min(88dvh, calc(100% - 2.5rem))'

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

function SheetTopChrome({
  title,
  hideHeader,
  showCloseButton,
  onClose,
}: Pick<Props, 'title' | 'hideHeader' | 'showCloseButton' | 'onClose'>) {
  if (title && !hideHeader) {
    return (
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white">
        <h2 className="font-display font-semibold text-gray-900 text-base">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <X size={20} strokeWidth={2} />
        </button>
      </div>
    )
  }

  if (hideHeader && showCloseButton) {
    return (
      <div className="grid grid-cols-[44px_1fr_44px] items-center px-2 pt-3 pb-2 border-b border-gray-100 bg-white">
        <span aria-hidden />
        <div className="justify-self-center w-9 h-1 rounded-full bg-gray-200" />
        <button
          type="button"
          onClick={onClose}
          className="justify-self-end w-11 h-11 flex items-center justify-center rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <X size={22} strokeWidth={2} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex justify-center pt-3 pb-2 bg-white">
      <div className="w-9 h-1 rounded-full bg-gray-200" />
    </div>
  )
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

  const gridRows = footer
    ? 'grid-rows-[auto_minmax(0,1fr)_auto]'
    : 'grid-rows-[auto_minmax(0,1fr)]'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />

      <div
        className={`relative z-10 w-full bg-white rounded-t-3xl shadow-2xl animate-slide-up overflow-hidden grid ${gridRows}`}
        style={{ maxHeight: SHEET_MAX_HEIGHT }}
        role="dialog"
        aria-modal="true"
      >
        <SheetTopChrome
          title={title}
          hideHeader={hideHeader}
          showCloseButton={showCloseButton}
          onClose={onClose}
        />

        <div className="overflow-y-auto overscroll-contain px-5 py-4 min-h-0">
          {children}
        </div>

        {footer && (
          <div
            className="shrink-0 px-5 pt-2 pb-4 border-t border-gray-100 bg-white"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
