import * as THREE from "three";
import type { CompiledTower, CompiledContextBlock } from "@/domain/site-compiler";

/**
 * Procedural site materials: MeshStandardMaterial + onBeforeCompile.
 * Every material gets highlight uniforms (uHi glow, uDim fade) driven by useHighlight().
 * Surface kinds share one program each (customProgramCacheKey), uniforms differ per mesh.
 */

export type SurfaceKind = "tower" | "podium" | "context" | "filler" | "road" | "ground" | "kit";

export interface HighlightUniforms {
  uHi: { value: number };
  uDim: { value: number };
  uHiColor: { value: THREE.Color };
}

export type SiteMaterial = THREE.MeshStandardMaterial & { userData: { hl: HighlightUniforms } };

export const HIGHLIGHT_COLOR = new THREE.Color("#ffd27a");
const SKY_TINT = new THREE.Color("#b9cfe2");

const COMMON_FRAG = /* glsl */ `
uniform float uHi;
uniform float uDim;
uniform vec3 uHiColor;
uniform vec3 uSkyTint;
varying vec2 vFac;
varying vec3 vWPos;
varying vec3 vWNormal;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
/* anti-aliased line coverage: dist (m) from line centre, half width w, period of the pattern */
float lineCov(float dist, float w, float fw, float period) {
  float c = 1.0 - smoothstep(w - fw, w + fw, dist);
  float avg = clamp(2.0 * w / period, 0.0, 1.0);
  return mix(c, avg, smoothstep(w * 0.8, w * 5.0, fw));
}
/* anti-aliased box (0..1 inside) along one axis: x in metres, [a,b] edges */
float band(float x, float a, float b, float fw) {
  return smoothstep(a - fw, a + fw, x) * (1.0 - smoothstep(b - fw, b + fw, x));
}
`;

