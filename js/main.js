function update(dt) {
  if (!state.started || state.finished) {
    updateGameAudio(dt);
    refreshUi(dt);
    return;
  }

  if (state.derailment) {
    updateDerailment(dt);
    updateGameAudio(dt);
    refreshUi(dt);
    return;
  }

  state.elapsed += dt;
  updateControls(dt);
  updatePhysics(dt);
  updateDieselExhaust(dt);
  if (processSignalPasses()) {
    updateGameAudio(dt);
    refreshUi(dt);
    return;
  }
  if (processSignals(dt)) {
    updateGameAudio(dt);
    refreshUi(dt);
    return;
  }
  if (checkFailureConditions()) {
    updateGameAudio(dt);
    refreshUi(dt);
    return;
  }
  updatePenalties(dt);
  updateStations();
  updateGameAudio(dt);
  refreshUi(dt);
}

function loop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  update(dt);
  updateStationAssist();
  render();
  requestAnimationFrame(loop);
}

function startRun() {
  clearHeldControls();
  remainingStationsKey = "";
  remainingStationEntries = [];
  uiRefreshCarry = UI_REFRESH_INTERVAL;
  state = createInitialState();
  if (webglTerrain) webglTerrain.resetRoute(route);
  state.started = true;
  finishCard.classList.add("hidden");
  resizeCanvas();
  state.message = "Departing Origin";
  state.detail = "The 100 m consist accelerates hard enough, but brake lag still demands planning.";
  updateGameAudio(0);
  refreshUi(0, true);
  updateStationAssist();
}

restartButton.addEventListener("click", () => {
  unlockGameAudioFromGesture();
  startRun();
});

function initializeGame() {
  initializeAudioUnlock();

  applyTuning();
  setTerrainRendererMode(new URLSearchParams(location.search).get("renderer") || "webgl2");
  syncAssistLegend();
  lastFrame = performance.now();
  startRun();
  requestAnimationFrame(loop);
}

initializeGame();
