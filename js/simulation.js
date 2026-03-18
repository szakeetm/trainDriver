function createInitialState() {
  route = generateRoute();
  return {
    started: false,
    finished: false,
    failed: false,
    distance: 0,
    speed: 0,
    acceleration: 0,
    requestedControl: 0,
    actualControl: 0,
    elapsed: 0,
    penalties: 0,
    overspeedTimer: 0,
    stationIndex: 1,
    stationResults: [],
    message: "Waiting to depart",
    detail: "You are handling a 100 m train. Build speed early and leave room for delayed braking.",
    signalStatus: null,
    derailment: null,
    lastStopError: null,
    failReason: null,
    exhaustPuffs: [],
    exhaustSpawnCarry: 0,
    nextSignalIndex: 0,
  };
}

function controlLabel(value) {
  if (value > 0.02) {
    return `Power ${Math.round(value * MAX_POWER_KW)} kW`;
  }
  if (value < -0.02) {
    return `Brake ${(Math.abs(value) * MAX_BRAKE_PRESSURE_BAR).toFixed(1)} bar`;
  }
  return "Coast";
}

function getDieselExhaustIntensity(powerOutput = Math.max(0, state.actualControl), acceleration = Math.max(0, state.acceleration || 0)) {
  const accelFactor = clamp(acceleration / Math.max(TUNING.physics.tractionForce, 1e-6), 0, 1);
  if (powerOutput <= 0.04 || accelFactor <= 0.03) {
    return 0;
  }

  return clamp(powerOutput * 0.5 + accelFactor * 0.65, 0, 1);
}

function spawnDieselExhaustPuff(unit, intensity) {
  const heading = unit.renderHeading;
  const forwardX = Math.cos(heading);
  const forwardY = Math.sin(heading);
  const normalX = -Math.sin(heading);
  const normalY = Math.cos(heading);
  const sourceX = unit.renderX + normalX * unit.width * 0.08 - forwardX * unit.length * 0.08;
  const sourceY = unit.renderY + normalY * unit.width * 0.08 - forwardY * unit.length * 0.08;
  const sidewaysJitter = Math.random() * 0.18 - 0.09;

  state.exhaustPuffs.push({
    x: sourceX,
    y: sourceY,
    driftX: 0.18 - forwardX * (0.12 + intensity * 0.14) + normalX * sidewaysJitter,
    driftY: -0.08 - forwardY * (0.12 + intensity * 0.14) + normalY * sidewaysJitter,
    age: 0,
    life: 1.5 + Math.random() * 0.6,
    radius: 1.15 + Math.random() * 0.5 + intensity * 0.42,
    growth: 2.5 + Math.random() * 0.8 + intensity * 1.3,
    opacity: 0.2 + intensity * 0.2,
    shade: 42 + Math.random() * 18,
  });

  if (state.exhaustPuffs.length > 20) {
    state.exhaustPuffs.splice(0, state.exhaustPuffs.length - 20);
  }
}

function updateDieselExhaust(dt) {
  if (!state.exhaustPuffs) {
    state.exhaustPuffs = [];
  }

  const intensity = state.derailment ? 0 : getDieselExhaustIntensity();
  const locomotiveUnit = intensity > 0 ? getTrainUnits()[0] : null;
  const locomotive = locomotiveUnit
    ? {
      ...locomotiveUnit,
      renderX: locomotiveUnit.pose.x,
      renderY: locomotiveUnit.pose.y,
      renderHeading: locomotiveUnit.pose.heading,
    }
    : null;
  if (locomotive && locomotive.type === "locomotive" && intensity > 0) {
    state.exhaustSpawnCarry += (2 + intensity * 6) * dt;
    while (state.exhaustSpawnCarry >= 1) {
      state.exhaustSpawnCarry -= 1;
      spawnDieselExhaustPuff(locomotive, intensity);
    }
  } else {
    state.exhaustSpawnCarry = 0;
  }

  state.exhaustPuffs = state.exhaustPuffs.filter((puff) => {
    puff.age += dt;
    if (puff.age >= puff.life) {
      return false;
    }

    puff.x += puff.driftX * dt;
    puff.y += puff.driftY * dt;
    return true;
  });
}

