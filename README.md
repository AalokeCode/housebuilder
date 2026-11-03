# 3D House Tours

A tour module that turns listing photos into 3D walkthroughs. They run in the browser on iOS, Android and desktop.

- **Interior tours** (`/tour/<slug>`):
  - Opens on a full-screen cover: the house as a slowly turning dollhouse on a black stage, with a floating card (title, facts, description). Choose a **guided tour** (one narrated stop per room, about 1 min) or free **exploration**; details, plan and photos are below the fold.
  - Free exploration keeps the view clear: the schematic map sits bottom-left (tap a room to go there), the tools (guided, walk, dollhouse, photo compare, voice, info) bottom-right next to `?` help. Walk mode has collision.
  - Voice-over comes with line-by-line subtitles that follow the speech.
- **Drone showcases** (`/site/<slug>`):
  - An aerial camera moves through chapters around a building and its surroundings.
  - The highlighted elements glow, and the voice-over has word-synced captions.
- **Agent pipeline**:
  - Claude Code turns reference images into a `HouseSpec` JSON, then validates, reviews and publishes it.
  - The skill is `/convert-house`.

Stack: Next.js 16 (App Router, Cache Components), React 19, three.js 0.187, React Three Fiber 9, drei, postprocessing (N8AO), Zod 4, Zustand, Tailwind 4, Lucide. Tests use Vitest and Playwright.

> Scope: this repo is the **tour module**. Listing data, enquiries/leads, accounts and analytics belong to the host app. A tour hands off to the host through `meta.cta` (a link) and can be linked to per room with `?room=<id>`.

## Examples

| Model | Kind | Route | Shows |
|---|---|---|---|
| `models/houses/dubai-1br-sample` | apartment (photo collage) | `/tour/dubai-1br-sample` | photo-only reconstruction, city skyline view, TRELLIS bed, photo-crop art/rugs |
| `models/houses/apple-farm-reference` | single-storey farmhouse (plan + photos) | `/tour/apple-farm-reference` | plan tracing with scale resolved against the published area, solved cameras, floor/ceiling/wall textures rectified from the photos, two-sided walls (concrete corridor), open deck (`terrace`), ground-level valley sky (`meta.sky`) |
| `models/buildings/bay-residences-sample` | tower site | `/site/bay-residences-sample` | drone showcase |

Apple Farm House is an architecture reference (2m2 architects; photos Shin Kyungsub, via ArchDaily). Its images are included for evaluation only. No redistribution licence has been established, so obtain permission before using them in marketing or a public deployment. Exterior photos and drawings stay local (`refs/context/` is git-ignored).

---

## Quick start

```bash
pnpm install
pnpm assets:fetch                 # free models, textures and HDRI → public/ (packed to meshopt GLBs)
pnpm dev -p 3210                  # http://localhost:3210
```

| URL | What |
|---|---|
| `/` | published tours and showcases |
| `/tour/<slug>` | public tour (published revisions only, prerendered, real 404 for unknown slugs) |
| `/tour/<slug>?tour=guided` · `?room=<id>` · `?mode=dollhouse` · `?cam=<photoId>` | deep links (unknown ids fall back safely) |
| `/preview/<slug>` | authoring preview: drafts, fresh file reads, validation panel (`?clean=1` hides the UI for screenshots) |
| `/site/<slug>` | drone showcase (`?chapter=<n>&t=0..1&clean=1` for screenshots) |

## Project layout

