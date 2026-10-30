const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.presentFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = () => 0;
  });
});

test('stopped terrain stays visible across real presentation cycles without redrawing', async ({ page }) => {
  await page.goto('/?seed=alpine&renderer=webgl2');
  await page.evaluate(() => render());
  const first = await page.locator('#gameCanvas').screenshot();
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => presentFrame(resolve));
      render();
    }
  });
  const afterPresentation = await page.locator('#gameCanvas').screenshot();
  expect(afterPresentation.equals(first)).toBe(true);
  expect(await page.evaluate(() => getTerrainRendererStatus().drawCalls)).toBe(0);
});

test('WebGL 2 paints the terrain beneath the transparent Canvas world', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?seed=alpine');
  const result = await page.evaluate(() => {
    render();
    const status = getTerrainRendererStatus();
    const gl = webglTerrain.gl;
    // Draw and read in the same task: default WebGL buffers need not survive
    // presentation when preserveDrawingBuffer is false.
    drawTerrainBackground(createRenderFrameContext(canvas.clientWidth, canvas.clientHeight));
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return { status, pixel: [...pixel], overlayAlpha: ctx.getImageData(0, 0, 1, 1).data[3], error: gl.getError() };
  });
  expect(result.status.active).toBe('webgl2');
  expect(result.status.chunkCount).toBeGreaterThan(0);
  expect(result.pixel[3]).toBe(255);
  expect(result.pixel.slice(0, 3).reduce((a, b) => a + b)).toBeGreaterThan(50);
  expect(result.overlayAlpha).toBe(0);
  expect(result.error).toBe(0);
  expect(errors).toEqual([]);
});

test('explicit Canvas and unavailable WebGL preserve offline gameplay', async ({ page }) => {
  await page.goto('/?seed=alpine&renderer=canvas');
  expect(await page.evaluate(() => { render(); return getTerrainRendererStatus().active; })).toBe('canvas');
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind === 'webgl2' ? null : original.call(this, kind, ...args);
    };
  });
  const url = require('url').pathToFileURL(require('path').resolve('index.html')).href;
  await page.goto(`${url}?seed=alpine&renderer=webgl2`);
  expect(await page.evaluate(() => {
    render();
    return { active: getTerrainRendererStatus().active, started: state.started,
      painted: ctx.getImageData(0, 0, 1, 1).data[3] === 255 };
  })).toEqual({ active: 'canvas', started: true, painted: true });
});

test('GPU chunks remain bounded and restart deletes the previous route buffers', async ({ page }) => {
  await page.goto('/?seed=alpine&renderer=webgl2');
  const result = await page.evaluate(() => {
    render();
    const oldBuffers = [...webglTerrain.chunks.values()].map(chunk => chunk.buffer);
    startRun();
    const released = oldBuffers.every(buffer => !webglTerrain.gl.isBuffer(buffer));
    const fresh = getTerrainRendererStatus().chunkCount === 0;
    const driving = JSON.stringify(state);
    render();
    const unchanged = JSON.stringify(state) === driving;
    let bounded = true;
    for (let i = 0; i <= 20; i++) {
      state.distance = route.totalLength * i / 20;
      state.speed = 72;
      render();
      const status = getTerrainRendererStatus();
      bounded &&= status.chunkCount <= status.chunkLimit;
    }
    return { released, fresh, unchanged, bounded, error: webglTerrain.gl.getError() };
  });
  expect(result).toEqual({ released: true, fresh: true, unchanged: true, bounded: true, error: 0 });
});

test('context loss falls back to Canvas and restoration rebuilds GPU terrain', async ({ page }) => {
  await page.goto('/?seed=alpine&renderer=webgl2');
  await page.evaluate(() => {
    render();
    window.contextLossExtension = webglTerrain.gl.getExtension('WEBGL_lose_context');
    window.contextLossExtension.loseContext();
  });
  await expect.poll(() => page.evaluate(() => getTerrainRendererStatus().active)).toBe('canvas');
  expect(await page.evaluate(() => { render(); return ctx.getImageData(0, 0, 1, 1).data[3]; })).toBe(255);
  await page.evaluate(() => window.contextLossExtension.restoreContext());
  await expect.poll(() => page.evaluate(() => getTerrainRendererStatus().active)).toBe('webgl2');
  expect(await page.evaluate(() => { render(); return webglTerrain.gl.getError(); })).toBe(0);
});

test('GPU terrain preserves projected coverage and palette through grades and resize', async ({ page }) => {
  await page.goto('/?seed=alpine&renderer=webgl2');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(viewport);
    const results = await page.evaluate(() => {
      resizeCanvas();
      const differences = [];
      const distances = [0, route.stations[1].distance * 0.5, route.stations[1].distance,
        route.biomes[0].endDistance, route.totalLength * 0.8];
      for (const distance of distances) {
        state.distance = distance;
        state.speed = 24;
        const frame = createRenderFrameContext(canvas.clientWidth, canvas.clientHeight);
        setTerrainRendererMode('canvas');
        drawTerrainBackground(frame);
        const reference = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        setTerrainRendererMode('webgl2');
        drawTerrainBackground(frame);
        const gl = webglTerrain.gl;
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let error = 0, large = 0, count = 0;
        for (let y = 2; y < canvas.height - 2; y += 3) {
          for (let x = 2; x < canvas.width - 2; x += 3) {
            const a = (y * canvas.width + x) * 4;
            const b = ((canvas.height - 1 - y) * canvas.width + x) * 4;
            let sum = 0;
            for (let c = 0; c < 3; c++) sum += Math.abs(reference[a + c] - pixels[b + c]);
            error += sum / 3;
            if (sum / 3 > 32) large++;
            count++;
          }
        }
        differences.push({ distance, meanError: error / count, largeFraction: large / count });
      }
      return differences;
    });
    for (const result of results) {
      expect(result.meanError, JSON.stringify({ viewport, ...result })).toBeLessThan(4);
      expect(result.largeFraction, JSON.stringify({ viewport, ...result })).toBeLessThan(0.04);
    }
  }
});
