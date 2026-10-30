function projectPoint(point, frame, output) {
  return worldToScreen(point, frame.view.camera, frame.view.scale, frame.width, frame.view.anchorY, output);
}

function fillPolygon(points, color, stroke = null) {
  ctx.beginPath();
  points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}

function isVisible(point, frame, margin = 100) {
  return point.x >= -margin && point.x <= frame.width + margin
    && point.y >= -margin && point.y <= frame.height + margin;
}

function projectTerrainVertex(point, frame, version) {
  if (point.projectionVersion !== version) {
    point.screen = projectPoint(point, frame, point.screen);
    point.projectionVersion = version;
  }
  return point.screen;
}

function getTerrainTone(a, b, c, noise) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.elevation - a.elevation;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.elevation - a.elevation;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const light = (nx * -0.45 + ny * -0.3 + nz * 0.84) / Math.hypot(nx, ny, nz);
  return 0.75 + light * 0.32 + noise * 0.035;
}

function getTerrainColor(red, green, blue, tone) {
  return `rgb(${Math.round(clamp(red * tone, 0, 255))},${Math.round(clamp(green * tone, 0, 255))},${Math.round(clamp(blue * tone, 0, 255))})`;
}

function fillTerrainTriangle(a, b, c, color) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

function trimTerrainCaches() {
  for (const cache of [route.terrainHeightCache, route.terrainCellCache]) {
    while (cache.size > TUNING.terrain.cacheLimit) cache.delete(cache.keys().next().value);
  }
}

