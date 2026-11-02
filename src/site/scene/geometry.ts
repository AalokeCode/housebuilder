import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { V2 } from "@/domain/site-compiler";

/**
 * Geometry builders for the site scene. All facade geometry carries an `aFac`
 * attribute in metres (u = arc length along the outline, v = height above base;
 * roofs get world x/z) so shaders can draw panel grids procedurally.
 */

const SMOOTH_COS = Math.cos((38 * Math.PI) / 180);

/** Vertical prism (walls + optional roof cap) from an oriented outline. */
export function prismGeometry(outline: V2[], baseY: number, height: number, cap = true): THREE.BufferGeometry {
  const n = outline.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const fac: number[] = [];
  const idx: number[] = [];

  // per-edge outward normals
  const en: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const l = Math.hypot(ex, ez) || 1;
    en.push([-ez / l, ex / l]);
  }
  /** normal to use at vertex `v` for edge `e` (smooth across shallow corners) */
  const vn = (v: number, e: number): V2 => {
    const prev = en[(v - 1 + n) % n];
    const next = en[v % n];
    const own = en[e];
    if (prev[0] * next[0] + prev[1] * next[1] < SMOOTH_COS) return own;
    const x = prev[0] + next[0];
    const z = prev[1] + next[1];
    const l = Math.hypot(x, z) || 1;
    return [x / l, z / l];
  };

  let u = 0;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const na = vn(i, i);
    const nb = vn((i + 1) % n, i);
    const o = pos.length / 3;
    // b0, b1, t1, t0
    pos.push(a[0], baseY, a[1], b[0], baseY, b[1], b[0], baseY + height, b[1], a[0], baseY + height, a[1]);
    nor.push(na[0], 0, na[1], nb[0], 0, nb[1], nb[0], 0, nb[1], na[0], 0, na[1]);
    fac.push(u, 0, u + len, 0, u + len, height, u, height);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    u += len;
  }

  if (cap) {
    const contour = outline.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const o = pos.length / 3;
    const y = baseY + height;
    for (const [x, z] of outline) {
      pos.push(x, y, z);
      nor.push(0, 1, 0);
      fac.push(x, z);
    }
    for (const [i0, i1, i2] of tris) {
      // ensure upward winding
      const p0 = outline[i0];
      const p1 = outline[i1];
      const p2 = outline[i2];
      const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
      if (cross < 0) idx.push(o + i0, o + i1, o + i2);
      else idx.push(o + i0, o + i2, o + i1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("aFac", new THREE.Float32BufferAttribute(fac, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Flat polygon at height y (upward facing) with aFac = world x/z. */
export function flatPolygon(poly: V2[], y: number): THREE.BufferGeometry {
  const contour = poly.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos: number[] = [];
  const fac: number[] = [];
  for (const [x, z] of poly) {
    pos.push(x, y, z);
    fac.push(x, z);
  }
  const idx: number[] = [];
  for (const [i0, i1, i2] of tris) {
    const p0 = poly[i0];
    const p1 = poly[i1];
    const p2 = poly[i2];
    const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
    if (cross < 0) idx.push(i0, i1, i2);
    else idx.push(i0, i2, i1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aFac", new THREE.Float32BufferAttribute(fac, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Ribbon along a polyline (road). aFac = (distance along, signed offset across). */
export function ribbonGeometry(path: V2[], halfWidth: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const fac: number[] = [];
  const idx: number[] = [];
  let s = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    if (i > 0) s += Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]);
    pos.push(p[0] + nx * halfWidth, y, p[1] + nz * halfWidth, p[0] - nx * halfWidth, y, p[1] - nz * halfWidth);
    fac.push(s, halfWidth, s, -halfWidth);
    if (i > 0) {
      const o = i * 2;
      idx.push(o - 2, o - 1, o, o - 1, o + 1, o);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aFac", new THREE.Float32BufferAttribute(fac, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // force up-facing normals (winding may vary with path direction)
  const nAttr = g.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < nAttr.count; i++) nAttr.setXYZ(i, 0, 1, 0);
  if (pos.length >= 9) {
    const ax = pos[3] - pos[0];
    const az = pos[5] - pos[2];
    const bx = pos[6] - pos[0];
    const bz = pos[8] - pos[2];
    if (az * bx - ax * bz < 0) {
      const arr = g.getIndex()!.array as Uint16Array | Uint32Array;
      for (let i = 0; i < arr.length; i += 3) [arr[i + 1], arr[i + 2]] = [arr[i + 2], arr[i + 1]];
    }
  }
  return g;
}

/* ------------------------------------------------------------------ vertex-coloured kit */

const tmpColor = new THREE.Color();

/** Paint every vertex of `g` with `color` (sRGB hex) — adds a `color` attribute. */
export function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, jitter = 0, seed = 0): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  tmpColor.set(color);
  const k = jitter ? 1 + (((Math.sin(seed * 91.7) * 43758.5453) % 1) - 0.5) * jitter : 1;
  const n = geo.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = tmpColor.r * k;
    arr[i * 3 + 1] = tmpColor.g * k;
    arr[i * 3 + 2] = tmpColor.b * k;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  // strip attributes that differ between kit parts so they can be merged
  for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "color"].includes(name)) geo.deleteAttribute(name);
  return geo;
}

export function box(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error("mergeGeometries failed (attribute mismatch)");
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ vegetation */

/** Royal palm, ~14 m tall at scale 1. Single geometry with vertex colours. */
export function palmGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.24, 0.34, 11.6, 7, 4);
  trunk.translate(0, 5.8, 0);
  // slight bulge in the middle (royal palm)
  const tp = trunk.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    const k = 1 + 0.18 * Math.sin((y / 11.6) * Math.PI);
    tp.setX(i, tp.getX(i) * k);
    tp.setZ(i, tp.getZ(i) * k);
  }
  trunk.computeVertexNormals();
  parts.push(paint(trunk, "#a9a39a"));
  const shaft = new THREE.CylinderGeometry(0.2, 0.25, 1.8, 7, 1);
  shaft.translate(0, 12.5, 0);
  parts.push(paint(shaft, "#7c9142"));

  // fronds
  const fronds = 13;
  const segs = 9;
  const pos: number[] = [];
  const col: number[] = [];
  const base = new THREE.Color("#2f5a26");
  const tip = new THREE.Color("#4f7a33");
  const dark = new THREE.Color("#1f3d1a");
  for (let f = 0; f < fronds; f++) {
    const theta = (f / fronds) * Math.PI * 2 + (f % 2) * 0.2;
    const upper = f % 3 === 0;
    const elev = upper ? 0.95 : f % 3 === 1 ? 0.35 : -0.05; // initial pitch (rad)
    const len = upper ? 3.6 : 4.6;
    const dir = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const ring: THREE.Vector3[][] = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const pitch = elev - t * t * 1.5; // gravity droop
      // integrate centreline
      const along = (len * t) * Math.cos(pitch * 0.6);
      const up = len * t * Math.sin(elev) - len * t * t * 0.55;
      const c = new THREE.Vector3(0, 13.2 + up, 0).addScaledVector(dir, along + 0.15);
      const w = 0.95 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7) + 0.05;
      const droop = 0.45 * w;
      ring.push([c.clone().addScaledVector(side, w).add(new THREE.Vector3(0, -droop, 0)), c, c.clone().addScaledVector(side, -w).add(new THREE.Vector3(0, -droop, 0))]);
    }
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      const cA = base.clone().lerp(tip, t);
      for (let k = 0; k < 2; k++) {
        const a0 = ring[s][k];
        const a1 = ring[s][k + 1];
        const b0 = ring[s + 1][k];
        const b1 = ring[s + 1][k + 1];
        pos.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z);
        const edge = k === 0 ? [dark, cA, cA, dark, cA, cA] : [cA, cA, dark, cA, dark, cA];
        for (const c of edge) col.push(c.r, c.g, c.b);
      }
    }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  fg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  fg.computeVertexNormals();
  parts.push(fg);
  return merge(parts);
}

/** Rounded broadleaf tree ~8 m. */
export function treeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.22, 0.32, 3.4, 6);
  trunk.translate(0, 1.7, 0);
  const blobs: [number, number, number, number][] = [
    [0, 5.2, 0, 2.8],
    [1.3, 4.6, 0.6, 2.0],
    [-1.2, 4.8, -0.5, 2.1],
    [0.2, 6.6, -0.3, 1.8],
  ];
  const parts = [paint(trunk, "#6b5a48")];
  blobs.forEach(([x, y, z, r], i) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, y, z);
    parts.push(paint(g, i % 2 ? "#3f6a2c" : "#355d26"));
  });
  return merge(parts);
}
