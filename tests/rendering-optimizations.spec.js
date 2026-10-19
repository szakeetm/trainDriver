const { test, expect } = require('@playwright/test');

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