function drawBackground(frame) {
  const stationary = state.speed === 0 || state.finished;
  const camera = frame.view.camera;
  const blend = frame.biomeBlend;
  const backdropKey = stationary ? [frame.width, frame.height, canvas.width, canvas.height,
    camera.x, camera.y, camera.elevation, frame.view.scale, frame.view.anchorY,
    blend.primary, blend.secondary, blend.mix].join("|") : null;
  let backdrop = route.terrainBackdrop;
  if (stationary && backdrop?.key === backdropKey) {
    trimTerrainCaches();
    // Copy exact backing-store pixels, bypassing the CSS-pixel transform.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(backdrop.canvas, 0, 0);
    ctx.restore();
    return;
  }
  if (!stationary) route.terrainBackdrop = null;
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
  const primary = getBiomePalette(blend.primary).base;
  const secondary = getBiomePalette(blend.secondary).base;
  const red = lerp(primary[0], secondary[0], blend.mix);
  const green = lerp(primary[1], secondary[1], blend.mix);
  const blue = lerp(primary[2], secondary[2], blend.mix);
  const paletteKey = `${red},${green},${blue}`;
  if (route.terrainPaletteKey !== paletteKey) {
    route.terrainPaletteKey = paletteKey;
    route.terrainPaletteVersion += 1;
  }
  const paletteVersion = route.terrainPaletteVersion;
  const projectionVersion = ++route.terrainProjectionVersion;
  const cells = route.terrainCellCache;
  // Screen x is independent of elevation. Clip each diagonal before visiting
  // its cells, so the corners of the inverse viewport's world-space box do
  // not trigger height queries and projections that cannot reach the screen.
  const tileAcross = size * Math.SQRT1_2 * frame.view.scale;
  const centerAcross = frame.width * 0.5
    + (frame.view.camera.y - frame.view.camera.x) * Math.SQRT1_2 * frame.view.scale;
  const minAcross = (-2 - centerAcross) / tileAcross - 1;
  const maxAcross = (frame.width + 2 - centerAcross) / tileAcross + 1;
  // Draw rows from far to near. All terrain shares vertices; triangles carry
  // surface lighting rather than screen-space texture that would swim on hills.
  for (let diagonal = minX + minY; diagonal <= maxX + maxY; diagonal += 1) {
    // One guard cell on either side absorbs floating-point boundary rounding.
    const rowMin = Math.max(minX, diagonal - maxY, Math.ceil((diagonal + minAcross) * 0.5) - 1);
    const rowMax = Math.min(maxX, diagonal - minY, Math.floor((diagonal + maxAcross) * 0.5) + 1);
    for (let gx = rowMin; gx <= rowMax; gx += 1) {
      const gy = diagonal - gx;
      const a = getTerrainVertex(gx, gy), b = getTerrainVertex(gx + 1, gy);
      const c = getTerrainVertex(gx + 1, gy + 1), d = getTerrainVertex(gx, gy + 1);
      const pa = projectTerrainVertex(a, frame, projectionVersion);
      const pb = projectTerrainVertex(b, frame, projectionVersion);
      const pc = projectTerrainVertex(c, frame, projectionVersion);
      const pd = projectTerrainVertex(d, frame, projectionVersion);
      if ((pa.x < -2 && pb.x < -2 && pc.x < -2 && pd.x < -2)
        || (pa.x > frame.width + 2 && pb.x > frame.width + 2 && pc.x > frame.width + 2 && pd.x > frame.width + 2)
        || (pa.y < -2 && pb.y < -2 && pc.y < -2 && pd.y < -2)
        || (pa.y > frame.height + 2 && pb.y > frame.height + 2 && pc.y > frame.height + 2 && pd.y > frame.height + 2)) continue;
      const key = a.key;
      let cell = cells.get(key);
      if (!cell) {
        const noise = hashNoise(gx, gy);
        // Keep only derived scalars here. Retaining vertex references would
        // defeat height-cache eviction as the train visits more of the route.
        cell = { toneA: getTerrainTone(a, b, c, noise), toneB: getTerrainTone(a, c, d, noise) };
        cells.set(key, cell);
      }
      if (cell.paletteVersion !== paletteVersion) {
        cell.colorA = getTerrainColor(red, green, blue, cell.toneA);
        cell.colorB = getTerrainColor(red, green, blue, cell.toneB);
        cell.paletteVersion = paletteVersion;
      }
      fillTerrainTriangle(pa, pb, pc, cell.colorA);
      fillTerrainTriangle(pa, pc, pd, cell.colorB);
    }
  }
  // FIFO eviction bounds memory on long runs; route replacement drops all caches.
  trimTerrainCaches();
  if (stationary) {
    if (!backdrop) {
      const bitmap = document.createElement("canvas");
      backdrop = { canvas: bitmap, context: bitmap.getContext("2d"), key: null };
    }
    if (backdrop.context) {
      if (backdrop.canvas.width !== canvas.width) backdrop.canvas.width = canvas.width;
      if (backdrop.canvas.height !== canvas.height) backdrop.canvas.height = canvas.height;
      backdrop.context.drawImage(canvas, 0, 0);
      backdrop.key = backdropKey;
      route.terrainBackdrop = backdrop;
    }
  }
}

function offsetRoutePoint(distance, offset = 0, lift = 0) {
  const point = evaluateRoute(distance);
  return { x: point.x - Math.sin(point.heading) * offset,
    y: point.y + Math.cos(point.heading) * offset,
    elevation: point.elevation + lift };
}

function strokeWorldLine(points, color, lineWidth, frame) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach((point, index) => {
    const screen = projectPoint(point, frame);
    if (index === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  });
  ctx.stroke();
}

function drawTrack(frame) {
  const { scale, startDistance, endDistance } = frame.view;
  const step = TUNING.visuals.trackSampleStep;
  const start = Math.max(-TRAIN_TOTAL_LENGTH - 60, Math.floor(startDistance / step) * step - (startDistance === 0 ? TRAIN_TOTAL_LENGTH + 60 : 0));
  const samples = [];
  for (let distance = start; distance < endDistance; distance += step) samples.push(distance);
  samples.push(endDistance);
  // Ground ribbons retain their projected width even on diagonal track.
  for (let index = 1; index < samples.length; index += 1) {
    const a = samples[index - 1], b = samples[index];
    const center = projectPoint(evaluateRoute(a), frame);
    if (!isVisible(center, frame, 80 * scale)) continue;
    for (const [halfWidth, color] of [[11, "#b6aa86"], [5, "#68695e"]]) {
      fillPolygon([offsetRoutePoint(a, -halfWidth), offsetRoutePoint(b, -halfWidth),
        offsetRoutePoint(b, halfWidth), offsetRoutePoint(a, halfWidth)].map((p) => projectPoint(p, frame)), color);
    }
    if (Math.round(a / step) % 2 === 0) {
      strokeWorldLine([offsetRoutePoint(a, -3.5, 0.2), offsetRoutePoint(a, 3.5, 0.2)], "#c4ab80", Math.max(1, scale * 1.6), frame);
    }
    for (const side of [-1, 1]) {
      strokeWorldLine([offsetRoutePoint(a, side * TRACK_WIDTH * 0.5, 0.45),
        offsetRoutePoint(b, side * TRACK_WIDTH * 0.5, 0.45)], "#d5e0dc", Math.max(1, scale * 0.65), frame);
    }
  }
}

