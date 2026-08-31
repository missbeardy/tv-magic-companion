import { lazy, Suspense, useState } from 'react'
import { usePlacement } from './usePlacement'
import PhotoWall from './PhotoWall'
import DimensionReadout from './DimensionReadout'
import SizeChips from './SizeChips'

const Room3D = lazy(() => import('./Room3D'))

/** Standard Australian residential ceilings, so most people never type a number. */
const CEILING_PRESETS_MM = [2400, 2700, 3000]

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
    photoUrl,
    calibration,
  } = usePlacement()

  /**
   * Millimetre readings for a wall that does not exist yet are noise, and they
   * were eating ~150px of an 844px phone screen before anything had loaded.
   */
  const measurementsReady = viewMode === '3d' || Boolean(photoUrl && calibration)

  return (
    <div id="visualise" className="flex h-full min-h-0 scroll-mt-16 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--c-line)] bg-white px-2 py-1.5 sm:px-3 sm:py-2">
        <div className="flex" role="tablist" aria-label="Visualiser mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'photo'}
            className={`min-h-11 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] sm:px-3 sm:text-xs sm:tracking-[0.14em] ${
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
            className={`min-h-11 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] sm:px-3 sm:text-xs sm:tracking-[0.14em] ${
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
      <SizeChips />
      {measurementsReady && (
        <>
          <DimensionReadout />
          <div className="grid gap-3 border-t border-[var(--c-line)] bg-white px-2 py-2 sm:gap-4 sm:px-4 sm:py-4 lg:grid-cols-3">
            <CeilingField value={ceilingHeightMm} onChange={setCeilingHeightMm} />
            {/* Wall width and sofa distance are room setup, not the thing
                people came to do. Folded away by default so the render keeps
                the vertical budget on a phone. */}
            {viewMode === '3d' && (
              <details className="lg:col-span-2 lg:contents">
                <summary className="flex min-h-11 cursor-pointer list-none items-center text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--c-navy)] underline underline-offset-4 lg:hidden">
                  Room setup
                </summary>
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
              </details>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Ceiling height is the one measurement nearly everyone touches, and it used to
 * demand keypad entry of a four-digit millimetre value on mobile. Presets cover
 * the common cases; the number field stays for anything else.
 */
function CeilingField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [custom, setCustom] = useState(() => !CEILING_PRESETS_MM.includes(value))
  const showCustom = custom || !CEILING_PRESETS_MM.includes(value)

  return (
    <div className="lg:col-span-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--c-navy)] sm:text-xs sm:tracking-[0.12em]">
        Ceiling height
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Ceiling height">
        {CEILING_PRESETS_MM.map((preset) => {
          const selected = !showCustom && value === preset
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setCustom(false)
                onChange(preset)
              }}
              className={`min-h-11 border px-3 font-[Maven_Pro,sans-serif] text-xs font-bold tabular-nums ${
                selected
                  ? 'border-[var(--c-cyan-ink)] bg-[var(--c-cyan-ink)] text-white'
                  : 'border-[var(--c-navy)]/40 text-[var(--c-navy)]'
              }`}
            >
              {(preset / 1000).toFixed(1)} m
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={showCustom}
          onClick={() => setCustom(true)}
          className={`min-h-11 border px-3 font-[Maven_Pro,sans-serif] text-xs font-bold ${
            showCustom
              ? 'border-[var(--c-cyan-ink)] bg-[var(--c-cyan-ink)] text-white'
              : 'border-[var(--c-navy)]/40 text-[var(--c-navy)]'
          }`}
        >
          Custom
        </button>
      </div>
      {showCustom && (
        <NumberField
          id="ceiling-height"
          label="Exact ceiling height"
          value={value}
          min={2100}
          max={3600}
          onChange={onChange}
        />
      )}
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
    <label htmlFor={id} className="mt-2 block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--c-navy)] sm:text-xs sm:tracking-[0.12em]">
      {label}
      <span className="mt-1 flex items-center gap-2">
        {/* A slider is easier on touch than on a mouse, so hiding it below the
            sm: breakpoint had it exactly backwards. */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--c-cyan-ink)]"
        />
        <span className="campaign-input flex w-[6.25rem] shrink-0 items-center gap-1 py-1.5">
          <input
            type="number"
            min={min}
            max={max}
            step={10}
            value={value}
            inputMode="numeric"
            aria-label={`${label} in millimetres`}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full min-w-0 border-0 bg-transparent p-0 text-right tabular-nums outline-none"
          />
          <span aria-hidden="true" className="text-[10px] font-normal normal-case tracking-normal text-[var(--c-body)]">
            mm
          </span>
        </span>
      </span>
    </label>
  )
}
