function clampAlpha(alpha: number): number {
  return Math.max(0, Math.min(1, alpha))
}

function parseHexColor(color: string): [number, number, number] | null {
  const value = color.trim().replace('#', '')
  if (value.length !== 3 && value.length !== 6) return null

  const normalized = value.length === 3
    ? value.split('').map((char) => char + char).join('')
    : value

  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return [r, g, b]
}

export function withOpacity(color: string, alpha: number): string {
  const rgb = parseHexColor(color)
  if (!rgb) return color
  const safeAlpha = clampAlpha(alpha)
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${safeAlpha})`
}
