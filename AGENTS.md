# Train Driver: agent context

## Project and execution

This is a static train driving game using classic browser JavaScript, Canvas 2D,
Web Audio, and an optional Three.js drone inset. There is no application build,
backend, bundler, or framework. Open `index.html` directly to play; use HTTP for
browser tests. npm dependencies are development tools only.

Scripts share a global lexical scope. Top-level `let`/`const` bindings such as
`state` and `route` are accessible in `page.evaluate`, but are not properties of
`window`. Preserve the script order in `index.html`:

1. `three.min.js` (vendored; avoid hand editing), then `renderer3d.js`.
2. `js/core.js`: DOM references, default tuning, mutable globals.
3. `js/audio.js`: Web Audio graph and gesture-based audio unlock.
4. `js/shared.js`: configuration, formatting, input, sizing, train poses.
5. `js/drone.js`: inset lifecycle, resize/toggle, camera view metrics.
6. `js/world.js`: procedural route, biomes, terrain caches, signals, scenery.
7. `js/simulation.js`: state creation, physics, controls, signals, stations, failure.
8. `js/ui.js`: DOM HUD and station assist.
9. `js/rendering.js`: Canvas drawing and shared render-frame context.
10. `js/main.js`: initialization, restart, update, animation loop.

`styles.css` contains layout and responsive styling; `screens/` and `cover.jpg`
are documentation/media assets. `docs/` contains test findings and code review notes.

## Runtime contracts

- `DEFAULT_TUNING` in `core.js` is the source for gameplay configuration.
  `applyTuning()` clones it and derives constants and randomized consist colors.
  Some behavior still uses hardcoded values; inspect the actual consumer before tuning.
- Distances and train lengths are in meters, speeds in meters/second, time in
  seconds, headings in radians. HUD speed uses `KPH_PER_MPS = 3.6`.
  `visibleSpeedMultiplier` also scales distance advancement in physics.
- `state.distance` is the locomotive front; unit centers/rears are behind it.
  Use `getStationStopMetrics()` for station stop targets and tolerances.
- `createInitialState()` also replaces global `route`. Routes use `Math.random()`;
  failures need a reproducible random source or captured route to investigate reliably.
  `startRun()` owns initial state creation for both startup and restart; avoid
  generating an extra state/route before calling it.
- Route segments, signals, and scenery are ordered by distance. Preserve ordering
  because bounded rendering and `findFirstSortedIndex()` rely on it.
  `evaluateRoute()` caches its last segment and falls back to binary search.
- The animation loop clamps its time step to 0.05 seconds. `update()` processes
  controls/physics, exhaust, signal passes, red waiting, failure checks, penalties,
  stations, audio, and throttled HUD updates in that order. Signal processing order
  affects boundary failures; do not reorder as a cosmetic refactor.
- Controls range from -1 (braking) to +1 (power), with delayed actual response.
  Keyboard and pointer holds share `keys`; blur clears held controls.
- The inset starts minimized. WebGL creation is deferred until expansion, and
  hidden restarts defer route synchronization until expansion. Its `setRoute()`
  disposes old scene resources, including exhaust emitters, before rebuilding.
  Sleepers are baked into meshes of up to 64 sleepers with bounding spheres for
  spatial culling. Three.js is r128; do not assume newer instancing/bounds APIs.
- Both renderers consume the train poses in `createRenderFrameContext()`.
  Keep derailment poses consistent between views. The 3D view currently builds
  only the first two train units; account for that when changing camera framing.
- Browser audio requires a user gesture; preserve the unlock/retry paths.
  WebGL failure should leave the 2D game playable.

## Running and verification

```powershell
npm ci
python -m http.server 4173 --bind 127.0.0.1
```

In a separate terminal:

```powershell
npx playwright install chromium
npm run test:win
```

`npm test` also includes the 3D lifecycle regression and slower watch/demo spec.
Run the focused lifecycle check with
`npx playwright test tests/drone-lifecycle.spec.js`.
`tests/rendering-optimizations.spec.js` checks startup generation count and
batched sleeper placement, bounds, shadows, and resource cleanup.
`npm run test:win:watch`
and `npm run test:win:headed` display the route in a browser. Playwright expects
an already-running server at `http://127.0.0.1:4173`; config does not start one.

`tests/win-autopilot.js` drives `state.requestedControl` using accelerated
in-page updates. The win specs allow up to six randomized routes and assert
`Run complete` with zero penalties. Passing them proves an eventual clean win,
not success on every route, input coverage, or 3D correctness. Inspect
`docs/playwright-findings.md` for signal and station edge cases.

For render/lifecycle changes, also check initial minimized load, expansion,
collapse, resize, restart while expanded, and restart while collapsed; inspect
console errors and scene resource counts. Prefer focused regression coverage
when changing resource ownership or gameplay rules.

## Change guidelines

Keep the static/offline execution path and existing browser script architecture
unless a migration is requested. Follow the surrounding formatting; there is no
configured linter or formatter. Avoid dependency churn and editing the vendored
Three.js bundle. Measure rendering changes on a consistent route, viewport,
device pixel ratio, and inset visibility before claiming a frame-rate gain.
