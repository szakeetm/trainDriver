# Three.js visual parity pass

The original Three.js experiment was committed as
[`3c1c1a4`](https://github.com/szakeetm/trainDriver/commit/3c1c1a4e3071bd12b4410067113291393e651c74),
pushed to `experiment/threejs-world`, fast-forwarded into `main`, and pushed to
`origin/main`. Both remote refs were verified at that commit. All 63 hardware
Edge tests passed before publication. This does not assert a Pages deployment.

The following parity work was developed on `fix/threejs-visual-parity` and
approved for publication and integration into `main` after visual review.
Use `index.html?renderer=three&seed=alpine`; compare with `renderer=webgl2` for
the original Canvas world over the same terrain, or `renderer=canvas` for the
full Canvas fallback. Three remains opt-in.

## Restored appearance and correctness

- Fixed the warning/derailment tint affecting the locomotive roof. It now changes
  only the body sides, matching Canvas; the roof, cab, and outlines retain color.
- Added the original 0.6px side/roof outlines to boxes and the pond edge. Face
  normals follow vehicle heading and reject the sides Canvas does not draw.
- Restored the offset, rotated elliptical tree shadows. Their size and foreground
  fade follow the original. Tree tip height was audited and was already correct.
- Restored rounded speed signs, rounded signal housings, and signal glow.
  `paintRouteMarker()` and `paintTreeShadow()` are shared by the original Canvas
  renderer and a small GPU atlas, so their shapes/colors have one source.
- Atlas rendering compensates for the backing-store ratio because Canvas
  `shadowBlur` does not scale with its context transform. A DPR-2 pixel fixture
  caught the initial mismatch. Ratio changes dispose/replace the texture; route
  restart reuses it. Completely transparent texels discard before depth writes.
- Fixed curved stop-zone fill: triangle fans can overlap or leave wedges in a
  concave ribbon. Triangulation now uses the fixed isometric projected contour,
  matching Canvas's fill silhouette through bends and elevation changes.
- Retained track construction now reads `TUNING.visuals.trackSampleStep`.
  Bumped the shared script release key for the new renderer contract.

## Cleanup and memory

The first version of these details retained 211,491 static vertices and
19.18 MiB of world buffers, with cold preparation around 61–74ms. It was not
kept as the final implementation. Static boxes now omit their invisible faces;
vehicle meshes retain all sides because their heading changes. Tree shadows
share a textured quad rather than retaining a 48-point ellipse per prop.

The final route retains **136,503 static vertices**, **13,081,388 bytes
(12.48 MiB) of typed world-geometry buffers**, and **one 524,288-byte (512 KiB)
RGBA atlas**. The published experiment used 7.24 MiB of world geometry with less
detail. These are resource payloads, not total process memory or total VRAM:
browser/driver objects, terrain, transient builder arrays, and framebuffers are
additional. Only visible route chunks are uploaded/drawn initially.

## Performance

Final measurements are recorded in
[`three-world-parity-benchmark-2026-10-30.json`](three-world-parity-benchmark-2026-10-30.json).
The benchmark uses the same `alpine` paths, viewport/backing sizes, and hardware
Chromium/D3D11 backend as
[the published comparison](threejs-experiment.md). It alternates nine batches of
30 frames per mode and separately measures 90 real RAF intervals after warmup.
Cold preparation is the median of five cache-cleared/rebuilt frames. No other
browser tests run during timing.

Final run: **Chromium 147.0.7727.15 / NVIDIA RTX 2060 / ANGLE D3D11**.
Canvas, GPU compositing, and WebGL were hardware-enabled. Both modes are measured
in the same page with Three loaded, as in the checkpoint report.

| View / DPR | Scene | Warm submission: Canvas world → parity | Per-RAF CPU: Canvas world → parity | Cold Three: published → parity |
| --- | --- | --- | --- | --- |
| 1440×900 / 1 | Stopped | 0.393 → 0.040 ms | 0.5 → 0.1 ms | 39.2 → 55.3 ms |
| 1440×900 / 1 | Moving, 24 m/s | 0.587 → 0.087 ms | 0.8 → 0.3 ms | 31.1 → 46.5 ms |
| 1440×900 / 1 | Moving, 72 m/s | 0.760 → 0.080 ms | 1.0 → 0.3 ms | 30.8 → 44.4 ms |
| 1440×900 / 1 | Biome transition | 0.390 → 0.060 ms | 0.6 → 0.3 ms | 28.0 → 44.1 ms |
| 390×844 / 2 | Stopped | 0.267 → 0.037 ms | 0.4 → 0.1 ms | 36.4 → 54.8 ms |
| 390×844 / 2 | Moving, 24 m/s | 0.450 → 0.090 ms | 0.6 → 0.3 ms | 26.3 → 44.2 ms |
| 390×844 / 2 | Moving, 72 m/s | 0.730 → 0.107 ms | 0.9 → 0.3 ms | 29.6 → 43.8 ms |
| 390×844 / 2 | Biome transition | 0.343 → 0.073 ms | 0.5 → 0.3 ms | 29.0 → 47.1 ms |

The additional detail preserves the steady moving-frame budget near **0.3ms**
on this machine. Published Three moving/biome RAF costs were 0.2–0.3ms; small
differences are near the timer's resolution. Tight-loop submission is still much
lower than Canvas world drawing, but is not a GPU-completion or display-FPS value.

The cost remains higher at startup/restart: median cold Three preparation is
**43.8–55.3ms**, versus **26.3–39.2ms** in the simpler published experiment and
3.5–5.8ms for terrain-WebGL + Canvas world in this run. The first measured Three
cold frame, including world-program compilation, was 71.4ms desktop and 57.4ms
phone-sized. Library/renderer setup is additional and precedes those samples.
The static-face/shadow cleanup reduced this cost from the first parity version,
but did not eliminate it.

Every recorded RAF median remained around **16.7ms**, with zero intervals over
25ms in these windows. This is headless browser cadence, not physical-display
presentation or proof of a displayed-FPS gain. Phone-sized results use the RTX
2060, not a physical phone. The GL timing query covers terrain-only versus
terrain-plus-world work, and capture diagnostics include IPC/readback/encoding;
neither is used as a like-for-like GPU speedup claim.

## Validation and limits

- **71/71 tests pass in hardware Edge** (44.3s) after the cleanup, including the
  existing gameplay/win, terrain, fallback, context-loss, restart, and resizing
  regressions.
- **17/17 focused Three/parity tests pass in software Chromium** (6.8s).
  Eight new tests compare production Canvas drawing with production GPU geometry:
  tree silhouette/shadow, warning colors, rounded markers/glow, pond/box outlines,
  DPR/backing caps/atlas lifetime, a curved zone, route headings/grades, derailment.
  The fixture background is excluded from error averages so terrain/empty pixels
  cannot hide a missing small object. Flat train interior pixels are also checked
  independently of antialiasing at edges.
- Tree, warning, marker, outline, DPR-2 glow, and curved-zone checks were observed
  failing before their corresponding fixes. The curved fixture's mean RGB error
  fell from 13.68 to below 2, without loosening that test's threshold. The train
  check separates color accuracy from unavoidable raster-edge differences.
- Read-only review of the changes and subsequent geometry cleanup found no
  material blockers. The reviewer did not run browsers or certify physical GPU
  performance. Syntax and whitespace checks pass.
- Final hardware screenshot pairs were inspected at stations, a 3.9% grade,
  another biome, warning colors, and derailment, plus portrait/landscape DPR 2.
  No page errors or GL errors were reported. The local ignored
  `test-results/three-parity-visuals/` directory retains these pairs.

This is progress towards parity, not exact pixel identity. Geometric object
depth remains in place rather than Canvas's center-based painter sorting.
Overlapping faded objects, glows, shadows, and translucent outlines can blend
differently, especially because partially transparent fragments still write
depth. GPU line endpoints remain butt-ended, and edge antialiasing differs from
Canvas. These choices preserve the retained/chunked renderer; changing ordering
or using an analytic round-line shader should be measured separately.

Physical mobile GPUs, iOS/Safari, and a live deployment have not been validated.
The local vendored Three.js bundle, gameplay, controls, audio, and renderer default
are unchanged by this pass.

## Subsequent visual tuning

After the measured parity pass, the user requested narrower, taller vehicles.
Locomotive body width is now 7 rather than 11; carriage body width is 6.5 rather
than 10 (including the shell margin). `train.bodyHeight` is 7.2 rather than the
previous hardcoded 4.6. Both renderers position windows, roof/cab bases, lamps,
and exhaust from that height. Vehicle lengths and the 100m consist are unchanged.
The timing measurements above precede this appearance-only tuning.

Safari driving buttons also disable text selection and the touch callout using
scoped CSS, with a stylesheet cache-key bump. Hold/release behavior was checked
in Edge; physical Safari remains unvalidated.
