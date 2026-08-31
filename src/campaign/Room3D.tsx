import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { PMREMGenerator, TOUCH } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { usePlacement } from './usePlacement'
import { SEATED_EYE_MM, ZONE_HALF_MM, clampCentreMm } from './placementMath'
import { useIsMobile } from './useIsMobile'
import { ProductMesh } from './room/ProductMesh'
import { plasterTexture, sofaFabricTexture, woodFloorTexture } from './room/textures'

function m(mm: number) {
  return mm / 1000
}

function IndoorEnvironment() {
  const { gl, scene } = useThree()
  useLayoutEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const envScene = new RoomEnvironment()
    const rt = pmrem.fromScene(envScene, 0.04)
    envScene.dispose()
    const prev = scene.environment
    scene.environment = rt.texture
    scene.environmentIntensity = 0.9
    return () => {
      scene.environment = prev
      rt.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

function Sofa({ z }: { z: number }) {
  const fabric = useMemo(() => sofaFabricTexture(), [])
  // TV wall is z=0. Seat opens toward -Z; backrest sits on +Z (room interior).
  return (
    <group position={[-0.35, 0, z]}>
      <mesh position={[0, 0.2, 0.02]} castShadow>
        <boxGeometry args={[2.1, 0.16, 0.9]} />
        <meshStandardMaterial map={fabric} roughness={0.92} />
      </mesh>
      <mesh position={[-0.52, 0.38, -0.12]} castShadow>
        <boxGeometry args={[0.88, 0.16, 0.52]} />
        <meshStandardMaterial map={fabric} roughness={0.9} color="#7a818c" />
      </mesh>
      <mesh position={[0.52, 0.38, -0.12]} castShadow>
        <boxGeometry args={[0.88, 0.16, 0.52]} />
        <meshStandardMaterial map={fabric} roughness={0.9} color="#7a818c" />
      </mesh>
      <mesh position={[0, 0.78, 0.42]} castShadow>
        <boxGeometry args={[2.1, 0.88, 0.18]} />
        <meshStandardMaterial map={fabric} roughness={0.9} />
      </mesh>
      <mesh position={[-0.5, 0.58, 0.28]} rotation={[-0.35, 0, 0]} castShadow>
        <boxGeometry args={[0.72, 0.42, 0.14]} />
        <meshStandardMaterial map={fabric} roughness={0.88} color="#6e7580" />
      </mesh>
      <mesh position={[0.5, 0.58, 0.28]} rotation={[-0.35, 0, 0]} castShadow>
        <boxGeometry args={[0.72, 0.42, 0.14]} />
        <meshStandardMaterial map={fabric} roughness={0.88} color="#6e7580" />
      </mesh>
      <mesh position={[-1.12, 0.5, 0]} castShadow>
        <boxGeometry args={[0.16, 0.52, 0.9]} />
        <meshStandardMaterial map={fabric} roughness={0.88} />
      </mesh>
      <mesh position={[1.12, 0.5, 0]} castShadow>
        <boxGeometry args={[0.16, 0.52, 0.9]} />
        <meshStandardMaterial map={fabric} roughness={0.88} />
      </mesh>
    </group>
  )
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.11, 0.09, 0.24, 20]} />
        <meshStandardMaterial color="#6b3f2a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.48, 0]}>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshStandardMaterial color="#2f6b45" roughness={0.7} />
      </mesh>
      <mesh position={[0.12, 0.62, 0.04]}>
        <sphereGeometry args={[0.14, 14, 10]} />
        <meshStandardMaterial color="#3d8a58" roughness={0.7} />
      </mesh>
      <mesh position={[-0.1, 0.58, -0.06]}>
        <sphereGeometry args={[0.12, 14, 10]} />
        <meshStandardMaterial color="#245c38" roughness={0.7} />
      </mesh>
    </group>
  )
}

function WindowLight({ width, height, depth }: { width: number; height: number; depth: number }) {
  return (
    <group position={[-width / 2 + 0.03, height * 0.62, depth * 0.42]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <planeGeometry args={[1.15, 1.35]} />
        <meshStandardMaterial color="#fff6dc" emissive="#fff1c8" emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[1.22, 1.42, 0.04]} />
        <meshStandardMaterial color="#efe8dc" roughness={0.6} />
      </mesh>
    </group>
  )
}

