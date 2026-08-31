import { useMemo } from 'react'
import type { CatalogItem } from '../catalog'
import { artCanvasTexture, tvScreenTexture } from './textures'

function m(mm: number) {
  return mm / 1000
}

export function ProductMesh({ item }: { item: CatalogItem }) {
  const w = m(item.widthMm)
  const h = m(item.heightMm)
  const d = Math.max(m(item.depthMm), 0.04)

  if (item.kind === 'soundbar') return <SoundbarMesh w={w} h={h} d={d} />
  if (item.kind === 'speaker') return <SpeakerMesh w={w} h={h} d={d} />
  if (item.kind === 'art') return <ArtMesh w={w} h={h} d={d} />
  if (item.kind === 'video-wall') {
    return <VideoWallMesh w={w} h={h} d={d} cols={item.cols ?? 2} rows={item.rows ?? 2} />
  }
  return <TelevisionMesh w={w} h={h} d={d} />
}

function TelevisionMesh({ w, h, d }: { w: number; h: number; d: number }) {
  const screen = useMemo(() => tvScreenTexture(), [])
  const bezel = Math.min(0.01, w * 0.012)
  const glassW = w - bezel * 2
  const glassH = h - bezel * 2
  const bodyD = Math.max(d, 0.038)
  return (
    <group>
      <mesh position={[0, 0, -0.004]}>
        <boxGeometry args={[w + 0.004, h + 0.004, bodyD]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.28} metalness={0.72} envMapIntensity={1.1} />
      </mesh>
      <mesh position={[0, 0, bodyD / 2 - 0.002]}>
        <boxGeometry args={[w, h, 0.006]} />
        <meshStandardMaterial color="#141414" roughness={0.22} metalness={0.55} />
      </mesh>
      <mesh position={[0, 0, bodyD / 2 + 0.002]}>
        <planeGeometry args={[glassW, glassH]} />
        <meshPhysicalMaterial
          map={screen}
          emissiveMap={screen}
          emissive="#ffffff"
          emissiveIntensity={0.55}
          roughness={0.04}
          metalness={0.05}
          clearcoat={1}
          clearcoatRoughness={0.04}
          reflectivity={1}
          envMapIntensity={1.6}
        />
      </mesh>
      <mesh position={[0, -h / 2 + 0.003, bodyD / 2 + 0.003]}>
        <boxGeometry args={[w * 0.12, 0.003, 0.002]} />
        <meshStandardMaterial color="#14bac1" emissive="#14bac1" emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0, 0, -bodyD / 2 - 0.008]}>
        <boxGeometry args={[0.1, 0.1, 0.01]} />
        <meshStandardMaterial color="#2c2c2c" metalness={0.75} roughness={0.35} />
      </mesh>
    </group>
  )
}

function SoundbarMesh({ w, h, d }: { w: number; h: number; d: number }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#1c1c1c" roughness={0.45} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0, d / 2 + 0.001]}>
        <planeGeometry args={[w * 0.94, h * 0.55]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.9} />
      </mesh>
      <mesh position={[w * 0.38, 0, d / 2 + 0.002]}>
        <circleGeometry args={[h * 0.22, 24]} />
        <meshStandardMaterial color="#14bac1" emissive="#14bac1" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

function SpeakerMesh({ w, h, d }: { w: number; h: number; d: number }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#2b241c" roughness={0.7} />
      </mesh>
      <mesh position={[0, h * 0.2, d / 2 + 0.002]} rotation={[0, 0, 0]}>
        <circleGeometry args={[w * 0.28, 32]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, -h * 0.18, d / 2 + 0.002]}>
        <circleGeometry args={[w * 0.36, 32]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  )
}

function ArtMesh({ w, h, d }: { w: number; h: number; d: number }) {
  const canvas = useMemo(() => artCanvasTexture(), [])
  return (
    <group>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#5a3d28" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0, d / 2 + 0.002]}>
        <planeGeometry args={[w * 0.9, h * 0.9]} />
        <meshStandardMaterial map={canvas} roughness={0.85} />
      </mesh>
    </group>
  )
}

function VideoWallMesh({
  w,
  h,
  d,
  cols,
  rows,
}: {
  w: number
  h: number
  d: number
  cols: number
  rows: number
}) {
  const screen = useMemo(() => tvScreenTexture(), [])
  const gap = 0.006
  const cellW = (w - gap * (cols - 1)) / cols
  const cellH = (h - gap * (rows - 1)) / rows
  const cells = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + cellW / 2 + c * (cellW + gap)
      const y = h / 2 - cellH / 2 - r * (cellH + gap)
      cells.push(
        <group key={`${r}-${c}`} position={[x, y, 0]}>
          <mesh>
            <boxGeometry args={[cellW, cellH, d]} />
            <meshStandardMaterial color="#111" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0, d / 2 + 0.001]}>
            <planeGeometry args={[cellW * 0.94, cellH * 0.92]} />
            <meshStandardMaterial
              map={screen}
              emissive="#ffffff"
              emissiveMap={screen}
              emissiveIntensity={0.35}
              roughness={0.12}
            />
          </mesh>
        </group>
      )
    }
  }
  return <group>{cells}</group>
}
