# Production real-estate flow review

Review date: 2 November 2026

Main entry point: [Combined product review, competitor research, and priorities](README.md).

See also: [Image pipeline refinement and free AI generation options](image-pipeline-review.md), covering source evidence, image clarity, reconstruction QA, and an optional local generation stage.

## Assessment and scope

The product should support multiple independent properties and experiences. The tower showcase and apartment interior in this repository are separate samples; there is no established relationship between them. A consumer may explore a tower project, an individual apartment, a villa, or eventually a land plot. These require different information and interactions inside a consistent browsing experience.

The main production opportunity is to help consumers answer three questions: “Does this suit me?”, “Can I trust what I am seeing?”, and “What can I do next?” The existing 3D scenes support exploration, but the surrounding decision-making flow is incomplete. Land-plot behavior below is a proposed extension, not an implemented feature found in the reviewed code.

Recommended first product scope: a real-estate sales presentation and enquiry experience. Keep transactions, deposits, mortgage applications, and a full marketplace outside the first release unless they are explicit business requirements.

This is a source-based product and engineering review. No application code was changed. Live browser behavior, device performance, accessibility conformance, deployment behavior, and integrations were not tested. Findings below distinguish observed implementation from risks requiring reproduction. Priorities are proposed for this product, not external industry benchmarks or legal guidance.

### Reviewed target file set

- Entry and routing: `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/tour/[slug]/page.tsx`, `src/app/tour/[slug]/tour-client.tsx`, `src/app/site/[slug]/page.tsx`, `src/app/site/[slug]/site-client.tsx`, `src/app/preview/[slug]/page.tsx`.
- Interior experience: `src/viewer/Viewer.tsx`, `src/viewer/ui/Overlay.tsx`, `src/viewer/store.ts`, `src/viewer/controls/TourControls.tsx`; targeted narration inspection in `src/viewer/voice/narrator.ts`.
- Exterior experience: `src/site/SiteViewer.tsx`, `src/site/ui/Overlay.tsx`, `src/site/store.ts`, `src/site/voice/useNarrationDriver.ts`; targeted narration inspection in `src/site/voice/chapter-narrator.ts`.
- Data and delivery: `src/domain/house-spec.ts`, `src/domain/site-spec.ts`, `src/server/house-repository.ts`, `src/server/house-service.ts`, `src/site/server/site-repository.ts`, `next.config.ts`, `package.json`, `README.md`.
- Content confidence: `houses/dubai-1br-sample/report.md`; targeted sample/disclaimer inspection in `sites/bay-residences-sample/site.json`.

Only this review document is intended to change. This is not a geometry, shader, or full security audit.

## Consumer-first product scope

### A consistent experience, with different tools for each property

Use the same recognizable property header, save/share actions, details panel, media navigation, and contact flow across listings. Change the exploration tools and facts according to the property type and available evidence. Do not require every listing to have a tower, unit inventory, and interior model.

| Experience | Consumer questions | Most useful interactions | Next action |
| --- | --- | --- | --- |
| Tower or development showcase | What is this project? Where are the entrances and amenities? What is available? | Select labeled buildings/amenities; browse named chapters; inspect location, project status, and available configurations | Request project details or view actual inventory when supplied |
| Individual apartment/interior | How do the rooms connect? Is there enough space? What is included? | Tap rooms on a plan; switch between real photos and 3D; inspect verified dimensions, storage, balcony and furnishing details | Ask about this apartment or request a viewing |
| Villa/independent house | How do floors and outdoor spaces connect? Where do I park and enter? | Floor selector; indoor/outdoor switching where modeled; labeled entrance, parking, garden, and stairs | Request a property visit |
| Land plot — future scope | Which parcel is this? Where is road access? What are its dimensions and surroundings? | Parcel selection, source-backed boundary overlay, north/scale, access-road and utility information | Ask about this plot or request a site visit |

For land, visually reconstructed boundaries must not appear to be surveyed boundaries. Show the source and verification status; leave unknown access, utility, or permitted-use facts unknown. A formal land-information/legal review is outside this document.