function getSignalAspect(signal) {
  return signal.kind === "red" ? signal.aspect : signal.kind;
}

function getEffectiveSpeedLimitInfo(distance = state.distance) {
  const routeInfo = evaluateRoute(distance);
  let limit = routeInfo.speedLimit;
  let source = routeInfo.speedLimit == null ? null : "curve";

  return {
    routeInfo,
    limit,
    source,
    signal: null,
  };
}

function getNextSignal() {
  const startIndex = Math.max(
    state.nextSignalIndex || 0,
    findFirstSortedIndex(route.signals, state.distance - TUNING.signals.redPassMargin),
  );

  for (let index = startIndex; index < route.signals.length; index += 1) {
    const signal = route.signals[index];
    if (signal.passed) {
      continue;
    }

    if (signal.kind === "red" && signal.aspect === "red") {
      if (signal.distance >= state.distance - TUNING.signals.redPassMargin) {
        return signal;
      }
      continue;
    }

    if (signal.distance > state.distance) {
      return signal;
    }
  }

  return null;
}

function getUpcomingRouteEntries() {
  const lookahead = TUNING.route.upcomingCurveLookahead;
  const entries = [];
  const segmentStartIndex = findFirstSortedIndex(route.segments, state.distance, (segment) => segment.start);
  for (let index = segmentStartIndex; index < route.segments.length; index += 1) {
    const segment = route.segments[index];
    const gap = segment.start - state.distance;
    if (gap > lookahead) {
      break;
    }
    if (segment.speedLimit == null) {
      continue;
    }

    entries.push({
      type: "curve",
      distance: roundDisplayDistance(gap),
      limitKph: toKph(segment.speedLimit),
      direction: segment.curvature >= 0 ? "Right" : "Left",
    });
  }

  const signalStartIndex = Math.max(state.nextSignalIndex || 0, findFirstSortedIndex(route.signals, state.distance));
  for (let index = signalStartIndex; index < route.signals.length; index += 1) {
    const signal = route.signals[index];
    const gap = signal.distance - state.distance;
    if (gap > lookahead) {
      break;
    }
    if (signal.passed) {
      continue;
    }

    entries.push({
      type: "signal",
      distance: roundDisplayDistance(gap),
      aspect: getSignalAspect(signal),
      limitKph: signal.kind === "yellow" ? toKph(signal.speedLimit) : null,
    });
  }

  return entries
    .sort((a, b) => a.distance - b.distance)
    .slice(0, TUNING.visuals.routePredictorMaxEntries);
}

function findUpcomingLimit() {
  const current = getEffectiveSpeedLimitInfo();
  let nextCurve = null;
  const segmentStartIndex = findFirstSortedIndex(route.segments, state.distance, (segment) => segment.start);
  for (let index = segmentStartIndex; index < route.segments.length; index += 1) {
    const segment = route.segments[index];
    if (segment.start - state.distance >= TUNING.route.upcomingCurveLookahead) {
      break;
    }
    if (segment.start > state.distance && segment.speedLimit != null) {
      nextCurve = segment;
      break;
    }
  }
  const nextSignal = getNextSignal();

  const candidates = [];
  if (nextCurve) {
    candidates.push({
      type: "curve",
      distance: nextCurve.start - state.distance,
      limit: nextCurve.speedLimit,
    });
  }
  if (nextSignal && nextSignal.distance > state.distance && nextSignal.distance - state.distance < TUNING.route.upcomingCurveLookahead) {
    candidates.push({
      type: nextSignal.kind,
      distance: nextSignal.distance - state.distance,
      limit: nextSignal.kind === "yellow" ? nextSignal.speedLimit : null,
      signal: nextSignal,
    });
  }

  const next = candidates.sort((a, b) => a.distance - b.distance)[0] || null;

  return {
    limit: current.limit,
    source: current.source,
    signal: current.signal,
    distance: next ? next.distance : null,
    upcomingLimit: next ? next.limit : null,
    upcomingType: next ? next.type : null,
    upcomingSignal: next ? next.signal || null : null,
  };
}