const SURFACE: Record<SurfaceKind, string> = {
  kit: `void siteSurface(inout vec3 alb, inout float rough, inout float metal, inout vec3 emis, inout float glass) {}`,

  tower: /* glsl */ `
uniform vec3 uLight; uniform vec3 uMid; uniform vec3 uGlass; uniform vec3 uMull;
uniform float uLightR; uniform float uMidR; uniform float uPanelW; uniform float uFloorH;
uniform float uHeight; uniform float uSeed; uniform vec2 uBalc; uniform float uPerim;
void siteSurface(inout vec3 alb, inout float rough, inout float metal, inout vec3 emis, inout float glass) {
  vec2 f = vFac;
  if (vWNormal.y > 0.5) { alb = vec3(0.42, 0.43, 0.43) * (0.9 + 0.2 * vnoise(f * 0.5)); rough = 0.9; metal = 0.0; glass = 0.0; return; }
  float fwx = fwidth(f.x); float fwy = fwidth(f.y);
  float col = floor(f.x / uPanelW);
  float fl = floor(f.y / uFloorH);
  float h01 = clamp(f.y / uHeight, 0.0, 1.0);
  vec2 inP = vec2(fract(f.x / uPanelW), fract(f.y / uFloorH));
  float runLen = 4.0 + floor(hash12(vec2(col, uSeed + 7.0)) * 14.0);
  float run = floor((fl + floor(hash12(vec2(col, uSeed + 3.0)) * runLen)) / runLen);
  float r = hash12(vec2(col + uSeed * 13.0, run));
  float colBias = hash12(vec2(col * 0.37, uSeed + 19.0));
  float pLight = uLightR * (colBias < 0.4 ? 2.1 : 0.45);
  float pMid = uMidR * mix(2.0, 0.35, h01);
  vec3 c; glass = 1.0;
  if (r < pLight) { c = uLight; glass = 0.0; }
  else if (r < pLight + pMid) { c = uMid; glass = 0.1; }
  else {
    float g = hash12(vec2(col, fl) + uSeed);
    c = uGlass * (0.7 + 0.42 * g);
    // a few open / dark windows
    if (g > 0.93) c *= 0.45;
  }
  float sp = hash12(vec2(col * 1.37 + uSeed, fl * 2.11));
  if (glass > 0.5 && sp < 0.045 * mix(1.8, 0.2, h01)) { c = uMid; glass = 0.1; }
  if (glass > 0.5) c *= mix(0.72, 1.0, smoothstep(0.30, 0.36, inP.y)); // spandrel / sill band
  float mx = lineCov((0.5 - abs(inP.x - 0.5)) * uPanelW, 0.05, fwx, uPanelW);
  float my = lineCov((0.5 - abs(inP.y - 0.5)) * uFloorH, 0.11, fwy, uFloorH);
  float mt = lineCov(abs(inP.y - 0.33) * uFloorH, 0.035, fwy, uFloorH) * step(0.5, glass);
  float m = max(max(mx, my), mt);
  c = mix(c, uMull, m);
  glass *= 1.0 - m;
  // recessed balcony stack
  if (uBalc.y > uBalc.x) {
    float uu = f.x; if (uu < uBalc.x) uu += uPerim;
    float inB = band(uu, uBalc.x, uBalc.y, fwx);
    if (inB > 0.0) {
      float ys = inP.y * uFloorH;
      vec3 bc = vec3(0.10, 0.11, 0.12);
      float slab = band(ys, -0.1, 0.32, fwy) + band(ys, uFloorH - 0.05, uFloorH + 0.1, fwy);
      float rail = band(ys, 0.32, 1.1, fwy);
      bc = mix(bc, vec3(0.42, 0.47, 0.5), rail * 0.55);
      bc = mix(bc, uMull, max(slab, band(ys, 1.04, 1.12, fwy)));
      float fin = max(band(uu, uBalc.x, uBalc.x + 0.35, fwx), band(uu, uBalc.y - 0.35, uBalc.y, fwx));
      bc = mix(bc, uMull * 0.95, fin);
      c = mix(c, bc, inB);
      glass *= 1.0 - inB;
    }
  }
  // crown / parapet
  float crown = smoothstep(uHeight - 2.45, uHeight - 2.35, f.y);
  c = mix(c, mix(uMull, uLight, band(f.y, uHeight - 1.9, uHeight - 1.3, fwy)), crown);
  glass *= 1.0 - crown;
  alb = c;
  rough = mix(0.5, 0.06, glass);
  metal = mix(0.0, 0.8, glass);
}`,

  podium: /* glsl */ `
uniform vec3 uBase; uniform float uRetailH; uniform float uHeight;
void siteSurface(inout vec3 alb, inout float rough, inout float metal, inout vec3 emis, inout float glass) {
  vec2 f = vFac;
  float fwx = fwidth(f.x); float fwy = fwidth(f.y);
  if (vWNormal.y > 0.5) {
    float tile = max(lineCov(abs(fract(f.x / 1.2 + 0.5) - 0.5) * 1.2, 0.02, fwidth(f.x), 1.2), lineCov(abs(fract(f.y / 1.2 + 0.5) - 0.5) * 1.2, 0.02, fwidth(f.y), 1.2));
    alb = vec3(0.56, 0.54, 0.5) * (0.92 + 0.12 * vnoise(f * 0.3)) * (1.0 - tile * 0.25);
    rough = 0.85; metal = 0.0; glass = 0.0; return;
  }
  float y = f.y;
  vec3 c = uBase; glass = 0.0;
  if (y < uRetailH) {
    float bay = 8.0;
    float bx = mod(f.x, bay);
    float colm = 1.0 - band(bx, 0.9, bay, fwx);
    float bayId = floor(f.x / bay);
    vec3 g = vec3(0.05, 0.065, 0.075);
    float mul = lineCov(abs(fract(f.x / 2.0 + 0.5) - 0.5) * 2.0, 0.04, fwx, 2.0);
    float lit = hash12(vec2(bayId, 3.0));
    emis += vec3(1.0, 0.78, 0.5) * (0.06 + 0.22 * lit) * band(y, 0.5, uRetailH - 1.0, fwy) * (1.0 - mul);
    g = mix(g, vec3(0.5), mul);
    float kerb = 1.0 - smoothstep(0.3 - fwy, 0.3 + fwy, y);
    c = mix(g, uBase * 0.85, kerb);
    glass = (1.0 - kerb) * (1.0 - mul);
    c = mix(c, uBase, colm);
    glass *= 1.0 - colm;
    emis *= 1.0 - colm;
    // soffit shadow under the fascia
    c *= mix(1.0, 0.75, band(y, uRetailH - 0.6, uRetailH, fwy));
  } else if (y < uRetailH + 1.4) {
    c = uBase * 1.02;
  } else if (y < uHeight - 1.1) {
    float lvl = 2.6;
    float ly = mod(y - uRetailH - 1.4, lvl);
    float cellW = 5.0;
    float cx = mod(f.x, cellW);
    float open = band(ly, 0.55, 2.15, fwy) * band(cx, 0.45, cellW - 0.45, fwx);
    float fins = lineCov(abs(fract(f.x / 0.42 + 0.5) - 0.5) * 0.42, 0.07, fwx, 0.42);
    vec3 louv = mix(vec3(0.12, 0.12, 0.13), uBase * 0.82, fins);
    c = mix(uBase, louv, open);
  } else {
    c = uBase * 0.97;
  }
  alb = c;
  rough = mix(0.8, 0.08, glass);
  metal = mix(0.0, 0.5, glass);
}`,

  context: /* glsl */ `
uniform vec3 uBase; uniform vec3 uAccent; uniform float uKind;
void siteSurface(inout vec3 alb, inout float rough, inout float metal, inout vec3 emis, inout float glass) {
  vec2 f = vFac;
  float fwx = fwidth(f.x); float fwy = fwidth(f.y);
  glass = 0.0;
  if (vWNormal.y > 0.5) { alb = vec3(0.4, 0.4, 0.39); rough = 0.9; metal = 0.0; return; }
  vec3 c = uBase;
  if (uKind < 0.5) {
    float fh = 2.9; float cw = 3.4;
    float col = floor(f.x / cw);
    vec2 inP = vec2(mod(f.x, cw), mod(f.y, fh));
    float win = band(inP.x, 0.7, 2.7, fwx) * band(inP.y, 0.85, 2.35, fwy) * step(4.0, f.y);
    float acc = step(abs(mod(col, 5.0) - 2.0), 0.5);
    c = mix(uBase, uAccent, acc * 0.85);
    float rail = band(inP.y, 0.0, 0.18, fwy) * acc;
    c = mix(c, vec3(0.92), rail);
    float g = hash12(vec2(col, floor(f.y / fh)));
    c = mix(c, vec3(0.07, 0.08, 0.09) * (0.7 + 0.6 * g), win);
    glass = win;
  } else {
    float fh = 3.8;
    float ly = mod(f.y, fh);
    float rib = band(ly, 1.0, 3.2, fwy) * step(4.0, f.y);
    float mul = lineCov(abs(fract(f.x / 1.5 + 0.5) - 0.5) * 1.5, 0.04, fwx, 1.5);
    vec3 g = mix(vec3(0.16, 0.19, 0.22), vec3(0.55), mul);
    c = mix(uBase, g, rib);
    glass = rib * (1.0 - mul);
  }
  alb = c;
  rough = mix(0.85, 0.1, glass);
  metal = mix(0.0, 0.5, glass);
}`,

  filler: /* glsl */ `
void siteSurface(inout vec3 alb, inout float rough, inout float metal, inout vec3 emis, inout float glass) {
  glass = 0.0;
  if (vWNormal.y > 0.5) { alb *= 0.8; rough = 0.95; return; }
  float y = vWPos.y;
  float s = mod(y, 3.2);
  float fw = fwidth(y);
  float win = band(s, 1.0, 2.5, fw) * step(3.5, y);
  alb = mix(alb, alb * 0.38, win);
  glass = win * 0.6;
  rough = mix(0.9, 0.25, glass);
  metal = mix(0.0, 0.3, glass);
}`,

  road: /* glsl */ `
uniform float uRoadW; uniform float uLanes;
void siteSurface(inout vec3 alb, inout float rough, inout float metal, inout vec3 emis, inout float glass) {
  vec2 f = vFac;
  float fwx = fwidth(f.x); float fwy = fwidth(f.y);
  float a = abs(f.y);
  float hw = uRoadW * 0.5;
  glass = 0.0; metal = 0.0;
  if (a > hw) {
    float j = max(lineCov(abs(fract(f.x / 1.5 + 0.5) - 0.5) * 1.5, 0.015, fwx, 1.5), 0.0);
    alb = vec3(0.42, 0.41, 0.39) * (1.0 - 0.15 * j);
    alb = mix(alb, vec3(0.62), band(a, hw, hw + 0.3, fwy));
    rough = 0.9;
    emis += uHiColor * uHi * band(a, hw - 0.1, hw + 0.4, fwy) * 1.2;
    return;
  }
  float n = vnoise(f * vec2(0.6, 1.2)) * 0.5 + vnoise(f * 3.1) * 0.5;
  vec3 c = vec3(0.065, 0.067, 0.07) * (0.85 + 0.3 * n);
  float laneW = uRoadW / uLanes;
  float lines = 0.0;
  for (int k = 1; k < 8; k++) {
    if (float(k) >= uLanes) break;
    float off = -hw + float(k) * laneW;
    bool centre = abs(off) < 0.01;
    float d = abs(f.y - off);
    float dash = centre ? 1.0 : band(mod(f.x, 9.0), 0.0, 4.5, fwx);
    float w = centre ? 0.09 : 0.07;
    float cov = centre ? max(lineCov(abs(d - 0.18), w, fwy, laneW), 0.0) : lineCov(d, w, fwy, laneW);
    lines = max(lines, cov * dash);
  }
  lines = max(lines, lineCov(abs(a - (hw - 0.45)), 0.08, fwy, uRoadW));
  c = mix(c, vec3(0.75), lines);
  alb = c;
  rough = 0.92;
  emis += uHiColor * uHi * band(a, hw - 0.6, hw, fwy) * 1.5;
}`,

  ground: /* glsl */ `
void siteSurface(inout vec3 alb, inout float rough, inout float metal, inout vec3 emis, inout float glass) {
  vec2 p = vWPos.xz;
  float n = vnoise(p * 0.02) * 0.6 + vnoise(p * 0.11) * 0.4;
  vec3 grass = mix(vec3(0.11, 0.14, 0.07), vec3(0.17, 0.19, 0.11), n);
  float dist = length(p);
  vec3 urban = vec3(0.2, 0.2, 0.19) * (0.85 + 0.3 * n);
  alb = mix(grass, urban, smoothstep(160.0, 380.0, dist) * 0.75);
  rough = 0.95; metal = 0.0; glass = 0.0;
}`,
};

