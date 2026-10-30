# Train Driver: agent context

## Project and execution

This is a static train driving game using classic browser JavaScript, Canvas 2D,
and Web Audio. The main view is an isometric Canvas heightfield; the 3D inset
was removed. There is no application build,
backend, bundler, or framework. Open `index.html` directly to play; use HTTP for
browser tests. npm dependencies are development tools only.

Scripts share a global lexical scope. Top-level `let`/`const` bindings such as
`state` and `route` are accessible in `page.evaluate`, but are not properties of
`window`. Preserve the script order in `index.html`:

`js/diagnostics.js` loads first to report script/startup/runtime errors.

1. `js/core.js`: DOM references, default tuning, mutable globals.
2. `js/audio.js`: Web Audio graph and gesture-based audio unlock.
3. `js/shared.js`: configuration, formatting, input, sizing, train poses.
4. `js/view.js`: isometric projection, inverse ground projection, camera metrics, segment geometry.
5. `js/world.js`: seeded route, elevation profiles, terrain, biomes, signals, scenery.
6. `js/simulation.js`: state creation, physics, controls, signals, stations, failure.
7. `js/ui.js`: DOM HUD and station assist.
8. `js/rendering.js`: terrain mesh, track ribbons, depth-sorted props/trains, labels, HUD.
9. `js/main.js`: initialization, restart, update, animation loop.

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
- `createInitialState()` also replaces global `route`. Use `?seed=alpine` (or any
  string) to reproduce route geometry, stations, signals, scenery, and terrain.
  `generateRoute(seed)` uses a local random stream, restored with `finally`; it
  must not reseed global `Math.random()` or affect exhaust/audio randomness.
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
  Up/Down are the only keyboard controls. Source sets aggregate keyboard and
  pointer holds into `keys`; blur, visibility loss, and restart clear them.
- Station tolerance comes from `stations.stopWindow`. Overrunning that window
  immediately advances the target and adds `stations.missPenalty` seconds per
  missed stop; the last overrun finishes with delays in the same update.
- Red stop zones include the signal line. Strictly greater chainage crosses
  the line; pass processing still precedes red waiting/clearance.
- World `x/y` are horizontal meters; `elevation` is vertical meters. Track grade
  is rise/run and pitch is radians. Route distance remains horizontal chainage.
  `updatePhysics()` applies gravity along the average grade under the consist,
  weighted by vehicle length (equal mass per meter, excluding coupler gaps).
  `visibleSpeedMultiplier` scales travel only, not gravity. There is no reverse
  movement: uphill stalls clamp at zero, downhill coasting rolls forward, and
  sufficient braking holds the train.
- `getTrackElevation()` uses smooth transitions up to 8% and level station zones.
  `getTerrainHeight()` blends surrounding hills into track earthworks, using a
  route-owned spatial index. Terrain vertices and derived triangle lighting
  have separate route-owned caches, each bounded by `terrain.cacheLimit`.
  Vertex projections are reused only within one terrain draw. A stopped view
  can reuse one backing-store-sized terrain bitmap; camera/size/palette changes
  invalidate it, moving drops it, and restart replaces all caches.
- Both regular and derailed poses include elevation. `createRenderFrameContext()`
  supplies all consist units, camera metrics, biome blend, and overlay labels.
- Scenery clearance runs once after route/index generation. It checks full prop
  footprints and projected height against all track sections, rejecting overlaps.
  Keep `getSceneryBounds()` synchronized with the Canvas prop geometry.
- Terrain draws first, then track ribbons and ground zones, then depth-sorted
  props/trains. Labels and HUD draw last. Foreground scenery fades near the train.
  Bridges, tunnels, and grade-separated crossings are not modeled; object sorting
  is approximate for intersecting large geometry.
- Browser audio requires a user gesture; preserve the unlock/retry paths.
  No WebGL context or Three.js scripts are loaded. The unused vendored
  `three.min.js` remains untouched.

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

`npm test` includes the isometric terrain regressions and slower watch/demo spec.
Run focused rendering coverage with
`npx playwright test tests/isometric-terrain.spec.js tests/rendering-optimizations.spec.js`.
These check offline execution without WebGL, seeded generation, projection,
continuous grade-limited elevation, flat station zones, track earthworks,
train/derailment heights, cache replacement/bounds, and desktop/mobile resizing.
`tests/grade-physics.spec.js` checks slope forces, braking distances, crest
transitions, stationary behavior, and clean wins on three fixed graded routes.
`tests/rendering-optimizations.spec.js` checks one route generation per start/restart.
`npm run test:win:watch` and `npm run test:win:headed` display the route in a browser.
Playwright expects an already-running server at `http://127.0.0.1:4173`;
config does not start one.

`tests/win-autopilot.js` drives `state.requestedControl` using accelerated
production `update()` calls. It cannot teleport, overwrite physics, or manually
clear signals. Win specs use fixed seeds without retry and assert `Run complete`
with zero penalties. `tests/autopilot-integrity.spec.js` guards this contract;
passing fixed routes does not prove every possible generated route or input.
Inspect `docs/playwright-findings.md` for signal and station edge cases.

`tests/gameplay-regressions.spec.js` checks input-source isolation, Up/Down only,
station overruns, red-line equality/crossing, terminal HUD/audio/progress, and
deterministic segment boundaries. Rendering optimization tests compare pixels
against `tests/terrain-reference.js` and exercise cache lifetime/eviction.
Run `node tests/terrain-benchmark.js` with the server running for controlled
cold/warm, stopped/moving CPU submission measurements.

For rendering changes, check seeded flat/graded track, stations, signals,
derailments, resize, restart, and mobile layouts. Inspect page errors and terrain
cache size. Prefer focused coverage when changing resource ownership or gameplay.

## Change guidelines

Keep the static/offline execution path and existing browser script architecture
unless a migration is requested. Follow the surrounding formatting; there is no
configured linter or formatter. Avoid dependency churn and editing the vendored
Three.js bundle. Measure rendering changes on a consistent route, viewport,
and device pixel ratio before claiming a frame-rate gain.
