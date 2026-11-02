import type { Vec2 } from "./house-spec";

export const EPS = 1e-3;

export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
export const len = (a: Vec2) => Math.hypot(a[0], a[1]);
export const dist = (a: Vec2, b: Vec2) => len(sub(a, b));
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < EPS ? [0, 0] : [a[0] / l, a[1] / l];
};
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

/** Shoelace area. Positive = clockwise on plan (x right, z down). */
export function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function centroid(poly: Vec2[]): Vec2 {
  let cx = 0;
  let cz = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cz += (p[1] + q[1]) * f;
    a += f;
  }
  if (Math.abs(a) < EPS) return poly[0];
  return [cx / (3 * a), cz / (3 * a)];
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    const hit = zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Distance from p to segment ab, plus param t (0..1). */
export function pointSegment(p: Vec2, a: Vec2, b: Vec2): { d: number; t: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < EPS * EPS) return { d: dist(p, a), t: 0 };
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return { d: dist(p, lerp(a, b, t)), t };
}

export function pointInPolygonOrOnEdge(p: Vec2, poly: Vec2[], tol = 0.02): boolean {
  if (pointInPolygon(p, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    if (pointSegment(p, poly[i], poly[(i + 1) % poly.length]).d <= tol) return true;
  }
  return false;
}

/** Inward unit normal of edge k of polygon (tested, works for any winding). */
export function inwardNormal(poly: Vec2[], k: number): Vec2 {
  const a = poly[k];
  const b = poly[(k + 1) % poly.length];
  const d = norm(sub(b, a));
  const n1: Vec2 = [-d[1], d[0]];
  const mid = lerp(a, b, 0.5);
  return pointInPolygon(add(mid, scale(n1, 0.05)), poly) ? n1 : [d[1], -d[0]];
}

/** Is vertex i convex (interior angle < 180)? */
export function isConvexVertex(poly: Vec2[], i: number): boolean {
  const n = poly.length;
  const prev = poly[(i - 1 + n) % n];
  const cur = poly[i];
  const next = poly[(i + 1) % n];
  const c = cross(sub(cur, prev), sub(next, cur));
  // Positive signed area (clockwise on plan) ⇒ convex turn has positive cross.
  return signedArea(poly) > 0 ? c > 0 : c < 0;
}

/** Corners of an oriented rectangle footprint. rotY in degrees, front faces +z at 0. */
export function footprint(center: Vec2, w: number, d: number, rotYDeg: number): Vec2[] {
  const r = (rotYDeg * Math.PI) / 180;
  // local x axis after rotation about Y: (cos, -sin); local z axis: (sin, cos)
  const ax: Vec2 = [Math.cos(r), -Math.sin(r)];
  const az: Vec2 = [Math.sin(r), Math.cos(r)];
  const hw = w / 2;
  const hd = d / 2;
  return [
    add(center, add(scale(ax, -hw), scale(az, -hd))),
    add(center, add(scale(ax, hw), scale(az, -hd))),
    add(center, add(scale(ax, hw), scale(az, hd))),
    add(center, add(scale(ax, -hw), scale(az, hd))),
  ];
}

/** SAT overlap test for two convex quads. Returns penetration depth (0 = none). */
export function obbOverlap(a: Vec2[], b: Vec2[]): number {
  let minPen = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub(poly[(i + 1) % poly.length], poly[i]);
      const axis = norm([-e[1], e[0]]);
      const pa = a.map((p) => dot(p, axis));
      const pb = b.map((p) => dot(p, axis));
      const overlap = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (overlap <= 0) return 0;
      minPen = Math.min(minPen, overlap);
    }
  }
  return minPen;
}

export const round = (v: number, step = 0.001) => Math.round(v / step) * step;
export const keyOf = (p: Vec2) => `${round(p[0]).toFixed(3)},${round(p[1]).toFixed(3)}`;
