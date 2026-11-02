# Contract — 3D House Tour Platform (3dhouse)

Status: DRAFT v1 · 2026-11-02 · Owner: Aaloke

## 1. Goal

Turn listing material for a property (photos always; floor plan and phone video sometimes) into a
**tourable, lightly editable 3D model** that runs in the browser on Android, iOS and desktop.

### Confirmed decisions
| Topic | Decision |
|---|---|
| Inputs | Listing photos = guaranteed. Floor plan = optional. Phone video = optional. |
| Fidelity | **Hybrid**: editable parametric model is the source of truth; photoreal splat layer is optional per room/unit |
| Editors | **Both**: team authors + publishes master; buyers get sandbox variants on top |
| Build | **Custom codebase**, borrow patterns from Pascal Editor (MIT) — do not fork |

### Non-goals (v1)
- Exact survey-grade dimensions from photos alone (flagged as "estimated").
- Exterior / facade modeling, multi-building sites.
- Native apps (web + PWA only).

---

## 2. Research findings that drive the design

1. **Few photos → accurate 3D is not solved.** Sparse-view splatting (InstantSplat etc.) gives floaters and no editable structure. Listing photos alone therefore produce an *estimated* layout that a human must confirm.
2. **Room layout from unposed sparse photos exists**: Plane-DUSt3R (ICLR 2025, code + HF weights) estimates wall/floor/ceiling planes from multiple perspective images with no camera poses and no overlap needed. VGGT / MASt3R give point maps + poses. → our photo-only geometry backbone.
3. **Metric scale from one image**: Apple Depth Pro (absolute-scale depth, no intrinsics) ≈ Depth Anything V2 indoors. Still needs validation against known objects (door ≈ 2.0–2.1 m, counter ≈ 0.9 m, ceiling ≈ 2.6–3.0 m).
4. **Floor plan image → vectors**: RasterScan API, CubiCasa5K-trained detectors, Qwen2.5-VL fine-tunes output walls/doors/rooms JSON. All need human correction.
5. **Photoreal from images**: World Labs Marble / World API (Jan 2026) — image(s), panorama or video → Gaussian splat (PLY/SPZ) + collider GLB; textured mesh on Pro. Output is **AI-imagined**, dimensions not trustworthy.
6. **Splat rendering in three.js**: Spark (sparkjs) — WebGL2, mixes splats with meshes, mobile-capable with budgets. Web delivery format: **SOG** (15–20× smaller than PLY) via PlayCanvas `splat-transform`.
7. **Editor reference**: Pascal Editor (MIT, Next 16 / React 19 / R3F / Zustand / Zod / Zundo / three-bvh-csg). Flat node dictionary + parentId, typed id prefixes. **WebGPU-only** → not acceptable as-is for our mobile reach.
8. **Renderer**: WebGPU now ships on iOS 26 Safari and Vulkan-capable Android Chrome, but Spark is WebGL2 and older phones lack WebGPU → **WebGL2 is v1 primary renderer**.
9. **R3F v9** supports React 19.0–19.2 → compatible with Next.js 16.
10. **Furniture**: CC0 (Poly Haven, Kenney, Quaternius) + commercial-free (FurniMesh, verify license) + image-to-3D (TRELLIS.2, Hunyuan3D 2.1, Meshy-6) for hero pieces.

Sources: arXiv 2502.16779 (Plane-DUSt3R), arXiv 2403.20309 (InstantSplat), worldlabs.ai/blog/announcing-the-world-api, docs.worldlabs.ai/marble/export/mesh, sparkjs.dev/docs/performance, github.com/playcanvas/splat-transform, github.com/pascalorg/editor, machinelearning.apple.com/research/depth-pro, r3f.docs.pmnd.rs/tutorials/v9-migration-guide.

---

## 3. System architecture

```
                         ┌───────────────────── INGESTION (async jobs) ─────────────────────┐
 Listing photos ───────► │ A. Photo Analyzer (VLM)  → room tags, objects, materials, style   │
 (always)                │ B. Geometry Estimator    → Plane-DUSt3R/VGGT planes + Depth Pro    │
                         │ C. Scale Resolver        → metric scale from object priors         │
 Floor plan (optional) ─►│ D. Plan Vectorizer       → walls/openings/rooms + OCR dimensions   │
 Video (optional) ─────► │ E. Splat Builder         → poses → gsplat / Marble → SOG           │
                         │ F. Evidence Fusion       → Draft FloorPlan + confidence per node   │
                         └────────────────────────────────┬─────────────────────────────────┘
                                                          ▼
                         ┌──────── AUTHORING (team, desktop) ────────┐
                         │ Calibrator: photo overlay, set 1 dimension │
                         │ 2D plan editor + 3D preview                │
                         │ Furniture matcher review                   │
                         │ Publish → immutable Version + baked assets │
                         └──────────────────┬─────────────────────────┘
                                            ▼
                         ┌──────── VIEWER (all devices) ─────────────┐
                         │ Tour: hotspots / walk / dollhouse / plan  │
                         │ Layers: parametric mesh ⇄ splat           │
                         │ Buyer sandbox: furniture, finishes, light │
                         │ interior-wall edits → Variant (patch)     │
                         └───────────────────────────────────────────┘
```

