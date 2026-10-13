// Legibility guard. Every pairing of ink and paper that Bookmoth draws goes through
// `legibleInk`, so no combination of styles can leave text too faint to read.

function channels(hex: string) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
}

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colours, from 1 (identical) to 21. */
export function contrast(a: string, b: string) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Body text should clear this comfortably; 7 is the WCAG "enhanced" level. */
export const MIN_CONTRAST = 7

/** Returns `ink`, pushed towards black or white until it reads clearly on `paper`. */
export function legibleInk(ink: string, paper: string, min = MIN_CONTRAST) {
  if (contrast(ink, paper) >= min) return ink
  const towards = luminance(paper) > 0.3 ? 0 : 255
  const [r, g, b] = channels(ink)
  for (let t = 0.1; t <= 1.001; t += 0.1) {
    const mixed = `#${[r, g, b].map((v) => Math.round(v + (towards - v) * t).toString(16).padStart(2, '0')).join('')}`
    if (contrast(mixed, paper) >= min) return mixed
  }
  return towards ? '#ffffff' : '#000000'
}

/** Colour `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number) {
  const ca = channels(a)
  const cb = channels(b)
  return `#${ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

/** Text smaller than this on screen is hard to read for long. */
export const MIN_TEXT_PX = 12.5
