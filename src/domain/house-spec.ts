import { z } from "zod";

/**
 * HouseSpec v1 — the agent-authored source format.
 * Units: meters / degrees. Plan axes: x → east, z → south (z down on plan). Y up in 3D.
 * Room polygons are clockwise as seen on the plan.
 */

export const Vec2 = z.tuple([z.number(), z.number()]);
export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec2 = z.infer<typeof Vec2>;
export type Vec3 = z.infer<typeof Vec3>;

export const Id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "ids must be kebab-case");

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "hex color like #aabbcc");

export const MaterialRef = z.union([
  z.string().min(1),
  z.object({ color: Hex, rough: z.number().min(0).max(1).optional() }),
]);
export type MaterialRef = z.infer<typeof MaterialRef>;

export const RoomType = z.enum([
  "living",
  "kitchen",
  "dining",
  "bedroom",
  "bathroom",
  "hall",
  "balcony",
  "terrace",
  "storage",
  "other",
]);
export type RoomType = z.infer<typeof RoomType>;

/** Open-air room types: no ceiling, excluded from the interior area. Balconies get a glass railing; terraces (decks) none. */
export const isOutdoor = (t: RoomType) => t === "balcony" || t === "terrace";

export const RoomSpec = z.object({
  id: Id,
  type: RoomType,
  name: z.string().min(1),
  poly: z.array(Vec2).min(3),
  floor: MaterialRef,
  walls: MaterialRef,
  wallOverrides: z.record(z.string(), MaterialRef).optional(),
  ceiling: z
    .object({
      height: z.number().positive(),
      material: MaterialRef.optional(),
      features: z.array(z.string()).optional(),
    })
    .optional(),
  openTo: z.array(Id).optional(),
  est: z.boolean().optional(),
});
export type RoomSpec = z.infer<typeof RoomSpec>;

export const OpeningKind = z.enum(["door", "slider", "window", "opening", "entrance"]);
export type OpeningKind = z.infer<typeof OpeningKind>;

const OpeningBase = z.object({
  id: Id,
  kind: OpeningKind,
  at: z.number().min(0),
  w: z.number().positive(),
  h: z.number().positive(),
  sill: z.number().min(0).optional(),
  swing: z.enum(["in-left", "in-right", "out-left", "out-right"]).optional(),
  frame: MaterialRef.optional(),
  leaf: MaterialRef.optional(),
  est: z.boolean().optional(),
});

export const OpeningSpec = z.union([
  OpeningBase.extend({ between: z.tuple([Id, Id]) }),
  OpeningBase.extend({ room: Id, edge: z.number().int().min(0) }),
]);
export type OpeningSpec = z.infer<typeof OpeningSpec>;

export const FixtureSpec = z.object({
  id: Id,
  kind: z.literal("kitchen"),
  room: Id,
  edge: z.number().int().min(0),
  from: z.number().min(0),
  to: z.number().positive(),
  base: MaterialRef,
  top: MaterialRef,
  upper: MaterialRef.optional(),
  splash: MaterialRef.optional(),
  appliances: z.array(z.object({ cat: z.string(), at: z.number().min(0) })).optional(),
  est: z.boolean().optional(),
});
export type FixtureSpec = z.infer<typeof FixtureSpec>;

export const LightSpec = z.object({
  room: Id,
  kind: z.enum(["downlight", "pendant", "linear"]),
  grid: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  cat: z.string().optional(),
  pos: Vec2.optional(),
  /** linear diffuser: start/end on plan */
  line: z.tuple([Vec2, Vec2]).optional(),
});
export type LightSpec = z.infer<typeof LightSpec>;

export const HotspotSpec = z.object({
  id: Id,
  room: Id,
  pos: Vec2,
  /** plan point the guided tour faces at this stop (default: room centre / longest view) */
  look: Vec2.optional(),
  /** buyer-facing label for the chip (default: room name) */
  label: z.string().min(1).optional(),
});
export type HotspotSpec = z.infer<typeof HotspotSpec>;

export const PhotoCamSpec = z.object({
  photo: z.string().min(1),
  pos: Vec3,
  lookAt: Vec3,
  fov: z.number().min(10).max(120),
  est: z.boolean().optional(),
});
export type PhotoCamSpec = z.infer<typeof PhotoCamSpec>;

export const HouseMeta = z.object({
  title: z.string().min(1),
  kind: z.enum(["apartment", "villa", "townhouse"]),
  ceiling: z.number().positive(),
  sources: z.array(z.enum(["photos", "plan", "video"])).min(1),
  areaBrief: z.number().positive().nullable().optional(),
  /** draft = only on /preview; published = public /tour */
  status: z.enum(["draft", "published"]).default("draft"),
  /** one-sentence cover / share description */
  summary: z.string().max(240).optional(),
  locality: z.string().optional(),
  /** ISO date the model was last reviewed */
  reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").optional(),
  /** window view: equirect background under /public/env (default: the city skyline). `yaw` aims its centre (rad). */
  sky: z.object({ low: z.string().startsWith("/"), high: z.string().startsWith("/"), yaw: z.number().optional() }).optional(),
  /** hand-off to the host listing / enquiry page (the tour module has no lead capture) */
  cta: z.object({ label: z.string().min(1).max(40), href: z.string().min(1) }).optional(),
});
export type HouseMeta = z.infer<typeof HouseMeta>;

export const HouseSpec = z.object({
  spec: z.literal("housespec/1"),
  slug: Id,
  meta: HouseMeta,
  rooms: z.array(RoomSpec).min(1),
  openings: z.array(OpeningSpec).default([]),
  fixtures: z.array(FixtureSpec).default([]),
  items: z.string().default("work/rooms/*.items.json"),
  lights: z.array(LightSpec).default([]),
  hotspots: z.array(HotspotSpec).default([]),
  photoCams: z.array(PhotoCamSpec).default([]),
  /** voice-over script: room id → text. `_intro` plays on start. */
  narration: z.record(z.string(), z.string()).default({}),
  /** guided-tour order as hotspot ids (default: first hotspot of each room, in hotspot order) */
  tour: z.array(Id).optional(),
});
export type HouseSpec = z.infer<typeof HouseSpec>;

/** Item placement: either absolute `pos` or wall-relative `against`. */
export const ItemSpec = z
  .object({
    id: Id.optional(),
    cat: z.string().min(1),
    pos: Vec2.optional(),
    rotY: z.number().optional(),
    against: z.object({ edge: z.number().int().min(0), at: z.number().min(0) }).optional(),
    gap: z.number().min(0).optional(),
    /** floor items: bottom elevation. wall items: center height. */
    y: z.number().optional(),
    size: z.union([Vec2, Vec3]).optional(),
    color: Hex.optional(),
    /** image under /public (e.g. artwork cropped from a reference photo) */
    image: z.string().startsWith("/").optional(),
    note: z.string().optional(),
    est: z.boolean().optional(),
  })
  .refine((v) => (v.pos ? !v.against : !!v.against), {
    message: "item needs exactly one of `pos` or `against`",
  });
export type ItemSpec = z.infer<typeof ItemSpec>;

export const RoomItemsFile = z.object({
  room: Id,
  items: z.array(ItemSpec).default([]),
  decor: z.array(ItemSpec).default([]),
});
export type RoomItemsFile = z.infer<typeof RoomItemsFile>;
