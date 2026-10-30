# App repairs and terrain optimization — 2026-10-30

Changes remain local and uncommitted. The static, offline classic-script
architecture, seeded route generation, and simulation update order are preserved.

## Gameplay and usability

- Up/Down are the only keyboard controls. Keyboard, mouse, and individual touch
  pointers retain independent holds; releasing one cannot cancel another. Blur,
  page hiding, and restart clear held inputs. Pointer-capable browsers avoid
  duplicate compatibility mouse/touch handlers.
- Station acceptance now uses `stations.stopWindow` (42.9 m). Once the locomotive
  front overruns that window, every missed station is recorded and penalized
  once, and the target advances in the same update. `stations.missPenalty`
  defaults to 60 seconds. Missing the last station finishes with delays.
- A stationary locomotive exactly at the red line may wait for green. Strictly
  crossing it fails before wait completion is processed. The unused 14 m grace
  setting was removed; the simulation's pass/wait/failure ordering is unchanged.
- Failure clears obsolete signal messages and reports the failure in the HUD.
  Early failures retain actual route progress instead of showing 100%. Finished
  audio fades out even if frozen speed/control values remain nonzero.
- Exact route segment endpoints consistently belong to the following segment,
  except the final endpoint, independent of cached lookup history.
- Short landscape screens show driving controls beside the canvas without page
  scrolling. The HUD can scroll separately with controls pinned at its top.
  A compact stop-assist panel leaves the train visible on station approaches.

## Terrain work

The terrain keeps its original geometry, colors, triangle order, fills, and
strokes. Tests compare backing-store pixels with the pre-optimization drawing
routine in `tests/terrain-reference.js`.

- Each shared vertex is projected once per terrain draw, with projection storage
  reused on later frames.
- Route-owned cell caches retain triangle lighting and palette-dependent colors.
  Palette changes recompute colors without recalculating static normals/noise.
  Cell records retain scalars, not vertex references that would defeat eviction.
- Diagonal traversal rejects cells outside the horizontal viewport before height
  queries/projection. Guard cells preserve boundary pixels.
- The triangle loop avoids temporary arrays, repeated maps, and callbacks.
- An unchanged stopped view reuses one exact backing-store-sized terrain bitmap.
  The key includes camera, scale, dimensions, backing resolution, and biome blend.
  Motion drops the bitmap; resize/view changes replace its contents; restart
  replaces all route-owned caches. At the existing 4-megapixel canvas cap, the
  additional bitmap has at most 16 MiB of RGBA pixels, excluding browser overhead.
- Height and cell caches are separately bounded by `terrain.cacheLimit`, default
  12,000 entries each. Projection reuse does not cross terrain draws.

## Controlled measurements

Command: `node tests/terrain-benchmark.js`, with the HTTP server at port 4173.
Raw measurements and batch samples are in
[`terrain-benchmark-2026-10-30.json`](terrain-benchmark-2026-10-30.json).

The comparison runs in one headless Chromium process on seed `alpine`, alternating
the original drawing routine and the optimized routine. Each renderer follows
the same camera positions. Moving paths advance by speed × 1.5 / 60 meters per
frame. Warm figures are medians of seven batches of twenty draws; cold figures
are medians of five draws after clearing the caches. Other browser tests were
not running during the final benchmark.

These are **local CPU submission timings**, including any synchronous browser
work during Canvas calls. They exclude completion of asynchronous GPU work and
are not hardware FPS claims. The original drawing routine uses the current
shared helpers; this is not a benchmark of two complete Git revisions.

| Viewport / DPR | Route position / speed | Terrain reference → optimized | Full frame reference → optimized |
| --- | --- | --- | --- |
| 1440 × 900 / 1 | Origin / stopped | 4.710 → 0.005 ms | 5.645 → 0.455 ms |
| 1440 × 900 / 1 | 40% / 24 m/s | 5.985 → 4.895 ms | 6.735 → 6.970 ms |
| 1440 × 900 / 1 | 80% / 72 m/s | 8.540 → 6.910 ms | 10.530 → 8.975 ms |
| 390 × 844 / 2 | Origin / stopped | 4.850 → 0.005 ms | 5.380 → 0.325 ms |
| 390 × 844 / 2 | 40% / 24 m/s | 9.135 → 4.695 ms | 9.030 → 8.570 ms |
| 390 × 844 / 2 | 80% / 72 m/s | 9.480 → 8.175 ms | 12.705 → 11.405 ms |

Moving terrain submission fell 13.8–48.6% in these cases. Total moving-frame
results ranged from 3.5% slower to 14.8% faster, so there is no uniform full-frame
speedup claim. Stopped full-frame submission fell 91.9–94.0% by avoiding repeated
terrain construction. The first stopped bitmap capture adds work: cold stopped
draws measured 12.2–12.7 ms versus 3.4–4.5 ms for the reference. Cold moving draws
measured 2.0–4.5 ms versus 3.9–6.9 ms. Cache memory and first-capture cost are the
tradeoff for the stopped-view saving.

## Harness and cleanup

The win driver now only sets requested control and calls production `update(dt)`.
It no longer clamps speed, teleports onto station marks, edits signal timers,
or bypasses physics at red waits. Instrumentation checks forbidden state writes
and confirms all physics steps belong to production updates. Fixed routes fail
on the first failure; retry-until-success tests were removed.

Unused rendering settings and helpers were removed, along with duplicate
station-assist work and unused upcoming-limit calculations in the DOM HUD.
Exhaust samples only the locomotive pose, and only when a puff is due. Legacy
yellow block metadata stays in generation to preserve its random stream; yellow
limits are still checked at the signal, not continuously afterward. CSS/scripts
share the bumped `terrain-repairs-1` release key.

## Verification

- Gameplay regressions were observed failing before their fixes and passing
  afterward; the strict-crossing case already passed and remains protected.
- Rendering performance regressions failed before the caches/projection reuse;
  pixel equality checks retain the original drawing routine as their oracle.
- All 48 tests passed under `npm test` in Chromium (34.3 seconds), including the unassisted watch
  demo, fixed graded routes, offline loading, DPR/rotation, error notices,
  station overruns, terminal audio, and cache lifecycle/eviction.
- Sixteen additional fixed routes (`forest`, `clearance-1`, `clearance-2`,
  `signal-run`, and `audit-0` through `audit-11`) each completed with five stops,
  zero penalties, and no retries. One included six red signals. These supplement
  `alpine`, `ridge`, and `valley`; they do not prove every possible random route.
- A fresh read-only source review found no material production/test issues.
  A subsequent screenshot check caught the oversized landscape stop assist;
  its new regression failed before the compact layout and passed afterward.
- Desktop, phone portrait, landscape, graded track, and derailment screenshots
  were inspected; no page errors were captured. Syntax and whitespace checks pass.

Physical iOS/Safari controls, browser chrome/safe areas, hardware rendering
performance, and audible sound quality still require device validation. There
is no live runtime tuning UI; geometry changes still require route regeneration
so cached terrain remains consistent with the existing architecture.