function getSceneryPoint(item) {
  if (!item.worldPoint) {
    const point = offsetRoutePoint(item.distance, item.offset);
    point.elevation = getTerrainHeight(point.x, point.y);
    item.worldPoint = point;
  }
  return item.worldPoint;
}

// A box follows its own longitudinal slope. Faces are sorted by world depth,
// keeping the roof and the two visible sides consistent at every heading.
function drawIsoBox(center, length, width, height, heading, colors, frame, pitch = 0) {
  const fx = Math.cos(heading), fy = Math.sin(heading);
  const nx = -fy, ny = fx;
  const ground = [];
  for (const [along, across] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ground.push({ x: center.x + fx * along * length * 0.5 + nx * across * width * 0.5,
      y: center.y + fy * along * length * 0.5 + ny * across * width * 0.5,
      elevation: center.elevation + along * length * 0.5 * Math.tan(pitch) });
  }
  const bottom = ground.map((point) => projectPoint(point, frame));
  const top = ground.map((point) => projectPoint({ ...point, elevation: point.elevation + height }, frame));
  const faces = [];
  for (let index = 0; index < 4; index += 1) {
    const next = (index + 1) % 4;
    // Only outward faces toward the camera (positive world x/y) are visible.
    const dx = ground[next].x - ground[index].x;
    const dy = ground[next].y - ground[index].y;
    if (dy - dx <= 0) continue;
    faces.push({ depth: ground[index].x + ground[index].y + ground[next].x + ground[next].y,
      points: [bottom[index], bottom[next], top[next], top[index]],
      color: index % 2 === 0 ? colors[1] : colors[2] });
  }
  faces.sort((a, b) => a.depth - b.depth).forEach((face) => fillPolygon(face.points, face.color, "rgba(20,35,27,0.2)"));
  fillPolygon(top, colors[0], "rgba(255,255,255,0.3)");
}

function drawTree(point, size, frame, tint = 0) {
  const scale = frame.view.scale;
  const base = projectPoint(point, frame);
  ctx.fillStyle = "rgba(24,44,26,0.18)";
  ctx.beginPath();
  ctx.ellipse(base.x + size * scale * 0.7, base.y + size * scale * 0.25, size * scale, size * scale * 0.35, -0.3, 0, Math.PI * 2);
  ctx.fill();
  drawIsoBox(point, 2, 2, size * 1.1, 0, ["#8b7554", "#735c40", "#574835"], frame);
  for (let layer = 0; layer < 3; layer += 1) {
    const radius = size * (1 - layer * 0.2);
    const elevation = point.elevation + size * (0.6 + layer * 0.65);
    const a = projectPoint({ x: point.x - radius, y: point.y, elevation }, frame);
    const b = projectPoint({ x: point.x, y: point.y + radius, elevation }, frame);
    const c = projectPoint({ x: point.x + radius, y: point.y, elevation }, frame);
    const d = projectPoint({ x: point.x, y: point.y - radius, elevation }, frame);
    const top = projectPoint({ ...point, elevation: elevation + size * 1.5 }, frame);
    fillPolygon([a, d, top], tint > 0 ? "#5b8751" : "#4b794b");
    fillPolygon([a, b, top], tint > 0 ? "#436d40" : "#365f40");
    fillPolygon([b, c, top], tint > 0 ? "#315635" : "#284e37");
  }
}

