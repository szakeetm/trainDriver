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

## Next candidates

| Priority | Location | Opportunity and limits |
| --- | --- | --- |
| High for expanded 3D | `renderer3d.js`, `buildTrack()` | Sleepers already share geometry/material but each is a separate mesh every 18 m for the entire route. Use instancing or spatial chunks to reduce draw calls; measure `renderer.info.render.calls` and shadow cost. Chunking retains useful culling. |
| Medium | `js/rendering.js`, `drawBackground()` | All four terrain corners currently use the same palette object, yet identical interpolations and CSS color strings are recomputed per tile. Hoist invariant palette work out of the nested tile loop; retain randomized tile details and compare screenshots. |
| Medium | `js/main.js`, `initializeGame()` | Startup calls `createInitialState()` and then `startRun()`, which generates another route immediately. Consolidating state initialization would avoid discarded procedural work; update the `startRun()` null guard together. |
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
- `updateUi()` writes `lineLimitSecondary.textContent` on the parent of
  `#lineLimitKph`. That removes its original child nodes (including the referenced
  span); subsequent writes to that span target a detached node. A separate label
  element would make HUD structure and tests more reliable.

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
