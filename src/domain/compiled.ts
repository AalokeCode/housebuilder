import type { MaterialRef, OpeningKind, PhotoCamSpec, RoomType, Vec2, Vec3 } from "./house-spec";
import type { Mount } from "./catalog";

export type WallKind = "wall" | "railing" | "bulkhead";

export interface CompiledOpening {
  id: string;
  kind: OpeningKind;
  /** distance from wall.a to the opening's near side, along the wall */
  offset: number;
  w: number;
  h: number;
  sill: number;
  swing?: string;
  frame: MaterialRef;
  leaf: MaterialRef;
  est: boolean;
}

export interface CompiledWall {
  id: string;
  kind: WallKind;
  a: Vec2;
  b: Vec2;
  thickness: number;
  bottom: number;
  top: number;
  material: MaterialRef;
  rooms: string[];
  exterior: boolean;
  openings: CompiledOpening[];
}

export interface CompiledRoom {
  id: string;
  type: RoomType;
  name: string;
  poly: Vec2[];
  area: number;
  center: Vec2;
  floor: MaterialRef;
  walls: MaterialRef;
  ceilingHeight: number;
  ceilingMaterial: MaterialRef;
  hasCeiling: boolean;
  est: boolean;
}

export interface CompiledItem {
  id: string;
  room: string;
  cat: string;
  builder: string;
  /** optional GLB under /public (fitted into `size`) */
  model?: string;
  mount: Mount;
  /** x, y (bottom for floor, center for wall, top for ceiling), z */
  pos: Vec3;
  rotY: number;
  size: Vec3;
  colors: Record<string, string>;
  placeholder: boolean;
  decor: boolean;
  est: boolean;
  note?: string;
}

export interface CompiledFixture {
  id: string;
  kind: "kitchen";
  room: string;
  /** center of the run at the wall surface */
  origin: Vec2;
  rotY: number;
  length: number;
  ceiling: number;
  base: MaterialRef;
  top: MaterialRef;
  upper?: MaterialRef;
  splash?: MaterialRef;
  /** `at` = appliance center on the run's local x axis (0 = run center, + = viewer's right when facing the wall) */
  appliances: { cat: string; at: number; size: Vec3; colors: Record<string, string> }[];
}

export interface CompiledLight {
  room: string;
  kind: "downlight" | "pendant" | "linear";
  pos: Vec3;
  end?: Vec3;
}

export interface CompiledHotspot {
  id: string;
  room: string;
  pos: Vec3;
}

export interface Collider {
  a: Vec2;
  b: Vec2;
  radius: number;
}

export interface CompiledHouse {
  slug: string;
  title: string;
  sources: string[];
  rooms: CompiledRoom[];
  walls: CompiledWall[];
  items: CompiledItem[];
  fixtures: CompiledFixture[];
  lights: CompiledLight[];
  hotspots: CompiledHotspot[];
  photoCams: PhotoCamSpec[];
  colliders: Collider[];
  narration: Record<string, string>;
  bounds: { min: Vec2; max: Vec2 };
}

export interface Issue {
  level: "error" | "warn";
  code: string;
  where: string;
  msg: string;
}
