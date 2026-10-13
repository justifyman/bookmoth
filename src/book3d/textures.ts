import * as THREE from 'three'
import { PAPER } from './paper'
import type { PaperStyle } from './paper'

// Textures that are drawn in the browser instead of downloaded: paper, page edges,
// headbands and the stamped cover title.

export { PAPER } from './paper'
export type { PaperLook, PaperStyle } from './paper'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Soft cloudy grey noise, drawn by scaling up a tiny random image. */
function clouds(w: number, h: number, cells: number, rand: () => number) {
  const small = canvas(cells, Math.max(2, Math.round((cells * h) / w)))
  const sctx = small.getContext('2d')!
  const img = sctx.createImageData(small.width, small.height)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.round(rand() * 255)
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  sctx.putImageData(img, 0, 0)
  const out = canvas(w, h)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small, 0, 0, w, h)
  return out
}

function finish(c: HTMLCanvasElement, color: boolean, repeat = false) {
  const t = new THREE.CanvasTexture(c)
  if (color) t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

export function makePaper(style: PaperStyle, width = 832) {
  const look = PAPER[style]
  const w = width
  const h = Math.round(width / 0.65)
  const rand = rng(style.length * 7919 + 13)
  const c = canvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = look.base
  ctx.fillRect(0, 0, w, h)

  // uneven tone
  if (look.blotch > 0) {
    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = 0.5 * look.blotch
    ctx.drawImage(clouds(w, h, 7, rand), 0, 0)
    ctx.globalAlpha = 0.35 * look.blotch
    ctx.drawImage(clouds(w, h, 28, rand), 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  // fibres
  const fibreCount = Math.round(2600 * look.fibres)
  ctx.lineCap = 'round'
  for (let i = 0; i < fibreCount; i++) {
    const x = rand() * w
    const y = rand() * h
    const len = (6 + rand() * 22) * (w / 832)
    const a = rand() * Math.PI
    const bend = (rand() - 0.5) * len * 0.6
    ctx.strokeStyle = rand() < 0.6 ? `rgba(90,60,25,${0.03 + rand() * 0.06})` : `rgba(255,250,235,${0.05 + rand() * 0.08})`
    ctx.lineWidth = 0.5 + rand() * 0.8
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + (Math.cos(a) * len) / 2 - Math.sin(a) * bend, y + (Math.sin(a) * len) / 2 + Math.cos(a) * bend, x + Math.cos(a) * len, y + Math.sin(a) * len)
    ctx.stroke()
  }

  // foxing: small rusty spots
  const spots = Math.round(70 * look.foxing)
  for (let i = 0; i < spots; i++) {
    const x = rand() * w
    const y = rand() * h
    const r = (1.5 + rand() ** 3 * 16) * (w / 832)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const alpha = 0.08 + rand() * 0.16
    g.addColorStop(0, `rgba(140,85,30,${alpha})`)
    g.addColorStop(0.6, `rgba(140,85,30,${alpha * 0.5})`)
    g.addColorStop(1, 'rgba(140,85,30,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  // darkening towards the three outer edges (the gutter side is x = 0)
  if (look.edgeBurn > 0) {
    const depth = w * 0.16
    const burn = (x0: number, y0: number, x1: number, y1: number) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1)
      g.addColorStop(0, look.burnColor)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.5 * look.edgeBurn
    burn(w, 0, w - depth, 0)
    burn(0, 0, 0, depth)
    burn(0, h, 0, h - depth)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }

  // fine grain, shared with the bump map
  const bump = canvas(w, h)
  const bctx = bump.getContext('2d')!
  bctx.fillStyle = '#808080'
  bctx.fillRect(0, 0, w, h)
  bctx.globalAlpha = 0.5
  bctx.drawImage(clouds(w, h, 90, rand), 0, 0)
  bctx.globalAlpha = 1
  const img = ctx.getImageData(0, 0, w, h)
  const bimg = bctx.getImageData(0, 0, w, h)
  const amp = 5 + 6 * look.fibres
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amp
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
    const b = bimg.data[i] + (rand() - 0.5) * 60
    bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = b
  }
  ctx.putImageData(img, 0, 0)
  bctx.putImageData(bimg, 0, 0)

  return { map: finish(c, true), bump: finish(bump, false), look }
}

/** The cut edges of the page block: hundreds of fine, slightly uneven lines. */
export function makePageEdges(style: PaperStyle) {
  const look = PAPER[style]
  const w = 256
  const h = 256
  const rand = rng(style.length * 104729 + 7)
  const c = canvas(w, h)
  const ctx = c.getContext('2d')!
  const light = new THREE.Color(look.edgeLight)
  const dark = new THREE.Color(look.edgeDark)
  const col = new THREE.Color()
  for (let y = 0; y < h; y++) {
    let t = rand() ** 2 * 0.55
    if (rand() < 0.04) t = 0.7 + rand() * 0.3 // a gap between gatherings
    col.copy(light).lerp(dark, t)
    ctx.fillStyle = `#${col.getHexString()}`
    ctx.fillRect(0, y, w, 1)
    // a line does not keep one tone along its whole length
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${rand() * 0.07})`
      ctx.fillRect(x, y, 32, 1)
    }
  }
  const map = finish(c, true, true)
  const bump = finish(c, false, true)
  return { map, bump }
}

export function makeHeadband(a = '#7b2320', b = '#e6d9ba') {
  const c = canvas(64, 32)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = a
  ctx.fillRect(0, 0, 32, 32)
  ctx.fillStyle = b
  ctx.fillRect(32, 0, 32, 32)
  // each stripe is a wrapped thread: darker where threads meet
  for (const x0 of [0, 32]) {
    const g = ctx.createLinearGradient(x0, 0, x0 + 32, 0)
    g.addColorStop(0, 'rgba(0,0,0,0.45)')
    g.addColorStop(0.5, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = g
    ctx.fillRect(x0, 0, 32, 32)
  }
  return finish(c, true, true)
}

function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Height map for the stamped front cover: white where the die pressed into the cover.
 * Slightly blurred so the pressed edges slope instead of dropping off a cliff.
 */
export function makeTitleStamp(title: string, author: string, font = 'EB Garamond') {
  const w = 832
  const h = 1280
  const c = canvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.filter = 'blur(1.2px)'
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'

  // double rule frame
  ctx.lineWidth = 7
  ctx.strokeRect(70, 70, w - 140, h - 140)
  ctx.lineWidth = 2.5
  ctx.strokeRect(92, 92, w - 184, h - 184)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  let size = 96
  let lines: string[] = []
  for (; size >= 44; size -= 6) {
    ctx.font = `500 ${size}px "${font}", Georgia, serif`
    lines = wrapWords(ctx, title.toUpperCase(), w - 300)
    if (lines.length <= 4) break
  }
  ctx.letterSpacing = '4px'
  const lh = size * 1.22
  let y = h * 0.3 - ((lines.length - 1) * lh) / 2
  for (const line of lines) {
    ctx.fillText(line, w / 2, y)
    y += lh
  }

  // small ornament
  const oy = y + 30
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(w / 2 - 120, oy)
  ctx.lineTo(w / 2 - 22, oy)
  ctx.moveTo(w / 2 + 22, oy)
  ctx.lineTo(w / 2 + 120, oy)
  ctx.stroke()
  ctx.save()
  ctx.translate(w / 2, oy)
  ctx.rotate(Math.PI / 4)
  ctx.fillRect(-9, -9, 18, 18)
  ctx.restore()

  ctx.letterSpacing = '6px'
  ctx.font = `400 46px "${font}", Georgia, serif`
  ctx.fillText(author.toUpperCase(), w / 2, h - 200)

  const t = finish(c, false)
  t.userData.texel = new THREE.Vector2(1.5 / w, 1.5 / h)
  return t
}
