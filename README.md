# Train Driver

A static browser-based train driving game built with plain HTML, CSS, and JavaScript and WebGL.

You drive a 100 m consist across a procedurally generated route with stations, signals, curves, speed limits, biome-driven scenery, and derailment penalties for major mistakes.

[Play it on GitHub Pages](https://szakeetm.github.io/trainDriver/)

![Train Driver screenshot](screens/screen1.png)

## Tech Stack

- Plain `index.html`, `styles.css`, and browser-loaded scripts in `js/`
- Vendored `three.min.js` plus `renderer3d.js` for the optional 3D inset view
- No build step, package manager setup, or backend

## Entry Points

- `index.html`: app shell, HUD, canvas, and script loading order
- `js/core.js`: DOM bindings, globals, and tuning constants
- `js/audio.js`: Web Audio setup and runtime updates
- `js/world.js`: route, biome, signal, and scenery generation
- `js/simulation.js`: controls, physics, stations, and failure handling
- `js/rendering.js`: 2D rendering and HUD overlays
- `js/main.js`: game bootstrap and frame loop
- `renderer3d.js`: Three.js-based 3D inset renderer

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

Gameplay tuning and shared globals start in [`js/core.js`](js/core.js).

## Testing

Playwright is configured for automated route-win testing.

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

- `npm run test:win`: fast headless win test
- `npm run test:win:watch`: headed visible autoplay demo
- `npm run test:win:headed`: headed watch mode using the reusable win spec

The visible modes drive the full route in a watchable browser window. The fast mode is intended for quick verification.
