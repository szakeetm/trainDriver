function updateUi() {
  if (!route || !state) {
    return;
  }

  const nextStation = route.stations[state.stationIndex];
  const upcomingLimit = findUpcomingLimit();
  const shownLimit = upcomingLimit.limit;
  const shownUpcomingLimit = upcomingLimit.upcomingLimit;
  const gap = nextStation ? getStationStopMetrics(nextStation).targetDistance - state.distance : 0;
  const assist = getStopAssistData();
  const statusMessage = state.signalStatus ? state.signalStatus.message : state.message;
  const statusDetail = state.signalStatus ? state.signalStatus.detail : state.detail;

  statusText.textContent = statusMessage;
  subStatus.textContent = statusDetail;
  speedKph.textContent = toKph(state.speed);
  lineLimitKph.textContent = shownLimit == null ? "No limit" : toKph(shownLimit);
  lineLimitSecondary.textContent = shownLimit == null
    ? "Line unrestricted"
    : `Curve limit ${toKph(shownLimit)} km/h`;
  distanceToStation.textContent = nextStation ? `${Math.max(0, roundDisplayDistance(gap))} m` : "Arrived";
  stationName.textContent = nextStation ? nextStation.name : "All stations served";
  const progressPercent = getGameProgressPercent();
  gameProgress.textContent = Math.round(progressPercent);
  gameProgressFill.style.width = `${progressPercent}%`;
  elapsedTime.textContent = formatTime(state.elapsed);
  penaltyTime.textContent = String(Math.floor(Math.max(0, state.penalties)));
  stopError.textContent = state.lastStopError == null ? "—" : `${state.lastStopError.toFixed(1)} m`;
  renderRemainingStations();

  updateBar(actualFill, state.actualControl);
  updateMarker(requestedMarker, state.requestedControl);
  requestedLabel.textContent = `Target ${controlLabel(state.requestedControl)}`;
  actualLabel.textContent = controlLabel(state.actualControl);
  const delta = Math.abs(state.requestedControl - state.actualControl);
  controlDelta.textContent = delta < 0.04 ? "Tracking" : `Lag ${Math.round(delta * 100)}%`;

  accelerateButton.classList.toggle("active", keys.accelerate);
  brakeButton.classList.toggle("active", keys.brake);

  if (assist) {
    stationAssist.classList.remove("hidden");
    assistStationTitle.textContent = assist.station.name;
    assistDistanceText.textContent = assist.gap >= 0
      ? `Locomotive front ${Math.abs(assist.gap).toFixed(1)} m short of the stop mark.`
      : `Locomotive front ${Math.abs(assist.gap).toFixed(1)} m beyond the stop mark.`;
    assistFrontMarker.style.left = `${assist.markerPercent}%`;
  } else {
    stationAssist.classList.add("hidden");
  }
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
    ? "linear-gradient(90deg, #f6a23f, #ffc160)"
    : "linear-gradient(90deg, #58a8ff, #7ed3ff)";
}

function updateMarker(element, value) {
  element.style.left = `${50 + value * 50}%`;
}

function worldToScreen(point, camera, scale, width, anchorY) {
  return {
    x: width * 0.5 + (point.x - camera.x) * scale,
    y: anchorY + (point.y - camera.y) * scale,
  };
}

