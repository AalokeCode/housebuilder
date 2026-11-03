---
name: convert-house
description: Convert listing photos (and optional floor plan / video notes) of a property into a tourable 3D house (HouseSpec v1) with validation, photo-match screenshots, warm lighting, photo-sourced textures, free/generated 3D models and voice-over with line-by-line subtitles. Use when the user says "convert house", "build this apartment", "/convert-house <slug>", or drops reference images for a new unit. Exterior building / tower images → drone showcase in sites/ (see "Exterior buildings").
---

# /convert-house <slug>

You turn reference images into `models/houses/<slug>/house.json` + per-room item files that this repo compiles into a 3D tour.

**Layout:** authored content lives in `models/houses/<slug>/` (interiors) and `models/buildings/<slug>/` (drone showcases) — don't confuse with `public/models/` (GLB assets). Public crops/textures/listing photos go in `public/houses/<slug>/` (URL `/houses/<slug>/…`). Copy the structure of the examples: `dubai-1br-sample` (photo collage only) and `apple-farm-reference` (plan + photos: scale resolved against the published area, solved cameras, rectified surfaces, `terrace` deck, `meta.sky`). Add a finished house to `pnpm check` (package.json) so it stays validated.

**The full procedure is `.ai-workflow/contracts/house-conversion-runbook.md`. Read it once, top to bottom, before touching the house.** Do not read other `.ai-workflow/` files.

## Fast path

1. **Intake**: images must be in `models/houses/<slug>/refs/`. If the user attached images in chat, copy them there (`01.jpg`, `02.jpg`, …). Split collages into panels (`01a`, `01b`, …) with PIL — see runbook Stage 1. Optional: `brief.md`, `plan.png`, `video-notes.md`. Only photos you will photo-match stay at the top level of `refs/` (the validator wants a `photoCam` per file there); exterior shots, illustrations and drawings go in `refs/context/`. **A PDF/property pack** → use its extracted images (e.g. `samples/real-estate/<pack>/refs`) and register media ids (H05…) as photo ids.
2. **Photo index** (view every image exactly once) → `models/houses/<slug>/work/photo-index.json`.
3. **Shell** → `house.json` (rooms as clockwise polygons, openings, fixtures, lights, hotspots with `look`, photoCams, narration, `tour` order, `meta.summary`/`locality`; leave `meta.status: "draft"`).
   `pnpm house:validate <slug> --shell` until clean.
4. **Furnish** → `work/rooms/<roomId>.items.json`. Grep the catalog, never read it whole:
   `grep -o '"[a-z-]*\.[a-z0-9.-]*": {"builder": "[a-zA-Z]*"' src/assets/catalog.json`
   ≤ 3 furnished rooms: do it yourself. More: spawn one worker per room with the runbook §2 prompt template (only if the user asked for sub-agents).
   `pnpm house:validate <slug> --room <roomId>`
5. **Photo textures** (always): copy artwork, rugs and patterned textiles **exactly** from refs into `public/houses/<slug>/` and reference them via `"image"` (see Quality bar §2).
6. **Models**: upgrade hero pieces to real 3D models (Quality bar §3).
6b. **Solve every photo camera — never eyeball it** (the user caught misplaced elements): for each ref photo write `models/houses/<slug>/work/cam-<id>.json` with 6–8 **structural** correspondences (room corners at floor/ceiling, window/door jambs, headboard / table corners — avoid sizes you guessed) and a `bounds` box for where the photographer could stand (doorways count), then `python3 scripts/camera/solve-camera.py models/houses/<slug>/work/cam-<id>.json`. Target RMS ≤ 20 px. Large residuals on one element ⇒ that element is mis-sized/misplaced (e.g. the bedroom slider was 1.6 m, not 1.2 m; the balcony 2.2 m deep, not 1.8 m) — fix the geometry from that evidence and re-solve. If it won't converge (RMS > 40 px or the camera pins to a bound), the room layout itself is wrong: say so in the report and ask for a plan rather than forcing it.
   - Points all on **one wall plane are underdetermined** (fov trades against distance — the solver drifts to a bound). Always add a **vanishing point**: a far point on a known direction (`[-5000, 0, z]` for west-running floor/ceiling lines) at the pixel where those lines meet.
   - **Unknown ceiling height**: re-solve for C = 2.4…3.0 and keep the lowest RMS; cross-check with the section drawing / a corridor's height-to-width ratio (apple-farm: all three agreed on 2.8 m).
   - Don't anchor on guessed door sizes — back-project instead: once a camera is solved, intersect pixel rays with a known plane (floor y=0, a wall x=…) to place furniture and measure doors (apple-farm's "0.9 m door" was a 1.0 × 2.5 m pocket door; the white "fin" was a full-height partition the plan only drew as a line).
   - Architectural photographers often shoot from ~1.0 m and from **doorways / the next room** — bounds must allow it.
