function evaluateRoute(distance) {
  if (distance < 0) {
    const firstSegment = route.segments[0];
    return {
      x: firstSegment.x0 + Math.cos(firstSegment.heading0) * distance,
      y: firstSegment.y0 + Math.sin(firstSegment.heading0) * distance,
      heading: firstSegment.heading0,
      ...getTrackElevation(0),
      curvature: 0,
      speedLimit: firstSegment.speedLimit,
      segment: firstSegment,
    };
  }

  const clampedDistance = clamp(distance, 0, route.totalLength);
  const segments = route.segments;
  let segmentIndex = route.lastSegmentIndex || 0;
  let segment = segments[segmentIndex];

  if (!segment || clampedDistance < segment.start
    || (clampedDistance >= segment.end && segmentIndex < segments.length - 1)) {
    let low = 0;
    let high = segments.length - 1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const candidate = segments[mid];
      if (clampedDistance < candidate.start) {
        high = mid - 1;
      } else if (clampedDistance >= candidate.end && mid < segments.length - 1) {
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

  return { ...evaluateSegment(segment, clampedDistance - segment.start),
    ...getTrackElevation(clampedDistance) };
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

function generateRoute(seed = null) {
  const routeSeed = seed == null ? String(Math.floor(Math.random() * 0xffffffff)) : String(seed);
  let value = 2166136261;
  for (const character of routeSeed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  const previousRandom = worldRandom;
  worldRandom = () => {
    value += 0x6D2B79F5;
    let mixed = Math.imul(value ^ value >>> 15, 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, 61 | mixed);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
  try {
    const generated = buildRoute();
    generated.seed = routeSeed;
    generated.terrainPhase = worldRandom() * 1000;
    generated.elevationNodes = [{ distance: 0, elevation: 60 }];
    // Alternate climbs and descents with substantial relief. Derive the rise
    // from the available transition length so long sections are steep too.
    for (let index = 1; index < generated.stations.length; index += 1) {
      const previous = generated.elevationNodes[index - 1];
      const distance = generated.stations[index].distance;
      const run = Math.max(0, distance - previous.distance - TUNING.terrain.stationFlatLength * 2);
      const maxRise = run * TUNING.terrain.maxGrade / 1.5;
      const direction = index % 2 === 1 ? 1 : -1;
      const elevation = clamp(previous.elevation + direction * maxRise * rand(0.65, 1),
        TUNING.terrain.stationElevationMin, TUNING.terrain.stationElevationMax);
      generated.elevationNodes.push({ distance, elevation });
    }
    generated.elevationNodes.push({ distance: generated.totalLength,
      elevation: generated.elevationNodes[generated.elevationNodes.length - 1].elevation });
    generated.terrainHeightCache = new Map();
    generated.terrainCellCache = new Map();
    generated.terrainProjectionVersion = 0;
    generated.terrainPaletteVersion = 0;
    generated.terrainBackdrop = null;
    generated.trackSpatialIndex = new Map();
    // Index polyline edges by every bucket their bounds touch. Height queries
    // use nearest points on edges, avoiding scalloped earthworks between samples.
    for (const segment of generated.segments) {
      // The initial consist starts behind chainage zero. Extend its earthworks
      // as well as the visible rails so the rear cars begin on supported track.
      const firstOffset = segment.start === 0 ? -Math.ceil((TRAIN_TOTAL_LENGTH + 60) / 20) * 20 : 0;
      for (let offset = firstOffset; offset < segment.length; offset += 20) {
        const a = evaluateSegment(segment, offset);
        const b = evaluateSegment(segment, Math.min(offset + 20, segment.length));
        const edge = { a, b, distance: segment.start + offset,
          length: Math.min(20, segment.length - offset) };
        for (let x = Math.floor(Math.min(a.x, b.x) / 160); x <= Math.floor(Math.max(a.x, b.x) / 160); x += 1) {
          for (let y = Math.floor(Math.min(a.y, b.y) / 160); y <= Math.floor(Math.max(a.y, b.y) / 160); y += 1) {
            const key = `${x},${y}`;
            if (!generated.trackSpatialIndex.has(key)) generated.trackSpatialIndex.set(key, []);
            generated.trackSpatialIndex.get(key).push(edge);
          }
        }
      }
    }
    generated.scenery = filterSceneryForTrack(generated);
    return generated;
  } finally {
    worldRandom = previousRandom;
  }
}

function buildRoute() {
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
      const makeCurve = worldRandom() < TUNING.route.curveChance
        && remaining > TUNING.route.curveRemainingThreshold;

      if (makeCurve) {
        const useSharpCurve = worldRandom() < TUNING.route.sharpCurveChance;
        const targetRadius = useSharpCurve
          ? rand(TUNING.route.sharpCurveRadiusMin, TUNING.route.sharpCurveRadiusMax)
          : rand(TUNING.route.broadCurveRadiusMin, TUNING.route.broadCurveRadiusMax);
        const turnMagnitude = useSharpCurve
          ? rand(TUNING.route.sharpCurveTurnMin, TUNING.route.sharpCurveTurnMax)
          : rand(TUNING.route.broadCurveTurnMin, TUNING.route.broadCurveTurnMax);
        const signedTurn = turnMagnitude * (worldRandom() < 0.5 ? -1 : 1);
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

      if (!nearStation && worldRandom() < TUNING.signals.spawnChance) {
        const roll = worldRandom();
        const baseSignal = {
          distance: cursor,
          side: worldRandom() < 0.5 ? -1 : 1,
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
  const kindRoll = worldRandom();
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
      const clusterCount = worldRandom() < TUNING.scenery.fourObjectChance
        ? 4
        : worldRandom() < TUNING.scenery.threeObjectChance
          ? 3
          : worldRandom() < TUNING.scenery.twoObjectChance
            ? 2
            : 1;
      for (let index = 0; index < clusterCount; index += 1) {
        const side = worldRandom() < 0.5 ? -1 : 1;
        const nearTrack = worldRandom() < TUNING.scenery.nearTrackChance;
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

// Route distance remains horizontal chainage so gameplay boundaries stay stable.
function getTrackElevation(distance, routeData = route) {
  const nodes = routeData.elevationNodes;
  if (!nodes) return { elevation: 0, grade: 0, pitch: 0 };
  const index = clamp(findFirstSortedIndex(nodes, distance) - 1, 0, nodes.length - 2);
  const a = nodes[index];
  const b = nodes[index + 1];
  const flat = TUNING.terrain.stationFlatLength;
  const span = b.distance - a.distance - flat * 2;
  const t = span > 0 ? clamp((distance - a.distance - flat) / span, 0, 1) : 0;
  const grade = span > 0 ? (b.elevation - a.elevation) * 6 * t * (1 - t) / span : 0;
  return { elevation: lerp(a.elevation, b.elevation, t * t * (3 - 2 * t)),
    grade, pitch: Math.atan(grade) };
}

function getTerrainHeight(x, y, routeData = route) {
  const phase = routeData.terrainPhase;
  const relief = TUNING.terrain.relief;
  const natural = 56 + relief * (Math.sin(x / 290 + phase) * Math.cos(y / 340 - phase) * 0.65
    + Math.sin(x / 110 + y / 170 + phase) * 0.2
    + Math.cos(x / 680 - y / 430) * 0.5);
  let nearest = TUNING.terrain.blendWidth;
  let trackHeight = natural;
  let nearestDistance = Infinity;
  const bx = Math.floor(x / 160);
  const by = Math.floor(y / 160);
  const bucketRadius = Math.ceil(TUNING.terrain.blendWidth / 160);
  for (let gx = bx - bucketRadius; gx <= bx + bucketRadius; gx += 1) {
    for (let gy = by - bucketRadius; gy <= by + bucketRadius; gy += 1) {
      const edges = routeData.trackSpatialIndex.get(`${gx},${gy}`) || [];
      for (const edge of edges) {
        const dx = edge.b.x - edge.a.x;
        const dy = edge.b.y - edge.a.y;
        const t = clamp(((x - edge.a.x) * dx + (y - edge.a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        const gap = Math.hypot(x - edge.a.x - t * dx, y - edge.a.y - t * dy);
        const distance = edge.distance + edge.length * t;
        // A stable chainage tie-break handles shared polyline vertices.
        if (gap < nearest || (gap === nearest && distance < nearestDistance)) {
          nearest = gap;
          nearestDistance = distance;
          trackHeight = getTrackElevation(distance, routeData).elevation - 0.35;
        }
      }
    }
  }
  const mix = clamp((nearest - TUNING.terrain.corridorWidth)
    / (TUNING.terrain.blendWidth - TUNING.terrain.corridorWidth), 0, 1);
  return lerp(trackHeight, natural, mix * mix * (3 - 2 * mix));
}

function getTerrainVertex(gx, gy) {
  const key = `${gx},${gy}`;
  let point = route.terrainHeightCache.get(key);
  if (!point) {
    const size = TUNING.terrain.cellSize;
    point = { x: gx * size, y: gy * size, elevation: getTerrainHeight(gx * size, gy * size),
      key, screen: { x: 0, y: 0 }, projectionVersion: -1 };
    route.terrainHeightCache.set(key, point);
  }
  return point;
}

// Conservative bounds shared with Canvas prop sizing. Roof overhangs and pond
// edges count, and trees include the full height of their highest foliage layer.
function getSceneryBounds(item) {
  const size = item.size * 8;
  if (["tree", "bush", "cactus", "stump"].includes(item.kind)) {
    const radius = size * (["bush", "stump"].includes(item.kind) ? 0.4 : 1);
    return { size, radius, height: radius * 3.4 };
  }
  if (item.kind === "pond") return { size, radius: size * 2, height: 0.2 };
  if (["rock", "ruins", "hayBale"].includes(item.kind)) {
    return { size, radius: Math.hypot(size * 0.75, size * 0.5), height: size * 0.75 };
  }
  return { size, radius: Math.hypot(size * 1.35, size * 0.975), height: size * 1.4 + 1.6 };
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
}

function segmentDistance(a, b, c, d) {
  const ux = b.x - a.x, uy = b.y - a.y;
  const vx = d.x - c.x, vy = d.y - c.y;
  const denominator = ux * vy - uy * vx;
  if (Math.abs(denominator) > 1e-9) {
    const dx = c.x - a.x, dy = c.y - a.y;
    const t = (dx * vy - dy * vx) / denominator;
    const u = (dx * uy - dy * ux) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

function filterSceneryForTrack(routeData) {
  // A temporary index in fixed isometric space catches tall foreground props
  // whose bases are clear in the world but whose silhouettes cover the rails.
  const projectedIndex = new Map();
  const bucketSize = 160;
  const camera = { x: 0, y: 0, elevation: 0 };
  const project = point => worldToScreen(point, camera, 1, 0, 0);
  const visitBuckets = (index, minX, maxX, minY, maxY, visit) => {
    for (let x = Math.floor(minX / bucketSize); x <= Math.floor(maxX / bucketSize); x += 1) {
      for (let y = Math.floor(minY / bucketSize); y <= Math.floor(maxY / bucketSize); y += 1) {
        if (visit(index, `${x},${y}`) === false) return false;
      }
    }
    return true;
  };
  for (const edge of new Set([...routeData.trackSpatialIndex.values()].flat())) {
    const a = project({ ...edge.a, ...getTrackElevation(edge.distance, routeData) });
    const b = project({ ...edge.b, ...getTrackElevation(edge.distance + edge.length, routeData) });
    const projected = { a, b };
    visitBuckets(projectedIndex, Math.min(a.x, b.x), Math.max(a.x, b.x),
      Math.min(a.y, b.y), Math.max(a.y, b.y), (index, key) => {
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(projected);
      });
  }
  return routeData.scenery.filter(item => {
    // Sample the new route explicitly: global route can still refer to the old
    // run here, and generation must never mutate or consult its geometry.
    const segment = routeData.segments[findFirstSortedIndex(routeData.segments, item.distance, part => part.end)];
    const pose = evaluateSegment(segment, item.distance - segment.start);
    const point = { x: pose.x - Math.sin(pose.heading) * item.offset,
      y: pose.y + Math.cos(pose.heading) * item.offset };
    const { radius, height } = getSceneryBounds(item);
    const clearance = radius + TUNING.scenery.trackClearance;
    const clearGround = visitBuckets(routeData.trackSpatialIndex,
      point.x - clearance, point.x + clearance, point.y - clearance, point.y + clearance,
      (index, key) => !(index.get(key) || []).some(edge => pointSegmentDistance(point, edge.a, edge.b) < clearance));
    if (!clearGround) return false;
    point.elevation = getTerrainHeight(point.x, point.y, routeData);
    const bottom = project(point);
    const top = project({ ...point, elevation: point.elevation + height });
    // Projection cannot enlarge a horizontal circle at scale 1. A capsule of
    // this radius therefore contains the full projected prop at every zoom.
    const clearView = visitBuckets(projectedIndex,
      bottom.x - clearance, bottom.x + clearance, top.y - clearance, bottom.y + clearance,
      (index, key) => !(index.get(key) || []).some(edge => segmentDistance(bottom, top, edge.a, edge.b) < clearance));
    if (clearView) item.worldPoint = point;
    return clearView;
  });
}