function getRedStopZone(signal) {
  const stopMetrics = getRedStopMetrics(signal);
  return {
    startDistance: stopMetrics.zoneStart,
    endDistance: stopMetrics.zoneEnd,
  };
}

function isInsideRedStopZone(signal, distance = state.distance) {
  const stopZone = getRedStopZone(signal);
  return distance >= stopZone.startDistance && distance <= stopZone.endDistance;
}

function processSignals(dt) {
  state.signalStatus = null;
  let nextRed = null;
  for (let index = state.nextSignalIndex || 0; index < route.signals.length; index += 1) {
    const signal = route.signals[index];
    if (signal.passed) {
      continue;
    }
    if (signal.distance < state.distance) {
      continue;
    }
    if (signal.kind === "red" && signal.aspect === "red") {
      nextRed = signal;
      break;
    }
  }

  if (!nextRed) {
    return false;
  }

  const gap = nextRed.distance - state.distance;
  const stopZone = getRedStopZone(nextRed);
  const inStopZone = isInsideRedStopZone(nextRed);
  if (gap <= TUNING.signals.redApproachDistance) {
    if (inStopZone && state.speed <= TUNING.signals.redStopSpeed) {
      nextRed.waitTimer += dt;
      const remaining = Math.max(0, nextRed.clearAfter - nextRed.waitTimer);
      state.signalStatus = {
        message: "Stopped at red signal",
        detail: remaining > 0.05 ? `Waiting ${remaining.toFixed(1)} s for green.` : "Signal clearing.",
      };
      state.requestedControl = Math.min(state.requestedControl, 0);
      if (nextRed.waitTimer >= nextRed.clearAfter) {
        nextRed.aspect = "green";
        state.signalStatus = {
          message: "Signal cleared",
          detail: "Proceed when ready.",
        };
      }
    } else if (state.distance <= stopZone.endDistance) {
      const zoneGap = stopZone.startDistance - state.distance;
      state.signalStatus = {
        message: "Red signal ahead",
        detail: zoneGap > 0 ? `Stop in the red zone in ${roundDisplayDistance(zoneGap)} m.` : "Hold the locomotive front inside the red zone.",
      };
    }
  }

  return false;
}

function processSignalPasses() {
  while ((state.nextSignalIndex || 0) < route.signals.length) {
    const signal = route.signals[state.nextSignalIndex];
    if (!signal || signal.distance > state.distance) {
      break;
    }

    state.nextSignalIndex += 1;
    if (signal.passed) {
      continue;
    }

    signal.passed = true;
    const aspect = getSignalAspect(signal);

    if (aspect === "red") {
      beginDerailment("Passed a red signal at stop.");
      return true;
    }

    if (signal.kind === "yellow" && state.speed > signal.speedLimit + OVERSPEED_FAIL_MARGIN) {
      const failReason = `Passed a ${toKph(signal.speedLimit)} km/h signal more than 10 km/h too fast.`;
      beginDerailment(failReason);
      return true;
    }
  }

  return false;
}

function getStopAssistData() {
  const nextStation = route.stations[state.stationIndex];
  if (!state.started || state.finished || !nextStation) {
    return null;
  }

  const stopMetrics = getStationStopMetrics(nextStation);
  const gap = stopMetrics.targetDistance - state.distance;
  if (Math.abs(gap) > STATION_ASSIST_RANGE) {
    return null;
  }

  const frontOffset = state.distance - stopMetrics.targetDistance;
  const markerPercent = clamp(
    ((frontOffset + STATION_ASSIST_ZOOM) / (STATION_ASSIST_ZOOM * 2)) * 100,
    TUNING.visuals.stopAssistMarkerMinPercent,
    TUNING.visuals.stopAssistMarkerMaxPercent,
  );

  return {
    station: nextStation,
    gap,
    markerPercent,
  };
}

