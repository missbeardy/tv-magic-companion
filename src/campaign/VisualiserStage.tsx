import { lazy, Suspense } from 'react'
import { usePlacement } from './usePlacement'
import PhotoWall from './PhotoWall'
import DimensionReadout from './DimensionReadout'

const Room3D = lazy(() => import('./Room3D'))

export default function VisualiserStage() {
  const {
    viewMode,
    setViewMode,
    ceilingHeightMm,
    setCeilingHeightMm,
    wallWidthMm,
    setWallWidthMm,
    viewingDistanceMm,
    setViewingDistanceMm,
  } = usePlacement()

  return (
    <div id="visualise" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--c-line)] bg-white px-2 py-1.5 sm:px-3 sm:py-2">
        <div className="flex" role="tablist" aria-label="Visualiser mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'photo'}
            className={`min-h-10 px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] sm:px-3 sm:text-xs sm:tracking-[0.14em] ${
              viewMode === 'photo' ? 'bg-[var(--c-navy)] text-white' : 'text-[var(--c-navy)]'
            }`}
            onClick={() => setViewMode('photo')}
          >
            Your wall
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === '3d'}
            className={`min-h-10 px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] sm:px-3 sm:text-xs sm:tracking-[0.14em] ${
              viewMode === '3d' ? 'bg-[var(--c-navy)] text-white' : 'text-[var(--c-navy)]'
            }`}
            onClick={() => setViewMode('3d')}
          >
            3D room
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {viewMode === 'photo' ? (
          <PhotoWall />
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full min-h-0 items-center justify-center bg-[var(--c-wall)] text-sm text-[var(--c-body)]">
                Loading 3D room…
              </div>
            }
          >
            <Room3D />
          </Suspense>
        )}
      </div>
      <DimensionReadout />

      <div
        className={`grid gap-2 border-t border-[var(--c-line)] bg-white px-2 py-2 sm:gap-4 sm:px-4 sm:py-4 ${
          viewMode === 'photo' ? 'grid-cols-1' : 'grid-cols-3'
        }`}
      >
        <NumberField
          id="ceiling-height"
          label="Ceiling height"
          value={ceilingHeightMm}
          min={2100}
          max={3600}
          onChange={setCeilingHeightMm}
        />
        {viewMode === '3d' && (
          <>
            <NumberField
              id="wall-width"
              label="Wall width"
              value={wallWidthMm}
              min={2400}
              max={8000}
              onChange={setWallWidthMm}
            />
            <NumberField
              id="viewing-distance"
              label="Sofa distance"
              value={viewingDistanceMm}
              min={1500}
              max={6000}
              onChange={setViewingDistanceMm}
            />
          </>
        )}
      </div>
    </div>
  )
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <label htmlFor={id} className="block text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--c-navy)] sm:text-xs sm:tracking-[0.12em]">
      {label}
      <span className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="hidden h-1 flex-1 cursor-pointer accent-[var(--c-cyan)] sm:block"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={10}
          value={value}
          inputMode="numeric"
          aria-label={`${label} in millimetres`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="campaign-input w-full py-1.5 text-center tabular-nums sm:w-[5.5rem] sm:text-right"
        />
      </span>
    </label>
  )
}
