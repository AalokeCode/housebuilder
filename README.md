# 3D House Tours

Turn listing photos into tourable, lightly editable 3D apartments that run in the browser on Android, iOS and desktop.

- **Interior tours** (`/tour/<slug>`): first-person walk + floor hotspots, dollhouse view, photo-match cameras, per-room voice-over with line-by-line subtitles.
- **Drone showcases** (`/site/<slug>`): exterior building + surroundings, keyframed aerial camera chapters, glowing outline on the highlighted element, procedural curtain-wall facade shader, voice-over with word-synced subtitles.
- **Agent pipeline**: Claude Code converts reference images → `HouseSpec` JSON → validated → rendered. See `/convert-house`.

Stack: Next.js 16 (App Router, Cache Components) · React 19 · three.js 0.187 · React Three Fiber 9 · drei · postprocessing (N8AO) · Zod 4 · Zustand · Tailwind 4 · Lucide.

---

## Quick start

```bash
pnpm install
pnpm assets:fetch            # CC0 models, textures, HDRI skybox → public/ (≈17 MB, one-off)
pnpm dev -p 3210             # http://localhost:3210
```

| URL | What |
|---|---|
| `/` | list of houses |
| `/tour/<slug>` | the tour |
| `/preview/<slug>?cam=01a&clean=1` | photo-match camera, UI hidden (for screenshots) |
| `/tour/<slug>?mode=dollhouse` | dollhouse (cut-away) view |
| `/site/<slug>` | drone showcase (`?chapter=<n>&t=0..1&clean=1` for screenshots) |

## Scripts

| Script | Purpose |
|---|---|
| `pnpm house:validate <slug> [--shell] [--room <id>] [--json]` | schema + geometry + content checks (exit 1 on errors) |
| `pnpm house:preview <slug> [--port 3210]` | validate, then start dev server and print photo-match URLs |
| `pnpm assets:fetch [models\|textures\|hdri\|<id>…]` | download free assets listed in `scripts/fetch-assets.ts`; regenerates `public/models/LICENSES.md` |
| `pnpm exec tsx scripts/site-validate.ts <slug>` | validate a drone-showcase `sites/<slug>/site.json` |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | quality gates |

## Adding a house (agents)

```
/convert-house <slug>
```
Put the photos in `houses/<slug>/refs/` first (or attach them in chat). The skill follows
`.ai-workflow/contracts/house-conversion-runbook.md` end to end: photo index → room polygons → furniture →
validate → photo-match screenshots → `report.md`.

---

## Architecture

```
houses/<slug>/house.json + work/rooms/*.items.json      (agent-authored HouseSpec v1)
        │  FileHouseRepository (src/server)              reads + zod-parses
        ▼
HouseCompiler (src/domain/compiler.ts)                   pure: rooms → walls/openings/items/colliders
HouseValidator (src/domain/validator.ts)                 geometry + content checks
        │  HouseService                                  load → compile → validate
        ▼
/tour/[slug] (server, connection() → always fresh)  ──►  Viewer (client-only R3F)
                                                          ├─ scene/Structure   merged walls, floors, ceilings, openings
                                                          ├─ scene/Kitchen     fixture runs
                                                          ├─ furniture/*       procedural builders + optional GLB
                                                          ├─ scene/Atmosphere  HDRI sky, contact shadows, N8AO
                                                          ├─ controls/Tour…    walk / dollhouse / photo
                                                          └─ ui/*              overlay, joystick, subtitles
```

| Folder | Responsibility |
|---|---|
| `src/domain/` | Zod schemas (`house-spec.ts`), compiled types, geometry utils, `Catalog`, `HouseCompiler`, `HouseValidator` — no React, no fs |
| `src/server/` | `FileHouseRepository` (fs), `HouseService` (app service) |
| `src/assets/catalog.json` | furniture + material catalog (one line per entry — grep it) |
| `src/viewer/` | everything rendered in the browser |
| `scripts/` | CLIs (validate, preview, fetch assets) |
| `houses/<slug>/` | per-house source data, work files, screenshots, report |
| `public/houses/<slug>/` | per-house images cropped from photos (art, fabrics) |
| `public/models`, `public/textures`, `public/env` | fetched CC0 assets (see `public/models/LICENSES.md`) |

### Key design decisions

- **Rooms, not walls, are authored.** Walls are derived from polygon edges (T-junction aware): shared edge → interior wall, lone edge → exterior wall offset outward (interior dimensions stay exact), balcony edge → glass railing, open-plan edge with ceiling step → bulkhead.
- **`against` placement.** Items reference a room edge + distance; the compiler snaps them to the wall surface and faces them into the room.
- **Procedural first, GLB optional.** Every catalog item renders procedurally; a `model` path upgrades it to a fitted GLB with the procedural one as the loading fallback.
- **Photo-sourced textures.** Artwork and patterned textiles are cropped (and perspective-corrected) straight from the listing photos.

### Mobile performance budget

| Technique | Where |
|---|---|
| `frameloop="demand"` — renders only while the camera moves or assets load | `Viewer.tsx`, `TourControls.tsx` |
| All wall pieces merged per material (1–2 draw calls) | `scene/Structure.tsx` |
| Orchid sprays merged to 3 draw calls each | `furniture/Furniture.tsx` |
| Contact shadows rendered once (`frames={1}`) | `scene/Atmosphere.tsx` |
| Tiering by `pointer: coarse`: DPR ≤ 1.5, half-res N8AO, no SMAA, no practical lamp lights, 4k skybox (8k desktop) | `Viewer.tsx`, `Atmosphere.tsx`, `Environment.tsx` |
| 1k textures; no realtime shadow maps | `scripts/fetch-assets.ts` |

### Drone showcases

`sites/<slug>/site.json` (`SiteSpec`, `src/domain/site-spec.ts`) → `compileSite` (pure, `src/domain/site-compiler.ts`) →
`/site/[slug]` → `src/site/` (R3F). Towers, podium, deck, entrance, signage, bridge, context blocks, landscape and
`chapters[]` (camera move + highlight ids + narration). Facade windows are drawn in a shader, palms/trees/filler city are
instanced, and the shadow map is baked once on desktop (none on phones): about 15–23 draw calls.

### Voice-over

Browser Web Speech API (free, no key) via `src/viewer/voice/narrator.ts`. Script lives in `house.json → narration`
(`_intro` + one entry per room). Captions are emitted per spoken word (`boundary` events, with a timer fallback)
and shown one short line at a time by `ui/Subtitles.tsx`. To switch to studio voices later, pre-render MP3s
with a TTS API at build time and replace `Narrator.speak()` — callers don't change.

## Licenses

Third-party assets: `public/models/LICENSES.md` (all CC0, Poly Haven). Procedural geometry and code: project license.