### 1. Let consumers understand the listing before controlling a camera

**Scenario:** someone opens a link shared by an agent or family member on their phone.

Show a useful cover image and a short summary immediately: property name/type, locality, price or a clear “Price on request,” availability, and the most relevant facts. Offer “Explore in 3D,” “Photos,” and “Details” without requiring an account. Load the heavier scene after intent or when it will not obstruct this first view.

After entering 3D, keep a small property identity visible. Provide a clear way back to details. A direct scene link must work without first visiting the home page.

**Success test:** a first-time visitor can explain what property they opened and reach its photos or contact action without learning the 3D controls.

### 2. Offer both a guided visit and direct exploration

**Scenario:** one visitor wants a quick overview; another wants to inspect the kitchen or parking immediately.

- Offer “Take a guided tour” and “Explore yourself” where the content supports both. Show the approximate guided duration derived from the actual content.
- Start guided playback only after user action. Let visitors skip, pause, and choose a named chapter or room at any time.
- Make chapter titles discoverable instead of relying only on dots. For interiors, use a room list with thumbnails; make walking optional rather than the only way to understand the home.
- Keep one clear home/reset-view control. Preserve the last useful viewpoint when a details panel is closed.
- Use contextual hints once, with a Help action to reopen them. Explain touch interaction on phones and keyboard/mouse interaction on desktop.

**Success test:** someone unfamiliar with 3D navigation can reach a specific room/amenity, return to the overview, and stop motion without assistance.

### 3. Make scene interactions answer real questions

**Scenario:** a visitor selects a balcony, pool, parking area, or plot boundary because they want information.

Open a compact feature panel with its name, a real photo if available, verified details, and an “Ask about this” action. Keep the feature highlighted and retain the view behind the panel. Avoid adding a pin to every decorative object; prioritize features that affect a property decision.

For an apartment, useful facts include room dimensions and furnishing inclusion. For a tower, clarify whether an amenity is existing, planned, shared, or restricted. For a plot, show the sourced parcel identifier and boundary evidence. Do not derive precise commercial facts from an approximate scene.

**Success test:** a feature click produces decision-relevant information rather than only camera motion or a decorative highlight. An enquiry carries the selected feature as optional context.

### 4. Keep consumers oriented

**Scenario:** someone enters a room and no longer knows how it relates to the entrance or other rooms.

Provide an optional mini-plan with current position and direction, a current-room label, and tap-to-select rooms. For multi-floor properties, show the selected floor explicitly. For exterior scenes, label major buildings and access points with a toggle to reduce clutter.

Use verified geometry for dimensions; otherwise label the plan schematic. Prefer a quick fade to a chosen room over moving the camera through walls. Offer reduced-motion navigation with the same destination choices.

**Success test:** visitors can locate the entrance and describe the relationship between two important spaces after exploring. Verify this in user testing, not by assuming a mini-plan solves it.

### 5. Give evidence at the moment it matters

**Scenario:** a buyer likes the rendered room but wants to know what exists today.

Make “Actual photos,” “3D reconstruction,” and “Proposed design” distinguishable media types. Provide a same-room photo comparison where evidence exists. Label virtual furniture and inferred areas locally; a generic disclaimer alone does not explain which part is uncertain.

Show the date and source of property facts, actual photos, and availability when known. Let a visitor report an incorrect detail. Preserve an understandable experience when evidence is missing: “No verified photo available for this room” is useful information.

**Success test:** a consumer can tell whether they are seeing the current property, a representative example, or an imagined reconstruction. The current sample bathroom should never look like a verified photographed room.

### 6. Help people evaluate several independent properties

**Scenario:** a consumer explores one apartment, then a separate tower project, and later returns with family.

