---
name: convert-house
description: Convert listing photos (and optional floor plan / video notes) of a property into a tourable 3D house (HouseSpec v1) with validation, photo-match screenshots and voice-over. Use when the user says "convert house", "build this apartment", "/convert-house <slug>", or drops reference images for a new unit.
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
5. **Photo textures**: crop artwork / patterned cushions from refs into `public/houses/<slug>/` and reference them via `"image"`.
6. **Verify**: `pnpm house:validate <slug>` → screenshot each `?cam=<photoId>&clean=1` with Chrome DevTools (fresh page, viewport = photo size) into `houses/<slug>/shots/`, compare, ≤ 3 fix iterations per photo.
7. **Report** → `houses/<slug>/report.md` (template in runbook §6 Stage 8). End with open questions for the human.

## Rules

- Units metres; plan x→east, z→south; origin top-left; snap to 0.05 m; shared edges must have identical coordinates.
- Anything not visible: use runbook §4 defaults and mark `"est": true`. Never invent structure you have no evidence for — ask instead (runbook §9).
- Write only inside `houses/<slug>/` and `public/houses/<slug>/` (plus catalog/fetch manifest when adding a new free model, which you must mention in the report).
- Done = validate exit 0, a shot per photo, narration per room, report written. Run `pnpm build` only if you changed code.
