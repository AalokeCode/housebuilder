import { BODY, walkBlocked } from "./collision";
import { Catalog, catalog as defaultCatalog } from "./catalog";
import type { CompiledHouse, CompiledItem, Issue } from "./compiled";
import { footprint, obbOverlap, pointInPolygon, pointInPolygonOrOnEdge, pointSegment, signedArea } from "./geometry";
import { isOutdoor, type HouseSpec, type RoomItemsFile, type Vec2 } from "./house-spec";

export interface ValidateOptions {
  /** only shell checks (rooms, openings, fixtures) */
  shell?: boolean;
  /** only check items of this room (plus shell errors) */
  room?: string;
  /** reference photo ids found in refs/ (for photoCam coverage) */
  photos?: string[];
}

const SNAP = 0.05;
const OVERLAP_TOL = 0.05;
/** builders that sit on/under other items or hang — skipped in overlap checks */
const NO_OVERLAP = new Set(["rug", "curtain", "art", "pendant", "tv", "tableLamp", "vaseFlowers"]);

/** Geometry + content checks on top of the compiler's own issues. */
export class HouseValidator {
  constructor(private readonly catalog: Catalog = defaultCatalog) {}

  validate(spec: HouseSpec, files: RoomItemsFile[], house: CompiledHouse, compileIssues: Issue[], opts: ValidateOptions = {}): Issue[] {
    const issues: Issue[] = [...compileIssues];
    const push = (level: Issue["level"], code: string, where: string, msg: string) => issues.push({ level, code, where, msg });

    this.checkIds(spec, files, push);
    this.checkRooms(spec, push);
    this.checkMaterials(spec, push);
    for (const h of spec.hotspots) {
      const r = spec.rooms.find((x) => x.id === h.room);
      if (!r) push("error", "hotspot-room", h.id, `unknown room ${h.room}`);
      else if (!pointInPolygon(h.pos, r.poly)) push("error", "hotspot-outside", h.id, `hotspot not inside ${h.room}`);
    }
    for (const r of spec.rooms) {
      if (!isOutdoor(r.type) && !spec.hotspots.some((h) => h.room === r.id)) push("warn", "room-no-hotspot", r.id, "room has no hotspot");
    }
    for (const k of Object.keys(spec.narration)) {
      if (k !== "_intro" && !spec.rooms.some((r) => r.id === k)) push("error", "narration-room", k, "narration key is not a room id");
    }
    for (const h of spec.hotspots) {
      if (walkBlocked(house, h.pos)) push("error", "hotspot-blocked", h.id, `hotspot is not walkable (furniture or wall within ${BODY} m)`);
    }
    for (const id of spec.tour ?? []) {
      if (!spec.hotspots.some((h) => h.id === id)) push("error", "tour-hotspot", id, "tour stop is not a hotspot id");
    }
    for (const h of spec.hotspots) {
      if (h.look && h.look[0] === h.pos[0] && h.look[1] === h.pos[1]) push("error", "hotspot-look", h.id, "look point equals hotspot position");
    }
    for (const r of spec.rooms) if (!spec.narration[r.id]) push("warn", "narration-missing", r.id, "room has no voice-over line");
    if (opts.photos) {
      for (const p of opts.photos) if (!spec.photoCams.some((c) => c.photo === p)) push("error", "photo-no-cam", p, "reference photo has no photoCam");
    }

    if (!opts.shell) {
      const items = house.items.filter((i) => !opts.room || i.room === opts.room);
      this.checkItems(spec, items, push);
    }
    return opts.room ? issues.filter((i) => i.level === "error" || i.where.startsWith(opts.room!)) : issues;
  }

  private checkIds(spec: HouseSpec, files: RoomItemsFile[], push: Push) {
    const seen = new Set<string>();
    const ids = [...spec.rooms.map((r) => r.id), ...spec.openings.map((o) => o.id), ...spec.fixtures.map((f) => f.id), ...spec.hotspots.map((h) => h.id)];
    for (const id of ids) {
      if (seen.has(id)) push("error", "duplicate-id", id, "id used twice");
      seen.add(id);
    }
    const roomFiles = new Set<string>();
    for (const f of files) {
      if (roomFiles.has(f.room)) push("error", "duplicate-items-file", f.room, "two items files for one room");
      roomFiles.add(f.room);
    }
  }