- Use cover images and type labels in the property list. Preserve filters, scroll position, and shortlist when returning from a tour.
- For a larger catalog, offer location, property type, budget, and availability filters with clear empty states. Load scene assets only for the selected experience.
- Offer recently viewed and save without forcing sign-up at first use. Request an account only when offering a concrete benefit such as cross-device sync.
- Compare like-for-like properties using relevant fields. An apartment's room count and a land plot's frontage should not be forced into one misleading comparison table.
- Share the property and optionally a room/feature. The recipient should receive a readable preview and a valid fallback if the referenced feature changes.
- Reset scene-specific camera, audio, chapter, and input state between properties. Keep intentional user preferences such as mute or reduced motion separate from transient scene state.

**Success test:** exploring property B never carries over property A's selected room or narration. Returning to the catalog keeps the consumer's browsing progress.

### 7. Turn interest into a useful conversation

**Scenario:** the consumer has a specific question, not yet enough confidence to book a visit.

Keep one clear contact action available without obstructing exploration. Offer “Ask a question” and “Request a visit” at appropriate points, using the actual representative's supported channels. Preselect the property and optionally feature/room; let the consumer edit the message before sending. Avoid compulsory lead forms before viewing the tour.

After submission, show who will follow up, the selected channel, and an honest expected response window defined by operations. A viewing request remains a request until a time is confirmed. The consumer should be able to correct contact details or cancel/reschedule a requested visit through a suitable follow-up flow.

**Success test:** the consumer knows what happens next, and the representative does not need to ask which property the enquiry concerns.

### 8. Preserve the journey when 3D does not work

**Scenario:** a phone has limited graphics capability, the connection slows down, or audio cannot play.

Keep photos, a plan, facts, and contact usable independently of the scene. Show meaningful load states and a retry/fallback action. Allow lower quality without losing the chosen property. Provide captions/transcripts without requiring audible playback, and make panel controls usable by keyboard and assistive technology.

On mobile, use compact panels that can close easily, respect safe areas, and keep essential controls reachable. Test whether panels cover selected features or whether page gestures conflict with camera gestures. These are validation tasks, not confirmed visual failures from this source review.

**Success test:** a blocked or failed canvas never leaves the consumer at a dead end, and a failed scene does not erase an enquiry draft.

### Recommended consumer MVP

Ship these as the shared baseline across the existing independent tower and interior examples:

1. Property summary with real media, relevant facts, and a clear entry into 3D.
2. Named navigation, direct exploration, reset/exit, and contextual property details.
3. Clear actual/illustrative/inferred labels at the affected content.
4. Save/share and return-to-catalog behavior with isolated scene state.
5. Contextual question/viewing requests with understandable confirmation.
6. Mobile-friendly panels, accessible alternatives, and load recovery.

Then add the tools that belong to each type: room plan and photo comparison for interiors; amenity/building selection for towers; floor selection for multi-level houses; sourced parcel boundaries for land when that format is supported. Unit selection is conditional on actual inventory and linked tours, not a requirement for every exterior scene.

### Test with consumer tasks before expanding features

Ask prospective users to open a shared property, find a specific room/amenity, identify what is real versus illustrative, compare two relevant listings, share a chosen feature, and request a visit. Include phone users and people unfamiliar with 3D controls. Observe completion, backtracking, requests for help, accidental navigation, and confidence in their answers. Repeat the key tasks with 3D unavailable. Use the observed friction to prioritize the next iteration; scene engagement alone does not establish that the experience helps consumers decide.

## Current user journeys

| Journey | Implemented behavior | Where it stops |
| --- | --- | --- |
| Discover an interior | Home lists houses with title, room/item counts, source types, and validation errors | No buyer-facing listing summary, price, availability, or filtering |
| Explore an interior | Enter full-screen 3D; walk, jump between hotspots, switch to dollhouse or photo-match cameras; enable narration | No property details, original-photo comparison, enquiry, or explicit return link |
| Explore a development | Open a separate site; start narrated chapters, pause/orbit, skip, mute, replay | Limited consumer fact/feature inspection; end state offers replay, without enquiry or relevant next steps |
| Inspect a reconstruction | Preview aliases the tour; camera/mode/clean query parameters support capture | No separate publication or authenticated preview boundary in reviewed routes |
| Add content | Repository files are parsed, compiled, and validated; scripts support authoring | No represented editorial approval, publication revision, or inventory update flow |

