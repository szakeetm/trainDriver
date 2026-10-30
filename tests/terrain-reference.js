// Pre-optimization terrain renderer: test-only pixel and timing reference.
module.exports = function drawBackgroundReference(frame) {
  ctx.fillStyle = "#78976b";
  ctx.fillRect(0, 0, frame.width, frame.height);
  // Cover the inverse viewport at both landscape height extremes. Extra cells
  // prevent gaps while following the train over changing elevations.
  const corners = [];
  const extent = 60 + TUNING.terrain.relief * 1.35;
  const trackTop = Math.max(...route.elevationNodes.map((node) => node.elevation));
  for (const elevation of [56 - extent, Math.max(56 + extent, trackTop + 1)]) {
    for (const x of [-64, frame.width + 64]) {
      for (const y of [-64, frame.height + 64]) {
        corners.push(screenToGround(x, y, frame.view, frame.width, elevation));
      }
    }
  }
  const size = TUNING.terrain.cellSize;
  const minX = Math.floor(Math.min(...corners.map((p) => p.x)) / size) - 1;
  const maxX = Math.ceil(Math.max(...corners.map((p) => p.x)) / size) + 1;
  const minY = Math.floor(Math.min(...corners.map((p) => p.y)) / size) - 1;
  const maxY = Math.ceil(Math.max(...corners.map((p) => p.y)) / size) + 1;
  const blend = frame.biomeBlend;
  const primary = getBiomePalette(blend.primary).base;
  const secondary = getBiomePalette(blend.secondary).base;
  const base = primary.map((value, index) => lerp(value, secondary[index], blend.mix));
  // Draw rows from far to near. All terrain shares vertices; triangles carry
  // surface lighting rather than screen-space texture that would swim on hills.
  for (let diagonal = minX + minY; diagonal <= maxX + maxY; diagonal += 1) {
    for (let gx = Math.max(minX, diagonal - maxY); gx <= Math.min(maxX, diagonal - minY); gx += 1) {
      const gy = diagonal - gx;
      const points = [getTerrainVertex(gx, gy), getTerrainVertex(gx + 1, gy),
        getTerrainVertex(gx + 1, gy + 1), getTerrainVertex(gx, gy + 1)];
      const screen = points.map((p) => projectPoint(p, frame));
      if (screen.every((p) => p.x < -2) || screen.every((p) => p.x > frame.width + 2)
        || screen.every((p) => p.y < -2) || screen.every((p) => p.y > frame.height + 2)) continue;
      for (const indices of [[0, 1, 2], [0, 2, 3]]) {
        const [a, b, c] = indices.map((index) => points[index]);
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.elevation - a.elevation;
        const vx = c.x - a.x, vy = c.y - a.y, vz = c.elevation - a.elevation;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const light = (nx * -0.45 + ny * -0.3 + nz * 0.84) / Math.hypot(nx, ny, nz);
        const tone = 0.75 + light * 0.32 + hashNoise(gx, gy) * 0.035;
        const color = `rgb(${base.slice(0, 3).map((value) => Math.round(clamp(value * tone, 0, 255))).join(",")})`;
        fillPolygon(indices.map((index) => screen[index]), color, color);
      }
    }
  }
  // FIFO eviction bounds memory on long runs; route replacement drops all caches.
  const cache = route.terrainHeightCache;
  while (cache.size > TUNING.terrain.cacheLimit) cache.delete(cache.keys().next().value);
};
