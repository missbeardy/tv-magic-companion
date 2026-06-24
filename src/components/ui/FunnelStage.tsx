import { withOpacity } from './colorUtils'

interface FunnelStageProps {
  label: string
  count: number
  maxCount: number
  primaryColor: string
}

export default function FunnelStage({ label, count, maxCount, primaryColor }: FunnelStageProps) {
  const widthPercent = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-3 min-w-[160px]">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="font-display font-bold text-2xl text-gray-900 mt-1">{count}</p>
      <div
        className="mt-3 h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: withOpacity(primaryColor, 0.16) }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${widthPercent}%`,
            backgroundColor: primaryColor,
          }}
        />
      </div>
    </article>
  )
}
