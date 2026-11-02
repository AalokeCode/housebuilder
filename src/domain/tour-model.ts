import type { CompiledHouse, CompiledRoom } from "./compiled";
import { centroid, pointInPolygon, pointSegment } from "./geometry";
import type { Vec2 } from "./house-spec";

/**
 * Buyer-facing view of a compiled house: facts, room evidence, guided-tour stops.
 * Pure — shared by the server (metadata, cover page) and the client viewer.
 */

/** Listing photo exported for the public site (`pnpm house:publish`). */
export interface TourPhoto {
  id: string;
  src: string;
  thumb: string;
  w: number;
  h: number;
  /** room the photo was taken in (from its photo-match camera), if known */
  room: string | null;
}

export interface TourFacts {
  bedrooms: number;
  bathrooms: number;
  /** m², rooms except balcony — derived from the 3D model, so always approximate */
  interiorArea: number;
  outdoorArea: number;
  rooms: number;
  /** any room geometry estimated rather than measured */
  estimated: boolean;
}

export interface RoomInfo {
  id: string;
  name: string;
  type: CompiledRoom["type"];
  area: number;
  est: boolean;
  /** photo ids shot in this room */
  photos: string[];
  /** hotspot used to enter the room */
  hotspot: string | null;
}

export interface GuidedStop {
  hotspot: string;
  room: string;
  title: string;
  pos: Vec2;
  /** camera yaw (radians, three.js Y rotation; 0 = looking towards −z) */
  yaw: number;
  text: string;
  seconds: number;
}

/** Words per second of the default speech voice at rate ≈ 1. */
const WPS = 2.6;

export function speechSeconds(text: string): number {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return Math.max(4, Math.round((words / WPS + 1.2) * 10) / 10);
}

/** Yaw that faces `to` from `from` (plan coordinates). */
export function yawTowards(from: Vec2, to: Vec2): number {
  return Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));
}

export function roomAt(house: Pick<CompiledHouse, "rooms">, p: Vec2): CompiledRoom | null {
  return house.rooms.find((r) => pointInPolygon(p, r.poly)) ?? null;
}

export function tourFacts(house: CompiledHouse): TourFacts {
  const interior = house.rooms.filter((r) => r.type !== "balcony");
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    bedrooms: house.rooms.filter((r) => r.type === "bedroom").length,
    bathrooms: house.rooms.filter((r) => r.type === "bathroom").length,
    interiorArea: round(interior.reduce((a, r) => a + r.area, 0)),
    outdoorArea: round(house.rooms.filter((r) => r.type === "balcony").reduce((a, r) => a + r.area, 0)),
    rooms: house.rooms.length,
    estimated: house.rooms.some((r) => r.est),
  };
}

/**
 * Room a photo shows: march the camera's view line (on plan) until it hits a wall,
 * and take the room covering most of the visible stretch. Open-plan views resolve to the big room.
 */
export function photoRoom(house: Pick<CompiledHouse, "rooms" | "photoCams" | "colliders">, photo: string): string | null {
  const cam = house.photoCams.find((c) => c.photo === photo);
  if (!cam) return null;
  const a: Vec2 = [cam.pos[0], cam.pos[2]];
  const dx = cam.lookAt[0] - a[0];
  const dz = cam.lookAt[2] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const count = new Map<string, number>();
  for (let t = 0.1; t < 25; t += 0.1) {
    const p: Vec2 = [a[0] + (dx / len) * t, a[1] + (dz / len) * t];
    if (house.colliders.some((c) => pointSegment(p, c.a, c.b).d < c.radius)) break;
    const r = roomAt(house, p);
    if (!r) break;
    count.set(r.id, (count.get(r.id) ?? 0) + 1);
  }
  let best: string | null = roomAt(house, a)?.id ?? null;
  let n = 0;
  for (const [id, c] of count) if (c > n) [best, n] = [id, c];
  return best;
}

export function roomInfos(house: CompiledHouse): RoomInfo[] {
  return house.rooms.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    area: Math.round(r.area * 10) / 10,
    est: r.est,
    photos: house.photoCams.filter((c) => photoRoom(house, c.photo) === r.id).map((c) => c.photo),
    hotspot: house.hotspots.find((h) => h.room === r.id)?.id ?? null,
  }));
}

/** Default look target: room centre, or the farthest corner when standing near the centre. */
function defaultLook(pos: Vec2, room: CompiledRoom): Vec2 {
  const c = centroid(room.poly);
  if (Math.hypot(c[0] - pos[0], c[1] - pos[1]) > 0.8) return c;
  return room.poly.reduce((best, p) => (Math.hypot(p[0] - pos[0], p[1] - pos[1]) > Math.hypot(best[0] - pos[0], best[1] - pos[1]) ? p : best));
}

export function guidedStops(house: CompiledHouse): GuidedStop[] {
  const stops: GuidedStop[] = [];
  for (const id of house.tour) {
    const h = house.hotspots.find((x) => x.id === id);
    const room = h && house.rooms.find((r) => r.id === h.room);
    if (!h || !room) continue;
    const pos: Vec2 = [h.pos[0], h.pos[2]];
    const text = house.narration[room.id] ?? "";
    stops.push({
      hotspot: h.id,
      room: room.id,
      title: h.label ?? room.name,
      pos,
      yaw: yawTowards(pos, h.look ?? defaultLook(pos, room)),
      text,
      seconds: speechSeconds(text || room.name),
    });
  }
  return stops;
}

export function guidedSeconds(house: CompiledHouse): number {
  const intro = house.narration._intro ? speechSeconds(house.narration._intro) : 0;
  return intro + guidedStops(house).reduce((a, s) => a + s.seconds + 1, 0);
}

export function formatDuration(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} min`;
}

/** One-line description for covers and link previews. */
export function tourSummary(house: CompiledHouse): string {
  if (house.meta.summary) return house.meta.summary;
  const f = tourFacts(house);
  const beds = f.bedrooms ? `${f.bedrooms}-bedroom` : "Studio";
  return `${beds} ${house.meta.kind}${house.meta.locality ? ` in ${house.meta.locality}` : ""} — about ${Math.round(f.interiorArea)} m² inside. Explore it in 3D.`;
}

/** SVG-ready plan geometry, y = plan z. */
export function planGeometry(house: CompiledHouse, pad = 0.4) {
  const [x0, z0] = house.bounds.min;
  const [x1, z1] = house.bounds.max;
  return {
    viewBox: `${x0 - pad} ${z0 - pad} ${x1 - x0 + pad * 2} ${z1 - z0 + pad * 2}`,
    rooms: house.rooms.map((r) => ({ id: r.id, name: r.name, est: r.est, balcony: r.type === "balcony", d: `M${r.poly.map((p) => p.join(" ")).join("L")}Z`, label: centroid(r.poly) })),
  };
}
