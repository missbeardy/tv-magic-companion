import { Component, type ReactNode, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Box3, Vector3 } from 'three'
import type { Group, Mesh, Object3D } from 'three'

type Axis = 'x' | 'y' | 'z' | 'max'

const EMPTY: string[] = []

function scaleFromSize(size: Vector3, axis: Axis, target: number) {
  if (axis === 'x') return target / Math.max(size.x, 0.01)
  if (axis === 'y') return target / Math.max(size.y, 0.01)
  if (axis === 'z') return target / Math.max(size.z, 0.01)
  return target / Math.max(size.x, size.y, size.z, 0.01)
}

function hideMatching(root: Object3D, needles: string[]) {
  if (needles.length === 0) return
  root.traverse((obj) => {
    const name = obj.name.toLowerCase()
    if (needles.some((n) => name.includes(n))) obj.visible = false
  })
}

function GltfScene({
  url,
  target,
  axis,
  hideNameIncludes,
}: {
  url: string
  target: number
  axis: Axis
  hideNameIncludes: string[]
}) {
  const { scene } = useGLTF(url)
  const root = useMemo(() => {
    const cloned = scene.clone(true) as Group
    hideMatching(cloned, hideNameIncludes)
    cloned.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })
    const box = new Box3().setFromObject(cloned)
    const size = box.getSize(new Vector3())
    cloned.scale.setScalar(scaleFromSize(size, axis, target))
    box.setFromObject(cloned)
    const center = box.getCenter(new Vector3())
    cloned.position.set(-center.x, -box.min.y, -center.z)
    return cloned
  }, [axis, hideNameIncludes, scene, target])
  return <primitive object={root} />
}

class SilentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}

export function GltfProp({
  url,
  position,
  rotation = [0, 0, 0],
  target,
  axis = 'y',
  hideNameIncludes = EMPTY,
}: {
  url: string
  position: [number, number, number]
  rotation?: [number, number, number]
  target: number
  axis?: Axis
  hideNameIncludes?: string[]
}) {
  return (
    <group position={position} rotation={rotation}>
      <SilentBoundary>
        <GltfScene url={url} target={target} axis={axis} hideNameIncludes={hideNameIncludes} />
      </SilentBoundary>
    </group>
  )
}