function updateControls(dt) {
  if (keys.accelerate && !keys.brake) {
    state.requestedControl = clamp(state.requestedControl + dt * TUNING.controls.requestAccelRate, -1, 1);
  } else if (keys.brake && !keys.accelerate) {
    state.requestedControl = clamp(state.requestedControl - dt * TUNING.controls.requestBrakeRate, -1, 1);
  }

  const difference = state.requestedControl - state.actualControl;
  if (Math.abs(difference) < 1e-5) {
    return;
  }

  if (difference < 0 && state.actualControl > 0 && state.requestedControl < 0) {
    const releaseStep = Math.min(state.actualControl, TUNING.controls.tractionReleaseRate * dt);
    state.actualControl -= releaseStep;
    return;
  }

  let rate = TUNING.controls.responseDefault;
  if (difference < 0) {
    if (state.requestedControl < 0 && state.actualControl >= 0) {
      rate = TUNING.controls.brakeApplyFromPowerRate;
    } else if (state.requestedControl < 0) {
      rate = TUNING.controls.brakeBuildRate;
    } else {
      rate = TUNING.controls.powerCoastRate;
    }
  } else if (difference > 0) {
    if (state.actualControl < 0 && state.requestedControl >= 0) {
      rate = TUNING.controls.brakeReleaseToPowerRate;
    } else if (state.actualControl < 0) {
      rate = TUNING.controls.brakeReleaseRate;
    } else {
      rate = TUNING.controls.powerBuildRate;
    }
  }

  const step = clamp(difference, -rate * dt, rate * dt);
  state.actualControl += step;
}

function updatePhysics(dt) {
  const speedRatio = clamp(
    state.speed / TUNING.physics.tractionFadeReferenceSpeed,
    0,
    TUNING.physics.tractionFadeMaxRatio,
  );
  const tractionFade = 1
    - Math.pow(Math.min(speedRatio, 1), TUNING.physics.tractionFadeExponent) * TUNING.physics.tractionFadeAmount;
  const traction = Math.max(0, state.actualControl)
    * TUNING.physics.tractionForce
    * Math.max(TUNING.physics.tractionMinFactor, tractionFade);
  const braking = Math.max(0, -state.actualControl) * TUNING.physics.brakingForce;
  const drag = TUNING.physics.baseDrag + state.speed * state.speed * TUNING.physics.quadraticDrag;

  let acceleration = traction - braking - drag;
  if (state.speed < 0.08 && acceleration < 0) {
    acceleration = 0;
  }

  state.acceleration = acceleration;
  state.speed = clamp(state.speed + acceleration * dt, 0, TUNING.physics.speedCap);
  state.distance = clamp(
    state.distance + state.speed * dt * TUNING.physics.visibleSpeedMultiplier,
    0,
    route.totalLength,
  );
}

function beginDerailment(cause) {
  if (state.derailment) {
    return;
  }

  const direction = Math.random() < 0.5 ? -1 : 1;
  const units = getTrainUnits().map((unit, index) => ({
    ...unit,
    baseX: unit.pose.x,
    baseY: unit.pose.y,
    baseHeading: unit.pose.heading,
    forwardThrow: rand(14, 34) * (1 + index * 0.08),
    lateralThrow: direction * rand(12, 28) * (1 + index * 0.12),
    spinRate: rand(-1.8, 1.8) + direction * rand(0.25, 0.85),
    twistOffset: rand(-0.18, 0.18),
  }));

  state.derailment = {
    timer: 0,
    duration: 1.6,
    direction,
    cause,
    speedAtTrigger: state.speed,
    units,
  };
  state.requestedControl = 0;
  state.actualControl = 0;
  state.message = "Derailment";
  state.detail = "The consist has left the track. Run is ending.";
}

function updateDerailment(dt) {
  if (!state.derailment) {
    return false;
  }

  state.derailment.timer += dt;
  state.speed = Math.max(0, state.speed - dt * 22);
  state.overspeedTimer = Math.min(1.2, state.overspeedTimer + dt * 1.2);
  state.message = "Derailment";
  state.detail = "Cars are scattering off the track.";

  if (state.derailment.timer >= state.derailment.duration) {
    state.failed = true;
    state.finished = true;
    state.failReason = state.derailment.cause;
    state.detail = state.failReason;
    finishRun();
    return true;
  }

  return false;
}

