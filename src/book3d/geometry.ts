import * as THREE from 'three'
import { LAYERS, SEG, SHEET_ROWS, blockPoint, casePath, sheetPositions, toWorld } from './bookShape'
import type { BookDims, BookPose } from './bookShape'

const smooth = (x: number) => {
  x = Math.min(1, Math.max(0, x))
  return x * x * (3 - 2 * x)
}

function gridIndices(cols: number, rows: number, base = 0, flip = false) {
  const idx: number[] = []
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = base + r * cols + c
      const b = a + 1
      const e = a + cols
      const f = e + 1
      if (flip) idx.push(a, b, e, b, f, e)
      else idx.push(a, e, b, b, e, f)
    }
  }
  return idx
}

// ---------------------------------------------------------------------------
// Cover: a strip with rounded edges swept along the case path
// ---------------------------------------------------------------------------

interface RingPoint {
  /** offset towards the pages, as a multiple of the local half thickness */
  n: number
  z: number
  /** distance round the ring, for texture mapping */
  v: number
  /** 0..1 closeness to the head or tail edge */
  edge: number
  outer: boolean
}

function coverRing(d: BookDims): RingPoint[] {
  const r = d.b / 2
  const Zs = d.H / 2 + d.o - r
  const band = 0.16
  const pts: Omit<RingPoint, 'v'>[] = []
  const face = (n: number, zs: number[], outer: boolean) => {
    for (const z of zs) pts.push({ n, z, edge: smooth((Math.abs(z) - (Zs - band)) / band), outer })
  }
  const arc = (sign: number) => {
    for (let k = 1; k <= 5; k++) {
      const phi = (k / 6) * Math.PI
      pts.push({ n: sign * Math.cos(phi), z: sign * (Zs + r * Math.sin(phi)), edge: 1, outer: false })
    }
  }
  // inside face from the middle to the tail, round the tail edge, back along the outside
  // (tail to head), round the head edge and home again
  face(1, [0, Zs - band, Zs], false)
  arc(1)
  face(-1, [Zs, Zs - band, 0, -Zs + band, -Zs], true)
  arc(-1)
  face(1, [-Zs, -Zs + band, 0], false)

  let v = 0
  return pts.map((p, i) => {
    if (i > 0) {
      const q = pts[i - 1]
      v += Math.hypot((p.n - q.n) * r, p.z - q.z)
    }
    return { ...p, v }
  })
}

export function createCover(d: BookDims) {
  const ring = coverRing(d)
  const path0 = casePath(d, 1)
  const cols = ring.length
  const rows = path0.length
  const count = cols * rows
  const position = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  const edge = new Float32Array(count)
  const title = new Float32Array(count * 3)
  const Z = d.H / 2 + d.o

  let p = 0
  for (let i = 0; i < rows; i++) {
    const s = path0[i]
    for (let j = 0; j < cols; j++, p++) {
      const rp = ring[j]
      uv[p * 2] = s.s
      uv[p * 2 + 1] = rp.v
      const corner = s.edge * rp.edge
      edge[p] = Math.min(1, Math.max(s.edge, rp.edge, rp.outer ? s.joint * 0.5 : 0) + corner * 0.6)
      const onFront = rp.outer && s.front >= 0 && s.h > d.b * 0.49
      title[p * 3] = s.front
      title[p * 3 + 1] = 1 - (rp.z + Z) / (2 * Z)
      title[p * 3 + 2] = onFront ? 1 : 0
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1))
  geometry.setAttribute('aTitle', new THREE.BufferAttribute(title, 3))

  const fill = (open: number) => {
    const path = casePath(d, open)
    let q = 0
    for (let i = 0; i < rows; i++) {
      const s = path[i]
      const nx = Math.sin(s.ang)
      const ny = -Math.cos(s.ang)
      for (let j = 0; j < cols; j++) {
        const rp = ring[j]
        position[q++] = s.x + nx * rp.n * s.h
        position[q++] = s.y + ny * rp.n * s.h
        position[q++] = rp.z
      }
    }
    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
  }

  // pick the winding that makes the outside face outwards
  geometry.setIndex(gridIndices(cols, rows))
  fill(1)
  const probe = Math.floor(rows / 4) * cols + ring.findIndex((r) => r.outer && r.z === 0)
  if (geometry.attributes.normal.getY(probe) > 0) {
    geometry.setIndex(gridIndices(cols, rows, 0, true))
    fill(1)
  }
  return { geometry, update: fill }
}

