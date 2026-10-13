// Pure geometry maths for the book. One scene unit is 10 cm.
//
// The book is described as a cross-section in the XY plane (X across the spread, Y up)
// and extruded along Z (head of the book at -Z, tail at +Z).
//
// `open` runs from 0 (closed, front cover on top) to 1 (lying open on the desk).
// `progress` is the share of the pages that sit on the left-hand side.

export interface BookDims {
  /** page width */
  W: number
  /** page height */
  H: number
  /** thickness of the whole page block */
  T: number
  /** cover board thickness */
  b: number
  /** how far the boards stick out past the pages */
  o: number
}

export const DEFAULT_DIMS: BookDims = { W: 1.3, H: 2.0, T: 0.32, b: 0.03, o: 0.035 }

/** samples along a page, from the gutter to the fore-edge */
export const SEG = 48
/** samples through the thickness of a page block */
export const LAYERS = 8

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (x: number) => {
  x = clamp01(x)
  return x * x * (3 - 2 * x)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// ---------------------------------------------------------------------------
// The case: right board, joint, spine, joint, left board as one folded strip.
// ---------------------------------------------------------------------------

/** share of the strip between the boards taken by each joint */
const JOINT = 0.22

/** How much of the half-turn the strip has made at position u (0..1) between the boards. */
function foldShare(u: number) {
  return 0.42 * smooth(u / JOINT) + 0.16 * u + 0.42 * smooth((u - (1 - JOINT)) / JOINT)
}

// Height gained per unit length of the fully folded strip, used to size the spine
// so the closed boards end up exactly one page block apart.
const FOLD_RISE = (() => {
  let sum = 0
  const n = 400
  for (let i = 0; i < n; i++) sum += Math.sin(Math.PI * foldShare((i + 0.5) / n))
  return sum / n
})()

export interface CaseLayout {
  /** length of the strip between the two boards */
  Lm: number
  /** joint length */
  g: number
  /** spine length */
  S: number
  /** x of the right board's inner edge */
  xJ: number
  /** board length from joint to fore-edge when the book lies open */
  Lb: number
  /** the same when closed: the page block sits a little further from the joint then */
  LbClosed: number
}

export function caseLayout(d: BookDims): CaseLayout {
  const Lm = (d.T + d.b) / FOLD_RISE
  const g = JOINT * Lm
  const xJ = Lm / 2
  let back = -Infinity
  for (let i = 0; i <= 8; i++) back = Math.max(back, closedSpineX(d, i / 8))
  return { Lm, g, S: Lm - 2 * g, xJ, Lb: d.W - g + d.o, LbClosed: back - xJ + d.W + d.o }
}

export interface PathSample {
  x: number
  y: number
  /** heading of the strip, radians */
  ang: number
  /** half thickness here (tapers to 0 at the rounded fore-edges) */
  h: number
  /** distance along the strip, for texture mapping */
  s: number
  /** 0..1, how close this sample is to an exposed fore-edge */
  edge: number
  /** 0..1, how much this sample sits on a joint or the spine */
  joint: number
  /** 0..1 across the front board (spine to fore-edge), or -1 elsewhere */
  front: number
}

const BOARD_SEG = 10
const MID_SEG = 44
const CAP_SEG = 5

/** Centre line of the cover strip, from the right fore-edge round to the left fore-edge. */
export function casePath(d: BookDims, open: number): PathSample[] {
  const L = { ...caseLayout(d) }
  L.Lb = lerp(L.LbClosed, L.Lb, smooth(open))
  const r = d.b / 2
  const out: PathSample[] = []
  const edgeNear = (dist: number) => 1 - smooth(dist / 0.16)

  // right board, lying on the desk and heading towards the spine
  const xEnd = L.xJ + L.Lb
  for (let k = CAP_SEG; k >= 1; k--) {
    const phi = (k / CAP_SEG) * (Math.PI / 2)
    out.push({ x: xEnd - r + r * Math.sin(phi), y: r, ang: Math.PI, h: r * Math.cos(phi), s: r - r * Math.sin(phi), edge: 1, joint: 0, front: -1 })
  }
  for (let i = 0; i <= BOARD_SEG; i++) {
    const t = i / BOARD_SEG
    const dist = r + t * (L.Lb - r)
    out.push({ x: xEnd - dist, y: r, ang: Math.PI, h: r, s: dist, edge: edgeNear(dist - r), joint: 0, front: -1 })
  }

  // joint, spine, joint: folds up and over as the book closes
  let x = L.xJ
  let y = r
  const turn = (1 - open) * Math.PI
  const ds = L.Lm / MID_SEG
  let ang = Math.PI
  for (let i = 1; i <= MID_SEG; i++) {
    const uMid = (i - 0.5) / MID_SEG
    const aMid = Math.PI - turn * foldShare(uMid)
    x += Math.cos(aMid) * ds
    y += Math.sin(aMid) * ds
    const u = i / MID_SEG
    ang = Math.PI - turn * foldShare(u)
    const jointness = Math.max(1 - Math.abs(u - JOINT / 2) / (JOINT / 2), 1 - Math.abs(u - (1 - JOINT / 2)) / (JOINT / 2), 0)
    out.push({ x, y, ang, h: r, s: L.Lb + u * L.Lm, edge: 0, joint: Math.max(jointness, 0.35), front: -1 })
  }

  // left board (the front cover)
  const cx = Math.cos(ang)
  const cy = Math.sin(ang)
  const sBase = L.Lb + L.Lm
  for (let i = 1; i <= BOARD_SEG; i++) {
    const t = i / BOARD_SEG
    const dist = t * (L.Lb - r)
    out.push({ x: x + cx * dist, y: y + cy * dist, ang, h: r, s: sBase + dist, edge: edgeNear(L.Lb - r - dist), joint: 0, front: dist / L.Lb })
  }
  for (let k = 1; k <= CAP_SEG; k++) {
    const phi = (k / CAP_SEG) * (Math.PI / 2)
    const dist = L.Lb - r + r * Math.sin(phi)
    out.push({ x: x + cx * dist, y: y + cy * dist, ang, h: r * Math.cos(phi), s: sBase + dist, edge: 1, joint: 0, front: dist / L.Lb })
  }
  return out
}

/** A 2D frame fixed to a board: origin at its joint edge, `d` towards the fore-edge, `n` towards the pages. */
export interface Frame {
  ox: number
  oy: number
  dx: number
  dy: number
  nx: number
  ny: number
}

export function boardFrames(d: BookDims, open: number): { left: Frame; right: Frame } {
  const L = caseLayout(d)
  const r = d.b / 2
  let x = L.xJ
  let y = r
  const turn = (1 - open) * Math.PI
  const ds = L.Lm / MID_SEG
  for (let i = 1; i <= MID_SEG; i++) {
    const aMid = Math.PI - turn * foldShare((i - 0.5) / MID_SEG)
    x += Math.cos(aMid) * ds
    y += Math.sin(aMid) * ds
  }
  const ang = Math.PI - turn
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  const nx = Math.sin(ang)
  const ny = -Math.cos(ang)
  return {
    right: { ox: L.xJ, oy: d.b, dx: 1, dy: 0, nx: 0, ny: 1 },
    left: { ox: x + nx * r, oy: y + ny * r, dx, dy, nx, ny },
  }
}

// ---------------------------------------------------------------------------
// Page blocks
// ---------------------------------------------------------------------------

export interface PageProfile {
  /** x, measured from the gutter */
  x: Float32Array
  /** height above the gutter point */
  y: Float32Array
  /** slope of the page at each sample, radians */
  ang: Float32Array
}

/**
 * The shape of the top page on one side of an open book: it climbs steeply out of
 * the gutter and levels off once it has gained `rise`.
 */
export function pageProfile(W: number, rise: number): PageProfile {
  const x = new Float32Array(SEG + 1)
  const y = new Float32Array(SEG + 1)
  const ang = new Float32Array(SEG + 1)
  const a0 = Math.min(1.15, Math.max(0.22, 0.3 + 3 * rise))
  const ds = W / SEG
  const gained = (k: number) => {
    let sum = 0
    for (let i = 0; i < SEG; i++) sum += Math.sin(a0 * Math.exp(-((i + 0.5) * ds) / k)) * ds
    return sum
  }
  // find the fall-off length that gives exactly the rise we need
  let lo = 1e-4
  let hi = W * 2
  for (let it = 0; it < 30; it++) {
    const mid = (lo + hi) / 2
    if (gained(mid) < rise) lo = mid
    else hi = mid
  }
  const k = (lo + hi) / 2
  for (let i = 0; i <= SEG; i++) ang[i] = a0 * Math.exp(-(i * ds) / k)
  for (let i = 1; i <= SEG; i++) {
    const a = a0 * Math.exp(-((i - 0.5) * ds) / k)
    x[i] = x[i - 1] + Math.cos(a) * ds
    y[i] = y[i - 1] + Math.sin(a) * ds
  }
  return { x, y, ang }
}

const spineCache = new WeakMap<BookDims, Float32Array>()
const SPINE_SAMPLES = 32

/** x of the inside of the closed spine, `through` being 0 at the back board and 1 at the front board. */
function closedSpineX(d: BookDims, through: number) {
  let table = spineCache.get(d)
  if (!table) {
    table = new Float32Array(SPINE_SAMPLES + 1)
    // trace the closed strip between the boards
    const Lm = (d.T + d.b) / FOLD_RISE
    const path: { x: number; y: number }[] = [{ x: Lm / 2, y: d.b / 2 }]
    const ds = Lm / MID_SEG
    for (let i = 1; i <= MID_SEG; i++) {
      const a = Math.PI - Math.PI * foldShare((i - 0.5) / MID_SEG)
      const prev = path[i - 1]
      path.push({ x: prev.x + Math.cos(a) * ds, y: prev.y + Math.sin(a) * ds })
    }
    for (let i = 0; i <= SPINE_SAMPLES; i++) {
      const y = d.b + (i / SPINE_SAMPLES) * d.T
      // the strip only climbs here, so find the two samples either side of this height
      let k = 1
      while (k < path.length - 1 && path[k].y < y) k++
      const a = path[k - 1]
      const b = path[k]
      const f = Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y || 1)))
      table[i] = a.x + (b.x - a.x) * f + d.b / 2 + 0.006
    }
    spineCache.set(d, table)
  }
  const f = Math.min(1, Math.max(0, through)) * SPINE_SAMPLES
  const i = Math.min(SPINE_SAMPLES - 1, Math.floor(f))
  return table[i] + (table[i + 1] - table[i]) * (f - i)
}

