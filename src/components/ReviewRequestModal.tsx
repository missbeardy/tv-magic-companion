import ReviewRequestStep from './ReviewRequestStep'

interface Props {
  customerName: string
  customerPhone: string
  sending?: boolean
  error?: string | null
  onSend: () => void
  onSkip: () => void
}

/** Standalone overlay for status-menu / drag-to-complete flows. */
export default function ReviewRequestModal({
  customerName,
  customerPhone,
  sending,
  error,
  onSend,
  onSkip,
}: Props) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-end md:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-6">
        <ReviewRequestStep
          customerName={customerName}
          customerPhone={customerPhone}
          sending={sending}
          error={error}
          onSend={onSend}
          onSkip={onSkip}
        />
      </div>
    </div>
  )
}
