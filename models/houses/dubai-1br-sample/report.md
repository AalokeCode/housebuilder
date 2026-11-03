# 1BR Apartment — Sample (Dubai) — conversion report

Sources: photos (1 collage → 3 panels: 01a, 01b, 01c) · Scale method: door height 2.1 m → ceiling 2.7 m (2.5 m bulkhead over kitchen/hall); cooker 0.6 m; sofa ≈ 2.3 m; dining Ø ≈ 1.0 m. No area brief.

## Topology
```
 x→      0    1.6        4.6      7.0
 z 0   ┌──────┬──────────┬────────┐
       │ bath │ bedroom  │balcony │
   1.8 │(est) │       ◫slider     │
   2.2 ├─d────┤          ├──▒▒▒▒──┤ ← living glazing
       │ hall d          │ alcove │
   3.8 ├──────┼──TV wall─┘        │
       │kitch │                   │
       │ run  │   living / dining │
   8.4 └──────┴───────────────────┘
```
Entrance: hall west wall. Kitchen open to hall + living (bulkhead step 2.5 → 2.7 m). Bedroom + living both open to the balcony.

## Confidence
| Element | Source | Confidence | Notes |
|---|---|---|---|
| Living/dining + kitchen layout | 01a, 01c | medium | TV wall, glazing, sofa wall, dining position consistent across both shots |
| Bedroom | 01b | medium | bed wall + slider position good; width estimated |
| Hall + doors | 01a | low–medium | two doors visible at corridor end; targets inferred |
| Bathroom | — | low | not photographed; default size, placeholder fixtures |
| Balcony depth | 01a/01b | low | 1.8 m assumed |

## Estimated / inferred
- Bathroom (unseen) — 1.6 × 2.2 m, placeholder vanity + WC
- Entrance door position (hall west wall)
- Bedroom slider on east wall (could be north wall in reality)
- Living alcove (glazing set back 2 m north of the TV wall) — chosen so 01a and 01c both match

## Placeholders (need assets)
None. Bathroom (unseen, estimated): walk-in shower, wall-hung vanity with backlit mirror, wall-hung WC, towel rail.

## Photo-sourced textures
- `public/houses/dubai-1br-sample/art-strokes-blue.jpg` — perspective-corrected from 01b
- `art-sofa.jpg`, `art-lines-beige.jpg` — from 01c
- `cushion-damask.jpg` — bed cushions, from 01b
- `rug-living.jpg` — living rug, perspective-corrected from 01c (replaces the procedural marble)

## Free assets (by source)
- Poly Haven (CC0): coffee table, outdoor bistro set, pachira plant, 2 ceramic vases; walnut / linen / herringbone textures; sunset skyline HDRI
- ambientCG (CC0): `Fabric032` wool → bouclé on pouf + lounge chair
- Bed: TRELLIS mesh removed (blobby towels/cushions); now a procedural bed dressed like 01b (drape + pillow geometry, damask crop on cushion fronts)
- Checked and rejected (style contradicts photo): Poly Haven `dining_chair_02`, `sofa_02`, `sofa_03`, `modern_arm_chair_01`, round wooden tables (all leather / ornate). Next step for chairs + sofa: TRELLIS from 01c (needs `HF_TOKEN`).

## Photo match
| Photo | Shot | Result | Mismatch notes |
|---|---|---|---|
| 01a | shots/01a.png | pass | kitchen run, corridor doors, bulkhead, TV wall, dining, sofa, pendant, lamp align; photo lens is wider |
| 01b | shots/01b.png | pass | bed, nightstands, brass lamps, art, slider, curtain, dresser+vase align |
| 01c | shots/01c.png | partial | sofa wall + dining + art align; **01c shows a walnut sideboard where 01a shows the white TV unit** (staging differs between shots); glazing hidden behind the TV wall in our layout |

## Camera solving (scripts/camera/solve-camera.py)
| Photo | RMS | Result |
|---|---|---|
| 01b | 16 px (7 points) | solved: camera in the bedroom doorway (1.72, 1.0, 3.4), 48° vertical fov. Evidence-driven fixes: bedroom slider 1.2 → 1.6 m, balcony depth 1.8 → 2.2 m, headboard 1.15 → 1.05 m, second curtain north of the slider |
| 01c | 93 px (6 structural points) | does not converge → living-room dimensions disagree with the photo (east wall / glazing line / dining position). Needs a floor plan; not forced |
| 01a | not solved | same living-room geometry as 01c |

## Known structural gap (Phase 0 re-check)
01a and 01c both show floor-to-ceiling glazing + balcony on the **left/north of the living area**. Our model puts the TV wall there and moves the glazing 2 m north (alcove), so 01c's left third (glazing, balcony chairs) and 01a's glazing are hidden behind the TV wall. The two photos conflict on staging (white TV unit vs walnut sideboard on the same wall), so a remodel needs a floor plan or one more photo of the TV wall from the balcony side. Kept as-is and labelled estimated until then.

## Guided tour
Order: Entry Hall → Bathroom → Bedroom → Balcony → Dining/Living → Kitchen (≈ 1 min). Hall and bathroom hotspots were moved to walkable spots (the validator now errors on hotspots inside furniture).

## Open questions for human
1. Is there a floor plan? It would fix the hall/bath/entrance positions and the balcony depth.
2. Which staging is current — white TV unit (01a) or walnut sideboard (01c)?
3. Does the bedroom slider sit on the north (façade) wall or the east wall?
4. OK to generate the dining chairs and sofa with TRELLIS from 01c? (needs an `HF_TOKEN`, passed inline)
