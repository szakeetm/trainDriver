function worldToScreen(point, camera, scale, width, anchorY) {
  const dx = point.x - camera.x;
  const dy = point.y - camera.y;
  return {
    x: width * 0.5 + (dx - dy) * Math.SQRT1_2 * scale,
    y: anchorY + ((dx + dy) / Math.sqrt(6)
      - ((point.elevation ?? 0) - camera.elevation) * Math.sqrt(2 / 3)) * scale,
  };
}

// Fixed isometric axes: world x/y are horizontal; elevation is vertical.
function getViewMetrics(width, height, trainPose = evaluateRoute(state.distance)) {
  const speedFactor = clamp(state.speed / MAX_LINE_SPEED, 0, 1);
  const scale = Math.min(width / TUNING.camera.worldWidth, height / TUNING.camera.worldHeight)
    / (1 + speedFactor * TUNING.camera.speedZoomOut);
  const leadDistance = TUNING.camera.leadDistance + speedFactor * TUNING.camera.leadDistanceBySpeed;
  const camera = {
    x: trainPose.x + Math.cos(trainPose.heading) * leadDistance,
    y: trainPose.y + Math.sin(trainPose.heading) * leadDistance,
    elevation: trainPose.elevation,
  };
  const radius = (width + height) / scale * 1.5;
  return {
    camera, trainPose, scale, anchorY: height * TUNING.camera.anchorY,
    startDistance: Math.max(0, state.distance - radius),
    endDistance: Math.min(route.totalLength, state.distance + radius),
  };
}

// Inverse ground projection. Height margin is added by terrain traversal.
function screenToGround(x, y, view, width, elevation = view.camera.elevation) {
  const across = (x - width * 0.5) / view.scale / Math.SQRT1_2;
  const along = ((y - view.anchorY) / view.scale
    + (elevation - view.camera.elevation) * Math.sqrt(2 / 3)) * Math.sqrt(6);
  return { x: view.camera.x + (along + across) * 0.5,
    y: view.camera.y + (along - across) * 0.5 };
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

