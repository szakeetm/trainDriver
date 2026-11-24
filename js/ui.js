let lastAssistVisibility = null;
let lastAssistStationTitle = "";
let lastAssistDistanceText = "";
let lastAssistMarkerLeft = "";

function updateStationAssist() {
  const assist = getStopAssistData();

  if (assist) {
    if (lastAssistVisibility !== true) {
      stationAssist.classList.remove("hidden");
      lastAssistVisibility = true;
    }

    if (lastAssistStationTitle !== assist.station.name) {
      assistStationTitle.textContent = assist.station.name;
      lastAssistStationTitle = assist.station.name;
    }

    const distanceText = assist.gap >= 0
      ? `Locomotive front ${Math.abs(assist.gap).toFixed(1)} m short of the stop mark.`
      : `Locomotive front ${Math.abs(assist.gap).toFixed(1)} m beyond the stop mark.`;
    if (lastAssistDistanceText !== distanceText) {
      assistDistanceText.textContent = distanceText;
      lastAssistDistanceText = distanceText;
    }

    const markerLeft = `${assist.markerPercent}%`;
    if (lastAssistMarkerLeft !== markerLeft) {
      assistFrontMarker.style.left = markerLeft;
      lastAssistMarkerLeft = markerLeft;
    }
    return;
  }

  if (lastAssistVisibility !== false) {
    stationAssist.classList.add("hidden");
    lastAssistVisibility = false;
  }
}

function updateUi() {
  if (!route || !state) {
    return;
  }

  const nextStation = route.stations[state.stationIndex];
  const shownLimit = getEffectiveSpeedLimitInfo().limit;
  const gap = nextStation ? getStationStopMetrics(nextStation).targetDistance - state.distance : 0;
  const statusMessage = state.signalStatus ? state.signalStatus.message : state.message;
  const statusDetail = state.signalStatus ? state.signalStatus.detail : state.detail;

  statusText.textContent = statusMessage;
  subStatus.textContent = statusDetail;
  speedKph.textContent = toKph(state.speed);
  lineLimitKph.textContent = shownLimit == null ? "—" : toKph(shownLimit);
  distanceToStation.textContent = nextStation ? `${Math.max(0, roundDisplayDistance(gap))} m` : "Arrived";
  stationName.textContent = nextStation ? nextStation.name : "All stations served";
  const progressPercent = getGameProgressPercent();
  gameProgress.textContent = Math.round(progressPercent);
  gameProgressFill.style.width = `${progressPercent}%`;
  elapsedTime.textContent = formatTime(state.elapsed);
  penaltyTime.textContent = String(Math.floor(Math.max(0, state.penalties)));
  stopError.textContent = state.lastStopError == null ? "—" : `${state.lastStopError.toFixed(1)} m`;
  if (consistInfo) consistInfo.textContent = `${state.carCount} cars · ${Math.round(TRAIN_TOTAL_LENGTH)} m`;
  renderRemainingStations();

  // Power side shows turbo-limited output; braking shows the applied brake.
  const appliedControl = state.actualControl > 0 ? state.tractionOutput ?? state.actualControl : state.actualControl;
  updateBar(actualFill, appliedControl);
  updateMarker(requestedMarker, state.requestedControl);
  requestedLabel.textContent = `Target ${controlLabel(state.requestedControl)}`;
  actualLabel.textContent = controlLabel(appliedControl);
  const delta = Math.abs(state.requestedControl - appliedControl);
  controlDelta.textContent = delta < 0.04 ? "Tracking" : `Lag ${Math.round(delta * 100)}%`;

  accelerateButton.classList.toggle("active", keys.accelerate);
  brakeButton.classList.toggle("active", keys.brake);
}

function refreshUi(dt = 0, force = false) {
  uiRefreshCarry += dt;
  if (!force && uiRefreshCarry < UI_REFRESH_INTERVAL) {
    return;
  }

  uiRefreshCarry = 0;
  updateUi();
}

function updateBar(element, value) {
  const center = 50;
  const magnitude = Math.abs(value) * 50;
  element.style.width = `${magnitude}%`;
  element.style.left = value >= 0 ? `${center}%` : `${center - magnitude}%`;
  element.style.background = value >= 0
    ? getPowerBarGradient(value)
    : "linear-gradient(90deg, #58a8ff, #7ed3ff)";
}

// The turbo-gated top band of power fades from amber toward white.
function getPowerBarGradient(value) {
  const turboStart = 1 - TUNING.engine.turboPowerShare;
  if (value <= turboStart) {
    return "linear-gradient(90deg, #f6a23f, #ffc160)";
  }
  const boost = clamp((value - turboStart) / TUNING.engine.turboPowerShare, 0, 1);
  const channel = (from) => Math.round(lerp(from, 255, boost));
  const stop = (turboStart / value) * 100;
  return `linear-gradient(90deg, #f6a23f 0%, #ffc160 ${stop.toFixed(1)}%, `
    + `rgb(${channel(255)}, ${channel(193)}, ${channel(96)}) 100%)`;
}

function updateMarker(element, value) {
  element.style.left = `${50 + value * 50}%`;
}