// ---------------------------------------------------------------------------
// Page blocks
// ---------------------------------------------------------------------------

/** world units of page-edge texture per repeat */
export const EDGE_TILE = 0.25

export function createBlock(d: BookDims, side: 'left' | 'right') {
  const n = SEG + 1
  const m = LAYERS + 1

  // top page
  const topPos = new Float32Array(n * 2 * 3)
  const topUv = new Float32Array(n * 2 * 2)
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < n; i++) {
      topUv[(r * n + i) * 2] = i / SEG
      topUv[(r * n + i) * 2 + 1] = 1 - r
    }
  }
  const top = new THREE.BufferGeometry()
  top.setAttribute('position', new THREE.BufferAttribute(topPos, 3))
  top.setAttribute('uv', new THREE.BufferAttribute(topUv, 2))
  top.setIndex(gridIndices(n, 2))

  // head face, tail face, fore-edge face
  const edgeCount = n * m * 2 + m * 2
  const edgePos = new Float32Array(edgeCount * 3)
  const edgeUv = new Float32Array(edgeCount * 2)
  const edges = new THREE.BufferGeometry()
  edges.setAttribute('position', new THREE.BufferAttribute(edgePos, 3))
  edges.setAttribute('uv', new THREE.BufferAttribute(edgeUv, 2))
  edges.setIndex([...gridIndices(n, m, 0), ...gridIndices(n, m, n * m), ...gridIndices(m, 2, n * m * 2)])

  /** start of every page layer at the binding edge, for the headbands */
  const binding = new Float32Array(m * 2)

  const local: [number, number] = [0, 0]
  const world: [number, number] = [0, 0]
  let topFlipped = false

  const update = (pose: BookPose, open: number) => {
    const frame = side === 'left' ? pose.frames.left : pose.frames.right
    const t = side === 'left' ? pose.tL : pose.tR
    const zH = d.H / 2
    const at = (si: number, v: number) => {
      blockPoint(d, pose, side, open, si, v, local)
      toWorld(frame, local[0], local[1], world)
    }

    for (let i = 0; i < n; i++) {
      at(i, 1)
      for (let r = 0; r < 2; r++) {
        const k = (r * n + i) * 3
        topPos[k] = world[0]
        topPos[k + 1] = world[1]
        topPos[k + 2] = r === 0 ? -zH : zH
      }
    }

    let k = 0
    let u = 0
    for (let f = 0; f < 2; f++) {
      for (let l = 0; l < m; l++) {
        const v = l / LAYERS
        for (let i = 0; i < n; i++) {
          at(i, v)
          edgePos[k++] = world[0]
          edgePos[k++] = world[1]
          edgePos[k++] = f === 0 ? -zH : zH
          edgeUv[u++] = ((i / SEG) * d.W) / EDGE_TILE
          edgeUv[u++] = (v * t) / EDGE_TILE
        }
        if (f === 0) {
          at(0, v)
          binding[l * 2] = world[0]
          binding[l * 2 + 1] = world[1]
        }
      }
    }
    for (let r = 0; r < 2; r++) {
      for (let l = 0; l < m; l++) {
        const v = l / LAYERS
        at(SEG, v)
        edgePos[k++] = world[0]
        edgePos[k++] = world[1]
        edgePos[k++] = r === 0 ? -zH : zH
        edgeUv[u++] = (r * d.H) / EDGE_TILE
        edgeUv[u++] = (v * t) / EDGE_TILE
      }
    }

    top.attributes.position.needsUpdate = true
    edges.attributes.position.needsUpdate = true
    edges.attributes.uv.needsUpdate = true
    top.computeVertexNormals()
    edges.computeVertexNormals()
    top.computeBoundingSphere()
    edges.computeBoundingSphere()
  }

  /** Call once with the open pose so the top page faces up. */
  const orient = (pose: BookPose) => {
    update(pose, 1)
    if (!topFlipped && top.attributes.normal.getY(SEG) < 0) {
      top.setIndex(gridIndices(n, 2, 0, true))
      topFlipped = true
      top.computeVertexNormals()
    }
  }

  return { top, edges, binding, update, orient }
}