```
.
├── src/
│   ├── app/            routes: /, /tour/[slug], /preview/[slug], /site/[slug], sitemap, robots, 404, error
│   ├── domain/         pure TS — schemas, compiler, validator, collision, tour model (no React, no fs)
│   ├── server/         file repositories, HouseService (publish gate), cached read model (tour-catalog)
│   ├── tour-ui/        cover page, details, plan, gallery, sheet (shared by tour + fallback)
│   ├── viewer/         interior 3D viewer (R3F): scene, furniture, controls, guided flow, overlay UI
│   ├── site/           drone-showcase viewer (R3F)
│   ├── assets/         catalog.json, asset-manifest.json (content hashes), asset() helper
│   └── proxy.ts        locks /preview in production (PREVIEW_TOKEN)
├── models/             authored content, read at build time (paths: src/server/paths.ts) — not public/models/ (GLBs)
│   ├── houses/<slug>/      house.json, refs/ (photos, plan), work/ (per-room items, cameras, notes), shots/, report.md
│   └── buildings/<slug>/   site.json for drone showcases
├── public/             models/ (GLB), textures/, env/ (HDRI + skies), houses/<slug>/ (crops, textures, photos, og.jpg)
├── scripts/            CLI: validate, publish, preview, fetch/optimize assets, asset manifest
├── tests/              unit/ (Vitest, domain + repositories), e2e/ (Playwright, desktop + touch)
├── docs/               backlog (next-todo.md) and product/pipeline reviews
├── .claude/skills/     convert-house skill for agents
└── .ai-workflow/       contracts: conversion runbook, platform plan, tour-module production contract
```

## Scripts

| Script | Purpose |
|---|---|
| `pnpm house:validate <slug> [--shell] [--room <id>] [--json]` | schema, geometry, walkability and content checks (exit 1 on errors) |
| `pnpm house:publish <slug> [--cover <photoId>] [--draft]` | publish gate: validate, export listing photos, OG image and manifest, set `status: published` |
| `pnpm house:preview <slug>` | validate, start dev, print photo-match URLs |
| `pnpm site:validate <slug>` | validate a drone showcase |
| `pnpm assets:fetch [models\|textures\|hdri\|<id>…]` | download free assets (Poly Haven, ambientCG, Sketchfab, zip packs, direct URLs) → optimize → manifest |
| `pnpm assets:optimize [<id>…]` | pack models to one meshopt + WebP GLB each |
| `pnpm assets:manifest` | content-hash `/public` assets (runs automatically before `build`) |
| `python3 scripts/camera/solve-camera.py <cam.json>` | solve a photo-match camera from point correspondences (reprojection RMS per point) |
| `python3 scripts/skybox/build-skyline.py <src.jpg> public/env` | build the window-view skybox (skyline band only, horizon at eye level, no people) |
| `pnpm check` | typecheck + lint + unit tests + both content validators |
| `pnpm test` / `pnpm e2e` | Vitest unit tests / Playwright smoke (needs `pnpm build` first) |
| `pnpm build` / `pnpm start` | production build / server |

## Content lifecycle

```
refs/ photos ──/convert-house──▶ house.json (status: draft) ──▶ /preview/<slug>  (fresh, diagnostics)
                                         │ human approves
                                         ▼
                              pnpm house:publish <slug>   (validate → photos/OG → status: published)
                                         │ deploy / pnpm build
                                         ▼
                              /tour/<slug>  (prerendered, "use cache", served only if 0 errors)
```

- A published house that later fails validation is **not served**; the public route returns 404 and the error is logged. Drafts never appear publicly.
- `revision` is a content hash of `house.json` plus the item files, shown in "About this model".

## Architecture

```
models/houses/<slug>/house.json + work/rooms/*.items.json      (agent-authored HouseSpec v1)
        │  FileHouseRepository     slug check, safe JSON, path containment
        ▼
HouseCompiler (domain)            rooms → walls / openings / items / colliders / obstacles / guided tour
HouseValidator (domain)           geometry, content, walkable hotspots, tour ids
        │  HouseService            load → compile → validate → publish gate
        │  tour-catalog ("use cache")
        ▼
/tour/[slug]  ──► TourApp (cover, details, plan, gallery, fallbacks)
                    └─► Viewer (client-only R3F, mounted on intent)
                         ├─ scene/*        merged walls, floors, ceilings, kitchen, sky, AO
                         ├─ furniture/*    procedural builders + fitted GLBs
                         ├─ controls/*     walk (collision) · dollhouse · photo match
                         ├─ tour-flow.ts   travelTo (glide or fade-cut) · GuidedTour
                         └─ ui/*           overlay, mini-plan, photo compare, subtitles, joystick
```

### Key design decisions

- **Rooms, not walls, are authored.** Walls come from the polygon edges:
  - A shared edge becomes an interior wall.
  - A lone edge becomes an exterior wall.
  - A balcony edge becomes a glass railing; a `terrace` (deck) edge gets no wall, only a walking boundary.
  - Thick walls are two rooms' exterior walls back to back (leave a 0.5 m gap); perpendicular overlaps are trimmed by the compiler.
  - An open-plan edge with a ceiling step becomes a bulkhead.
