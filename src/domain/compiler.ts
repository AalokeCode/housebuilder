import { Catalog, catalog as defaultCatalog } from "./catalog";
import type {
  Collider,
  CompiledFixture,
  CompiledHotspot,
  CompiledHouse,
  CompiledItem,
  CompiledLight,
  CompiledOpening,
  CompiledRoom,
  CompiledWall,
  Issue,
} from "./compiled";
import {
  add,
  centroid,
  dist,
  dot,
  EPS,
  footprint,
  inwardNormal,
  isConvexVertex,
  keyOf,
  norm,
  pointInPolygon,
  pointSegment,
  scale,
  signedArea,
  sub,
} from "./geometry";
import type { HouseSpec, ItemSpec, OpeningSpec, RoomItemsFile, RoomSpec, Vec2, Vec3 } from "./house-spec";

const T_EXTERIOR = 0.25;
const T_INTERIOR = 0.12;
const T_BULKHEAD = 0.1;
const T_RAILING = 0.05;
const RAILING_H = 1.1;
const PASSABLE = new Set(["door", "slider", "opening", "entrance"]);

/** A piece of a room edge between two breakpoints (T-junction aware). */
interface EdgeRef {
  room: RoomSpec;
  edge: number;
  s0: number;
  s1: number;
  p0: Vec2;
  p1: Vec2;
}

interface WallDraft {
  wall: CompiledWall;
  refs: { ref: EdgeRef; sameDir: boolean }[];
  /** extension applied at wall.a (shifts opening offsets) */
  extA: number;
}

export interface CompileResult {
  house: CompiledHouse;
  issues: Issue[];
}

/** floor builders you can walk over */
const WALKABLE = new Set(["rug", "curtain"]);

/**
 * Compiles HouseSpec v1 (+ per-room item files) into renderable geometry.
 * Walls are derived from room polygons: shared edges → interior walls, lone edges → exterior walls.
 */
export class HouseCompiler {
  private issues: Issue[] = [];
  private rooms = new Map<string, RoomSpec>();
  private drafts: WallDraft[] = [];
  private byRoomEdge = new Map<string, WallDraft[]>();
  private spec!: HouseSpec;

  constructor(private readonly catalog: Catalog = defaultCatalog) {}

