const { test, expect } = require('@playwright/test');

test('defers the 3D scene until expansion and releases resources on restart', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/index.html');

  expect(await page.evaluate(() => droneInsetRenderer === null)).toBe(true);
  await page.locator('#droneInsetToggle').click();
  expect(await page.evaluate(() => Boolean(droneInsetRenderer?.available))).toBe(true);

  const restarted = await page.evaluate(() => {
    const renderer = droneInsetRenderer;
    const oldRoute = route;
    const oldPuffs = [...renderer.exhaustGroup.children];
    let disposedGeometry = 0;
    let disposedMaterial = 0;
    oldPuffs.forEach((puff) => {
      puff.geometry.addEventListener('dispose', () => disposedGeometry++);
      puff.material.addEventListener('dispose', () => disposedMaterial++);
    });
    startRun();
    render();
    return {
      replacedRoute: route !== oldRoute && renderer.routeRef === route,
      puffCount: renderer.exhaustGroup.children.length,
      oldPuffCount: oldPuffs.length,
      detached: oldPuffs.every((puff) => puff.parent === null),
      disposedGeometry,
      disposedMaterial,
    };
  });
  expect(restarted.replacedRoute).toBe(true);
  expect(restarted.oldPuffCount).toBe(10);
  expect(restarted.puffCount).toBe(10);
  expect(restarted.detached).toBe(true);
  expect(restarted.disposedGeometry).toBe(10);
  expect(restarted.disposedMaterial).toBe(10);

  await page.locator('#droneInsetToggle').click();
  expect(await page.evaluate(() => {
    const oldRoute = droneInsetRenderer.routeRef;
    startRun();
    startRun();
    return droneInsetRenderer.routeRef === oldRoute && oldRoute !== route;
  })).toBe(true);
  await page.locator('#droneInsetToggle').click();
  expect(await page.evaluate(() => (
    droneInsetRenderer.routeRef === route && droneInsetRenderer.exhaustGroup.children.length === 10
  ))).toBe(true);
  expect(errors).toEqual([]);
});
