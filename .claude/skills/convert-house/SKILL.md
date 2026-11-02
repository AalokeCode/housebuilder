---
name: convert-house
description: Convert listing photos (and optional floor plan / video notes) of a property into a tourable 3D house (HouseSpec v1) with validation, photo-match screenshots, warm lighting, photo-sourced textures, free/generated 3D models and voice-over with line-by-line subtitles. Use when the user says "convert house", "build this apartment", "/convert-house <slug>", or drops reference images for a new unit. Exterior building / tower images → drone showcase in sites/ (see "Exterior buildings").
---

# /convert-house <slug>

You turn reference images into `houses/<slug>/house.json` + per-room item files that this repo compiles into a 3D tour.

**The full procedure is `.ai-workflow/contracts/house-conversion-runbook.md`. Read it once, top to bottom, before touching the house.** Do not read other `.ai-workflow/` files.

## Fast path

1. **Intake**: images must be in `houses/<slug>/refs/`. If the user attached images in chat, copy them there (`01.jpg`, `02.jpg`, …). Split collages into panels (`01a`, `01b`, …) with PIL — see runbook Stage 1. Optional: `brief.md`, `plan.png`, `video-notes.md`.
2. **Photo index** (view every image exactly once) → `houses/<slug>/work/photo-index.json`.
3. **Shell** → `house.json` (rooms as clockwise polygons, openings, fixtures, lights, hotspots, photoCams, narration).
   `pnpm house:validate <slug> --shell` until clean.
4. **Furnish** → `work/rooms/<roomId>.items.json`. Grep the catalog, never read it whole:
   `grep -o '"[a-z-]*\.[a-z0-9.-]*": {"builder": "[a-zA-Z]*"' src/assets/catalog.json`
   ≤ 3 furnished rooms: do it yourself. More: spawn one worker per room with the runbook §2 prompt template (only if the user asked for sub-agents).
   `pnpm house:validate <slug> --room <roomId>`
5. **Photo textures** (always): crop artwork and patterned textiles from refs into `public/houses/<slug>/` and reference them via `"image"` (see Quality bar §2).
6. **Models**: upgrade hero pieces to real 3D models (Quality bar §3).
7. **Verify**: `pnpm house:validate <slug>` → screenshot each `?cam=<photoId>&clean=1` with Chrome DevTools (fresh page, viewport = photo size, wait ~5 s for GLBs/textures) into `houses/<slug>/shots/`, compare, ≤ 3 fix iterations per photo. Also check the voice-over: click "Play voice-over" and confirm the caption is a single line.
8. **Report** → `houses/<slug>/report.md` (template in runbook §6 Stage 8). End with open questions for the human.

## Quality bar (user-tuned — follow by default)

These were set by the user while building `dubai-1br-sample`. They override generic defaults.

### 1. Look & lighting
- **Warm, moody grade** is the house style: low ambient, ≈2700K warm room fills, sunset-toned key light through the glazing, practical lamps glowing (desktop only). Implemented in `src/viewer/scene/Environment.tsx` + `Atmosphere.tsx` (env intensity ≈0.3, ACES tone mapping, exposure ≈0.92). Don't brighten it back to flat daylight.
- **No flat-colour look**: furniture uses PBR detail maps (`materials.textured(hex, "wood" | "fabric" | "weave")`), floors are glossy porcelain, N8AO + one-shot contact shadows ground everything.
- **Views out of windows = real skyline skybox** (HDRI + 4k/8k JPG in `public/env/`), never box "towers". The user rejected low-res sky — keep the tiered 4k (phone) / 8k (desktop) background.

### 2. Photo-sourced textures
- Artwork, cushions, rugs with patterns → crop from the listing photo, not procedural patterns.
- If the object is shot at an angle, **perspective-correct** with PIL `Image.transform(size, Image.QUAD, (UL, LL, LR, UR))` — a straight crop leaves skewed frame edges (user noticed).
- Save under `public/houses/<slug>/`, set `"image": "/houses/<slug>/<file>.jpg"` on the item (art → canvas; bed → cushions).

