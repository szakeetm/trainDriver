const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.presentationRaf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = () => 0;
  });
});

test('stopped Three world persists across actual presentation cycles', async ({ page }) => {
  await page.goto('/?renderer=three&seed=alpine');
  await page.evaluate(() => render());
  const first = await page.locator('#gameCanvas').screenshot();
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) { await new Promise(resolve => presentationRaf(resolve)); render(); }
  });
  const later = await page.locator('#gameCanvas').screenshot();
  expect(later.equals(first)).toBe(true);
  expect(await page.evaluate(() => getThreeWorldStatus().drawCalls)).toBe(0);
});

test('Three world and its vendored library open directly from disk offline', async ({ page, context }) => {
  await context.setOffline(true);
  const url = require('url').pathToFileURL(require('path').resolve('index.html')).href;
  await page.goto(`${url}?renderer=three&seed=alpine`);
  expect(await page.evaluate(() => { render(); return getTerrainRendererStatus().active; })).toBe('three');
  await expect(page.locator('#gameError')).toHaveCount(0);
});

test('Three.js world renders all vehicles and retained route geometry over the same terrain', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?renderer=three&seed=alpine');
  const result = await page.evaluate(() => {
    render();
    state.distance = route.stations[1].distance * 0.5;
    const driving = JSON.stringify(state);
    render();
    return { status: getThreeWorldStatus(), active: getTerrainRendererStatus().active,
      unchanged: driving === JSON.stringify(state), revision: THREE.REVISION,
      error: webglTerrain.gl.getError() };
  });
  expect(result.active).toBe('three');
  expect(result.status.vehicles).toBe(3);
  expect(result.status.staticVertices).toBeGreaterThan(1000);
  expect(result.status.drawCalls).toBeGreaterThan(0);
  expect(result.unchanged).toBe(true);
  expect(result.error).toBe(0);
  expect(errors).toEqual([]);
});

test('renderer switching preserves the raw terrain and Three world through restart and derailment', async ({ page }) => {
  await page.goto('/?renderer=three&seed=alpine');
  const result = await page.evaluate(() => {
    const counts = [];
    for (let i = 0; i < 4; i++) {
      startRun(); render();
      counts.push(getThreeWorldStatus().geometries);
      setTerrainRendererMode('webgl2'); render();
      setTerrainRendererMode('three'); render();
    }
    beginDerailment('test');
    state.derailment.timer = 0.8;
    render();
    const finite = threeWorld.trainMeshes.every(mesh => mesh.matrix.elements.every(Number.isFinite));
    return { counts, finite, error: webglTerrain.gl.getError() };
  });
  expect(new Set(result.counts).size).toBe(1);
  expect(result.finite).toBe(true);
  expect(result.error).toBe(0);
});

test('failed library loading falls back and the normal WebGL mode never downloads Three.js', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/?renderer=webgl2&seed=alpine');
  expect(requests.filter(url => /three\.min\.js/.test(url))).toEqual([]);
  await page.route('**/three.min.js*', request => request.abort());
  await page.goto('/?renderer=three&seed=alpine');
  expect(await page.evaluate(() => { render(); return state.started && getTerrainRendererStatus().active !== 'three'; })).toBe(true);
  await expect(page.locator('#gameError')).toHaveCount(0);
});

test('Three world recovers from shared-context loss and survives rotation', async ({ page }) => {
  await page.goto('/?renderer=three&seed=alpine');
  await page.evaluate(() => {
    render();
    window.loss = webglTerrain.gl.getExtension('WEBGL_lose_context');
    window.loss.loseContext();
  });
  await expect.poll(() => page.evaluate(() => getTerrainRendererStatus().active)).toBe('canvas');
  await page.evaluate(() => render());
  await page.evaluate(() => window.loss.restoreContext());
  await expect.poll(() => page.evaluate(() => getTerrainRendererStatus().active)).toBe('three');
  for (const viewport of [{ width: 390, height: 844 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => {
      resizeCanvas(); render();
      return { error: webglTerrain.gl.getError(), active: getTerrainRendererStatus().active };
    })).toEqual({ error: 0, active: 'three' });
  }
});

test('a stationary view clears the last exhaust puff before caching the world', async ({ page }) => {
  await page.goto('/?renderer=three&seed=alpine');
  const result = await page.evaluate(() => {
    state.speed = 0;
    state.exhaustPuffs = [{ x: 0, y: 0, elevation: 60, age: 0.2, life: 0.3,
      radius: 2, growth: 3, opacity: 0.4 }];
    render();
    updateDieselExhaust(0.2);
    render();
    const cleared = getThreeWorldStatus().drawCalls > 0;
    render();
    return { cleared, thenCached: getThreeWorldStatus().drawCalls === 0 };
  });
  expect(result).toEqual({ cleared: true, thenCached: true });
});

test('asynchronous initialization failures still show the startup error banner', async ({ page }) => {
  await page.route('**/js/main.js*', async request => {
    const response = await request.fetch();
    await request.fulfill({ response,
      body: `generateRoute = () => { throw new Error('Route startup failure'); };\n${await response.text()}` });
  });
  for (const mode of ['webgl2', 'three']) {
    await page.goto(`/?renderer=${mode}&seed=alpine`);
    await expect(page.locator('#gameError')).toContainText('Route startup failure');
  }
});

test('Three world wins a graded route using the normal simulation', async ({ page }) => {
  const { runAutopilot } = require('./win-autopilot');
  await page.goto('/?renderer=three&seed=alpine');
  const result = await runAutopilot(page);
  expect(result.success, JSON.stringify(result)).toBe(true);
  expect(result.penalties).toBe(0);
});
