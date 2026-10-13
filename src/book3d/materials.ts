import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Cover material: scanned PBR texture sets with edge wear, a stamped title and a
// cross-fade between two sets so the cover can change live.
// ---------------------------------------------------------------------------

export interface TextureSet {
  albedo: THREE.Texture
  normal: THREE.Texture
  /** ambient occlusion (R), roughness (G), metalness (B) */
  arm: THREE.Texture
}

export interface CoverLook {
  set: TextureSet
  /** texture repeats per scene unit */
  repeat: number
  /** multiplies the scanned colour */
  tint: THREE.ColorRepresentation
  /** 0 keeps the scanned colour, 1 uses only its brightness (so `tint` sets the hue) */
  gray: number
  /** how strongly edges and corners are rubbed */
  wear: number
  normalScale: number
  /** 1 for metal foil in the stamped title, 0 for a blind stamp */
  foil: number
}

export class CoverMaterial extends THREE.MeshStandardMaterial {
  private u = {
    mapB: { value: null as THREE.Texture | null },
    normalMapB: { value: null as THREE.Texture | null },
    armA: { value: null as THREE.Texture | null },
    armB: { value: null as THREE.Texture | null },
    uMix: { value: 0 },
    uRepA: { value: 1 },
    uRepB: { value: 1 },
    uTintA: { value: new THREE.Color(1, 1, 1) },
    uTintB: { value: new THREE.Color(1, 1, 1) },
    uGrayA: { value: 0 },
    uGrayB: { value: 0 },
    uWearA: { value: 1 },
    uWearB: { value: 1 },
    uNormA: { value: 1 },
    uNormB: { value: 1 },
    uFoilA: { value: 1 },
    uFoilB: { value: 1 },
    titleMap: { value: null as THREE.Texture | null },
    uTitleTexel: { value: new THREE.Vector2(1 / 832, 1 / 1280) },
    uFoilColor: { value: new THREE.Color('#d9a94a') },
    uStampDepth: { value: 2.2 },
  }
  private fading = false