### 3.1 Ingestion tiers (evidence fusion)
Each source writes *evidence* with confidence; fusion picks the highest-trust source per concern.

| Concern | Photos only | + Floor plan | + Video |
|---|---|---|---|
| Wall layout | Plane-DUSt3R planes → polygon (low conf) | Vectorized plan (high) | Splat-derived planes (high) |
| Scale | Depth Pro + object priors (med) | OCR'd dimensions (high) | SfM + priors (high) |
| Furniture | VLM detect → catalog match | same | same + positions from splat |
| Materials/colors | VLM + palette extraction | same | same |
| Photoreal layer | Marble "AI preview" (labeled) | same | Real splat (gsplat/Marble video) |

Rule: anything not confirmed by plan/video/human stays flagged `estimated: true` and is shown as such in the UI.

### 3.2 Repo layout (pnpm/Turborepo monorepo)
```
apps/
  web/              Next.js 16 App Router — viewer, editor, dashboard, REST route handlers
  worker/           Python (FastAPI) GPU jobs: geometry, depth, vectorizer, splat build
packages/
  domain/           Zod schemas + entities (FloorPlan, Wall, Opening, Room, Item, Variant)
  scene/            pure builders: plan → three geometry (no React)
  viewer/           R3F components: Tour, Camera rigs, Splat layer, quality tiers
  editor/           2D SVG editor, tools, command bus, constraints
  assets/           catalog types, gltf-transform pipeline scripts
  ui/               shadcn/ui wrapper components
```

### 3.3 Domain model (packages/domain)
- Flat `Record<NodeId, Node>` + `parentId`, typed id prefixes (`wall_`, `opn_`, `room_`, `item_`) — pattern borrowed from Pascal.
- Nodes: `Level`, `Wall` (start/end vertex ids, thickness, height, `structural`), `Vertex`, `Opening` (door/window, wallId, offset, width, height, sill), `Room` (derived from wall graph cycles + name/type), `Slab`, `Ceiling`, `Item` (catalogId, transform), `MaterialAssignment`, `Hotspot`, `SplatLayer` (url, transform, roomIds).
- Every node: `provenance: 'photo' | 'plan' | 'video' | 'manual'`, `confidence: 0..1`, `locks: { move, delete, material }`.
- **Version** = immutable published snapshot. **Variant** = `baseVersionId` + ordered command log (replayable patch). Buyers never mutate a Version.

### 3.4 Backend (OOP, REST)
- Next.js route handlers → `Service` classes → `Repository` classes (Prisma) — DI via a small container.
- Postgres (Prisma) tables: `Organization`, `User`, `Property`, `SourceAsset`, `IngestJob`, `PlanDraft`, `Version`, `Variant`, `CatalogItem`.
- Object storage: Cloudflare R2 (photos, GLB, KTX2, SOG).
- Jobs: Postgres-backed queue (or Trigger.dev) → Python GPU worker on Modal/RunPod; Marble/World API + RasterScan as hosted fallbacks.
- Auth: Better Auth (team roles: `admin`, `author`; buyer: optional account to save variants; anonymous sandbox otherwise).

### 3.5 Rendering
- three.js `WebGLRenderer` (WebGL2) primary; WebGPU path behind a flag after Spark/WebGPU interop is verified.
- R3F v9 + drei. Spark for splats (`antialias: false`, capped DPR, splat budget per tier).
- Quality tiers via `detect-gpu`: 
  - **Low**: DPR ≤ 1.25, 1K KTX2, no SSAO, no realtime shadows, splat budget ~0.5–1 M.
  - **Mid**: DPR ≤ 1.5, 1K/2K, contact shadows, splats ~1.5 M.
  - **High**: DPR ≤ 2, 2K, N8AO, soft shadows, splats 3 M+.
- Lighting: HDRI env + per-room light probes + baked AO in furniture GLBs. **On publish**, optionally bake lightmaps (headless Blender job) for the master Version; buyer edits fall back to realtime lighting.
- Assets: gltf-transform (Meshopt + KTX2/UASTC/ETC1S), per-room lazy loading, instancing for repeated items.
- Budgets: first interactive < 15 MB, ≤ 150 draw calls / ≤ 300k tris on low tier, iOS tab memory < ~1 GB.

