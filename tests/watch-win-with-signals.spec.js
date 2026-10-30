const { test, expect } = require('@playwright/test');
const { getAutopilotConfig, runAutopilot } = require('./win-autopilot');

test.setTimeout(5 * 60 * 1000);

test('visibly plays the full route with signals enabled', async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/index.html?seed=signal-run');

  const result = await runAutopilot(page, getAutopilotConfig({
    batchSteps: 8,
    postStepDelayMs: 5,
    renderEverySteps: 8,
    settleDelayMs: 1200,
    keepBrowserOpenMs: 2000,
    tickLogEvery: 300,
  }));
  expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
  await expect(page.locator('#finishTitle')).toHaveText('Run complete');
  await expect(page.locator('#penaltyTime')).toHaveText('0');
});
