import { Suspense, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { PMREMGenerator, Plane, Raycaster, TOUCH, Vector2, Vector3, type Camera } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { usePlacement } from './usePlacement'
import { SEATED_EYE_MM, ZONE_HALF_MM, clampCentreMm } from './placementMath'
import { useIsMobile } from './useIsMobile'
import { ProductMesh } from './room/ProductMesh'
import { SofaModel } from './room/SofaModel'
import { PlantModel, SideTableModel } from './room/RoomFurniture'
import { plasterTexture, woodFloorTexture } from './room/textures'

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

function IdealHeightMark({ width, zoneY, zoneH }: { width: number; zoneY: number; zoneH: number }) {
  const skip = () => {}
  const postX = width * 0.47
  return (
    <group>
      <mesh position={[-postX, zoneY, 0.014]} raycast={skip}>
        <planeGeometry args={[0.055, zoneH]} />
        <meshBasicMaterial color="#14bac1" transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <mesh position={[postX, zoneY, 0.014]} raycast={skip}>
        <planeGeometry args={[0.055, zoneH]} />
        <meshBasicMaterial color="#14bac1" transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  )
}

function wallYFromPointer(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
  camera: Camera,
  wallPlane: Plane,
): number | null {
  const rect = canvas.getBoundingClientRect()
  const ndc = new Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
  const ray = new Raycaster()
  ray.setFromCamera(ndc, camera)
  const hit = new Vector3()
  if (!ray.ray.intersectPlane(wallPlane, hit)) return null
  return hit.y * 1000
}

function DraggableProduct({
  setOrbitEnabled,
}: {
  setOrbitEnabled: (on: boolean) => void
}) {
  const { product, centreHeightMm, ceilingHeightMm, setCentreHeightMm } = usePlacement()
  const { gl, camera } = useThree()
  const dragging = useRef(false)
  const wallPlane = useMemo(() => new Plane(new Vector3(0, 0, 1), 0), [])
  const centreY = m(centreHeightMm)
  const hitW = m(product.widthMm) * 1.18
  const hitH = m(product.heightMm) * 1.28

  function applyClient(clientX: number, clientY: number) {
    const y = wallYFromPointer(clientX, clientY, gl.domElement, camera, wallPlane)
    if (y == null) return
    setCentreHeightMm(clampCentreMm(y, ceilingHeightMm, product.heightMm))
  }

  function endDrag(e: ThreeEvent<PointerEvent>) {
    dragging.current = false
    setOrbitEnabled(true)
    gl.domElement.style.cursor = ''
    try {
      gl.domElement.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  return (
    <group
      position={[0, centreY, m(product.depthMm) / 2 + 0.025]}
      onPointerOver={() => {
        gl.domElement.style.cursor = 'ns-resize'
      }}
      onPointerOut={() => {
        if (!dragging.current) gl.domElement.style.cursor = ''
      }}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        dragging.current = true
        setOrbitEnabled(false)
        gl.domElement.setPointerCapture(e.pointerId)
        applyClient(e.clientX, e.clientY)
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!dragging.current) return
        e.stopPropagation()
        applyClient(e.clientX, e.clientY)
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <mesh visible={false} position={[0, 0, m(product.depthMm) / 2 + 0.02]}>
        <planeGeometry args={[hitW, hitH]} />
      </mesh>
      <ProductMesh item={product} />
    </group>
  )
}

function SyncCamera({
  depth,
  height,
  width,
  isMobile,
}: {
  depth: number
  height: number
  width: number
  isMobile: boolean
}) {
  const { camera } = useThree()
  useLayoutEffect(() => {
    const side = Math.min(width * 0.4, isMobile ? 1.65 : 1.9)
    camera.position.set(side, isMobile ? 1.4 : 1.5, depth * 0.92 + (isMobile ? 1.35 : 1.6))
    camera.lookAt(0, Math.min(height * 0.38, 1.12), depth * 0.32)
    camera.updateProjectionMatrix()
  }, [camera, depth, height, isMobile, width])
  return null
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
  const { ceilingHeightMm, wallWidthMm, viewingDistanceMm } = usePlacement()
  const orbitRef = useRef<ComponentRef<typeof OrbitControls>>(null)

  function setOrbit(on: boolean) {
    if (orbitRef.current) orbitRef.current.enabled = on
    setOrbitEnabled(on)
  }
  const width = m(wallWidthMm)
  const height = m(ceilingHeightMm)
  const depth = m(viewingDistanceMm)
  const wood = useMemo(() => woodFloorTexture(), [])
  const plaster = useMemo(() => plasterTexture(), [])
  const zoneY = m(SEATED_EYE_MM)
  const zoneH = m(ZONE_HALF_MM * 2)

  return (
    <>
      <SyncCamera width={width} depth={depth} height={height} isMobile={isMobile} />
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

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, depth / 2 + 0.35]} receiveShadow>
        <planeGeometry args={[width * 1.6, depth + 1.4]} />
        <meshStandardMaterial map={wood} roughness={0.78} />
      </mesh>

      <mesh position={[0, height / 2, 0]} receiveShadow>
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

      <IdealHeightMark width={width} zoneY={zoneY} zoneH={zoneH} />

      <DraggableProduct setOrbitEnabled={setOrbit} />

      <WindowLight width={width} height={height} depth={depth} />
      <Suspense fallback={null}>
        <SofaModel z={depth * 0.7} />
        <SideTableModel position={[1.42, 0, depth * 0.76]} rotationY={-0.4} />
        <PlantModel position={[1.42, 0.52, depth * 0.76]} height={0.3} rotationY={0.35} />
        <PlantModel position={[-1.48, 0, depth * 0.3]} height={0.7} rotationY={0.8} />
      </Suspense>

      {!isMobile && (
        <ContactShadows position={[0, 0.003, depth * 0.7]} opacity={0.32} scale={4.2} blur={2.4} far={1.8} />
      )}

      <OrbitControls
        ref={orbitRef}
        enabled={orbitEnabled}
        enablePan={false}
        enableDamping={!isMobile}
        dampingFactor={0.12}
        minDistance={isMobile ? 2.6 : 2.5}
        maxDistance={isMobile ? 8.5 : 10}
        minPolarAngle={Math.PI / 3.4}
        maxPolarAngle={Math.PI / 2.02}
        target={[0, Math.min(height * 0.4, 1.15), depth * 0.28]}
        autoRotate={false}
        rotateSpeed={isMobile ? 0.55 : 0.85}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
      />
    </>
  )
}

