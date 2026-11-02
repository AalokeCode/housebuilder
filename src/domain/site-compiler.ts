/**
 * Pure SiteSpec → CompiledSite compiler (no three.js, no DOM).
 * Produces world-space outlines, element bounds, normalised camera moves and
 * narration word lists. The view layer only turns these numbers into meshes.
 */
import { FacadePalette, SiteSpec, type CameraMoveSpec, type SiteSpecInput } from "./site-spec";

export type V2 = [number, number];
export type V3 = [number, number, number];

export interface SiteIssue {
  level: "error" | "warn";
  code: string;
  where: string;
  msg: string;
}

export interface CompiledTower {
  id: string;
  name: string;
  /** world (x, z) outline, outward normal of edge e is (−e.z, e.x) */
  outline: V2[];
  baseY: number;
  height: number;
  floors: number;
  floorHeight: number;
  panelWidth: number;
  palette: FacadePalette;
  /** [u0, u1] metres along the perimeter where the recessed balcony stack sits */
  balconyU: V2 | null;
  perimeter: number;
  seed: number;
}

export interface CompiledPodium {
  id: string;
  name: string;
  outline: V2[];
  height: number;
  retailHeight: number;
  color: string;
}

export interface CompiledDeck {
  id: string;
  name: string;
  y: number;
  pools: [number, number, number, number][];
  planters: [number, number, number, number][];
  trees: V2[];
}

export interface CompiledEntrance {
  id: string;
  name: string;
  pos: V2;
  rotY: number;
  width: number;
  height: number;
  forecourt: V2[] | null;
}

export interface CompiledSignage {
  id: string;
  text: string;
  sub: string | null;
  pos: V3;
  rotY: number;
  width: number;
  height: number;
}

export interface CompiledBridge {
  id: string;
  name: string;
  from: V2;
  to: V2;
  y: number;
  width: number;
  height: number;
}

export interface CompiledContextBlock {
  id: string;
  name: string;
  kind: "midrise" | "office";
  outline: V2[];
  height: number;
  color: string;
  accent: string;
}

export interface CompiledFiller {
  pos: V2;
  w: number;
  d: number;
  h: number;
  rot: number;
  shade: number;
}

export interface CompiledPalm {
  pos: V2;
  height: number;
  rot: number;
  lean: number;
}

export interface CompiledLandscape {
  id: string;
  palms: CompiledPalm[];
  trees: { pos: V2; scale: number; rot: number }[];
  hedges: { a: V2; b: V2 }[];
  hedgeWidth: number;
  hedgeHeight: number;
  paving: V2[][];
  road: { id: string; name: string; path: V2[]; width: number; lanes: number; sidewalk: number };
}

export type ElementKind = "tower" | "podium" | "deck" | "entrance" | "signage" | "bridge" | "context" | "road" | "landscape";

export interface CompiledElement {
  id: string;
  name: string;
  kind: ElementKind;
  min: V3;
  max: V3;
  center: V3;
}

export type CameraMove =
  | { kind: "orbit"; center: V3; r0: number; r1: number; h0: number; h1: number; a0: number; a1: number }
  | { kind: "dolly"; from: V3; to: V3; lookFrom: V3; lookTo: V3 };

export interface CompiledChapter {
  id: string;
  index: number;
  title: string;
  /** expanded element ids (groups resolved) */
  highlight: string[];
  camera: CameraMove;
  /** seconds */
  duration: number;
  narration: string;
  words: string[];
}

export interface CompiledSite {
  slug: string;
  meta: { title: string; location: string; disclaimer: string | null };
  towers: CompiledTower[];
  podium: CompiledPodium;
  deck: CompiledDeck | null;
  entrance: CompiledEntrance | null;
  signage: CompiledSignage | null;
  bridge: CompiledBridge | null;
  context: CompiledContextBlock[];
  filler: CompiledFiller[];
  landscape: CompiledLandscape;
  elements: CompiledElement[];
  chapters: CompiledChapter[];
  bounds: { min: V3; max: V3 };
}

/** Seconds per word for the no-speech fallback and duration estimate. */
export const SECONDS_PER_WORD = 0.36;

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ geometry helpers */

/** Rotate (x, z) about the y axis with three.js Object3D.rotation.y semantics. */
export function rotateXZ([x, z]: V2, rad: number): V2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [x * c + z * s, -x * s + z * c];
}

