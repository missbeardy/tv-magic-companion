import { Component, type ReactNode, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Box3, Vector3 } from 'three'
import type { Group, Mesh } from 'three'

const SOFA_URL = '/campaign/models/sofa/Sofa_01_1k.gltf'
const TARGET_WIDTH_M = 2.05

function BoxSofa({ z }: { z: number }) {
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 0.22, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[2.05, 0.44, 0.78]} />
        <meshStandardMaterial color="#6d7380" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.48, 0.4]} castShadow receiveShadow>
        <boxGeometry args={[2.05, 0.5, 0.16]} />
        <meshStandardMaterial color="#5c616c" roughness={0.88} />
      </mesh>
    </group>
  )
}

class SofaErrorBoundary extends Component<{ z: number; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) return <BoxSofa z={this.props.z} />
    return this.props.children
  }
}

function SofaGltf({ z }: { z: number }) {
  const { scene } = useGLTF(SOFA_URL)
  const model = useMemo(() => {
    const root = scene.clone(true) as Group
    root.traverse((obj) => {
      if ((obj as Mesh).isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })
    const box = new Box3().setFromObject(root)
    const size = box.getSize(new Vector3())
    const scale = TARGET_WIDTH_M / Math.max(size.x, 0.01)
    root.scale.setScalar(scale)
    box.setFromObject(root)
    const center = box.getCenter(new Vector3())
    root.position.set(-center.x, -box.min.y, -center.z)
    return root
  }, [scene])

  // TV wall is z=0. Poly Haven Sofa_01 faces +Z; yaw 180° so the seat faces the wall.
  return (
    <group position={[0, 0, z]} rotation={[0, Math.PI, 0]}>
      <primitive object={model} />
    </group>
  )
}

export function SofaModel({ z }: { z: number }) {
  return (
    <SofaErrorBoundary z={z}>
      <SofaGltf z={z} />
    </SofaErrorBoundary>
  )
}

useGLTF.preload(SOFA_URL)
