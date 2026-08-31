import { useGLTF } from '@react-three/drei'
import { GltfProp } from './GltfProp'

const TABLE_URL = '/campaign/models/table/side_table_01_1k.gltf'
const PLANT_URL = '/campaign/models/plant/potted_plant_04_1k.gltf'

const GROUND = ['ground']

export function SideTableModel({
  position,
  rotationY = 0,
}: {
  position: [number, number, number]
  rotationY?: number
}) {
  return <GltfProp url={TABLE_URL} position={position} rotation={[0, rotationY, 0]} target={0.52} axis="y" />
}

export function PlantModel({
  position,
  height = 0.52,
  rotationY = 0,
}: {
  position: [number, number, number]
  height?: number
  rotationY?: number
}) {
  return (
    <GltfProp
      url={PLANT_URL}
      position={position}
      rotation={[0, rotationY, 0]}
      target={height}
      axis="y"
      hideNameIncludes={GROUND}
    />
  )
}

useGLTF.preload(TABLE_URL)
useGLTF.preload(PLANT_URL)
