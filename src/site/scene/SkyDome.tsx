"use client";

import { useMemo } from "react";
import * as THREE from "three";

/**
 * Procedural overcast sky (no texture download): gradient + fbm cumulus.
 * Rendered at the far plane (xyww) so it never clips; also used to bake the
 * environment cube once for reflections.
 */
const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}`;

const frag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSun;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5; float s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(13.1, 7.7); a *= 0.5; }
  return s;
}
vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zen = toLinear(vec3(0.42, 0.53, 0.66));
  vec3 hor = toLinear(vec3(0.83, 0.86, 0.88));
  vec3 col = mix(hor, zen, pow(clamp(h, 0.0, 1.0), 0.55));
  if (h > 0.0) {
    vec2 p = d.xz / (h + 0.08) * 0.9;
    float n = fbm(p + vec2(3.0, 1.0));
    float cov = smoothstep(0.40, 0.72, n);
    float shade = fbm(p * 1.9 + vec2(5.2, 9.1));
    float sunLit = pow(max(dot(d, normalize(uSun)), 0.0), 3.0);
    vec3 lit = toLinear(vec3(0.96, 0.96, 0.95)) * (1.0 + 0.25 * sunLit);
    vec3 dark = toLinear(vec3(0.50, 0.53, 0.58));
    vec3 cc = mix(dark, lit, smoothstep(0.30, 0.75, shade + (n - 0.5) * 0.6));
    float fade = smoothstep(0.0, 0.18, h);
    col = mix(col, cc, cov * mix(0.55, 0.95, fade));
    col = mix(col, hor, (1.0 - fade) * 0.55);
  } else {
    col = mix(hor, toLinear(vec3(0.62, 0.64, 0.64)), clamp(-h * 4.0, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const SUN_DIR: [number, number, number] = [-0.45, 0.62, 0.64];

export function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { uSun: { value: new THREE.Vector3(...SUN_DIR) } },
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
    [],
  );
  const geo = useMemo(() => new THREE.SphereGeometry(1, 48, 24), []);
  return <mesh geometry={geo} material={material} frustumCulled={false} renderOrder={-1000} />;
}