function patch(kind: SurfaceKind, hl: HighlightUniforms, extra: Record<string, { value: unknown }>) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, extra, hl, { uSkyTint: { value: SKY_TINT } });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec2 aFac;
varying vec2 vFac;
varying vec3 vWPos;
varying vec3 vWNormal;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vFac = aFac;
{
  vec4 sp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  sp = instanceMatrix * sp;
  #endif
  sp = modelMatrix * sp;
  vWPos = sp.xyz;
  vWNormal = normalize(mat3(modelMatrix) * objectNormal);
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${COMMON_FRAG}\n${SURFACE[kind]}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 sAlb = diffuseColor.rgb; float sRough = roughness; float sMetal = metalness; vec3 sEmis = vec3(0.0); float sGlass = 0.0;
siteSurface(sAlb, sRough, sMetal, sEmis, sGlass);
diffuseColor.rgb = sAlb;`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = sRough;")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = sMetal;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += sEmis;")
      .replace(
        "#include <opaque_fragment>",
        `{
  float sNdV = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
  float sFr = pow(1.0 - sNdV, 3.0);
  outgoingLight += uSkyTint * sFr * sGlass * 0.22;
  float sLum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  outgoingLight = mix(outgoingLight, vec3(sLum) * 0.8, uDim * 0.55);
  outgoingLight += uHiColor * uHi * (0.035 + sFr * 0.5 * (1.0 - smoothstep(0.5, 0.9, vWNormal.y)));
}
#include <opaque_fragment>`,
      );
  };
}

