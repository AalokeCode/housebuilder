@AGENTS.md

# 3dhouse — project notes for agents

- Converting a property from images → use the `/convert-house <slug>` skill (`.claude/skills/convert-house/SKILL.md`). It points to the runbook in `.ai-workflow/contracts/house-conversion-runbook.md`.
- Architecture + scripts: `README.md`. Domain logic is pure TS in `src/domain/` (no React/fs); the viewer is client-only in `src/viewer/`.
- Dev server convention: port **3210** (3000/3100 are used by other local projects).
- Gates before declaring done: `pnpm typecheck && pnpm lint && pnpm house:validate <slug> && pnpm build`.
- Never read `src/assets/catalog.json` whole — grep it (one entry per line).
