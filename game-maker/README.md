# ConnectDaDots · Game Maker (prototype)

A client-side tool that turns a clean image (icon / emoji / line-art) into the
app's **template JSON** — dots + line/bézier segments — so a game can be created
from a picture instead of placing every dot by hand.

> **Status: v1 prototype.** Built to be tested in a real browser. It has not been
> auto-validated (the build environment had no JS runtime and the preview browser
> couldn't reach a local server). Expect to tune the sliders and touch up the
> result in the app's editor — this gets you most of the way, not 100%.

## Run it
It's fully static — no build, no dependencies, works offline.

```bash
# from this folder
python3 -m http.server 8000
# then open http://localhost:8000/
```
Or just open `index.html` directly in a browser.

When deployed under the GitHub Pages site it lives at
`…/lineup-support/game-maker/` and does **not** touch the existing support page.

## Pipeline (vanilla JS)
greyscale → binarize (Otsu, alpha-aware) → edges (morphological gradient) →
**Zhang–Suen thinning** (1px skeleton) → **skeleton graph trace** (strokes between
junctions/endpoints) → **RDP** simplify → per-segment **line vs cubic-Bézier** fit
(through the sub-path midpoint, mirroring the app's `controlPoints(from:to:through:)`)
→ **junction-snap** (coincident endpoints → shared dot) → **unit-space** export.

### Coordinate contract (must match the app)
```
unit = (pixel − imageCenter) × 2 / max(imageWidth, imageHeight)
```
This is the inverse of how the app renders dots over a `scaledToFit` reference
image, so detected dots overlay the same image — and rotation "just works" because
the app uses the same `unitDots` + render path. **Validate with the round-trip:**
load a known game from the dropdown and confirm it renders correctly.

## Controls
- **Simplify (RDP)** — higher ⇒ fewer dots.
- **Straightness** — line-vs-curve threshold; higher ⇒ more straight lines (keep
  polygons crisp), lower ⇒ more curves.
- **Junction snap (px)** — clusters nearby stroke-ends into one shared dot.
- **edges / skeleton / dot#** — debug overlays.

## Known limitations / next steps (per the design notes)
- **51-dot cap** isn't enforced yet (RDP slider controls count) — add cap + flag.
- **Real photos** need subject isolation (SAM) — a small API step, not in this v1
  (clean icon/emoji sources work without it).
- For **filled** shapes, swap the edge step for `potrace`; this v1 favors stroke/
  line-art (the common case).
- Curve fitting is midpoint-through (good for simple arcs); upgrade to full
  **Schneider least-squares** for complex curves.
- Test suite: round-trip the 9 sample games (Pine, Soccer, Conch, Umbrella, Flag,
  Sun, Shades, Spooky, Rangoli); tune **junction-snap** hardest.