### 3. Real 3D models over primitives
- User preference: **use real models for anything that looks "weird" procedurally** — beds, vases/flowers, plants, coffee tables, outdoor sets.
- Order of preference:
  1. **Poly Haven CC0** — add to `scripts/fetch-assets.ts` (`ASSETS`), `pnpm assets:fetch <id>`, set `"model"` on the catalog entry. Check the thumbnail first (`https://cdn.polyhaven.com/asset_img/thumbs/<id>.png?width=240`).
  2. **Generate from the listing photo with TRELLIS** (Hugging Face Space `trellis-community/TRELLIS`, endpoint `/generate_and_extract_glb`) when no CC0 model fits — e.g. the bed. Requirements:
     - Ask the user once whether the listing photo may be uploaded to a public service (they approved for `dubai-1br-sample`; ask again for new properties).
     - Needs `HF_TOKEN` (anonymous ZeroGPU quota runs out after one job). Pass it inline to the command, never write it to a file.
     - Crop generously around the whole object; inspect the preprocessed (background-removed) image before trusting the mesh — it may keep only part of the object.
     - Output is front-view-foreshortened: fit with `fit="stretch"` into the real footprint, check orientation (bed needed `yaw = π`), force matte (`matte` prop — generated meshes export metallic).
     - Commit the GLB under `public/models/<id>/`, add a `GENERATED` row in `scripts/fetch-assets.ts` (provenance).
  3. Procedural builder (always kept as the loading fallback).
- **Reject models whose colour/style contradicts the photo** (user-approved removals: dark-leather ottoman for a cream boucle pouf, black/wood lounge chair for a light-grey upholstered one).
- When a generated model already contains part of the object (e.g. bed duvet/throw/towels), drop the procedural duplicates. The user had the procedural **pillows removed** once the TRELLIS bed was in.
- Composite builders (`orchidVase`, `bed`) take the GLB for one part and add procedural detail (orchid sprays, headboard, cushions); register them in `COMPOSITE` in `src/viewer/furniture/Furniture.tsx`.

### 4. No people
- Don't add human/scale figures — the tour is first-person POV, so a person is redundant (user removed it).

### 5. Voice-over & subtitles
- Every room gets a `narration` line; `_intro` plays on first enable. Warm real-estate tone, 1–3 sentences, honest about estimated rooms.
- **Subtitles are line-by-line** (≤ 42 chars, never across sentences) with the spoken word emphasised — the user rejected paragraph captions. Implemented in `src/viewer/ui/Subtitles.tsx` (`captionLines`); keep it.

### 6. Performance ("optimize it to core")
- Every visual upgrade must keep phones smooth: `frameloop="demand"`, merged geometry per material, instanced repeats, 1k textures, one-shot shadows, quality tier by `pointer: coarse` (DPR ≤ 1.5, half-res AO, no practical lamp lights, 4k sky).
- New heavy features need a phone-tier fallback. Report draw calls (`renderer.info.render.calls`) when you add geometry.

## Exterior buildings (towers, facades, site context)

Exterior images are a **separate example**, not part of a house, and use a **drone showcase** (keyframed aerial camera), never first-person POV.
- Data: `sites/<slug>/site.json` (`SiteSpec`, `src/domain/site-spec.ts`); route `/site/<slug>`; validate with `pnpm exec tsx scripts/site-validate.ts <slug>`.
- Each chapter = camera move + highlighted element ids (glowing outline) + narration; subtitles word-synced, same line-by-line style.
- Facades are shader-drawn (curtain-wall bands), landscape instanced. Don't use real brand names from signage — rename generically ("<Name> Residences (sample)").
- Screenshot with `?chapter=<n>&t=0..1&clean=1`.

## Rules

- Units metres; plan x→east, z→south; origin top-left; snap to 0.05 m; shared edges must have identical coordinates.
- Anything not visible: use runbook §4 defaults and mark `"est": true`. Never invent structure you have no evidence for — ask instead (runbook §9).
- Write inside `houses/<slug>/` and `public/houses/<slug>/`; touching the catalog, `scripts/fetch-assets.ts` or `public/models/` is allowed for new models — mention it in the report.
- Dev server convention: port 3210 (3000/3100 belong to other local projects). Reuse a running one.
- Done = validate exit 0, a shot per photo, narration per room, report written. Run `pnpm typecheck && pnpm lint && pnpm build` if you changed code.
