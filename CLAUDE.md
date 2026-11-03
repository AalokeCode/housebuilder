@AGENTS.md

# 3dhouse — project notes for agents

- Converting a property from images → use the `/convert-house <slug>` skill (`.claude/skills/convert-house/SKILL.md`). It points to the runbook in `.ai-workflow/contracts/house-conversion-runbook.md`.
- Content lives in `models/houses/<slug>/` (interiors) and `models/buildings/<slug>/` (drone showcases); paths are centralised in `src/server/paths.ts`. URLs are unchanged (`/tour`, `/preview`, `/site`); public assets stay in `public/houses/<slug>/`.
- Examples: `dubai-1br-sample` (photos only) and `apple-farm-reference` (plan + photos, photo-rectified surfaces) — copy their structure.
- Architecture + scripts: `README.md`. Domain logic is pure TS in `src/domain/` (no React/fs); the viewer is client-only in `src/viewer/`.
- Dev server convention: port **3210** (3000/3100 are used by other local projects).
- Gates before declaring done: `pnpm check && pnpm build && pnpm e2e` (check = typecheck + lint + unit + both validators).
- `/tour/<slug>` is cached and serves **published** houses only — author and screenshot on `/preview/<slug>`; wait for `[data-tour-ready="true"]`, never a fixed sleep.
- Publishing is a human decision: `pnpm house:publish <slug>`. New `/public` files → `pnpm assets:manifest`.
- Tour-module production contract: `.ai-workflow/contracts/tour-module-production.md`; backlog: `docs/next-todo.md`.
- Never read `src/assets/catalog.json` whole — grep it (one entry per line).
