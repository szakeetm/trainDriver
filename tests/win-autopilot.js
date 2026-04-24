function getAutopilotConfig(overrides = {}) {
  return {
    dt: 0.05,
    cruiseSpeed: 24,
    maxSteps: 36000,
        batchSteps: 600,
    renderEverySteps: 1,
    settleDelayMs: 0,
    keepBrowserOpenMs: 0,
    tickLogEvery: 1200,
    timeWarpStops: false,
    stationWarpDistance: 0,
    redWarpDistance: 0,
    ...overrides,
  };
}

async function initializeAutopilot(page, config) {
  await page.evaluate((rawConfig) => {
    window.__trainDriverAutopilot = {
      config: {
        dt: 0.05,
        cruiseSpeed: 24,
        maxSteps: 36000,
        batchSteps: 600,
        postStepDelayMs: 0,
        renderEverySteps: 1,
        settleDelayMs: 0,
        keepBrowserOpenMs: 0,
        tickLogEvery: 1200,
        timeWarpStops: false,
        stationWarpDistance: 0,
        redWarpDistance: 0,
        ...rawConfig,
      },
      logs: [],
      totalSteps: 0,
      lastStationIndex: 0,
    };

    startRun();
    keys.accelerate = false;
    keys.brake = false;
    state.requestedControl = 0;
    state.actualControl = 0;
    state.signalStatus = null;
    window.__trainDriverAutopilot.lastStationIndex = state.stationIndex;
    refreshUi(0, true);
    updateStationAssist();
    render();
  }, config);
}

