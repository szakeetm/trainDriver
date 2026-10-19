# Isometric terrain version

The main game now renders an isometric world with Canvas 2D. The drone inset,
its renderer, DOM, styles, and lifecycle tests have been removed. Three.js is
no longer loaded; the unused vendored bundle remains unchanged.

## World and rendering

- `?seed=alpine` reproduces the route, stations, signals, scenery, and heights.
  The seed is kept on `route.seed`; an unseeded restart selects a new world.
  Train livery and exhaust remain randomized independently.
- World `x/y` remain horizontal meters. Route samples additionally expose
  `elevation`, `grade` (rise/run), and `pitch` (radians). Existing station and
  signal distances retain their meaning.
- Track elevation follows smooth station-to-station transitions, with level
  areas extending 240 m either side of a station. Generated grade is capped
  at 8%, with alternating climbs and descents and station elevations between
  35 and 280 m. Landscape relief is now 96 m. Terrain hills blend into a railway corridor through cuttings and fill.
- `js/view.js` owns the fixed isometric projection and its ground inverse.
  Camera translation follows train position and elevation; zoom varies with speed.
- Terrain is a shaded triangular heightfield with shared vertices. Its spatial
  track lookup and vertex cache belong to the route; the cache is capped at
  12,000 entries and replaced on restart.
- Track and stop zones use projected world geometry. Train bodies include
  elevation and pitch, roofs, sides, windows, and couplers for all three units.
  Derailment and exhaust positions carry elevation too.
- Props and trains are sorted by world depth. Nearby foreground scenery fades
  to keep the consist visible. Terrain draws below the railway and objects;
  labels, signals' countdown text, and HUD remain readable in screen space.
- Station assist sits at the bottom of the canvas and fits desktop/mobile widths.

## Scope

Elevation affects acceleration and braking. Gravity contributes
`-9.81 * sin(atan(grade))` m/s², using the average rise/run beneath the complete
consist. Vehicles are weighted by length (assuming equal mass per meter), with
coupler gaps excluded. An ascending locomotive can therefore still receive
help from coaches that remain on a descent, and vice versa at a crest.

The existing speed/travel multiplier does not multiply gravity. Full power can
start the train on the steepest generated climb, and full braking can stop and
hold it on the steepest descent. Released brakes allow downhill rolling; uphill
stalls stop at zero because reverse movement is not supported. Very slow trains
now brake fully to zero rather than creeping indefinitely below 0.08 m/s.

Station acceptance, signal rules, and simulation update ordering are unchanged.
The HUD reports elevation and local track grade. Bridges, tunnels, and grade-separated crossings are not implemented.
Depth ordering of intersecting large objects is approximate; terrain uses a
cutaway presentation rather than hiding the train behind foreground hills.

## Validation

### iOS Safari startup investigation

An iPhone 15 Pro Max on current iOS was reported to show a blank scene and
unresponsive controls after the terrain migration, including after reload.
The deployed files matched the workspace. A fresh Playwright WebKit session
at 430 x 932 and DPR 3 started successfully; the physical-device failure has
not been reproduced, so its exact cause is still unconfirmed.

The compatibility changes remove the canvas bitmap's intrinsic size from layout,
cap its backing store at DPR 2, 4096 pixels per dimension and 4 megapixels, and
avoid clearing/reallocating it on unchanged resize events. A shared release query
on CSS and scripts refreshes cached assets together after the migration; bump
that key together when changing contracts between scripts. `js/diagnostics.js`
loads before the game scripts and displays script loading/startup/runtime errors
inside the scene so a remaining device-specific failure can be reported without
a remote console.

`tests/ios-safari.spec.js` covers painted pixels and control response at the
phone's DPR, rotation, restart, unchanged resizes, stale unversioned assets,
and readable failures. Run it in WebKit alongside the existing terrain checks:

```powershell
npx playwright install webkit
npx playwright test tests/ios-safari.spec.js tests/isometric-terrain.spec.js tests/rendering-optimizations.spec.js --browser webkit --workers 1
```

All 14 focused tests passed in Playwright WebKit and installed Microsoft Edge.
Playwright WebKit on Windows does not validate iOS hardware or Safari's browser UI.

See `tests/isometric-terrain.spec.js` for reproducible projection, terrain,
elevation, station, derailment, cache, input, and responsive-layout checks.
`tests/rendering-optimizations.spec.js` retains the startup/restart generation
count regression. The former 3D sleeper/resource test no longer applies.

A current desktop station approach is captured in
[`screens/isometric.png`](../screens/isometric.png). Existing review notes in
`code-review.md` document the previous renderer and are retained as history.

### Initial isometric validation

Validated in headless installed Microsoft Edge using the local Playwright config,
a running HTTP server at port 4173, and one worker:

```powershell
npx playwright test --config .playwright-local.config.cjs --workers 1
```

All 13 tests passed, including the slower watch/autoplay scenario and the fast
zero-penalty route win. After the final origin earthworks extension, all 12
focused rendering/input/physics/win tests passed again. JavaScript syntax checks
and `git diff --check` passed. Desktop (1440 x 900) and mobile (390 x 844) station
views were also inspected. No hardware-GPU frame-rate comparison was performed.


## Gradient physics regression coverage

`tests/grade-physics.spec.js` checks generated climbs/descents and flat station
areas, gravity under power/coasting/braking, consist averaging across a crest,
longer downhill and shorter uphill stopping distances, downhill holding and
rolling, uphill starts/stalls, and independence from the travel multiplier.
Three fixed seeds (`alpine`, `ridge`, `valley`) must each finish without penalties,
with no randomized retry. The test autopilot now compensates for gravity and
aims inside the red stop zone rather than relying on residual low-speed creep.

Gradient update validation: all 21 tests passed in headless Microsoft Edge using
`npx playwright test --config .playwright-local.config.cjs --workers 1`, including
all three fixed graded routes, the randomized win, and the slower autoplay demo.
JavaScript syntax checks and `git diff --check` passed. A seeded 6.8% climb was
also inspected visually without page errors.


## Prop clearance

Scenery is filtered after the complete route and its spatial index exist. Prop
centers alone are insufficient: ponds have wide edges, buildings have roof
overhangs, and tall foreground trees can project over rails despite clear bases.
`getSceneryBounds()` supplies conservative footprint radii and heights, using
the same size scale as the Canvas renderer. Placement checks both ground
clearance and the full projected silhouette against every nearby track section,
including sections distant in route chainage. Conflicting props are omitted;
remaining scenery stays ordered and seeded generation stays reproducible.

Clearance reserves the 11 m track-bed half-width plus 4 m of space and a 1 m
allowance for curved-track sampling. The projected test uses a temporary spatial
index, discarded after generation, and works at every zoom of the fixed camera.
It does not add per-frame collision checks.

`tests/scenery-clearance.spec.js` covers oversized ponds/roofs, foreground foliage,
nearby track sections, and complete curved routes across six seeds. All 22
focused scenery, rendering, input, physics, and win tests passed in headless Edge
with one worker; syntax and whitespace checks also passed.
