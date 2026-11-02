import { z } from "zod";

/**
 * Exterior "drone showcase" site spec (sites/<slug>/site.json).
 * Units: metres. Plan axes: x → east, z → south, y up. Angles in degrees.
 * Agent-authorable: every field is plain JSON, defaults keep files short.
 */

export const SiteVec2 = z.tuple([z.number(), z.number()]);
export const SiteVec3 = z.tuple([z.number(), z.number(), z.number()]);
export type SiteVec2 = z.infer<typeof SiteVec2>;
export type SiteVec3 = z.infer<typeof SiteVec3>;

const Id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "ids are lowercase kebab-case");
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colour must be #rrggbb");

export const FacadePalette = z.object({
  light: Hex.default("#86c4ec"),
  mid: Hex.default("#2f6cbf"),
  glass: Hex.default("#a3b0b8"),
  mullion: Hex.default("#f1f3f4"),
  /** share of columns-runs painted light blue (vertical banding) */
  lightRatio: z.number().min(0).max(1).default(0.3),
  /** share of runs painted mid blue (denser near the base) */
  midRatio: z.number().min(0).max(1).default(0.1),
});
export type FacadePalette = z.infer<typeof FacadePalette>;

export const TowerSpec = z.object({
  id: Id,
  name: z.string(),
  /** footprint centre (x, z) */
  pos: SiteVec2,
  footprint: z.object({
    w: z.number().positive(),
    d: z.number().positive(),
    /** corner radii [front-right, back-right, back-left, front-left]; "front" = local +z */
    radii: z.tuple([z.number().min(0), z.number().min(0), z.number().min(0), z.number().min(0)]).default([9, 3, 3, 9]),
  }),
  floors: z.number().int().min(1).max(120),
  floorHeight: z.number().positive().default(3),
  panelWidth: z.number().positive().default(1.4),
  rotY: z.number().default(0),
  /** recessed balcony stack on a local side ("left" = local −x, "right" = local +x) */
  balcony: z.object({ side: z.enum(["left", "right"]), width: z.number().positive().default(7) }).optional(),
  palette: FacadePalette.partial().optional(),
  seed: z.number().int().default(1),
});
export type TowerSpec = z.infer<typeof TowerSpec>;

export const PodiumSpec = z.object({
  id: Id.default("podium"),
  name: z.string().default("Retail podium"),
  polygon: z.array(SiteVec2).min(3),
  height: z.number().positive().default(13),
  retailHeight: z.number().positive().default(5),
  color: Hex.default("#e9e8e3"),
});

export const DeckSpec = z.object({
  id: Id.default("deck"),
  name: z.string().default("Amenity deck"),
  /** pool rectangles on the podium roof: [x, z, w, d] */
  pools: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).default([]),
  /** planter boxes: [x, z, w, d] */
  planters: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).default([]),
  /** small deck trees / umbrellas (x, z) */
  trees: z.array(SiteVec2).default([]),
});

export const EntranceSpec = z.object({
  id: Id.default("entrance"),
  name: z.string().default("Arrival & parking"),
  /** opening centre on the podium face (x, z) */
  pos: SiteVec2,
  rotY: z.number().default(0),
  width: z.number().positive().default(14),
  height: z.number().positive().default(6),
  /** drop-off forecourt polygon */
  forecourt: z.array(SiteVec2).min(3).optional(),
});

export const SignageSpec = z.object({
  id: Id.default("signage"),
  text: z.string().default("BAY RESIDENCES"),
  sub: z.string().optional(),
  /** centre (x, y, z) of the sign panel */
  pos: SiteVec3,
  rotY: z.number().default(0),
  width: z.number().positive().default(16),
  height: z.number().positive().default(3),
});

export const BridgeSpec = z.object({
  id: Id.default("bridge"),
  name: z.string().default("Pedestrian bridge"),
  from: SiteVec2,
  to: SiteVec2,
  y: z.number().default(6),
  width: z.number().positive().default(4),
  height: z.number().positive().default(3.5),
});

export const ContextBlockSpec = z.object({
  id: Id,
  name: z.string(),
  kind: z.enum(["midrise", "office"]),
  pos: SiteVec2,
  /** [w, h, d] */
  size: SiteVec3,
  rotY: z.number().default(0),
  color: Hex.default("#efe6c8"),
  accent: Hex.default("#f2c94c"),
});

export const FillerSpec = z.object({
  count: z.number().int().min(0).max(400).default(120),
  inner: z.number().positive().default(260),
  outer: z.number().positive().default(900),
  seed: z.number().int().default(7),
});

export const PalmSpec = z.union([SiteVec2, z.object({ pos: SiteVec2, height: z.number().positive() })]);

export const LandscapeSpec = z.object({
  id: Id.default("landscape"),
  palms: z.array(PalmSpec).default([]),
  trees: z.array(SiteVec2).default([]),
  hedges: z.array(z.array(SiteVec2).min(2)).default([]),
  hedgeWidth: z.number().positive().default(1.4),
  hedgeHeight: z.number().positive().default(1.1),
  paving: z.array(z.array(SiteVec2).min(3)).default([]),
  road: z.object({
    id: Id.default("road"),
    name: z.string().default("Road frontage"),
    path: z.array(SiteVec2).min(2),
    width: z.number().positive().default(18),
    lanes: z.number().int().min(1).max(8).default(4),
    sidewalk: z.number().min(0).default(3.5),
  }),
});

export const OrbitMove = z.object({
  kind: z.literal("orbit"),
  center: SiteVec3,
  radius: z.number().positive(),
  /** camera height (y) at start and end */
  height: z.union([z.number(), z.tuple([z.number(), z.number()])]),
  /** compass-ish angle: 0 = camera south of centre (looking north), 90 = east */
  startDeg: z.number(),
  sweepDeg: z.number(),
  /** radius at end (defaults to radius) — lets an orbit also push in/out */
  endRadius: z.number().positive().optional(),
});

export const DollyMove = z.object({
  kind: z.literal("dolly"),
  from: SiteVec3,
  to: SiteVec3,
  lookFrom: SiteVec3,
  lookTo: SiteVec3.optional(),
});

export const CameraMoveSpec = z.discriminatedUnion("kind", [OrbitMove, DollyMove]);
export type CameraMoveSpec = z.infer<typeof CameraMoveSpec>;

export const ChapterSpec = z.object({
  id: Id,
  title: z.string(),
  /** element / group ids to outline */
  highlight: z.array(Id).default([]),
  camera: CameraMoveSpec,
  /** seconds; the chapter lasts max(durationHint, narration estimate) */
  durationHint: z.number().positive().default(10),
  narration: z.string().min(1),
});

export const SiteSpec = z.object({
  version: z.literal(1).default(1),
  meta: z.object({
    title: z.string(),
    location: z.string().default(""),
    disclaimer: z.string().optional(),
  }),
  units: z.literal("m").default("m"),
  towers: z.array(TowerSpec).min(1),
  podium: PodiumSpec,
  deck: DeckSpec.optional(),
  entrance: EntranceSpec.optional(),
  signage: SignageSpec.optional(),
  bridge: BridgeSpec.optional(),
  context: z.array(ContextBlockSpec).default([]),
  filler: FillerSpec.optional(),
  landscape: LandscapeSpec,
  /** named highlight groups, e.g. { "towers": ["t1", …] } */
  groups: z.record(Id, z.array(Id)).default({}),
  chapters: z.array(ChapterSpec).min(1),
});
export type SiteSpec = z.infer<typeof SiteSpec>;
export type SiteSpecInput = z.input<typeof SiteSpec>;
