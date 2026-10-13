// Downloads the CC0 texture sets and HDRI Lumen uses from Poly Haven into public/assets.
// Run with: node scripts/fetch-assets.mjs
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets')
const RES = '2k'

const textures = ['brown_leather', 'book_pattern', 'rough_linen', 'wood_table_001', 'wood_table_worn', 'hessian_230']
const maps = { Diffuse: 'albedo', nor_gl: 'normal', arm: 'arm' }
const hdris = ['wooden_lounge']

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function download(url, dest) {
  if (await exists(dest)) return
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
  console.log('saved', dest.replace(root, ''))
}

for (const name of textures) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${name}`)).json()
  for (const [key, out] of Object.entries(maps)) {
    // Some sets name their colour map col1 instead of Diffuse.
    const entry = files[key] ?? (key === 'Diffuse' ? files.col1 : undefined)
    await download(entry[RES].jpg.url, join(root, 'textures', name, `${out}.jpg`))
  }
}

for (const name of hdris) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${name}`)).json()
  await download(files.hdri['1k'].hdr.url, join(root, 'hdri', `${name}.hdr`))
}
