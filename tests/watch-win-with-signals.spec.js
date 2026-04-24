const { test, expect } = require('@playwright/test');
const { getAutopilotConfig, runAutopilot } = require('./win-autopilot');

test.setTimeout(5 * 60 * 1000);

test('visibly plays the full route with signals enabled', async ({ page }) => {
  await page.goto('/index.html');

  let result = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    result = await runAutopilot(page, getAutopilotConfig({
      batchSteps: 8,
      postStepDelayMs: 5,
      renderEverySteps: 2,
      settleDelayMs: 1200,
      keepBrowserOpenMs: 2000,
      tickLogEvery: 300,
      timeWarpStops: false,
    }));
    if (result.success) {
      break;
    }
  }

  expect(result, 'expected visible autopilot demo to eventually produce a clean win').toBeTruthy();
  expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
  await expect(page.locator('#finishTitle')).toHaveText('Run complete');
  await expect(page.locator('#penaltyTime')).toHaveText('0');
});