function queueScenery(frame, queue) {
  for (const item of route.scenery) {
    const point = getSceneryPoint(item);
    if (!isVisible(projectPoint(point, frame), frame, 120)) continue;
    queue.push({ depth: point.x + point.y, sceneryBase: projectPoint(point, frame), draw: () => {
      const { size } = getSceneryBounds(item);
      if (["tree", "bush", "cactus", "stump"].includes(item.kind)) {
        drawTree(point, item.kind === "bush" || item.kind === "stump" ? size * 0.4 : size, frame, item.tint);
      } else if (item.kind === "pond") {
        const radius = size * 2;
        const points = Array.from({ length: 14 }, (_, index) => {
          const angle = index / 14 * Math.PI * 2;
          return projectPoint({ x: point.x + Math.cos(angle) * radius,
            y: point.y + Math.sin(angle) * radius * 0.65, elevation: point.elevation + 0.2 }, frame);
        });
        fillPolygon(points, "#61999a", "#a6bb9a");
      } else if (["rock", "ruins", "hayBale"].includes(item.kind)) {
        drawIsoBox(point, size * 1.5, size, size * 0.75, item.rotation,
          item.kind === "hayBale" ? ["#d6bd76", "#b69b54", "#988044"] : ["#a6aaa0", "#838c85", "#69776e"], frame);
      } else {
        drawIsoBox(point, size * 2.4, size * 1.7, size * 1.4, item.rotation,
          ["#9a6350", "#d1b38a", "#b59171"], frame);
        drawIsoBox({ ...point, elevation: point.elevation + size * 1.4 }, size * 2.7, size * 1.95, 1.6,
          item.rotation, ["#725346", "#5e473e", "#503f36"], frame);
      }
    } });
  }
}

function drawGroundZone(start, end, halfWidth, color, frame) {
  const points = [];
  for (let d = start; d < end; d += 10) points.push(offsetRoutePoint(d, -halfWidth, 0.7));
  points.push(offsetRoutePoint(end, -halfWidth, 0.7));
  for (let d = end; d > start; d -= 10) points.push(offsetRoutePoint(d, halfWidth, 0.7));
  points.push(offsetRoutePoint(start, halfWidth, 0.7));
  fillPolygon(points.map((p) => projectPoint(p, frame)), color);
}

