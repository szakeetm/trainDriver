# Playwright Findings

## Current harness (2026-10-30)

The driver now changes only the requested control and advances the production
`update(dt)` loop. It uses a conservative braking envelope and grade/drag
compensation; it never overwrites train position, speed, actual control, station
results, or signal state. `autopilot-integrity.spec.js` monitors state writes
and confirms every physics step belongs to a production update.

Win specs now run fixed routes without retries. The graded seeds are `alpine`,
`ridge`, and `valley`; fast and watch signal specs use `signal-run`. The older
assisted driver below could clamp speed, snap station positions, and bypass
physics while waiting at reds even with time warping disabled. Its passes did
not establish unassisted completion.

The red stop line is now inclusive for a stationary stop. Crossing it is a
failure even if the wait would finish on that tick, preserving update order.
Station overruns immediately advance to the next target and add 60 seconds
per missed station. The configured acceptance tolerance is now honored.

See [app-repairs.md](app-repairs.md) for current validation and terrain results.

## Historical findings (assisted harness)

## Scope

- Goal: drive the full game route automatically and finish with a clean win.
- Test surface: live browser page served from a local static server.

## Findings

- The game can be driven to a full `Run complete` state in-browser with automated control over `state.requestedControl`.
- On accelerated harness runs, red signals are the fragile path because `processSignalPasses()` runs before `processSignals(dt)` in the normal update order. If the train reaches the signal head in the same step that it should have settled into the red stop zone, the run fails before the wait-at-red logic can take over.
- Curve limits are strict enough that a naive cruise controller loses quickly. The reusable test needs to pre-brake for the next constrained segment rather than react only to the current HUD limit.
- Station scoring is also strict: the stop must land within the station tolerance while speed is below the stop threshold, so the reusable test deliberately transitions to a crawl and aligns the train front to the station target.

## Reusable Test

- File: `tests/win-with-signals.spec.js`
- Visible demo: `tests/watch-win-with-signals.spec.js`
- Config: `playwright.config.js`
- Behavior: reloads the app, retries multiple generated routes, and wins with signals still enabled.
- Run command: `npm run test:win`
- Watch command: `npm run test:win:watch`
- Single-spec watch mode on the reusable test: `npm run test:win:headed`
- The watch commands use a longer Playwright timeout budget because visible stepped playback can take longer than the fast CI-style route.

## Notes

- The reusable test uses accelerated in-page stepping for determinism and speed, but it does not disable signals.
- The visible demo now shows the full braking and crawl into stations and red-signal stops without teleporting into the final stop state.
- To keep that watch mode short enough to use, it uses frequent light render steps instead of larger batched jumps, aiming for a wall-clock run around 50 seconds rather than a multi-minute playback.
- The controller explicitly handles red-signal waiting, yellow-signal pass limits, curve braking, and station-stop alignment.
- The red-signal path parks the train inside the valid stop zone and advances the in-game wait timer until the signal clears, rather than disabling signals or marking them passed.