## Prioritized enhancements

P0 = required before using this as a public lead-generating property experience. P1 = next release after those foundations. P2 = expansion after validating demand. Effort is relative: S is a contained change, M spans a few components/services, L introduces a new workflow or integration.

| Priority | Enhancement | Buyer/business outcome | Effort |
| --- | --- | --- | --- |
| P0 | Listing details and property identity | Understand what is being offered before entering 3D | M |
| P0 | Enquiry with property context and delivery tracking | Convert interest into an actionable lead | L |
| P0 | Verified versus inferred content | Avoid presenting reconstruction assumptions as property facts | M |
| P0 | Publishing gate and safe failure states | Keep incomplete or broken content off public routes | L |
| P0 | Non-3D fallback and basic accessible navigation | Retain buyers who cannot load or operate the scene | M |
| P0 | Lifecycle/input hardening | Make navigation between tours predictable | M |
| P1, where inventory exists | Development → available unit → linked interior | Support selection within a real development relationship | L |
| P1 | Viewing requests and follow-up | Move qualified interest toward an actual visit | L |
| P1 | Save, share, and compare | Support repeat visits and joint decisions | M |
| P1 | Room orientation and media comparison | Help buyers evaluate layout and authenticity | M |
| P1 | Funnel analytics and operational monitoring | Locate drop-offs and failed lead delivery | M |
| P2 | Guided agent sessions, localization, staging variants | Support more sales contexts after the core journey works | L |

### 1. Discovery → property details → tour

**Observed:** `src/app/page.tsx` exposes construction-oriented metadata such as item counts and sources. `HouseMeta` stores title, kind, ceiling, sources, and optional area brief; it does not model a sale/rental listing or available unit. The root metadata is generic.

**Proposed flow:** listing card → property detail page → enter tour → return to the same details. Direct tour links should still expose a compact property summary and contact action.

- Show a cover image, location, bedrooms/bathrooms, verified area, sale/rent category, price and currency where available, and availability freshness.
- Provide photos, floor plan, amenity details, agent/developer identity, and a clear primary action. Unknown information should be marked unavailable rather than inferred from scene geometry.
- Keep listing details readable before loading the 3D bundle. Give each published listing useful page/share metadata.
- Add search/filtering only when inventory warrants it; a single-property pilot does not need marketplace navigation.

**Acceptance:** a buyer can identify the property, understand its status, contact its representative, and view photos without initializing WebGL. Returning from the tour preserves listing context.

### 2. Tour → enquiry → reliable agent handoff

**Observed:** neither overlay offers an enquiry action. The exterior end screen offers replay. The reviewed app route set contains no enquiry handler or lead workflow.

**Proposed flow:** persistent “Enquire” action → brief form → server acceptance → reference number and next steps → tracked delivery to the assigned representative.

- Carry listing/unit ID, published revision, and optional room/chapter context into the enquiry. Collect a preferred contact method and only the fields needed for follow-up.
- Offer a useful end-of-tour choice: view available units, request a viewing, or ask about this property.
- Prevent duplicate submissions; validate on the server; bound input and add abuse controls. Preserve entered details after recoverable errors.
- Store the lead durably before acknowledging receipt. Track downstream delivery separately, with retry and an operational queue for failures.
- Make contact and marketing preferences explicit. Establish retention and access rules before collecting personal data; market-specific requirements need separate review.

**Acceptance:** refreshing or retrying a submission does not create duplicate leads. A downstream CRM/email outage does not lose an accepted lead. The agent receives the exact property/unit context, and the buyer receives an honest status.

**Dependency:** define lead ownership, destination, and response expectations before selecting a CRM integration.

### 3. Optional development → tower → unit → interior flow

**Observed:** site and house routes are separate samples, with no established relationship. `TowerSpec` models physical buildings but has no unit inventory relationship. This is not inherently a defect: a standalone exterior showcase can be complete without an interior or unit selector.