export function signedArea(poly: V2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % poly.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

/** Normalise winding so that outward normal of edge e is (−e.z, e.x). */
export function orient(poly: V2[]): V2[] {
  return signedArea(poly) > 0 ? [...poly].reverse() : [...poly];
}

export function pointInPolygon([x, z]: V2, poly: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function bbox(points: V2[]): { min: V2; max: V2 } {
  const min: V2 = [Infinity, Infinity];
  const max: V2 = [-Infinity, -Infinity];
  for (const [x, z] of points) {
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], z);
  }
  return { min, max };
}

/** Local rounded rectangle (front = +z), traversed so outward normal = (−e.z, e.x). */
export function roundedRect(w: number, d: number, radii: [number, number, number, number]): V2[] {
  const hw = w / 2;
  const hd = d / 2;
  const clamp = (r: number) => Math.max(0, Math.min(r, hw, hd));
  const [rFR, rBR, rBL, rFL] = radii.map(clamp) as [number, number, number, number];
  const pts: V2[] = [[0, hd]];
  const arc = (cx: number, cz: number, r: number, from: number, to: number) => {
    if (r <= 0.01) {
      pts.push([cx, cz]);
      return;
    }
    const seg = Math.max(3, Math.round(r * 1.2));
    for (let i = 0; i <= seg; i++) {
      const a = (from + ((to - from) * i) / seg) * DEG;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  arc(hw - rFR, hd - rFR, rFR, 90, 0);
  arc(hw - rBR, -hd + rBR, rBR, 0, -90);
  arc(-hw + rBL, -hd + rBL, rBL, -90, -180);
  arc(-hw + rFL, hd - rFL, rFL, 180, 90);
  // drop consecutive duplicates
  return pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length];
    return i === 0 || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4;
  });
}

function perimeterOf(poly: V2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
}

/** Arc-length coordinate (u) of the outline point closest to p. */
function uAt(poly: V2[], p: V2): number {
  let best = Infinity;
  let bestU = 0;
  let cum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const len = Math.hypot(ex, ez);
    const t = len > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / (len * len))) : 0;
    const dx = a[0] + ex * t - p[0];
    const dz = a[1] + ez * t - p[1];
    const dist = Math.hypot(dx, dz);
    if (dist < best) {
      best = dist;
      bestU = cum + t * len;
    }
    cum += len;
  }
  return bestU;
}

/** Deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ------------------------------------------------------------------ camera */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/** Smooth ease in/out (cubic). */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Gentle ease for long camera moves: mostly linear with soft ends. */
const softEase = (t: number) => {
  const k = 0.18;
  if (t < k) return (t * t) / (2 * k * (1 - k));
  if (t > 1 - k) return 1 - ((1 - t) * (1 - t)) / (2 * k * (1 - k));
  return (t - k / 2) / (1 - k);
};

function normaliseMove(m: CameraMoveSpec): CameraMove {
  if (m.kind === "orbit") {
    const [h0, h1] = Array.isArray(m.height) ? m.height : [m.height, m.height];
    return { kind: "orbit", center: m.center, r0: m.radius, r1: m.endRadius ?? m.radius, h0, h1, a0: m.startDeg * DEG, a1: (m.startDeg + m.sweepDeg) * DEG };
  }
  return { kind: "dolly", from: m.from, to: m.to, lookFrom: m.lookFrom, lookTo: m.lookTo ?? m.lookFrom };
}

/** Camera pose for a move at normalised time t ∈ [0, 1]. */
export function sampleCamera(move: CameraMove, t: number): { pos: V3; target: V3 } {
  const u = softEase(Math.max(0, Math.min(1, t)));
  if (move.kind === "orbit") {
    const a = lerp(move.a0, move.a1, u);
    const r = lerp(move.r0, move.r1, u);
    const [cx, cy, cz] = move.center;
    return { pos: [cx + Math.sin(a) * r, lerp(move.h0, move.h1, u), cz + Math.cos(a) * r], target: [cx, cy, cz] };
  }
  return { pos: lerp3(move.from, move.to, u), target: lerp3(move.lookFrom, move.lookTo, u) };
}

/* ------------------------------------------------------------------ compiler */