export default function Room3D() {
  const { setViewMode, product, centreHeightMm, setCentreHeightMm, ceilingHeightMm } = usePlacement()
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
  const minCentre = product.heightMm / 2 + 20
  const maxCentre = ceilingHeightMm - product.heightMm / 2 - 20

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
        camera={{ position: isMobile ? [1.65, 1.4, 4.7] : [1.9, 1.5, 5.15], fov: isMobile ? 50 : 40, near: 0.1, far: 40 }}
        gl={{ antialias: !isMobile, alpha: false, powerPreference: isMobile ? 'low-power' : 'high-performance' }}
        className="h-full w-full"
      >
        <Suspense fallback={null}>
          <RoomContents orbitEnabled={orbitEnabled} setOrbitEnabled={setOrbitEnabled} isMobile={isMobile} />
        </Suspense>
      </Canvas>
      <label className="campaign-height-rail">
        <span>Height</span>
        <input
          type="range"
          min={Math.round(minCentre)}
          max={Math.round(maxCentre)}
          step={5}
          value={Math.round(centreHeightMm)}
          aria-label="TV centre height in millimetres"
          onChange={(e) => setCentreHeightMm(Number(e.target.value))}
        />
      </label>
      <OrbitHint isMobile={isMobile} />
    </div>
  )
}

function OrbitHint({ isMobile }: { isMobile: boolean }) {
  return (
    <p className="campaign-orbit-hint pointer-events-none absolute bottom-2 right-2 z-10 sm:bottom-3 sm:right-3">
      {/* A vertical drag glyph. This was a ‹ › chevron pair, which read as
          carousel controls and invited a tap that did nothing. */}
      <span className="campaign-orbit-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v16M8 7.5 12 3.5l4 4M8 16.5l4 4 4-4" />
        </svg>
      </span>
      <span>{isMobile ? 'Drag the TV · or use the height slider' : 'Drag the TV to move it · drag the room to look around'}</span>
    </p>
  )
}
