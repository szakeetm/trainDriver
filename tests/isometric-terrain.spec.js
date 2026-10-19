const { test, expect } = require('@playwright/test');

test('runs without inset, WebGL, or Three.js and also opens offline', async ({ page }) => {
  const errors = [];
  const resources = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => resources.push(request.url()));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (kind !== '2d') throw new Error('WebGL requested');
      return original.call(this, kind, ...args);
    };
  });
  await page.goto('/?seed=alpine');
  await expect(page.locator('#droneInset')).toHaveCount(0);
  expect(resources.filter(url => /three\.min|renderer3d|drone\.js/.test(url))).toEqual([]);
  expect(await page.evaluate(() => ({ started: state.started, units: getRenderedTrainUnits().length })))
    .toEqual({ started: true, units: 3 });
  await page.goto(require('url').pathToFileURL(require('path').resolve('index.html')).href + '?seed=alpine');
  expect(await page.evaluate(() => state.started && route.seed === 'alpine')).toBe(true);
  expect(errors).toEqual([]);
});

test('seed reproduces complete route, scenery, station visuals, and terrain', async ({ page }) => {
  await page.goto('/?seed=alpine');
  const result = await page.evaluate(() => {
    const snapshot = () => JSON.stringify({ seed: route.seed, segments: route.segments,
      stations: route.stations, signals: route.signals, scenery: route.scenery.map(({ worldPoint, ...item }) => item),
      biomes: route.biomes, elevations: route.elevationNodes, phase: route.terrainPhase });
    const first = snapshot();
    const heights = [[0, 0], [125, -600], [-300, 1000]].map(([x, y]) => getTerrainHeight(x, y));
    startRun();
    return { equal: first === snapshot(), heights,
      again: [[0, 0], [125, -600], [-300, 1000]].map(([x, y]) => getTerrainHeight(x, y)),
      different: JSON.stringify(generateRoute('different').segments) !== JSON.stringify(route.segments) };
  });
  expect(result.equal).toBe(true);
  expect(result.heights).toEqual(result.again);
  expect(result.different).toBe(true);
});

test('isometric axes, vertical lift, and inverse projection agree', async ({ page }) => {
  await page.goto('/?seed=alpine');
  const result = await page.evaluate(() => {
    const camera = { x: 12, y: -38, elevation: 20 };
    const project = point => worldToScreen(point, camera, 2, 800, 300);
    const origin = project(camera);
    const x = project({ ...camera, x: camera.x + 10 });
    const y = project({ ...camera, y: camera.y + 10 });
    const up = project({ ...camera, elevation: 30 });
    const point = { x: 90, y: -120, elevation: 42 };
    const screen = project(point);
    return { origin, x, y, up, inverse: screenToGround(screen.x, screen.y,
      { camera, scale: 2, anchorY: 300 }, 800, point.elevation) };
  });
  expect(result.origin).toEqual({ x: 400, y: 300 });
  expect(result.x.x - 400).toBeCloseTo(400 - result.y.x);
  expect(result.x.y).toBeCloseTo(result.y.y);
  expect(result.up.x).toBe(400);
  expect(result.up.y).toBeLessThan(300);
  expect(result.inverse.x).toBeCloseTo(90);
  expect(result.inverse.y).toBeCloseTo(-120);
});

test('elevation is continuous, grade limited, station zones level, and earthworks support rails', async ({ page }) => {
  await page.goto('/?seed=alpine');
  const result = await page.evaluate(() => {
    let maxGrade = 0, maxJump = 0, maxCorridorError = 0;
    const elevations = [];
    for (let distance = 0; distance < route.totalLength; distance += 10) {
      const point = evaluateRoute(distance);
      elevations.push(point.elevation);
      maxGrade = Math.max(maxGrade, Math.abs(point.grade));
      maxJump = Math.max(maxJump, Math.abs(evaluateRoute(distance + 0.001).elevation - point.elevation));
      maxCorridorError = Math.max(maxCorridorError,
        Math.abs(getTerrainHeight(point.x, point.y) - (point.elevation - 0.35)));
    }
    const level = route.stations.every(station => {
      const metrics = getStationStopMetrics(station);
      return [station.distance - TUNING.terrain.stationFlatLength, station.distance,
        metrics.targetDistance - metrics.tolerance, metrics.targetDistance + metrics.tolerance,
        station.distance + TUNING.terrain.stationFlatLength]
        .every(distance => Math.abs(evaluateRoute(distance).grade) < 1e-8);
    });
    return { maxGrade, maxJump, maxCorridorError, level, range: Math.max(...elevations) - Math.min(...elevations),
      limit: TUNING.terrain.maxGrade };
  });
  expect(result.maxGrade).toBeLessThanOrEqual(result.limit);
  expect(result.maxJump).toBeLessThan(0.001);
  expect(result.maxCorridorError).toBeLessThan(0.01);
  expect(result.level).toBe(true);
  expect(result.range).toBeGreaterThan(10);
});