**Conditional flow:** only when a development supplies real inventory and explicitly associated interiors: project overview → choose tower → browse available units or floor plans → inspect unit details → open linked interior if available → enquire about that unit. Otherwise, use project facts, amenity exploration, and a project enquiry action.

- Start with an accessible list of units; spatial tower selection can supplement it.
- Relate project, building, unit, listing, and tour explicitly. Distinguish a representative show apartment from the exact unit being sold.
- Show relevant differences: floor, orientation, verified area, price, availability, and whether the interior represents the selected unit or a shared typology.
- Preserve the selected project/tower/unit when moving between exterior and interior views.
- Recheck availability on enquiry or viewing request; do not imply a reservation merely because a unit was selected.

**Acceptance:** the selected unit remains unambiguous throughout the journey. Unavailable units have a clear status and a route to alternatives. A generic interior cannot silently appear to represent every unit exactly.

**Dependency:** establish an inventory source and freshness policy. For an individual-property pilot, this can follow the first public release.

### 4. Explore → understand room layout and evidence

**Observed:** room chips include hotspot IDs, photo buttons use photo IDs, and “photo match” changes the camera rather than showing the original photo. A global estimated-layout badge appears when any room is estimated. The sample conversion report identifies an unseen bathroom, assumed balcony depth, uncertain door positions, and conflicting staging between photos.

**Proposed flow:** choose a named room → see orientation on a plan → inspect room facts → compare the model with its source photo → inspect any uncertainty.

- Use buyer-facing room names and photo thumbnails instead of internal identifiers.
- Add a floor-plan view with current position and selected room. Keep measured and estimated dimensions distinct.
- Show original-photo/model comparison with dates and source labels; explain mismatched staging or outdated photographs.
- Surface confidence per affected room or feature. Identify virtual staging, inferred geometry, and illustrative neighborhood elements.
- Add a compact “About this model” view describing source material, last review, and limitations. Do not present a reconstructed view, sunlight condition, or surrounding building as verified without supporting data.

**Acceptance:** a buyer inspecting the sample bathroom sees that it was inferred and not photographed. Switching to photo match does not suggest that a source photograph is being displayed. Published area is sourced independently from approximate geometry.

### 5. Arrival → successful exploration on mobile and accessible alternatives

**Observed:** mobile controls, DPR limits, demand rendering, narration, and captions already exist. Both viewers use client-only canvases; the reviewed wrappers provide no explicit asset-progress or non-WebGL experience. Input tiering uses pointer type. This is a useful starting heuristic, but does not measure device capability.

**Proposed flow:** view property summary/poster → choose 3D or photos/plan → load with understandable progress → explore with controls suited to the input method → recover if loading fails.

- Add lightweight first-use instructions, a reset-view action, and an obvious exit to property details.
- Provide photos, a readable floor plan, room descriptions, and a transcript outside the canvas. Let users access text without starting narration.
- Handle scene-load failure and context loss with retry and a non-3D route. Keep the contact action available during failure.
- Add quality selection and a reduced-motion exploration mode. Validate quality choices against representative devices and measured frame time.
- Verify keyboard focus, touch target sizes, screen-reader labels, and narrow-screen overflow. The interior mode/photo toolbar has no explicit horizontal overflow treatment and can grow with photo count.
- Revisit global keyboard shortcuts before introducing forms; navigation keys must not move the scene while users type or operate another control.

**Acceptance:** a buyer with WebGL disabled can still assess the listing and enquire. All primary actions work by keyboard. At a narrow phone width, controls and captions remain reachable. Reduced-motion users can navigate without compulsory camera travel.

**Validation needed:** real iOS/Android devices, slow network, failed assets, unavailable speech synthesis, zoom, keyboard-only use, and a screen reader. No performance or accessibility pass is claimed here.

### 6. Interest → save/share/compare → return

**Observed:** camera and chapter query parameters support preview/deep-link scenarios, but the overlays do not expose a buyer-facing save/share flow.