  constructor(look: CoverLook, title: THREE.Texture) {
    super({ roughness: 1, metalness: 0 })
    this.map = look.set.albedo
    this.normalMap = look.set.normal
    this.applyLook('A', look)
    this.applyLook('B', look)
    this.setTitle(title)

    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.u)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aEdge;\nattribute vec3 aTitle;\nvarying float vEdge;\nvarying vec3 vTitle;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;\nvTitle = aTitle;')

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          varying float vEdge;
          varying vec3 vTitle;
          uniform sampler2D mapB, normalMapB, armA, armB, titleMap;
          uniform float uMix, uRepA, uRepB, uGrayA, uGrayB, uWearA, uWearB, uNormA, uNormB, uFoilA, uFoilB, uStampDepth;
          uniform vec3 uTintA, uTintB, uFoilColor;
          uniform vec2 uTitleTexel;
          float gStamp, gWear, gFoil;
          vec3 gArm;
          float coverHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float coverNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(coverHash(i), coverHash(i + vec2(1, 0)), f.x), mix(coverHash(i + vec2(0, 1)), coverHash(i + vec2(1, 1)), f.x), f.y);
          }`,
        )
        .replace(
          '#include <map_fragment>',
          /* glsl */ `
          vec3 cA = texture2D(map, vMapUv * uRepA).rgb;
          vec3 cB = texture2D(mapB, vMapUv * uRepB).rgb;
          const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
          cA = mix(cA, vec3(dot(cA, LUMA)), uGrayA) * uTintA;
          cB = mix(cB, vec3(dot(cB, LUMA)), uGrayB) * uTintB;
          vec3 cover = mix(cA, cB, uMix);
          gArm = mix(texture2D(armA, vMapUv * uRepA).rgb, texture2D(armB, vMapUv * uRepB).rgb, uMix);
          gFoil = mix(uFoilA, uFoilB, uMix);
          cover *= mix(1.0, gArm.r, 0.8);

          // rubbed edges and corners: the surface colour wears away to a paler, rougher layer
          float breakup = coverNoise(vMapUv * 34.0) * 0.6 + coverNoise(vMapUv * 140.0) * 0.4;
          gWear = smoothstep(0.72, 1.05, vEdge * (0.5 + 0.85 * breakup)) * mix(uWearA, uWearB, uMix);
          float lum = dot(cover, LUMA);
          vec3 worn = mix(cover, vec3(lum), 0.25) * 1.8 + 0.02;
          cover = mix(cover, worn, gWear * 0.7);

          // stamped title
          gStamp = texture2D(titleMap, vTitle.xy).r * step(0.999, vTitle.z);
          cover = mix(cover, cover * 0.62, gStamp * (1.0 - gFoil));
          cover = mix(cover, uFoilColor * (0.75 + 0.5 * breakup), gStamp * gFoil);
          diffuseColor.rgb *= cover;
          `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          /* glsl */ `
          float roughnessFactor = roughness * gArm.g;
          roughnessFactor = mix(roughnessFactor, min(1.0, roughnessFactor + 0.3), gWear);
          roughnessFactor = mix(roughnessFactor, mix(roughnessFactor * 0.75, 0.34, gFoil), gStamp);
          `,
        )
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mix(metalness, 1.0, gStamp * gFoil);')
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */ `
          vec3 nA = texture2D(normalMap, vNormalMapUv * uRepA).xyz * 2.0 - 1.0;
          vec3 nB = texture2D(normalMapB, vNormalMapUv * uRepB).xyz * 2.0 - 1.0;
          nA.xy *= uNormA;
          nB.xy *= uNormB;
          vec3 mapN = normalize(mix(nA, nB, uMix));
          // the stamp is pressed in, so its walls tilt the surface towards the letter
          float onFront = step(0.999, vTitle.z);
          vec2 e = uTitleTexel;
          float hx = texture2D(titleMap, vTitle.xy + vec2(e.x, 0.0)).r - texture2D(titleMap, vTitle.xy - vec2(e.x, 0.0)).r;
          float hy = texture2D(titleMap, vTitle.xy + vec2(0.0, e.y)).r - texture2D(titleMap, vTitle.xy - vec2(0.0, e.y)).r;
          mapN.xy *= 1.0 - 0.7 * gStamp;
          mapN.xy += vec2(hx, hy) * uStampDepth * onFront;
          normal = normalize(tbn * normalize(mapN));
          `,
        )
    }
  }

  private applyLook(slot: 'A' | 'B', look: CoverLook) {
    const u = this.u
    if (slot === 'A') {
      this.map = look.set.albedo
      this.normalMap = look.set.normal
      u.armA.value = look.set.arm
    } else {
      u.mapB.value = look.set.albedo
      u.normalMapB.value = look.set.normal
      u.armB.value = look.set.arm
    }
    u[`uRep${slot}`].value = look.repeat
    u[`uTint${slot}`].value.set(look.tint)
    u[`uGray${slot}`].value = look.gray
    u[`uWear${slot}`].value = look.wear
    u[`uNorm${slot}`].value = look.normalScale
    u[`uFoil${slot}`].value = look.foil
  }

  private current: CoverLook | null = null
  private next: CoverLook | null = null

  /** Cross-fades to a new look. */
  setLook(look: CoverLook, instant = false) {
    if (instant || !this.current) {
      this.applyLook('A', look)
      this.applyLook('B', look)
      this.u.uMix.value = 0
      this.current = look
      this.fading = false
      return
    }
    if (this.fading && this.next) {
      // settle the fade in progress before starting another
      this.applyLook('A', this.next)
      this.current = this.next
    }
    this.applyLook('B', look)
    this.next = look
    this.u.uMix.value = 0
    this.fading = true
  }

  setTitle(title: THREE.Texture) {
    this.u.titleMap.value = title
    if (title.userData.texel) this.u.uTitleTexel.value.copy(title.userData.texel)
  }

  /** Advances the cross-fade; returns true while one is still running. */
  tick(dt: number) {
    if (!this.fading || !this.next) return false
    this.u.uMix.value = Math.min(1, this.u.uMix.value + dt / 0.7)
    if (this.u.uMix.value >= 1) {
      this.applyLook('A', this.next)
      this.current = this.next
      this.u.uMix.value = 0
      this.fading = false
    }
    return true
  }
}

export function prepareSet(set: TextureSet, maxAnisotropy: number) {
  set.albedo.colorSpace = THREE.SRGBColorSpace
  for (const t of [set.albedo, set.normal, set.arm]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = maxAnisotropy
    t.needsUpdate = true
  }
  return set
}

// ---------------------------------------------------------------------------
// Page material: paper with printed ink multiplied in, a darker gutter, and (for
// the turning sheet) light passing through from behind.
// ---------------------------------------------------------------------------

export class PageMaterial extends THREE.MeshStandardMaterial {
  readonly u = {
    inkFront: { value: null as THREE.Texture | null },
    inkBack: { value: null as THREE.Texture | null },
    /** 1 when the gutter is on the right of the front side's page (a left-hand page) */
    uFlip: { value: 0 },
    uGutter: { value: 0.3 },
    uShowThrough: { value: 0 },
    uTransmit: { value: 0 },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uLightColor: { value: new THREE.Color(1, 1, 1) },
  }

  constructor(params: THREE.MeshStandardMaterialParameters, blank: THREE.Texture) {
    super(params)
    this.u.inkFront.value = blank
    this.u.inkBack.value = blank
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.u)
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          uniform sampler2D inkFront, inkBack;
          uniform float uFlip, uGutter, uShowThrough, uTransmit;
          uniform vec3 uLightDir, uLightColor;`,
        )
        .replace(
          '#include <map_fragment>',
          /* glsl */ `#include <map_fragment>
          vec2 uvF = vec2(mix(vMapUv.x, 1.0 - vMapUv.x, uFlip), vMapUv.y);
          vec2 uvB = vec2(1.0 - uvF.x, uvF.y);
          vec3 ink = gl_FrontFacing ? texture2D(inkFront, uvF).rgb : texture2D(inkBack, uvB).rgb;
          vec3 other = gl_FrontFacing ? texture2D(inkBack, uvB, 2.5).rgb : texture2D(inkFront, uvF, 2.5).rgb;
          diffuseColor.rgb *= ink;
          diffuseColor.rgb *= mix(vec3(1.0), other, uShowThrough);
          // pages sink into shadow as they dive towards the spine
          diffuseColor.rgb *= mix(1.0 - uGutter, 1.0, smoothstep(0.0, 0.2, vMapUv.x));
          `,
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          // light arriving on the far side of the sheet glows through the paper
          totalEmissiveRadiance += diffuseColor.rgb * uLightColor * uTransmit * max(dot(-normal, uLightDir), 0.0);
          `,
        )
    }
  }
}