function queueRouteMarkers(frame, queue) {
  for (let index = 0; index < route.stations.length; index += 1) {
    const station = route.stations[index];
    const metrics = getStationStopMetrics(station);
    const point = evaluateRoute(station.distance);
    if (!isVisible(projectPoint(point, frame), frame, metrics.zoneLength * frame.view.scale)) continue;
    const active = index === state.stationIndex;
    drawGroundZone(metrics.targetDistance - metrics.tolerance, metrics.targetDistance + metrics.tolerance,
      7, active ? "rgba(113,245,171,0.36)" : "rgba(113,245,171,0.15)", frame);
    strokeWorldLine([offsetRoutePoint(metrics.targetDistance, -10, 0.8),
      offsetRoutePoint(metrics.targetDistance, 10, 0.8)], "#e1ffbc", 2, frame);
    const visual = station.visual || { buildingSide: 1, buildingColor: "#c7b28b", roofColor: "#6c6251" };
    for (const side of [-1, 1]) {
      const platform = offsetRoutePoint(station.distance, side * 13);
      queue.push({ depth: platform.x + platform.y, draw: () => {
        drawIsoBox(platform, metrics.zoneLength, 10, 2, point.heading,
          [active ? "#dae0c8" : "#bbc6b2", "#8b998a", "#6e8075"], frame);
        strokeWorldLine([offsetRoutePoint(station.distance - metrics.zoneLength * 0.5, side * 8.5, 2.1),
          offsetRoutePoint(station.distance + metrics.zoneLength * 0.5, side * 8.5, 2.1)], "#f2d87e", 2, frame);
      } });
    }
    const building = offsetRoutePoint(station.distance - 25, visual.buildingSide * 36);
    queue.push({ depth: building.x + building.y, draw: () => {
      drawIsoBox(building, 34, 20, 14, point.heading,
        [visual.roofColor, visual.buildingColor, "#aa9275"], frame);
      drawIsoBox({ ...building, elevation: building.elevation + 14 }, 39, 25, 3, point.heading,
        [visual.roofColor, "#665b4c", "#514d43"], frame);
    } });
    frame.labels.push({ point: { ...building, elevation: building.elevation + 25 }, text: station.name,
      color: active ? "#dcffbd" : "#edf3e1" });
  }
  for (const segment of route.segments) {
    if (segment.speedLimit == null) continue;
    const point = offsetRoutePoint(segment.start + 12, -18);
    queueSign(point, `${toKph(segment.speedLimit)}`, "#ffd786", frame, queue);
  }
  for (const signal of route.signals) {
    const point = offsetRoutePoint(signal.distance, signal.side * (TRACK_WIDTH * 0.8 + TUNING.signals.sideOffset));
    if (!isVisible(projectPoint(point, frame), frame, 60)) continue;
    const aspect = getSignalAspect(signal);
    const color = aspect === "red" ? "#ff6a62" : aspect === "yellow" ? "#ffd85f" : "#7dff8e";
    queue.push({ depth: point.x + point.y, draw: () => {
      const base = projectPoint(point, frame);
      const top = projectPoint({ ...point, elevation: point.elevation + 20 }, frame);
      ctx.strokeStyle = "#e1e2cd";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
      ctx.fillStyle = "#263c34";
      ctx.beginPath(); ctx.roundRect(top.x - 7, top.y - 10, 14, 21, 5); ctx.fill();
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(top.x, top.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    } });
    if (signal.kind === "yellow") frame.labels.push({ point: { ...point, elevation: point.elevation + 35 }, text: `${toKph(signal.speedLimit)} km/h`, color });
    if (signal.kind === "red" && aspect === "red") {
      const stop = getRedStopMetrics(signal);
      drawGroundZone(stop.zoneStart, stop.zoneEnd, 7, "rgba(255,106,98,0.28)", frame);
      const gap = signal.distance - state.distance;
      if (gap >= 0 && gap <= TUNING.signals.redCountdownDisplayDistance) {
        frame.labels.push({ point: { ...point, elevation: point.elevation + 35 },
          text: `Stop · ${Math.max(0, signal.clearAfter - signal.waitTimer).toFixed(1)}s`, color });
      }
    }
  }
}

function queueSign(point, text, color, frame, queue) {
  if (!isVisible(projectPoint(point, frame), frame, 60)) return;
  queue.push({ depth: point.x + point.y, draw: () => {
    const base = projectPoint(point, frame);
    const top = projectPoint({ ...point, elevation: point.elevation + 15 }, frame);
    ctx.strokeStyle = "#dddeca"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(top.x - 13, top.y - 10, 26, 19, 4); ctx.fill();
    ctx.fillStyle = "#303b2e"; ctx.font = "700 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(text, top.x, top.y + 3);
  } });
}

function queueTrain(frame, queue) {
  for (let index = 0; index < frame.renderedUnits.length; index += 1) {
    const unit = frame.renderedUnits[index];
    const point = { x: unit.renderX, y: unit.renderY, elevation: unit.renderElevation + 1 };
    const pitch = unit.renderPitch;
    queue.push({ depth: point.x + point.y, draw: () => {
      const warning = (state.overspeedTimer > 0.2 || state.derailment) && unit.type === "locomotive";
      const body = warning ? "#ff9b6d" : unit.bodyColor;
      drawIsoBox({ ...point, elevation: point.elevation - 0.6 }, unit.length * 0.86,
        unit.width + 1.8, 1, unit.renderHeading, ["#3d4d47", "#293b34", "#1e302a"], frame, pitch);
      drawIsoBox(point, unit.length, unit.width + 1, 4.6, unit.renderHeading,
        [unit.roofColor, body, body], frame, pitch);
      if (unit.type !== "locomotive") {
        const fx = Math.cos(unit.renderHeading), fy = Math.sin(unit.renderHeading);
        for (const side of [-1, 1]) {
          const nx = -fy * side, ny = fx * side;
          if (nx + ny < 0) continue;
          for (let index = 0; index < 5; index += 1) {
            const along = (index / 4 - 0.5) * unit.length * 0.7;
            const corners = [[-1.6, 2.1], [1.6, 2.1], [1.6, 3.7], [-1.6, 3.7]].map(([offset, lift]) => ({
              x: point.x + fx * (along + offset) + nx * (unit.width + 1) * 0.505,
              y: point.y + fy * (along + offset) + ny * (unit.width + 1) * 0.505,
              elevation: point.elevation + (along + offset) * Math.tan(pitch) + lift,
            }));
            fillPolygon(corners.map((corner) => projectPoint(corner, frame)), "#3e5e63");
          }
        }
      }
      const roof = { ...point, elevation: point.elevation + 4.6 };
      if (unit.type === "locomotive") {
        const cab = { x: roof.x + Math.cos(unit.renderHeading) * unit.length * 0.2,
          y: roof.y + Math.sin(unit.renderHeading) * unit.length * 0.2,
          elevation: roof.elevation + Math.tan(pitch) * unit.length * 0.2 };
        drawIsoBox(cab, unit.length * 0.28, unit.width * 0.9, 2.4, unit.renderHeading,
          ["#d3ddd1", "#476878", "#36545d"], frame, pitch);
        const lamp = projectPoint({ x: unit.frontX, y: unit.frontY, elevation: unit.frontElevation + 3 }, frame);
        ctx.fillStyle = "#fff1a5"; ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 2.5, 0, Math.PI * 2); ctx.fill();
      } else {
        drawIsoBox(roof, unit.length * 0.84, unit.width * 0.72, 0.65, unit.renderHeading,
          [unit.roofColor, "#748680", "#536963"], frame, pitch);
      }
    } });
    const next = frame.renderedUnits[index + 1];
    if (next) strokeWorldLine([{ x: unit.rearX, y: unit.rearY, elevation: unit.rearElevation + 1.5 },
      { x: next.frontX, y: next.frontY, elevation: next.frontElevation + 1.5 }], "#33463e", Math.max(1, frame.view.scale), frame);
  }
}

