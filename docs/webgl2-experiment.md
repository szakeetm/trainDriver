# WebGL 2 terrain experiment

This is the terrain-only comparison requested on 2026-10-30, developed on
`experiment/webgl2-terrain` from `3a146bc` and approved for integration into
`main`. The Canvas renderer, gameplay, sound, and HTML HUD are retained.

## Scope and choices

The chosen approach is a WebGL 2 terrain canvas beneath the existing transparent
Canvas 2D world/HUD. This isolates the measured terrain cost and preserves the
game's static/offline architecture. Porting the whole world would also replace
train/scenery drawing and text, increasing the comparison's scope. A WebGPU or
engine migration adds work unnecessary for this experiment.

- This branch defaults to WebGL 2. `?renderer=canvas` selects the existing renderer;
  `?renderer=webgl2` explicitly selects the prototype. Append `&seed=alpine` to
  compare the same world. Unsupported/lost WebGL falls back to Canvas.
- Terrain uses 16 × 16-cell chunks with static position, tone, and cell-depth
  attributes. GPU shaders project the camera and blend biome colors. Chunk
  storage is capped at 48 chunks, and restart releases the previous route's
  buffers. This is independent of the bounded Canvas vertex/lighting caches.
- Cell depth reproduces the Canvas diagonal painter ordering instead of
  introducing physical occlusion that would change the existing cutaway view.
- Geometry and shading are preserved, but Canvas triangle strokes and WebGL
  rasterization/antialiasing differ. Pixel identity is not a goal for this spike;
  projection, coverage, palette, and visible alignment will be checked.
- Compare cold preparation, warm moving/stopped terrain submission, full-frame
  submission, animation frame intervals, GPU timing when available, and a
  diagnostic completion measurement. Record the actual graphics backend.
- No commits, pushes, dependency changes, framework changes, or vendored bundle
  edits are part of this experiment.

## Validation and results

### Hardware comparison

Run `node tests/webgl2-benchmark.js` with the local server running. Raw samples,
GPU metadata, and detailed results are in
[`webgl2-benchmark-2026-10-30.json`](webgl2-benchmark-2026-10-30.json).

The final run used headless Chromium 147.0.7727.15 with
`--use-angle=d3d11 --enable-gpu`, on **NVIDIA GeForce RTX 2060 / ANGLE D3D11**.
Browser diagnostics confirmed that Canvas 2D, GPU compositing, rasterization,
and WebGL were enabled. The default bundled test browser instead selected
SwiftShader; those software results are not used for this performance table.
The earlier Canvas-only optimization report also used a different software
configuration, so its millisecond figures are not directly comparable here.

Both backends use seed `alpine`, identical backing resolutions, camera paths,
speeds, overlays, and current optimized Canvas baseline. At 24 m/s the camera
advances 0.6 m per frame; at 72 m/s it advances 1.8 m. The biome case crosses the
first biome boundary. Measurements alternate renderers for seven batches of
twenty draws after warming their caches. Cold terrain uses five cache-cleared
draws. No other browser tests ran during the comparison.

| Viewport / DPR | Scene | Canvas full-frame CPU | WebGL full-frame CPU | CPU reduction |
| --- | --- | --- | --- | --- |
| 1440 × 900 / 1 | Stopped | 0.410 ms | 0.415 ms | Essentially unchanged |
| 1440 × 900 / 1 | Moving, 24 m/s | 1.950 ms | 0.735 ms | 62% |
| 1440 × 900 / 1 | Moving, 72 m/s | 3.100 ms | 0.900 ms | 71% |
| 1440 × 900 / 1 | Biome transition | 2.200 ms | 0.530 ms | 76% |
| 390 × 844 / 2 | Stopped | 0.335 ms | 0.335 ms | Unchanged |
| 390 × 844 / 2 | Moving, 24 m/s | 1.525 ms | 0.620 ms | 59% |
| 390 × 844 / 2 | Moving, 72 m/s | 3.185 ms | 0.915 ms | 71% |
| 390 × 844 / 2 | Biome transition | 1.265 ms | 0.440 ms | 65% |