- Offer a stable listing link and an optional room/chapter link. Keep screenshot-oriented `clean` behavior out of normal share actions.
- Start with local-device shortlisting if cross-device accounts are not necessary. Explain its persistence limits.
- Compare verified facts for a small selection: cost, area definition, beds/baths, floor, orientation, availability, and amenities. Render missing facts explicitly.
- On return, recheck status and tell buyers if price, availability, or published content changed.

**Acceptance:** a recipient opens a useful property view even if a shared room/chapter no longer exists. Sold or withdrawn listings do not misleadingly appear available.

### 7. Enquiry → viewing request → confirmed visit

**Proposed flow:** select viewing format → choose preferred times → submit request → receive acknowledgement → receive confirmed slot or alternatives.

- If there is no live scheduling source, label the action “Request a viewing”; do not promise a confirmed booking.
- Preserve unit context, timezone, contact preference, and assigned representative.
- Support rescheduling/cancellation and failed confirmation delivery. For true booking, handle concurrent slot selection on the server.
- Provide an internal view for new, assigned, contacted, and closed enquiries with clear ownership.

**Acceptance:** two visitors cannot receive the same exclusive confirmed slot. Request receipt and appointment confirmation are visibly different states.

### 8. Authoring → review → publication → correction

**Observed:** routes read current repository files using `connection()`. Home loads/compiles houses to construct its list. Validation diagnostics can appear publicly. `/preview/[slug]` directly reuses the public tour page. The shown schemas do not contain publication status, reviewer approval, or content revision.

**Proposed flow:** ingest source assets → generate draft → validate → review visual fidelity and property facts → approve → publish an immutable revision → monitor → correct or roll back.

- Preserve the existing compiler/validator separation. Add a publication layer around it rather than moving content rules into React components.
- Publish only approved revisions. Keep drafts, detailed diagnostics, and private source materials behind an appropriate editorial boundary.
- Store source provenance, review notes, approver, timestamps, and revision identity. Verify narration claims alongside visuals.
- Precompile approved scene artifacts and use a compact listing index for discovery; avoid rebuilding every full scene merely to list properties.
- Keep the previous valid revision live if a draft fails parsing or validation. Return a buyer-friendly unavailable state if no published revision exists.
- Verify assets and compiled artifacts are included in the actual deployment. Repository-relative runtime file access needs deployment-specific validation.

**Acceptance:** malformed draft JSON cannot take down the public listing index. An unapproved room edit cannot silently alter a live tour. Operators can identify and restore the last approved revision.

## Concrete engineering follow-ups

These are source findings and test candidates, not claims of reproduced production incidents.

| Finding | Evidence | Recommended action and verification |
| --- | --- | --- |
| House JSON parse errors can escape repository handling | `FileHouseRepository.load()` calls `JSON.parse` directly; home uses `Promise.all` over house loads | Convert read/parse failures into typed results; verify one malformed listing does not prevent valid listings rendering |
| House and site path validation differ | `SiteRepository` validates slug before path construction; `FileHouseRepository` does not and also resolves `spec.items` | Validate slugs and enforce content-root containment for resolved paths; test at repository boundaries. This is hardening, not a demonstrated externally exploitable traversal |
| Interior store has no per-house reset | `useTour` is a module-level store; viewer query effect only sets requested modes | Reset transient state on identity changes; test A → B navigation after photo mode, teleport, and joystick input |
| Exterior initialization only updates chapter count | `useSiteTour.init()` leaves status/chapter and completion fields intact | Define lifecycle reset and timer cleanup; test switching from a later chapter in a long site to a shorter site |
| Interior narration lacks viewer unmount cleanup | `Viewer.tsx` stops narration on mute but has no equivalent of the site driver's unmount cleanup | Cancel speech/caption work when leaving or changing the property; verify no previous-property narration continues |
| Walk keyboard listeners are global | `TourControls` adds every key to its pressed set; no focused-input or window-blur guard is shown | Limit controls to the intended interaction context and clear held input on blur; test typing and tab switching while moving |
| Hotspot travel bypasses collision checks | Target movement interpolates directly; manual movement uses `blocked()` | Decide between a brief fade/teleport and valid-path travel; test transitions between rooms separated by walls |
| Photo query does not validate against available cameras before setting mode | `Viewer` accepts any `cam`; controls return early if camera is missing | Fall back to a valid view with a usable message; test stale and malformed share links |
| Public errors expose authoring details | Tour/site pages render issue code, location, and message | Keep diagnostics in editorial tools and return recoverable public states with operational correlation IDs |