### 3.6 Navigation & mobile UX
- Default **hotspot teleport** (tap floor ring → eased camera move), **walk** (virtual joystick + drag-look), **dollhouse** orbit, **2D minimap** with you-are-here.
- Gyroscope look (iOS `DeviceOrientationEvent.requestPermission`), fullscreen + safe-area insets, collision via wall segments (2D raycast, no physics engine).
- Editor on phones: furniture + finishes only. Wall editing on tablet/desktop.

### 3.7 Editing rules
| Action | Team (author) | Buyer sandbox |
|---|---|---|
| Move/split exterior & `structural` walls | ✓ | ✗ |
| Move interior partitions | ✓ | ✓ (within constraints) |
| Add/move/resize openings | ✓ | doors/windows on non-structural only |
| Furniture add/move/swap | ✓ | ✓ |
| Wall paint / floor finish | ✓ | ✓ |
| Publish Version | ✓ | ✗ (save Variant only) |

Commands (`MoveVertex`, `AddOpening`, `PlaceItem`, `SetMaterial`, …) are the only mutation path → undo/redo, Variant replay, audit trail.

---

## 4. Phases & exit criteria

### P0 — Spikes (de-risk before building) · ~1 week
1. **Geometry spike**: run Plane-DUSt3R + Depth Pro on the sample apartment photos → do we get a usable wall polygon? Measure error vs manual estimate.
2. **Marble spike**: generate a world from the same 3 photos; assess quality, cost, export (SPZ/PLY + collider).
3. **Mobile render spike**: R3F + Spark + 1 room mesh + 1 SOG splat on a low-end Android + iPhone; record FPS/memory.
4. **Plan vectorizer spike**: RasterScan vs VLM-to-JSON on 3 sample floor plans.
- Exit: written results in `.ai-workflow/research/spikes.md` + go/no-go per tier.

### P1 — Foundation · 
- Monorepo, TS strict, ESLint + Prettier, Zod domain schemas, Prisma schema, R2 wiring, CI build.
- Exit: `pnpm build` clean, domain unit tests for wall graph → room detection.

### P2 — Scene builder + viewer (hand-authored plan)
- Wall/opening/slab/ceiling builders, material catalog, 10 furniture GLBs, quality tiers, hotspot/walk/dollhouse.
- Exit: sample apartment tour 60 fps mid-tier / ≥ 30 fps low-tier on real devices.

### P3 — Authoring editor
- 2D SVG plan editor, command bus + undo, constraints, photo-overlay calibrator, furniture placement, publish → Version.
- Exit: author recreates sample unit from photos in < 30 min.

### P4 — Ingestion pipeline (photos-only tier)
- **Primary path: agent-authored.** Claude Code instances convert image references → HouseSpec v1 per `.ai-workflow/contracts/house-conversion-runbook.md`. Requires `packages/domain` `compileHouseSpec` + `pnpm house:validate` / `house:preview` CLIs (build these in P1–P2).
- Secondary (later, optional): ML assist — geometry estimator (Plane-DUSt3R), scale resolver (Depth Pro), catalog matcher (CLIP) feeding the agent as extra evidence.
- Exit: draft needs ≤ 10 manual corrections on 5 test listings.

### P5 — Optional tiers
- Floor plan vectorizer; video → splat (VGGT/COLMAP poses → gsplat → SOG) with Marble fallback; splat ⇄ mesh alignment (3-point + ICP).
- Exit: splat layer registered within ~5 cm visual tolerance on a test unit.

### P6 — Buyer sandbox + persistence
- Variants (command log), share links, optional buyer accounts, publish-time lightmap bake.
- Exit: buyer edits survive reload/share; master Version untouched.

### P7 — Hardening
- PWA, per-room streaming, Lighthouse on all routes, device matrix QA, a11y on 2D UI, error states.

---

## 5. Risks
| Risk | Mitigation |
|---|---|
| Photos-only layout too inaccurate | Human calibrator is mandatory step; `estimated` badges; plan/video upgrades data later |
| Marble output misrepresents property (legal) | Label "AI-generated preview"; never default view; disclaimer on listing |
| Listing photo copyright | Only process photos owner/agent uploads with rights confirmation |
| iOS memory crashes | Hard budgets per tier, per-room unloading, SOG streaming |
| Spark ↔ WebGPU incompatibility | WebGL2 primary until verified |
| GPU job cost | Cache per property, hosted APIs only as fallback, job quotas |
| Furniture license mix | `CatalogItem.license` field required; block publish on unknown license |

## 6. Open items (decide after P0)
- Hosted vs self-hosted GPU (Modal vs RunPod vs pure API).
- Better Auth vs Clerk.
- Whether buyer interior-wall moves stay in v1 or move to v2.