  compile(spec: HouseSpec, itemFiles: RoomItemsFile[] = []): CompileResult {
    this.reset(spec);
    const rooms = spec.rooms.map((r) => this.compileRoom(r));
    this.buildWalls();
    for (const o of spec.openings) this.placeOpening(o);
    const walls = this.drafts.map((d) => d.wall);
    const items = itemFiles.flatMap((f) => this.compileItems(f));
    const fixtures = spec.fixtures.map((f) => this.compileFixture(f)).filter((f): f is CompiledFixture => !!f);

    const all = spec.rooms.flatMap((r) => r.poly);
    const house: CompiledHouse = {
      slug: spec.slug,
      title: spec.meta.title,
      sources: spec.meta.sources,
      meta: spec.meta,
      tour: spec.tour ?? this.defaultTour(),
      rooms,
      walls,
      items,
      fixtures,
      lights: this.compileLights(),
      hotspots: this.compileHotspots(),
      photoCams: spec.photoCams,
      colliders: this.buildColliders(walls),
      obstacles: this.buildObstacles(items, fixtures),
      narration: spec.narration,
      bounds: {
        min: [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1]))],
        max: [Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))],
      },
    };
    return { house, issues: this.issues };
  }

  // ───────────────────────── rooms ─────────────────────────

  private reset(spec: HouseSpec) {
    this.spec = spec;
    this.issues = [];
    this.drafts = [];
    this.byRoomEdge.clear();
    this.rooms = new Map(spec.rooms.map((r) => [r.id, r]));
  }

  private ceilingOf(r: RoomSpec): number {
    return r.ceiling?.height ?? this.spec.meta.ceiling;
  }

  private hasCeiling(r: RoomSpec): boolean {
    return r.type !== "balcony";
  }

  private compileRoom(r: RoomSpec): CompiledRoom {
    return {
      id: r.id,
      type: r.type,
      name: r.name,
      poly: r.poly,
      area: Math.abs(signedArea(r.poly)),
      center: centroid(r.poly),
      floor: r.floor,
      walls: r.walls,
      ceilingHeight: this.ceilingOf(r),
      ceilingMaterial: r.ceiling?.material ?? "paint.white.matte",
      hasCeiling: this.hasCeiling(r),
      est: !!r.est,
    };
  }

  // ───────────────────────── walls ─────────────────────────

  private edgePieces(): Map<string, EdgeRef[]> {
    const groups = new Map<string, EdgeRef[]>();
    const vertices = this.spec.rooms.flatMap((r) => r.poly);
    for (const room of this.spec.rooms) {
      const n = room.poly.length;
      for (let k = 0; k < n; k++) {
        const a = room.poly[k];
        const b = room.poly[(k + 1) % n];
        const L = dist(a, b);
        if (L < EPS) continue;
        const dir = norm(sub(b, a));
        const breaks = [0, L];
        for (const v of vertices) {
          const { d, t } = pointSegment(v, a, b);
          if (d < 0.005 && t * L > EPS && t * L < L - EPS) breaks.push(t * L);
        }
        breaks.sort((x, y) => x - y);
        for (let i = 0; i < breaks.length - 1; i++) {
          const s0 = breaks[i];
          const s1 = breaks[i + 1];
          if (s1 - s0 < EPS) continue;
          const p0 = add(a, scale(dir, s0));
          const p1 = add(a, scale(dir, s1));
          const key = [keyOf(p0), keyOf(p1)].sort().join("|");
          const list = groups.get(key) ?? [];
          list.push({ room, edge: k, s0, s1, p0, p1 });
          groups.set(key, list);
        }
      }
    }
    return groups;
  }

  private isOpen(a: RoomSpec, b: RoomSpec) {
    return !!(a.openTo?.includes(b.id) || b.openTo?.includes(a.id));
  }

  private wallMaterial(r: RoomSpec, edge: number) {
    return r.wallOverrides?.[String(edge)] ?? r.walls;
  }

  private buildWalls() {
    let n = 0;
    for (const refs of this.edgePieces().values()) {
      if (refs.length > 2) {
        this.issue("error", "edge-overlap", refs.map((r) => r.room.id).join(","), "more than two rooms share one edge — rooms overlap");
        continue;
      }
      const draft = this.classify(refs, `wall-${n}`);
      if (!draft) continue;
      n++;
      this.drafts.push(draft);
      for (const { ref } of draft.refs) {
        const key = `${ref.room.id}#${ref.edge}`;
        this.byRoomEdge.set(key, [...(this.byRoomEdge.get(key) ?? []), draft]);
      }
    }
  }

  private classify(refs: EdgeRef[], id: string): WallDraft | null {
    const first = refs[0];
    const withDir = refs.map((ref) => ({ ref, sameDir: keyOf(ref.p0) === keyOf(first.p0) }));
    const base = { id, a: first.p0, b: first.p1, openings: [] as CompiledOpening[], rooms: refs.map((r) => r.room.id) };

    if (refs.length === 1) {
      const r = first.room;
      if (r.type === "balcony") {
        return { refs: withDir, extA: 0, wall: { ...base, kind: "railing", thickness: T_RAILING, bottom: 0, top: RAILING_H, material: "glass.clear", exterior: true } };
      }
      return this.exteriorWall(withDir, first, base);
    }

    const [ra, rb] = [refs[0].room, refs[1].room];
    if (this.isOpen(ra, rb)) {
      const [ha, hb] = [this.ceilingOf(ra), this.ceilingOf(rb)];
      if (this.hasCeiling(ra) && this.hasCeiling(rb) && Math.abs(ha - hb) > 0.01) {
        return { refs: withDir, extA: 0, wall: { ...base, kind: "bulkhead", thickness: T_BULKHEAD, bottom: Math.min(ha, hb), top: Math.max(ha, hb), material: "paint.white.matte", exterior: false } };
      }
      return null;
    }
    const balcony = refs.find((r) => r.room.type === "balcony");
    if (balcony) {
      const inner = refs.find((r) => r !== balcony)!;
      return this.exteriorWall(withDir, inner, base);
    }
    return {
      refs: withDir,
      extA: 0,
      wall: { ...base, kind: "wall", thickness: T_INTERIOR, bottom: 0, top: Math.max(this.ceilingOf(ra), this.ceilingOf(rb)), material: this.wallMaterial(ra, refs[0].edge), exterior: false },
    };
  }

  /** Exterior wall sits outside the room polygon so interior dimensions stay exact. */
  private exteriorWall(
    refs: { ref: EdgeRef; sameDir: boolean }[],
    inner: EdgeRef,
    base: { id: string; a: Vec2; b: Vec2; openings: CompiledOpening[]; rooms: string[] },
  ): WallDraft {
    const r = inner.room;
    const n = r.poly.length;
    const edgeLen = dist(r.poly[inner.edge], r.poly[(inner.edge + 1) % n]);
    const out = scale(inwardNormal(r.poly, inner.edge), -T_EXTERIOR / 2);
    const dir = norm(sub(inner.p1, inner.p0));
    const ext0 = inner.s0 < EPS && isConvexVertex(r.poly, inner.edge) ? T_EXTERIOR : 0;
    const ext1 = inner.s1 > edgeLen - EPS && isConvexVertex(r.poly, (inner.edge + 1) % n) ? T_EXTERIOR : 0;
    let a = add(add(inner.p0, out), scale(dir, -ext0));
    let b = add(add(inner.p1, out), scale(dir, ext1));
    const innerSame = refs.find((x) => x.ref === inner)!.sameDir;
    let extA = ext0;
    if (!innerSame) {
      [a, b] = [b, a];
      extA = ext1;
    }
    return {
      refs,
      extA,
      wall: { ...base, a, b, kind: "wall", thickness: T_EXTERIOR, bottom: 0, top: this.ceilingOf(r), material: this.wallMaterial(r, inner.edge), exterior: true },
    };
  }

  /** Map an interval [s, s+w] on a room edge to a wall + local offset. */
  private locate(roomId: string, edge: number, s: number, w: number) {
    for (const d of this.byRoomEdge.get(`${roomId}#${edge}`) ?? []) {
      const hit = d.refs.find((x) => x.ref.room.id === roomId && x.ref.edge === edge);
      if (!hit) continue;
      const { ref, sameDir } = hit;
      if (s >= ref.s0 - 0.01 && s + w <= ref.s1 + 0.01) {
        const local = sameDir ? s - ref.s0 : ref.s1 - (s + w);
        return { draft: d, offset: local + d.extA };
      }
    }
    return null;
  }

  private placeOpening(o: OpeningSpec) {
    let located: ReturnType<HouseCompiler["locate"]> = null;
    if ("between" in o) {
      const [a, b] = o.between;
      const pieces = this.drafts
        .flatMap((d) => d.refs.filter((x) => x.ref.room.id === a && d.wall.rooms.includes(b)).map((x) => x.ref))
        .sort((x, y) => x.edge - y.edge || x.s0 - y.s0);
      if (!pieces.length) {
        this.issue("error", "opening-no-shared-wall", o.id, `rooms ${a} and ${b} share no wall (open-plan or not adjacent)`);
        return;
      }
      let remaining = o.at;
      for (const p of pieces) {
        const plen = p.s1 - p.s0;
        if (remaining + o.w <= plen + 0.01) {
          located = this.locate(a, p.edge, p.s0 + remaining, o.w);
          break;
        }
        remaining -= plen;
      }
    } else {
      located = this.locate(o.room, o.edge, o.at, o.w);
    }
    if (!located) {
      this.issue("error", "opening-does-not-fit", o.id, `opening (at ${o.at}, w ${o.w}) does not fit inside a single wall segment`);
      return;
    }
    const sill = o.sill ?? (o.kind === "window" ? 0.9 : 0);
    const { wall } = located.draft;
    if (sill + o.h > wall.top + 0.01) this.issue("warn", "opening-too-tall", o.id, `opening top ${sill + o.h} exceeds wall height ${wall.top}`);
    wall.openings.push({
      id: o.id,
      kind: o.kind,
      offset: located.offset,
      w: o.w,
      h: Math.min(o.h, wall.top - sill),
      sill,
      swing: o.swing,
      frame: o.frame ?? (o.kind === "slider" || o.kind === "window" ? "frame.alu.black" : "door.greige"),
      leaf: o.leaf ?? (o.kind === "entrance" ? "door.entrance.walnut" : "door.greige"),
      est: !!o.est,
    });
  }

  /** Furniture + kitchen runs the walk camera can't pass through (plan footprints). */
  private buildObstacles(items: CompiledItem[], fixtures: CompiledFixture[]): Vec2[][] {
    const out: Vec2[][] = [];
    for (const it of items) {
      if (it.mount !== "floor" || it.decor || WALKABLE.has(it.builder) || it.size[1] < 0.25) continue;
      out.push(footprint([it.pos[0], it.pos[2]], it.size[0], it.size[2], it.rotY));
    }
    for (const f of fixtures) {
      const r = (f.rotY * Math.PI) / 180;
      const depth = 0.6;
      out.push(footprint([f.origin[0] + Math.sin(r) * depth * 0.5, f.origin[1] + Math.cos(r) * depth * 0.5], f.length, depth, f.rotY));
    }
    return out;
  }

  private buildColliders(walls: CompiledWall[]): Collider[] {
    const out: Collider[] = [];
    for (const w of walls) {
      if (w.kind === "bulkhead") continue;
      const L = dist(w.a, w.b);
      const dir = norm(sub(w.b, w.a));
      const gaps = w.openings
        .filter((o) => PASSABLE.has(o.kind))
        .map((o) => [o.offset, o.offset + o.w] as const)
        .sort((x, y) => x[0] - y[0]);
      let cur = 0;
      const push = (s0: number, s1: number) => {
        if (s1 - s0 > 0.02) out.push({ a: add(w.a, scale(dir, s0)), b: add(w.a, scale(dir, s1)), radius: w.thickness / 2 });
      };
      for (const [g0, g1] of gaps) {
        push(cur, g0);
        cur = Math.max(cur, g1);
      }
      push(cur, L);
    }
    return out;
  }

  /** Distance from a room edge to the visible wall surface at param s. */
  surfaceOffset(roomId: string, edge: number, s: number): number {
    const hit = this.locate(roomId, edge, s, 0);
    if (!hit) return 0;
    const w = hit.draft.wall;
    if (w.kind === "railing") return 0.03;
    if (w.kind === "bulkhead") return 0;
    return w.exterior ? 0 : w.thickness / 2;
  }

  // ───────────────────────── items & fixtures ─────────────────────────

  private compileItems(file: RoomItemsFile): CompiledItem[] {
    const room = this.rooms.get(file.room);
    if (!room) {
      this.issue("error", "items-unknown-room", file.room, "items file references unknown room");
      return [];
    }
    const out: CompiledItem[] = [];
    const all: [ItemSpec, boolean][] = [...file.items.map((i) => [i, false] as [ItemSpec, boolean]), ...file.decor.map((i) => [i, true] as [ItemSpec, boolean])];
    all.forEach(([it, decor], i) => {
      const c = this.compileItem(room, it, decor, `${room.id}-${i}`);
      if (c) out.push(c);
    });
    return out;
  }

  private compileItem(room: RoomSpec, it: ItemSpec, decor: boolean, fallbackId: string): CompiledItem | null {
    const id = it.id ?? fallbackId;
    const placeholder = it.cat.startsWith("placeholder.");
    const entry = this.catalog.item(it.cat);
    if (!placeholder && !entry) {
      this.issue("error", "catalog-missing", `${room.id}/${id}`, `unknown catalog id "${it.cat}" — use placeholder.<category> + size`);
      return null;
    }
    if (placeholder && !it.size) this.issue("error", "placeholder-size", `${room.id}/${id}`, "placeholder needs `size`");

    const raw = it.size ?? entry?.size ?? [0.5, 0.5, 0.5];
    const size: Vec3 = raw.length === 2 ? [raw[0], raw[1], 0.04] : (raw as Vec3);
    const mount = entry?.mount ?? (raw.length === 2 ? "wall" : "floor");
    const colors: Record<string, string> = placeholder ? { body: it.color ?? "#cccccc" } : { ...entry!.colors, ...(it.color ? { body: it.color } : {}) };
    if (it.image) colors.image = it.image;

    let pos2: Vec2;
    let rotY = it.rotY ?? 0;
    if (it.against) {
      const n = room.poly.length;
      const { edge, at } = it.against;
      if (edge >= n) {
        this.issue("error", "item-bad-edge", `${room.id}/${id}`, `edge ${edge} does not exist (room has ${n})`);
        return null;
      }
      const a = room.poly[edge];
      const b = room.poly[(edge + 1) % n];
      const nrm = inwardNormal(room.poly, edge);
      const p = add(a, scale(norm(sub(b, a)), at));
      const surf = this.surfaceOffset(room.id, edge, at);
      pos2 = add(p, scale(nrm, surf + (it.gap ?? 0) + size[2] / 2));
      rotY = (Math.atan2(nrm[0], nrm[1]) * 180) / Math.PI;
    } else {
      pos2 = it.pos!;
    }

    const y = mount === "wall" ? (it.y ?? 1.55) : mount === "ceiling" ? this.ceilingOf(room) : (it.y ?? 0);
    return {
      id,
      room: room.id,
      cat: it.cat,
      builder: placeholder ? "placeholder" : entry!.builder,
      model: entry?.model,
      mount,
      pos: [pos2[0], y, pos2[1]],
      rotY,
      size,
      colors,
      placeholder,
      decor,
      est: !!it.est,
      note: it.note,
    };
  }

  private compileFixture(f: HouseSpec["fixtures"][number]): CompiledFixture | null {
    const room = this.rooms.get(f.room);
    if (!room) {
      this.issue("error", "fixture-unknown-room", f.id, `unknown room ${f.room}`);
      return null;
    }
    const n = room.poly.length;
    const a = room.poly[f.edge];
    const b = room.poly[(f.edge + 1) % n];
    const L = dist(a, b);
    if (f.to > L + 0.01 || f.from >= f.to) {
      this.issue("error", "fixture-range", f.id, `run ${f.from}–${f.to} outside edge length ${L.toFixed(2)}`);
      return null;
    }
    const dir = norm(sub(b, a));
    const nrm = inwardNormal(room.poly, f.edge);
    const mid = (f.from + f.to) / 2;
    const surf = this.surfaceOffset(room.id, f.edge, mid);
    const origin = add(add(a, scale(dir, mid)), scale(nrm, surf));
    const rot = Math.atan2(nrm[0], nrm[1]);
    const localX: Vec2 = [Math.cos(rot), -Math.sin(rot)];
    return {
      id: f.id,
      kind: "kitchen",
      room: room.id,
      origin,
      rotY: (rot * 180) / Math.PI,
      length: f.to - f.from,
      ceiling: this.ceilingOf(room),
      base: f.base,
      top: f.top,
      upper: f.upper,
      splash: f.splash,
      appliances: (f.appliances ?? []).map((ap) => {
        const e = this.catalog.item(ap.cat);
        if (!e) this.issue("error", "catalog-missing", f.id, `unknown appliance ${ap.cat}`);
        const p = add(a, scale(dir, f.from + ap.at));
        return { cat: ap.cat, at: dot(sub(p, origin), localX), size: e?.size ?? [0.6, 0.9, 0.6], colors: e?.colors ?? {} };
      }),
    };
  }

  // ───────────────────────── lights & hotspots ─────────────────────────

  private compileLights(): CompiledLight[] {
    const out: CompiledLight[] = [];
    for (const l of this.spec.lights) {
      const room = this.rooms.get(l.room);
      if (!room) {
        this.issue("error", "light-unknown-room", l.room, "unknown room");
        continue;
      }
      const h = this.ceilingOf(room);
      if (l.kind === "downlight") {
        const [nx, nz] = l.grid ?? [1, 1];
        const xs = room.poly.map((p) => p[0]);
        const zs = room.poly.map((p) => p[1]);
        const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
        for (let i = 0; i < nx; i++)
          for (let j = 0; j < nz; j++) {
            const p: Vec2 = [x0 + ((i + 0.5) * (x1 - x0)) / nx, z0 + ((j + 0.5) * (z1 - z0)) / nz];
            if (pointInPolygon(p, room.poly)) out.push({ room: room.id, kind: "downlight", pos: [p[0], h, p[1]] });
          }
      } else if (l.kind === "linear" && l.line) {
        out.push({ room: room.id, kind: "linear", pos: [l.line[0][0], h, l.line[0][1]], end: [l.line[1][0], h, l.line[1][1]] });
      } else if (l.pos) {
        out.push({ room: room.id, kind: l.kind, pos: [l.pos[0], h, l.pos[1]] });
      }
    }
    return out;
  }

  private compileHotspots(): CompiledHotspot[] {
    return this.spec.hotspots.map((h) => ({ id: h.id, room: h.room, pos: [h.pos[0], 0, h.pos[1]] as Vec3, look: h.look, label: h.label }));
  }

  /** One stop per room: its first hotspot, in hotspot order. */
  private defaultTour(): string[] {
    const seen = new Set<string>();
    return this.spec.hotspots.filter((h) => !seen.has(h.room) && seen.add(h.room)).map((h) => h.id);
  }

  private issue(level: Issue["level"], code: string, where: string, msg: string) {
    this.issues.push({ level, code, where, msg });
  }
}
