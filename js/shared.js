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

function mergeConfig(base, overrides) {
  const result = cloneConfigValue(base);

  if (!overrides || typeof overrides !== "object") {
    return result;
  }

  Object.entries(overrides).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      result[key] = cloneConfigValue(value);
      return;
    }

    if (value && typeof value === "object" && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
      result[key] = mergeConfig(result[key], value);
      return;
    }

    result[key] = value;
  });

  return result;
}

function formatHslColor(hue, saturation, lightness) {
  return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

function createStationVisual() {
  const hue = Math.random() * 360;
  return {
    buildingColor: formatHslColor(hue, 52 + Math.random() * 14, 56 + Math.random() * 10),
    roofColor: formatHslColor(hue, 28 + Math.random() * 10, 28 + Math.random() * 8),
    buildingSide: Math.random() < 0.5 ? -1 : 1,
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
  STATION_PASS_MARGIN = TUNING.stations.passMargin;
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
  return 50;
}

function getZoneSlackTolerance(zoneLength = getStationZoneLength()) {
  return Math.max(0, (zoneLength - TRAIN_TOTAL_LENGTH) * 0.5);
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

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function hashNoise(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function choose(list) {
  return list[Math.floor(Math.random() * list.length)];
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

  if (state.finished) {
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

function setButtonHold(button, key) {
  const engage = (event) => {
    if (event) {
      event.preventDefault();
    }
    keys[key] = true;
  };
  const release = () => {
    keys[key] = false;
  };

  button.addEventListener("pointerdown", (event) => {
    engage(event);
    if (typeof button.setPointerCapture === "function") {
      try {
        button.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore unsupported pointer-capture cases and fall back to regular events.
      }
    }
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("mousedown", engage);
  button.addEventListener("mouseup", (event) => {
    unlockGameAudioFromGesture(event, { forceRetry: true });
    release();
  });
  button.addEventListener("mouseleave", release);
  button.addEventListener("touchstart", engage, { passive: false });
  button.addEventListener("touchend", (event) => {
    unlockGameAudioFromGesture(event, { forceRetry: true });
  }, { passive: true });
  button.addEventListener("touchend", release, { passive: true });
  button.addEventListener("touchcancel", release, { passive: true });
  button.addEventListener("click", (event) => {
    unlockGameAudioFromGesture(event, { forceRetry: true });
  });
}

setButtonHold(accelerateButton, "accelerate");
setButtonHold(brakeButton, "brake");

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "w", "W"].includes(event.key)) {
    keys.accelerate = true;
    event.preventDefault();
  }
  if (["ArrowDown", "s", "S"].includes(event.key)) {
    keys.brake = true;
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  if (["ArrowUp", "w", "W"].includes(event.key)) {
    keys.accelerate = false;
  }
  if (["ArrowDown", "s", "S"].includes(event.key)) {
    keys.brake = false;
  }
});

window.addEventListener("blur", () => {
  keys.accelerate = false;
  keys.brake = false;
});

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (droneInsetRenderer) {
    droneInsetRenderer.resize();
  }
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
      rearX: renderX - Math.cos(renderHeading) * unit.length * 0.5,
      rearY: renderY - Math.sin(renderHeading) * unit.length * 0.5,
      frontX: renderX + Math.cos(renderHeading) * unit.length * 0.5,
      frontY: renderY + Math.sin(renderHeading) * unit.length * 0.5,
    };
  });
}

