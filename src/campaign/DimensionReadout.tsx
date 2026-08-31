import { formatMm, zoneLabel, SEATED_EYE_MM } from './placementMath'
import { usePlacement } from './usePlacement'
import type { CSSProperties } from 'react'

export function IdealSnapBadge({ className = '', style }: { className?: string; style?: CSSProperties }) {
  const { snapshot, setCentreHeightMm } = usePlacement()
  const onSpot = snapshot.zone === 'in'
  return (
    <button
      type="button"
      className={`campaign-ideal-badge ${className}`}
      data-on={onSpot}
      style={style}
      onClick={() => setCentreHeightMm(SEATED_EYE_MM)}
    >
      {onSpot ? 'Ideal height · 1,100 mm' : 'Snap to ideal · 1,100 mm'}
    </button>
  )
}

export default function DimensionReadout() {
  const { snapshot } = usePlacement()
  const inZone = snapshot.zone === 'in'
  const rows = [
    { label: 'Ceiling', value: formatMm(snapshot.ceilingToTop) },
    { label: 'Centre', value: formatMm(snapshot.centreHeightMm) },
    { label: 'Floor', value: formatMm(snapshot.floorToBottom) },
  ]
  return (
    <aside
      className="pointer-events-none absolute inset-x-2 top-2 z-20 md:inset-x-auto md:left-3 md:top-3 md:w-[11.5rem]"
      aria-live="polite"
    >
      <div className="flex gap-2 bg-[var(--c-navy)]/88 px-2 py-1.5 text-white md:block md:space-y-3 md:bg-transparent md:px-0 md:py-0 md:text-inherit">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0 flex-1 md:min-w-full">
            <p className="campaign-laser-label truncate text-[9px] text-cyan-100 md:text-[0.68rem] md:text-[var(--c-cyan)]">
              {row.label}
            </p>
            <p className="font-[Maven_Pro,sans-serif] text-[11px] font-bold tabular-nums text-white md:text-lg md:text-[var(--c-cyan)]">
              {row.value}
            </p>
          </div>
        ))}
      </div>
      <p
        className={`campaign-laser-label mt-1 px-2 py-1 text-white md:mt-3 ${
          inZone ? 'bg-[var(--c-cyan)]' : 'bg-[var(--c-coral)]'
        }`}
      >
        {zoneLabel(snapshot.zone)}
      </p>
    </aside>
  )
}