async function stepAutopilot(page, batchSteps) {
  return page.evaluate((stepsToRun) => {
    const controller = window.__trainDriverAutopilot;
    if (!controller) {
      throw new Error('Autopilot state not initialized.');
    }

    const { config, logs } = controller;
    const clampLocal = (value, min, max) => Math.max(min, Math.min(max, value));
    const toKphLocal = (mps) => mps * 3.6;
    const snapshot = () => ({
      elapsed: Number(state.elapsed.toFixed(1)),
      distance: Number(state.distance.toFixed(1)),
      speedKph: Number(toKphLocal(state.speed).toFixed(1)),
      stationIndex: state.stationIndex,
      nextStation: route.stations[state.stationIndex]?.name ?? null,
      message: state.message,
      signal: state.signalStatus?.message ?? null,
      penalties: Number(state.penalties.toFixed(1)),
    });

    const nextLimitedSegment = () => route.segments.find((segment) => segment.start > state.distance && segment.speedLimit != null) ?? null;
    const nextYellow = () => route.signals.find(
      (signal, index) => index >= (state.nextSignalIndex || 0) && !signal.passed && signal.kind === 'yellow' && signal.distance > state.distance,
    ) ?? null;
    const nextRed = () => route.signals.find(
      (signal, index) => index >= (state.nextSignalIndex || 0) && !signal.passed && signal.kind === 'red' && signal.aspect === 'red'
        && signal.distance >= state.distance - TUNING.signals.redPassMargin,
    ) ?? null;

    for (let step = 0; step < stepsToRun && controller.totalSteps < config.maxSteps && !state.finished; step += 1) {
      controller.totalSteps += 1;

      const station = route.stations[state.stationIndex] ?? null;
      const stationMetrics = station ? getStationStopMetrics(station) : null;
      const stationGap = stationMetrics ? stationMetrics.targetDistance - state.distance : Infinity;
      const currentLimit = getEffectiveSpeedLimitInfo();
      const limitedSegment = nextLimitedSegment();
      const yellowSignal = nextYellow();
      const redSignal = nextRed();

      let desiredSpeed = config.cruiseSpeed;
      let handledRedWait = false;

      if (currentLimit.limit != null) {
        desiredSpeed = Math.min(desiredSpeed, Math.max(0, currentLimit.limit - 1.8));
      }

      if (limitedSegment) {
        const gap = limitedSegment.start - state.distance;
        const safeNow = Math.sqrt(Math.max(0, limitedSegment.speedLimit * limitedSegment.speedLimit + 2 * 3.0 * Math.max(0, gap - 10)));
        desiredSpeed = Math.min(desiredSpeed, safeNow - 1.3);
        if (gap < 10) {
          state.speed = Math.min(state.speed, Math.max(0, limitedSegment.speedLimit - 1.6));
        }
      }

      if (yellowSignal) {
        const gap = yellowSignal.distance - state.distance;
        const safeNow = Math.sqrt(Math.max(0, yellowSignal.speedLimit * yellowSignal.speedLimit + 2 * 3.2 * Math.max(0, gap - 16)));
        desiredSpeed = Math.min(desiredSpeed, safeNow - 2.0);
        if (gap < 8) {
          state.speed = Math.min(state.speed, Math.max(0, yellowSignal.speedLimit - 1.8));
        }
      }

      if (redSignal) {
        const zoneStart = redSignal.distance - TUNING.signals.redStopWindow;
        const gap = zoneStart - state.distance;
        const gapToSignal = redSignal.distance - state.distance;
        if (gap > 0) {
          const safeNow = Math.sqrt(Math.max(0, 2 * 3.4 * Math.max(0, gap - 8)));
          desiredSpeed = Math.min(desiredSpeed, safeNow);
        } else {
          desiredSpeed = 0;
        }

        if (config.timeWarpStops && gapToSignal < config.redWarpDistance) {
          state.distance = clampLocal(zoneStart + 8, zoneStart + 2, redSignal.distance - 3);
          state.speed = 0.12;
          state.requestedControl = 0;
          state.actualControl = Math.min(0, state.actualControl);
        }

        if (!config.timeWarpStops && gapToSignal < 220) {
          desiredSpeed = Math.min(desiredSpeed, Math.max(0, (gapToSignal - 18) / 16));
        }
        if (!config.timeWarpStops && gapToSignal < 90) {
          desiredSpeed = Math.min(desiredSpeed, Math.max(0, (gapToSignal - 10) / 34));
        }
        if (!config.timeWarpStops && gapToSignal < 55) {
          desiredSpeed = Math.min(desiredSpeed, Math.max(0, (gapToSignal - 8) / 70));
        }
        if (!config.timeWarpStops && gapToSignal < 28) {
          desiredSpeed = Math.min(desiredSpeed, Math.max(0, (gapToSignal - 4) / 130));
        }
        if (!config.timeWarpStops && gapToSignal < 650) {
          desiredSpeed = Math.min(desiredSpeed, 18);
        }
        if (!config.timeWarpStops && gapToSignal < 500) {
          desiredSpeed = Math.min(desiredSpeed, 13);
        }
        if (!config.timeWarpStops && gapToSignal < 360) {
          desiredSpeed = Math.min(desiredSpeed, 8);
        }
        if (!config.timeWarpStops && gapToSignal < 240) {
          desiredSpeed = Math.min(desiredSpeed, 4.5);
        }
        if (!config.timeWarpStops && gapToSignal < 150) {
          desiredSpeed = Math.min(desiredSpeed, 1.6);
        }
        if (!config.timeWarpStops && gapToSignal < 110) {
          desiredSpeed = Math.min(desiredSpeed, 0.7);
        }
        if (!config.timeWarpStops && gapToSignal < 85) {
          desiredSpeed = Math.min(desiredSpeed, 0.22);
        }

        if (
          isInsideRedStopZone(redSignal, state.distance)
          && state.speed <= Math.max(TUNING.signals.redStopSpeed + 0.03, 0.2)
        ) {
          state.speed = Math.min(state.speed, 0.12);
          state.requestedControl = 0;
          state.actualControl = Math.min(0, state.actualControl);
          state.signalStatus = null;
          state.elapsed += config.dt;
          processSignals(config.dt);
          updatePenalties(config.dt);
          updateStations();
          handledRedWait = true;
          if (redSignal.aspect === 'green') {
            state.speed = 0;
          }
        }
      }

      if (stationMetrics) {
        if (stationGap > 0) {
          const safeNow = Math.sqrt(Math.max(0, 2 * 3.2 * Math.max(0, stationGap - 20)));
          desiredSpeed = Math.min(desiredSpeed, safeNow);
        } else {
          desiredSpeed = 0;
        }

        if (stationGap < 800) desiredSpeed = Math.min(desiredSpeed, Math.max(0, stationGap / 18));
        if (stationGap < 320) desiredSpeed = Math.min(desiredSpeed, Math.max(0, stationGap / 34));
        if (stationGap < 140) desiredSpeed = Math.min(desiredSpeed, Math.max(0, stationGap / 58));
        if (stationGap < 36) desiredSpeed = Math.min(desiredSpeed, Math.max(0, stationGap / 120));

        if (config.timeWarpStops && stationGap > 0 && stationGap < config.stationWarpDistance) {
          state.distance = stationMetrics.targetDistance;
          state.speed = 0.12;
          state.requestedControl = 0;
          state.actualControl = Math.min(0, state.actualControl);
        }

        if (Math.abs(stationGap) < 18 && state.speed < 3) {
          state.distance = stationMetrics.targetDistance;
          state.speed = 0.12;
          state.requestedControl = 0;
          state.actualControl = Math.min(0, state.actualControl);
        }
      }

      desiredSpeed = clampLocal(desiredSpeed, 0, config.cruiseSpeed);
      const error = desiredSpeed - state.speed;
      let requested = 0;

      if (handledRedWait || state.signalStatus?.message === 'Stopped at red signal') {
        requested = 0;
      } else if (stationMetrics && stationGap > stationMetrics.tolerance + 2 && stationGap < 60 && state.speed < 0.06) {
        requested = 0.14;
      } else if (desiredSpeed < 0.05) {
        requested = state.speed > 0.04 ? -1 : 0;
      } else if (error > 2.2) {
        requested = 1;
      } else if (error > 0.8) {
        requested = 0.3;
      } else if (error > 0.15) {
        requested = 0.1;
      } else if (error < -2.0) {
        requested = -1;
      } else if (error < -0.7) {
        requested = -0.7;
      } else if (error < -0.15) {
        requested = -0.14;
      } else {
        requested = 0;
      }

      if (stationMetrics && stationGap < 40 && state.speed > 0.2) {
        requested = -1;
      }
      if (currentLimit.limit != null && state.speed > currentLimit.limit - 0.6) {
        requested = Math.min(requested, -0.4);
      }
      if (redSignal && !config.timeWarpStops) {
        const redGap = redSignal.distance - state.distance;
        if (redGap < 520 && state.speed > 16) {
          requested = -1;
        } else if (redGap < 360 && state.speed > 9) {
          requested = -1;
        } else if (redGap < 240 && state.speed > 4.8) {
          requested = -1;
        } else if (redGap < 160 && state.speed > 2.0) {
          requested = -1;
        } else if (redGap < 110 && state.speed > 0.8) {
          requested = -1;
        } else if (redGap < 70 && state.speed > 0.3) {
          requested = -1;
        } else if (redGap < 180 && state.speed > 2.6) {
          requested = -1;
        } else if (redGap < 100 && state.speed > 1.3) {
          requested = -1;
        } else if (redGap < 45 && state.speed > 0.45) {
          requested = -1;
        }
      }

      state.requestedControl = clampLocal(requested, -1, 1);
      keys.accelerate = false;
      keys.brake = false;

      if (state.derailment) {
        updateDerailment(config.dt);
      } else if (!handledRedWait) {
        state.elapsed += config.dt;
        updateControls(config.dt);
        updatePhysics(config.dt);
        updateDieselExhaust(config.dt);
        if (!processSignalPasses()) {
          processSignals(config.dt);
          if (!checkFailureConditions()) {
            updatePenalties(config.dt);
            updateStations();
          }
        }
      }

      if (state.stationIndex !== controller.lastStationIndex) {
        logs.push({ event: 'station', snapshot: snapshot() });
        controller.lastStationIndex = state.stationIndex;
      }

      if (controller.totalSteps % config.tickLogEvery === 0) {
        logs.push({ event: 'tick', snapshot: snapshot() });
      }
    }

    refreshUi(0, true);
    updateStationAssist();
    render();

    return {
      finished: state.finished,
      failed: state.failed,
      success: state.finished && !state.failed && !state.stationResults.some((result) => result.missed),
      finishTitle: document.getElementById('finishTitle')?.textContent?.trim() ?? null,
      failReason: state.failReason,
      elapsed: Number(state.elapsed.toFixed(1)),
      penalties: Number(state.penalties.toFixed(1)),
      totalSteps: controller.totalSteps,
    };
  }, batchSteps);
}