7. **Verify** (always on `/preview/<slug>` — `/tour` is cached and serves published revisions only): `pnpm house:validate <slug>` → screenshot each `/preview/<slug>?cam=<photoId>&clean=1` with Chrome DevTools (fresh page, viewport = photo size, wait for `[data-tour-ready="true"]`, never a fixed sleep) into `models/houses/<slug>/shots/`, compare side by side with the ref, ≤ 3 fix iterations per photo. Then play `/preview/<slug>?tour=guided` once: every stop must frame what its narration describes and captions stay one line.
8. **Report** → `models/houses/<slug>/report.md` (template in runbook §6 Stage 8). End with open questions for the human.
9. **Publish — only when the human approves**: `pnpm house:publish <slug> --cover <photoId>` (validates, exports listing photos + OG image, sets `status: published`, rebuilds the asset manifest). Then `pnpm build` (or deploy) — the tour appears at `/tour/<slug>`.

## Quality bar (user-tuned — follow by default)

These were set by the user while building `dubai-1br-sample`. They override generic defaults.

### 0. Builder geometry rules (procedural furniture must not look like blocks)
- **Joints overlap, never touch.** Legs/rods use `<Leg from to>` (anchored by both ends, top buried `EMBED` = 2 cm into the part it carries). Never tilt a box about its centre — its end pops out (the user spotted orange cut ends on chair legs).
- **No coplanar faces** anywhere (they flicker): stacked parts overlap; frames lap 1 cm into walls (`LAP`); thin layers sit ≥ 2 mm above what they lie on or use `polygonOffset`. Rugs are 12 mm — anything on the floor near them sits higher.
  - **Items that run into a perpendicular wall lap 1 cm into it** (built-ins, wardrobes: make `size` 1 cm longer and shift `at` by 5 mm) — an end face exactly on the wall face flickers (user-spotted on the living storage wall). Kitchen runs (`fixtures`) can't exceed their edge: stop them 1 cm short.
  - **Inner parts of a different material stay ≥ 2 mm off the carcass faces** (veneer cubby backs, shelves and end dividers vs the white carcass — user-spotted sawtooth).
  - **Thick walls** (plan walls ≥ 0.35 m, e.g. concrete spines): leave a gap of exactly 2 × 0.25 m between the two rooms so their exterior walls meet back to back; never a smaller gap (overlapping bands). The compiler trims perpendicular exterior-wall overlaps and never extends a corner into a neighbouring room — verify there are no overlaps left before screenshots (user saw flicker by the doors before this was fixed).