## Data boundaries to introduce

Keep commercial data separate from scene geometry. A suitable initial separation is:

| Model/service | Responsibility |
| --- | --- |
| Property / optional Project / Building / Unit | Independent property identity; optional hierarchy and explicitly verified links to representative or exact-unit tours |
| Listing | Market-facing facts, sale/rent terms, currency, availability, freshness, assigned representative |
| TourRevision | Approved scene reference, source evidence, confidence annotations, reviewer and publication state |
| Lead / EnquiryService | Validated submissions, deduplication, ownership, durable acceptance and delivery state |
| ViewingRequest | Requested versus confirmed appointment state and timezone-aware scheduling |

The existing injectable `HouseService` dependencies provide a useful pattern for further services/repositories. A database and object storage become useful when editorial operations and lead handling require shared persistence; a small read-only content pilot can retain file-backed authoring and publish versioned artifacts. No rewrite is necessary just to introduce a listing page.

## Measurement and launch checks

Instrument the whole journey, not only scene interactions:

| Event | Question answered |
| --- | --- |
| `listing_view`, `tour_start`, `tour_ready`, `tour_load_failed` | Do people enter 3D, and does it become usable? |
| `room_view`, `chapter_view`, `unit_select` | Which spaces and inventory receive attention? |
| `enquiry_open`, `enquiry_submit`, `enquiry_accepted`, `lead_delivery_failed` | Where does the contact flow fail? |
| `viewing_requested`, `viewing_confirmed` | Does exploration lead to a visit? |

Define event deduplication and readiness semantics. Segment by listing, published revision, device class, and entry source without embedding form contents or contact details in analytics. Track enquiry acceptance per listing session, confirmed viewings per accepted enquiry, load failures, time to usable tour, and lead delivery latency. Set targets after a representative pilot baseline; avoid inventing benchmark numbers.

Before calling the first release production-ready, exercise:

1. Direct listing/tour links, back navigation, invalid slugs, removed cameras, withdrawn inventory, and cross-property state reset.
2. Failed/slow assets, WebGL unavailable/context loss, narration unavailable, mobile orientation changes, and background/foreground transitions.
3. Keyboard navigation, focus while opening forms, readable non-3D content, reduced motion, and narrow-screen control reachability.
4. Duplicate form submits, invalid inputs, delivery outages, reassignment, and appointment conflicts if booking exists.
5. Invalid draft content, approval enforcement, publish/rollback, asset packaging, and public/private content separation.

## Suggested delivery order

**Release 1 — shared consumer experience:** listing summary and detail panels; type-appropriate facts; named exploration controls; trusted-content labels; save/share; contextual enquiries; fallback media; state isolation; approved publication boundary; basic funnel/error monitoring. Pilot an independent interior and exterior experience to verify that the common flow works without assuming a relationship.

**Release 2 — deeper property-specific decisions:** room plans and actual-photo comparison, interactive exterior amenities, comparison of relevant properties, viewing follow-up, and representative assignment. Add project/building/unit navigation only for developments with verified inventory relationships. Introduce land/multi-floor experiences as separately scoped formats with their own evidence requirements.

**Release 3 — repeat engagement and scale:** shortlists, comparison, cross-device continuation if needed, localization, guided agent sessions, and quality/performance tuning based on measured usage.

The product should let people evaluate different properties confidently through a consistent experience. Each scene earns its place by answering a consumer question; the available content and property type determine which exploration tools appear.