function makeHl(): HighlightUniforms {
  return { uHi: { value: 0 }, uDim: { value: 0 }, uHiColor: { value: HIGHLIGHT_COLOR.clone() } };
}

export function siteMaterial(kind: SurfaceKind, params: THREE.MeshStandardMaterialParameters = {}, extra: Record<string, { value: unknown }> = {}): SiteMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...params }) as SiteMaterial;
  const hl = makeHl();
  m.userData.hl = hl;
  m.onBeforeCompile = patch(kind, hl, extra);
  m.customProgramCacheKey = () => `site-${kind}`;
  return m;
}

const c = (hex: string) => new THREE.Color(hex);

export function towerMaterial(t: CompiledTower): SiteMaterial {
  return siteMaterial(
    "tower",
    {},
    {
      uLight: { value: c(t.palette.light) },
      uMid: { value: c(t.palette.mid) },
      uGlass: { value: c(t.palette.glass) },
      uMull: { value: c(t.palette.mullion) },
      uLightR: { value: t.palette.lightRatio },
      uMidR: { value: t.palette.midRatio },
      uPanelW: { value: t.panelWidth },
      uFloorH: { value: t.floorHeight },
      uHeight: { value: t.height },
      uSeed: { value: t.seed },
      uBalc: { value: new THREE.Vector2(...(t.balconyU ?? [0, 0])) },
      uPerim: { value: t.perimeter },
    },
  );
}

export function podiumMaterial(color: string, retailH: number, height: number): SiteMaterial {
  return siteMaterial("podium", {}, { uBase: { value: c(color) }, uRetailH: { value: retailH }, uHeight: { value: height } });
}

export function contextMaterial(b: CompiledContextBlock): SiteMaterial {
  return siteMaterial("context", {}, { uBase: { value: c(b.color) }, uAccent: { value: c(b.accent) }, uKind: { value: b.kind === "office" ? 1 : 0 } });
}