export interface BookPose {
  /** x of each board frame's origin when the book is closed */
  closedOrigin: { left: number; right: number }
  layout: CaseLayout
  frames: { left: Frame; right: Frame }
  tL: number
  tR: number
  /** x of the gutter in case coordinates when open */
  xg: number
  /** height of the gutter above the desk when open */
  yG: number
  profL: PageProfile
  profR: PageProfile
  /** how far the whole book is slid sideways so the gutter (open) or the cover (closed) is centred */
  offsetX: number
}

const MIN_SIDE = 0.012

export function bookPose(d: BookDims, open: number, progress: number): BookPose {
  const layout = caseLayout(d)
  const tL = Math.min(d.T - MIN_SIDE, Math.max(MIN_SIDE, d.T * progress))
  const tR = d.T - tL
  const lift = 0.3 * Math.min(tL, tR) + 0.012
  const xg = -layout.S / 2 + (tL / d.T) * layout.S
  const closedCentre = layout.xJ - layout.g + d.W / 2
  const closedFrames = boardFrames(d, 0)
  return {
    closedOrigin: { left: closedFrames.left.ox, right: closedFrames.right.ox },
    layout,
    frames: boardFrames(d, open),
    tL,
    tR,
    xg,
    yG: d.b + lift,
    profL: pageProfile(d.W, tL - lift),
    profR: pageProfile(d.W, tR - lift),
    offsetX: lerp(-closedCentre, -xg, smooth(open)),
  }
}

