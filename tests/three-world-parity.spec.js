const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/?renderer=three&seed=alpine');
});

// Compare the production Canvas drawing with production retained geometry on
// the same background. Isolate the relevant meshes so terrain cannot dilute
// an error in a small object. No golden PNG or duplicated drawing algorithm.
async function compareFixture(page, fixture) {
  return page.evaluate(fixture => {
    state.distance = fixture.distance ?? 500;
    state.speed = 0;
    route.stations = [];
    route.signals = [];
    route.segments.forEach(segment => { segment.speedLimit = null; });
    route.scenery = [];
    if (fixture.derailed) { beginDerailment('parity fixture'); state.derailment.timer = 0.8; }
    const frame = createRenderFrameContext(canvas.clientWidth, canvas.clientHeight);
    let point, reference;
    const group = fixture.kind === 'train' ? 'train' : ['sign', 'signal', 'zone'].includes(fixture.kind) ? 'markers' : 'scenery';
    if (group === 'scenery') {
      const item = { kind: fixture.kind, distance: 500, offset: 0, size: 4,
        rotation: fixture.heading || 0, tint: 1 };
      route.scenery = [item];
      point = getSceneryPoint(item);
      reference = () => { const queue = []; queueScenery(frame, queue); queue.forEach(entry => entry.draw()); };
    } else if (group === 'train') {
      state.overspeedTimer = fixture.warning ? 1 : 0;
      const unit = frame.renderedUnits[0];
      point = { x: unit.renderX, y: unit.renderY, elevation: unit.renderElevation + 1 };
      frame.renderedUnits = [unit];
      reference = () => { const queue = []; queueTrain(frame, queue); queue.forEach(entry => entry.draw()); };
    } else {
      if (fixture.kind === 'zone') {
        const curve = route.segments.reduce((a,b) => Math.abs(a.curvature)>Math.abs(b.curvature) ? a : b);
        const length = Math.min(180, curve.length);
        TUNING.signals.redStopWindow = length;
        const distance = curve.start + length;
        route.signals = [{ distance, side: 1, kind: 'red', aspect: 'red', waitTimer: 0, clearAfter: 10 }];
        point = evaluateRoute(distance-length/2);
        reference = () => drawGroundZone(distance-length, distance, 7, 'rgba(255,106,98,0.28)', frame);
      } else if (fixture.kind === 'sign') {
        route.segments[0].speedLimit = 24;
        point = offsetRoutePoint(route.segments[0].start + 12, -18);
      } else {
        route.signals = [{ distance: 500, side: 1, kind: 'yellow', speedLimit: 24 }];
        point = offsetRoutePoint(500, TRACK_WIDTH * 0.8 + TUNING.signals.sideOffset);
      }
      if (!reference) reference = () => { const queue = []; queueRouteMarkers(frame, queue); queue.forEach(entry => entry.draw()); };
    }
    frame.view.camera = { ...point };
    frame.view.scale = fixture.kind === 'zone' ? 2 : group === 'markers' ? 1 : 3;
    frame.view.anchorY = frame.height * 0.75;
    threeWorld.resetRoute(route);
    threeWorld.draw(frame);
    for (const mesh of threeWorld.scene.children) mesh.visible = group === 'scenery'
      ? threeWorld.staticMeshes.includes(mesh) && mesh.material === threeWorld.transparent
      : group === 'train' ? mesh === threeWorld.trainMeshes[0]
        : fixture.kind === 'zone' ? mesh === threeWorld.markerMeshes[1] : threeWorld.markerMeshes.includes(mesh);
    // No foreground fade in these isolated fixtures; its lifetime is covered
    // by the full-scene comparisons and renderer regressions.
    threeWorld.uniforms.trainBounds.value.set(-1000, -1000, -900, -900);
    threeWorld.renderer.setClearColor('#788880', 1);
    threeWorld.renderer.clear(true, true, false);
    threeWorld.renderer.render(threeWorld.scene, threeWorld.camera);
    const gl = webglTerrain.gl;
    const gpu = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, gpu);
    const gpuImage = fixture.debug ? webglTerrain.canvas.toDataURL() : null;
    // Sign numerals are part of the shared Canvas overlay in the real mode.
    ctx.clearRect(0, 0, frame.width, frame.height);
    threeWorld.labels(frame); frame.labels = []; drawWorldLabels(frame);
    const overlay = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    ctx.clearRect(0, 0, frame.width, frame.height);
    ctx.fillStyle = '#788880'; ctx.fillRect(0, 0, frame.width, frame.height);
    reference();
    const original = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const center = projectPoint(point, frame);
    const cssRegion = fixture.kind === 'zone' ? [center.x-250, center.y-160, 500, 320]
      : group === 'markers' ? [center.x-22, center.y-40, 44, 43]
      : group === 'train' ? [center.x-100, center.y-70, 200, 115]
      : [center.x-160, center.y-300, 320, 365];
    const sx = canvas.width/frame.width, sy = canvas.height/frame.height;
    const region = cssRegion.map((value,i) => value * (i%2 ? sy : sx));
    let error = 0, large = 0, count = 0, interiorError = 0, interiorCount = 0;
    for (let y = Math.max(0, Math.floor(region[1])); y < Math.min(canvas.height, region[1]+region[3]); y++) {
      for (let x = Math.max(0, Math.floor(region[0])); x < Math.min(canvas.width, region[0]+region[2]); x++) {
        const a = (y * canvas.width + x) * 4, b = ((canvas.height-1-y)*canvas.width+x)*4;
        const alpha = overlay[a+3]/255;
        const actual = [0,1,2].map(c => gpu[b+c]*(1-alpha)+overlay[a+c]*alpha);
        if ([120,136,128].every((v,c) => original[a+c] === v && Math.abs(actual[c]-v) < 1)) continue;
        const delta = [0,1,2].reduce((sum,c) => sum + Math.abs(original[a+c]-actual[c]),0)/3;
        error += delta; large += delta > 24 ? 1 : 0; count++;
        let interior = x > 0 && y > 0 && x < canvas.width-1 && y < canvas.height-1;
        for (let dy = -1; interior && dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const neighbor = ((y+dy)*canvas.width+x+dx)*4;
          if ([0,1,2].some(c => original[neighbor+c] !== original[a+c])) interior = false;
        }
        if (interior) { interiorError += delta; interiorCount++; }
      }
    }
    return { meanError: error/count, largeFraction: large/count,
      interiorError: interiorError/interiorCount, interiorCount, glError: gl.getError(),
      ...(fixture.debug ? { gpuImage, referenceImage: canvas.toDataURL() } : {}) };
  }, fixture);
}