function drawWorld(frame) {
  drawTerrainBackground(frame);
  drawTrack(frame);
  const queue = [];
  queueRouteMarkers(frame, queue);
  queueScenery(frame, queue);
  queueTrain(frame, queue);
  const trainScreens = frame.renderedUnits.map((unit) => projectPoint({
    x: unit.renderX, y: unit.renderY, elevation: unit.renderElevation }, frame));
  const trainBounds = { left: Math.min(...trainScreens.map((p) => p.x)) - 25,
    right: Math.max(...trainScreens.map((p) => p.x)) + 25,
    top: Math.min(...trainScreens.map((p) => p.y)) - 20,
    bottom: Math.max(...trainScreens.map((p) => p.y)) + 20 };
  queue.sort((a, b) => a.depth - b.depth).forEach((entry) => {
    ctx.save();
    if (entry.sceneryBase && entry.sceneryBase.x > trainBounds.left && entry.sceneryBase.x < trainBounds.right
      && entry.sceneryBase.y > trainBounds.top && entry.sceneryBase.y - 100 < trainBounds.bottom) ctx.globalAlpha = 0.35;
    entry.draw();
    ctx.restore();
  });
  for (const puff of state.exhaustPuffs) {
    const progress = puff.age / puff.life;
    const point = projectPoint({ x: puff.x, y: puff.y,
      elevation: puff.elevation + 8 + progress * 15 }, frame);
    ctx.fillStyle = `rgba(48,58,52,${Math.max(0, (1 - progress) * puff.opacity)})`;
    ctx.beginPath(); ctx.arc(point.x, point.y, (puff.radius + puff.growth * progress) * frame.view.scale, 0, Math.PI * 2); ctx.fill();
  }
  // Labels stay readable above scenery and never rotate with the world.
  ctx.font = "600 12px sans-serif"; ctx.textAlign = "center";
  for (const label of frame.labels) {
    const point = projectPoint(label.point, frame);
    if (!isVisible(point, frame)) continue;
    const width = ctx.measureText(label.text).width + 16;
    ctx.fillStyle = "rgba(19,39,32,0.83)"; ctx.beginPath();
    ctx.roundRect(point.x - width * 0.5, point.y - 16, width, 24, 6); ctx.fill();
    ctx.fillStyle = label.color; ctx.fillText(label.text, point.x, point.y);
  }
}

