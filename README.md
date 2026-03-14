# Train Driver

A browser-based train driving game built with plain HTML, CSS, and JavaScript.

You drive a 100 m consist across a procedurally generated route with stations, signals, curves, speed limits, biome-driven scenery, and derailment penalties for major mistakes.

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

Open `index.html` in a browser.

For a smoother local workflow, you can also serve the folder with any static file server.

## Files

- `index.html`: game shell and HUD markup
- `styles.css`: layout and visual styling
- `game.js`: route generation, rendering, signals, scenery, and game logic
