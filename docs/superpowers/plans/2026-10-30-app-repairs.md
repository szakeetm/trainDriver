# App repairs and terrain optimization implementation plan

> **For agentic workers:** Use superpowers:executing-plans for implementation and a fresh whole-change review before delivery. Steps use checkboxes for tracking.

**Goal:** Fix the reviewed correctness and usability issues, use only Up/Down keyboard controls, advance missed stations with penalties, and measurably reduce terrain rendering cost.

**Architecture:** Keep classic scripts, Canvas 2D, offline loading, and route-owned bounded caches. Cache static terrain geometry and lighting; reuse vertex projections within each frame without changing draw order or pixels. Exercise the real update loop in the win harness.

**Tech Stack:** Browser JavaScript, Canvas 2D, Web Audio, Playwright.

**Spec:** The user's 2026-10-30 instruction authorizes the review fixes and autonomous execution. This file records the implementation choices rather than introducing an approval checkpoint.

## Global constraints

- No application framework, bundler, runtime dependencies, WebGL, or edits to vendored Three.js.
- Preserve update order and seeded local randomness.
- Keep changes uncommitted in the user's current checkout for testing; no Git metadata changes or publication.
- Preserve scene geometry and colors during terrain optimization; compare identical seeded scenes and collect controlled timings.
- No dependency installation is needed; the installed Chromium and test dependencies are available.

## Review focus

- Releasing one input while another holds the same action must retain the other input.
- A missed station must advance immediately after the tolerance boundary, penalize once, and finish correctly if it was the last station.
- A locomotive exactly on a red line must wait, while crossing must fail before clearance.
- Cold caches, biome transitions, restart, eviction, and mobile rotation must retain finite terrain and correct pixels.
- The win driver must neither teleport the train nor overwrite physics results or manually clear signals.

## Task 1: Input, stations, and end-state correctness

**Files:** `js/core.js`, `js/shared.js`, `js/simulation.js`, `js/ui.js`, `js/audio.js`, `js/world.js`, `index.html`, `README.md`, new `tests/gameplay-regressions.spec.js`.

**Interfaces:** Preserve `keys`, `getStationStopMetrics()`, `update(dt)`, `getGameProgressPercent()`, and `evaluateRoute(distance)`. Add `clearHeldControls()` for restart/blur. Default station tolerance comes from tuning; the missed-stop penalty remains 20 seconds. Exact segment endpoints belong to the following segment, except the final endpoint.

- [x] Add and run failing browser regressions for Up/Down only, mixed keyboard/pointer holds, two pointers, restart/blur release, exact red stop/crossing, configured station tolerance, one/multiple/final station overruns, failure status/progress, finished audio, and deterministic segment boundaries.
- [x] Implement source-aware input state; station-overrun handling; terminal-state cleanup; strict crossing of red lines; deterministic route lookup. Remove misleading unused pass-margin settings.
- [x] Run the gameplay regressions and existing physics/terrain tests.

## Task 2: Landscape controls

**Files:** `styles.css`, `tests/ios-safari.spec.js`.

**Interfaces:** Keep existing DOM and portrait layout; short landscape screens must show both the scene and usable touch controls without page scrolling.

- [x] Add a failing 932 x 430 layout/control regression with real pointer input and both control bounds inside the viewport.
- [x] Reconcile width/height media rules and provide a short-screen HUD that prioritizes driving controls.
- [x] Run mobile rotation, resize, and layout coverage.

## Task 3: Terrain optimization

**Files:** `js/world.js`, `js/rendering.js`, `tests/rendering-optimizations.spec.js`, new `tests/terrain-reference.js`, new `tests/terrain-benchmark.js`.

**Interfaces:** Keep `getTerrainVertex(gx, gy)` and route-owned height cache. New derived caches must be route-owned, bounded, and dropped on restart; projection reuse must last only one frame. Reference rendering is test-only.

- [x] Capture baseline terrain rendering and controlled timings at fixed seed, viewport, DPR, chainage, and speed.
- [x] Add failing regressions for bounded derived caches, restart ownership, and repeated projection avoidance; add pixel comparisons to the original renderer across flat/graded track, biomes, resize, and eviction.
- [x] Cache triangle lighting and palette-dependent colors, project each needed shared vertex once per draw, and avoid hot-loop arrays/callbacks while retaining exact triangle ordering and strokes.
- [x] Run terrain/scenery/physics coverage and compare warm/cold terrain and full-frame timings to baseline.

## Task 4: Honest win harness and cleanup

**Files:** `tests/win-autopilot.js`, win specs, `js/core.js`, `js/shared.js`, `js/simulation.js`, `js/ui.js`, `js/main.js`, `js/world.js`, documentation.

**Interfaces:** The test driver may set `state.requestedControl` and advance `update(dt)` only after initialization. It must not write position, speed, actual response, signal timers, or station results. Run fixed seeds without retry. Rendering cadence remains configurable for watch mode.

- [x] Add failing instrumentation proving the driver uses the production update/physics path without external state writes.
- [x] Replace the assisted driver with conservative braking/creep through normal physics; validate fixed seeds and the watch demo.
- [x] Remove proven unused helpers/settings, defer exhaust pose work until puff spawn, and keep only one per-frame station-assist update. Refresh controls copy, release keys, architecture notes, and current review/validation findings.
- [x] Run `npm test`, syntax checks, `git diff --check`, seeded screenshots, and the controlled benchmark.
- [x] Request a fresh read-only review; fix material findings, rerun affected checks, and report measurements and remaining manual validation.

## Execution ledger

- Baseline: prior review ran all 27 tests successfully in Chromium; working tree clean at start.
- Decision: user requested autonomous fixes in the active IDE checkout; no worktree, branch, commit, or push will be created.
- Decision: remove the unused red grace-margin setting instead of allowing a locomotive to pass a red line by 14 m. Equality is a valid stop, strictly greater chainage is a crossing.
- Decision: honor the configured 42.9 m station tolerance; the old hardcoded 50 m value was the defect. Overrunning that tolerance applies a configurable 20-second missed-stop penalty.

- Task 1 complete: 13 new regression failures observed before repairs; all 14 gameplay regressions passed afterward (strict red crossing was already correct).
- Task 2 complete: landscape viewport/control regression failed before layout repair; all mobile checks passed afterward. Visual QA then caught an oversized stop-assist panel; its regression failed before compaction and passed afterward.
- Task 3 complete: projection/cache, exhaust, and stationary-bitmap regressions each failed before implementation and passed afterward. Terrain pixels match the original drawing routine across the tested elevations, palettes, viewport changes, and eviction. Final interleaved cold/warm moving/stopped benchmark is recorded in docs/terrain-benchmark-2026-10-30.json; measured tradeoffs are in docs/app-repairs.md.
- Task 4 complete: integrity instrumentation caught forbidden writes in the previous driver. The replacement completed graded and signal specs through production update() only. Sixteen additional routes completed without penalties or retries.
- Final fresh source review: no material findings. Physical iOS/Safari, hardware FPS, and audible quality remain manual. Geometry tuning requires route regeneration, as before.
- Final verification: npm test -> 48 passed in 34.3 seconds; syntax checks and git diff --check passed; desktop, portrait, landscape, hill, and derailment screenshots inspected without page errors.
- Delivery: changes retained in the current checkout, uncommitted; no branch, index, remote, or publication changes.
- Follow-up: the user increased the missed-stop penalty from 20 to 60 seconds; tuning, regression expectations, and current documentation were updated accordingly.