- **Collision covers walls and furniture.** The compiler emits furniture and kitchen footprints as `obstacles`. Glides fall back to a fade-cut when the straight path is blocked, so the camera never passes through walls or furniture.
- **Honest media.**
  - "Actual photo", "3D reconstruction", "Estimated" and "Not photographed" labels sit next to the content they describe.
  - A photo's room is computed by ray-marching the view line from its photo-match camera.
- **Photo-exact surfaces.** Artwork, cushions and rugs are perspective-corrected crops of the listing photos. Floors, slatted ceilings, panelled or board-formed walls and decks are rectified through the solved camera (exact homography) and tiled as catalog materials (`image` + `tile`, world-metre UVs). Each face of an interior wall takes its own room's finish.
- **Solved cameras.** Photo-match cameras are fitted to structural points (`scripts/camera/solve-camera.py`); residuals drive layout corrections.
- **Real procedural construction.** Legs are anchored by both ends and sunk into what they carry, frames lap into walls, and nothing is coplanar (no flicker). Bedding uses draped cloth and puffy pillow geometry. Doors open on click.
- **Window view.** A photographic skybox per house (`meta.sky`, default: the river skyline for towers; ground-level houses use a raw CC0 panorama) is aimed at the main glazing; the HDRI is used for lighting only. Dollhouse views use a black backdrop.
- **Every failure path ends somewhere useful.**
  - No WebGL, a lost context or a viewer crash shows the photos, plan, room details and transcript, with a retry.
  - The browser back button closes the 3D view.

### Performance budget

| Technique | Where |
|---|---|
| 3D loads only on intent; the viewer chunk is prefetched at idle | `tour-ui/TourApp.tsx` |
| `frameloop="demand"` (renders only on change); `"never"` while the cover is shown | `viewer/Viewer.tsx` |
| Fixed DPR per quality tier (auto, or the user picks High/Low); no AdaptiveDpr | `viewer/prefs.ts` |
| Merged wall geometry per material; merged orchid sprays | `scene/Structure.tsx`, `furniture/Furniture.tsx` |
| Meshopt + WebP GLBs (models 10 MB → 2.6 MB) | `scripts/optimize-models.ts` |
| Content-hashed URLs (`?v=`) served `immutable`; tours prerendered and statically cached | `assets/asset-url.ts`, `next.config.ts` |
| Contact shadows rendered once; no realtime shadow maps; no N8AO halfRes | `scene/Atmosphere.tsx` |

## Testing & CI

- `tests/unit` (14 tests):
  - Covers the compiler, collision, the tour model, photo→room mapping, repository hardening (bad slugs, malformed JSON) and the publish gate.
- `tests/e2e` (7 scenarios × desktop + Pixel 7 touch):
  - 404 status, the cover → 3D path, rooms, dollhouse, photo compare, back navigation, the guided tour, stale deep links, the gallery without 3D, and the drone showcase.
  - Console errors fail a test.
- GitHub Actions (`.github/workflows/ci.yml`): `pnpm check`, the asset-manifest drift check, `build`, then e2e.

## Deployment

| Env var | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | canonical origin for metadata, OG and the sitemap |
| `PREVIEW_TOKEN` | enables `/preview` in production (`/preview/<slug>?token=…` once, then a cookie) |

- Static assets under `public/` are served immutable when versioned, so put a CDN in front.
- Pages read `models/houses/` and `models/buildings/` at build time, so ship `models/` with the build.

## Voice-over

- The browser Web Speech API provides the voice for free, with no key (`viewer/voice/narrator.ts`).
- When voice is muted or unsupported, the captions still play on a timer, so the guided tour works silently.
- To switch to studio voices, pre-render MP3s and replace `Narrator.speak()`; callers don't change.

## Licenses

- Third-party assets are listed in `public/models/LICENSES.md`:
  - Poly Haven CC0
  - ambientCG CC0
  - one model generated with TRELLIS
- Procedural geometry and code fall under the project license.
