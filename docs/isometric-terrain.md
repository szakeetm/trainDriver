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
  at 4%. Terrain hills blend into a railway corridor through cuttings and fill.
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

Elevation is visual only: traction, braking, station acceptance, signal rules,
and simulation update ordering are unchanged. The HUD reports elevation and
visual grade. Bridges, tunnels, and grade-separated crossings are not implemented.
Depth ordering of intersecting large objects is approximate; terrain uses a
cutaway presentation rather than hiding the train behind foreground hills.

## Validation

See `tests/isometric-terrain.spec.js` for reproducible projection, terrain,
elevation, station, derailment, cache, input, and responsive-layout checks.
`tests/rendering-optimizations.spec.js` retains the startup/restart generation
count regression. The former 3D sleeper/resource test no longer applies.

A current desktop station approach is captured in
[`screens/isometric.png`](../screens/isometric.png). Existing review notes in
`code-review.md` document the previous renderer and are retained as history.
