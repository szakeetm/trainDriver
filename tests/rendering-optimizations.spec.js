const { test, expect } = require('@playwright/test');
const terrainReference = require('./terrain-reference');

test('generates one route at startup and one per restart', async ({ page }) => {
  await page.route('**/js/main.js*', async (request) => {
    const response = await request.fetch();
    await request.fulfill({
      response,
      body: `const originalGenerateRoute = generateRoute;
        window.routeGenerations = 0;
        generateRoute = function (...args) {
          window.routeGenerations++;
          return originalGenerateRoute(...args);
        };
        ${await response.text()}`,
    });
  });
  await page.goto('/index.html?seed=alpine');
  expect(await page.evaluate(() => ({ generations: window.routeGenerations, started: state.started })))
    .toEqual({ generations: 1, started: true });
  await page.evaluate(() => startRun());
  expect(await page.evaluate(() => window.routeGenerations)).toBe(2);
});

test('terrain projects each shared vertex once and retains bounded route-owned lighting', async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/?seed=alpine&renderer=canvas');
  await page.addScriptTag({ content: `window.drawBackgroundReference = ${terrainReference.toString()};` });
  const result = await page.evaluate(() => {
    const project = projectPoint;
    let calls = 0;
    projectPoint = (...args) => { calls++; return project(...args); };
    const frame = createRenderFrameContext(canvas.clientWidth, canvas.clientHeight);
    drawBackgroundReference(frame);
    const referenceCalls = calls;
    calls = 0;
    drawBackground(frame);
    const optimizedCalls = calls;
    projectPoint = project;
    const cache = route.terrainCellCache;
    const owned = cache instanceof Map;
    if (owned) {
      for (let i = 0; i < TUNING.terrain.cacheLimit + 10; i++) cache.set(`dummy-${i}`, {});
    }
    drawBackground(frame);
    const bounded = owned && cache.size <= TUNING.terrain.cacheLimit;
    startRun();
    return { referenceCalls, optimizedCalls, owned, bounded,
      replaced: owned && route.terrainCellCache !== cache && route.terrainCellCache.size === 0 };
  });
  expect(result.optimizedCalls).toBeLessThan(result.referenceCalls * 0.5);
  expect(result.owned).toBe(true);
  expect(result.bounded).toBe(true);
  expect(result.replaced).toBe(true);
});

test('optimized terrain matches the reference through hills, palette changes, eviction, and resize', async ({ page }) => {
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    // Keep both sides of the pixel oracle on the same backend. Repeated reads
    // otherwise switch hardware Canvas to software partway through the test.
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, options) {
      return original.call(this, kind, kind === '2d' ? { ...options, willReadFrequently: true } : options);
    };
  });
  await page.goto('/?seed=alpine&renderer=canvas');
  await page.addScriptTag({ content: `window.drawBackgroundReference = ${terrainReference.toString()};` });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(viewport);
    const result = await page.evaluate(() => {
      resizeCanvas();
      const differences = [];
      const scenarios = [
        { distance: 0, speed: 0 },
        { distance: route.stations[1].distance, speed: 1 },
        { distance: route.stations[1].distance * 0.5, speed: 24 },
        { distance: route.totalLength * 0.8, speed: 72 },
        ...route.biomes.slice(0, -1).flatMap(biome => [-100, 0, 100].map(offset =>
          ({ distance: biome.endDistance + offset, speed: 24 }))),
      ];
      // Make eviction happen during normal drawing, rather than merely checking
      // the cache size after a single small viewport.
      TUNING.terrain.cacheLimit = 150;
      for (const scenario of scenarios) {
        Object.assign(state, scenario);
        const frame = createRenderFrameContext(canvas.clientWidth, canvas.clientHeight);
        drawBackgroundReference(frame);
        const reference = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        drawBackground(frame);
        const actual = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let changed = 0;
        for (let i = 0; i < reference.length; i++) if (actual[i] !== reference[i]) changed++;
        if (changed) differences.push({ ...scenario, changed });
      }
      return differences;
    });
    expect(result).toEqual([]);
  }
});

test('exhaust defers pose sampling until a puff is due and uses locomotive elevation', async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/?seed=alpine&renderer=canvas');
  const result = await page.evaluate(() => {
    const evaluate = evaluateRoute;
    let samples = 0;
    evaluateRoute = (...args) => { samples++; return evaluate(...args); };
    state.actualControl = 1;
    state.acceleration = 1;
    updateDieselExhaust(0.01);
    const earlySamples = samples;
    updateDieselExhaust(0.2);
    evaluateRoute = evaluate;
    return { earlySamples, spawnSamples: samples - earlySamples,
      elevations: state.exhaustPuffs.map(puff => puff.elevation),
      finite: state.exhaustPuffs.every(puff => Number.isFinite(puff.x) && Number.isFinite(puff.y)) };
  });
  expect(result.earlySamples).toBe(0);
  expect(result.spawnSamples).toBe(1);
  expect(result.elevations).toEqual([60]);
  expect(result.finite).toBe(true);
});

test('stationary terrain reuses its bitmap without retaining an old route or viewport', async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/?seed=alpine&renderer=canvas');
  const result = await page.evaluate(() => {
    const frame = createRenderFrameContext(canvas.clientWidth, canvas.clientHeight);
    drawBackground(frame);
    const before = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const project = projectPoint;
    let projections = 0;
    projectPoint = (...args) => { projections++; return project(...args); };
    ctx.fillStyle = 'magenta';
    ctx.fillRect(0, 0, 50, 50);
    drawBackground(frame);
    projectPoint = project;
    const after = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const same = before.every((value, index) => value === after[index]);
    const bitmap = route.terrainBackdrop?.canvas;
    const bounded = !!bitmap && bitmap.width * bitmap.height <= 4 * 1024 * 1024;
    startRun();
    return { projections, same, bounded, released: route.terrainBackdrop == null };
  });
  expect(result).toEqual({ projections: 0, same: true, bounded: true, released: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => {
    resizeCanvas();
    render();
    return route.terrainBackdrop.canvas.width === canvas.width && route.terrainBackdrop.canvas.height === canvas.height;
  })).toBe(true);
});
