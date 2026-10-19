const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto('/?seed=alpine');
});

test('rejects large footprints, foreground foliage, and a different nearby track section', async ({ page }) => {
  const result = await page.evaluate(() => {
    const segment = { start: 0, end: 1000, length: 1000, x0: 0, y0: 0, heading0: 0, curvature: 0 };
    const fixture = { segments: [segment], terrainPhase: 0,
      elevationNodes: [{ distance: 0, elevation: 60 }, { distance: 3000, elevation: 60 }],
      trackSpatialIndex: new Map(), scenery: [] };
    const addTrack = (a, b) => {
      const edge = { a, b, distance: 0, length: 1000 };
      for (let x = Math.floor(Math.min(a.x, b.x) / 160); x <= Math.floor(Math.max(a.x, b.x) / 160); x++) {
        for (let y = Math.floor(Math.min(a.y, b.y) / 160); y <= Math.floor(Math.max(a.y, b.y) / 160); y++) {
          const key = `${x},${y}`;
          if (!fixture.trackSpatialIndex.has(key)) fixture.trackSpatialIndex.set(key, []);
          fixture.trackSpatialIndex.get(key).push(edge);
        }
      }
    };
    addTrack({ x: 0, y: 0 }, { x: 1000, y: 0 });
    const prop = (id, kind, offset) => ({ id, kind, distance: 300, offset, size: 1.55, rotation: 0.35 });
    fixture.scenery = [prop('pond-on-bed', 'pond', 28), prop('roof-on-bed', 'barn', -28),
      prop('foreground-canopy', 'tree', 50), prop('safe-tree', 'tree', -200),
      prop('safe-pond', 'pond', -200), prop('safe-house', 'hut', -200),
      prop('other-section', 'rock', 300)];
    const originalRoute = route;
    const before = filterSceneryForTrack(fixture).map(item => item.id);
    addTrack({ x: 0, y: 300 }, { x: 1000, y: 300 });
    const after = filterSceneryForTrack(fixture).map(item => item.id);
    return { before, after, globalUnchanged: originalRoute === route };
  });
  expect(result.before).toEqual(['safe-tree', 'safe-pond', 'safe-house', 'other-section']);
  expect(result.after).toEqual(['safe-tree', 'safe-pond', 'safe-house']);
  expect(result.globalUnchanged).toBe(true);
});

test('seeded props keep ground footprints and silhouettes clear over complete curved routes', async ({ page }) => {
  const result = await page.evaluate(() => {
    const failures = [];
    let props = 0;
    const globalRoute = route;
    for (const seed of ['alpine', 'ridge', 'valley', 'forest', 'clearance-1', 'clearance-2']) {
      const generated = generateRoute(seed);
      const samples = [];
      const camera = { x: 0, y: 0, elevation: 0 };
      for (const segment of generated.segments) {
        for (let offset = 0; offset <= segment.length; offset += 5) {
          const point = evaluateSegment(segment, offset);
          const elevation = getTrackElevation(segment.start + offset, generated).elevation;
          samples.push({ ...point, screen: worldToScreen({ ...point, elevation }, camera, 1, 0, 0) });
        }
      }
      for (const item of generated.scenery) {
        props++;
        const { radius, height } = getSceneryBounds(item);
        const point = item.worldPoint;
        const bottom = worldToScreen(point, camera, 1, 0, 0);
        const top = worldToScreen({ ...point, elevation: point.elevation + height }, camera, 1, 0, 0);
        const required = radius + 11 + 4;
        for (const sample of samples) {
          if (Math.hypot(point.x - sample.x, point.y - sample.y) < required
            || Math.hypot(bottom.x - sample.screen.x,
              sample.screen.y - Math.max(top.y, Math.min(bottom.y, sample.screen.y))) < required) {
            failures.push({ seed, kind: item.kind, distance: item.distance });
            break;
          }
        }
      }
      if (!generated.scenery.every((item, index, items) => !index || item.distance >= items[index - 1].distance)) {
        failures.push({ seed, unsorted: true });
      }
    }
    return { failures: failures.slice(0, 5), props, globalUnchanged: route === globalRoute };
  });
  expect(result.failures).toEqual([]);
  expect(result.props).toBeGreaterThan(1000);
  expect(result.globalUnchanged).toBe(true);
});
