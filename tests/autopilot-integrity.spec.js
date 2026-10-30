const { test, expect } = require('@playwright/test');
const { getAutopilotConfig, runAutopilot } = require('./win-autopilot');

test('the win driver completes a route using production updates without writing physics or outcomes', async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/?seed=alpine');
  await page.evaluate(() => {
    const originalStart = startRun;
    const originalUpdate = update;
    const originalPhysics = updatePhysics;
    let inUpdate = false;
    const audit = window.driverAudit = { updates: 0, physics: 0, violations: [] };
    const record = (scope, key) => {
      if (!inUpdate && audit.violations.length < 20) audit.violations.push(`${scope}.${key}`);
    };
    startRun = () => {
      originalStart();
      state = new Proxy(state, { set(target, key, value) {
        if (key !== 'requestedControl') record('state', key);
        target[key] = value;
        return true;
      } });
      route.signals = route.signals.map(signal => new Proxy(signal, { set(target, key, value) {
        record('signal', key);
        target[key] = value;
        return true;
      } }));
    };
    update = dt => {
      audit.updates++;
      inUpdate = true;
      try { originalUpdate(dt); } finally { inUpdate = false; }
    };
    updatePhysics = dt => {
      audit.physics++;
      if (!inUpdate) record('physics', 'outside-update');
      originalPhysics(dt);
    };
  });
  const result = await runAutopilot(page, getAutopilotConfig());
  const audit = await page.evaluate(() => window.driverAudit);
  expect(audit.violations).toEqual([]);
  expect(audit.updates).toBeGreaterThan(1000);
  expect(audit.physics).toBe(audit.updates);
  expect(result.success, JSON.stringify(result)).toBe(true);
  expect(result.penalties).toBe(0);
});