test('tree foliage height and ground shadow match the original silhouette', async ({ page }) => {
  const result = await compareFixture(page, { kind: 'tree' });
  expect(result.glError).toBe(0);
  expect(result.meanError).toBeLessThan(3);
  expect(result.largeFraction).toBeLessThan(0.04);
});

test('warning colors preserve the locomotive roof and cab', async ({ page }, testInfo) => {
  const result = await compareFixture(page, { kind: 'train', warning: true, debug: true });
  for (const name of ['gpuImage', 'referenceImage']) {
    const path = testInfo.outputPath(`${name}.png`);
    await require('fs').promises.writeFile(path, Buffer.from(result[name].split(',')[1], 'base64'));
    await testInfo.attach(name, { path, contentType: 'image/png' });
  }
  expect(result.glError).toBe(0);
  expect(result.interiorCount).toBeGreaterThan(300);
  expect(result.interiorError).toBeLessThan(0.5);
  expect(result.meanError).toBeLessThan(6);
});

test('signs and signals keep their rounded casing and signal glow', async ({ page }) => {
  for (const kind of ['sign', 'signal']) {
    const result = await compareFixture(page, { kind });
    expect(result.glError).toBe(0);
    expect(result.meanError, kind).toBeLessThan(3);
  }
});

test('outlined boxes and ponds retain their original edge detail', async ({ page }) => {
  for (const fixture of [{ kind: 'rock', heading: 0.2 }, { kind: 'rock', heading: 2.4 }, { kind: 'pond' }]) {
    const result = await compareFixture(page, fixture);
    expect(result.glError).toBe(0);
    expect(result.meanError, JSON.stringify(fixture)).toBeLessThan(0.65);
  }
});

test('marker size and glow follow the original at DPR 2', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto('/?renderer=three&seed=alpine');
    for (const kind of ['sign', 'signal']) {
      const result = await compareFixture(page, { kind });
      expect(result.glError).toBe(0);
      expect(result.meanError, kind).toBeLessThan(3);
    }
    const ratios = [];
    for (const viewport of [{ width: 390, height: 844 }, { width: 3200, height: 1800 }, { width: 932, height: 430 }]) {
      await page.setViewportSize(viewport);
      const status = await page.evaluate(() => {
        startRun(); resizeCanvas(); render();
        return { ...getThreeWorldStatus(), ratio: threeWorld.atlasPixelRatio, error: webglTerrain.gl.getError() };
      });
      ratios.push(status.ratio);
      expect(status.textures).toBe(1);
      expect(status.atlasBytes).toBe(524288);
      expect(status.error).toBe(0);
    }
    expect(new Set(ratios).size).toBeGreaterThan(1);
  } finally { await context.close(); }
});

test('curved stop zones have continuous fill without a triangle-fan wedge', async ({ page }) => {
  const result = await compareFixture(page, { kind: 'zone' });
  expect(result.glError).toBe(0);
  expect(result.meanError).toBeLessThan(2);
});

test('vehicle colors and visible faces agree through route headings and grades', async ({ page }) => {
  for (const distance of [0, 3500, 8000, 14000]) {
    const result = await compareFixture(page, { kind: 'train', distance });
    expect(result.glError).toBe(0);
    expect(result.interiorCount).toBeGreaterThan(200);
    expect(result.interiorError, `distance ${distance}`).toBeLessThan(1);
    expect(result.meanError, `distance ${distance}`).toBeLessThan(6);
  }
});

test('derailed locomotive keeps its roof color and outward faces', async ({ page }) => {
  const result = await compareFixture(page, { kind: 'train', distance: 8000, derailed: true });
  expect(result.glError).toBe(0);
  expect(result.interiorCount).toBeGreaterThan(200);
  expect(result.interiorError).toBeLessThan(1);
  expect(result.meanError).toBeLessThan(6);
});
