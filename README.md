# Train Driver

A browser-based train driving game built with plain HTML, CSS, and JavaScript.

You drive a 100 m consist across a procedurally generated route with stations, signals, curves, speed limits, biome-driven scenery, and derailment penalties for major mistakes.

[Play it on GitHub Pages](https://szakeetm.github.io/trainDriver/)

![Train Driver screenshot](screens/screen1.png)

## Features

- Procedural route generation with varied curve radii and station spacing
- Signal system with green, yellow, and red aspects
- Station stop assist and route-ahead predictor
- Dynamic terrain and scenery themes that change along the route
- Overspeed penalties and derailment on severe rule violations

## Controls

- `W` / `ArrowUp`: increase power
- `S` / `ArrowDown`: increase braking
- On-screen buttons also support pointer/touch input

## Run Locally

GitHub Pages build: https://szakeetm.github.io/trainDriver/

Open `index.html` in a browser.

Gameplay tuning can be overridden in `tuning.json`, which is loaded on startup.

For a smoother local workflow, you can also serve the folder with any static file server. That is the most reliable way to ensure `tuning.json` is read by the browser; when opening the page directly from disk, the game falls back to the built-in defaults if the JSON file cannot be fetched.

## Performance Profiling

The game includes an opt-in runtime profiler that prints per-second frame cost summaries in the browser console.

- Enable it by adding `?perf` to the page URL.
- Example local URL: `http://localhost:8080/index.html?perf`
- Look for `[perf]` log lines with average per-frame timings for update, render, HUD, scenery, track, and call counts for route and terrain sampling.

This mode is intended for diagnosis only and is disabled by default.

## Files

- `index.html`: game shell and HUD markup
- `styles.css`: layout and visual styling
- `game.js`: route generation, rendering, signals, scenery, and game logic
- `tuning.json`: optional gameplay overrides loaded on startup
