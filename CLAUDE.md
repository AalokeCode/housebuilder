@AGENTS.md

# 3dhouse — project notes for agents

- Converting a property from images → use the `/convert-house <slug>` skill (`.claude/skills/convert-house/SKILL.md`). It points to the runbook in `.ai-workflow/contracts/house-conversion-runbook.md`.
- Architecture + scripts: `README.md`. Domain logic is pure TS in `src/domain/` (no React/fs); the viewer is client-only in `src/viewer/`.
- Dev server convention: port **3210** (3000/3100 are used by other local projects).
- Gates before declaring done: `pnpm check && pnpm build && pnpm e2e` (check = typecheck + lint + unit + both validators).
- `/tour/<slug>` is cached and serves **published** houses only — author and screenshot on `/preview/<slug>`; wait for `[data-tour-ready="true"]`, never a fixed sleep.
- Publishing is a human decision: `pnpm house:publish <slug>`. New `/public` files → `pnpm assets:manifest`.
- Tour-module production contract: `.ai-workflow/contracts/tour-module-production.md`; backlog: `docs/next-todo.md`.
- Never read `src/assets/catalog.json` whole — grep it (one entry per line).
