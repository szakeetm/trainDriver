const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/?seed=alpine');
});

test('only Up and Down change the keyboard control request', async ({ page }) => {
  for (const key of ['w', 'W', 's', 'S']) {
    await page.keyboard.down(key);
    expect(await page.evaluate(() => { updateControls(0.5); return state.requestedControl; })).toBe(0);
    await page.keyboard.up(key);
  }
  await page.keyboard.down('ArrowUp');
  expect(await page.evaluate(() => { updateControls(0.5); return state.requestedControl; })).toBeGreaterThan(0);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowDown');
  expect(await page.evaluate(() => { updateControls(1); return state.requestedControl; })).toBeLessThan(0);
  await page.keyboard.up('ArrowDown');
});

test('releasing a pointer preserves a held keyboard control', async ({ page }) => {
  await page.keyboard.down('ArrowUp');
  await page.locator('#accelerateButton').dispatchEvent('pointerdown', { pointerId: 1 });
  await page.locator('#accelerateButton').dispatchEvent('pointerup', { pointerId: 1 });
  expect(await page.evaluate(() => { updateControls(0.5); return state.requestedControl; })).toBeGreaterThan(0);
  await page.keyboard.up('ArrowUp');
  expect(await page.evaluate(() => keys.accelerate)).toBe(false);
});

test('releasing the keyboard preserves a held pointer control', async ({ page }) => {
  await page.locator('#brakeButton').dispatchEvent('pointerdown', { pointerId: 1 });
  await page.keyboard.down('ArrowDown');
  await page.keyboard.up('ArrowDown');
  expect(await page.evaluate(() => { updateControls(0.5); return state.requestedControl; })).toBeLessThan(0);
  await page.locator('#brakeButton').dispatchEvent('pointercancel', { pointerId: 1 });
  expect(await page.evaluate(() => keys.brake)).toBe(false);
});

test('two pointers retain the action until both release', async ({ page }) => {
  const button = page.locator('#accelerateButton');
  await button.dispatchEvent('pointerdown', { pointerId: 1 });
  await button.dispatchEvent('pointerdown', { pointerId: 2 });
  await button.dispatchEvent('pointerup', { pointerId: 1 });
  expect(await page.evaluate(() => keys.accelerate)).toBe(true);
  await button.dispatchEvent('pointerup', { pointerId: 2 });
  expect(await page.evaluate(() => keys.accelerate)).toBe(false);
});

test('restart and blur release every held input source', async ({ page }) => {
  await page.keyboard.down('ArrowUp');
  await page.locator('#brakeButton').dispatchEvent('pointerdown', { pointerId: 1 });
  expect(await page.evaluate(() => { startRun(); return { ...keys }; })).toEqual({ accelerate: false, brake: false });
  await page.keyboard.up('ArrowUp');
  await page.locator('#accelerateButton').dispatchEvent('pointerdown', { pointerId: 2 });
  expect(await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    return { ...keys };
  })).toEqual({ accelerate: false, brake: false });
});

test('a stationary locomotive can wait exactly on the red stop line', async ({ page }) => {
  const result = await page.evaluate(() => {
    const signal = { distance: 100, kind: 'red', aspect: 'red', passed: false,
      waitTimer: 0, clearAfter: 0.1, side: 1 };
    route.signals = [signal];
    state.distance = 100;
    update(0.05);
    const waiting = !state.derailment && signal.waitTimer === 0.05;
    update(0.05);
    return { waiting, aspect: signal.aspect, derailed: !!state.derailment };
  });
  expect(result).toEqual({ waiting: true, aspect: 'green', derailed: false });
});

test('crossing a red line fails even on the tick its wait would complete', async ({ page }) => {
  const result = await page.evaluate(() => {
    route.signals = [{ distance: 100, kind: 'red', aspect: 'red', passed: false,
      waitTimer: 0.09, clearAfter: 0.1, side: 1 }];
    state.distance = 100.001;
    update(0.05);
    return { derailed: !!state.derailment, aspect: route.signals[0].aspect };
  });
  expect(result).toEqual({ derailed: true, aspect: 'red' });
});

test('station acceptance uses the configured tolerance', async ({ page }) => {
  const result = await page.evaluate(() => {
    DEFAULT_TUNING.stations.stopWindow = 10;
    applyTuning();
    startRun();
    const target = route.stations[1].distance + TRAIN_TOTAL_LENGTH * 0.5;
    state.distance = target - 11;
    updateStations();
    const outside = state.stationIndex;
    state.distance = target - 10;
    updateStations();
    return { outside, inside: state.stationIndex, error: state.lastStopError };
  });
  expect(result).toEqual({ outside: 1, inside: 2, error: 10 });
});

