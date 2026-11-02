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
- placeholder.vanity 0.8×0.85×0.5 #d9d4cc — wall-hung vanity with basin
- placeholder.wc 0.4×0.8×0.65 #f4f4f2 — wall-hung WC

## Photo-sourced textures
- `public/houses/dubai-1br-sample/art-strokes-blue.jpg` — perspective-corrected from 01b
- `art-sofa.jpg`, `art-lines-beige.jpg` — from 01c
- `cushion-damask.jpg` — bed cushions, from 01b

## Photo match
| Photo | Shot | Result | Mismatch notes |
|---|---|---|---|
| 01a | shots/01a.png | pass | kitchen run, corridor doors, bulkhead, TV wall, dining, sofa, pendant, lamp align; photo lens is wider |
| 01b | shots/01b.png | pass | bed, nightstands, brass lamps, art, slider, curtain, dresser+vase align |
| 01c | shots/01c.png | partial | sofa wall + dining + art align; **01c shows a walnut sideboard where 01a shows the white TV unit** (staging differs between shots); glazing hidden behind the TV wall in our layout |

## Open questions for human
1. Is there a floor plan? It would fix the hall/bath/entrance positions and the balcony depth.
2. Which staging is current — white TV unit (01a) or walnut sideboard (01c)?
3. Does the bedroom slider sit on the north (façade) wall or the east wall?