Moving full-frame CPU submission is **2.5–4.2 times faster** in these cases.
The separate RAF measurements support the same direction: median moving-frame
CPU time changed from 1.3–2.9 ms to 0.6–1.0 ms. These are submission/JavaScript
costs, not GPU completion times.

**Both remained at the headless browser's approximately 60 Hz animation cadence.**
Both backends stayed around 16.7 ms per RAF callback, with no measured
interval over 25 ms in the 90 recorded intervals per case. The gain is CPU
headroom at that cadence. RAF callbacks do not measure physical display
presentation or compositor frame drops. A higher uncapped FPS or a physical
phone speedup has not been measured. Phone-sized/DPR-2 cases still ran on the
RTX 2060, not a phone GPU.

Terrain-only submission changed from 0.775–4.215 ms to 0.015–0.055 ms while
moving. WebGL achieves that by submitting 16–30 static chunk draw calls instead
of constructing triangle paths. GPU timer queries were available on this
backend; moving terrain measured 0.042–0.495 ms in those queries. These cover
this GL context only, excluding the Canvas overlays and final composition.
There is no equivalent Canvas GPU timing in this experiment.

A separate render-plus-screenshot diagnostic waits for captured output. It
includes IPC, compositing/readback, and JPEG encoding, so it is not a frame-time
benchmark. It improved in several desktop cases but was mixed in phone-sized
cases, including small regressions. Reduced submission cost therefore does not
establish a uniform reduction in total GPU/compositor work.

### Costs and visual limits

- Cold moving terrain preparation measured 3.6–7.1 ms for WebGL versus 1.5–4.7 ms
  for Canvas. Initial WebGL context/shader setup separately measured 12.9–26.4 ms
  across the two fresh pages. This excludes navigation and route generation.
- Measured geometry-buffer storage was 0.47–0.88 MiB; the 48-chunk cache cap is
  1.41 MiB of vertex data. Framebuffers, multisample/depth surfaces, Canvas
  backing stores, browser overhead, and in-flight allocations are additional.
- The cached geometry records local chunk positions to limit float precision
  loss. Biome changes update uniforms without recoloring CPU-side triangles.
- Terrain projection/coverage and colors pass mean RGB error <4/255 and fewer
  than 4% of sampled pixels differing by >32/255 versus Canvas at the tested
  station, climb, biome, distant-route, and desktop/mobile resize positions.
  The prototype intentionally does not reproduce Canvas's 0.6 px triangle
  outline/antialiasing exactly. Screenshots should be judged as an experimental
  rendering change, not pixel-identical output.

### Checks

- The baseline focused rendering suite passed before the experiment.
- GPU painting, explicit Canvas mode, offline/unavailable fallback, bounded
  buffers, restart deletion, context loss/restoration, and visual tolerance tests
  pass in software Chromium and hardware Edge.
- The Canvas pixel oracle now uses a consistent readback context; otherwise
  hardware Canvas can switch to software mid-comparison because of pixel reads.
  The benchmark does not use that readback context.
- A real-presentation-cycle screenshot regression checks that stopped GPU
  terrain stays visible when identical redraws are skipped with
  `preserveDrawingBuffer: false`.
- A fresh read-only source review found no material correctness issues and
  suggested the stopped-presentation check above.
- Software Chromium's full suite passed 53 tests in 41.4 seconds; the subsequently
  added stopped-presentation regression also passed there. The final complete
  hardware Edge suite passed all 54 tests in 41.3 seconds, including the watch
  demo. Syntax checks and `git diff --check` passed.
- Hardware screenshots of stopped terrain, climbs, stations, biome blending,
  derailment, phone portrait, and landscape were inspected against Canvas where
  applicable. No page errors were captured. Local screenshots are retained in
  the ignored `test-results/` directory (`canvas-*` and `webgl2-*`).

This is a promising reduction in render CPU cost while preserving the current
game architecture. Physical iOS/Safari, mobile memory/energy use, and a broader
GPU/driver sample remain unvalidated. A further Three.js world-rendering
comparison is a separate experiment.
