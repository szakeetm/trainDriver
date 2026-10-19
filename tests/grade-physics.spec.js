const { test, expect } = require('@playwright/test');
const { getAutopilotConfig, runAutopilot } = require('./win-autopilot');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/?seed=alpine');
});

test('steeper seeded routes have climbs and descents within the grade cap', async ({ page }) => {
  const routes = await page.evaluate(() => ['alpine', 'ridge', 'valley'].map(seed => {
    route = generateRoute(seed);
    let min = 0, max = 0;
    for (let d = 0; d <= route.totalLength; d += 10) {
      const grade = getTrackElevation(d).grade;
      min = Math.min(min, grade); max = Math.max(max, grade);
    }
    return { min, max, cap: TUNING.terrain.maxGrade, level: route.stations.every(station =>
      [-200, 0, 200].every(offset => getTrackElevation(station.distance + offset).grade === 0)) };
  }));
  for (const result of routes) {
    expect(result.max).toBeGreaterThan(0.045);
    expect(result.min).toBeLessThan(-0.045);
    expect(result.max).toBeLessThanOrEqual(result.cap);
    expect(result.min).toBeGreaterThanOrEqual(-result.cap);
    expect(result.level).toBe(true);
  }
});

test('gravity changes power, coast, and braking by the expected amount', async ({ page }) => {
  const result = await page.evaluate(() => {
    const simulate = (sign, control) => {
      const span = 2000 - TUNING.terrain.stationFlatLength * 2;
      route.elevationNodes = [{ distance: 0, elevation: 150 },
        { distance: 2000, elevation: 150 + sign * span * 0.08 / 1.5 }];
      Object.assign(state, { distance: 1050, speed: 20, actualControl: control });
      const grade = getConsistGrade();
      updatePhysics(0.05);
      return { grade, acceleration: state.acceleration, speed: state.speed,
        gravity: -TUNING.physics.gravity * Math.sin(Math.atan(grade)) };
    };
    return [-1, 0, 1].map(control => ({ flat: simulate(0, control),
      uphill: simulate(1, control), downhill: simulate(-1, control) }));
  });
  for (const pair of result) {
    expect(pair.uphill.acceleration).toBeLessThan(pair.flat.acceleration);
    expect(pair.downhill.acceleration).toBeGreaterThan(pair.flat.acceleration);
    expect(pair.uphill.speed).toBeLessThan(pair.flat.speed);
    expect(pair.downhill.speed).toBeGreaterThan(pair.flat.speed);
    expect(pair.uphill.acceleration - pair.flat.acceleration).toBeCloseTo(pair.uphill.gravity, 10);
    expect(pair.downhill.acceleration - pair.flat.acceleration).toBeCloseTo(pair.downhill.gravity, 10);
  }
});

test('consist grade follows vehicles across a crest and ignores coupler gaps', async ({ page }) => {
  const result = await page.evaluate(() => {
    const original = getTrackElevation;
    try {
      // Peak at 1000 m: locomotive is downhill while both coaches are uphill.
      getTrackElevation = distance => ({ elevation: 100 - Math.abs(distance - 1000) * 0.08 });
      state.distance = 1024;
      return { grade: getConsistGrade(), nose: -0.08,
        expected: (34 + 34 - 24) * 0.08 / (24 + 34 + 34) };
    } finally { getTrackElevation = original; }
  });
  expect(result.grade).toBeGreaterThan(0);
  expect(result.grade).not.toBe(result.nose);
  expect(result.grade).toBeCloseTo(result.expected, 10);
});

test('descent lengthens stopping distance and ascent shortens it', async ({ page }) => {
  const distances = await page.evaluate(() => {
    const original = getTrackElevation;
    try {
      return [-0.08, 0, 0.08].map(grade => {
        getTrackElevation = distance => ({ elevation: 100 + distance * grade, grade });
        Object.assign(state, { distance: 1000, speed: 20, actualControl: -1 });
        let steps = 0;
        while (state.speed > 0 && steps++ < 1000) updatePhysics(0.05);
        return { distance: state.distance - 1000, stopped: state.speed === 0 };
      });
    } finally { getTrackElevation = original; }
  });
  expect(distances.every(result => result.stopped)).toBe(true);
  expect(distances[0].distance).toBeGreaterThan(distances[1].distance * 1.25);
  expect(distances[2].distance).toBeLessThan(distances[1].distance * 0.85);
});

test('brakes hold on descents, coasting rolls, and uphill stalls cannot reverse', async ({ page }) => {
  const result = await page.evaluate(() => {
    const original = getTrackElevation;
    const simulate = (grade, speed, control, steps) => {
      getTrackElevation = distance => ({ elevation: 100 + distance * grade, grade });
      Object.assign(state, { distance: 1000, speed, actualControl: control });
      for (let index = 0; index < steps; index++) updatePhysics(0.05);
      return { distance: state.distance, speed: state.speed };
    };
    try {
      return { held: simulate(-0.08, 0, -1, 100), rolling: simulate(-0.08, 0, 0, 100),
        stalled: simulate(0.08, 0.07, 0, 100), climbing: simulate(0.08, 0, 1, 100) };
    } finally { getTrackElevation = original; }
  });
  expect(result.held).toEqual({ distance: 1000, speed: 0 });
  expect(result.rolling.speed).toBeGreaterThan(1);
  expect(result.rolling.distance).toBeGreaterThan(1000);
  expect(result.stalled.speed).toBe(0);
  expect(result.stalled.distance).toBeGreaterThanOrEqual(1000);
  expect(result.stalled.distance).toBeLessThan(1001);
  expect(result.climbing.speed).toBeGreaterThan(0);
});

test('travel multiplier does not multiply gravity', async ({ page }) => {
  const result = await page.evaluate(() => {
    const original = getTrackElevation;
    const multiplier = TUNING.physics.visibleSpeedMultiplier;
    try {
      getTrackElevation = distance => ({ elevation: distance * -0.08, grade: -0.08 });
      return [1, 1.5, 3].map(value => {
        TUNING.physics.visibleSpeedMultiplier = value;
        Object.assign(state, { distance: 1000, speed: 20, actualControl: 0 });
        updatePhysics(0.05);
        return { acceleration: state.acceleration, speed: state.speed, distance: state.distance };
      });
    } finally { getTrackElevation = original; TUNING.physics.visibleSpeedMultiplier = multiplier; }
  });
  expect(result[0].acceleration).toBe(result[1].acceleration);
  expect(result[1].speed).toBe(result[2].speed);
  expect(result[0].distance).toBeLessThan(result[1].distance);
  expect(result[1].distance).toBeLessThan(result[2].distance);
});

for (const seed of ['alpine', 'ridge', 'valley']) {
  test(`wins a fixed graded route: ${seed}`, async ({ page }) => {
    await page.goto(`/?seed=${seed}`);
    const result = await runAutopilot(page, getAutopilotConfig());
    expect(result.success, JSON.stringify({ ...result, logs: result.logs.slice(-3) }, null, 2)).toBe(true);
    expect(result.penalties).toBe(0);
  });
}
