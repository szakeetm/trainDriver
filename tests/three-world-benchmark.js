// Start the static server, then: node tests/three-world-benchmark.js
const { chromium } = require('playwright');

async function benchmark() {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] });
  const report = { baselineCommit: '3c1c1a4', variant: 'Three world visual parity work',
    browser: await browser.version(), results: [] };
  try {
    const session = await browser.newBrowserCDPSession();
    const info = await session.send('SystemInfo.getInfo');
    report.devices = info.gpu.devices;
    report.featureStatus = info.gpu.featureStatus;
    for (const viewport of [{ width: 1440, height: 900, dpr: 1 }, { width: 390, height: 844, dpr: 2 }]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr });
      await page.addInitScript(() => {
        window.benchmarkRaf = requestAnimationFrame.bind(window);
        window.requestAnimationFrame = () => 0;
      });
      const loadStart = performance.now();
      await page.goto('http://127.0.0.1:4173/?renderer=three&seed=alpine');
      const loadMs = performance.now() - loadStart;
      const setup = await page.evaluate(() => {
        if (getTerrainRendererStatus().active !== 'three') throw new Error('Three world did not initialize');
        const gl = webglTerrain.gl, debug = gl.getExtension('WEBGL_debug_renderer_info');
        return { revision: THREE.REVISION, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
      });
      if (/swiftshader|software/i.test(setup.renderer)) throw new Error(`Hardware comparison unavailable: ${setup.renderer}`);
      report.backend = setup.renderer;
      for (const scenario of [{ name: 'stopped', fraction: 0, speed: 0 }, { name: 'moving', fraction: 0.4, speed: 24 },
        { name: 'fast', fraction: 0.8, speed: 72 }, { name: 'biome-transition', biomeBoundary: true, speed: 24 }]) {
        const result = await page.evaluate(async ({ viewport, scenario, setup, loadMs }) => {
          const median = a => [...a].sort((x, y) => x-y)[Math.floor(a.length/2)];
          const percentile = (a, p) => [...a].sort((x, y) => x-y)[Math.min(a.length-1, Math.ceil(a.length*p)-1)];
          const distance = scenario.biomeBoundary ? route.biomes[0].endDistance-30 : route.totalLength*scenario.fraction;
          const position = i => { state.distance = distance + i*scenario.speed*TUNING.physics.visibleSpeedMultiplier/60; state.speed = scenario.speed; };
          const cold = { webgl2: [], three: [] }, samples = { webgl2: [], three: [] };
          for (let batch = 0; batch < 5; batch++) {
            for (const mode of batch%2 ? ['three','webgl2'] : ['webgl2','three']) {
              setTerrainRendererMode(mode);
              route.terrainHeightCache.clear(); route.terrainCellCache.clear(); route.terrainBackdrop = null;
              webglTerrain.resetRoute(route);
              if (mode === 'three') threeWorld.resetRoute(route);
              position(0);
              const start = performance.now(); render(); cold[mode].push(performance.now()-start);
            }
          }
          for (const mode of ['webgl2','three']) {
            setTerrainRendererMode(mode);
            for (let i = 0; i < 15; i++) { position(i); render(); }
          }
          for (let batch = 0; batch < 9; batch++) {
            for (const mode of batch%2 ? ['three','webgl2'] : ['webgl2','three']) {
              setTerrainRendererMode(mode);
              const start = performance.now();
              for (let i = 0; i < 30; i++) { position(batch*30+i); render(); }
              samples[mode].push((performance.now()-start)/30);
            }
          }
          const pacing = {}, resources = {};
          for (const mode of ['webgl2','three']) {
            setTerrainRendererMode(mode);
            const intervals = [], cpu = [];
            let previous = null;
            for (let i = 0; i < 100; i++) {
              const now = await new Promise(resolve => benchmarkRaf(resolve));
              if (previous != null && i >= 10) intervals.push(now-previous);
              previous = now; position(i);
              const start = performance.now(); render();
              if (i >= 10) cpu.push(performance.now()-start);
            }
            pacing[mode] = { medianIntervalMs: median(intervals), p95IntervalMs: percentile(intervals,.95),
              intervalsOver25ms: intervals.filter(x=>x>25).length, measuredIntervals: intervals.length,
              medianCpuMs: median(cpu), p95CpuMs: percentile(cpu,.95) };
            resources[mode] = { terrain: getTerrainRendererStatus(), ...(mode==='three' ? getThreeWorldStatus() : {}) };
          }
          // This diagnostic spans different GL work: terrain in the baseline,
          // terrain plus world in Three. Canvas world work uses another context.
          const gl = webglTerrain.gl, timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
          const gpuContextMs = {};
          if (timer) for (const mode of ['webgl2','three']) {
            setTerrainRendererMode(mode);
            const values = [];
            for (let i = 0; i < 5; i++) {
              position(i); webglTerrain.lastViewKey = null; threeWorld.lastViewKey = null;
              const query = gl.createQuery();
              gl.beginQuery(timer.TIME_ELAPSED_EXT, query); render(); gl.endQuery(timer.TIME_ELAPSED_EXT); gl.flush();
              let ready = false;
              for (let poll = 0; poll < 120; poll++) {
                await new Promise(resolve=>benchmarkRaf(resolve));
                if (gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)) { ready=true; break; }
              }
              if (ready && !gl.getParameter(timer.GPU_DISJOINT_EXT)) values.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);
              gl.deleteQuery(query);
            }
            gpuContextMs[mode] = values.length ? median(values) : null;
          }
          return { viewport, scenario, setup, loadMs, distance, samples,
            medianFrameMs: Object.fromEntries(Object.entries(samples).map(([mode,a])=>[mode,median(a)])),
            coldFrameMs: Object.fromEntries(Object.entries(cold).map(([mode,a])=>[mode,median(a)])),
            firstColdFrameMs: { webgl2: cold.webgl2[0], three: cold.three[0] }, pacing, gpuContextMs, resources };
        }, { viewport, scenario, setup, loadMs });
        result.completedCaptureMs = {};
        for (const mode of ['webgl2','three']) {
          const values = [];
          for (let i = 0; i < 3; i++) {
            const start = performance.now();
            await page.evaluate(({mode,distance,speed})=>{setTerrainRendererMode(mode);state.distance=distance;state.speed=speed;render()},
              {mode,distance:result.distance,speed:scenario.speed});
            await page.screenshot({type:'jpeg',quality:70});
            values.push(performance.now()-start);
          }
          result.completedCaptureMs[mode] = values.sort((a,b)=>a-b)[1];
        }
        report.results.push(result);
      }
      await page.close();
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify(report,null,2));
}

benchmark().catch(error=>{console.error(error);process.exitCode=1});
