function cloneConfigValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneConfigValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneConfigValue(nestedValue)]),
    );
  }

  return value;
}

function formatHslColor(hue, saturation, lightness) {
  return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

function createStationVisual() {
  const hue = worldRandom() * 360;
  return {
    buildingColor: formatHslColor(hue, 52 + worldRandom() * 14, 56 + worldRandom() * 10),
    roofColor: formatHslColor(hue, 28 + worldRandom() * 10, 28 + worldRandom() * 8),
    buildingSide: worldRandom() < 0.5 ? -1 : 1,
  };
}

function buildRandomizedConsist(consist) {
  const sharedHue = Math.random() * 360;

  return consist.map((unit, index) => {
    const hueOffset = unit.type === "locomotive"
      ? Math.random() * 36 - 18
      : (index - 1) * 22 + (Math.random() * 28 - 14);
    const hue = (sharedHue + hueOffset + 360) % 360;
    const saturation = unit.type === "locomotive"
      ? 72 + Math.random() * 18
      : 32 + Math.random() * 22;
    const lightness = unit.type === "locomotive"
      ? 52 + Math.random() * 10
      : 60 + Math.random() * 10;
    const roofSaturation = Math.max(14, saturation * 0.28);
    const roofLightness = Math.min(92, lightness + 26);

    return {
      ...unit,
      bodyColor: formatHslColor(hue, saturation, lightness),
      roofColor: formatHslColor(hue, roofSaturation, roofLightness),
    };
  });
}

function applyTuning() {
  TUNING = cloneConfigValue(DEFAULT_TUNING);

  MAX_LINE_SPEED = TUNING.limits.maxLineSpeed;
  STATION_WINDOW = TUNING.stations.stopWindow;
  STATION_STOP_SPEED = TUNING.stations.stopSpeed;
  STATION_ASSIST_RANGE = TUNING.stations.assistRange;
  STATION_ASSIST_ZOOM = TUNING.stations.assistZoom;
  OVERSPEED_FAIL_MARGIN = TUNING.limits.overspeedFailMarginKph / KPH_PER_MPS;
  TRACK_WIDTH = TUNING.train.trackWidth;
  TRAIN_CONSIST = buildRandomizedConsist(TUNING.train.consist);
  COUPLER_GAP = TUNING.train.couplerGap;
  MAX_POWER_KW = TUNING.train.maxPowerKw;
  MAX_BRAKE_PRESSURE_BAR = TUNING.train.maxBrakePressureBar;
  TRAIN_TOTAL_LENGTH = TRAIN_CONSIST.reduce(
    (sum, unit, index) => sum + unit.length + (index === 0 ? 0 : COUPLER_GAP),
    0,
  );
  TOTAL_STATIONS = TUNING.stations.total;
}

function getStationZoneLength() {
  return TRAIN_TOTAL_LENGTH * 1.2;
}

function getStationStopTolerance() {
  return STATION_WINDOW;
}

function getStationStopMetrics(station) {
  const zoneLength = getStationZoneLength();
  const zoneHalfLength = zoneLength * 0.5;
  return {
    zoneLength,
    zoneStart: station.distance - zoneHalfLength,
    zoneEnd: station.distance + zoneHalfLength,
    targetDistance: station.distance + TRAIN_TOTAL_LENGTH * 0.5,
    tolerance: getStationStopTolerance(),
  };
}

function getRedStopMetrics(signal) {
  const zoneLength = TUNING.signals.redStopWindow;
  return {
    zoneLength,
    zoneStart: signal.distance - zoneLength,
    zoneEnd: signal.distance,
    targetDistance: signal.distance,
    tolerance: zoneLength,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

let worldRandom = Math.random;

function rand(min, max) {
  return min + worldRandom() * (max - min);
}

function hashNoise(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function choose(list) {
  return list[Math.floor(worldRandom() * list.length)];
}

function chooseDifferent(list, previous) {
  const options = previous == null ? list : list.filter((item) => item !== previous);
  return choose(options.length ? options : list);
}

function formatTime(totalSeconds) {
  const wholeSeconds = Math.floor(Math.max(0, totalSeconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function roundDisplayDistance(distance) {
  return Math.round(distance / 50) * 50;
}

function formatDistanceKm(distance) {
  return `${(Math.max(0, distance) / 1000).toFixed(1)} km`;
}

function toKph(speedMetersPerSecond) {
  return Math.round(speedMetersPerSecond * KPH_PER_MPS);
}

function getGameProgressPercent() {
  const finalStation = route?.stations?.[route.stations.length - 1];
  if (!finalStation || finalStation.distance <= 0) {
    return 0;
  }

  if (state.finished && !state.failed) {
    return 100;
  }

  return clamp((state.distance / finalStation.distance) * 100, 0, 100);
}

function renderRemainingStations() {
  const upcomingStations = route.stations.slice(state.stationIndex);

  if (!upcomingStations.length) {
    if (remainingStationsKey !== "__empty__") {
      remainingStations.textContent = "";
      const item = document.createElement("li");
      item.className = "station-progress-empty";
      item.textContent = "No remaining stations.";
      remainingStations.appendChild(item);
      remainingStationsKey = "__empty__";
      remainingStationEntries = [];
    }
    return;
  }

  const stationsKey = upcomingStations.map((station) => station.name).join("|");
  if (stationsKey !== remainingStationsKey) {
    remainingStations.textContent = "";
    const fragment = document.createDocumentFragment();
    remainingStationEntries = upcomingStations.map((station) => {
      const item = document.createElement("li");
      item.className = "station-progress-item";
      const name = document.createElement("strong");
      name.textContent = station.name;
      const distance = document.createElement("span");
      item.append(name, distance);
      fragment.appendChild(item);
      return { station, distance };
    });
    remainingStations.appendChild(fragment);
    remainingStationsKey = stationsKey;
  }

  remainingStationEntries.forEach(({ station, distance }) => {
    const nextDistance = formatDistanceKm(getStationStopMetrics(station).targetDistance - state.distance);
    if (distance.textContent !== nextDistance) {
      distance.textContent = nextDistance;
    }
  });
}

function syncAssistLegend() {
  assistLegendMin.textContent = `-${STATION_ASSIST_ZOOM} m`;
  assistLegendMax.textContent = `+${STATION_ASSIST_ZOOM} m`;

  if (!assistScale || !assistWindow || STATION_ASSIST_ZOOM <= 0) {
    return;
  }

  const acceptancePercent = clamp((getStationStopTolerance() / STATION_ASSIST_ZOOM) * 100, 0, 100);
  const leftPercent = (100 - acceptancePercent) * 0.5;
  assistScale.style.setProperty("--assist-window-left", `${leftPercent}%`);
  assistScale.style.setProperty("--assist-window-width", `${acceptancePercent}%`);
}

const heldControlInputs = { accelerate: new Set(), brake: new Set() };

function setControlInput(key, source, held) {
  const inputs = heldControlInputs[key];
  if (held) inputs.add(source);
  else inputs.delete(source);
  keys[key] = inputs.size > 0;
}

function clearHeldControls() {
  for (const key of Object.keys(heldControlInputs)) {
    heldControlInputs[key].clear();
    keys[key] = false;
  }
}

function setButtonHold(button, key) {
  if (window.PointerEvent) {
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      setControlInput(key, `pointer-${event.pointerId}`, true);
      if (typeof button.setPointerCapture === "function") {
        try {
          button.setPointerCapture(event.pointerId);
        } catch (error) {
          // Synthetic events and older browsers may not support capture.
        }
      }
    });
    const release = (event) => setControlInput(key, `pointer-${event.pointerId}`, false);
    button.addEventListener("pointerup", (event) => {
      release(event);
      unlockGameAudioFromGesture(event, { forceRetry: true });
    });
    button.addEventListener("pointerleave", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  } else {
    button.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      setControlInput(key, "mouse", true);
    });
    button.addEventListener("mouseup", (event) => {
      setControlInput(key, "mouse", false);
      unlockGameAudioFromGesture(event, { forceRetry: true });
    });
    button.addEventListener("mouseleave", () => setControlInput(key, "mouse", false));
    button.addEventListener("touchstart", (event) => {
      event.preventDefault();
      for (const touch of event.changedTouches) setControlInput(key, `touch-${touch.identifier}`, true);
    }, { passive: false });
    const releaseTouches = (event) => {
      for (const touch of event.changedTouches) setControlInput(key, `touch-${touch.identifier}`, false);
    };
    button.addEventListener("touchend", (event) => {
      releaseTouches(event);
      unlockGameAudioFromGesture(event, { forceRetry: true });
    }, { passive: true });
    button.addEventListener("touchcancel", releaseTouches, { passive: true });
  }
  button.addEventListener("click", (event) => {
    unlockGameAudioFromGesture(event, { forceRetry: true });
  });
}

setButtonHold(accelerateButton, "accelerate");
setButtonHold(brakeButton, "brake");

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp") {
    setControlInput("accelerate", "keyboard", true);
    event.preventDefault();
  }
  if (event.key === "ArrowDown") {
    setControlInput("brake", "keyboard", true);
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowUp") {
    setControlInput("accelerate", "keyboard", false);
  }
  if (event.key === "ArrowDown") {
    setControlInput("brake", "keyboard", false);
  }
});

window.addEventListener("blur", clearHeldControls);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearHeldControls();
});

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  // Bound backing-store memory on high-density mobile screens and large tablets.
  const scale = Math.min(window.devicePixelRatio || 1, 2,
    4096 / rect.width, 4096 / rect.height,
    Math.sqrt(4 * 1024 * 1024 / (rect.width * rect.height)));
  const width = Math.max(1, Math.floor(rect.width * scale));
  const height = Math.max(1, Math.floor(rect.height * scale));
  // Assigning either dimension clears the scene and resets the context, even
  // when unchanged. Safari can fire resize events as its browser chrome moves.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.setTransform(width / canvas.clientWidth, 0, 0, height / canvas.clientHeight, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function getTrainUnits() {
  let frontCursor = state.distance;
  return TRAIN_CONSIST.map((unit) => {
    const centerDistance = frontCursor - unit.length * 0.5;
    const rearDistance = frontCursor - unit.length;
    const result = {
      ...unit,
      centerDistance,
      frontDistance: frontCursor,
      rearDistance,
      pose: evaluateRoute(centerDistance),
    };
    frontCursor = rearDistance - COUPLER_GAP;
    return result;
  });
}

