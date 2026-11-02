import type { CompiledHouse } from "./compiled";
import { pointInPolygon, pointSegment } from "./geometry";
import type { Vec2 } from "./house-spec";

/** Walker radius (m). */
export const BODY = 0.22;

type Walkable = Pick<CompiledHouse, "rooms" | "colliders" | "obstacles">;

/** True when a walker of radius `body` can't stand at `p`: outside every room, against a wall, or in furniture. */
export function walkBlocked(house: Walkable, p: Vec2, body = BODY): boolean {
  if (!house.rooms.some((r) => pointInPolygon(p, r.poly))) return true;
  if (house.colliders.some((c) => pointSegment(p, c.a, c.b).d < c.radius + body)) return true;
  for (const ob of house.obstacles) {
    if (pointInPolygon(p, ob)) return true;
    for (let i = 0; i < ob.length; i++) if (pointSegment(p, ob[i], ob[(i + 1) % ob.length]).d < body) return true;
  }
  return false;
}

/** Straight path a→b is walkable (sampled every 10 cm, endpoints may sit on a blocked edge). */
export function pathClear(house: Walkable, a: Vec2, b: Vec2, body = BODY): boolean {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (walkBlocked(house, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], body)) return false;
  }
  return true;
}
