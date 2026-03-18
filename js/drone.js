function initializeDroneInsetRenderer() {
  if (!window.TrainDriver3DInsetRenderer || !droneInsetMount) {
    if (droneInsetStatus) {
      droneInsetStatus.textContent = "3D unavailable";
    }
    return;
  }

  try {
    droneInsetRenderer = new window.TrainDriver3DInsetRenderer({
      container: droneInsetMount,
      statusElement: droneInsetStatus,
    });
  } catch (error) {
    console.error("3D inset renderer could not start.", error);
    droneInsetRenderer = null;
    if (droneInsetStatus) {
      droneInsetStatus.textContent = "3D error";
    }
  }
}

function setDroneInsetMinimized(minimized) {
  if (!droneInset || !droneInsetToggle) {
    return;
  }

  if (minimized) {
    droneInset.dataset.restoreWidth = droneInset.style.width || "";
    droneInset.dataset.restoreHeight = droneInset.style.height || "";
    droneInset.style.width = "272px";
    droneInset.style.height = "auto";
  } else {
    droneInset.style.width = droneInset.dataset.restoreWidth || "";
    droneInset.style.height = droneInset.dataset.restoreHeight || "";
  }

  isDroneInsetMinimized = minimized;
  droneInset.classList.toggle("is-minimized", minimized);
  droneInsetToggle.textContent = minimized ? "Expand" : "Minimize";
  droneInsetToggle.setAttribute("aria-expanded", minimized ? "false" : "true");

  if (!minimized && droneInsetRenderer) {
    droneInsetRenderer.resize();
  }
}

function initializeDroneInsetToggle() {
  if (!droneInsetToggle) {
    return;
  }

  setDroneInsetMinimized(true);

  droneInsetToggle.addEventListener("click", () => {
    setDroneInsetMinimized(!isDroneInsetMinimized);
  });
}

function initializeDroneInsetResizeHandle() {
  if (!droneInset || !droneInsetResizeHandle) {
    return;
  }

  let resizeSession = null;

  const stopResize = () => {
    if (!resizeSession) {
      return;
    }

    resizeSession = null;
    document.body.style.userSelect = "";
  };

  const handlePointerMove = (event) => {
    if (!resizeSession) {
      return;
    }

    const nextWidth = clamp(
      resizeSession.startWidth + (resizeSession.startX - event.clientX),
      resizeSession.minWidth,
      resizeSession.maxWidth,
    );
    const nextHeight = clamp(
      resizeSession.startHeight + (resizeSession.startY - event.clientY),
      resizeSession.minHeight,
      resizeSession.maxHeight,
    );

    droneInset.style.width = `${nextWidth}px`;
    droneInset.style.height = `${nextHeight}px`;
    resizeCanvas();
  };

  droneInsetResizeHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    const parentRect = droneInset.parentElement
      ? droneInset.parentElement.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };
    const insetRect = droneInset.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(droneInset);
    const minWidth = parseFloat(computedStyle.minWidth) || 192;
    const minHeight = parseFloat(computedStyle.minHeight) || 108;
    const insetBottom = parseFloat(computedStyle.bottom) || 0;
    const insetRight = parseFloat(computedStyle.right) || 0;
    const maxWidth = Math.max(minWidth, parentRect.width - insetRight - 12);
    const maxHeight = Math.max(minHeight, parentRect.height - insetBottom - 12);

    resizeSession = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: insetRect.width,
      startHeight: insetRect.height,
      minWidth,
      minHeight,
      maxWidth,
      maxHeight,
    };

    document.body.style.userSelect = "none";
    droneInsetResizeHandle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  droneInsetResizeHandle.addEventListener("pointermove", handlePointerMove);
  droneInsetResizeHandle.addEventListener("pointerup", stopResize);
  droneInsetResizeHandle.addEventListener("pointercancel", stopResize);
  droneInsetResizeHandle.addEventListener("lostpointercapture", stopResize);
}

function syncDroneInsetRoute() {
  if (!droneInsetRenderer || !route) {
    return;
  }

  droneInsetRenderer.setRoute({
    route,
    trackWidth: TRACK_WIDTH,
    trainConsist: TRAIN_CONSIST,
    tuning: TUNING,
    sampleRoute: evaluateRoute,
    getSceneryPoint,
  });
}

function renderDroneInset(frame) {
  if (!droneInsetRenderer || !route || !state || appShell.classList.contains("hidden") || isDroneInsetMinimized) {
    return;
  }

  droneInsetRenderer.renderFrame({
    trainPose: frame.trainPose,
    renderedUnits: frame.renderedUnits,
    trainLength: TRAIN_TOTAL_LENGTH,
    activeStationIndex: state.stationIndex,
    overspeedTimer: state.overspeedTimer,
    derailment: state.derailment,
    maxLineSpeed: MAX_LINE_SPEED,
    powerOutput: Math.max(0, state.actualControl),
    acceleration: Math.max(0, state.acceleration || 0),
    speed: state.speed,
    biomeBlend: frame.biomeBlend,
  });
}

function getViewMetrics(width, height, trainPose = evaluateRoute(state.distance)) {
  const speedFactor = clamp(state.speed / MAX_LINE_SPEED, 0, 1);
  const lookBehind = TUNING.camera.lookBehindMin + speedFactor * TUNING.camera.lookBehindBySpeed;
  const lookAhead = TUNING.camera.lookAheadMin + speedFactor * TUNING.camera.lookAheadBySpeed;
  const longitudinalSpan = lookBehind + lookAhead;
  const lateralSpan = TUNING.camera.lateralSpanMin + speedFactor * TUNING.camera.lateralSpanBySpeed;
  const zoomMultiplier = lerp(
    TUNING.camera.stoppedZoomMultiplier,
    TUNING.camera.movingZoomMultiplier,
    speedFactor,
  );
  const scale = Math.min(width / lateralSpan, height / longitudinalSpan) * zoomMultiplier;
  const requestedLeadDistance = TUNING.camera.leadDistanceMin + speedFactor * TUNING.camera.leadDistanceBySpeed;
  const maxLeadDistance = Math.max(0, (height * 0.5 - TUNING.camera.trainScreenMargin) / Math.max(scale, 1e-6));
  const leadDistance = Math.min(requestedLeadDistance, maxLeadDistance);
  const camera = {
    x: trainPose.x + Math.cos(trainPose.heading) * leadDistance,
    y: trainPose.y + Math.sin(trainPose.heading) * leadDistance,
  };

  return {
    camera,
    trainPose,
    scale,
    anchorY: height * TUNING.camera.anchorY,
    startDistance: Math.max(0, state.distance - lookBehind),
    endDistance: Math.min(route.totalLength, state.distance + lookAhead),
  };
}

function evaluateSegment(segment, distanceIntoSegment) {
  const d = clamp(distanceIntoSegment, 0, segment.length);
  if (Math.abs(segment.curvature) < 1e-6) {
    return {
      x: segment.x0 + Math.cos(segment.heading0) * d,
      y: segment.y0 + Math.sin(segment.heading0) * d,
      heading: segment.heading0,
      curvature: 0,
      speedLimit: segment.speedLimit,
      segment,
    };
  }

  const k = segment.curvature;
  const h0 = segment.heading0;
  return {
    x: segment.x0 + (Math.sin(h0 + k * d) - Math.sin(h0)) / k,
    y: segment.y0 - (Math.cos(h0 + k * d) - Math.cos(h0)) / k,
    heading: h0 + k * d,
    curvature: k,
    speedLimit: segment.speedLimit,
    segment,
  };
}

