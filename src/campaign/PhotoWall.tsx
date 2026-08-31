import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { motion } from 'motion/react'
import { compressImage } from '../lib/imageCompression'
import { usePlacement } from './usePlacement'
import { MountedProductFace } from './ProductGlyph'
import { pxPerMm, yFracFromFloor, SEATED_EYE_MM, ZONE_HALF_MM } from './placementMath'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { IdealSnapBadge } from './DimensionReadout'

function containedRect(img: HTMLImageElement): { left: number; top: number; width: number; height: number } {
  const natural = img.naturalWidth / img.naturalHeight
  const width = img.clientWidth
  const height = img.clientHeight
  const boxAspect = width / height
  if (boxAspect > natural) {
    const w = height * natural
    return { left: (width - w) / 2, top: 0, width: w, height }
  }
  const h = width / natural
  return { left: 0, top: (height - h) / 2, width, height: h }
}

function createSampleWall(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 2000
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#e8ddd0'
  ctx.fillRect(0, 0, 1600, 2000)
  const g = ctx.createLinearGradient(0, 0, 0, 2000)
  g.addColorStop(0, '#efe6db')
  g.addColorStop(1, '#dccfbf')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1600, 2000)
  ctx.fillStyle = '#c4b09a'
  ctx.fillRect(0, 1968, 1600, 32)
  ctx.strokeStyle = 'rgba(0,0,0,0.04)'
  ctx.lineWidth = 1
  for (let y = 80; y < 1960; y += 80) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(1600, y)
    ctx.stroke()
  }
  return canvas.toDataURL('image/jpeg', 0.88)
}

