# Three.js visual parity implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. The user
> requested publication of the current experiment followed by cleanup/parity.

**Goal:** Bring the opt-in Three world closer to the original Canvas appearance
without losing retained GPU geometry or changing gameplay.

**Architecture:** Keep the shared terrain context and shader projection. Restore
missing geometry and screen-space decoration in retained buffers, using the
Canvas functions in `js/rendering.js` as the appearance reference.

**Tech stack:** Classic JavaScript, unchanged vendored Three.js r128, WebGL 2,
Canvas 2D, Playwright.

**Spec:** User request: "commit, push, merge, then clean up/work towards parity
for result with the original". The original Canvas world is the reference;
the current WebGL 2 terrain, physics, controls, audio, and HUD remain shared.

## Constraints and decisions

- Publication of the existing experiment precedes parity changes; preserve that
  measured checkpoint. Initially keep new parity changes local for review;
  publication was subsequently authorized by the user.
- Work in the user's current checkout on a new branch; no additional worktree.
- No vendor/dependency changes, new renderer defaults, or gameplay changes.
- Restore details with GPU geometry rather than adding full-world Canvas work.
- Preserve geometric world depth for this pass; exact painter-order parity for
  overlapping transparent objects is a separate architectural tradeoff.

## Review focus

- Dynamic headings/grades/derailment must not expose back-face outlines.
- Foreground-faded props must fade their shadows and decoration together.
- Transparent decoration must not leave depth holes in later world geometry.
- Restart/context loss must release/rebuild additional resources.
- DPR and zoom must retain the original fixed-pixel outline/sign dimensions.

## Tasks

### 1. Publish checkpoint

- [x] Run the complete hardware suite: 63 passed (39.3s).
- [x] Commit/push `experiment/threejs-world`, fast-forward/push `main`.
- [x] Verify both remote refs at `3c1c1a4` and create parity branch.

### 2. Restore scenery and vehicle details

Files: `js/three-world.js`, `tests/three-world-parity.spec.js`.

- [x] Add independent Canvas-vs-GPU pixel comparisons for tree foliage/shadow
  and warning locomotive roof at enlarged fixture views; observe failure.
- [x] Audit tree tip height and restore elliptical shadow. Add reusable polygon
  outlines with fixed 0.6px stroke; match side/roof colors and warning scope.
- [x] Run parity and existing Three regressions; inspect images.

### 3. Restore markers and improve geometry correctness

Files: `js/three-world.js`, `tests/three-world-parity.spec.js`.

- [x] Add pixel fixtures for rounded signs, signal casing/glow, outlined pond,
  multiple box headings, and a curved stop zone; observe missing details.
- [x] Restore screen-space decoration and concave-zone
  coverage without changing offline loading or adding per-frame allocations.
- [x] Honor `TUNING.visuals.trackSampleStep` in retained track generation.
- [x] Verify portrait/landscape/DPR resizing and retained buffer lifetime.

### 4. Review and measure

Files: `docs/threejs-parity.md`, benchmark JSON, README/AGENTS as needed.

- [x] Run all tests in hardware Edge and focused parity in software Chromium.
- [x] Fresh read-only review of the patch; fix significant findings with a
  failing regression followed by the complete green suite.
- [x] Run controlled hardware benchmark after final runtime changes; record
  CPU/pacing/cold/memory costs separately and compare the published checkpoint.
- [x] Inspect seeded station/grade/biome/derailment and phone screenshots.
- [x] Record remaining visual differences and final Git/publication state.

## Execution notes

Checkpoint published: `3c1c1a4e3071bd12b4410067113291393e651c74`.

Task 2: Tree, warning, and marker fixtures failed on the checkpoint. Restored
shadows/edges and side-only warning tint. Raster comparisons pass. The apparent
tree height concern was ruled out by reading the outer/inner radius variables;
the geometry's tip was already correct.

Task 3: A new DPR-2 fixture exposed an atlas glow width mismatch (3.73 mean RGB
error); share the marker painter and compensate for the backing-store ratio.
A 180m curved red-zone fixture failed at 13.68 mean RGB error and passes below
2 with projected-space triangulation. All eight parity fixtures pass in Edge.

Ruling: Keep butt-ended GPU line quads for this pass. Restoring round caps with
per-segment circles would increase track buffer size substantially; an analytic
line shader deserves separate measurement. The remaining difference is confined
to line endpoints, generally around a pixel, and is recorded as incomplete parity.

Ruling: Keep geometric world-object depth rather than reproducing the Canvas
center painter sort. Intersecting/faded props can still blend differently; the
user requested progress towards parity, and replacing depth ordering is a larger
architecture change. No exact-pixel-parity claim is made.

Initial measurement: restored details kept moving RAF CPU around 0.3ms, but
raised world buffers to 19.18 MiB and cold preparation to 61–74ms. Cleanup omits
hidden static box faces and shares an atlas shadow quad rather than 48-point
ellipses per tree. Vehicle faces remain retained for dynamic rotation. The atlas
is now 512x256 RGBA (512 KiB) and route buffers are 12.48 MiB. The same 17
Three/parity regressions pass after this cleanup; final timing follows.

Final verification: 71/71 hardware Edge tests (44.3s), 17/17 focused software
Chromium tests (6.8s), syntax and whitespace checks. Read-only review and a
focused review of the later cleanup found no material findings. The reviewer
deferred physical timing/full-scene appearance to the parent; both were checked
after tests. Arbitrary-route equivalence is not claimed. Final D3D11/RTX2060
benchmark keeps moving RAF CPU around 0.3ms; cold preparation is 43.8–55.3ms.
Final screenshots show stations, grade, biomes, warning/derailment, and mobile
layouts without page/GL errors. Following the Safari controls and train
proportions fixes, the user authorized commit, push, and merge into main.
