# Contract — Tour module → production

Source: `docs/next-todo.md` (Phase 0 + the tour-facing half of Phase 1). Scope = **tour module only**
(interior tour + drone showcase). Listing model, lead capture, CRM, accounts = host app; the module exposes a
`cta` hand-off link instead.

## P0 Stabilize
- [ ] N8AO `halfRes` removed (phone blank canvas).
- [ ] WebGL check + error boundary + context-loss → fallback (photos, plan, transcript, retry, CTA).
- [ ] Store reset + `narrator.stop()` on unmount; keys cleared on blur/visibilitychange; keys ignored in form fields.
- [ ] `?cam=` validated; buyer UI uses room names, no internal ids; mode bar scrolls at 390 px.
- [ ] Real 404 (resolve before Suspense); slug regex + safe JSON parse in house repo; `allSettled` on `/`.
- [ ] Public routes never show diagnostics (friendly error + ref id); `/preview` keeps diagnostics.
- [ ] Vitest (domain), Playwright smoke (desktop + touch), GitHub Actions.
- [ ] Scene-ready signal (`data-tour-ready`) replaces fixed screenshot waits.
- [ ] Runbook: door swing / walkway clearance marked manual. Sample 01a glazing re-checked / documented.

## P1 Tour flow (module part)
- [ ] Publication: `status: draft|published`, `revision` hash; `/tour` serves published only, prerendered
      (`use cache` + `generateStaticParams`); `/preview` = drafts, fresh, token-gated in production.
- [ ] Cover first: actual photo + facts (approx., from model) + **Guided tour (duration)** / **Explore** / **Photos**; 3D mounts on intent.
- [ ] Guided tour: stop per room, fade between rooms, narration + line captions, pause/prev/next/exit.
- [ ] Room list + SVG mini-plan (position + heading, tap → fade), schematic label.
- [ ] Trust: "3D reconstruction" vs "Actual photo"; per-room Estimated/Photographed; About-this-model sheet + transcript.
- [ ] Photo compare in photo mode; photo gallery lightbox.
- [ ] Load progress, help hints (once, reopenable), share (room deep link), quality toggle, reduced motion.
- [ ] Metadata per tour (OG = cover photo), sitemap, robots; drone showcase gets the same shell (back, 404, fallback, CTA end card).
- [ ] Assets: versioned URLs (`?v=hash`) + immutable cache headers; meshopt GLBs.

## Gates
`pnpm typecheck && pnpm lint && pnpm test && pnpm house:validate dubai-1br-sample && pnpm build && pnpm e2e`
+ DevTools screenshots desktop + 390 px touch.
