const { test, expect } = require('@playwright/test');
const { getAutopilotConfig, runAutopilot } = require('./win-autopilot');

if (process.env.PLAYWRIGHT_TRAIN_DRIVER_MODE === 'watch') {
  test.setTimeout(5 * 60 * 1000);
}

function getModeConfig() {
  const mode = process.env.PLAYWRIGHT_TRAIN_DRIVER_MODE === 'watch' ? 'watch' : 'fast';
  if (mode === 'watch') {
    return {
      mode,
      autopilot: getAutopilotConfig({
        batchSteps: 8,
        postStepDelayMs: 5,
        renderEverySteps: 2,
        settleDelayMs: 1200,
        keepBrowserOpenMs: 2000,
        tickLogEvery: 300,
        timeWarpStops: false,
      }),
    };
  }

  return {
    mode,
    autopilot: getAutopilotConfig(),
  };
}

test('wins the full route with signals enabled', async ({ page }) => {
  await page.goto('/index.html');
  const modeConfig = getModeConfig();

  let result = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    result = await runAutopilot(page, modeConfig.autopilot);
    if (result.success) {
      break;
    }
  }

  expect(result, 'expected autopilot to eventually produce a clean win').toBeTruthy();
  expect(result.success, JSON.stringify(result, null, 2)).toBe(true);
  await expect(page.locator('#finishTitle')).toHaveText('Run complete');
  await expect(page.locator('#penaltyTime')).toHaveText('0');
});