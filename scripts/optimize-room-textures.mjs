/**
 * Shrinks the /visualise 3D room's glTF textures.
 *
 * The room shipped 3.00 MB of raw Poly Haven 1k JPEGs, 1.83 MB of it a single
 * decorative pot plant that renders at roughly 40x60 CSS pixels on a phone.
 *
 * Two passes:
 *   1. Every texture down to 512px, mozjpeg q72, written in place so the .gltf
 *      URIs stay valid.
 *   2. The plant loses its normal and metallic-roughness maps entirely — those
 *      two files were 1.27 MB on their own, and nobody inspects a prop's
 *      microsurface at that size. The material bindings and orphaned image
 *      entries come out of the .gltf so three.js does not request them.
 *
 * Idempotent: pass 1 skips anything already at or under the target width, and
 * pass 2 is a no-op once the bindings are gone. Sources are CC0 and
 * re-downloadable — see the LICENSE.txt in each model folder.
 *
 * Usage: node scripts/optimize-room-textures.mjs
 */
import { readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modelsDir = join(root, 'public/campaign/models')
const MAX_EDGE = 512
const QUALITY = 72

/** Maps whose only job is surface detail the phone render never resolves. */
const PLANT_GLTF = join(modelsDir, 'plant/potted_plant_04_1k.gltf')
const PLANT_DROP = ['potted_plant_04_nor_gl', 'potted_plant_04_rough']

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`

async function findTextures(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await findTextures(full)))
    else if (/\.(jpe?g|png)$/i.test(entry.name)) found.push(full)
  }
  return found
}

/**
 * Removes the named images from a glTF, unbinds any material that referenced
 * them, and reindexes what is left. Returns the files that are now unreferenced.
 */
function stripGltfImages(gltfPath, imageNames) {
  const gltf = JSON.parse(readFileSync(gltfPath, 'utf8'))
  const doomedImages = new Set(
    gltf.images.map((img, i) => [img, i]).filter(([img]) => imageNames.includes(img.name)).map(([, i]) => i)
  )
  if (doomedImages.size === 0) return []

  const orphanedFiles = gltf.images.filter((_, i) => doomedImages.has(i)).map((img) => img.uri)

  // A texture is doomed if its source image is.
  const doomedTextures = new Set(
    gltf.textures.map((tex, i) => [tex, i]).filter(([tex]) => doomedImages.has(tex.source)).map(([, i]) => i)
  )

  const keptTextures = gltf.textures.filter((_, i) => !doomedTextures.has(i))
  const keptImages = gltf.images.filter((_, i) => !doomedImages.has(i))

  const imageRemap = new Map()
  gltf.images.forEach((img, i) => {
    if (!doomedImages.has(i)) imageRemap.set(i, keptImages.indexOf(img))
  })
  const textureRemap = new Map()
  gltf.textures.forEach((tex, i) => {
    if (!doomedTextures.has(i)) textureRemap.set(i, keptTextures.indexOf(tex))
  })

  keptTextures.forEach((tex) => {
    tex.source = imageRemap.get(tex.source)
  })

  for (const material of gltf.materials ?? []) {
    const pbr = material.pbrMetallicRoughness ?? {}
    for (const [holder, key] of [
      [material, 'normalTexture'],
      [material, 'occlusionTexture'],
      [material, 'emissiveTexture'],
      [pbr, 'baseColorTexture'],
      [pbr, 'metallicRoughnessTexture'],
    ]) {
      const ref = holder?.[key]
      if (!ref) continue
      if (doomedTextures.has(ref.index)) delete holder[key]
      else ref.index = textureRemap.get(ref.index)
    }
    // Without an MR map the default roughness is 1.0, which reads flat. Pin a
    // value that keeps the foliage looking like foliage.
    if (!pbr.metallicRoughnessTexture && pbr.roughnessFactor === undefined) {
      pbr.roughnessFactor = 0.85
    }
  }

  gltf.images = keptImages
  gltf.textures = keptTextures
  writeFileSync(gltfPath, `${JSON.stringify(gltf, null, 4)}\n`)
  return orphanedFiles
}

async function main() {
  if (!existsSync(modelsDir)) {
    console.error(`optimize-room-textures: ${modelsDir} not found`)
    process.exit(1)
  }

  let before = 0
  let after = 0

  // Pass 2 first, so pass 1 does not waste work re-encoding files about to go.
  const orphans = stripGltfImages(PLANT_GLTF, PLANT_DROP)
  for (const uri of orphans) {
    const file = join(dirname(PLANT_GLTF), uri)
    if (!existsSync(file)) continue
    const size = statSync(file).size
    before += size
    rmSync(file)
    console.log(`  dropped  ${relative(root, file)}  (${kb(size)})`)
  }

  for (const file of await findTextures(modelsDir)) {
    // Read to a buffer rather than handing sharp the path: on Windows sharp
    // keeps the source open, and writing back to it fails with UNKNOWN.
    const source = readFileSync(file)
    const original = source.length
    const meta = await sharp(source).metadata()
    if (Math.max(meta.width ?? 0, meta.height ?? 0) <= MAX_EDGE) {
      before += original
      after += original
      continue
    }
    const buffer = await sharp(source)
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer()
    writeFileSync(file, buffer)
    before += original
    after += buffer.length
    console.log(`  resized  ${relative(root, file)}  ${kb(original)} -> ${kb(buffer.length)}`)
  }

  console.log(`\nTextures: ${kb(before)} -> ${kb(after)}`)
}

await main()