test('train pitch and derailment heights remain finite at a hill', async ({ page }) => {
  await page.goto('/?seed=alpine');
  const result = await page.evaluate(() => {
    state.distance = (route.stations[1].distance + route.stations[2].distance) * 0.5;
    const units = getRenderedTrainUnits();
    const onRails = units.every(unit => unit.renderElevation === evaluateRoute(unit.centerDistance).elevation
      && Math.abs(Math.tan(unit.renderPitch) - (unit.frontElevation - unit.rearElevation) / unit.length) < 1e-9);
    beginDerailment('test');
    state.derailment.timer = 0.8;
    render();
    const finite = getRenderedTrainUnits().every(unit =>
      [unit.renderX, unit.renderY, unit.renderElevation, unit.frontElevation, unit.rearElevation].every(Number.isFinite));
    return { onRails, finite };
  });
  expect(result).toEqual({ onRails: true, finite: true });
});

test('terrain cache is bounded and replaced on restart, with no render mutations to driving', async ({ page }) => {
  await page.goto('/?seed=alpine');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const result = await page.evaluate(() => {
    const cache = route.terrainHeightCache;
    for (let i = 0; i < TUNING.terrain.cacheLimit + 10; i++) cache.set(`dummy-${i}`, {});
    const before = JSON.stringify(state);
    render();
    const unchanged = JSON.stringify(state) === before;
    const bounded = cache.size <= TUNING.terrain.cacheLimit;
    for (const fraction of [0.1, 0.4, 0.8, 1]) {
      state.distance = route.totalLength * fraction;
      render();
    }
    startRun();
    return { unchanged, bounded, replaced: route.terrainHeightCache !== cache,
      fresh: route.terrainHeightCache.size === 0 };
  });
  expect(result).toEqual({ unchanged: true, bounded: true, replaced: true, fresh: true });
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`renders station approach and resizes at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?seed=alpine');
    await page.evaluate(() => {
      state.distance = getStationStopMetrics(route.stations[1]).targetDistance - 75;
      state.speed = 1;
      updateUi(); updateStationAssist(); render();
    });
    await expect(page.locator('#stationAssist')).toBeVisible();
    const bounds = await page.evaluate(() => {
      const assist = stationAssist.getBoundingClientRect();
      const rect = canvas.getBoundingClientRect();
      const view = getViewMetrics(rect.width, rect.height);
      return { fits: assist.left >= rect.left && assist.right <= rect.right
        && assist.top >= rect.top && assist.bottom <= rect.bottom,
        train: worldToScreen(evaluateRoute(state.distance), view.camera, view.scale, rect.width, view.anchorY),
        width: rect.width, height: rect.height,
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(bounds.fits).toBe(true);
    expect(bounds.overflow).toBe(false);
    expect(bounds.train.x).toBeGreaterThan(0);
    expect(bounds.train.x).toBeLessThan(bounds.width);
    expect(bounds.train.y).toBeGreaterThan(0);
    expect(bounds.train.y).toBeLessThan(bounds.height);
    await page.setViewportSize({ width: viewport.width + 100, height: viewport.height - 100 });
    await page.evaluate(() => render());
    expect(errors).toEqual([]);
  });
}

test('keyboard and pointer holds still drive controls and blur releases them', async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/?seed=alpine');
  await page.keyboard.down('ArrowUp');
  const power = await page.evaluate(() => { updateControls(0.5); return state.requestedControl; });
  expect(power).toBeGreaterThan(0);
  await page.keyboard.up('ArrowUp');
  const button = await page.locator('#brakeButton').boundingBox();
  await page.mouse.move(button.x + button.width * 0.5, button.y + button.height * 0.5);
  await page.mouse.down();
  const brake = await page.evaluate(() => { updateControls(1); return state.requestedControl; });
  expect(brake).toBeLessThan(power);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => ({ ...keys }))).toEqual({ accelerate: false, brake: false });
  await page.mouse.up();
});

test('elevation leaves traction and braking physics unchanged', async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/?seed=alpine');
  const result = await page.evaluate(() => {
    const snapshot = { ...state };
    const simulate = (distance, control) => {
      Object.assign(state, snapshot, { distance, speed: 20, actualControl: control });
      updatePhysics(0.05);
      return { speed: state.speed, acceleration: state.acceleration };
    };
    const hill = route.stations[1].distance * 0.5;
    return [-1, 0, 1].map(control => ({ flat: simulate(0, control), hill: simulate(hill, control) }));
  });
  for (const pair of result) expect(pair.flat).toEqual(pair.hill);
});
