const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3,
  isMobile: true, hasTouch: true });

test('high-density phone keeps a painted scene and working controls through rotation and restart', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=alpine');
  await expect.poll(() => page.evaluate(() => state.elapsed)).toBeGreaterThan(0);
  await page.locator('#accelerateButton').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch' });
  await expect.poll(() => page.evaluate(() => state.requestedControl)).toBeGreaterThan(0);
  await page.locator('#accelerateButton').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch' });

  for (const viewport of [{ width: 932, height: 430 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    const result = await page.evaluate(() => {
      resizeCanvas();
      const before = canvas.getBoundingClientRect().toJSON();
      const marker = 'rgb(255, 0, 255)';
      ctx.fillStyle = marker;
      ctx.fillRect(0, 0, 10, 10);
      resizeCanvas();
      const preserved = Array.from(ctx.getImageData(0, 0, 1, 1).data);
      startRun();
      const after = canvas.getBoundingClientRect().toJSON();
      render();
      const colors = new Set();
      for (let x = 20; x < canvas.width; x += 50) {
        for (let y = 20; y < canvas.height; y += 50) {
          const rgba = ctx.getImageData(x, y, 1, 1).data;
          if (rgba[3] === 255 && rgba[0] + rgba[1] + rgba[2] > 50) colors.add(rgba.join(','));
        }
      }
      return { before, after, preserved, colors: colors.size, pixels: canvas.width * canvas.height,
        cacheSize: route.terrainHeightCache.size, cacheLimit: TUNING.terrain.cacheLimit };
    });
    expect(result.after).toEqual(result.before);
    expect(result.preserved).toEqual([255, 0, 255, 255]);
    expect(result.colors).toBeGreaterThan(10);
    expect(result.pixels).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(result.cacheSize).toBeLessThanOrEqual(result.cacheLimit);
    await expect.poll(() => page.evaluate(() => state.elapsed)).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
  await expect(page.locator('#gameError')).toHaveCount(0);
});

test('release URLs avoid cached scripts from before the terrain migration', async ({ page }) => {
  const staleRequests = [];
  await page.route('**/js/*.js', async request => {
    staleRequests.push(request.request().url());
    await request.fulfill({ body: 'throw new Error("Stale pre-terrain script");', contentType: 'text/javascript' });
  });
  await page.goto('/?seed=alpine');
  await expect.poll(() => page.evaluate(() => state.elapsed)).toBeGreaterThan(0);
  expect(staleRequests).toEqual([]);
  await expect(page.locator('#gameError')).toHaveCount(0);
});

test('a failed game script shows its filename instead of leaving a silent blank scene', async ({ page }) => {
  await page.route('**/js/view.js*', request => request.abort());
  await page.goto('/?seed=alpine');
  await expect(page.getByRole('alert')).toContainText('Could not load view.js');
});

test('a startup exception is readable on the phone', async ({ page }) => {
  await page.route('**/js/main.js*', request => request.fulfill({
    body: 'throw new Error("Startup test failure");', contentType: 'text/javascript',
  }));
  await page.goto('/?seed=alpine');
  await expect(page.getByRole('alert')).toContainText('Startup test failure');
  await expect(page.getByRole('alert')).toContainText('main.js:1');
});

test('landscape phones show driving controls beside the scene without page scrolling', async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/?seed=alpine');
  for (const viewport of [{ width: 932, height: 430 }, { width: 844, height: 390 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(viewport);
    const bounds = await page.evaluate(() => {
      const visible = element => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
      };
      return { brake: visible(brakeButton), power: visible(accelerateButton),
        canvas: visible(canvas), scrolling: document.documentElement.scrollHeight > innerHeight };
    });
    expect(bounds).toEqual({ brake: true, power: true, canvas: true, scrolling: false });
    const button = await page.locator('#accelerateButton').boundingBox();
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await page.mouse.down();
    expect(await page.evaluate(() => { updateControls(0.1); return keys.accelerate; })).toBe(true);
    await page.mouse.up();
    expect(await page.evaluate(() => keys.accelerate)).toBe(false);
  }
});

test('landscape stop assist leaves the train visible during a station approach', async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/?seed=alpine');
  for (const viewport of [{ width: 932, height: 430 }, { width: 844, height: 390 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(viewport);
    const visible = await page.evaluate(() => {
      state.distance = getStationStopMetrics(route.stations[1]).targetDistance - 75;
      state.speed = 1;
      updateStationAssist();
      const assist = stationAssist.getBoundingClientRect();
      const rect = canvas.getBoundingClientRect();
      const frame = createRenderFrameContext(canvas.clientWidth, canvas.clientHeight);
      return frame.renderedUnits.every(unit => {
        const point = projectPoint({ x: unit.renderX, y: unit.renderY, elevation: unit.renderElevation }, frame);
        return point.y + rect.top + 12 < assist.top;
      });
    });
    expect(visible).toBe(true);
  }
});
