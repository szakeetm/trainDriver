const { test, expect } = require('@playwright/test');

test('generates one route at startup and one per restart', async ({ page }) => {
  await page.route('**/js/main.js', async (request) => {
    const response = await request.fetch();
    await request.fulfill({
      response,
      body: `const originalGenerateRoute = generateRoute;
        window.routeGenerations = 0;
        generateRoute = function () {
          window.routeGenerations++;
          return originalGenerateRoute();
        };
        ${await response.text()}`,
    });
  });
  await page.goto('/index.html');
  expect(await page.evaluate(() => ({ generations: window.routeGenerations, started: state.started })))
    .toEqual({ generations: 1, started: true });
  await page.evaluate(() => startRun());
  expect(await page.evaluate(() => window.routeGenerations)).toBe(2);
});

test('batches every sleeper with correct poses, bounds, shadows and cleanup', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('#droneInsetToggle').click();
  const result = await page.evaluate(() => {
    const renderer = droneInsetRenderer;
    const chunks = renderer.trackGroup.children.filter((mesh) => mesh.name === 'sleepers');
    const expectedCount = Math.floor(route.totalLength / 18) + 1;
    const template = new THREE.BoxGeometry(TRACK_WIDTH * 0.84 * 1.95, 0.16, 1.7);
    const source = template.getAttribute('position');
    const vertex = new THREE.Vector3();
    const actual = new THREE.Vector3();
    const transform = new THREE.Object3D();
    let sleeperIndex = 0;
    let maxError = 0;
    let bounded = true;
    for (const chunk of chunks) {
      const positions = chunk.geometry.getAttribute('position');
      for (let offset = 0; offset < positions.count; offset += source.count) {
        const pose = evaluateRoute(sleeperIndex++ * 18);
        transform.position.set(pose.x, 0.1, pose.y);
        transform.rotation.y = Math.PI * 0.5 - pose.heading;
        transform.updateMatrix();
        for (let index = 0; index < source.count; index++) {
          vertex.fromBufferAttribute(source, index).applyMatrix4(transform.matrix);
          actual.fromBufferAttribute(positions, offset + index);
          maxError = Math.max(maxError, actual.distanceTo(vertex));
          const sphere = chunk.geometry.boundingSphere;
          bounded &&= actual.distanceTo(sphere.center) <= sphere.radius + 0.001;
        }
      }
    }
    template.dispose();
    let disposed = 0;
    chunks.forEach((mesh) => mesh.geometry.addEventListener('dispose', () => disposed++));
    const shadows = chunks.every((mesh) => mesh.castShadow && mesh.receiveShadow && mesh.frustumCulled);
    startRun();
    return {
      expectedCount, sleeperIndex, maxError, bounded, shadows,
      chunkCount: chunks.length, disposed,
      detached: chunks.every((mesh) => mesh.parent === null),
    };
  });
  expect(result.sleeperIndex).toBe(result.expectedCount);
  expect(result.chunkCount).toBe(Math.ceil(result.expectedCount / 64));
  expect(result.maxError).toBeLessThan(0.005);
  expect(result.bounded).toBe(true);
  expect(result.shadows).toBe(true);
  expect(result.disposed).toBe(result.chunkCount);
  expect(result.detached).toBe(true);
});