export default function PhotoWall() {
  const {
    product,
    photoUrl,
    setPhoto,
    calibration,
    setCalibration,
    centreHeightMm,
    setCentreHeightMm,
    ceilingHeightMm,
    snapshot,
    setViewMode,
  } = usePlacement()
  const reduced = usePrefersReducedMotion()
  const imgRef = useRef<HTMLImageElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const [calStep, setCalStep] = useState<'ceiling' | 'floor' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dragOrigin = useRef<{ y: number; centre: number } | null>(null)

  const measure = useCallback(() => {
    const img = imgRef.current
    if (!img || img.naturalWidth === 0) return
    setBox(containedRect(img))
  }, [])

  useEffect(() => {
    measure()
    const img = imgRef.current
    if (!img) return
    const ro = new ResizeObserver(measure)
    ro.observe(img)
    return () => ro.disconnect()
  }, [measure, photoUrl])

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const compressed = await compressImage(file)
      const url = URL.createObjectURL(compressed)
      setPhoto(url, false)
      setCalStep('ceiling')
    } catch {
      setError('Could not read that photo. Try another image.')
    } finally {
      setBusy(false)
    }
  }

  function onOverlayClick(e: MouseEvent<HTMLDivElement>) {
    if (!calStep) return
    const y = (e.clientY - e.currentTarget.getBoundingClientRect().top) / e.currentTarget.clientHeight
    const clamped = Math.min(0.98, Math.max(0.02, y))
    if (calStep === 'ceiling') {
      setCalibration({ ceilingY: clamped, floorY: 0.98 })
      setCalStep('floor')
      return
    }
    const ceilingY = calibration?.ceilingY ?? 0.02
    if (clamped <= ceilingY + 0.05) {
      setError('Tap the floor — below the ceiling mark.')
      return
    }
    setCalibration({ ceilingY, floorY: clamped })
    setCalStep(null)
    setError('')
  }

  const ready = Boolean(photoUrl && calibration && !calStep)
  const scale = ready ? pxPerMm(box.height, calibration!.ceilingY, calibration!.floorY, ceilingHeightMm) : 0
  const widthPx = scale * product.widthMm
  const heightPx = scale * product.heightMm
  const topFrac = ready
    ? yFracFromFloor(snapshot.centreHeightMm + product.heightMm / 2, ceilingHeightMm, calibration!.ceilingY, calibration!.floorY)
    : 0.3
  const zoneTop = ready
    ? yFracFromFloor(SEATED_EYE_MM + ZONE_HALF_MM, ceilingHeightMm, calibration!.ceilingY, calibration!.floorY)
    : 0
  const zoneBot = ready
    ? yFracFromFloor(SEATED_EYE_MM - ZONE_HALF_MM, ceilingHeightMm, calibration!.ceilingY, calibration!.floorY)
    : 0
  const centreFrac = ready
    ? yFracFromFloor(centreHeightMm, ceilingHeightMm, calibration!.ceilingY, calibration!.floorY)
    : 0.5

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!ready) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragOrigin.current = { y: e.clientY, centre: centreHeightMm }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragOrigin.current || scale <= 0) return
    const deltaMm = -(e.clientY - dragOrigin.current.y) / scale
    setCentreHeightMm(dragOrigin.current.centre + deltaMm)
  }

  function onPointerUp() {
    dragOrigin.current = null
  }

  if (!photoUrl) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-[var(--c-wall)] px-4 text-center">
        <p className="max-w-sm font-[Maven_Pro,sans-serif] text-lg font-bold text-[var(--c-navy)] sm:text-xl">
          Drop a photo of your wall
        </p>
        <p className="max-w-sm text-sm text-[var(--c-body)]">
          We’ll scale it from ceiling to floor so you can drag the mount live. Or stay in 3D.
        </p>
        {error && <p className="text-sm text-[var(--c-coral)]">{error}</p>}
        <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button type="button" className="campaign-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Loading…' : 'Upload photo'}
          </button>
          <button type="button" className="campaign-btn campaign-btn-ghost" disabled={busy} onClick={() => cameraRef.current?.click()}>
            Use camera
          </button>
          <button
            type="button"
            className="campaign-btn campaign-btn-ghost"
            onClick={() => {
              const url = createSampleWall()
              if (url) {
                setPhoto(url, true)
                setCalStep(null)
              }
            }}
          >
            Try a sample wall
          </button>
        </div>
        <button type="button" className="text-sm text-[var(--c-navy)] underline-offset-4 hover:underline" onClick={() => setViewMode('3d')}>
          Orbit the 3D room instead
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#1a1c24]">
      <img
        ref={imgRef}
        src={photoUrl}
        alt="Your wall"
        onLoad={measure}
        className="absolute inset-0 h-full w-full object-contain"
      />
      <div
        className="absolute"
        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        onClick={onOverlayClick}
      >
        {calStep && (
          <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/25 p-4">
            <p className="campaign-laser-label bg-[var(--c-navy)] px-3 py-2 text-white">
              {calStep === 'ceiling' ? 'Tap the ceiling line' : 'Tap where the wall meets the floor'}
            </p>
          </div>
        )}
        {ready && (
          <>
            <div
              className="campaign-ideal-band pointer-events-none absolute left-0 right-0"
              style={{
                top: `${zoneTop * 100}%`,
                height: `${Math.max(0, zoneBot - zoneTop) * 100}%`,
              }}
            />
            <div
              className="pointer-events-none absolute left-[8%] right-0 border-t border-dashed border-[var(--c-cyan)]"
              style={{ top: `${centreFrac * 100}%` }}
            />
            <motion.div
              className="absolute cursor-grab touch-none active:cursor-grabbing"
              style={{
                left: (box.width - widthPx) / 2,
                top: topFrac * box.height,
                width: widthPx,
                height: heightPx,
              }}
              animate={reduced ? undefined : { boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <MountedProductFace item={product} width={widthPx} height={heightPx} />
            </motion.div>
            <div
              className="campaign-ideal-line pointer-events-none absolute left-0 right-0 z-20"
              style={{ top: `${((zoneTop + zoneBot) / 2) * 100}%` }}
            />
            <IdealSnapBadge className="pointer-events-auto absolute left-2 z-30 -translate-y-1/2" style={{ top: `${((zoneTop + zoneBot) / 2) * 100}%` }} />
            <LaserStack
              centreFrac={centreFrac}
              topFrac={topFrac}
              heightPx={heightPx}
              snapshotFloor={snapshot.floorToBottom}
              snapshotCeil={snapshot.ceilingToTop}
              centre={centreHeightMm}
            />
          </>
        )}
      </div>
      <div className="absolute right-2 top-14 z-30 flex max-w-[calc(100%-1rem)] gap-1 sm:right-3 sm:top-3 sm:gap-2 md:top-3">
        <button
          type="button"
          className="campaign-btn campaign-btn-ghost bg-white/90 px-3 py-2 text-[10px]"
          onClick={() => {
            setPhoto(null)
            setCalStep(null)
          }}
        >
          Change photo
        </button>
        {photoUrl && !calStep && (
          <button
            type="button"
            className="campaign-btn bg-[var(--c-navy)] px-3 py-2 text-[10px]"
            onClick={() => {
              setCalibration(null)
              setCalStep('ceiling')
            }}
          >
            Recalibrate
          </button>
        )}
      </div>
      {error && (
        <p className="absolute bottom-3 left-3 right-3 z-30 bg-white/90 px-3 py-2 text-sm text-[var(--c-coral)]">{error}</p>
      )}
    </div>
  )
}

function LaserStack({
  centreFrac,
  topFrac,
  heightPx,
  snapshotFloor,
  snapshotCeil,
  centre,
}: {
  centreFrac: number
  topFrac: number
  heightPx: number
  snapshotFloor: number
  snapshotCeil: number
  centre: number
}) {
  return (
    <>
      <div className="pointer-events-none absolute left-[6%] w-px campaign-laser" style={{ top: 0, height: `${topFrac * 100}%` }} />
      <p className="campaign-laser-label pointer-events-none absolute left-[7%] top-[4%] hidden sm:block">
        {Math.round(snapshotCeil)} mm to ceiling
      </p>
      <p className="campaign-laser-label pointer-events-none absolute left-[7%] hidden sm:block" style={{ top: `calc(${centreFrac * 100}% - 1.1rem)` }}>
        {Math.round(centre)} mm centre
      </p>
      <div
        className="pointer-events-none absolute left-[6%] w-px campaign-laser"
        style={{ top: `calc(${topFrac * 100}% + ${heightPx}px)`, bottom: 0 }}
      />
      <p className="campaign-laser-label pointer-events-none absolute bottom-[4%] left-[7%] hidden sm:block">
        {Math.round(snapshotFloor)} mm to floor
      </p>
    </>
  )
}
