function drawBackground(frame) {
  const { width, height, view, biomeBlend } = frame;
  const { camera, scale, anchorY } = view;
  const speedFactor = state ? clamp(state.speed / MAX_LINE_SPEED, 0, TUNING.visuals.backgroundSpeedMaxFactor) : 0;
  const boostedSpeedFactor = Math.pow(speedFactor, 0.72);
  const terrainCornerStyle = getTerrainCornerStyle(0, 0, biomeBlend);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#a6c57d");
  gradient.addColorStop(0.36, "#88aa68");
  gradient.addColorStop(0.68, "#ccb57e");
  gradient.addColorStop(1, "#769760");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const cellSize = TUNING.visuals.terrainCellSize;
  const leftWorld = camera.x - width * 0.5 / scale;
  const rightWorld = camera.x + width * 0.5 / scale;
  const topWorld = camera.y - anchorY / scale;
  const bottomWorld = camera.y + (height - anchorY) / scale;
  const startWorldX = Math.floor((leftWorld - cellSize) / cellSize) * cellSize;
  const endWorldX = Math.ceil((rightWorld + cellSize) / cellSize) * cellSize;
  const startWorldY = Math.floor((topWorld - cellSize) / cellSize) * cellSize;
  const endWorldY = Math.ceil((bottomWorld + cellSize) / cellSize) * cellSize;

  for (let worldY = startWorldY; worldY <= endWorldY; worldY += cellSize) {
    for (let worldX = startWorldX; worldX <= endWorldX; worldX += cellSize) {
      const cellGridX = Math.floor(worldX / cellSize);
      const cellGridY = Math.floor(worldY / cellSize);
      const tileKey = `${cellGridX},${cellGridY}`;
      let tileStyle = route.terrainTileCache.get(tileKey);
      if (!tileStyle) {
        tileStyle = createTerrainTileStyle(cellGridX, cellGridY);
        route.terrainTileCache.set(tileKey, tileStyle);
      }

      const topLeft = terrainCornerStyle;
      const topRight = terrainCornerStyle;
      const bottomLeft = terrainCornerStyle;
      const bottomRight = terrainCornerStyle;

      const topEdgeBase = mixPaletteColor(topLeft.baseColor, topRight.baseColor, 0.5);
      const bottomEdgeBase = mixPaletteColor(bottomLeft.baseColor, bottomRight.baseColor, 0.5);
      const topEdgeAlt = mixPaletteColor(topLeft.altColor, topRight.altColor, 0.5);
      const bottomEdgeAlt = mixPaletteColor(bottomLeft.altColor, bottomRight.altColor, 0.5);
      const topEdgeDetail = mixPaletteColor(topLeft.detailColor, topRight.detailColor, 0.5);
      const bottomEdgeDetail = mixPaletteColor(bottomLeft.detailColor, bottomRight.detailColor, 0.5);

      let topColor = topEdgeBase;
      let bottomColor = bottomEdgeBase;
      if (tileStyle.biomeSeed > 0.72) {
        topColor = tileStyle.toneSeed > 0.5
          ? mixPaletteColor(topEdgeBase, topEdgeAlt, 0.55)
          : topEdgeAlt;
        bottomColor = tileStyle.toneSeed > 0.5
          ? mixPaletteColor(bottomEdgeBase, bottomEdgeAlt, 0.55)
          : bottomEdgeAlt;
      } else if (tileStyle.biomeSeed > 0.44) {
        topColor = tileStyle.toneSeed > 0.5
          ? mixPaletteColor(topEdgeAlt, topEdgeDetail, 0.35)
          : topEdgeAlt;
        bottomColor = tileStyle.toneSeed > 0.5
          ? mixPaletteColor(bottomEdgeAlt, bottomEdgeDetail, 0.35)
          : bottomEdgeAlt;
      } else {
        topColor = tileStyle.toneSeed > 0.45
          ? mixPaletteColor(topEdgeBase, topEdgeDetail, 0.25)
          : topEdgeBase;
        bottomColor = tileStyle.toneSeed > 0.45
          ? mixPaletteColor(bottomEdgeBase, bottomEdgeDetail, 0.25)
          : bottomEdgeBase;
      }
      const screenX = width * 0.5 + (worldX - camera.x) * scale;
      const screenY = anchorY + (worldY - camera.y) * scale;
      const pixelSize = cellSize * scale;
      const tileGradient = ctx.createLinearGradient(0, screenY, 0, screenY + pixelSize);
      tileGradient.addColorStop(0, paletteColorToCss(topColor));
      tileGradient.addColorStop(1, paletteColorToCss(bottomColor));
      ctx.fillStyle = tileGradient;
      ctx.fillRect(screenX, screenY, pixelSize + 1, pixelSize + 1);

      const tuftSize = (6 + hashNoise(cellGridX + 14, cellGridY + 3) * 16) * scale;
      const detailColor = mixPaletteColor(topEdgeDetail, bottomEdgeDetail, 0.5);
      ctx.fillStyle = paletteColorToCss(detailColor);
      ctx.beginPath();
      ctx.ellipse(
        screenX + hashNoise(cellGridX + 2, cellGridY + 5) * pixelSize,
        screenY + hashNoise(cellGridX + 8, cellGridY + 11) * pixelSize,
        tuftSize,
        tuftSize * 0.6,
        hashNoise(cellGridX + 12, cellGridY + 15) * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      const riverMix = lerp(topLeft.riverMix, bottomRight.riverMix, 0.5);
      if (riverMix > 0) {
        const waterMix = riverMix;
        const ribbon = Math.sin((worldY + worldX * 0.25) * 0.008) * cellSize * 0.36;
        const riverCenter = screenX + pixelSize * 0.5 + ribbon * scale;
        ctx.fillStyle = `rgba(84, 154, 194, ${(0.08 + waterMix * 0.14).toFixed(3)})`;
        ctx.fillRect(riverCenter - pixelSize * 0.18, screenY - 1, pixelSize * 0.36, pixelSize + 2);
      }
    }
  }

  if (speedFactor > TUNING.visuals.backgroundStreakThreshold) {
    ctx.save();
    ctx.strokeStyle = `rgba(190, 225, 255, ${0.04 + boostedSpeedFactor * 0.07})`;
    ctx.lineWidth = 0.9 + boostedSpeedFactor * 0.45;
    for (let index = 0; index < TUNING.visuals.backgroundStreakCount; index += 1) {
      const phase = index % 2 === 0 ? 1 : -1;
      const verticalOffset = Math.sin(state.distance * 0.012 + index * 0.9) * 10;
      const laneY = ((index * TUNING.visuals.backgroundStreakSpacing)
        + state.distance * TUNING.visuals.backgroundStreakTravel
        + verticalOffset) % (height + 120) - 60;
      const streakLength = TUNING.visuals.backgroundStreakBaseLength
        + boostedSpeedFactor * TUNING.visuals.backgroundStreakLengthBySpeed;
      const inset = 18 + index * 1.6;
      ctx.beginPath();
      ctx.moveTo(inset, laneY);
      ctx.lineTo(inset + streakLength, laneY - streakLength * (0.18 + boostedSpeedFactor * 0.08) * phase);
      ctx.moveTo(width - inset, laneY + 10);
      ctx.lineTo(width - inset - streakLength, laneY + 10 - streakLength * (0.18 + boostedSpeedFactor * 0.08) * phase);
      ctx.stroke();
    }
    ctx.restore();
  }

  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.58,
    Math.min(width, height) * 0.2,
    width * 0.5,
    height * 0.58,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(3, 8, 14, 0.34)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function getSceneryPoint(item) {
  if (!item.worldPoint) {
    const point = evaluateRoute(item.distance);
    const normalX = -Math.sin(point.heading);
    const normalY = Math.cos(point.heading);
    item.worldPoint = {
      x: point.x + normalX * item.offset,
      y: point.y + normalY * item.offset,
    };
  }

  return item.worldPoint;
}

function drawScenery(view, width, height) {
  const { camera, scale } = view;
  const startDistance = view.startDistance - 60;
  const endDistance = view.endDistance + 60;
  const sceneryStartIndex = findFirstSortedIndex(route.scenery, startDistance);

  for (let index = sceneryStartIndex; index < route.scenery.length; index += 1) {
    const item = route.scenery[index];
    if (item.distance > endDistance) {
      break;
    }

    const point = getSceneryPoint(item);
    const screen = worldToScreen(point, camera, scale, width, view.anchorY);

    if (screen.y < -80 || screen.y > height + 80 || screen.x < -80 || screen.x > width + 80) {
      continue;
    }

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(item.rotation);

    if (item.kind === "tree") {
      const canopy = Math.max(10, scale * 10 * item.size);
      const trunkHeight = Math.max(7, scale * 7 * item.size);
      ctx.fillStyle = "rgba(15, 24, 32, 0.18)";
      ctx.beginPath();
      ctx.ellipse(0, canopy * 0.5, canopy * 0.9, canopy * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#5b4234";
      ctx.fillRect(-canopy * 0.12, canopy * 0.1, canopy * 0.24, trunkHeight);
      ctx.fillStyle = item.tint > 0 ? "#3c8054" : "#2f6f49";
      ctx.beginPath();
      ctx.arc(0, 0, canopy, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-canopy * 0.62, canopy * 0.1, canopy * 0.7, 0, Math.PI * 2);
      ctx.arc(canopy * 0.62, canopy * 0.12, canopy * 0.66, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === "bush") {
      const bush = Math.max(8, scale * 7.5 * item.size);
      ctx.fillStyle = item.tint > 0 ? "#4f8a52" : "#427446";
      ctx.beginPath();
      ctx.arc(-bush * 0.5, 0, bush * 0.72, 0, Math.PI * 2);
      ctx.arc(bush * 0.45, 0, bush * 0.78, 0, Math.PI * 2);
      ctx.arc(0, -bush * 0.18, bush * 0.86, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === "rock") {
      const rock = Math.max(9, scale * 7 * item.size);
      ctx.fillStyle = "#758392";
      ctx.beginPath();
      ctx.moveTo(-rock, rock * 0.4);
      ctx.lineTo(-rock * 0.45, -rock * 0.8);
      ctx.lineTo(rock * 0.7, -rock * 0.55);
      ctx.lineTo(rock, rock * 0.2);
      ctx.lineTo(rock * 0.16, rock);
      ctx.closePath();
      ctx.fill();
    } else if (item.kind === "hut") {
      const hutWidth = Math.max(13, scale * 12 * item.size);
      const hutHeight = Math.max(11, scale * 10 * item.size);
      ctx.fillStyle = "#c6935f";
      ctx.fillRect(-hutWidth / 2, -hutHeight / 2, hutWidth, hutHeight);
      ctx.fillStyle = "#71492f";
      ctx.beginPath();
      ctx.moveTo(-hutWidth * 0.62, -hutHeight / 2);
      ctx.lineTo(0, -hutHeight * 1.02);
      ctx.lineTo(hutWidth * 0.62, -hutHeight / 2);
      ctx.closePath();
      ctx.fill();
    } else if (item.kind === "barn") {
      const barnWidth = Math.max(18, scale * 18 * item.size);
      const barnHeight = Math.max(14, scale * 12 * item.size);
      ctx.fillStyle = "#b34f43";
      ctx.fillRect(-barnWidth / 2, -barnHeight / 2, barnWidth, barnHeight);
      ctx.fillStyle = "#7c2c24";
      ctx.beginPath();
      ctx.moveTo(-barnWidth * 0.58, -barnHeight / 2);
      ctx.lineTo(0, -barnHeight * 1.08);
      ctx.lineTo(barnWidth * 0.58, -barnHeight / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f0d9b0";
      ctx.fillRect(-barnWidth * 0.12, -barnHeight * 0.05, barnWidth * 0.24, barnHeight * 0.55);
    } else if (item.kind === "billboard") {
      const boardWidth = Math.max(16, scale * 18 * item.size);
      const boardHeight = Math.max(10, scale * 9 * item.size);
      ctx.fillStyle = "#3a2e27";
      ctx.fillRect(-boardWidth * 0.35, boardHeight * 0.05, boardWidth * 0.08, boardHeight * 0.9);
      ctx.fillRect(boardWidth * 0.27, boardHeight * 0.05, boardWidth * 0.08, boardHeight * 0.9);
      ctx.fillStyle = item.tint > 0 ? "#ffe28a" : "#9ad7ff";
      ctx.fillRect(-boardWidth / 2, -boardHeight / 2, boardWidth, boardHeight);
      ctx.fillStyle = "rgba(25, 40, 56, 0.75)";
      ctx.fillRect(-boardWidth * 0.34, -boardHeight * 0.18, boardWidth * 0.68, boardHeight * 0.18);
    } else if (item.kind === "pond") {
      const pondWidth = Math.max(18, scale * 20 * item.size);
      const pondHeight = Math.max(12, scale * 12 * item.size);
      ctx.fillStyle = "rgba(35, 98, 140, 0.24)";
      ctx.beginPath();
      ctx.ellipse(0, 0, pondWidth * 0.9, pondHeight * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(92, 177, 221, 0.72)";
      ctx.beginPath();
      ctx.ellipse(0, 0, pondWidth * 0.72, pondHeight * 0.64, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === "ruins") {
      const ruinWidth = Math.max(14, scale * 14 * item.size);
      const ruinHeight = Math.max(10, scale * 9 * item.size);
      ctx.fillStyle = "#8a7a6a";
      ctx.fillRect(-ruinWidth / 2, -ruinHeight / 2, ruinWidth, ruinHeight);
      ctx.clearRect(-ruinWidth * 0.14, -ruinHeight * 0.1, ruinWidth * 0.28, ruinHeight * 0.42);
      ctx.fillStyle = "#6b5c4f";
      ctx.fillRect(-ruinWidth * 0.54, -ruinHeight * 0.54, ruinWidth * 0.18, ruinHeight * 1.02);
      ctx.fillRect(ruinWidth * 0.28, -ruinHeight * 0.42, ruinWidth * 0.16, ruinHeight * 0.9);
    } else if (item.kind === "cactus") {
      const cactusHeight = Math.max(16, scale * 16 * item.size);
      const cactusWidth = Math.max(5, scale * 4 * item.size);
      ctx.fillStyle = "#3c7d4f";
      ctx.fillRect(-cactusWidth / 2, -cactusHeight / 2, cactusWidth, cactusHeight);
      ctx.fillRect(-cactusWidth * 1.35, -cactusHeight * 0.12, cactusWidth * 0.9, cactusHeight * 0.42);
      ctx.fillRect(cactusWidth * 0.45, -cactusHeight * 0.02, cactusWidth * 0.9, cactusHeight * 0.34);
    } else if (item.kind === "stump") {
      const stumpWidth = Math.max(7, scale * 6 * item.size);
      const stumpHeight = Math.max(5, scale * 4.5 * item.size);
      ctx.fillStyle = "#7b5a3d";
      ctx.beginPath();
      ctx.ellipse(0, 0, stumpWidth, stumpHeight, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(220, 190, 142, 0.55)";
      ctx.beginPath();
      ctx.ellipse(0, -stumpHeight * 0.1, stumpWidth * 0.58, stumpHeight * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === "hayBale") {
      const baleWidth = Math.max(10, scale * 10 * item.size);
      const baleHeight = Math.max(7, scale * 7 * item.size);
      ctx.fillStyle = "#d7b55a";
      ctx.beginPath();
      ctx.roundRect(-baleWidth / 2, -baleHeight / 2, baleWidth, baleHeight, baleHeight * 0.35);
      ctx.fill();
      ctx.strokeStyle = "rgba(132, 99, 43, 0.65)";
      ctx.lineWidth = Math.max(1, scale * 0.55);
      ctx.beginPath();
      ctx.moveTo(-baleWidth * 0.16, -baleHeight * 0.4);
      ctx.lineTo(-baleWidth * 0.16, baleHeight * 0.4);
      ctx.moveTo(baleWidth * 0.18, -baleHeight * 0.4);
      ctx.lineTo(baleWidth * 0.18, baleHeight * 0.4);
      ctx.stroke();
    } else if (item.kind === "silo") {
      const siloWidth = Math.max(10, scale * 10 * item.size);
      const siloHeight = Math.max(18, scale * 17 * item.size);
      ctx.fillStyle = "#aab4bc";
      ctx.fillRect(-siloWidth / 2, -siloHeight / 2, siloWidth, siloHeight);
      ctx.fillStyle = "#7f8a95";
      ctx.beginPath();
      ctx.ellipse(0, -siloHeight / 2, siloWidth * 0.5, siloWidth * 0.36, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === "windmill") {
      const mastHeight = Math.max(18, scale * 18 * item.size);
      const bladeLength = Math.max(9, scale * 8 * item.size);
      ctx.strokeStyle = "#c6d3db";
      ctx.lineWidth = Math.max(1.2, scale * 0.8);
      ctx.beginPath();
      ctx.moveTo(0, mastHeight * 0.5);
      ctx.lineTo(0, -mastHeight * 0.5);
      ctx.stroke();
      ctx.translate(0, -mastHeight * 0.48);
      ctx.rotate(item.rotation * 2.4);
      for (let bladeIndex = 0; bladeIndex < 4; bladeIndex += 1) {
        ctx.rotate(Math.PI * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(bladeLength, 0);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

function drawTrack(frame) {
  const { width, height, view } = frame;
  const { camera, scale, startDistance, endDistance } = view;

  drawScenery(view, width, height);

  const centerPoints = [];
  const leftRail = [];
  const rightRail = [];
  const sampleStep = TUNING.visuals.trackSampleStep;
  const sampleStart = Math.max(0, Math.floor(startDistance / sampleStep) * sampleStep);
  const sleeperWorldStep = sampleStep * TUNING.visuals.sleeperStep;
  const sleeperStart = Math.max(0, Math.floor(startDistance / sleeperWorldStep) * sleeperWorldStep);

  for (let sample = sampleStart; sample <= endDistance; sample += sampleStep) {
    const point = evaluateRoute(sample);
    const normalX = -Math.sin(point.heading);
    const normalY = Math.cos(point.heading);
    centerPoints.push(worldToScreen(point, camera, scale, width, view.anchorY));
    leftRail.push(
      worldToScreen(
        {
          x: point.x + normalX * TRACK_WIDTH * 0.5,
          y: point.y + normalY * TRACK_WIDTH * 0.5,
        },
        camera,
        scale,
        width,
        view.anchorY,
      ),
    );
    rightRail.push(
      worldToScreen(
        {
          x: point.x - normalX * TRACK_WIDTH * 0.5,
          y: point.y - normalY * TRACK_WIDTH * 0.5,
        },
        camera,
        scale,
        width,
        view.anchorY,
      ),
    );
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "rgba(194, 176, 132, 0.46)";
  ctx.lineWidth = Math.max(
    TUNING.visuals.terrainClearWidthMin,
    TRACK_WIDTH * scale * TUNING.visuals.terrainClearWidthScale,
  );
  ctx.beginPath();
  centerPoints.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  ctx.strokeStyle = "rgba(17, 23, 31, 0.9)";
  ctx.lineWidth = Math.max(
    TUNING.visuals.trackBedWidthMin,
    TRACK_WIDTH * scale * TUNING.visuals.trackBedWidthScale,
  );
  ctx.beginPath();
  centerPoints.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  ctx.strokeStyle = "#9bb4c6";
  ctx.lineWidth = Math.max(
    TUNING.visuals.railWidthMin,
    TRACK_WIDTH * scale * TUNING.visuals.railWidthScale,
  );
  [leftRail, rightRail].forEach((rail) => {
    ctx.beginPath();
    rail.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
  });

  ctx.strokeStyle = "rgba(224, 191, 125, 0.35)";
  ctx.lineWidth = Math.max(
    TUNING.visuals.sleeperWidthMin,
    TRACK_WIDTH * scale * TUNING.visuals.sleeperWidthScale,
  );
  for (let sample = sleeperStart; sample <= endDistance; sample += sleeperWorldStep) {
    const point = evaluateRoute(sample);
    const normalX = -Math.sin(point.heading);
    const normalY = Math.cos(point.heading);
    const leftPoint = worldToScreen(
      {
        x: point.x + normalX * TRACK_WIDTH * 0.5,
        y: point.y + normalY * TRACK_WIDTH * 0.5,
      },
      camera,
      scale,
      width,
      view.anchorY,
    );
    const rightPoint = worldToScreen(
      {
        x: point.x - normalX * TRACK_WIDTH * 0.5,
        y: point.y - normalY * TRACK_WIDTH * 0.5,
      },
      camera,
      scale,
      width,
      view.anchorY,
    );
    ctx.beginPath();
    ctx.moveTo(leftPoint.x, leftPoint.y);
    ctx.lineTo(rightPoint.x, rightPoint.y);
    ctx.stroke();
  }

  drawRouteMarkers(view, width, height);
}

function drawRouteMarkers(view, width, height) {
  const { camera, scale } = view;
  route.stations.slice(1).forEach((station, index) => {
    const point = evaluateRoute(station.distance);
    const stopMetrics = getStationStopMetrics(station);
    const targetOffset = stopMetrics.targetDistance - station.distance;
    const screen = worldToScreen(point, camera, scale, width, view.anchorY);
    if (screen.y < -50 || screen.y > height + 50) {
      return;
    }

    const isActive = index + 1 === state.stationIndex;
    const markerWidth = Math.max(22, stopMetrics.tolerance * scale * 2);
    const markerHeight = clamp(TRACK_WIDTH * scale * 2.4, 12, 20);
    const markerRadius = Math.min(markerHeight * 0.5, 10);
    const centerMarkerHeight = markerHeight + clamp(TRACK_WIDTH * scale * 3.8, 16, 30);
    const platformLength = Math.max(markerWidth + clamp(26 * scale, 12, 36), stopMetrics.zoneLength * scale);
    const platformWidth = clamp(TRACK_WIDTH * scale * 1.7, 8, 14);
    const platformOffset = clamp(TRACK_WIDTH * scale * 1.85, 11, 20);
    const buildingWidth = clamp(28 * scale, 18, 38);
    const buildingDepth = clamp(18 * scale, 12, 24);
    const buildingOffset = platformOffset + platformWidth * 0.5 + buildingDepth * 0.8;
    const platformStartX = -platformLength * 0.5;
    const buildingTrackOffset = -platformLength * 0.2;
    const stationVisual = station.visual || createStationVisual();
    const labelTrackOffset = buildingTrackOffset;
    const labelSideOffset = stationVisual.buildingSide === -1 ? -(buildingOffset + buildingDepth + 12) : buildingOffset + buildingDepth + 12;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(point.heading);

    ctx.fillStyle = isActive ? "rgba(224, 232, 238, 0.92)" : "rgba(205, 214, 220, 0.84)";
    ctx.strokeStyle = isActive ? "rgba(248, 252, 255, 0.9)" : "rgba(228, 236, 242, 0.68)";
    ctx.lineWidth = 1.5;
    [-1, 1].forEach((side) => {
      const platformY = side * platformOffset - platformWidth * 0.5;
      ctx.beginPath();
      ctx.roundRect(platformStartX, platformY, platformLength, platformWidth, Math.min(platformWidth * 0.45, 6));
      ctx.fill();
      ctx.stroke();
    });

    const buildingY = stationVisual.buildingSide * buildingOffset - buildingDepth * 0.5;
    ctx.fillStyle = stationVisual.buildingColor;
    ctx.strokeStyle = isActive ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.58)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(buildingTrackOffset - buildingWidth * 0.5, buildingY, buildingWidth, buildingDepth, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = stationVisual.roofColor;
    ctx.beginPath();
    ctx.roundRect(
      buildingTrackOffset - buildingWidth * 0.58,
      buildingY - buildingDepth * 0.22,
      buildingWidth * 1.16,
      Math.max(4, buildingDepth * 0.3),
      4,
    );
    ctx.fill();

    ctx.fillStyle = isActive ? "rgba(133, 255, 182, 0.18)" : "rgba(133, 255, 182, 0.1)";
    ctx.strokeStyle = isActive ? "rgba(133, 255, 182, 0.95)" : "rgba(133, 255, 182, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(targetOffset * scale - markerWidth * 0.5, -markerHeight * 0.5, markerWidth, markerHeight, markerRadius);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = isActive ? "rgba(217, 255, 231, 0.98)" : "rgba(217, 255, 231, 0.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(targetOffset * scale, -centerMarkerHeight * 0.5);
    ctx.lineTo(targetOffset * scale, centerMarkerHeight * 0.5);
    ctx.stroke();
    ctx.restore();

    const labelX = screen.x + Math.cos(point.heading) * labelTrackOffset - Math.sin(point.heading) * labelSideOffset;
    const labelY = screen.y + Math.sin(point.heading) * labelTrackOffset + Math.cos(point.heading) * labelSideOffset;
    ctx.fillStyle = "#101010";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.textAlign = stationVisual.buildingSide > 0 ? "left" : "right";
    ctx.textBaseline = "middle";
    ctx.fillText(station.name, labelX, labelY);
    ctx.textBaseline = "alphabetic";
  });

  route.segments.forEach((segment) => {
    if (segment.speedLimit == null) {
      return;
    }

    const signPoint = evaluateRoute(segment.start + 12);
    const normalX = -Math.sin(signPoint.heading);
    const normalY = Math.cos(signPoint.heading);
    const markerPoint = {
      x: signPoint.x - normalX * (TRACK_WIDTH * 0.9 + 14),
      y: signPoint.y - normalY * (TRACK_WIDTH * 0.9 + 14),
    };
    const screen = worldToScreen(markerPoint, camera, scale, width, view.anchorY);
    if (screen.y < -40 || screen.y > height + 40 || screen.x < -40 || screen.x > width + 40) {
      return;
    }

    ctx.fillStyle = "rgba(255, 191, 82, 0.16)";
    ctx.strokeStyle = "rgba(255, 191, 82, 0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(screen.x - 18, screen.y - 16, 36, 24, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffe5b0";
    ctx.font = "700 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${toKph(segment.speedLimit)}`, screen.x, screen.y + 2);
  });

  route.signals.forEach((signal) => {
    const basePoint = evaluateRoute(signal.distance);
    const normalX = -Math.sin(basePoint.heading);
    const normalY = Math.cos(basePoint.heading);
    const signalPoint = {
      x: basePoint.x + normalX * signal.side * (TRACK_WIDTH * 0.8 + TUNING.signals.sideOffset),
      y: basePoint.y + normalY * signal.side * (TRACK_WIDTH * 0.8 + TUNING.signals.sideOffset),
    };
    const screen = worldToScreen(signalPoint, camera, scale, width, view.anchorY);
    if (screen.y < -60 || screen.y > height + 60 || screen.x < -60 || screen.x > width + 60) {
      return;
    }

    const aspect = getSignalAspect(signal);
    const lightColor = aspect === "red" ? "#ff6a62" : aspect === "yellow" ? "#ffd85f" : "#7dff8e";
    const mastHeight = 24;
    ctx.save();
    ctx.strokeStyle = "rgba(210, 228, 240, 0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y + 12);
    ctx.lineTo(screen.x, screen.y - mastHeight);
    ctx.stroke();

    ctx.fillStyle = "rgba(9, 16, 24, 0.95)";
    ctx.beginPath();
    ctx.roundRect(screen.x - 9, screen.y - mastHeight - 16, 18, 24, 7);
    ctx.fill();

    ctx.shadowColor = lightColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = lightColor;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y - mastHeight - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (signal.kind === "yellow") {
      ctx.fillStyle = "rgba(255, 216, 95, 0.18)";
      ctx.strokeStyle = "rgba(255, 216, 95, 0.85)";
      ctx.beginPath();
      ctx.roundRect(screen.x - 19, screen.y - mastHeight + 12, 38, 18, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffeeb8";
      ctx.font = "700 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${toKph(signal.speedLimit)}`, screen.x, screen.y - mastHeight + 25);
    }

    if (signal.kind === "red" && signal.aspect === "red") {
      const stopMetrics = getRedStopMetrics(signal);
      const stopZoneCenterDistance = (stopMetrics.zoneStart + stopMetrics.zoneEnd) * 0.5;
      const stopZoneCenter = evaluateRoute(stopZoneCenterDistance);
      const stopZoneScreen = worldToScreen(stopZoneCenter, camera, scale, width, view.anchorY);
      const stopZoneLength = Math.max(26, stopMetrics.zoneLength * scale);
      const stopZoneHeight = clamp(TRACK_WIDTH * scale * 2.4, 12, 20);

      ctx.save();
      ctx.translate(stopZoneScreen.x, stopZoneScreen.y);
      ctx.rotate(stopZoneCenter.heading);
      ctx.fillStyle = "rgba(255, 106, 98, 0.1)";
      ctx.strokeStyle = "rgba(255, 146, 136, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-stopZoneLength * 0.5, -stopZoneHeight * 0.5, stopZoneLength, stopZoneHeight, stopZoneHeight * 0.5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      const gap = signal.distance - state.distance;
      if (gap >= 0 && gap <= TUNING.signals.redCountdownDisplayDistance) {
        const remaining = Math.max(0, signal.clearAfter - signal.waitTimer);
        ctx.fillStyle = "rgba(8, 14, 22, 0.88)";
        ctx.beginPath();
        ctx.roundRect(screen.x - 17, screen.y - mastHeight - 38, 34, 14, 6);
        ctx.fill();
        ctx.fillStyle = "#ffd7d1";
        ctx.font = "700 10px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${remaining.toFixed(1)}s`, screen.x, screen.y - mastHeight - 28);

        ctx.fillStyle = "rgba(255, 218, 213, 0.82)";
        ctx.font = "600 10px Inter, sans-serif";
        ctx.fillText("Stop zone", stopZoneScreen.x, stopZoneScreen.y - stopZoneHeight * 0.5 - 8);
      }
    }
    ctx.restore();
  });
}

function drawTrain(frame) {
  const { width, height, view, renderedUnits } = frame;
  const { camera, scale } = view;
  const derailment = state.derailment;
  const renderUnits = renderedUnits;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = Math.max(2, scale * 1.2);
  for (let index = 0; index < renderUnits.length - 1; index += 1) {
    const currentUnit = renderUnits[index];
    const nextUnit = renderUnits[index + 1];
    const rearScreen = worldToScreen(
      { x: currentUnit.rearX, y: currentUnit.rearY },
      camera,
      scale,
      width,
      view.anchorY,
    );
    const frontScreen = worldToScreen(
      { x: nextUnit.frontX, y: nextUnit.frontY },
      camera,
      scale,
      width,
      view.anchorY,
    );
    ctx.beginPath();
    ctx.moveTo(rearScreen.x, rearScreen.y);
    ctx.lineTo(frontScreen.x, frontScreen.y);
    ctx.stroke();
  }
  ctx.restore();

  renderUnits.slice().reverse().forEach((unit) => {
    const center = worldToScreen(
      { x: unit.renderX, y: unit.renderY },
      camera,
      scale,
      width,
      view.anchorY,
    );
    const pixelLength = Math.max(TUNING.train.minPixelLength, unit.length * scale);
    const pixelWidth = Math.max(TUNING.train.minPixelWidth, unit.width * scale);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(unit.renderHeading + Math.PI / 2);
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = (state.overspeedTimer > 0.2 || derailment) && unit.type === "locomotive" ? "#ff9b6d" : unit.bodyColor;
    ctx.strokeStyle = "rgba(255,255,255,0.78)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-pixelWidth / 2, -pixelLength / 2, pixelWidth, pixelLength, Math.max(6, pixelWidth * 0.35));
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = unit.roofColor;
    ctx.fillRect(-pixelWidth * 0.28, -pixelLength * 0.32, pixelWidth * 0.56, pixelLength * 0.48);

    if (unit.type === "locomotive") {
      ctx.fillStyle = "rgba(255, 232, 160, 0.88)";
      ctx.fillRect(-pixelWidth * 0.18, -pixelLength * 0.54, pixelWidth * 0.36, Math.max(5, pixelLength * 0.14));
      ctx.fillStyle = "rgba(7, 21, 36, 0.78)";
      ctx.fillRect(-pixelWidth * 0.24, -pixelLength * 0.18, pixelWidth * 0.48, pixelLength * 0.18);
    } else {
      ctx.fillStyle = "rgba(50, 73, 92, 0.45)";
      ctx.fillRect(-pixelWidth * 0.16, -pixelLength * 0.42, pixelWidth * 0.32, pixelLength * 0.84);
    }

    ctx.restore();
  });

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  state.exhaustPuffs.forEach((puff) => {
    const progress = puff.age / puff.life;
    const radius = Math.max(2.2, (puff.radius + puff.growth * progress) * scale);
    const opacity = Math.max(0, (1 - progress) * puff.opacity);
    if (opacity <= 0.002) {
      return;
    }

    const { x: screenX, y: screenY } = worldToScreen(
      { x: puff.x, y: puff.y },
      camera,
      scale,
      width,
      view.anchorY,
    );
    if (screenX < -radius || screenX > width + radius || screenY < -radius || screenY > height + radius) {
      return;
    }

    const shade = Math.round(puff.shade + progress * 20);
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade + 5}, ${opacity.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
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

function render() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const frame = createRenderFrameContext(width, height);

  drawBackground(frame);
  drawTrack(frame);
  drawTrain(frame);
  drawSpeedEffects(width, height);
  drawHudOverlay(width, height);
  renderDroneInset(frame);
}