  private checkRooms(spec: HouseSpec, push: Push) {
    for (const r of spec.rooms) {
      const area = signedArea(r.poly);
      if (area < 0) push("error", "room-winding", r.id, "polygon is counter-clockwise on plan — reverse vertex order");
      if (Math.abs(area) < 0.5) push("error", "room-tiny", r.id, `area ${Math.abs(area).toFixed(2)} m² is implausible`);
      for (const p of r.poly) {
        if (p[0] < -1e-6 || p[1] < -1e-6) push("error", "negative-coord", r.id, `vertex ${p} is negative — origin is top-left`);
        const off = (v: number) => Math.abs(v / SNAP - Math.round(v / SNAP));
        if (off(p[0]) > 0.01 || off(p[1]) > 0.01) push("warn", "not-on-grid", r.id, `vertex ${p} not on 0.05 m grid`);
      }
      for (const o of r.openTo ?? []) {
        const other = spec.rooms.find((x) => x.id === o);
        if (!other) push("error", "open-to-unknown", r.id, `openTo ${o} does not exist`);
        else if (!this.adjacent(r.poly, other.poly)) push("error", "open-to-not-adjacent", r.id, `openTo ${o} but rooms share no edge`);
      }
    }
    // near-miss snaps + overlaps
    for (const a of spec.rooms) {
      for (const b of spec.rooms) {
        if (a === b) continue;
        for (const v of a.poly) {
          for (let k = 0; k < b.poly.length; k++) {
            const { d } = pointSegment(v, b.poly[k], b.poly[(k + 1) % b.poly.length]);
            if (d > 0.001 && d < 0.08) push("error", "snap-miss", a.id, `vertex ${v} is ${d.toFixed(3)} m from ${b.id} edge ${k} — snap it`);
          }
        }
        if (a.id < b.id && this.overlaps(a.poly, b.poly)) push("error", "room-overlap", `${a.id}+${b.id}`, "room polygons overlap");
      }
    }
  }

  private checkMaterials(spec: HouseSpec, push: Push) {
    for (const r of spec.rooms) {
      for (const m of [r.floor, r.walls, ...Object.values(r.wallOverrides ?? {})]) {
        if (!this.catalog.hasMaterial(m)) push("error", "material-missing", r.id, `unknown material ${JSON.stringify(m)}`);
      }
    }
  }

  private checkItems(spec: HouseSpec, items: CompiledItem[], push: Push) {
    for (const it of items) {
      const room = spec.rooms.find((r) => r.id === it.room)!;
      if (it.mount !== "floor") continue;
      const fp = footprint([it.pos[0], it.pos[2]], it.size[0], it.size[2], it.rotY);
      const outside = fp.filter((p) => !pointInPolygonOrOnEdge(p, room.poly, OVERLAP_TOL));
      if (outside.length && !it.builder.startsWith("curtain")) {
        push("error", "item-outside-room", `${it.room}/${it.id}`, `${it.cat} footprint leaves the room (corner ${fmt(outside[0])})`);
      }
    }
    const floor = items.filter((i) => i.mount === "floor" && !NO_OVERLAP.has(i.builder));
    for (let i = 0; i < floor.length; i++) {
      for (let j = i + 1; j < floor.length; j++) {
        const [a, b] = [floor[i], floor[j]];
        if (a.room !== b.room) continue;
        // stacked items (e.g. lamp on nightstand) don't collide
        if (a.pos[1] >= b.pos[1] + b.size[1] - 0.02 || b.pos[1] >= a.pos[1] + a.size[1] - 0.02) continue;
        const pen = obbOverlap(
          footprint([a.pos[0], a.pos[2]], a.size[0], a.size[2], a.rotY),
          footprint([b.pos[0], b.pos[2]], b.size[0], b.size[2], b.rotY),
        );
        if (pen > OVERLAP_TOL) push("error", "item-overlap", `${a.room}/${a.id}`, `${a.cat} overlaps ${b.cat} (${b.id}) by ${pen.toFixed(2)} m`);
      }
    }
  }

  private adjacent(a: Vec2[], b: Vec2[]) {
    let touching = 0;
    for (const v of a) {
      for (let k = 0; k < b.length; k++) {
        if (pointSegment(v, b[k], b[(k + 1) % b.length]).d < 0.001) touching++;
      }
    }
    return touching >= 2;
  }

  private overlaps(a: Vec2[], b: Vec2[]) {
    const xs = [...a, ...b].map((p) => p[0]);
    const zs = [...a, ...b].map((p) => p[1]);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.1) {
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.1) {
        const p: Vec2 = [x + 0.013, z + 0.017];
        if (pointInPolygon(p, a) && pointInPolygon(p, b)) return true;
      }
    }
    return false;
  }
}

type Push = (level: Issue["level"], code: string, where: string, msg: string) => void;
const fmt = (p: Vec2) => `[${p[0].toFixed(2)}, ${p[1].toFixed(2)}]`;