function checkFailureConditions() {
  if (state.derailment) {
    return false;
  }

  const current = getEffectiveSpeedLimitInfo();
  if (current.limit == null) {
    return false;
  }

  if (state.speed > current.limit + OVERSPEED_FAIL_MARGIN) {
    const failReason = `Exceeded the ${toKph(current.limit)} km/h limit by more than 10 km/h.`;
    beginDerailment(failReason);
    return true;
  }

  return false;
}

function currentSegmentInfo() {
  const info = evaluateRoute(state.distance);
  return info;
}

function updatePenalties(dt) {
  const current = getEffectiveSpeedLimitInfo();
  if (current.limit == null) {
    state.overspeedTimer = Math.max(0, state.overspeedTimer - dt * TUNING.penalties.overspeedDecayRate);
    return;
  }

  const excess = state.speed - current.limit;
  if (excess > TUNING.penalties.overspeedThreshold) {
    const severity = excess / current.limit;
    state.penalties += dt * (TUNING.penalties.penaltyBase + severity * TUNING.penalties.penaltySeverityScale);
    state.overspeedTimer = Math.min(state.overspeedTimer + dt * TUNING.penalties.overspeedBuildRate, 1.2);
    state.message = "Curve overspeed";
    state.detail = "Wheel wear penalty is rising. Brake early before sharp turns.";
  } else {
    state.overspeedTimer = Math.max(0, state.overspeedTimer - dt * TUNING.penalties.overspeedDecayRate);
  }
}

function updateStations() {
  const nextStation = route.stations[state.stationIndex];
  if (!nextStation) {
    if (!state.finished) {
      state.finished = true;
      finishRun();
    }
    return;
  }

  const stopMetrics = getStationStopMetrics(nextStation);
  const gap = stopMetrics.targetDistance - state.distance;

  if (Math.abs(gap) <= stopMetrics.tolerance && state.speed <= STATION_STOP_SPEED) {
    const error = Math.abs(gap);
    state.stationResults.push({
      name: nextStation.name,
      error,
      missed: false,
    });
    state.lastStopError = error;
    state.stationIndex += 1;
    state.message = `Stopped at ${nextStation.name}`;
    state.detail = error < 4 ? "Excellent stop." : error < 10 ? "Solid stop." : "Safe, but you can be more precise.";
    state.requestedControl = 0;
    state.actualControl = lerp(state.actualControl, 0, 0.5);
    if (state.stationIndex >= route.stations.length) {
      state.finished = true;
      finishRun();
    }
    return;
  }

  if (gap < -STATION_PASS_MARGIN) {
    state.stationResults.push({
      name: nextStation.name,
      error: Math.abs(gap),
      missed: true,
    });
    state.penalties += 20;
    state.lastStopError = null;
    state.stationIndex += 1;
    state.message = `Missed ${nextStation.name}`;
    state.detail = "Heavy delay penalty applied. Start braking sooner on the next stop.";
  } else if (gap < 600 && gap > -60) {
    state.message = `Approaching ${nextStation.name}`;
    state.detail = "A 100 m train takes space. Start easing off well before the station target.";
  } else if (gap >= 600) {
    state.message = "Running between stations";
    state.detail = "Run fast on tangents, but read the next curve and station well ahead.";
  }
}

function finishRun() {
  finishCard.classList.remove("hidden");
  finishTitle.textContent = state.failed
    ? "Run failed"
    : state.stationResults.some((result) => result.missed)
      ? "Run finished with delays"
      : "Run complete";

  const successfulStops = state.stationResults.filter((result) => !result.missed);
  const meanError = successfulStops.length
    ? successfulStops.reduce((sum, result) => sum + result.error, 0) / successfulStops.length
    : null;

  const totalTime = state.elapsed + state.penalties;
  finishStats.innerHTML = "";
  const rows = [
    ["Driving time", formatTime(state.elapsed)],
    ["Penalty time", `${Math.floor(Math.max(0, state.penalties))} s`],
    ["Final total", formatTime(totalTime)],
    ["Average stop error", meanError == null ? "—" : `${meanError.toFixed(1)} m`],
  ];

  if (state.failed && state.failReason) {
    rows.unshift(["Failure", state.failReason]);
  }

  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "finish-row";
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    finishStats.appendChild(row);
  });
}

