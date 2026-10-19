# Code review and optimization opportunities

Reviewed 2026-10-19 across startup, world generation, simulation, input/audio,
both renderers, and the Playwright harness. This is a code and performance review,
not a security audit. No frame-rate benchmark was collected.

## Small changes implemented

- **Defer the hidden 3D scene.** Startup previously constructed a WebGL context,
  track meshes, sleepers, scenery, and shadow resources although the inset starts
  minimized. Creation now happens on first expansion. Restarts while minimized
  defer scene rebuilding until expansion; expanded restarts still synchronize.
  The vendored scripts still load normally, preserving direct-file execution.
- **Release exhaust on route replacement.** `setRoute()` cleared other scene
  groups but omitted `exhaustGroup`. Every restart after 3D initialization added
  ten more puff meshes, geometries, and materials, with old visible puffs no
  longer updated. Route replacement now clears and disposes that group too.
- **Detach disposed scene children correctly.** `clearGroup()` previously popped
  children before calling Three.js `remove()`, preventing it from clearing their
  parent references. Children are now removed through the scene graph API first.
- **Attach the shadow target once.** `updateCamera()` re-added the same target
  object to its parent every rendered frame. It is now attached during setup;
  its position continues to update every frame.

## High and medium optimizations implemented

- **Batch 3D sleepers in spatial chunks.** Each mesh now contains up to 64
  sleepers (1,152 m of track), retaining the original 18 m spacing, positions,
  normals, materials, and shadows. Each chunk has a calculated bounding sphere
  for camera and shadow culling. The vendored Three.js r128 lacks automatic
  instance bounds, so this uses merged geometry without changing dependencies.
  Route replacement disposes the chunk geometry through the existing cleanup.
  This trades additional vertex/index data for fewer scene objects and draw calls;
  on the measured route the baked buffers total about 0.61 MiB.
- **Calculate terrain palette variants once per frame.** Base, alternate,
  blended, detail, and river color strings are shared across the tile loop.
  Seeded tile details and the original gradients are preserved. Using solid fills
  instead of gradients introduced small rasterization differences in comparison,
  so the final implementation retains gradients and matches the original pixels.
- **Generate one startup route.** `startRun()` now creates the initial state
  directly, and initialization no longer generates a route that is discarded.
  The old null-state guard was removed so the same path starts and restarts runs.

### Controlled comparison

Compared original and optimized drawing code on the same seeded 17,696.65 m
route in headless Edge/SwiftShader, Three.js r128, 1440 x 900 viewport, DPR 1,
with animation stepping paused. These are local measurements, not hardware-GPU
frame-rate claims.

- The route's 984 sleeper meshes became 16 spatial chunks.
- At 0%, 20%, 50%, and 80% of the route, total 3D render calls (including the
  shadow pass) changed from **49/64/56/52** to **33/42/34/31**, a **33–40%**
  reduction. The complete scene, camera, and route were held constant per pair.
- Three 3D snapshots matched exactly; the fourth differed at one of 81,466
  pixels, consistent with baking transformed coordinates into float buffers.
- Terrain pixels matched exactly in all 27 cases: nine primary biomes blended
  toward river at mix 0, 0.5, and 1.
- Median CPU submission time for `drawBackground()` over five batches of 40
  calls changed from about **0.163 ms to 0.132 ms** in that local run. This small
  timing is environment-dependent and excludes completion of GPU work.

## Remaining low-priority candidates

| Priority | Location | Opportunity and limits |
| --- | --- | --- |
| Low | `renderer3d.js`, `renderFrame()` | Calls `resize()` and reads layout each 3D frame despite a ResizeObserver and explicit resize paths. Gate polling to browsers without ResizeObserver; verify expansion and drag resizing. |
| Low | `js/ui.js` / `js/main.js` | Station assist updates inside throttled `updateUi()` and again in the animation loop. Cached DOM writes already limit damage. Keep the animation-loop update for smooth markers if removing the duplicate. |
| Low | `js/simulation.js`, `updateDieselExhaust()` | Generates all unit poses to use only the locomotive, even on ticks that spawn no puff. Compute just the locomotive pose when spawn carry reaches one. Particle counts are capped, so profile before wider pooling work. |

Already useful: binary route lookup, bounded scenery traversal, cached terrain
styles, cached station list nodes, HUD throttling, one shared render-frame context,
and skipping 3D frame rendering while minimized. Preserve these.

## Correctness and test gaps

- `processSignalPasses()` runs before `processSignals(dt)`. Reaching the red head
  on the same step as stop/wait completion can derail before clearance. This is
  already documented in `playwright-findings.md`; any change needs explicit
  boundary tests rather than a speculative reorder.
- Existing win tests retry up to six random routes. They can conceal intermittent
  controller/game failures. Seeded scenarios for red clearance, curve entry,
  station acceptance boundaries, and derailment would make regressions actionable.
- The 3D renderer builds two train meshes while camera framing uses the full
  consist. Verify intended visuals before extending or simplifying that behavior.
- `getStationStopTolerance()` returns a hardcoded 50 m while other station values
  live in tuning. Several legacy tuning helpers/constants appear unused; audit
  consumers before removing them or assuming a setting changes gameplay.
- Fixed during the speedometer readability update: the limit span stays in the
  large readout. The redundant secondary limit label and its update code were
  subsequently removed. Previously, updating the parent label removed the nested
  `#lineLimitKph` span and subsequent updates targeted a detached node.

Keep optimization separate from physics/scoring changes, and benchmark the
expanded 3D path independently of the default 2D path.

## Validation of implemented changes

- JavaScript syntax checks (`node --check`) passed for application scripts,
  test scripts, and Playwright configuration; `git diff --check` passed.
- Both `tests/win-with-signals.spec.js` and the new
  `tests/drone-lifecycle.spec.js` passed in headless installed Microsoft Edge
  with SwiftShader, using a temporary local Playwright configuration. The
  default Playwright Chromium binary was not installed in this environment.
- The lifecycle regression checks no renderer before expansion, route replacement
  while expanded, disposal and detachment of all ten old exhaust meshes, bounded
  exhaust counts, deferred rebuilding across hidden restarts, synchronization on
  expansion, and absence of page errors.
- The win test finished the full route with signals enabled and zero penalties.
  The slower watch demo, manual resize/input/audio checks, and hardware-GPU
  performance measurements were not run.
- After the high/medium changes, all four tests in the win, drone lifecycle,
  and new `rendering-optimizations.spec.js` specs passed with the same headless
  Edge/SwiftShader setup. The new checks verify exactly one generation at startup
  and per restart, full sleeper coverage and positions, bounds, shadow/culling
  flags, and chunk disposal/detachment on restart.
