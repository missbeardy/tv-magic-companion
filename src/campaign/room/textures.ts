import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

function makeCanvasTexture(
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 512
): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return new CanvasTexture(canvas)
  draw(ctx, size)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.needsUpdate = true
  return texture
}

let wood: CanvasTexture | null = null
export function woodFloorTexture(): CanvasTexture {
  if (wood) return wood
  wood = makeCanvasTexture((ctx, s) => {
    const plankH = s / 8
    for (let y = 0; y < 8; y++) {
      const stagger = y % 2 === 0 ? 0 : s / 6
      for (let x = -1; x < 4; x++) {
        const hue = 28 + ((x + y * 3) % 5) * 2
        ctx.fillStyle = `hsl(${hue}, 32%, ${42 + ((x * 7 + y * 5) % 8)}%)`
        ctx.fillRect(x * (s / 3) + stagger, y * plankH, s / 3 - 2, plankH - 1.5)
      }
    }
    ctx.strokeStyle = 'rgba(40, 24, 10, 0.28)'
    ctx.lineWidth = 1
    for (let y = 0; y <= 8; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * plankH)
      ctx.lineTo(s, y * plankH)
      ctx.stroke()
    }
  }, 1024)
  wood.repeat.set(4, 6)
  return wood
}

let plaster: CanvasTexture | null = null
export function plasterTexture(): CanvasTexture {
  if (plaster) return plaster
  plaster = makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = '#e9dfd2'
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 1800; i++) {
      const a = 0.015 + Math.random() * 0.04
      ctx.fillStyle = `rgba(90,70,50,${a})`
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.4, 1.4)
    }
  }, 256)
  plaster.repeat.set(3, 2)
  return plaster
}

let screen: CanvasTexture | null = null
export function tvScreenTexture(): CanvasTexture {
  if (screen) return screen
  screen = makeCanvasTexture((ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s * 0.85)
    g.addColorStop(0, '#152033')
    g.addColorStop(0.35, '#3a4658')
    g.addColorStop(0.62, '#8a6a4a')
    g.addColorStop(1, '#12151c')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = '#d7c4a2'
    ctx.beginPath()
    ctx.ellipse(s * 0.7, s * 0.4, s * 0.22, s * 0.1, -0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.fillRect(0, 0, s, s * 0.07)
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.beginPath()
    ctx.moveTo(s * 0.55, 0)
    ctx.lineTo(s, 0)
    ctx.lineTo(s, s * 0.45)
    ctx.closePath()
    ctx.fill()
  }, 512)
  screen.wrapS = screen.wrapT = RepeatWrapping
  screen.repeat.set(1, 1)
  return screen
}

let fabric: CanvasTexture | null = null
export function sofaFabricTexture(): CanvasTexture {
  if (fabric) return fabric
  fabric = makeCanvasTexture((ctx, s) => {
    ctx.fillStyle = '#6d7380'
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    for (let i = 0; i < s; i += 4) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, s)
      ctx.stroke()
    }
  }, 128)
  fabric.repeat.set(4, 4)
  return fabric
}

let art: CanvasTexture | null = null
export function artCanvasTexture(): CanvasTexture {
  if (art) return art
  art = makeCanvasTexture((ctx, s) => {
    const g = ctx.createLinearGradient(0, s, s, 0)
    g.addColorStop(0, '#2c5f73')
    g.addColorStop(0.5, '#d8c4a2')
    g.addColorStop(1, '#8eb8c4')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(40, s * 0.7)
    ctx.quadraticCurveTo(s * 0.4, s * 0.2, s - 40, s * 0.55)
    ctx.stroke()
  }, 512)
  return art
}
