import type { CatalogItem } from './catalog'

export function ProductGlyph({
  item,
  className = '',
}: {
  item: CatalogItem
  className?: string
}) {
  const stroke = 'currentColor'
  if (item.kind === 'soundbar') {
    return (
      <svg viewBox="0 0 64 40" className={className} aria-hidden>
        <rect x="4" y="16" width="56" height="8" fill="none" stroke={stroke} strokeWidth="1.5" />
        <rect x="26" y="26" width="12" height="8" fill="none" stroke={stroke} strokeWidth="1.5" />
      </svg>
    )
  }
  if (item.kind === 'video-wall') {
    const cols = item.cols ?? 2
    const rows = item.rows ?? 2
    const gap = 1.5
    const cellW = (56 - gap * (cols - 1)) / cols
    const cellH = (32 - gap * (rows - 1)) / rows
    const cells = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push(
          <rect
            key={`${r}-${c}`}
            x={4 + c * (cellW + gap)}
            y={4 + r * (cellH + gap)}
            width={cellW}
            height={cellH}
            fill="none"
            stroke={stroke}
            strokeWidth="1.25"
          />
        )
      }
    }
    return (
      <svg viewBox="0 0 64 40" className={className} aria-hidden>
        {cells}
      </svg>
    )
  }
  if (item.kind === 'speaker') {
    return (
      <svg viewBox="0 0 64 40" className={className} aria-hidden>
        <rect x="24" y="4" width="16" height="32" fill="none" stroke={stroke} strokeWidth="1.5" />
        <circle cx="32" cy="14" r="3.5" fill="none" stroke={stroke} strokeWidth="1.25" />
        <circle cx="32" cy="26" r="5" fill="none" stroke={stroke} strokeWidth="1.25" />
      </svg>
    )
  }
  if (item.kind === 'art') {
    return (
      <svg viewBox="0 0 64 40" className={className} aria-hidden>
        <rect x="14" y="6" width="36" height="28" fill="none" stroke={stroke} strokeWidth="1.5" />
        <path d="M18 28 L28 18 L36 24 L42 16 L46 28 Z" fill="none" stroke={stroke} strokeWidth="1.25" />
      </svg>
    )
  }
  const aspect = item.widthMm / item.heightMm
  const h = 24
  const w = Math.min(48, h * aspect)
  const x = (64 - w) / 2
  const y = (40 - h) / 2
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden>
      <rect x={x} y={y} width={w} height={h} fill="#111" stroke={stroke} strokeWidth="1.25" />
      <rect
        x={x + 2}
        y={y + 2}
        width={w - 4}
        height={h - 4}
        fill="#1c1c1c"
        stroke="none"
      />
    </svg>
  )
}

export function MountedProductFace({
  item,
  width,
  height,
}: {
  item: CatalogItem
  width: number
  height: number
}) {
  if (item.kind === 'art') {
    return (
      <div
        className="h-full w-full border-[10px] border-[#5c4030] shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
        style={{
          background:
            'linear-gradient(160deg, #7eb8c9 0%, #d7e6ee 42%, #c9a36a 100%)',
        }}
      />
    )
  }
  if (item.kind === 'soundbar') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#1a1a1a] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <div className="h-[40%] w-[92%] rounded-[1px] bg-[#2a2a2a]" />
      </div>
    )
  }
  if (item.kind === 'speaker') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-[12%] bg-[#222] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <div className="aspect-square w-[46%] rounded-full border border-[#444]" />
        <div className="aspect-square w-[62%] rounded-full border border-[#444]" />
      </div>
    )
  }
  if (item.kind === 'video-wall') {
    const cols = item.cols ?? 2
    const rows = item.rows ?? 2
    return (
      <div
        className="grid h-full w-full gap-[2px] bg-black p-[2px] shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
      >
        {Array.from({ length: cols * rows }, (_, i) => (
          <div key={i} className="bg-[#141414]" />
        ))}
      </div>
    )
  }
  return (
    <div
      className="relative h-full w-full bg-[#0d0d0d] shadow-[0_12px_32px_rgba(0,0,0,0.4)]"
      style={{ width, height }}
    >
      <div className="absolute inset-[3%] bg-[#161616]" />
      <span className="absolute inset-0 flex items-center justify-center font-[Maven_Pro,sans-serif] text-[clamp(0.9rem,2.4vw,1.6rem)] font-black tracking-widest text-white/80">
        {item.shortLabel}
      </span>
    </div>
  )
}