/**
 * Position of a point inside a page block, in the block's board frame.
 * `si` indexes along the page (0 = binding edge), `v` runs 0 at the board to 1 at the top page.
 */
export function blockPoint(d: BookDims, pose: BookPose, side: 'left' | 'right', open: number, si: number, v: number, out: [number, number]) {
  const t = side === 'left' ? pose.tL : pose.tR
  const prof = side === 'left' ? pose.profL : pose.profR
  const { g, S } = pose.layout
  const s = (si / SEG) * d.W
  const lift = pose.yG - d.b

  // open: bottom page lies on the board, top page follows the curved profile
  const gx = -g - (S * t) / d.T
  const ox = lerp(-g + s, gx + prof.x[si], v)
  const oy = lerp(0, lift + prof.y[si], v)

  // closed: a square block whose back follows the inside of the rounded spine
  const through = side === 'right' ? (v * pose.tR) / d.T : 1 - (v * pose.tL) / d.T
  const cx = closedSpineX(d, through) - (side === 'right' ? pose.closedOrigin.right : pose.closedOrigin.left) + s
  const cy = v * t

  const e = smooth(open)
  out[0] = lerp(cx, ox, e)
  out[1] = lerp(cy, oy, e)
}

export function toWorld(f: Frame, lx: number, ly: number, out: [number, number]) {
  out[0] = f.ox + f.dx * lx + f.nx * ly
  out[1] = f.oy + f.dy * lx + f.ny * ly
}

// ---------------------------------------------------------------------------
// The turning sheet
// ---------------------------------------------------------------------------

export const SHEET_ROWS = 14

/**
 * Fills `pos` with the turning sheet's vertices ((SEG+1) x (SHEET_ROWS+1), row-major from head to tail).
 * `turn` is 0 when the sheet lies on the right-hand pages and 1 once it has landed on the left.
 * `twist` (-1..1) lets the head or tail corner lead, as it does when a page is pulled by a corner.
 */
export function sheetPositions(d: BookDims, pose: BookPose, turn: number, twist: number, pos: Float32Array) {
  const ds = d.W / SEG
  const lift = 0.0025
  let p = 0
  for (let r = 0; r <= SHEET_ROWS; r++) {
    const zn = r / SHEET_ROWS - 0.5
    const tt = clamp01(turn + twist * Math.sin(Math.PI * turn) * zn * 0.5)
    let x = 0
    let y = pose.yG + lift
    const z = zn * d.H
    for (let i = 0; i <= SEG; i++) {
      if (i > 0) {
        // the part near the spine lags behind the free edge
        const sMid = (i - 0.5) / SEG
        const ts = Math.pow(tt, 1 + 1.3 * (1 - sMid))
        const aR = (pose.profR.ang[i - 1] + pose.profR.ang[i]) / 2
        const aL = Math.PI - (pose.profL.ang[i - 1] + pose.profL.ang[i]) / 2
        const a = lerp(aR, aL, ts)
        x += Math.cos(a) * ds
        y += Math.sin(a) * ds
      }
      pos[p++] = x
      pos[p++] = y
      pos[p++] = z
    }
  }
}