export function compileSite(input: SiteSpecInput | SiteSpec, slug = "site"): { site: CompiledSite | null; issues: SiteIssue[] } {
  const issues: SiteIssue[] = [];
  const parsed = SiteSpec.safeParse(input);
  if (!parsed.success) {
    for (const e of parsed.error.issues) issues.push({ level: "error", code: "schema", where: `site.json:${e.path.join(".")}`, msg: e.message });
    return { site: null, issues };
  }
  const spec = parsed.data;
  const elements: CompiledElement[] = [];
  const addEl = (id: string, name: string, kind: ElementKind, min: V3, max: V3) =>
    elements.push({ id, name, kind, min, max, center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] });

  // podium
  const podiumOutline = orient(spec.podium.polygon as V2[]);
  const podium: CompiledPodium = {
    id: spec.podium.id,
    name: spec.podium.name,
    outline: podiumOutline,
    height: spec.podium.height,
    retailHeight: spec.podium.retailHeight,
    color: spec.podium.color,
  };
  {
    const b = bbox(podiumOutline);
    addEl(podium.id, podium.name, "podium", [b.min[0], 0, b.min[1]], [b.max[0], podium.height, b.max[1]]);
  }

  // towers (sit on the podium roof)
  const baseFacade = FacadePalette.parse({});
  const towers: CompiledTower[] = spec.towers.map((t) => {
    const rot = t.rotY * DEG;
    const local = roundedRect(t.footprint.w, t.footprint.d, t.footprint.radii);
    const outline = local.map((p) => {
      const [x, z] = rotateXZ(p, rot);
      return [x + t.pos[0], z + t.pos[1]] as V2;
    });
    const baseY = pointInPolygon(t.pos as V2, podiumOutline) ? podium.height : 0;
    const height = t.floors * t.floorHeight + 2.4; // + parapet / crown
    let balconyU: V2 | null = null;
    if (t.balcony) {
      const sideLocal: V2 = [t.balcony.side === "right" ? t.footprint.w / 2 : -t.footprint.w / 2, 0];
      const [sx, sz] = rotateXZ(sideLocal, rot);
      const u = uAt(outline, [sx + t.pos[0], sz + t.pos[1]]);
      balconyU = [u - t.balcony.width / 2, u + t.balcony.width / 2];
    }
    const b = bbox(outline);
    addEl(t.id, t.name, "tower", [b.min[0], baseY, b.min[1]], [b.max[0], baseY + height, b.max[1]]);
    if (baseY === 0) issues.push({ level: "warn", code: "tower-off-podium", where: `towers.${t.id}`, msg: "tower centre is outside the podium polygon; placed at ground level" });
    return {
      id: t.id,
      name: t.name,
      outline,
      baseY,
      height,
      floors: t.floors,
      floorHeight: t.floorHeight,
      panelWidth: t.panelWidth,
      palette: { ...baseFacade, ...(t.palette ?? {}) },
      balconyU,
      perimeter: perimeterOf(outline),
      seed: t.seed,
    };
  });

  // deck
  let deck: CompiledDeck | null = null;
  if (spec.deck) {
    deck = { id: spec.deck.id, name: spec.deck.name, y: podium.height, pools: spec.deck.pools, planters: spec.deck.planters, trees: spec.deck.trees as V2[] };
    const pts: V2[] = [...deck.pools, ...deck.planters].flatMap(([x, z, w, d]) => [
      [x - w / 2, z - d / 2],
      [x + w / 2, z + d / 2],
    ]);
    pts.push(...deck.trees);
    if (pts.length) {
      const b = bbox(pts);
      addEl(deck.id, deck.name, "deck", [b.min[0], podium.height, b.min[1]], [b.max[0], podium.height + 4, b.max[1]]);
    } else issues.push({ level: "warn", code: "deck-empty", where: "deck", msg: "deck has no pools, planters or trees" });
    for (const [x, z] of pts) {
      if (!pointInPolygon([x, z], podiumOutline)) {
        issues.push({ level: "warn", code: "deck-off-podium", where: "deck", msg: `deck item at (${x}, ${z}) is outside the podium roof` });
        break;
      }
    }
  }

  // entrance
  let entrance: CompiledEntrance | null = null;
  if (spec.entrance) {
    const e = spec.entrance;
    entrance = { id: e.id, name: e.name, pos: e.pos as V2, rotY: e.rotY * DEG, width: e.width, height: e.height, forecourt: e.forecourt ? orient(e.forecourt as V2[]) : null };
    const pts: V2[] = [
      [e.pos[0] - e.width / 2 - 2, e.pos[1] - 4],
      [e.pos[0] + e.width / 2 + 2, e.pos[1] + 4],
      ...(entrance.forecourt ?? []),
    ];
    const b = bbox(pts);
    addEl(e.id, e.name, "entrance", [b.min[0], 0, b.min[1]], [b.max[0], e.height + 1, b.max[1]]);
  }

  // signage
  let signage: CompiledSignage | null = null;
  if (spec.signage) {
    const s = spec.signage;
    signage = { id: s.id, text: s.text, sub: s.sub ?? null, pos: s.pos, rotY: s.rotY * DEG, width: s.width, height: s.height };
    addEl(s.id, "Signage", "signage", [s.pos[0] - s.width / 2, s.pos[1] - s.height / 2, s.pos[2] - 1], [s.pos[0] + s.width / 2, s.pos[1] + s.height / 2, s.pos[2] + 1]);
  }

  // bridge
  let bridge: CompiledBridge | null = null;
  if (spec.bridge) {
    const br = spec.bridge;
    bridge = { id: br.id, name: br.name, from: br.from as V2, to: br.to as V2, y: br.y, width: br.width, height: br.height };
    const b = bbox([br.from as V2, br.to as V2]);
    addEl(br.id, br.name, "bridge", [b.min[0] - br.width, br.y, b.min[1] - br.width], [b.max[0] + br.width, br.y + br.height, b.max[1] + br.width]);
  }

  // context blocks
  const context: CompiledContextBlock[] = spec.context.map((c) => {
    const [w, h, d] = c.size;
    const local = orient([
      [-w / 2, d / 2],
      [w / 2, d / 2],
      [w / 2, -d / 2],
      [-w / 2, -d / 2],
    ]);
    const outline = local.map((p) => {
      const [x, z] = rotateXZ(p, c.rotY * DEG);
      return [x + c.pos[0], z + c.pos[1]] as V2;
    });
    const b = bbox(outline);
    addEl(c.id, c.name, "context", [b.min[0], 0, b.min[1]], [b.max[0], h, b.max[1]]);
    return { id: c.id, name: c.name, kind: c.kind, outline, height: h, color: c.color, accent: c.accent };
  });

  // filler city ring (deterministic)
  const filler: CompiledFiller[] = [];
  if (spec.filler && spec.filler.count > 0) {
    const f = spec.filler;
    const rnd = prng(f.seed);
    const roadZ = spec.landscape.road.path.map((p) => p[1]);
    let guard = 0;
    while (filler.length < f.count && guard++ < f.count * 20) {
      const a = rnd() * Math.PI * 2;
      const r = f.inner + Math.sqrt(rnd()) * (f.outer - f.inner);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      // keep the road corridor clear
      if (roadZ.some((rz) => Math.abs(z - rz) < spec.landscape.road.width + 18) && Math.abs(x) < f.outer) continue;
      const tall = rnd() < 0.15;
      filler.push({ pos: [x, z], w: 18 + rnd() * 30, d: 18 + rnd() * 30, h: tall ? 40 + rnd() * 45 : 8 + rnd() * 24, rot: rnd() * Math.PI, shade: rnd() });
    }
  }

  // landscape
  const ls = spec.landscape;
  const palms: CompiledPalm[] = ls.palms.map((p) => {
    const pos = (Array.isArray(p) ? p : p.pos) as V2;
    const r = hash2(pos[0], pos[1]);
    return { pos, height: Array.isArray(p) ? 11 + r * 6 : p.height, rot: r * Math.PI * 2, lean: (hash2(pos[1], pos[0]) - 0.5) * 0.08 };
  });
  for (const p of palms) {
    if (pointInPolygon(p.pos, podiumOutline)) issues.push({ level: "warn", code: "palm-in-podium", where: "landscape.palms", msg: `palm at (${p.pos.join(", ")}) is inside the podium` });
  }
  const hedges: { a: V2; b: V2 }[] = [];
  for (const line of ls.hedges) for (let i = 0; i + 1 < line.length; i++) hedges.push({ a: line[i] as V2, b: line[i + 1] as V2 });
  const landscape: CompiledLandscape = {
    id: ls.id,
    palms,
    trees: (ls.trees as V2[]).map((pos) => ({ pos, scale: 0.8 + hash2(pos[0], pos[1]) * 0.6, rot: hash2(pos[1], pos[0]) * Math.PI * 2 })),
    hedges,
    hedgeWidth: ls.hedgeWidth,
    hedgeHeight: ls.hedgeHeight,
    paving: ls.paving.map((p) => orient(p as V2[])),
    road: { id: ls.road.id, name: ls.road.name, path: ls.road.path as V2[], width: ls.road.width, lanes: ls.road.lanes, sidewalk: ls.road.sidewalk },
  };
  {
    const half = ls.road.width / 2 + ls.road.sidewalk;
    const b = bbox(landscape.road.path);
    addEl(ls.road.id, ls.road.name, "road", [b.min[0] - half, 0, b.min[1] - half], [b.max[0] + half, 0.5, b.max[1] + half]);
    const lp: V2[] = [...palms.map((p) => p.pos), ...hedges.flatMap((h) => [h.a, h.b]), ...landscape.trees.map((t) => t.pos)];
    if (lp.length) {
      const lb = bbox(lp);
      addEl(ls.id, "Landscape", "landscape", [lb.min[0], 0, lb.min[1]], [lb.max[0], 16, lb.max[1]]);
    }
  }

  // ids + groups
  const seen = new Set<string>();
  for (const el of elements) {
    if (seen.has(el.id)) issues.push({ level: "error", code: "dup-id", where: el.id, msg: `duplicate element id "${el.id}"` });
    seen.add(el.id);
  }
  const groups = spec.groups;
  for (const [gid, members] of Object.entries(groups)) {
    if (seen.has(gid)) issues.push({ level: "error", code: "dup-id", where: `groups.${gid}`, msg: `group id "${gid}" collides with an element id` });
    for (const m of members) if (!seen.has(m)) issues.push({ level: "error", code: "bad-group-member", where: `groups.${gid}`, msg: `unknown element "${m}"` });
  }
  const expand = (id: string): string[] => (groups[id] ? groups[id].filter((m) => seen.has(m)) : seen.has(id) ? [id] : []);

  // chapters
  const chapterIds = new Set<string>();
  const chapters: CompiledChapter[] = spec.chapters.map((c, index) => {
    if (chapterIds.has(c.id)) issues.push({ level: "error", code: "dup-chapter", where: `chapters.${c.id}`, msg: `duplicate chapter id "${c.id}"` });
    chapterIds.add(c.id);
    for (const h of c.highlight) {
      if (!seen.has(h) && !groups[h]) issues.push({ level: "error", code: "bad-highlight", where: `chapters.${c.id}`, msg: `highlight "${h}" is not an element or group id` });
    }
    const words = c.narration.trim().split(/\s+/).filter(Boolean);
    if (words.length > 70) issues.push({ level: "warn", code: "long-narration", where: `chapters.${c.id}`, msg: `${words.length} words — keep chapters to 1–3 sentences` });
    const highlight = [...new Set(c.highlight.flatMap(expand))];
    return {
      id: c.id,
      index,
      title: c.title,
      highlight,
      camera: normaliseMove(c.camera),
      duration: Math.max(c.durationHint, words.length * SECONDS_PER_WORD + 1.5),
      narration: c.narration.trim(),
      words,
    };
  });

  const allMin: V3 = [Infinity, 0, Infinity];
  const allMax: V3 = [-Infinity, 0, -Infinity];
  for (const el of elements) {
    for (let k = 0; k < 3; k++) {
      allMin[k] = Math.min(allMin[k], el.min[k]);
      allMax[k] = Math.max(allMax[k], el.max[k]);
    }
  }

  return {
    site: {
      slug,
      meta: { title: spec.meta.title, location: spec.meta.location, disclaimer: spec.meta.disclaimer ?? null },
      towers,
      podium,
      deck,
      entrance,
      signage,
      bridge,
      context,
      filler,
      landscape,
      elements,
      chapters,
      bounds: { min: allMin, max: allMax },
    },
    issues,
  };
}
