# Train Driver

A static browser-based train driving game built with plain HTML, CSS, Canvas 2D, and JavaScript.

You drive a 100 m consist across a procedurally generated route with stations, signals, curves, speed limits, isometric hills, elevated track, biome-driven scenery, and derailment penalties for major mistakes.

[Play it on GitHub Pages](https://szakeetm.github.io/trainDriver/)

![Train Driver screenshot](screens/isometric.png)

## Tech Stack

- Plain `index.html`, `styles.css`, and browser-loaded scripts in `js/`
- Isometric Canvas terrain and train geometry; no WebGL required
- No build step, package manager setup, or backend

## Entry Points

- `index.html`: app shell, HUD, canvas, and script loading order
- `js/core.js`: DOM bindings, globals, and tuning constants
- `js/audio.js`: Web Audio setup and runtime updates
- `js/world.js`: seeded routes, track elevations, terrain, biomes, signals, and scenery
- `js/simulation.js`: controls, physics, stations, and failure handling
- `js/rendering.js`: heightfield shading, depth-sorted scenery/trains, and HUD overlays
- `js/main.js`: game bootstrap and frame loop
- `js/view.js`: isometric projection and camera

## Controls

- `W` / `ArrowUp`: increase power
- `S` / `ArrowDown`: increase braking
- On-screen buttons also support pointer/touch input

## Run Locally

Open `index.html` directly in a browser.

There is no install step and no build command.

If you want to run the Playwright autopilot tests, serve the repo over HTTP instead of opening the file directly:

```powershell
python -m http.server 4173
```

Append `?seed=alpine` (or any string) to replay the same landscape and route,
including on restarts. Without a seed, each run gets a fresh world. Train colors
and transient exhaust remain randomized.

Elevation and grade are shown on the map. Hills do not change acceleration or
braking in this version. Bridges, tunnels, and grade-separated crossings are
outside this version's scope.

Gameplay tuning and shared globals start in [`js/core.js`](js/core.js).

Agent architecture and workflow context is in [`AGENTS.md`](AGENTS.md).
See [`docs/code-review.md`](docs/code-review.md) for optimization findings and validation.

## Testing

Playwright covers route wins, isometric projection, elevation, terrain lifecycle,
offline loading, and desktop/mobile layouts.

Install the test dependencies:

```powershell
npm install
```

If Playwright asks for browser binaries on a fresh machine, install them with:

```powershell
npx playwright install
```

Start the local static server in one terminal:

```powershell
python -m http.server 4173
```

Then run one of these in a second terminal:

- `npx playwright test tests/isometric-terrain.spec.js tests/rendering-optimizations.spec.js`: focused rendering regressions
- `npm run test:win`: fast headless win test
- `npm run test:win:watch`: headed visible autoplay demo
- `npm run test:win:headed`: headed watch mode using the reusable win spec

The visible modes drive the full route in a watchable browser window. The fast mode is intended for quick verification.