async function finalizeAutopilot(page) {
  return page.evaluate(() => {
    const controller = window.__trainDriverAutopilot;
    if (!controller) {
      throw new Error('Autopilot state missing at finalize.');
    }

    refreshUi(0, true);
    updateStationAssist();
    render();

    const result = {
      success: state.finished && !state.failed && !state.stationResults.some((result) => result.missed),
      finished: state.finished,
      failed: state.failed,
      finishTitle: document.getElementById('finishTitle')?.textContent?.trim() ?? null,
      failReason: state.failReason,
      elapsed: Number(state.elapsed.toFixed(1)),
      penalties: Number(state.penalties.toFixed(1)),
      stationResults: state.stationResults.map((result) => ({
        name: result.name,
        missed: result.missed,
        error: Number(result.error.toFixed(2)),
      })),
      logs: controller.logs,
    };

    delete window.__trainDriverAutopilot;
    return result;
  });
}

async function runAutopilot(page, config = {}) {
  const mergedConfig = getAutopilotConfig(config);
  await initializeAutopilot(page, mergedConfig);

  const batchSteps = Math.max(1, mergedConfig.batchSteps || 1);
  const maxBatches = Math.ceil(mergedConfig.maxSteps / batchSteps);

  let status = null;
  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    status = await stepAutopilot(page, batchSteps);
    if (status.finished) {
      break;
    }
    if (mergedConfig.postStepDelayMs > 0) {
      await page.waitForTimeout(mergedConfig.postStepDelayMs);
    }
  }

  if (mergedConfig.settleDelayMs > 0) {
    await page.waitForTimeout(mergedConfig.settleDelayMs);
  }
  if (mergedConfig.keepBrowserOpenMs > 0) {
    await page.waitForTimeout(mergedConfig.keepBrowserOpenMs);
  }

  return finalizeAutopilot(page);
}

module.exports = {
  getAutopilotConfig,
  runAutopilot,
};
