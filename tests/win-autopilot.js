function getAutopilotConfig(overrides = {}) {
  return {
    dt: 0.05,
    cruiseSpeed: 24,
    maxSteps: 36000,
    batchSteps: 600,
    renderEverySteps: 600,
    postStepDelayMs: 0,
    settleDelayMs: 0,
    keepBrowserOpenMs: 0,
    tickLogEvery: 1200,
    ...overrides,
  };
}

async function initializeAutopilot(page, config) {
  await page.evaluate(rawConfig => {
    startRun();
    window.__trainDriverAutopilot = {
      config: rawConfig,
      logs: [],
      totalSteps: 0,
      lastStationIndex: state.stationIndex,
    };
    render();
  }, config);
}

async function stepAutopilot(page, batchSteps) {
  return page.evaluate(stepsToRun => {
    const driver = window.__trainDriverAutopilot;
    const { config, logs } = driver;
    const snapshot = () => ({
      elapsed: Number(state.elapsed.toFixed(1)),
      distance: Number(state.distance.toFixed(1)),
      speedKph: Number((state.speed * 3.6).toFixed(1)),
      stationIndex: state.stationIndex,
      nextStation: route.stations[state.stationIndex]?.name ?? null,
      message: state.message,
      signal: state.signalStatus?.message ?? null,
      penalties: Number(state.penalties.toFixed(1)),
    });

    for (let step = 0; step < stepsToRun && driver.totalSteps < config.maxSteps && !state.finished; step++) {
      driver.totalSteps++;
      const multiplier = TUNING.physics.visibleSpeedMultiplier;
      const planningDeceleration = 0.65;
      const responseSeconds = 6;
      // Include response lag in the braking envelope. The driver only requests
      // power/braking; speed, position, clearance, and scoring belong to update().
      const approachSpeed = (gap, targetSpeed = 0) => {
        const remaining = Math.max(0, gap / multiplier - state.speed * responseSeconds);
        return Math.sqrt(targetSpeed * targetSpeed + 2 * planningDeceleration * remaining);
      };
      let desiredSpeed = config.cruiseSpeed;
      const currentLimit = getEffectiveSpeedLimitInfo().limit;
      if (currentLimit != null) desiredSpeed = Math.min(desiredSpeed, Math.max(0, currentLimit - 1.5));
      for (const segment of route.segments) {
        const gap = segment.start - state.distance;
        if (gap > 2000) break;
        if (gap > 0 && segment.speedLimit != null) {
          desiredSpeed = Math.min(desiredSpeed, approachSpeed(gap, Math.max(0, segment.speedLimit - 1.5)));
        }
      }
      let waitingAtRed = false;
      for (let index = state.nextSignalIndex; index < route.signals.length; index++) {
        const signal = route.signals[index];
        const gap = signal.distance - state.distance;
        if (gap > 2000) break;
        if (signal.passed || gap < 0) continue;
        if (signal.kind === 'yellow') {
          desiredSpeed = Math.min(desiredSpeed, approachSpeed(gap, Math.max(0, signal.speedLimit - 1.5)));
        } else if (signal.kind === 'red' && signal.aspect === 'red') {
          desiredSpeed = Math.min(desiredSpeed, approachSpeed(gap - TUNING.signals.redStopWindow * 0.5));
          waitingAtRed = isInsideRedStopZone(signal) && state.speed <= TUNING.signals.redStopSpeed;
          break;
        }
      }
      const station = route.stations[state.stationIndex];
      if (station) {
        const gap = getStationStopMetrics(station).targetDistance - state.distance;
        desiredSpeed = Math.min(desiredSpeed, approachSpeed(gap));
      }

      const gradeForce = -TUNING.physics.gravity * Math.sin(Math.atan(getConsistGrade()));
      const drag = TUNING.physics.baseDrag + state.speed * state.speed * TUNING.physics.quadraticDrag;
      const predictedSpeed = state.speed + state.acceleration * 3;
      const demand = (desiredSpeed - predictedSpeed) * 0.7 - gradeForce + drag;
      const fadeRatio = Math.min(state.speed / TUNING.physics.tractionFadeReferenceSpeed, 1);
      const traction = TUNING.physics.tractionForce * Math.max(TUNING.physics.tractionMinFactor,
        1 - Math.pow(fadeRatio, TUNING.physics.tractionFadeExponent) * TUNING.physics.tractionFadeAmount);
      state.requestedControl = waitingAtRed ? -1 : clamp(demand / (demand >= 0 ? traction : TUNING.physics.brakingForce), -1, 1);
      update(config.dt);

      if (state.stationIndex !== driver.lastStationIndex) {
        logs.push({ event: 'station', snapshot: snapshot() });
        driver.lastStationIndex = state.stationIndex;
      }
      if (driver.totalSteps % config.tickLogEvery === 0) logs.push({ event: 'tick', snapshot: snapshot() });
      if (driver.totalSteps % config.renderEverySteps === 0) {
        updateStationAssist();
        render();
      }
    }
    return { finished: state.finished };
  }, batchSteps);
}

async function runAutopilot(page, overrides = {}) {
  const config = getAutopilotConfig(overrides);
  await initializeAutopilot(page, config);
  const batchSteps = Math.max(1, config.batchSteps);
  for (let batch = 0; batch < Math.ceil(config.maxSteps / batchSteps); batch++) {
    const result = await stepAutopilot(page, batchSteps);
    if (result.finished) break;
    if (config.postStepDelayMs > 0) await page.waitForTimeout(config.postStepDelayMs);
  }
  if (config.settleDelayMs > 0) await page.waitForTimeout(config.settleDelayMs);
  if (config.keepBrowserOpenMs > 0) await page.waitForTimeout(config.keepBrowserOpenMs);
  return page.evaluate(() => {
    const driver = window.__trainDriverAutopilot;
    refreshUi(0, true);
    updateStationAssist();
    render();
    const result = {
      success: state.finished && !state.failed && !state.stationResults.some(stop => stop.missed),
      finished: state.finished,
      failed: state.failed,
      finishTitle: finishTitle.textContent.trim(),
      failReason: state.failReason,
      elapsed: Number(state.elapsed.toFixed(1)),
      penalties: Number(state.penalties.toFixed(1)),
      totalSteps: driver.totalSteps,
      stationResults: state.stationResults.map(stop => ({ ...stop, error: Number(stop.error.toFixed(2)) })),
      logs: driver.logs,
    };
    delete window.__trainDriverAutopilot;
    return result;
  });
}

module.exports = { getAutopilotConfig, runAutopilot };