// ---------------------------------------------------------------------------
// Headbands: a small striped cord across the binding edge at head and tail
// ---------------------------------------------------------------------------

const BAND_RING = 8

export function createHeadbands(d: BookDims) {
  const pts = LAYERS * 2 + 1
  const cols = BAND_RING + 1
  const count = pts * cols * 2
  const position = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setIndex([...gridIndices(cols, pts, 0), ...gridIndices(cols, pts, pts * cols)])
  const line = new Float32Array(pts * 2)
  const radius = 0.017

  const update = (left: Float32Array, right: Float32Array) => {
    // left binding edge from the board up to the gutter, then down the right one
    for (let l = 0; l <= LAYERS; l++) {
      line[l * 2] = left[l * 2]
      line[l * 2 + 1] = left[l * 2 + 1]
    }
    for (let l = 1; l <= LAYERS; l++) {
      const src = LAYERS - l
      line[(LAYERS + l) * 2] = right[src * 2]
      line[(LAYERS + l) * 2 + 1] = right[src * 2 + 1]
    }
    let k = 0
    let u = 0
    for (let end = 0; end < 2; end++) {
      const z = (end === 0 ? -1 : 1) * (d.H / 2 - radius * 0.4)
      let dist = 0
      for (let i = 0; i < pts; i++) {
        const a = Math.max(0, i - 1)
        const b = Math.min(pts - 1, i + 1)
        let tx = line[b * 2] - line[a * 2]
        let ty = line[b * 2 + 1] - line[a * 2 + 1]
        const len = Math.hypot(tx, ty) || 1
        tx /= len
        ty /= len
        if (i > 0) dist += Math.hypot(line[i * 2] - line[(i - 1) * 2], line[i * 2 + 1] - line[(i - 1) * 2 + 1])
        for (let j = 0; j < cols; j++) {
          const th = (j / BAND_RING) * Math.PI * 2
          const c = Math.cos(th) * radius
          const s = Math.sin(th) * radius
          position[k++] = line[i * 2] - ty * c
          position[k++] = line[i * 2 + 1] + tx * c
          position[k++] = z + s
          uv[u++] = dist / 0.045
          uv[u++] = j / BAND_RING
        }
      }
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.uv.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
  }
  return { geometry, update }
}

// ---------------------------------------------------------------------------
// The turning sheet
// ---------------------------------------------------------------------------

export function createSheet(d: BookDims) {
  const cols = SEG + 1
  const rows = SHEET_ROWS + 1
  const position = new Float32Array(cols * rows * 3)
  const uv = new Float32Array(cols * rows * 2)
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      uv[(r * cols + i) * 2] = i / SEG
      uv[(r * cols + i) * 2 + 1] = 1 - r / SHEET_ROWS
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  // wound so the side that faces up while the sheet lies on the right is the front
  geometry.setIndex(gridIndices(cols, rows))

  const update = (pose: BookPose, turn: number, twist: number) => {
    sheetPositions(d, pose, turn, twist, position)
    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
  }
  return { geometry, update }
}
