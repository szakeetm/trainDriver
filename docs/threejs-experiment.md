# Three.js world experiment

This experiment starts from published WebGL 2 commit `ee52655` on
`experiment/threejs-world`. It compares the existing raw-WebGL-terrain plus
Canvas-world backend with GPU world geometry managed by vendored Three.js r128.

The shared simulation, seeded world, HUD, and audio remain unchanged. The new
`?renderer=three&seed=alpine` mode loads the existing local Three.js bundle only
when requested. `renderer=webgl2` remains the terrain-only comparison backend;
`renderer=canvas` remains the fallback. No new dependencies or bundle edits.

## Experiment choices

- Raw terrain and Three.js share the terrain canvas and WebGL 2 context, avoiding
  another compositing layer and keeping the measured terrain implementation.
  Explicit state resets hand the context between the two renderers.
- Static track and scenery become retained merged geometry in route-distance
  chunks with conservative projected bounds. Station/signal geometry is rebuilt
  only when station selection or signal aspects change.
- All vehicles use retained local meshes updated with the existing unit poses,
  including grade and derailment. Couplers and exhaust use reusable dynamic
  buffers. Signs, poles, and signal lights use GPU geometry/billboards.
- Text labels, route predictor, elevation readout, speed streaks, and HTML HUD
  remain on Canvas/DOM. This is a world-graphics experiment, not a rewrite of the
  game or a claim of pixel identity. Terrain keeps the current cutaway layer;
  world objects use geometric depth within their layer.
- Compare both modes on identical route/camera paths and device pixel ratios,
  using hardware D3D11. Separate CPU submission, observed RAF cadence, GPU work,
  cold preparation, memory, and capture completion costs.
- The Three.js mode remains opt-in. Publication of the experiment was authorized
  after review of these results; parity work follows as a separate change.

## Results and verification

