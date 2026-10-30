// Run with the local HTTP server running: node tests/terrain-benchmark.js
// Results measure warm CPU submission, not completed GPU work or hardware FPS.
const { chromium } = require('playwright');
const terrainReference = require('./terrain-reference');

async function benchmark() {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const viewport of [{ width: 1440, height: 900, dpr: 1 }, { width: 390, height: 844, dpr: 2 }]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr });
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      await page.goto('http://127.0.0.1:4173/?seed=alpine&renderer=canvas');
      await page.addScriptTag({ content: `window.drawBackgroundReference = ${terrainReference.toString()};` });
      for (const scenario of [{ fraction: 0, speed: 0 }, { fraction: 0.4, speed: 24 }, { fraction: 0.8, speed: 72 }]) {
        results.push(await page.evaluate(({ viewport, scenario }) => {
          const startDistance = route.totalLength * scenario.fraction;
          state.distance = startDistance;
          state.speed = scenario.speed;
          const optimized = drawBackground;
          const draw = (kind, full) => {
            drawBackground = kind === 'reference' ? drawBackgroundReference : optimized;
            if (full) render();
            else drawBackground(createRenderFrameContext(canvas.clientWidth, canvas.clientHeight));
          };
          const cold = { reference: [], optimized: [] };
          for (let i = 0; i < 5; i++) {
            for (const kind of i % 2 ? ['optimized', 'reference'] : ['reference', 'optimized']) {
              route.terrainHeightCache.clear();
              route.terrainCellCache.clear();
              route.terrainBackdrop = null;
              const begin = performance.now();
              draw(kind, false);
              cold[kind].push(performance.now() - begin);
            }
          }
          for (let i = 0; i < 10; i++) { draw('reference', true); draw('optimized', true); }
          const samples = { referenceTerrain: [], optimizedTerrain: [], referenceFrame: [], optimizedFrame: [] };
          try {
            for (let batch = 0; batch < 7; batch++) {
              const order = batch % 2 ? ['optimized', 'reference'] : ['reference', 'optimized'];
              for (const full of [false, true]) {
                for (const kind of order) {
                  const begin = performance.now();
                  for (let i = 0; i < 20; i++) {
                    // Identical moving-camera paths for each renderer, rather
                    // than rewarding a cache that only handles frozen frames.
                    state.distance = startDistance + (batch * 20 + i) * scenario.speed * 1.5 / 60;
                    draw(kind, full);
                  }
                  samples[`${kind}${full ? 'Frame' : 'Terrain'}`].push((performance.now() - begin) / 20);
                }
              }
            }
          } finally { drawBackground = optimized; }
          return { seed: route.seed, viewport, scenario,
            canvas: [canvas.clientWidth, canvas.clientHeight],
            coldTerrainMs: Object.fromEntries(Object.entries(cold).map(([key, values]) =>
              [key, values.sort((a, b) => a - b)[2]])),
            medianMs: Object.fromEntries(Object.entries(samples).map(([key, values]) =>
              [key, values.sort((a, b) => a - b)[3]])),
            cache: { vertices: route.terrainHeightCache.size, cells: route.terrainCellCache?.size || 0 }, samples };
        }, { viewport, scenario }));
      }
      await page.close();
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify(results, null, 2));
}

benchmark().catch(error => { console.error(error); process.exitCode = 1; });
