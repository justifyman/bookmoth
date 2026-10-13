export type Quality = 'high' | 'balanced' | 'light'

export interface QualityProfile {
  label: string
  maxDpr: number
  shadowMap: number
  shadowRadius: number
  /** height of each page's text texture in pixels */
  pageTextureHeight: number
  post: boolean
  msaa: number
  halfResAO: boolean
  dof: boolean
  /** which copies of the scanned texture sets to load */
  textures: '2k' | '1k'
}

export const QUALITY: Record<Quality, QualityProfile> = {
  high: { label: 'High', maxDpr: 2, shadowMap: 2048, shadowRadius: 5, pageTextureHeight: 2400, post: true, msaa: 4, halfResAO: false, dof: true, textures: '2k' },
  balanced: { label: 'Balanced', maxDpr: 1.5, shadowMap: 1024, shadowRadius: 4, pageTextureHeight: 1800, post: true, msaa: 2, halfResAO: true, dof: false, textures: '1k' },
  light: { label: 'Light', maxDpr: 1, shadowMap: 512, shadowRadius: 3, pageTextureHeight: 1400, post: false, msaa: 0, halfResAO: true, dof: false, textures: '1k' },
}

/** A first guess from what the browser tells us about the device. */
export function detectQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  if (cores <= 4 || memory <= 2) return 'light'
  if (mobile || cores < 8 || memory < 8) return 'balanced'
  return 'high'
}

/** The next lighter setting, or null when there is none. */
export function lighter(q: Quality): Quality | null {
  return q === 'high' ? 'balanced' : q === 'balanced' ? 'light' : null
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}
