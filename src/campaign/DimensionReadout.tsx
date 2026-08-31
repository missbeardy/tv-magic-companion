import { formatMm, zoneLabel, SEATED_EYE_MM } from './placementMath'
import { usePlacement } from './usePlacement'

export default function DimensionReadout() {
  const { snapshot, setCentreHeightMm } = usePlacement()
  const inZone = snapshot.zone === 'in'
  const rows = [
    { label: 'Ceiling', value: formatMm(snapshot.ceilingToTop) },
    { label: 'Centre', value: formatMm(snapshot.centreHeightMm) },
    { label: 'Floor', value: formatMm(snapshot.floorToBottom) },
  ]
  return (
    <aside
      className="shrink-0 border-t border-[var(--c-line)] bg-white px-2 py-1.5 sm:px-3"
      aria-live="polite"
    >
      <div className="flex items-end gap-2">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0 flex-1">
            <p className="campaign-laser-label truncate text-[9px] text-[var(--c-cyan-ink)] sm:text-[0.68rem]">
              {row.label}
            </p>
            <p className="font-[Maven_Pro,sans-serif] text-[12px] font-bold tabular-nums text-[var(--c-navy)] sm:text-base">
              {row.value}
            </p>
          </div>
        ))}
        <button
          type="button"
          className={`ml-1 min-h-11 shrink-0 px-3 text-[10px] font-bold uppercase leading-tight tracking-[0.1em] ${
            inZone ? 'bg-[var(--c-cyan-ink)] text-white' : 'bg-[var(--c-coral)] text-white'
          }`}
          onClick={() => setCentreHeightMm(SEATED_EYE_MM)}
        >
          {inZone ? 'Ideal spot' : 'Snap to 1,100 mm'}
        </button>
      </div>
      <p className="sr-only">{zoneLabel(snapshot.zone)}</p>
    </aside>
  )
}