function getRenderedTrainUnits() {
  const derailment = state.derailment;
  const units = derailment ? derailment.units : getTrainUnits();
  const derailProgress = derailment
    ? easeOutCubic(clamp(derailment.timer / derailment.duration, 0, 1))
    : 0;

  return units.map((unit) => {
    if (!derailment) {
      const rearPose = evaluateRoute(unit.rearDistance);
      const frontPose = evaluateRoute(unit.frontDistance);
      return {
        ...unit,
        renderX: unit.pose.x,
        renderY: unit.pose.y,
        renderHeading: unit.pose.heading,
        renderElevation: unit.pose.elevation,
        renderPitch: Math.atan2(frontPose.elevation - rearPose.elevation, unit.length),
        rearElevation: rearPose.elevation,
        frontElevation: frontPose.elevation,
        rearX: rearPose.x,
        rearY: rearPose.y,
        frontX: frontPose.x,
        frontY: frontPose.y,
      };
    }

    const forwardAmount = unit.forwardThrow * derailProgress * (1 + derailProgress * 0.35);
    const lateralAmount = unit.lateralThrow * derailProgress;
    const forwardX = Math.cos(unit.baseHeading) * forwardAmount;
    const forwardY = Math.sin(unit.baseHeading) * forwardAmount;
    const normalX = -Math.sin(unit.baseHeading) * lateralAmount;
    const normalY = Math.cos(unit.baseHeading) * lateralAmount;
    const renderHeading = unit.baseHeading + unit.twistOffset * derailProgress + unit.spinRate * derailProgress;
    const renderX = unit.baseX + forwardX + normalX;
    const renderY = unit.baseY + forwardY + normalY;

    return {
      ...unit,
      renderX,
      renderY,
      renderHeading,
      renderElevation: unit.baseElevation,
      rearElevation: unit.baseElevation,
      frontElevation: unit.baseElevation,
      renderPitch: 0,
      rearX: renderX - Math.cos(renderHeading) * unit.length * 0.5,
      rearY: renderY - Math.sin(renderHeading) * unit.length * 0.5,
      frontX: renderX + Math.cos(renderHeading) * unit.length * 0.5,
      frontY: renderY + Math.sin(renderHeading) * unit.length * 0.5,
    };
  });
}

