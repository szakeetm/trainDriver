function evaluateRoute(distance) {
  if (distance < 0) {
    const firstSegment = route.segments[0];
    return {
      x: firstSegment.x0 + Math.cos(firstSegment.heading0) * distance,
      y: firstSegment.y0 + Math.sin(firstSegment.heading0) * distance,
      heading: firstSegment.heading0,
      curvature: 0,
      speedLimit: firstSegment.speedLimit,
      segment: firstSegment,
    };
  }

  const clampedDistance = clamp(distance, 0, route.totalLength);
  const segments = route.segments;
  let segmentIndex = route.lastSegmentIndex || 0;
  let segment = segments[segmentIndex];

  if (!segment || clampedDistance < segment.start || clampedDistance > segment.end) {
    let low = 0;
    let high = segments.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const candidate = segments[mid];
      if (clampedDistance < candidate.start) {
        high = mid - 1;
      } else if (clampedDistance > candidate.end) {
        low = mid + 1;
      } else {
        segmentIndex = mid;
        segment = candidate;
        break;
      }
    }

    if (!segment || clampedDistance < segment.start || clampedDistance > segment.end) {
      segmentIndex = clamp(low, 0, segments.length - 1);
      segment = segments[segmentIndex] || segments[segments.length - 1];
    }
  }

  route.lastSegmentIndex = segmentIndex;

  return evaluateSegment(segment, clampedDistance - segment.start);
}