The WebGL 2 baseline was committed as
[`ee52655`](https://github.com/szakeetm/trainDriver/commit/ee52655c4fff0974a9e139cd1f1ab454bf6ac85a),
pushed on `experiment/webgl2-terrain`, fast-forwarded into `main`, and pushed to
`origin/main`. Both remote refs were verified at that commit. All 54 tests passed
in hardware Edge immediately before committing. No deployment/Pages status is
implied by the Git push.

The Three.js work below was prepared on `experiment/threejs-world` for publication
and integration into `main`. The default renderer remains terrain-only WebGL 2.

### Controlled comparison

Run `node tests/three-world-benchmark.js` with the local HTTP server running.
Raw measurements are in
[`three-world-benchmark-2026-10-30.json`](three-world-benchmark-2026-10-30.json).
The final run used Chromium 147.0.7727.15, ANGLE D3D11, and an **NVIDIA RTX 2060**.
Canvas 2D, GPU compositing, rasterization, and WebGL were enabled. Software
renderers are rejected by this benchmark.

Both modes run in the same page, using seed `alpine`, identical backing
resolutions, camera positions, speed, and shared HUD. Three.js is already loaded
for both measurements to allow switching; normal `renderer=webgl2` pages never
download the bundle. The baseline is the current WebGL2-terrain + Canvas-world
implementation, not an older Canvas-only or software-rendered result. The only
baseline integration overhead is the dormant optional-world check and a context
handoff on the first frame after a Three render.

Warm tight-loop figures are medians of nine alternating batches of thirty full
frames per renderer. At 24 m/s the camera moves 0.6 m per frame; at 72 m/s it
moves 1.8 m. A separate test draws through real RAF callbacks, recording 90
intervals after ten warmup frames. Cold preparation clears terrain caches and
disposes/rebuilds the Three route geometry, with five samples per mode. No other
browser tests ran during the final comparison.

| Viewport / DPR | Scene | WebGL2 + Canvas submission | Three world submission | Per-RAF CPU: baseline → Three |
| --- | --- | --- | --- | --- |
| 1440 × 900 / 1 | Stopped | 0.333 ms | 0.033 ms | 0.4 → 0.1 ms |
| 1440 × 900 / 1 | Moving, 24 m/s | 0.563 ms | 0.083 ms | 0.8 → 0.3 ms |
| 1440 × 900 / 1 | Moving, 72 m/s | 0.773 ms | 0.077 ms | 0.9 → 0.3 ms |
| 1440 × 900 / 1 | Biome transition | 0.430 ms | 0.063 ms | 0.6 → 0.2 ms |
| 390 × 844 / 2 | Stopped | 0.283 ms | 0.033 ms | 0.4 → 0.1 ms |
| 390 × 844 / 2 | Moving, 24 m/s | 0.427 ms | 0.087 ms | 0.6 → 0.3 ms |
| 390 × 844 / 2 | Moving, 72 m/s | 0.657 ms | 0.080 ms | 0.8 → 0.3 ms |
| 390 × 844 / 2 | Biome transition | 0.310 ms | 0.063 ms | 0.5 → 0.3 ms |

Moving tight-loop CPU submission fell about **80–90%**. The paced measurements
show a smaller, still useful runtime-budget reduction: approximately
**0.5–0.9 ms to 0.2–0.3 ms per moving frame**. Tight-loop medians should not be
substituted for paced frame costs or GPU completion time.

Both modes remained around **16.7 ms per RAF callback**, with no interval over
25 ms in the recorded windows. This is the headless browser's observed cadence,
not a physical-display FPS measurement. The experiment demonstrates more CPU
headroom on this machine, not an increase from 60 to hundreds of displayed FPS.
Phone-sized/DPR-2 results still use the RTX 2060, not a physical phone GPU.

The separate GL query spans different work: baseline terrain in one mode and
terrain plus Three world in the other; Canvas world work uses another context.
Those figures are diagnostic and are not a like-for-like GPU speedup measure.
Render-plus-JPEG-capture diagnostics include IPC, composition/readback, and
encoding. They were usually lower with Three in this run, with a small desktop
biome-case regression; they also do not measure display FPS.

### Costs and appearance

- Cold full-frame preparation increased from roughly **3.6–6.1 ms** to
  **26.3–39.2 ms**. The first measured Three cold frame was about **44–51 ms**,
  including its first world-program compilation. Library loading and initial
  renderer creation occur before these per-frame measurements and are extra.
- Three retains approximately **7.24 MiB of typed world-geometry buffers** for
  this complete route, in addition to raw terrain caches. Only visible chunks
  are uploaded/drawn initially; this CPU buffer figure is not total VRAM usage.
  Materials/programs, framebuffers, browser memory, and transient builder arrays
  are additional. Geometry is disposed on restart; materials are reused.
- The measured world had 86,589 static vertices. The world pass issued roughly
  12–16 calls at the tested moving positions, in addition to the terrain calls.
- Static route chunks and vehicle meshes avoid rebuilding projected box faces,
  window polygons, and track paths every frame. GPU uniforms/matrices handle
  projection, grade, warning colors, and foreground scenery fading.
- Tree ground shadows, polygon outlines, rounded signal/sign corners, and glow
  are simplified or omitted. Object depth is geometric rather than the old
  center-sort approximation. These quality differences also avoid some drawing
  work, so this is not a pixel-identical, equal-rasterization comparison.
- The raw terrain, route geometry, scoring, controls, speed limits, signals,
  station handling, audio, and win logic remain shared. Labels, sign numerals,
  predictor, elevation readout, speed streaks, and HTML HUD remain Canvas/DOM.

### Validation

- All **63 tests passed in hardware Edge** in 42.3 seconds, including the watch
  demo and the existing WebGL/Canvas regressions.
- All nine Three-specific tests also passed in the default software Chromium:
  painting/geometry, all vehicles, restart/switching, derailment, context loss
  and restoration, portrait/landscape resizing, direct-file offline loading,
  optional-library failure, stationary presentation, and an unassisted graded win.
- Fresh read-only review found two issues: the last exhaust puff could remain
  cached after removal, and asynchronous startup failures bypassed diagnostics.
  Both were reproduced in failing regressions, fixed, and covered by the green
  full suite. No further material lifecycle, clipping, or handoff issue was found.
- Syntax and whitespace checks pass. Hardware screenshots compare the current
  and Three renderers at stations, climbs, biome transitions, derailment, and
  desktop/phone layouts. Final screenshots are retained locally in the ignored
  `test-results/` directory.

This experiment is promising for steady-state render CPU cost. Its larger
initialization/memory cost and visual differences require review before any
promotion to `main`. Physical iOS/Safari, mobile GPU/memory behavior, and live
deployed behavior remain unvalidated. The existing vendored bundle is unchanged.
