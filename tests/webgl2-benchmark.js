// Start the port-4173 server, then run: node tests/webgl2-benchmark.js
// Hardware Chromium (D3D11) by default; TRAIN_DRIVER_BROWSER=msedge selects Edge.
const { chromium } = require('playwright');

async function benchmark() {
  const launch = process.env.TRAIN_DRIVER_BROWSER === 'msedge'
    ? { channel: 'msedge' } : { args: ['--use-angle=d3d11', '--enable-gpu'] };
  const browser = await chromium.launch(launch);
  const report = { browser: await browser.version(), launch, backend: null, results: [] };
  try {
    const cdp = await browser.newBrowserCDPSession();
    const info = await cdp.send('SystemInfo.getInfo');
    report.devices = info.gpu.devices;
    report.featureStatus = info.gpu.featureStatus;
    for (const viewport of [{ width: 1440, height: 900, dpr: 1 }, { width: 390, height: 844, dpr: 2 }]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr });
      await page.addInitScript(() => {
        window.benchmarkRaf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = () => 0;
      });
      await page.goto('http://127.0.0.1:4173/?seed=alpine&renderer=canvas');
      const setup = await page.evaluate(() => {
        const begin = performance.now();
        const active = setTerrainRendererMode('webgl2');
        const initializationMs = performance.now() - begin;
        if (active !== 'webgl2') throw new Error(getTerrainRendererStatus().reason);
        const gl = webglTerrain.gl;
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return { initializationMs, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'), attributes: gl.getContextAttributes() };
      });
      report.backend = setup.renderer;
      if (/swiftshader|llvmpipe|software/i.test(setup.renderer) && !process.env.TRAIN_DRIVER_ALLOW_SOFTWARE) {
        throw new Error(`Hardware comparison unavailable: ${setup.renderer}`);
      }
      for (const scenario of [{ name: 'stopped', fraction: 0, speed: 0 },
        { name: 'moving', fraction: 0.4, speed: 24 }, { name: 'fast', fraction: 0.8, speed: 72 },
        { name: 'biome-transition', biomeBoundary: true, speed: 24 }]) {
        const result = await page.evaluate(async ({ viewport, scenario, setup }) => {
          const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
          const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
          const startDistance = scenario.biomeBoundary ? route.biomes[0].endDistance - 30 : route.totalLength * scenario.fraction;
          const travel = scenario.speed * TUNING.physics.visibleSpeedMultiplier / 60;
          const position = frame => { state.distance = startDistance + frame * travel; state.speed = scenario.speed; };
          const draw = full => {
            if (full) render();
            else drawTerrainBackground(createRenderFrameContext(canvas.clientWidth, canvas.clientHeight));
          };
          const cold = { canvas: [], webgl2: [] };
          for (let i = 0; i < 5; i++) {
            for (const mode of i % 2 ? ['webgl2', 'canvas'] : ['canvas', 'webgl2']) {
              setTerrainRendererMode(mode);
              route.terrainHeightCache.clear(); route.terrainCellCache.clear(); route.terrainBackdrop = null;
              if (mode === 'webgl2') webglTerrain.resetRoute(route);
              position(0);
              const begin = performance.now();
              draw(false);
              cold[mode].push(performance.now() - begin);
            }
          }
          const samples = { canvasTerrain: [], webgl2Terrain: [], canvasFrame: [], webgl2Frame: [] };
          for (const mode of ['canvas', 'webgl2']) {
            setTerrainRendererMode(mode);
            for (let i = 0; i < 15; i++) { position(i); draw(true); }
          }
          for (let batch = 0; batch < 7; batch++) {
            for (const full of [false, true]) {
              for (const mode of batch % 2 ? ['webgl2', 'canvas'] : ['canvas', 'webgl2']) {
                setTerrainRendererMode(mode);
                const begin = performance.now();
                for (let i = 0; i < 20; i++) { position(batch * 20 + i); draw(full); }
                samples[`${mode}${full ? 'Frame' : 'Terrain'}`].push((performance.now() - begin) / 20);
              }
            }
          }
          const pacing = {};
          for (const mode of ['canvas', 'webgl2']) {
            setTerrainRendererMode(mode);
            const intervals = [], cpu = [];
            let previous = null;
            for (let i = 0; i < 100; i++) {
              const now = await new Promise(resolve => benchmarkRaf(resolve));
              if (previous != null && i >= 10) intervals.push(now - previous);
              previous = now;
              position(i);
              const begin = performance.now();
              draw(true);
              if (i >= 10) cpu.push(performance.now() - begin);
            }
            pacing[mode] = { medianIntervalMs: median(intervals), p95IntervalMs: percentile(intervals, 0.95),
              intervalsOver25ms: intervals.filter(value => value > 25).length, measuredIntervals: intervals.length,
              medianCpuMs: median(cpu), p95CpuMs: percentile(cpu, 0.95) };
          }
          // Only WebGL exposes this GPU query. It measures terrain work in this
          // GL context, not Canvas overlays or the browser's final composition.
          let gpuTerrainMs = null;
          setTerrainRendererMode('webgl2');
          const gl = webglTerrain.gl;
          const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
          if (timer) {
            const values = [];
            for (let i = 0; i < 5; i++) {
              const query = gl.createQuery();
              position(i);
              webglTerrain.lastViewKey = null;
              gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
              draw(false);
              gl.endQuery(timer.TIME_ELAPSED_EXT);
              gl.flush();
              let available = false;
              for (let poll = 0; poll < 120; poll++) {
                await new Promise(resolve => benchmarkRaf(resolve));
                if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) { available = true; break; }
              }
              if (available && !gl.getParameter(timer.GPU_DISJOINT_EXT)) values.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
              gl.deleteQuery(query);
            }
            if (values.length) gpuTerrainMs = median(values);
          }
          return { viewport, scenario, seed: route.seed, startDistance, setup,
            canvas: [canvas.clientWidth, canvas.clientHeight], backing: [canvas.width, canvas.height],
            coldTerrainMs: Object.fromEntries(Object.entries(cold).map(([key, values]) => [key, median(values)])),
            medianMs: Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, median(values)])),
            pacing, gpuTerrainMs, resources: getTerrainRendererStatus(), samples };
        }, { viewport, scenario, setup });

        // Capture completion is deliberately separate from submission timing.
        // It includes IPC, compositing/readback, and JPEG encoding, not just GL.
        result.completedCaptureMs = {};
        for (const mode of ['canvas', 'webgl2']) {
          const values = [];
          for (let i = 0; i < 3; i++) {
            const begin = performance.now();
            await page.evaluate(({ mode, distance, speed }) => {
              setTerrainRendererMode(mode); state.distance = distance; state.speed = speed; render();
            }, { mode, distance: result.startDistance, speed: scenario.speed });
            await page.screenshot({ type: 'jpeg', quality: 70 });
            values.push(performance.now() - begin);
          }
          result.completedCaptureMs[mode] = values.sort((a, b) => a - b)[1];
        }
        report.results.push(result);
      }
      await page.close();
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify(report, null, 2));
}

benchmark().catch(error => { console.error(error); process.exitCode = 1; });