function findFirstSortedIndex(items, target, valueSelector = (item) => item.distance) {
  let low = 0;
  let high = items.length;

  while (low < high) {
    const mid = (low + high) >> 1;
    if (valueSelector(items[mid]) < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function makeSegment(startState, length, curvature, speedLimit) {
  const segment = {
    type: Math.abs(curvature) < 1e-6 ? "straight" : "curve",
    start: startState.distance,
    end: startState.distance + length,
    length,
    curvature,
    speedLimit,
    x0: startState.x,
    y0: startState.y,
    heading0: startState.heading,
  };

  const endState = evaluateSegment(segment, length);
  return {
    segment,
    endState: {
      x: endState.x,
      y: endState.y,
      heading: endState.heading,
      distance: segment.end,
    },
  };
}

function generateBiomes(totalLength) {
  const themes = ["green", "desert", "snow", "mountain", "river", "farmland", "autumn", "marsh", "canyon"];
  const biomes = [];
  let previousTheme = null;
  let cursor = 0;

  while (cursor < totalLength) {
    const remaining = totalLength - cursor;
    if (remaining <= TUNING.route.biomeSectionLengthMin * 0.55 && biomes.length > 0) {
      biomes[biomes.length - 1].endDistance = totalLength;
      break;
    }

    const theme = chooseDifferent(themes, previousTheme);
    previousTheme = theme;
    const segmentLength = Math.min(
      rand(TUNING.route.biomeSectionLengthMin, TUNING.route.biomeSectionLengthMax),
      remaining,
    );

    biomes.push({
      theme,
      startDistance: cursor,
      endDistance: cursor + segmentLength,
    });

    cursor += segmentLength;
  }

  if (biomes.length === 0) {
    biomes.push({
      theme: "green",
      startDistance: 0,
      endDistance: totalLength,
    });
  } else {
    biomes[biomes.length - 1].endDistance = totalLength;
  }

  return biomes;
}

function generateRoute() {
  const stationNames = TUNING.stations.names;
  const stationCurveClearDistance = getStationZoneLength() * 0.5;

  const segments = [];
  const stations = [{ name: "Origin", distance: 0 }];
  let cursor = {
    x: 0,
    y: 0,
    heading: -Math.PI / 2,
    distance: 0,
  };

  for (let stationIndex = 1; stationIndex < TOTAL_STATIONS; stationIndex += 1) {
    const spacing = rand(TUNING.route.stationSpacingMin, TUNING.route.stationSpacingMax);
    const stationDistance = cursor.distance + spacing;
    const approachDistance = stationDistance - TUNING.stations.approachOffset;

    while (cursor.distance < approachDistance - TUNING.stations.approachClearance) {
      const remaining = approachDistance - cursor.distance;
      const makeCurve = Math.random() < TUNING.route.curveChance
        && remaining > TUNING.route.curveRemainingThreshold;

      if (makeCurve) {
        const useSharpCurve = Math.random() < TUNING.route.sharpCurveChance;
        const targetRadius = useSharpCurve
          ? rand(TUNING.route.sharpCurveRadiusMin, TUNING.route.sharpCurveRadiusMax)
          : rand(TUNING.route.broadCurveRadiusMin, TUNING.route.broadCurveRadiusMax);
        const turnMagnitude = useSharpCurve
          ? rand(TUNING.route.sharpCurveTurnMin, TUNING.route.sharpCurveTurnMax)
          : rand(TUNING.route.broadCurveTurnMin, TUNING.route.broadCurveTurnMax);
        const signedTurn = turnMagnitude * (Math.random() < 0.5 ? -1 : 1);
        const idealLength = targetRadius * turnMagnitude;
        const length = Math.min(
          clamp(idealLength, TUNING.route.curveLengthMin, TUNING.route.curveLengthMax),
          remaining - TUNING.route.curveExitBuffer,
        );
        const curvature = signedTurn / length;
        const speedLimit = clamp(
          Math.sqrt(TUNING.route.curveGripFactor / Math.abs(curvature)),
          TUNING.route.curveSpeedLimitMin,
          TUNING.route.curveSpeedLimitMax,
        );
        const built = makeSegment(cursor, length, curvature, speedLimit);
        segments.push(built.segment);
        cursor = built.endState;
      } else {
        const length = Math.min(
          rand(TUNING.route.straightLengthMin, TUNING.route.straightLengthMax),
          remaining,
        );
        const built = makeSegment(cursor, length, 0, null);
        segments.push(built.segment);
        cursor = built.endState;
      }
    }

    const finalStraight = stationDistance - cursor.distance;
    if (finalStraight > 1) {
      const built = makeSegment(cursor, finalStraight, 0, null);
      segments.push(built.segment);
      cursor = built.endState;
    }

    stations.push({
      name: choose(stationNames.filter((name) => !stations.some((station) => station.name === name))),
      distance: stationDistance,
      visual: createStationVisual(),
    });

    if (stationIndex < TOTAL_STATIONS - 1 && stationCurveClearDistance > 1) {
      const built = makeSegment(cursor, stationCurveClearDistance, 0, null);
      segments.push(built.segment);
      cursor = built.endState;
    }
  }

  const tail = makeSegment(cursor, TUNING.stations.tailLength, 0, null);
  segments.push(tail.segment);

  const totalLength = tail.segment.end;

  return {
    segments,
    lastSegmentIndex: 0,
    stations,
    biomes: generateBiomes(totalLength),
    terrainCornerCache: new Map(),
    terrainTileCache: new Map(),
    signals: generateSignals(segments, stations, totalLength),
    scenery: generateScenery(stations, totalLength),
    totalLength,
  };
}

const BIOME_PALETTES = {
  default: {
    base: [123, 156, 86, 0.42],
    alt: [84, 129, 69, 0.34],
    detail: [90, 128, 58, 0.18],
  },
  desert: {
    base: [197, 168, 103, 0.44],
    alt: [173, 145, 84, 0.34],
    detail: [151, 123, 66, 0.18],
  },
  snow: {
    base: [214, 225, 232, 0.48],
    alt: [173, 193, 207, 0.32],
    detail: [244, 248, 252, 0.22],
  },
  mountain: {
    base: [120, 130, 126, 0.42],
    alt: [90, 98, 94, 0.36],
    detail: [68, 76, 74, 0.22],
  },
  river: {
    base: [98, 143, 104, 0.38],
    alt: [72, 125, 128, 0.34],
    detail: [80, 160, 194, 0.22],
  },
  farmland: {
    base: [167, 152, 92, 0.42],
    alt: [142, 126, 74, 0.34],
    detail: [204, 186, 111, 0.18],
  },
  autumn: {
    base: [149, 103, 58, 0.42],
    alt: [118, 74, 42, 0.34],
    detail: [191, 137, 72, 0.2],
  },
  marsh: {
    base: [91, 121, 90, 0.42],
    alt: [73, 97, 76, 0.35],
    detail: [110, 146, 124, 0.2],
  },
  canyon: {
    base: [170, 103, 73, 0.42],
    alt: [132, 78, 56, 0.34],
    detail: [209, 147, 109, 0.2],
  },
};

function getBiomePalette(theme) {
  return BIOME_PALETTES[theme] || BIOME_PALETTES.default;
}

function formatBiomeName(theme) {
  return theme.charAt(0).toUpperCase() + theme.slice(1);
}

function getCurrentBiomeLabel(distance = state.distance) {
  const blend = getBiomeBlendAtDistance(distance);
  if (blend.primary !== blend.secondary && blend.mix > 0.22 && blend.mix < 0.78) {
    return `${formatBiomeName(blend.primary)} to ${formatBiomeName(blend.secondary)}`;
  }

  return formatBiomeName(blend.mix >= 0.5 ? blend.secondary : blend.primary);
}

function mixPaletteColor(colorA, colorB, t) {
  return [
    lerp(colorA[0], colorB[0], t),
    lerp(colorA[1], colorB[1], t),
    lerp(colorA[2], colorB[2], t),
    lerp(colorA[3], colorB[3], t),
  ];
}

function paletteColorToCss(color) {
  return `rgba(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])}, ${color[3].toFixed(3)})`;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function getBiomeBlendAtDistance(distance) {
  const transition = TUNING.route.biomeTransitionDistance;
  const biomes = route.biomes;
  let index = biomes.findIndex((biome) => distance >= biome.startDistance && distance < biome.endDistance);
  if (index === -1) {
    index = biomes.length - 1;
  }

  const current = biomes[index];
  const next = biomes[Math.min(index + 1, biomes.length - 1)];
  const previous = biomes[Math.max(index - 1, 0)];

  if (next !== current && distance > current.endDistance - transition) {
    return {
      primary: current.theme,
      secondary: next.theme,
      mix: smoothstep(current.endDistance - transition, current.endDistance + transition, distance),
    };
  }

  if (previous !== current && distance < current.startDistance + transition) {
    return {
      primary: previous.theme,
      secondary: current.theme,
      mix: smoothstep(current.startDistance - transition, current.startDistance + transition, distance),
    };
  }

  return {
    primary: current.theme,
    secondary: current.theme,
    mix: 0,
  };
}

function estimateVisibleRouteSamples(view) {
  const samples = [];
  const sampleStep = 90;
  for (let distance = Math.max(0, view.startDistance - 140); distance <= Math.min(route.totalLength, view.endDistance + 140); distance += sampleStep) {
    const point = evaluateRoute(distance);
    samples.push({ distance, x: point.x, y: point.y });
  }
  return samples;
}

function estimateRouteDistanceForWorldPoint(worldX, worldY, samples) {
  let closest = samples[0];
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const dx = worldX - sample.x;
    const dy = worldY - sample.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      closest = sample;
    }
  }
  return closest.distance;
}

function createTerrainTileStyle(cellGridX, cellGridY) {
  return {
    topLeftKey: `${cellGridX},${cellGridY}`,
    topRightKey: `${cellGridX + 1},${cellGridY}`,
    bottomLeftKey: `${cellGridX},${cellGridY + 1}`,
    bottomRightKey: `${cellGridX + 1},${cellGridY + 1}`,
    biomeSeed: hashNoise(cellGridX * 0.7, cellGridY * 0.7),
    toneSeed: hashNoise(cellGridX * 1.9 + 4, cellGridY * 1.7 + 9),
  };
}

function getTerrainCornerStyle(cornerGridX, cornerGridY, biomeBlend = getBiomeBlendAtDistance(state.distance)) {
  const primaryPalette = getBiomePalette(biomeBlend.primary);
  const secondaryPalette = getBiomePalette(biomeBlend.secondary);
  const baseColor = mixPaletteColor(primaryPalette.base, secondaryPalette.base, biomeBlend.mix);
  const altColor = mixPaletteColor(primaryPalette.alt, secondaryPalette.alt, biomeBlend.mix);
  const detailColor = mixPaletteColor(primaryPalette.detail, secondaryPalette.detail, biomeBlend.mix);

  return {
    baseColor,
    altColor,
    detailColor,
    riverMix: biomeBlend.primary === "river"
      ? Math.max(0.45, 1 - biomeBlend.mix * 0.4)
      : biomeBlend.secondary === "river"
        ? biomeBlend.mix
        : 0,
  };
}

function generateSignals(segments, stations, totalLength) {
  const signals = [];
  const stationDistances = stations.map((station) => station.distance);
  const usableEnd = totalLength - TUNING.signals.endMargin;

  segments.forEach((segment) => {
    if (segment.speedLimit != null) {
      return;
    }

    let cursor = segment.start + TUNING.signals.segmentInset;
    const segmentEnd = Math.min(segment.end - TUNING.signals.segmentInset, usableEnd);
    while (cursor < segmentEnd) {
      const nearStation = stationDistances.some(
        (stationDistance) => Math.abs(stationDistance - cursor) < TUNING.signals.stationClearance,
      );

      if (!nearStation && Math.random() < TUNING.signals.spawnChance) {
        const roll = Math.random();
        const baseSignal = {
          distance: cursor,
          side: Math.random() < 0.5 ? -1 : 1,
        };

        if (roll < TUNING.signals.redChance) {
          signals.push({
            ...baseSignal,
            kind: "red",
            aspect: "red",
            clearAfter: rand(TUNING.signals.redHoldMin, TUNING.signals.redHoldMax),
            waitTimer: 0,
            passed: false,
          });
        } else if (roll < TUNING.signals.redChance + TUNING.signals.yellowChance) {
          signals.push({
            ...baseSignal,
            kind: "yellow",
            aspect: "yellow",
            speedLimit: rand(TUNING.signals.yellowSpeedLimitMin, TUNING.signals.yellowSpeedLimitMax),
            releaseDistance: Math.min(
              cursor + rand(TUNING.signals.yellowBlockLengthMin, TUNING.signals.yellowBlockLengthMax),
              usableEnd,
            ),
            passed: false,
          });
        } else {
          signals.push({
            ...baseSignal,
            kind: "green",
            aspect: "green",
            passed: false,
          });
        }
      }

      cursor += rand(TUNING.signals.spacingMin, TUNING.signals.spacingMax);
    }
  });

  return signals.sort((a, b) => a.distance - b.distance);
}

function chooseSceneryKind() {
  const kindRoll = Math.random();
  if (kindRoll > TUNING.scenery.windmillThreshold) {
    return "windmill";
  }
  if (kindRoll > TUNING.scenery.siloThreshold) {
    return "silo";
  }
  if (kindRoll > TUNING.scenery.barnThreshold) {
    return "barn";
  }
  if (kindRoll > TUNING.scenery.billboardThreshold) {
    return "billboard";
  }
  if (kindRoll > TUNING.scenery.pondThreshold) {
    return "pond";
  }
  if (kindRoll > TUNING.scenery.ruinThreshold) {
    return "ruins";
  }
  if (kindRoll > TUNING.scenery.hutThreshold) {
    return "hut";
  }
  if (kindRoll > TUNING.scenery.cactusThreshold) {
    return "cactus";
  }
  if (kindRoll > TUNING.scenery.rockThreshold) {
    return "rock";
  }
  if (kindRoll > TUNING.scenery.stumpThreshold) {
    return "stump";
  }
  if (kindRoll > TUNING.scenery.hayBaleThreshold) {
    return "hayBale";
  }
  if (kindRoll > TUNING.scenery.bushThreshold) {
    return "bush";
  }
  return "tree";
}

function generateScenery(stations, totalLength) {
  const scenery = [];
  const stationDistances = stations.map((station) => station.distance);
  let distance = TUNING.scenery.startDistance;

  while (distance < totalLength - TUNING.scenery.endMargin) {
    const nearStation = stationDistances.some(
      (stationDistance) => Math.abs(stationDistance - distance) < TUNING.scenery.stationClearance,
    );
    if (!nearStation) {
      const clusterCount = Math.random() < TUNING.scenery.fourObjectChance
        ? 4
        : Math.random() < TUNING.scenery.threeObjectChance
          ? 3
          : Math.random() < TUNING.scenery.twoObjectChance
            ? 2
            : 1;
      for (let index = 0; index < clusterCount; index += 1) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const nearTrack = Math.random() < TUNING.scenery.nearTrackChance;
        const offset = (
          nearTrack
            ? rand(TUNING.scenery.nearTrackOffsetMin, TUNING.scenery.nearTrackOffsetMax)
            : rand(TUNING.scenery.farOffsetMin, TUNING.scenery.farOffsetMax)
        ) * side;
        const baseDistance = distance + rand(TUNING.scenery.distanceJitterMin, TUNING.scenery.distanceJitterMax);

        scenery.push({
          distance: clamp(baseDistance, TUNING.scenery.objectMargin, totalLength - TUNING.scenery.objectMargin),
          offset,
          size: rand(TUNING.scenery.sizeMin, TUNING.scenery.sizeMax),
          rotation: rand(TUNING.scenery.rotationMin, TUNING.scenery.rotationMax),
          tint: rand(TUNING.scenery.tintMin, TUNING.scenery.tintMax),
          kind: chooseSceneryKind(),
        });
      }

    }

    distance += rand(TUNING.scenery.spacingMin, TUNING.scenery.spacingMax);
  }

  return scenery.sort((a, b) => a.distance - b.distance);
}