function drawHudOverlay(width, height) {
  const compactHud = width <= 820;
  drawRoutePredictor(width, height, compactHud);
}

function createRenderFrameContext(width, height) {
  const trainPose = evaluateRoute(state.distance);
  return {
    width,
    height,
    labels: [],
    trainPose,
    view: getViewMetrics(width, height, trainPose),
    renderedUnits: getRenderedTrainUnits(),
    biomeBlend: getBiomeBlendAtDistance(state.distance),
  };
}

function drawRoutePredictor(width, height, compactHud = false) {
  const upcomingEntries = getUpcomingRouteEntries();
  const baseWidth = compactHud ? 214 : TUNING.visuals.routePredictorWidth;
  const baseHeight = compactHud ? 120 : TUNING.visuals.routePredictorHeight;
  const panelWidth = Math.min(baseWidth, width - 24);
  const panelHeight = Math.min(baseHeight, height - 24);
  const panelX = 12;
  const panelY = 12;
  const distColumnX = panelX + (compactHud ? 14 : 18);
  const markerColumnX = panelX + (compactHud ? 22 : 28);
  const distanceValueX = panelX + (compactHud ? 34 : 42);
  const typeColumnX = panelX + (compactHud ? 72 : 118);
  const actionColumnX = panelX + (compactHud ? 146 : 252);
  const titleY = panelY + (compactHud ? 21 : 28);
  const headerY = panelY + (compactHud ? 37 : 52);
  const rowStartY = panelY + (compactHud ? 54 : 80);
  const rowStep = compactHud ? 14 : 22;
  const radius = compactHud ? 16 : 22;
  const titleFont = compactHud ? "700 12px Inter, sans-serif" : "700 16px Inter, sans-serif";
  const emptyFont = compactHud ? "600 11px Inter, sans-serif" : "600 14px Inter, sans-serif";
  const headerFont = compactHud ? "600 8px Inter, sans-serif" : "600 11px Inter, sans-serif";
  const rowFont = compactHud ? "700 9px Inter, sans-serif" : "700 15px Inter, sans-serif";

  ctx.save();
  ctx.fillStyle = compactHud ? "rgba(6, 16, 28, 0.42)" : "rgba(6, 16, 28, 0.58)";
  ctx.strokeStyle = "rgba(170, 222, 255, 0.16)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelWidth, panelHeight, radius);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#dff2ff";
  ctx.font = titleFont;
  ctx.textAlign = "left";
  ctx.fillText("Route ahead", panelX + (compactHud ? 14 : 18), titleY);

  if (upcomingEntries.length === 0) {
    ctx.fillStyle = "rgba(223, 242, 255, 0.62)";
    ctx.font = emptyFont;
    ctx.fillText(`No curve or signal in the next ${roundDisplayDistance(TUNING.route.upcomingCurveLookahead)} m`, panelX + (compactHud ? 14 : 18), panelY + (compactHud ? 49 : 62));
    ctx.restore();
    return;
  }

  ctx.fillStyle = "rgba(223, 242, 255, 0.46)";
  ctx.font = headerFont;
  ctx.fillText("DIST", distColumnX, headerY);
  ctx.fillText("TYPE", typeColumnX, headerY);
  ctx.fillText("ACTION", actionColumnX, headerY);

  ctx.font = rowFont;
  upcomingEntries.forEach((entry, index) => {
    const rowY = rowStartY + index * rowStep;
    const color = entry.type === "curve"
      ? "#ffbf52"
      : entry.aspect === "red"
        ? "#ff6a62"
        : entry.aspect === "yellow"
          ? "#ffd85f"
          : "#7dff8e";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(markerColumnX, rowY - 5, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(223, 242, 255, 0.78)";
    ctx.fillText(`${Math.round(entry.distance)} m`, distanceValueX, rowY);

    const typeLabel = entry.type === "curve"
      ? `${entry.direction} curve`
      : `${entry.aspect.toUpperCase()} signal`;
    ctx.fillText(typeLabel, typeColumnX, rowY);

    const actionLabel = entry.type === "curve"
      ? `${entry.limitKph} km/h`
      : entry.aspect === "yellow"
        ? `${entry.limitKph} km/h`
        : entry.aspect === "red"
          ? "Stop"
          : "Proceed";
    ctx.fillText(actionLabel, actionColumnX, rowY);
  });

  ctx.restore();
}

function drawSpeedEffects(width, height) {
  const speedFactor = clamp(state.speed / MAX_LINE_SPEED, 0, TUNING.visuals.speedEffectMaxFactor);
  if (speedFactor < TUNING.visuals.speedEffectThreshold) {
    return;
  }

  const boostedSpeedFactor = Math.pow(speedFactor, 0.7);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(120, 215, 255, ${0.04 + boostedSpeedFactor * 0.08})`;
  ctx.lineWidth = TUNING.visuals.speedEffectLineWidthBase
    + boostedSpeedFactor * TUNING.visuals.speedEffectLineWidthBySpeed;
  const bandTop = height * TUNING.visuals.speedEffectBandTop;
  for (let index = 0; index < TUNING.visuals.speedEffectCount; index += 1) {
    const offset = ((state.distance * TUNING.visuals.speedEffectTravel)
      + index * TUNING.visuals.speedEffectSpacing) % (width + 120) - 60;
    const streakLength = TUNING.visuals.speedEffectBaseLength
      + boostedSpeedFactor * TUNING.visuals.speedEffectLengthBySpeed;
    const laneY = bandTop + index * TUNING.visuals.speedEffectBandStep + Math.sin(state.distance * 0.018 + index) * 5;
    ctx.beginPath();
    ctx.moveTo(offset, laneY);
    ctx.lineTo(offset + streakLength, laneY - streakLength * (0.08 + boostedSpeedFactor * 0.04));
    ctx.moveTo(width - offset, laneY + 6);
    ctx.lineTo(width - offset - streakLength * 0.82, laneY + 6 - streakLength * (0.06 + boostedSpeedFactor * 0.035));
    ctx.stroke();
  }
  ctx.restore();
}

function drawElevationReadout(frame) {
  const { width, trainPose } = frame;
  const elevation = trainPose.elevation.toFixed(0);
  const grade = (trainPose.grade * 100).toFixed(1);
  if (width <= 820) {
    ctx.save();
    ctx.font = "600 10px sans-serif";
    ctx.textAlign = "right";
    const lines = [`Elevation ${elevation} m`, `Grade ${grade}%`];
    const panelWidth = Math.ceil(Math.max(...lines.map(line => ctx.measureText(line).width))) + 20;
    const panelX = width - panelWidth - 12;
    // Share the top row when there is room beside the compact route predictor.
    const panelY = panelX >= 234 ? 12 : 142;
    ctx.fillStyle = "rgba(18,36,29,0.8)";
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelWidth, 40, 8);
    ctx.fill();
    ctx.fillStyle = "#edf3df";
    lines.forEach((line, index) => ctx.fillText(line, width - 22, panelY + 16 + index * 14));
    ctx.restore();
    return;
  }
  ctx.font = "600 11px sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(18,36,29,0.8)";
  ctx.fillRect(width - 210, 12, 198, 28);
  ctx.fillStyle = "#edf3df";
  ctx.fillText(`Elevation ${elevation} m · ${grade}% grade`, width - 22, 30);
}

function render() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const frame = createRenderFrameContext(width, height);

  drawWorld(frame);
  drawSpeedEffects(width, height);
  drawHudOverlay(width, height);
  drawElevationReadout(frame);
}