- **Hide end grain.** Leg tops end inside an apron/rail or under the seat outline; nothing ends exactly at a rounded edge.
- **Build the construction you see in the photo** (apron + legs + upholstered shell for the dining chairs; legs only below the seat if that's what the photo shows), not a box per bounding box.
- **Soft goods use soft geometry:** `drapeGeometry` (duvet / throw rolling over the mattress edge with wrinkles) and `pillowGeometry` (puffy, pinched corners). Photo textures (damask) are projected on the front face only — never wrapped around a rounded box (smears).
- **No placeholders in a delivered house.** Bathrooms use `bath.vanity.wall-hung`, `bath.wc.wall-hung`, `bath.shower.walk-in`, `bath.towel-rail` — add a real builder when a fixture is missing.
- Chrome/metal: metalness ≤ 0.6 — the warm grade keeps env light low, so metal 1 renders black.
- Doors are interactive: clicking a leaf swings it open/closed on its hinge (`swing` decides side + direction).

### 1. Look & lighting
- **Warm, moody grade** is the house style: low ambient, ≈2700K warm room fills, sunset-toned key light through the glazing, practical lamps glowing (desktop only). Implemented in `src/viewer/scene/Environment.tsx` + `Atmosphere.tsx` (env intensity ≈0.3, ACES tone mapping, exposure ≈0.92). Don't brighten it back to flat daylight.
- **No flat-colour look**: furniture uses PBR detail maps (`materials.textured(hex, "wood" | "fabric" | "weave")`), floors are glossy porcelain, N8AO + one-shot contact shadows ground everything.
- **Per-house window view**: `meta.sky = { low, high, yaw }` (equirect JPGs under `/public/env`). A city tower uses the skyline below; a **ground-level rural house** uses a raw CC0 panorama whose horizon is already at eye height (`scripts/skybox/build-valley.py`, Poly Haven `alps_field` for apple-farm). Pick the panorama by comparing thumbnails with the listing's window views.
- **Views out of windows = a photographic skyline skybox** (equirect JPG, 4k phone / 8k desktop). The user rejected: box "towers", low-res sky, *and* a simulated 3D city — use an image skybox only.
  - Raw HDRIs bake the photographer's rooftop/street (and people) into the lower half and put the horizon at street level, which reads wrong from a high floor. Build the background with `scripts/skybox/build-skyline.py` (Pillow): keeps only the distant skyline band, removes promenade/people, puts the horizon on the centre row (eye level), river/haze reflection below, feathered mirrored haze for 360°. Source must be CC0 (current: Poly Haven `shanghai_bund`; lighting stays `sunset_jhbcentral`).
  - Aim the crisp skyline at the main glazing with `SKYLINE_YAW` (Atmosphere.tsx). Rotation/intensity must go through drei `<Environment backgroundRotation backgroundIntensity>` — it overwrites `scene.backgroundRotation` otherwise. Set `colorSpace` then `needsUpdate = true` on the texture or it renders washed out.

### 2. Photo-sourced textures — copy the photo exactly
- **Surfaces too** (floors, slatted ceilings, panelled / board-formed walls, decks): rectify them **through the solved camera** — project a world rectangle on the plane to the photo and warp with PIL `PERSPECTIVE` (a homography is exact; `QUAD` is bilinear and smears foreshortened planes). Template: `models/houses/apple-farm-reference/work/extract-textures.py`. Keep each crop free of fixtures (downlights, sockets, smoke detectors, sun patches, glare through glass) and check the contact sheet it writes.
  Register as a catalog material with `"image"` + `"tile": [u, v]` (metres one copy covers; mirrored repeat hides seams). UVs are world metres: floors/ceilings u = plan x, v = plan z; walls u = along the wall, v = up — so crop planks/slats to run the way they run in plan. Different finishes on the two faces of one interior wall work (`wallOverrides` per room; the wall is two-sided).
- The model must look like **this** listing, not a generic one: artwork, cushions, rugs, headboards, any patterned or printed surface → crop from the listing photo, never a procedural pattern or a "similar" stock texture.
- Sample flat colours (walls, cabinets, upholstery) from the photo with PIL (median of a clean patch), not by eye.
- The crop must contain only the surface: no table legs, frames of neighbours or shadows of other objects (the rug crop was re-cut once because a coffee-table leg leaked in). Check every crop by viewing it before using it.
- If the object is shot at an angle, **perspective-correct** with PIL `Image.transform(size, Image.QUAD, (UL, LL, LR, UR))` — a straight crop leaves skewed frame edges (user noticed).
- Save under `public/houses/<slug>/`, set `"image": "/houses/<slug>/<file>.jpg"` on the item (art → canvas; bed → cushions; rug → top surface).

### 3. Real 3D models over primitives
- User preference: **use real models for anything that looks "weird" procedurally** — beds, vases/flowers, plants, coffee tables, outdoor sets.
- Search **several free sources** before falling back — the user wants more real assets from different places. All are wired into `scripts/fetch-assets.ts`:
  | Source | Licence | Kind | Notes |
  |---|---|---|---|
  | Poly Haven | CC0 | `polyhaven` | realistic props, no key; list: `https://api.polyhaven.com/assets?t=models&c=furniture` |
  | Smithsonian 3D / Khronos samples | CC0 / per-asset | `url` | direct `.glb` links |
  | Kenney, Quaternius | CC0 | `zip` | stylised — only for small decor/background, never hero furniture |
  | Sketchfab (downloadable, CC0/CC-BY) | per-model | `sketchfab` | `SKETCHFAB_TOKEN=… pnpm assets:fetch <id>` inline, never in a file; CC-BY needs the author in LICENSES.md |
  | ambientCG | CC0 | textures (`source: "ambientcg"`) | fabrics, woods, stone — e.g. `Fabric032` bouclé |
  | Poly Haven textures / HDRIs | CC0 | `TEXTURES` / `HDRI` | |
  Build a thumbnail montage of candidates (PIL) and compare with the photo before fetching. Every fetched model is auto-packed to a meshopt + WebP GLB (`/models/<id>/<id>.glb`).
- Order of preference:
  1. **A free model that matches the photo** from the table above — add to `ASSETS`, `pnpm assets:fetch <id>`, set `"model": "/models/<id>/<id>.glb"` on the catalog entry.
  2. **Generate from the listing photo with TRELLIS** (last resort for hard pieces; inspect it close up — the user rejected the generated bed's blobby towels/cushions, so it was replaced by a refined procedural bed) (Hugging Face Space `trellis-community/TRELLIS`, endpoint `/generate_and_extract_glb`) when no CC0 model fits — e.g. the bed. Requirements:
     - Ask the user once whether the listing photo may be uploaded to a public service (they approved for `dubai-1br-sample`; ask again for new properties).
     - Needs `HF_TOKEN` (anonymous ZeroGPU quota runs out after one job). Pass it inline to the command, never write it to a file.
     - Crop generously around the whole object; inspect the preprocessed (background-removed) image before trusting the mesh — it may keep only part of the object.
     - Output is front-view-foreshortened: fit with `fit="stretch"` into the real footprint, check orientation (bed needed `yaw = π`), force matte (`matte` prop — generated meshes export metallic).
     - Commit the GLB under `public/models/<id>/`, add a `GENERATED` row in `scripts/fetch-assets.ts` (provenance).
  3. Procedural builder (always kept as the loading fallback).
- **Reject models whose colour/style contradicts the photo** (user-approved removals: dark-leather ottoman, black/wood lounge chair, marble-top ribbon-leg coffee table where the photo shows glass + thin black frame).
- **Scale:** Poly Haven / scanned models are real-world metres — render them with `fit: "native"` (`NATIVE_FIT` in Furniture.tsx); never squeeze them into a guessed catalog box (the bistro set came out toy-sized).
- When a generated model already contains part of the object (e.g. bed duvet/throw/towels), drop the procedural duplicates. The user had the procedural **pillows removed** once the TRELLIS bed was in.
- Composite builders (`orchidVase`, `bed`) take the GLB for one part and add procedural detail (orchid sprays, headboard, cushions); register them in `COMPOSITE` in `src/viewer/furniture/Furniture.tsx`.

### 4. No people
- Don't add human/scale figures — the tour is first-person POV, so a person is redundant (user removed it).

### 5. Voice-over & subtitles
- Every room gets a `narration` line; `_intro` plays on first enable. Warm real-estate tone, 1–3 sentences, honest about estimated rooms.
- **Subtitles are line-by-line** (≤ 42 chars, never across sentences) with the spoken word emphasised — the user rejected paragraph captions. Implemented in `src/viewer/ui/Subtitles.tsx` (`captionLines`); keep it.

### 6. Performance ("optimize it to core")
- Every visual upgrade must keep phones smooth: `frameloop="demand"`, merged geometry per material, instanced repeats, 1k textures, meshopt GLBs, one-shot shadows, quality tier (auto by `pointer: coarse` / device memory, user-overridable: DPR ≤ 1.5, performance AO, no practical lamp lights, 4k sky).
- **Never** N8AO `halfRes` (blanks the canvas on phones) and never `AdaptiveDpr` (reads as blocky flicker while moving).
- No coplanar surfaces: anything lying on another surface sits ≥ 2 mm above it or uses `polygonOffset` (rings vs rugs flickered once).
- All `/public` asset URLs go through `asset()` (content-hash `?v=`, served immutable). Run `pnpm assets:manifest` after adding files.
- New heavy features need a phone-tier fallback. Report draw calls (`renderer.info.render.calls`) when you add geometry.

### 7. Walkable & guided
- Furniture blocks walking (compiled `obstacles`); hotspots and guided stops must be walkable — the validator errors otherwise. Move the hotspot, don't shrink the furniture.
- Every guided stop gets a `look` so the camera frames what the narration says ("bathroom straight ahead" ⇒ look at the bathroom door).

## Exterior buildings (towers, facades, site context)

Exterior images are a **separate example**, not part of a house, and use a **drone showcase** (keyframed aerial camera), never first-person POV.
- Data: `models/buildings/<slug>/site.json` (`SiteSpec`, `src/domain/site-spec.ts`); route `/site/<slug>`; validate with `pnpm exec tsx scripts/site-validate.ts <slug>`.
- Each chapter = camera move + highlighted element ids (glowing outline) + narration; subtitles word-synced, same line-by-line style.
- Facades are shader-drawn (curtain-wall bands), landscape instanced. Don't use real brand names from signage — rename generically ("<Name> Residences (sample)").
- Screenshot with `?chapter=<n>&t=0..1&clean=1`.

## Room types
- `terrace` = open deck at ground level: no ceiling, no wall, no railing (edges still block walking). `balcony` keeps its glass railing. Both are excluded from the interior area.

## Rules

- Units metres; plan x→east, z→south; origin top-left; snap to 0.05 m; shared edges must have identical coordinates.
- Anything not visible: use runbook §4 defaults and mark `"est": true`. Never invent structure you have no evidence for — ask instead (runbook §9).
- Write inside `models/houses/<slug>/` and `public/houses/<slug>/`; touching the catalog, `scripts/fetch-assets.ts` or `public/models/` is allowed for new models — mention it in the report.
- Dev server convention: port 3210 (3000/3100 belong to other local projects). Reuse a running one.
- Done = validate exit 0, a shot per photo, narration per room, guided tour checked, report written, status still `draft` (unless approved). If you changed code: `pnpm check && pnpm build && pnpm e2e`.