test('overrunning the acceptance window targets the next station and penalizes once', async ({ page }) => {
  const result = await page.evaluate(() => {
    state.distance = route.stations[1].distance + TRAIN_TOTAL_LENGTH * 0.5 + TUNING.stations.stopWindow + 0.01;
    state.speed = 1;
    updateStations();
    updateUi();
    const first = { index: state.stationIndex, penalty: state.penalties,
      missed: state.stationResults[0]?.missed, target: stationName.textContent,
      expectedTarget: route.stations[2].name };
    updateStations();
    return { first, penaltyAgain: state.penalties, results: state.stationResults.length };
  });
  expect(result.first.index).toBe(2);
  expect(result.first.penalty).toBe(60);
  expect(result.first.missed).toBe(true);
  expect(result.first.target).toBe(result.first.expectedTarget);
  expect(result.penaltyAgain).toBe(60);
  expect(result.results).toBe(1);
});

test('all overrun stations are accounted for in the same update', async ({ page }) => {
  const result = await page.evaluate(() => {
    state.distance = route.stations[2].distance + TRAIN_TOTAL_LENGTH * 0.5 + TUNING.stations.stopWindow + 1;
    state.speed = 1;
    updateStations();
    return { index: state.stationIndex, penalty: state.penalties,
      missed: state.stationResults.map(result => result.missed) };
  });
  expect(result).toEqual({ index: 3, penalty: 120, missed: [true, true] });
});

test('overrunning the last station ends the run with a penalty immediately', async ({ page }) => {
  const result = await page.evaluate(() => {
    state.stationIndex = route.stations.length - 1;
    state.distance = route.stations.at(-1).distance + TRAIN_TOTAL_LENGTH * 0.5 + TUNING.stations.stopWindow + 1;
    state.speed = 1;
    updateStations();
    return { finished: state.finished, penalty: state.penalties, title: finishTitle.textContent };
  });
  expect(result).toEqual({ finished: true, penalty: 60, title: 'Run finished with delays' });
});

test('failure replaces a red-wait HUD message and retains actual route progress', async ({ page }) => {
  const result = await page.evaluate(() => {
    route.signals = [{ distance: 100, kind: 'red', aspect: 'red', passed: false,
      waitTimer: 0, clearAfter: 3, side: 1 }];
    state.distance = 99;
    processSignals(0.05);
    state.distance = 100.001;
    for (let i = 0; i < 40; i++) update(0.05);
    updateUi();
    return { failed: state.failed, status: statusText.textContent,
      progress: getGameProgressPercent(), finalDistance: route.stations.at(-1).distance,
      actualDistance: state.distance };
  });
  expect(result.failed).toBe(true);
  expect(result.status).toBe('Run failed');
  expect(result.progress).toBeCloseTo(result.actualDistance / result.finalDistance * 100, 8);
  expect(result.progress).toBeLessThan(1);
});

test('finished audio fades out despite frozen nonzero speed and control', async ({ page }) => {
  await page.locator('#accelerateButton').click();
  await expect.poll(() => page.evaluate(() => gameAudio?.context.state)).toBe('running');
  await page.evaluate(() => {
    state.speed = 0.2;
    state.actualControl = 0.5;
    updateGameAudio(0.05);
  });
  await expect.poll(() => page.evaluate(() => gameAudio.master.gain.value)).toBeGreaterThan(0.1);
  await page.evaluate(() => {
    state.finished = true;
    finishRun();
    update(0.05);
  });
  await expect.poll(() => page.evaluate(() => gameAudio.master.gain.value)).toBeLessThan(0.01);
});

test('exact route boundaries use the next segment regardless of lookup history', async ({ page }) => {
  const result = await page.evaluate(() => {
    const index = route.segments.findIndex((segment, i) => i > 0 && segment.speedLimit !== route.segments[i - 1].speedLimit);
    const next = route.segments[index];
    evaluateRoute(next.start - 1);
    const fromBefore = evaluateRoute(next.start).segment === next;
    evaluateRoute(next.start + 1);
    const fromAfter = evaluateRoute(next.start).segment === next;
    const final = evaluateRoute(route.totalLength).segment === route.segments.at(-1);
    return { fromBefore, fromAfter, final };
  });
  expect(result).toEqual({ fromBefore: true, fromAfter: true, final: true });
});
