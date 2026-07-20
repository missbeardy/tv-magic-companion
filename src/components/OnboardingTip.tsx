import type { OnboardingTipDef } from '../lib/onboardingTips'
import { HelpCircle, X } from 'lucide-react'

interface Props {
  tip: OnboardingTipDef
  onGotIt: () => void
  onDismissAll?: () => void
}

export default function OnboardingTip({ tip, onGotIt }: Props) {
  return (
    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 flex items-start gap-3">
      <HelpCircle size={18} className="text-sky-700 shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-sky-900">{tip.title}</p>
        <p className="text-xs text-sky-800/90 mt-0.5">{tip.body}</p>
        <button
          type="button"
          onClick={onGotIt}
          className="mt-2 text-xs font-semibold text-sky-900 underline underline-offset-2"
        >
          Got it
        </button>
      </div>
      <button
        type="button"
        onClick={onGotIt}
        className="p-1 rounded-lg text-sky-700 hover:bg-sky-100"
        aria-label="Dismiss tip"
      >
        <X size={16} />
      </button>
    </div>
  )
}