function IdealHeightMark({
  width,
  zoneY,
  zoneH,
  laserZ,
}: {
  width: number
  zoneY: number
  zoneH: number
  laserZ: number
}) {
  const bandW = width * 0.98
  const skip = () => {}
  const postX = width * 0.5 - 0.08
  return (
    <group>
      <mesh position={[0, zoneY, 0.008]} raycast={skip}>
        <planeGeometry args={[bandW, zoneH]} />
        <meshBasicMaterial color="#14bac1" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh position={[0, zoneY + zoneH / 2, 0.012]} raycast={skip}>
        <planeGeometry args={[bandW, 0.02]} />
        <meshBasicMaterial color="#14bac1" />
      </mesh>
      <mesh position={[0, zoneY - zoneH / 2, 0.012]} raycast={skip}>
        <planeGeometry args={[bandW, 0.02]} />
        <meshBasicMaterial color="#14bac1" />
      </mesh>
      <mesh position={[-postX, zoneY, 0.014]} raycast={skip}>
        <planeGeometry args={[0.12, zoneH + 0.08]} />
        <meshBasicMaterial color="#14bac1" />
      </mesh>
      <mesh position={[postX, zoneY, 0.014]} raycast={skip}>
        <planeGeometry args={[0.12, zoneH + 0.08]} />
        <meshBasicMaterial color="#14bac1" />
      </mesh>
      <mesh position={[0, zoneY, laserZ]} raycast={skip}>
        <planeGeometry args={[bandW, 0.022]} />
        <meshBasicMaterial color="#14bac1" />
      </mesh>
      <mesh position={[0, zoneY, laserZ + 0.002]} raycast={skip}>
        <planeGeometry args={[bandW, 0.008]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  )
}

function RoomContents({
  orbitEnabled,
  setOrbitEnabled,
  isMobile,
}: {
  orbitEnabled: boolean
  setOrbitEnabled: (on: boolean) => void
  isMobile: boolean
}) {
  const {
    product,
    ceilingHeightMm,
    wallWidthMm,
    viewingDistanceMm,
    centreHeightMm,
    setCentreHeightMm,
  } = usePlacement()
  const dragging = useRef(false)
  const width = m(wallWidthMm)
  const height = m(ceilingHeightMm)
  const depth = m(viewingDistanceMm)
  const centreY = m(centreHeightMm)
  const wood = useMemo(() => woodFloorTexture(), [])
  const plaster = useMemo(() => plasterTexture(), [])
  const zoneY = m(SEATED_EYE_MM)
  const zoneH = m(ZONE_HALF_MM * 2)

  function applyPoint(e: ThreeEvent<PointerEvent>) {
    setCentreHeightMm(clampCentreMm(e.point.y * 1000, ceilingHeightMm, product.heightMm))
  }

  return (
    <>
      <color attach="background" args={['#d9cfc4']} />
      <IndoorEnvironment />
      <ambientLight intensity={0.28} />
      <hemisphereLight args={['#fff4e5', '#7a6e64', 0.45]} />
      <directionalLight
        position={[1.6, 3.8, 4.2]}
        intensity={1.55}
        castShadow={!isMobile}
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-width / 2 + 0.4, height * 0.7, depth * 0.45]} intensity={18} distance={6} color="#ffe8b8" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, depth / 2]} receiveShadow>
        <planeGeometry args={[width * 1.5, depth]} />
        <meshStandardMaterial map={wood} roughness={0.78} />
      </mesh>

      <mesh
        position={[0, height / 2, 0]}
        receiveShadow
        onPointerDown={(e) => {
          dragging.current = true
          setOrbitEnabled(false)
          e.stopPropagation()
          applyPoint(e)
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          e.stopPropagation()
          applyPoint(e)
        }}
        onPointerUp={() => {
          dragging.current = false
          setOrbitEnabled(true)
        }}
        onPointerLeave={() => {
          dragging.current = false
          setOrbitEnabled(true)
        }}
      >
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={plaster} roughness={0.92} />
      </mesh>

      <mesh position={[0, 0.045, 0.012]}>
        <boxGeometry args={[width, 0.09, 0.024]} />
        <meshStandardMaterial color="#f2ebe2" roughness={0.7} />
      </mesh>
      <mesh position={[0, height - 0.03, 0.01]}>
        <boxGeometry args={[width, 0.06, 0.02]} />
        <meshStandardMaterial color="#f2ebe2" roughness={0.7} />
      </mesh>

      <mesh position={[-width / 2, height / 2, depth / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color="#e4d9cc" roughness={0.9} />
      </mesh>
      <mesh position={[width / 2, height / 2, depth / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color="#ddd2c4" roughness={0.9} />
      </mesh>
      <mesh position={[0, height, depth / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#f4efe8" roughness={0.95} />
      </mesh>

      <mesh position={[0, 0.016, depth * 0.58]}>
        <cylinderGeometry args={[1.05, 1.05, 0.02, 48]} />
        <meshStandardMaterial
          color="#7a3f36"
          roughness={0.95}
          envMapIntensity={0}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <mesh position={[0, 0.027, depth * 0.58]}>
        <cylinderGeometry args={[0.82, 0.82, 0.006, 48]} />
        <meshStandardMaterial color="#8d4c42" roughness={0.95} envMapIntensity={0} />
      </mesh>

      <IdealHeightMark
        width={width}
        zoneY={zoneY}
        zoneH={zoneH}
        laserZ={m(product.depthMm) + 0.06}
      />

      <group position={[0, centreY, m(product.depthMm) / 2 + 0.025]}>
        <ProductMesh item={product} />
      </group>

      <WindowLight width={width} height={height} depth={depth} />
      <Sofa z={depth * 0.76} />
      <Plant position={[width * 0.38, 0, depth * 0.28]} />
      <mesh position={[-width * 0.36, 0.28, depth * 0.3]}>
        <cylinderGeometry args={[0.18, 0.2, 0.56, 24]} />
        <meshStandardMaterial color="#cfc6b8" roughness={0.55} />
      </mesh>

      {!isMobile && (
        <ContactShadows position={[0, 0.003, depth * 0.76]} opacity={0.28} scale={4.2} blur={2.4} far={1.8} />
      )}

      <OrbitControls
        enabled={orbitEnabled}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={isMobile ? 2.4 : 2.2}
        maxDistance={isMobile ? 6.5 : 8}
        minPolarAngle={Math.PI / 3.4}
        maxPolarAngle={Math.PI / 2.08}
        target={[0, height * 0.42, depth * 0.28]}
        autoRotate={false}
        rotateSpeed={isMobile ? 0.7 : 0.9}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      />
    </>
  )
}

export default function Room3D() {
  const { setViewMode } = usePlacement()
  const isMobile = useIsMobile()
  const [orbitEnabled, setOrbitEnabled] = useState(true)
  const [webgl] = useState(() => {
    try {
      const c = document.createElement('canvas')
      return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
    } catch {
      return false
    }
  })

  if (!webgl) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 bg-[var(--c-wall)] px-5 text-center">
        <p className="font-[Maven_Pro,sans-serif] text-lg font-bold text-[var(--c-navy)]">3D isn’t available here</p>
        <p className="text-sm text-[var(--c-body)]">Use a photo of your wall instead.</p>
        <button type="button" className="campaign-btn" onClick={() => setViewMode('photo')}>
          Open photo mode
        </button>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-0 touch-none bg-[#d9cfc4]">
      <Canvas
        shadows={!isMobile}
        dpr={isMobile ? 1 : [1, 1.5]}
        camera={{ position: isMobile ? [1.45, 1.32, 3.35] : [2.05, 1.4, 3.85], fov: isMobile ? 50 : 40, near: 0.1, far: 40 }}
        gl={{ antialias: !isMobile, alpha: false, powerPreference: isMobile ? 'low-power' : 'high-performance' }}
        className="h-full w-full"
      >
        <Suspense fallback={null}>
          <RoomContents orbitEnabled={orbitEnabled} setOrbitEnabled={setOrbitEnabled} isMobile={isMobile} />
        </Suspense>
      </Canvas>
      <OrbitHint isMobile={isMobile} />
    </div>
  )
}

function OrbitHint({ isMobile }: { isMobile: boolean }) {
  return (
    <p className="campaign-orbit-hint pointer-events-none absolute bottom-2 right-2 z-10 sm:bottom-3 sm:right-3">
      <span className="campaign-orbit-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6 9 12l6 6" />
        </svg>
      </span>
      <span>{isMobile ? 'Drag to rotate · pinch to zoom' : 'Drag to rotate'}</span>
      <span className="campaign-orbit-arrow campaign-orbit-arrow-r" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </span>
    </p>
  )
}
