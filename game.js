const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const appShell = document.getElementById("appShell");
const introCard = document.getElementById("coverScreen");
const finishCard = document.getElementById("finishCard");
const finishTitle = document.getElementById("finishTitle");
const finishStats = document.getElementById("finishStats");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const accelerateButton = document.getElementById("accelerateButton");
const brakeButton = document.getElementById("brakeButton");

const statusText = document.getElementById("statusText");
const subStatus = document.getElementById("subStatus");
const speedKph = document.getElementById("speedKph");
const lineLimitKph = document.getElementById("lineLimitKph");
const distanceToStation = document.getElementById("distanceToStation");
const stationName = document.getElementById("stationName");
const gameProgress = document.getElementById("gameProgress");
const gameProgressFill = document.getElementById("gameProgressFill");
const remainingStations = document.getElementById("remainingStations");
const elapsedTime = document.getElementById("elapsedTime");
const penaltyTime = document.getElementById("penaltyTime");
const stopError = document.getElementById("stopError");
const actualFill = document.getElementById("actualFill");
const requestedMarker = document.getElementById("requestedMarker");
const requestedLabel = document.getElementById("requestedLabel");
const actualLabel = document.getElementById("actualLabel");
const controlDelta = document.getElementById("controlDelta");
const lineLimitSecondary = lineLimitKph.parentElement;
const stationAssist = document.getElementById("stationAssist");
const assistScale = document.getElementById("assistScale");
const assistWindow = document.getElementById("assistWindow");
const assistStationTitle = document.getElementById("assistStationTitle");
const assistDistanceText = document.getElementById("assistDistanceText");
const assistFrontMarker = document.getElementById("assistFrontMarker");
const assistLegendMin = document.getElementById("assistLegendMin");
const assistLegendMax = document.getElementById("assistLegendMax");
const cameraDebugToggle = document.getElementById("cameraDebugToggle");

const DEFAULT_TUNING = {
  limits: {
    maxLineSpeed: 72, // Base reference speed in m/s used by camera and speed effects.
    overspeedFailMarginKph: 10, // Extra km/h above a curve limit before the run fails.
  },
  stations: {
    total: 6, // Number of scored stops after the origin.
    // Pool of names used when generating the station sequence.
    names: [
      "Birch Point",
      "Harbor Loop",
      "Signal Hill",
      "Fox Hollow",
      "Cedar Market",
      "Bluewater",
      "Ironfield",
      "West Junction",
      "Maple Quay",
    ],
    stopWindow: 42.9, // Front-of-train tolerance in meters for a successful station stop.
    passMargin: 120, // How far past a station the train can roll before it counts as missed.
    stopSpeed: 0.35, // Maximum speed in m/s that still counts as stopped at a station.
    assistRange: 120, // Distance in meters from a station where the stop-assist overlay appears.
    assistZoom: 120, // Half-width of the stop-assist meter scale in meters.
    approachOffset: 360, // Straight approach reserved before each station in meters.
    approachClearance: 260, // Minimum remaining distance before station where random route building stops.
    tailLength: 700, // Extra unrestricted track after the final station in meters.
  },
  train: {
    trackWidth: 4, // Distance between rails used for drawing the track.
    couplerGap: 1.8, // Gap in meters between each vehicle in the consist.
    maxPowerKw: 5500, // Full traction output represented when the power controller reaches 100%.
    maxBrakePressureBar: 6.5, // Full brake pipe pressure reduction represented when braking reaches 100%.
    // Vehicle definitions, front to back.
    consist: [
      {
        type: "locomotive", // Vehicle role used for rendering details.
        length: 24, // Vehicle length in meters along the track.
        width: 10, // Vehicle body width in meters for isometric rendering.
        bodyColor: "#53c8ff", // Main fill color of the vehicle body.
        roofColor: "rgba(255,255,255,0.9)", // Roof highlight color.
      },
      {
        type: "car", // Vehicle role used for rendering details.
        length: 34, // Vehicle length in meters along the track.
        width: 9, // Vehicle body width in meters for isometric rendering.
        bodyColor: "#8da4bc", // Main fill color of the vehicle body.
        roofColor: "rgba(232, 240, 248, 0.9)", // Roof highlight color.
      },
      {
        type: "car", // Vehicle role used for rendering details.
        length: 34, // Vehicle length in meters along the track.
        width: 9, // Vehicle body width in meters for isometric rendering.
        bodyColor: "#9fb7cf", // Main fill color of the vehicle body.
        roofColor: "rgba(232, 240, 248, 0.9)", // Roof highlight color.
      },
    ],
    minPixelLength: 14, // Smallest rendered train length in pixels when zoomed far out.
    minPixelWidth: 8, // Smallest rendered train width in pixels when zoomed far out.
    couplerLineWidthMin: 2, // Minimum coupler line thickness in pixels.
    couplerLineWidthScale: 1.2, // Coupler thickness multiplier relative to zoom scale.
  },
  camera: {
    lookBehindMin: 120, // Distance in meters kept visible behind the train at zero speed.
    lookBehindBySpeed: 180, // Extra behind distance added as speed rises.
    lookAheadStopped: 130, // Forward visibility floor while stopped so the spawn view stays much tighter.
    lookAheadMin: 320, // Distance in meters kept visible ahead once the train is moving beyond a crawl.
    lookAheadBySpeed: 540, // Extra forward look-ahead added as speed rises.
    renderAheadBufferMin: 520, // Extra track/scenery rendered beyond the fitted view so the line continues into the distance.
    renderAheadBufferBySpeed: 260, // Additional forward render buffer added as speed rises.
    leadDistanceMin: 90, // Minimum distance in meters that the camera focus point leads the train along the route.
    leadDistanceBySpeed: 520, // Extra forward lead distance added as speed rises so the view looks into the curve.
    trainScreenMargin: 96, // Minimum screen-space margin in pixels kept around the train when the camera leads ahead.
    lateralSpanMin: 7, // Base side-to-side world span used for zoom when stopped.
    lateralSpanBySpeed: 40, // Extra side-to-side world span added as speed rises.
    stoppedZoomMultiplier: 0.9, // Fraction of the safe fit scale used at zero speed so the whole train stays on-screen.
    movingZoomMultiplier: 0.94, // Fraction of the safe fit scale used once the train is up to speed.
    minimumCenterLookAheadStoppedFactor: 1.3, // Minimum center target ahead distance in train lengths while stopped.
    minimumCenterLookAheadMovingFactor: 2.4, // Minimum center target ahead distance in train lengths once speed builds.
    locomotiveLeadViewportFractionStopped: 0.28, // Fraction of the viewport size between the locomotive and screen center while stopped.
    locomotiveLeadViewportFractionMoving: 0.42, // Fraction of the viewport size between the locomotive and screen center at speed.
    anchorY: 0.5, // Vertical screen anchor for the train, where 0 is top and 1 is bottom.
  },
  route: {
    stationSpacingMin: 2200, // Minimum distance in meters between stations.
    stationSpacingMax: 5000, // Maximum distance in meters between stations.
    curveChance: 0.58, // Chance that the next generated segment before a station is a curve.
    sharpCurveChance: 0.38, // Chance that a generated curve uses the tighter-radius family instead of the broad one.
    curveRemainingThreshold: 540, // Remaining distance needed before a curve is allowed.
    curveLengthMin: 180, // Minimum curve length in meters.
    curveLengthMax: 980, // Maximum curve length in meters.
    curveExitBuffer: 180, // Minimum straight distance preserved after generating a curve.
    broadCurveRadiusMin: 700, // Minimum radius in meters for gentler sweeping curves.
    broadCurveRadiusMax: 2200, // Maximum radius in meters for gentler sweeping curves.
    sharpCurveRadiusMin: 130, // Minimum radius in meters for tighter curves.
    sharpCurveRadiusMax: 460, // Maximum radius in meters for tighter curves.
    broadCurveTurnMin: 0.14, // Smallest total heading change magnitude used for a broad curve.
    broadCurveTurnMax: 0.55, // Largest total heading change magnitude used for a broad curve.
    sharpCurveTurnMin: 0.3, // Smallest total heading change magnitude used for a sharp curve.
    sharpCurveTurnMax: 1.35, // Largest total heading change magnitude used for a sharp curve.
    curveGripFactor: 2.5, // Factor converting curvature into curve speed limits.
    curveSpeedLimitMin: 12, // Minimum curve speed limit in m/s.
    curveSpeedLimitMax: 42, // Maximum curve speed limit in m/s.
    straightLengthMin: 320, // Minimum randomly generated straight segment length in meters.
    straightLengthMax: 900, // Maximum randomly generated straight segment length in meters.
    upcomingCurveLookahead: 1300, // Distance ahead in meters used to warn about the next curve limit.
    biomeSectionLengthMin: 2400, // Minimum length in meters of a terrain/scenery biome section.
    biomeSectionLengthMax: 5200, // Maximum length in meters of a terrain/scenery biome section.
    biomeTransitionDistance: 320, // Distance in meters used to blend from one biome section into the next.
    elevationSegmentLengthMin: 260, // Minimum length in meters of a vertical-profile segment.
    elevationSegmentLengthMax: 900, // Maximum length in meters of a vertical-profile segment.
    maxGradient: 0.028, // Steepest ruling gradient used by the generated route, expressed as rise/run.
    stationGradeLimit: 0.004, // Stations are held to weak grades so stops stay believable.
    stationGradeZone: 220, // Distance in meters around stations where only weak grades are allowed.
    gradientChangeMax: 0.011, // Largest grade step between neighboring vertical-profile segments.
    elevationRecoveryBias: 0.016, // How strongly the profile tends back toward the surrounding terrain baseline.
    elevationMaxAbs: 120, // Soft cap in meters for route elevation above or below the world baseline.
  },
  signals: {
    spacingMin: 700, // Minimum spacing in meters between generated signals on long straights.
    spacingMax: 1500, // Maximum spacing in meters between generated signals on long straights.
    spawnChance: 0.72, // Chance that a candidate signal location actually receives a signal.
    stationClearance: 220, // Keep signals this far away from station stop locations.
    segmentInset: 100, // Leave this much straight track clear at each end before placing a signal.
    endMargin: 260, // Keep signals this far away from the route end.
    yellowChance: 0.32, // Chance that a spawned signal is yellow rather than green.
    redChance: 0.16, // Chance that a spawned signal is red rather than green.
    yellowSpeedLimitMin: 20, // Minimum speed limit in m/s imposed after passing a yellow signal.
    yellowSpeedLimitMax: 34, // Maximum speed limit in m/s imposed after passing a yellow signal.
    yellowBlockLengthMin: 420, // Minimum distance in meters that a yellow restriction remains active after passing it.
    yellowBlockLengthMax: 1100, // Maximum distance in meters that a yellow restriction remains active after passing it.
    redApproachDistance: 650, // Distance in meters ahead of a red signal where the HUD starts warning about it.
    redStopWindow: 22, // Distance in meters before a red signal where stopping counts as waiting at the signal.
    redStopSpeed: 0.25, // Maximum speed in m/s that still counts as stopped at a red signal.
    redHoldMin: 2.5, // Minimum seconds that a red signal stays at stop once the train is waiting.
    redHoldMax: 5.5, // Maximum seconds that a red signal stays at stop once the train is waiting.
    redPassMargin: 14, // Distance in meters past a red signal before it counts as a failure.
    sideOffset: 20, // Extra lateral offset in meters used to draw signals beside the track.
    redCountdownDisplayDistance: 220, // Distance in meters ahead of a red signal where the over-signal countdown becomes visible.
    redStopCircleScale: 0.7, // Fraction of the stop window used as the visual stop-circle radius on the track.
  },
  scenery: {
    startDistance: 120, // First distance from origin where scenery generation begins.
    endMargin: 140, // Distance before route end where scenery generation stops.
    stationClearance: 120, // Keep this many meters around stations relatively clear of scenery.
    fourObjectChance: 0.32, // Chance a scenery cluster contains four static objects.
    threeObjectChance: 0.55, // Chance a scenery cluster contains three objects.
    twoObjectChance: 0.5, // Chance a non-three-object cluster contains two objects.
    nearTrackChance: 0.35, // Chance an object is placed near the track instead of farther away.
    nearTrackOffsetMin: 28, // Minimum lateral offset for near-track scenery.
    nearTrackOffsetMax: 110, // Maximum lateral offset for near-track scenery.
    farOffsetMin: 120, // Minimum lateral offset for scenery farther from the track.
    farOffsetMax: 500, // Maximum lateral offset for scenery farther from the track.
    distanceJitterMin: -30, // Minimum forward/backward jitter applied within a scenery cluster.
    distanceJitterMax: 30, // Maximum forward/backward jitter applied within a scenery cluster.
    windmillThreshold: 0.97, // Random-roll cutoff above which an object becomes a windmill.
    siloThreshold: 0.93, // Random-roll cutoff above which an object becomes a silo.
    barnThreshold: 0.88, // Random-roll cutoff above which an object becomes a barn.
    billboardThreshold: 0.82, // Random-roll cutoff above which an object becomes a billboard.
    pondThreshold: 0.73, // Random-roll cutoff above which an object becomes a pond.
    ruinThreshold: 0.63, // Random-roll cutoff above which an object becomes ruins.
    hutThreshold: 0.54, // Random-roll cutoff above which an object becomes a hut.
    cactusThreshold: 0.46, // Random-roll cutoff above which an object becomes a cactus.
    rockThreshold: 0.38, // Random-roll cutoff above which an object becomes a rock.
    stumpThreshold: 0.31, // Random-roll cutoff above which an object becomes a stump.
    hayBaleThreshold: 0.24, // Random-roll cutoff above which an object becomes a hay bale.
    bushThreshold: 0.16, // Random-roll cutoff above which an object becomes a bush.
    objectMargin: 60, // Minimum distance from route start/end allowed for scenery objects.
    sizeMin: 0.72, // Minimum random scale multiplier for scenery objects.
    sizeMax: 1.55, // Maximum random scale multiplier for scenery objects.
    rotationMin: -0.35, // Minimum random rotation in radians for scenery objects.
    rotationMax: 0.35, // Maximum random rotation in radians for scenery objects.
    tintMin: -12, // Minimum random tint offset used to vary scenery colors.
    tintMax: 12, // Maximum random tint offset used to vary scenery colors.
    spacingMin: 58, // Minimum spacing in meters between scenery clusters.
    spacingMax: 102, // Maximum spacing in meters between scenery clusters.
  },
  controls: {
    requestAccelRate: 1.1, // Rate per second at which the driver's power request rises.
    requestBrakeRate: 1.35, // Rate per second at which the driver's brake request rises.
    tractionReleaseRate: 1.4, // How quickly actual power drops before brakes can begin applying.
    responseDefault: 0.72, // Fallback response rate when no special transition rule applies.
    brakeApplyFromPowerRate: 0.065, // Slow rate for first brake application after coming off power.
    brakeBuildRate: 0.15, // Rate actual braking force increases once braking is already applying.
    powerCoastRate: 0.62, // Rate actual power reduces toward coasting when power is released.
    brakeReleaseToPowerRate: 0.26, // Rate brakes release when changing back from braking to power.
    brakeReleaseRate: 0.14, // Rate actual brake force eases off while staying on the brake side.
    powerBuildRate: 0.6, // Rate actual power builds when requesting acceleration.
  },
  physics: {
    tractionForce: 1.45, // Base acceleration force at full applied power before fade-off.
    tractionFadeReferenceSpeed: 80, // Speed in m/s used as the reference for traction fade.
    tractionFadeMaxRatio: 1.2, // Maximum normalized speed considered by the traction fade curve.
    tractionFadeExponent: 1.35, // Shape of the traction fade curve as speed rises.
    tractionFadeAmount: 0.8, // How much available traction is reduced at high speed.
    tractionMinFactor: 0.2, // Minimum fraction of traction still available at top speed.
    brakingForce: 2.5, // Base deceleration force at full applied braking.
    baseDrag: 0.008, // Constant rolling/aero drag term applied at all speeds.
    quadraticDrag: 0.0002, // Speed-squared drag term that grows strongly at high speed.
    gradeResistancePerUnitGradient: 9.2, // Approximate acceleration change in m/s^2 for a 100% grade; 1% grade changes net acceleration by about 0.092 m/s^2.
    visibleSpeedMultiplier: 1.5, // Multiplier applied to route travel so the train visibly covers ground faster.
    speedCap: 92, // Hard upper speed cap in m/s.
  },
  penalties: {
    overspeedThreshold: 0.6, // Curve overspeed margin in m/s before penalties start accumulating.
    penaltyBase: 1.6, // Base penalty seconds added per second while overspeeding in curves.
    penaltySeverityScale: 5, // Extra penalty multiplier based on how badly the limit is exceeded.
    overspeedBuildRate: 1.8, // Rate at which the overspeed visual warning builds up.
    overspeedDecayRate: 1.6, // Rate at which the overspeed visual warning fades away.
  },
  visuals: {
    stopAssistMarkerMinPercent: 4, // Left clamp for the stop-assist front marker position.
    stopAssistMarkerMaxPercent: 96, // Right clamp for the stop-assist front marker position.
    routePredictorWidth: 400, // Width in pixels of the lower-left route predictor panel.
    routePredictorHeight: 172, // Height in pixels of the lower-left route predictor panel.
    routePredictorMaxEntries: 4, // Maximum number of upcoming curves and signals listed in the predictor.
    gradientMarkerMinGrade: 0.008, // Minimum absolute grade before a warning marker is shown.
    gradientMarkerSpacingMin: 220, // Minimum spacing in meters between successive gradient markers.
    terrainHeightExaggeration: 2.7, // Multiplier applied to rendered terrain and track heights so elevation reads clearly in the isometric view.
    isometricVerticalScale: 0.56, // Screen-space vertical squash of the isometric projection.
    isometricElevationScale: 1.45, // Extra screen-space lift per meter of elevation in the isometric projection.
    terrainCellSize: 74, // Base size in pixels of terrain texture cells in the world backdrop.
    terrainNeighborHeightMaxDelta: 6, // Maximum allowed height difference between neighboring terrain gridpoints.
    terrainClearWidthMin: 20, // Minimum width in pixels of the cleared corridor around the track.
    terrainClearWidthScale: 4.2, // Cleared corridor width multiplier relative to zoom scale.
    backgroundGridStep: 48, // Vertical spacing in pixels between faint background scanlines.
    backgroundSpeedMaxFactor: 1.35, // Max normalized speed used by background motion effects.
    backgroundStreakThreshold: 0.12, // Minimum normalized speed before background streaks appear.
    backgroundStreakCount: 20, // Number of background streaks rendered per frame.
    backgroundStreakSpacing: 76, // Vertical spacing between successive background streaks.
    backgroundStreakTravel: 4.8, // How quickly background streaks advance with train distance.
    backgroundStreakBaseLength: 20, // Base length in pixels of each background streak.
    backgroundStreakLengthBySpeed: 42, // Extra streak length added as speed rises.
    trackSampleStep: 10, // Route sampling step in meters when drawing the track.
    trackBedWidthMin: 4.5, // Minimum width in pixels of the dark track bed.
    trackBedWidthScale: 0.72, // Track-bed width multiplier relative to zoom scale.
    railWidthMin: 1.1, // Minimum width in pixels of each rail line.
    railWidthScale: 0.2, // Rail width multiplier relative to zoom scale.
    sleeperStep: 2, // How many track samples to skip between sleeper lines.
    sleeperWidthMin: 1.4, // Minimum width in pixels of sleeper strokes.
    sleeperWidthScale: 0.13, // Sleeper width multiplier relative to zoom scale.
    speedEffectThreshold: 0.16, // Minimum normalized speed before foreground speed streaks appear.
    speedEffectMaxFactor: 1.35, // Max normalized speed used by foreground speed streak intensity.
    speedEffectCount: 14, // Number of foreground speed streaks rendered per frame.
    speedEffectTravel: 7.5, // How quickly foreground streaks move with train distance.
    speedEffectSpacing: 56, // Horizontal spacing between successive foreground streaks.
    speedEffectBaseLength: 22, // Base length in pixels of foreground speed streaks.
    speedEffectLengthBySpeed: 52, // Extra speed-streak length added as speed rises.
    speedEffectBandTop: 0.58, // Vertical start position of foreground streak band as a fraction of canvas height.
    speedEffectBandStep: 12, // Vertical spacing between foreground streak lines in pixels.
    speedEffectLineWidthBase: 1.1, // Base stroke width of the foreground speed streaks.
    speedEffectLineWidthBySpeed: 0.9, // Extra stroke width added as speed rises.
  },
};

let TUNING = cloneConfigValue(DEFAULT_TUNING);
let MAX_LINE_SPEED = 0;
let STATION_WINDOW = 0;
let STATION_PASS_MARGIN = 0;
let STATION_STOP_SPEED = 0;
let STATION_ASSIST_RANGE = 0;
let STATION_ASSIST_ZOOM = 0;
let OVERSPEED_FAIL_MARGIN = 0;
let TRACK_WIDTH = 0;
let TRAIN_CONSIST = [];
let COUPLER_GAP = 0;
let MAX_POWER_KW = 0;
let MAX_BRAKE_PRESSURE_BAR = 0;
let TRAIN_TOTAL_LENGTH = 0;
let TOTAL_STATIONS = 0;
const CAMERA_TRAIN_LENGTH_LEAD_MULTIPLIER = 0.7;
const CAMERA_SPEED_LEAD_SECONDS = 7;

const keys = {
  accelerate: false,
  brake: false,
};

let route = null;
let state = null;
let lastFrame = performance.now();
let showCameraDebugOverlay = false;

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
  OVERSPEED_FAIL_MARGIN = TUNING.limits.overspeedFailMarginKph / 3.6;
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

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function fbmNoise(x, y) {
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let amplitudeSum = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    total += hashNoise(x * frequency, y * frequency) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return amplitudeSum > 0 ? total / amplitudeSum : 0;
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
    remainingStations.innerHTML = '<li class="station-progress-empty">No remaining stations.</li>';
    return;
  }

  remainingStations.innerHTML = upcomingStations
    .map((station) => `
      <li class="station-progress-item">
        <strong>${station.name}</strong>
        <span>${formatDistanceKm(station.distance - state.distance)}</span>
      </li>
    `)
    .join("");
}

function syncAssistLegend() {
  assistLegendMin.textContent = `-${STATION_ASSIST_ZOOM} m`;
  assistLegendMax.textContent = `+${STATION_ASSIST_ZOOM} m`;

  if (!assistScale || !assistWindow || STATION_ASSIST_ZOOM <= 0) {
    return;
  }

  const acceptancePercent = clamp((STATION_WINDOW / STATION_ASSIST_ZOOM) * 100, 0, 100);
  const leftPercent = (100 - acceptancePercent) * 0.5;
  assistScale.style.setProperty("--assist-window-left", `${leftPercent}%`);
  assistScale.style.setProperty("--assist-window-width", `${acceptancePercent}%`);
}

function setButtonHold(button, key) {
  const engage = (event) => {
    event.preventDefault();
    keys[key] = true;
  };
  const release = () => {
    keys[key] = false;
  };

  button.addEventListener("pointerdown", engage);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointerleave", release);
  button.addEventListener("pointercancel", release);
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
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function getTrainUnits() {
  let frontCursor = state.distance;
  return TRAIN_CONSIST.map((unit) => {
    const centerDistance = frontCursor - unit.length * 0.5;
    const rearDistance = frontCursor - unit.length;
    const frontPose = evaluateRoute(frontCursor);
    const centerPose = evaluateRoute(centerDistance);
    const rearPose = evaluateRoute(rearDistance);
    const heading = Math.atan2(frontPose.y - rearPose.y, frontPose.x - rearPose.x) || centerPose.heading;
    const result = {
      ...unit,
      centerDistance,
      frontDistance: frontCursor,
      rearDistance,
      pose: centerPose,
      frontPose,
      rearPose,
      heading,
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
      return {
        ...unit,
        renderX: unit.pose.x,
        renderY: unit.pose.y,
        visualElevation: unit.pose.visualElevation,
        renderHeading: unit.heading,
        rearX: unit.rearPose.x,
        rearY: unit.rearPose.y,
        frontX: unit.frontPose.x,
        frontY: unit.frontPose.y,
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
      visualElevation: unit.pose && unit.pose.visualElevation != null ? unit.pose.visualElevation : 0,
      renderHeading,
      rearX: renderX - Math.cos(renderHeading) * unit.length * 0.5,
      rearY: renderY - Math.sin(renderHeading) * unit.length * 0.5,
      frontX: renderX + Math.cos(renderHeading) * unit.length * 0.5,
      frontY: renderY + Math.sin(renderHeading) * unit.length * 0.5,
    };
  });
}

function getViewMetrics(width, height) {
  const trainUnits = getTrainUnits();
  const leadUnit = trainUnits[0];
  const rearUnit = trainUnits[trainUnits.length - 1];
  const trainPose = leadUnit.pose;
  const rearPose = rearUnit.rearPose;
  const frontPose = leadUnit.frontPose;
  const lengthTargetDistance = TRAIN_TOTAL_LENGTH * CAMERA_TRAIN_LENGTH_LEAD_MULTIPLIER;
  const speedTargetDistance = state.speed * CAMERA_SPEED_LEAD_SECONDS;
  const targetAheadDistance = Math.max(lengthTargetDistance, speedTargetDistance);
  const centerTargetDistance = Math.min(route.totalLength, state.distance + targetAheadDistance);
  const lengthTargetPose = evaluateRoute(Math.min(route.totalLength, state.distance + lengthTargetDistance));
  const speedTargetPose = evaluateRoute(Math.min(route.totalLength, state.distance + speedTargetDistance));
  const centerTargetPose = evaluateRoute(centerTargetDistance);
  const camera = {
    x: centerTargetPose.x,
    y: centerTargetPose.y,
  };
  const centerProj = projectIsometricPoint(centerTargetPose, camera);
  const frontProj = projectIsometricPoint(frontPose, camera);
  const rearProj = projectIsometricPoint(rearPose, camera);
  const rearHeading = rearUnit.heading;
  const rearNormalX = -Math.sin(rearHeading);
  const rearNormalY = Math.cos(rearHeading);
  const rearHalfWidth = rearUnit.width * 0.58;
  const rearLeftProj = projectIsometricPoint({
    x: rearPose.x - rearNormalX * rearHalfWidth,
    y: rearPose.y - rearNormalY * rearHalfWidth,
    visualElevation: rearPose.visualElevation,
  }, camera);
  const rearRightProj = projectIsometricPoint({
    x: rearPose.x + rearNormalX * rearHalfWidth,
    y: rearPose.y + rearNormalY * rearHalfWidth,
    visualElevation: rearPose.visualElevation,
  }, camera);
  const shorterHalf = Math.max(80, Math.min(width, height) * 0.5 - 56);
  const rearFitPoints = [rearProj, rearLeftProj, rearRightProj];
  let rearSpan = 1;
  rearFitPoints.forEach((point) => {
    rearSpan = Math.max(
      rearSpan,
      Math.abs(point.x - centerProj.x),
      Math.abs(point.y - centerProj.y),
    );
  });
  const scale = Math.max(0.0001, shorterHalf / rearSpan);
  const anchorX = width * 0.5 - centerProj.x * scale;
  const anchorY = height * 0.5 - centerProj.y * scale;
  const trainLengthPixels = Math.hypot(frontProj.x - rearProj.x, frontProj.y - rearProj.y) * scale;
  const rearRenderBuffer = Math.max(TRAIN_TOTAL_LENGTH, 180);
  const aheadRenderBuffer = Math.max(TRAIN_TOTAL_LENGTH * 3.5, state.speed * 6, 520);

  return {
    camera,
    trainPose,
    rearPose,
    scale,
    anchorX,
    anchorY,
    startDistance: Math.max(0, rearUnit.rearDistance - rearRenderBuffer),
    endDistance: Math.min(route.totalLength, centerTargetDistance + aheadRenderBuffer),
    leadDistance: centerTargetDistance - state.distance,
    trainLengthPixels,
    debug: {
      frontPose,
      centerTargetPose,
      lengthTargetPose,
      speedTargetPose,
      lengthTargetDistance,
      speedTargetDistance,
      chosenTargetDistance: targetAheadDistance,
      chosenSource: speedTargetDistance > lengthTargetDistance ? "speed" : "length",
    },
  };
}

function evaluateSegment(segment, distanceIntoSegment) {
  const d = clamp(distanceIntoSegment, 0, segment.length);
  const elevationInfo = route && route.elevationProfile
    ? evaluateElevationProfile(route.elevationProfile, segment.start + d)
    : { elevation: 0, grade: 0, segment: null };
  if (Math.abs(segment.curvature) < 1e-6) {
    return {
      x: segment.x0 + Math.cos(segment.heading0) * d,
      y: segment.y0 + Math.sin(segment.heading0) * d,
      heading: segment.heading0,
      curvature: 0,
      speedLimit: segment.speedLimit,
      elevation: elevationInfo.elevation,
      visualElevation: getVisualElevation(elevationInfo.elevation),
      grade: elevationInfo.grade,
      elevationSegment: elevationInfo.segment,
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
    elevation: elevationInfo.elevation,
    visualElevation: getVisualElevation(elevationInfo.elevation),
    grade: elevationInfo.grade,
    elevationSegment: elevationInfo.segment,
    segment,
  };
}

function evaluateRoute(distance) {
  if (distance < 0) {
    const firstSegment = route.segments[0];
    const elevationInfo = route && route.elevationProfile
      ? evaluateElevationProfile(route.elevationProfile, distance)
      : { elevation: 0, grade: 0, segment: null };
    return {
      x: firstSegment.x0 + Math.cos(firstSegment.heading0) * distance,
      y: firstSegment.y0 + Math.sin(firstSegment.heading0) * distance,
      heading: firstSegment.heading0,
      curvature: 0,
      speedLimit: firstSegment.speedLimit,
      elevation: elevationInfo.elevation,
      visualElevation: getVisualElevation(elevationInfo.elevation),
      grade: elevationInfo.grade,
      elevationSegment: elevationInfo.segment,
      segment: firstSegment,
    };
  }

  const clampedDistance = clamp(distance, 0, route.totalLength);
  const segment = route.segments.find(
    (item) => clampedDistance >= item.start && clampedDistance <= item.end,
  ) || route.segments[route.segments.length - 1];

  return evaluateSegment(segment, clampedDistance - segment.start);
}

function makeSegment(startState, length, curvature, speedLimit) {
  const segment = {
    type: Math.abs(curvature) < 1e-6 ? "straight" : "curve",
    start: startState.distance,
    end: startState.distance + length,
    length,
    curvature,
    speedLimit,
    x0: startState.x,
    y0: startState.y,
    heading0: startState.heading,
  };

  const endState = evaluateSegment(segment, length);
  return {
    segment,
    endState: {
      x: endState.x,
      y: endState.y,
      heading: endState.heading,
      distance: segment.end,
    },
  };
}

function buildStationGradeZones(stations, totalLength) {
  const halfZone = TUNING.route.stationGradeZone;
  return stations
    .map((station) => ({
      start: Math.max(0, station.distance - halfZone),
      end: Math.min(totalLength, station.distance + halfZone),
    }))
    .sort((a, b) => a.start - b.start);
}

function findStationGradeZone(distance, stationZones) {
  return stationZones.find((zone) => distance >= zone.start && distance < zone.end) || null;
}

function generateElevationProfile(totalLength, stations) {
  const segments = [];
  const stationZones = buildStationGradeZones(stations, totalLength);
  let cursor = 0;
  let elevation = 0;
  let previousGrade = 0;
  let lastMarkerDistance = -Infinity;

  while (cursor < totalLength - 1e-6) {
    const activeZone = findStationGradeZone(cursor, stationZones);
    const zoneEnd = activeZone ? activeZone.end : totalLength;
    const nextZone = stationZones.find((zone) => zone.start > cursor) || null;
    const freeRunEnd = activeZone ? zoneEnd : Math.min(zoneEnd, nextZone ? nextZone.start : totalLength);
    const remaining = Math.max(0, freeRunEnd - cursor);
    if (remaining <= 0.5) {
      cursor = Math.max(cursor, freeRunEnd);
      continue;
    }

    const desiredLength = activeZone
      ? remaining
      : rand(TUNING.route.elevationSegmentLengthMin, TUNING.route.elevationSegmentLengthMax);
    const length = Math.min(desiredLength, remaining);
    const maxGradient = activeZone ? TUNING.route.stationGradeLimit : TUNING.route.maxGradient;
    const recoveryBias = clamp(
      (-elevation / Math.max(TUNING.route.elevationMaxAbs, 1e-6)) * TUNING.route.elevationRecoveryBias,
      -TUNING.route.elevationRecoveryBias,
      TUNING.route.elevationRecoveryBias,
    );
    const gradeTarget = activeZone
      ? rand(-TUNING.route.stationGradeLimit, TUNING.route.stationGradeLimit)
      : clamp(
        previousGrade
          + rand(-TUNING.route.gradientChangeMax, TUNING.route.gradientChangeMax)
          + recoveryBias
          + (hashNoise(cursor * 0.0038, elevation * 0.02) - 0.5) * 0.004,
        -maxGradient,
        maxGradient,
      );
    const grade = activeZone
      ? clamp(lerp(previousGrade, gradeTarget, 0.72), -maxGradient, maxGradient)
      : gradeTarget;
    const nextElevation = elevation + grade * length;
    const segment = {
      start: cursor,
      end: cursor + length,
      length,
      grade,
      elevation0: elevation,
      elevation1: nextElevation,
      weakZone: Boolean(activeZone),
    };
    segments.push(segment);

    if (!segment.weakZone
      && Math.abs(segment.grade) >= TUNING.visuals.gradientMarkerMinGrade
      && segment.start - lastMarkerDistance >= TUNING.visuals.gradientMarkerSpacingMin) {
      lastMarkerDistance = segment.start;
    }

    cursor = segment.end;
    elevation = nextElevation;
    previousGrade = grade;
  }

  return segments;
}

function evaluateElevationProfile(profileSegments, distance) {
  if (!profileSegments || profileSegments.length === 0) {
    return {
      elevation: 0,
      grade: 0,
      segment: null,
    };
  }

  const clampedDistance = clamp(distance, 0, profileSegments[profileSegments.length - 1].end);
  const segment = profileSegments.find(
    (item) => clampedDistance >= item.start && clampedDistance <= item.end,
  ) || profileSegments[profileSegments.length - 1];
  const localDistance = clamp(clampedDistance - segment.start, 0, segment.length);
  return {
    elevation: segment.elevation0 + segment.grade * localDistance,
    grade: segment.grade,
    segment,
  };
}

function buildGradientMarkers(profileSegments) {
  const markers = [];
  let lastMarkerDistance = -Infinity;
  profileSegments.forEach((segment) => {
    if (segment.weakZone || Math.abs(segment.grade) < TUNING.visuals.gradientMarkerMinGrade) {
      return;
    }
    if (segment.start - lastMarkerDistance < TUNING.visuals.gradientMarkerSpacingMin) {
      return;
    }
    lastMarkerDistance = segment.start;
    markers.push({
      distance: segment.start + Math.min(28, segment.length * 0.2),
      grade: segment.grade,
      percent: segment.grade * 100,
    });
  });
  return markers;
}

function buildTerrainTrackSamples(totalLength) {
  const samples = [];
  const step = 48;
  for (let distance = 0; distance <= totalLength; distance += step) {
    const point = evaluateRoute(distance);
    samples.push({
      distance,
      x: point.x,
      y: point.y,
      elevation: point.elevation,
      visualElevation: getVisualElevation(point.elevation),
    });
  }
  const lastPoint = evaluateRoute(totalLength);
  const lastSample = samples[samples.length - 1];
  if (!lastSample || Math.abs(lastSample.distance - totalLength) > 1e-6) {
    samples.push({
      distance: totalLength,
      x: lastPoint.x,
      y: lastPoint.y,
      elevation: lastPoint.elevation,
      visualElevation: getVisualElevation(lastPoint.elevation),
    });
  }
  return samples;
}

function getVisualElevation(elevation) {
  return elevation * TUNING.visuals.terrainHeightExaggeration;
}

function getTerrainGridHeight(gridX, gridY) {
  const key = `${gridX},${gridY}`;
  if (route.terrainHeightCache.has(key)) {
    return route.terrainHeightCache.get(key);
  }

  const cellSize = TUNING.visuals.terrainCellSize;
  const worldX = gridX * cellSize;
  const worldY = gridY * cellSize;
  const broad = (fbmNoise(worldX * 0.00038 + 13, worldY * 0.00038 - 7) - 0.5) * 34;
  const medium = (fbmNoise(worldX * 0.0014 - 11, worldY * 0.0014 + 19) - 0.5) * 10;
  const fine = (hashNoise(gridX * 0.73 + 5, gridY * 0.69 - 9) - 0.5) * 0.8;
  const rawHeight = (broad + medium + fine) * TUNING.visuals.terrainHeightExaggeration;
  const terraceStep = 6;
  let height = Math.round(rawHeight / terraceStep) * terraceStep;
  const maxNeighborDelta = TUNING.visuals.terrainNeighborHeightMaxDelta;
  const neighborHeights = [
    route.terrainHeightCache.get(`${gridX - 1},${gridY}`),
    route.terrainHeightCache.get(`${gridX},${gridY - 1}`),
    route.terrainHeightCache.get(`${gridX - 1},${gridY - 1}`),
    route.terrainHeightCache.get(`${gridX + 1},${gridY - 1}`),
  ].filter((value) => value != null);
  if (neighborHeights.length) {
    const minAllowed = Math.max(...neighborHeights.map((value) => value - maxNeighborDelta));
    const maxAllowed = Math.min(...neighborHeights.map((value) => value + maxNeighborDelta));
    height = clamp(height, minAllowed, maxAllowed);
    height = Math.round(height / terraceStep) * terraceStep;
  }
  route.terrainHeightCache.set(key, height);
  return height;
}

function getTerrainCellAverageHeight(cellGridX, cellGridY) {
  return (
    getTerrainGridHeight(cellGridX, cellGridY)
    + getTerrainGridHeight(cellGridX + 1, cellGridY)
    + getTerrainGridHeight(cellGridX, cellGridY + 1)
    + getTerrainGridHeight(cellGridX + 1, cellGridY + 1)
  ) * 0.25;
}

function getTerrainHeightAtWorld(worldX, worldY) {
  const cellSize = TUNING.visuals.terrainCellSize;
  const cellX = Math.floor(worldX / cellSize);
  const cellY = Math.floor(worldY / cellSize);
  const fracX = (worldX - cellX * cellSize) / cellSize;
  const fracY = (worldY - cellY * cellSize) / cellSize;
  const top = lerp(
    getTerrainGridHeight(cellX, cellY),
    getTerrainGridHeight(cellX + 1, cellY),
    fracX,
  );
  const bottom = lerp(
    getTerrainGridHeight(cellX, cellY + 1),
    getTerrainGridHeight(cellX + 1, cellY + 1),
    fracX,
  );
  let terrainHeight = lerp(top, bottom, fracY);

  if (route && route.terrainTrackSamples && route.terrainTrackSamples.length) {
    let nearest = null;
    let nearestSquared = Infinity;
    route.terrainTrackSamples.forEach((sample) => {
      const dx = sample.x - worldX;
      const dy = sample.y - worldY;
      const squared = dx * dx + dy * dy;
      if (squared < nearestSquared) {
        nearestSquared = squared;
        nearest = sample;
      }
    });

    if (nearest) {
      const distance = Math.sqrt(nearestSquared);
      const corridorBlend = 1 - smoothstep(16, 150, distance);
      terrainHeight = lerp(terrainHeight, nearest.visualElevation - 1.6, corridorBlend);
    }
  }

  return terrainHeight;
}

function generateBiomes(totalLength) {
  const themes = ["green", "desert", "snow", "mountain", "river", "farmland", "autumn", "marsh", "canyon"];
  const biomes = [];
  let previousTheme = null;
  let cursor = 0;

  while (cursor < totalLength) {
    const remaining = totalLength - cursor;
    if (remaining <= TUNING.route.biomeSectionLengthMin * 0.55 && biomes.length > 0) {
      biomes[biomes.length - 1].endDistance = totalLength;
      break;
    }

    const theme = chooseDifferent(themes, previousTheme);
    previousTheme = theme;
    const segmentLength = Math.min(
      rand(TUNING.route.biomeSectionLengthMin, TUNING.route.biomeSectionLengthMax),
      remaining,
    );

    biomes.push({
      theme,
      startDistance: cursor,
      endDistance: cursor + segmentLength,
    });

    cursor += segmentLength;
  }

  if (biomes.length === 0) {
    biomes.push({
      theme: "green",
      startDistance: 0,
      endDistance: totalLength,
    });
  } else {
    biomes[biomes.length - 1].endDistance = totalLength;
  }

  return biomes;
}

function generateRoute() {
  const stationNames = TUNING.stations.names;

  const segments = [];
  const stations = [{ name: "Origin", distance: 0 }];
  let cursor = {
    x: 0,
    y: 0,
    heading: -Math.PI / 2,
    distance: 0,
  };

  for (let stationIndex = 1; stationIndex < TOTAL_STATIONS; stationIndex += 1) {
    const spacing = rand(TUNING.route.stationSpacingMin, TUNING.route.stationSpacingMax);
    const stationDistance = cursor.distance + spacing;
    const approachDistance = stationDistance - TUNING.stations.approachOffset;

    while (cursor.distance < approachDistance - TUNING.stations.approachClearance) {
      const remaining = approachDistance - cursor.distance;
      const makeCurve = Math.random() < TUNING.route.curveChance
        && remaining > TUNING.route.curveRemainingThreshold;

      if (makeCurve) {
        const useSharpCurve = Math.random() < TUNING.route.sharpCurveChance;
        const targetRadius = useSharpCurve
          ? rand(TUNING.route.sharpCurveRadiusMin, TUNING.route.sharpCurveRadiusMax)
          : rand(TUNING.route.broadCurveRadiusMin, TUNING.route.broadCurveRadiusMax);
        const turnMagnitude = useSharpCurve
          ? rand(TUNING.route.sharpCurveTurnMin, TUNING.route.sharpCurveTurnMax)
          : rand(TUNING.route.broadCurveTurnMin, TUNING.route.broadCurveTurnMax);
        const signedTurn = turnMagnitude * (Math.random() < 0.5 ? -1 : 1);
        const idealLength = targetRadius * turnMagnitude;
        const length = Math.min(
          clamp(idealLength, TUNING.route.curveLengthMin, TUNING.route.curveLengthMax),
          remaining - TUNING.route.curveExitBuffer,
        );
        const curvature = signedTurn / length;
        const speedLimit = clamp(
          Math.sqrt(TUNING.route.curveGripFactor / Math.abs(curvature)),
          TUNING.route.curveSpeedLimitMin,
          TUNING.route.curveSpeedLimitMax,
        );
        const built = makeSegment(cursor, length, curvature, speedLimit);
        segments.push(built.segment);
        cursor = built.endState;
      } else {
        const length = Math.min(
          rand(TUNING.route.straightLengthMin, TUNING.route.straightLengthMax),
          remaining,
        );
        const built = makeSegment(cursor, length, 0, null);
        segments.push(built.segment);
        cursor = built.endState;
      }
    }

    const finalStraight = stationDistance - cursor.distance;
    if (finalStraight > 1) {
      const built = makeSegment(cursor, finalStraight, 0, null);
      segments.push(built.segment);
      cursor = built.endState;
    }

    stations.push({
      name: choose(stationNames.filter((name) => !stations.some((station) => station.name === name))),
      distance: stationDistance,
      visual: createStationVisual(),
    });
  }

  const tail = makeSegment(cursor, TUNING.stations.tailLength, 0, null);
  segments.push(tail.segment);

  const totalLength = tail.segment.end;
  const elevationProfile = generateElevationProfile(totalLength, stations);

  return {
    segments,
    stations,
    elevationProfile,
    gradientMarkers: buildGradientMarkers(elevationProfile),
    biomes: generateBiomes(totalLength),
    terrainCornerCache: new Map(),
    terrainHeightCache: new Map(),
    terrainTileCache: new Map(),
    terrainTextureCache: new Map(),
    scenerySpriteCache: new Map(),
    signals: generateSignals(segments, stations, totalLength),
    scenery: generateScenery(stations, totalLength),
    totalLength,
  };
}

function getBiomePalette(theme) {
  if (theme === "desert") {
    return {
      base: [197, 168, 103, 0.44],
      alt: [173, 145, 84, 0.34],
      detail: [151, 123, 66, 0.18],
    };
  }
  if (theme === "snow") {
    return {
      base: [214, 225, 232, 0.48],
      alt: [173, 193, 207, 0.32],
      detail: [244, 248, 252, 0.22],
    };
  }
  if (theme === "mountain") {
    return {
      base: [120, 130, 126, 0.42],
      alt: [90, 98, 94, 0.36],
      detail: [68, 76, 74, 0.22],
    };
  }
  if (theme === "river") {
    return {
      base: [98, 143, 104, 0.38],
      alt: [72, 125, 128, 0.34],
      detail: [80, 160, 194, 0.22],
    };
  }
  if (theme === "farmland") {
    return {
      base: [167, 152, 92, 0.42],
      alt: [142, 126, 74, 0.34],
      detail: [204, 186, 111, 0.18],
    };
  }
  if (theme === "autumn") {
    return {
      base: [149, 103, 58, 0.42],
      alt: [118, 74, 42, 0.34],
      detail: [191, 137, 72, 0.2],
    };
  }
  if (theme === "marsh") {
    return {
      base: [91, 121, 90, 0.42],
      alt: [73, 97, 76, 0.35],
      detail: [110, 146, 124, 0.2],
    };
  }
  if (theme === "canyon") {
    return {
      base: [170, 103, 73, 0.42],
      alt: [132, 78, 56, 0.34],
      detail: [209, 147, 109, 0.2],
    };
  }
  return {
    base: [123, 156, 86, 0.42],
    alt: [84, 129, 69, 0.34],
    detail: [90, 128, 58, 0.18],
  };
}

function formatBiomeName(theme) {
  return theme.charAt(0).toUpperCase() + theme.slice(1);
}

function getCurrentBiomeLabel(distance = state.distance) {
  const blend = getBiomeBlendAtDistance(distance);
  if (blend.primary !== blend.secondary && blend.mix > 0.22 && blend.mix < 0.78) {
    return `${formatBiomeName(blend.primary)} to ${formatBiomeName(blend.secondary)}`;
  }

  return formatBiomeName(blend.mix >= 0.5 ? blend.secondary : blend.primary);
}

function mixPaletteColor(colorA, colorB, t) {
  return [
    lerp(colorA[0], colorB[0], t),
    lerp(colorA[1], colorB[1], t),
    lerp(colorA[2], colorB[2], t),
    lerp(colorA[3], colorB[3], t),
  ];
}

function paletteColorToCss(color) {
  return `rgba(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])}, ${color[3].toFixed(3)})`;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function getBiomeBlendAtDistance(distance) {
  const transition = TUNING.route.biomeTransitionDistance;
  const biomes = route.biomes;
  let index = biomes.findIndex((biome) => distance >= biome.startDistance && distance < biome.endDistance);
  if (index === -1) {
    index = biomes.length - 1;
  }

  const current = biomes[index];
  const next = biomes[Math.min(index + 1, biomes.length - 1)];
  const previous = biomes[Math.max(index - 1, 0)];

  if (next !== current && distance > current.endDistance - transition) {
    return {
      primary: current.theme,
      secondary: next.theme,
      mix: smoothstep(current.endDistance - transition, current.endDistance + transition, distance),
    };
  }

  if (previous !== current && distance < current.startDistance + transition) {
    return {
      primary: previous.theme,
      secondary: current.theme,
      mix: smoothstep(current.startDistance - transition, current.startDistance + transition, distance),
    };
  }

  return {
    primary: current.theme,
    secondary: current.theme,
    mix: 0,
  };
}

function estimateVisibleRouteSamples(view) {
  const samples = [];
  const sampleStep = 90;
  for (let distance = Math.max(0, view.startDistance - 140); distance <= Math.min(route.totalLength, view.endDistance + 140); distance += sampleStep) {
    const point = evaluateRoute(distance);
    samples.push({ distance, x: point.x, y: point.y });
  }
  return samples;
}

function estimateRouteDistanceForWorldPoint(worldX, worldY, samples) {
  let closest = samples[0];
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const dx = worldX - sample.x;
    const dy = worldY - sample.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      closest = sample;
    }
  }
  return closest.distance;
}

function createTerrainTileStyle(cellGridX, cellGridY) {
  return {
    topLeftKey: `${cellGridX},${cellGridY}`,
    topRightKey: `${cellGridX + 1},${cellGridY}`,
    bottomLeftKey: `${cellGridX},${cellGridY + 1}`,
    bottomRightKey: `${cellGridX + 1},${cellGridY + 1}`,
    biomeSeed: hashNoise(cellGridX * 0.7, cellGridY * 0.7),
    toneSeed: hashNoise(cellGridX * 1.9 + 4, cellGridY * 1.7 + 9),
  };
}

function getTerrainCornerStyle(cornerGridX, cornerGridY) {
  const biomeBlend = getBiomeBlendAtDistance(state.distance);
  const primaryPalette = getBiomePalette(biomeBlend.primary);
  const secondaryPalette = getBiomePalette(biomeBlend.secondary);
  const baseColor = mixPaletteColor(primaryPalette.base, secondaryPalette.base, biomeBlend.mix);
  const altColor = mixPaletteColor(primaryPalette.alt, secondaryPalette.alt, biomeBlend.mix);
  const detailColor = mixPaletteColor(primaryPalette.detail, secondaryPalette.detail, biomeBlend.mix);

  return {
    baseColor,
    altColor,
    detailColor,
    riverMix: biomeBlend.primary === "river"
      ? Math.max(0.45, 1 - biomeBlend.mix * 0.4)
      : biomeBlend.secondary === "river"
        ? biomeBlend.mix
        : 0,
  };
}

function generateSignals(segments, stations, totalLength) {
  const signals = [];
  const stationDistances = stations.map((station) => station.distance);
  const usableEnd = totalLength - TUNING.signals.endMargin;

  segments.forEach((segment) => {
    if (segment.speedLimit != null) {
      return;
    }

    let cursor = segment.start + TUNING.signals.segmentInset;
    const segmentEnd = Math.min(segment.end - TUNING.signals.segmentInset, usableEnd);
    while (cursor < segmentEnd) {
      const nearStation = stationDistances.some(
        (stationDistance) => Math.abs(stationDistance - cursor) < TUNING.signals.stationClearance,
      );

      if (!nearStation && Math.random() < TUNING.signals.spawnChance) {
        const roll = Math.random();
        const baseSignal = {
          distance: cursor,
          side: Math.random() < 0.5 ? -1 : 1,
        };

        if (roll < TUNING.signals.redChance) {
          signals.push({
            ...baseSignal,
            kind: "red",
            aspect: "red",
            clearAfter: rand(TUNING.signals.redHoldMin, TUNING.signals.redHoldMax),
            waitTimer: 0,
            passed: false,
          });
        } else if (roll < TUNING.signals.redChance + TUNING.signals.yellowChance) {
          signals.push({
            ...baseSignal,
            kind: "yellow",
            aspect: "yellow",
            speedLimit: rand(TUNING.signals.yellowSpeedLimitMin, TUNING.signals.yellowSpeedLimitMax),
            releaseDistance: Math.min(
              cursor + rand(TUNING.signals.yellowBlockLengthMin, TUNING.signals.yellowBlockLengthMax),
              usableEnd,
            ),
            passed: false,
          });
        } else {
          signals.push({
            ...baseSignal,
            kind: "green",
            aspect: "green",
            passed: false,
          });
        }
      }

      cursor += rand(TUNING.signals.spacingMin, TUNING.signals.spacingMax);
    }
  });

  return signals.sort((a, b) => a.distance - b.distance);
}

function chooseSceneryKind() {
  const kindRoll = Math.random();
  if (kindRoll > TUNING.scenery.windmillThreshold) {
    return "windmill";
  }
  if (kindRoll > TUNING.scenery.siloThreshold) {
    return "silo";
  }
  if (kindRoll > TUNING.scenery.barnThreshold) {
    return "barn";
  }
  if (kindRoll > TUNING.scenery.billboardThreshold) {
    return "billboard";
  }
  if (kindRoll > TUNING.scenery.pondThreshold) {
    return "pond";
  }
  if (kindRoll > TUNING.scenery.ruinThreshold) {
    return "ruins";
  }
  if (kindRoll > TUNING.scenery.hutThreshold) {
    return "hut";
  }
  if (kindRoll > TUNING.scenery.cactusThreshold) {
    return "cactus";
  }
  if (kindRoll > TUNING.scenery.rockThreshold) {
    return "rock";
  }
  if (kindRoll > TUNING.scenery.stumpThreshold) {
    return "stump";
  }
  if (kindRoll > TUNING.scenery.hayBaleThreshold) {
    return "hayBale";
  }
  if (kindRoll > TUNING.scenery.bushThreshold) {
    return "bush";
  }
  return "tree";
}

function generateScenery(stations, totalLength) {
  const scenery = [];
  const stationDistances = stations.map((station) => station.distance);
  let distance = TUNING.scenery.startDistance;

  while (distance < totalLength - TUNING.scenery.endMargin) {
    const nearStation = stationDistances.some(
      (stationDistance) => Math.abs(stationDistance - distance) < TUNING.scenery.stationClearance,
    );
    if (!nearStation) {
      const clusterCount = Math.random() < TUNING.scenery.fourObjectChance
        ? 4
        : Math.random() < TUNING.scenery.threeObjectChance
          ? 3
          : Math.random() < TUNING.scenery.twoObjectChance
            ? 2
            : 1;
      for (let index = 0; index < clusterCount; index += 1) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const nearTrack = Math.random() < TUNING.scenery.nearTrackChance;
        const offset = (
          nearTrack
            ? rand(TUNING.scenery.nearTrackOffsetMin, TUNING.scenery.nearTrackOffsetMax)
            : rand(TUNING.scenery.farOffsetMin, TUNING.scenery.farOffsetMax)
        ) * side;
        const baseDistance = distance + rand(TUNING.scenery.distanceJitterMin, TUNING.scenery.distanceJitterMax);

        scenery.push({
          distance: clamp(baseDistance, TUNING.scenery.objectMargin, totalLength - TUNING.scenery.objectMargin),
          offset,
          size: rand(TUNING.scenery.sizeMin, TUNING.scenery.sizeMax),
          rotation: rand(TUNING.scenery.rotationMin, TUNING.scenery.rotationMax),
          tint: rand(TUNING.scenery.tintMin, TUNING.scenery.tintMax),
          kind: chooseSceneryKind(),
        });
      }

    }

    distance += rand(TUNING.scenery.spacingMin, TUNING.scenery.spacingMax);
  }

  return scenery.sort((a, b) => a.distance - b.distance);
}

function createInitialState() {
  route = generateRoute();
  route.terrainTrackSamples = buildTerrainTrackSamples(route.totalLength);
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
  const sourceX = unit.renderX - forwardX * unit.length * 0.03;
  const sourceY = unit.renderY - forwardY * unit.length * 0.03;
  const sidewaysJitter = Math.random() * 0.18 - 0.09;
  const normalX = -Math.sin(heading);
  const normalY = Math.cos(heading);

  state.exhaustPuffs.push({
    x: sourceX,
    y: sourceY,
    visualElevation: unit.visualElevation + 7.5,
    driftX: 0.18 - forwardX * (0.12 + intensity * 0.14) + normalX * sidewaysJitter,
    driftY: -0.08 - forwardY * (0.12 + intensity * 0.14) + normalY * sidewaysJitter,
    verticalRise: 8 + intensity * 4 + Math.random() * 2,
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

  const locomotive = getRenderedTrainUnits()[0];
  const intensity = state.derailment ? 0 : getDieselExhaustIntensity();
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
    puff.visualElevation += puff.verticalRise * dt;
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
  return route.signals.find((signal) => {
    if (signal.kind === "red" && signal.aspect === "red") {
      return signal.distance >= state.distance - TUNING.signals.redPassMargin;
    }
    return signal.distance > state.distance;
  }) || null;
}

function getUpcomingRouteEntries() {
  const curveEntries = route.segments
    .filter((segment) => segment.speedLimit != null && segment.start >= state.distance)
    .map((segment) => ({
      type: "curve",
      distance: roundDisplayDistance(segment.start - state.distance),
      limitKph: Math.round(segment.speedLimit * 3.6),
      direction: segment.curvature >= 0 ? "Right" : "Left",
    }));

  const gradientEntries = route.gradientMarkers
    .filter((marker) => marker.distance >= state.distance)
    .map((marker) => ({
      type: "gradient",
      distance: roundDisplayDistance(marker.distance - state.distance),
      direction: marker.grade >= 0 ? "Up" : "Down",
      gradePercent: Math.abs(marker.percent),
    }));

  const signalEntries = route.signals
    .filter((signal) => signal.distance >= state.distance)
    .map((signal) => ({
      type: "signal",
      distance: roundDisplayDistance(signal.distance - state.distance),
      aspect: getSignalAspect(signal),
      limitKph: signal.kind === "yellow" ? Math.round(signal.speedLimit * 3.6) : null,
    }));

  return [...curveEntries, ...gradientEntries, ...signalEntries]
    .filter((entry) => entry.distance <= TUNING.route.upcomingCurveLookahead)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, TUNING.visuals.routePredictorMaxEntries);
}

function findUpcomingLimit() {
  const current = getEffectiveSpeedLimitInfo();
  const nextCurve = route.segments.find(
    (segment) =>
      segment.start > state.distance
      && segment.speedLimit != null
      && segment.start - state.distance < TUNING.route.upcomingCurveLookahead,
  );
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
  return {
    centerDistance: Math.max(0, signal.distance - TUNING.signals.redStopWindow * 0.5),
    radius: TUNING.signals.redStopWindow * TUNING.signals.redStopCircleScale,
  };
}

function isInsideRedStopZone(signal, distance = state.distance) {
  const stopZone = getRedStopZone(signal);
  return Math.abs(distance - stopZone.centerDistance) <= stopZone.radius;
}

function processSignals(dt) {
  state.signalStatus = null;
  const nextRed = route.signals.find(
    (signal) => signal.kind === "red" && signal.aspect === "red" && signal.distance >= state.distance - TUNING.signals.redPassMargin,
  );

  if (!nextRed) {
    return false;
  }

  const gap = nextRed.distance - state.distance;
  const stopZone = getRedStopZone(nextRed);
  const inStopZone = isInsideRedStopZone(nextRed);
  if (state.distance > stopZone.centerDistance + stopZone.radius) {
    beginDerailment("Passed a red signal at stop.");
    return true;
  }

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
    } else if (state.distance <= stopZone.centerDistance + stopZone.radius) {
      const zoneGap = stopZone.centerDistance - state.distance;
      state.signalStatus = {
        message: "Red signal ahead",
        detail: zoneGap > 0 ? `Stop in the red circle in ${roundDisplayDistance(zoneGap)} m.` : "Hold the locomotive front inside the red circle.",
      };
    }
  }

  return false;
}

function processSignalPasses() {
  const justPassedSignals = route.signals.filter(
    (signal) => !signal.passed && state.distance >= signal.distance,
  );

  for (const signal of justPassedSignals) {
    signal.passed = true;
    const aspect = getSignalAspect(signal);

    if (aspect === "red") {
      beginDerailment("Passed a red signal at stop.");
      return true;
    }

    if (signal.kind === "yellow" && state.speed > signal.speedLimit + OVERSPEED_FAIL_MARGIN) {
      const failReason = `Passed a ${Math.round(signal.speedLimit * 3.6)} km/h signal more than 10 km/h too fast.`;
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

  const gap = nextStation.distance - state.distance;
  if (Math.abs(gap) > STATION_ASSIST_RANGE) {
    return null;
  }

  const frontOffset = state.distance - nextStation.distance;
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
  const routePose = currentSegmentInfo();
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
  const gradeAcceleration = -(routePose.grade || 0) * TUNING.physics.gradeResistancePerUnitGradient;

  let acceleration = traction - braking - drag + gradeAcceleration;
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
    const failReason = `Exceeded the ${Math.round(current.limit * 3.6)} km/h limit by more than 10 km/h.`;
    beginDerailment(failReason);
    return true;
  }

  return false;
}

function currentSegmentInfo() {
  const info = evaluateRoute(state.distance);
  return info;
}

function getCurrentGradientPercent() {
  return currentSegmentInfo().grade * 100;
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

  const gap = nextStation.distance - state.distance;

  if (Math.abs(gap) <= STATION_WINDOW && state.speed <= STATION_STOP_SPEED) {
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
    state.detail = "A 100 m train takes space. Start easing off well before the station ring.";
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

function updateUi() {
  const nextStation = route.stations[state.stationIndex];
  const upcomingLimit = findUpcomingLimit();
  const gradientPercent = getCurrentGradientPercent();
  const shownLimit = upcomingLimit.limit;
  const shownUpcomingLimit = upcomingLimit.upcomingLimit;
  const gap = nextStation ? nextStation.distance - state.distance : 0;
  const assist = getStopAssistData();
  const statusMessage = state.signalStatus ? state.signalStatus.message : state.message;
  const statusDetail = state.signalStatus ? state.signalStatus.detail : state.detail;

  statusText.textContent = statusMessage;
  subStatus.textContent = statusDetail;
  speedKph.textContent = Math.round(state.speed * 3.6);
  lineLimitKph.textContent = shownLimit == null ? "No limit" : Math.round(shownLimit * 3.6);
  lineLimitSecondary.textContent = shownLimit == null
    ? `Line unrestricted${Math.abs(gradientPercent) >= 0.05 ? ` • ${gradientPercent >= 0 ? "Up" : "Down"} ${Math.abs(gradientPercent).toFixed(1)}%` : ""}`
    : `Curve limit ${Math.round(shownLimit * 3.6)} km/h${Math.abs(gradientPercent) >= 0.05 ? ` • ${gradientPercent >= 0 ? "Up" : "Down"} ${Math.abs(gradientPercent).toFixed(1)}%` : ""}`;
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

function updateBar(element, value) {
  const center = 50;
  const magnitude = Math.abs(value) * 50;
  element.style.width = `${magnitude}%`;
  element.style.left = value >= 0 ? `${center}%` : `${center - magnitude}%`;
}

function updateMarker(element, value) {
  element.style.left = `${50 + value * 50}%`;
}

function worldToScreenWithView(point, view, width) {
  const projected = projectIsometricPoint(point, view.camera);
  return {
    x: view.anchorX + projected.x * view.scale,
    y: view.anchorY + projected.y * view.scale,
  };
}

function getProjectedAngle(heading) {
  const projectedX = Math.cos(heading) - Math.sin(heading);
  const projectedY = (Math.cos(heading) + Math.sin(heading)) * TUNING.visuals.isometricVerticalScale;
  return Math.atan2(projectedY, projectedX);
}

function projectIsometricPoint(point, camera) {
  const isoVerticalScale = TUNING.visuals.isometricVerticalScale;
  const elevationScale = TUNING.visuals.isometricElevationScale;
  const elevation = point.visualElevation != null ? point.visualElevation : point.elevation || 0;
  const dx = point.x - camera.x;
  const dy = point.y - camera.y;
  return {
    x: dx - dy,
    y: (dx + dy) * isoVerticalScale - elevation * elevationScale,
  };
}

function shadeColor(color, amount) {
  const base = color.trim();
  if (base.startsWith("hsl")) {
    const parts = base.match(/-?\d+(\.\d+)?/g);
    if (!parts || parts.length < 3) {
      return color;
    }
    const hue = Number(parts[0]);
    const saturation = Number(parts[1]);
    const lightness = clamp(Number(parts[2]) + amount, 8, 92);
    return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
  }
  if (base.startsWith("#")) {
    const value = base.slice(1);
    const expanded = value.length === 3
      ? value.split("").map((char) => `${char}${char}`).join("")
      : value;
    if (expanded.length !== 6) {
      return color;
    }
    const channels = [0, 2, 4].map((offset) => parseInt(expanded.slice(offset, offset + 2), 16));
    const adjusted = channels.map((channel) => clamp(channel + amount * 2.5, 0, 255));
    return `rgb(${adjusted.map((channel) => Math.round(channel)).join(", ")})`;
  }
  return color;
}

function createSpriteCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = width;
  spriteCanvas.height = height;
  return spriteCanvas;
}

function drawIsoPrism(width, depth, height, topColor, leftColor, rightColor, strokeColor = "rgba(255,255,255,0.35)", targetCtx = ctx) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const topFace = [
    { x: 0, y: -height - halfDepth },
    { x: halfWidth, y: -height },
    { x: 0, y: -height + halfDepth },
    { x: -halfWidth, y: -height },
  ];
  const leftFace = [
    { x: -halfWidth, y: -height },
    { x: 0, y: -height + halfDepth },
    { x: 0, y: halfDepth },
    { x: -halfWidth, y: 0 },
  ];
  const rightFace = [
    { x: halfWidth, y: -height },
    { x: 0, y: -height + halfDepth },
    { x: 0, y: halfDepth },
    { x: halfWidth, y: 0 },
  ];

  targetCtx.fillStyle = leftColor;
  targetCtx.beginPath();
  targetCtx.moveTo(leftFace[0].x, leftFace[0].y);
  leftFace.slice(1).forEach((point) => targetCtx.lineTo(point.x, point.y));
  targetCtx.closePath();
  targetCtx.fill();

  targetCtx.fillStyle = rightColor;
  targetCtx.beginPath();
  targetCtx.moveTo(rightFace[0].x, rightFace[0].y);
  rightFace.slice(1).forEach((point) => targetCtx.lineTo(point.x, point.y));
  targetCtx.closePath();
  targetCtx.fill();

  targetCtx.fillStyle = topColor;
  targetCtx.strokeStyle = strokeColor;
  targetCtx.lineWidth = 1;
  targetCtx.beginPath();
  targetCtx.moveTo(topFace[0].x, topFace[0].y);
  topFace.slice(1).forEach((point) => targetCtx.lineTo(point.x, point.y));
  targetCtx.closePath();
  targetCtx.fill();
  targetCtx.stroke();
}

function drawConiferTree(unitScale, trunkColor, foliageBase, targetCtx = ctx) {
  const trunkHeight = Math.max(10, unitScale * 7);
  drawIsoPrism(
    Math.max(4, unitScale * 1.3),
    Math.max(4, unitScale * 1.1),
    trunkHeight,
    shadeColor(trunkColor, 8),
    shadeColor(trunkColor, -14),
    shadeColor(trunkColor, -4),
    "rgba(255,255,255,0.35)",
    targetCtx,
  );
  targetCtx.translate(0, -trunkHeight);
  const tiers = [
    { width: 18, depth: 14, height: 16, lift: 0 },
    { width: 14, depth: 11, height: 13, lift: 8 },
    { width: 10, depth: 8, height: 10, lift: 14 },
  ];
  tiers.forEach((tier) => {
    targetCtx.save();
    targetCtx.translate(0, -tier.lift);
    drawIsoPrism(
      Math.max(tier.width, unitScale * tier.width),
      Math.max(tier.depth, unitScale * tier.depth),
      Math.max(tier.height, unitScale * tier.height),
      shadeColor(foliageBase, 16 - tier.lift * 0.2),
      shadeColor(foliageBase, -22),
      shadeColor(foliageBase, -8),
      "rgba(255,255,255,0.18)",
      targetCtx,
    );
    targetCtx.restore();
  });
}

function drawMountainCluster(unitScale, palette, snowCap = false, targetCtx = ctx) {
  const peaks = [
    { x: -unitScale * 5.4, y: 0, w: 18, d: 14, h: 26 },
    { x: 0, y: -unitScale * 1.6, w: 24, d: 18, h: 34 },
    { x: unitScale * 6.2, y: unitScale * 1.2, w: 16, d: 12, h: 22 },
  ];

  peaks.forEach((peak, index) => {
    targetCtx.save();
    targetCtx.translate(peak.x, peak.y);
    drawIsoPrism(
      Math.max(peak.w, unitScale * peak.w),
      Math.max(peak.d, unitScale * peak.d),
      Math.max(peak.h, unitScale * peak.h),
      index === 1 ? palette.top : shadeColor(palette.top, -4),
      index === 1 ? palette.left : shadeColor(palette.left, -6),
      index === 1 ? palette.right : shadeColor(palette.right, -4),
      "rgba(255,255,255,0.14)",
      targetCtx,
    );
    if (snowCap && peak.h >= 24) {
      targetCtx.translate(0, -Math.max(peak.h, unitScale * peak.h) + Math.max(8, unitScale * 6));
      drawIsoPrism(
        Math.max(peak.w * 0.42, unitScale * peak.w * 0.42),
        Math.max(peak.d * 0.36, unitScale * peak.d * 0.36),
        Math.max(8, unitScale * 5.5),
        "rgba(246, 247, 240, 0.96)",
        "rgba(208, 214, 220, 0.94)",
        "rgba(226, 230, 234, 0.94)",
        "rgba(255,255,255,0.12)",
        targetCtx,
      );
    }
    targetCtx.restore();
  });
}

function drawCachedScenerySprite(targetCtx, sprite, x, y, rotation, drawScale = 1) {
  targetCtx.save();
  targetCtx.translate(x, y);
  targetCtx.rotate(rotation);
  targetCtx.scale(drawScale, drawScale);
  targetCtx.drawImage(sprite.canvas, -sprite.anchorX, -sprite.anchorY);
  targetCtx.restore();
}

function getScenerySprite(key, drawFn) {
  if (route.scenerySpriteCache.has(key)) {
    return route.scenerySpriteCache.get(key);
  }

  const spriteCanvas = createSpriteCanvas(196, 196);
  const spriteCtx = spriteCanvas.getContext("2d");
  spriteCtx.translate(98, 144);
  drawFn(spriteCtx);
  const sprite = {
    canvas: spriteCanvas,
    anchorX: 98,
    anchorY: 144,
  };
  route.scenerySpriteCache.set(key, sprite);
  return sprite;
}

function getTerrainTextureSprite(key, drawFn) {
  if (route.terrainTextureCache.has(key)) {
    return route.terrainTextureCache.get(key);
  }

  const textureCanvas = createSpriteCanvas(96, 96);
  const textureCtx = textureCanvas.getContext("2d");
  drawFn(textureCtx, textureCanvas.width, textureCanvas.height);
  const texture = { canvas: textureCanvas };
  route.terrainTextureCache.set(key, texture);
  return texture;
}

function drawBackground(width, height) {
  const view = getViewMetrics(width, height);
  const { camera, scale } = view;
  const speedFactor = state ? clamp(state.speed / MAX_LINE_SPEED, 0, TUNING.visuals.backgroundSpeedMaxFactor) : 0;
  const boostedSpeedFactor = Math.pow(speedFactor, 0.72);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#a6c57d");
  gradient.addColorStop(0.36, "#88aa68");
  gradient.addColorStop(0.68, "#ccb57e");
  gradient.addColorStop(1, "#769760");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const cellSize = TUNING.visuals.terrainCellSize;
  const worldRadius = Math.max(width, height) * 1.7 / Math.max(scale, 1e-6);
  const startWorldX = Math.floor((camera.x - worldRadius - cellSize) / cellSize) * cellSize;
  const endWorldX = Math.ceil((camera.x + worldRadius + cellSize) / cellSize) * cellSize;
  const startWorldY = Math.floor((camera.y - worldRadius - cellSize) / cellSize) * cellSize;
  const endWorldY = Math.ceil((camera.y + worldRadius + cellSize) / cellSize) * cellSize;

  for (let worldY = startWorldY; worldY <= endWorldY; worldY += cellSize) {
    for (let worldX = startWorldX; worldX <= endWorldX; worldX += cellSize) {
      const cellGridX = Math.floor(worldX / cellSize);
      const cellGridY = Math.floor(worldY / cellSize);
      const tileKey = `${cellGridX},${cellGridY}`;
      let tileStyle = route.terrainTileCache.get(tileKey);
      if (!tileStyle) {
        tileStyle = createTerrainTileStyle(cellGridX, cellGridY);
        route.terrainTileCache.set(tileKey, tileStyle);
      }

      const topLeft = getTerrainCornerStyle(cellGridX, cellGridY);
      const topRight = getTerrainCornerStyle(cellGridX + 1, cellGridY);
      const bottomLeft = getTerrainCornerStyle(cellGridX, cellGridY + 1);
      const bottomRight = getTerrainCornerStyle(cellGridX + 1, cellGridY + 1);

      const topEdgeBase = mixPaletteColor(topLeft.baseColor, topRight.baseColor, 0.5);
      const bottomEdgeBase = mixPaletteColor(bottomLeft.baseColor, bottomRight.baseColor, 0.5);
      const topEdgeAlt = mixPaletteColor(topLeft.altColor, topRight.altColor, 0.5);
      const bottomEdgeAlt = mixPaletteColor(bottomLeft.altColor, bottomRight.altColor, 0.5);
      const topEdgeDetail = mixPaletteColor(topLeft.detailColor, topRight.detailColor, 0.5);
      const bottomEdgeDetail = mixPaletteColor(bottomLeft.detailColor, bottomRight.detailColor, 0.5);

      const cellAverageHeight = getTerrainCellAverageHeight(cellGridX, cellGridY);
      const heightBand = Math.round(cellAverageHeight / 6);
      const bandMix = clamp((heightBand + 8) / 24, 0, 1);
      const stylizedTop = mixPaletteColor(topEdgeBase, topEdgeAlt, 0.2 + bandMix * 0.2);
      const stylizedBottom = mixPaletteColor(bottomEdgeBase, bottomEdgeDetail, 0.18 + bandMix * 0.24);
      const topColor = mixPaletteColor(stylizedTop, topEdgeDetail, tileStyle.toneSeed * 0.08);
      const bottomColor = mixPaletteColor(stylizedBottom, bottomEdgeDetail, tileStyle.biomeSeed * 0.08);
      const topLeftHeight = getTerrainGridHeight(cellGridX, cellGridY);
      const topRightHeight = getTerrainGridHeight(cellGridX + 1, cellGridY);
      const bottomLeftHeight = getTerrainGridHeight(cellGridX, cellGridY + 1);
      const bottomRightHeight = getTerrainGridHeight(cellGridX + 1, cellGridY + 1);
      const localMinHeight = Math.min(topLeftHeight, topRightHeight, bottomLeftHeight, bottomRightHeight);
      const localMaxHeight = Math.max(topLeftHeight, topRightHeight, bottomLeftHeight, bottomRightHeight);
      const relief = localMaxHeight - localMinHeight;
      const top = worldToScreenWithView({
        x: worldX + cellSize * 0.5,
        y: worldY,
        visualElevation: (topLeftHeight + topRightHeight) * 0.5,
      }, view, width);
      const right = worldToScreenWithView({
        x: worldX + cellSize,
        y: worldY + cellSize * 0.5,
        visualElevation: (topRightHeight + bottomRightHeight) * 0.5,
      }, view, width);
      const bottom = worldToScreenWithView({
        x: worldX + cellSize * 0.5,
        y: worldY + cellSize,
        visualElevation: (bottomLeftHeight + bottomRightHeight) * 0.5,
      }, view, width);
      const left = worldToScreenWithView({
        x: worldX,
        y: worldY + cellSize * 0.5,
        visualElevation: (topLeftHeight + bottomLeftHeight) * 0.5,
      }, view, width);
      const center = worldToScreenWithView({
        x: worldX + cellSize * 0.5,
        y: worldY + cellSize * 0.5,
        visualElevation: getTerrainHeightAtWorld(worldX + cellSize * 0.5, worldY + cellSize * 0.5),
      }, view, width);
      const rightNeighborHeight = getTerrainCellAverageHeight(cellGridX + 1, cellGridY);
      const bottomNeighborHeight = getTerrainCellAverageHeight(cellGridX, cellGridY + 1);

      if (center.x < -cellSize * scale * 2 || center.x > width + cellSize * scale * 2 || center.y < -cellSize * scale * 2 || center.y > height + cellSize * scale * 2) {
        continue;
      }

      if (cellAverageHeight > rightNeighborHeight + 0.5) {
        const rightDrop = cellAverageHeight - rightNeighborHeight;
        const lowerTopRight = worldToScreenWithView({
          x: worldX + cellSize,
          y: worldY + cellSize * 0.5,
          visualElevation: (topRightHeight + bottomRightHeight) * 0.5 - rightDrop,
        }, view, width);
        const lowerBottom = worldToScreenWithView({
          x: worldX + cellSize * 0.5,
          y: worldY + cellSize,
          visualElevation: (bottomLeftHeight + bottomRightHeight) * 0.5 - rightDrop * 0.92,
        }, view, width);
        ctx.fillStyle = `rgba(74, 88, 55, ${clamp(0.2 + rightDrop * 0.018, 0.2, 0.42).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(right.x, right.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.lineTo(lowerBottom.x, lowerBottom.y);
        ctx.lineTo(lowerTopRight.x, lowerTopRight.y);
        ctx.closePath();
        ctx.fill();
      }

      if (cellAverageHeight > bottomNeighborHeight + 0.5) {
        const bottomDrop = cellAverageHeight - bottomNeighborHeight;
        const lowerLeft = worldToScreenWithView({
          x: worldX,
          y: worldY + cellSize * 0.5,
          visualElevation: (topLeftHeight + bottomLeftHeight) * 0.5 - bottomDrop,
        }, view, width);
        const lowerRight = worldToScreenWithView({
          x: worldX + cellSize,
          y: worldY + cellSize * 0.5,
          visualElevation: (topRightHeight + bottomRightHeight) * 0.5 - bottomDrop,
        }, view, width);
        ctx.fillStyle = `rgba(98, 109, 63, ${clamp(0.18 + bottomDrop * 0.016, 0.18, 0.38).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.lineTo(lowerRight.x, lowerRight.y);
        ctx.lineTo(lowerLeft.x, lowerLeft.y);
        ctx.closePath();
        ctx.fill();
      }

      const detailColor = mixPaletteColor(topEdgeDetail, bottomEdgeDetail, 0.5);
      const riverMix = lerp(topLeft.riverMix, bottomRight.riverMix, 0.5);
      const textureKey = [
        Math.round(topColor[0]), Math.round(topColor[1]), Math.round(topColor[2]), Math.round(topColor[3] * 100),
        Math.round(bottomColor[0]), Math.round(bottomColor[1]), Math.round(bottomColor[2]), Math.round(bottomColor[3] * 100),
        Math.round(detailColor[0]), Math.round(detailColor[1]), Math.round(detailColor[2]),
        Math.round(tileStyle.biomeSeed * 4),
        Math.round(tileStyle.toneSeed * 4),
        Math.round(riverMix * 4),
      ].join(":");
      const terrainTexture = getTerrainTextureSprite(textureKey, (textureCtx, spriteWidth, spriteHeight) => {
        const tileGradient = textureCtx.createLinearGradient(0, 0, 0, spriteHeight);
        tileGradient.addColorStop(0, paletteColorToCss(topColor));
        tileGradient.addColorStop(1, paletteColorToCss(bottomColor));
        textureCtx.fillStyle = tileGradient;
        textureCtx.fillRect(0, 0, spriteWidth, spriteHeight);

        textureCtx.strokeStyle = `rgba(${Math.round(detailColor[0])}, ${Math.round(detailColor[1])}, ${Math.round(detailColor[2])}, 0.07)`;
        textureCtx.lineWidth = 5;
        textureCtx.beginPath();
        textureCtx.moveTo(-spriteWidth * 0.12, spriteHeight * 0.22);
        textureCtx.lineTo(spriteWidth * 1.02, spriteHeight * 0.66);
        textureCtx.moveTo(-spriteWidth * 0.06, spriteHeight * 0.58);
        textureCtx.lineTo(spriteWidth * 0.96, spriteHeight * 0.96);
        textureCtx.stroke();

        textureCtx.strokeStyle = "rgba(255, 255, 255, 0.045)";
        textureCtx.lineWidth = 2;
        textureCtx.beginPath();
        textureCtx.moveTo(spriteWidth * 0.08, spriteHeight * 0.3);
        textureCtx.lineTo(spriteWidth * 0.92, spriteHeight * 0.46);
        textureCtx.moveTo(spriteWidth * 0.14, spriteHeight * 0.76);
        textureCtx.lineTo(spriteWidth * 0.86, spriteHeight * 0.6);
        textureCtx.stroke();

        textureCtx.fillStyle = `rgba(${Math.round(detailColor[0])}, ${Math.round(detailColor[1])}, ${Math.round(detailColor[2])}, 0.08)`;
        const ovalCount = 3;
        for (let ovalIndex = 0; ovalIndex < ovalCount; ovalIndex += 1) {
          const px = [0.24, 0.54, 0.8][ovalIndex] * spriteWidth;
          const py = [0.26, 0.54, 0.78][ovalIndex] * spriteHeight;
          const rx = 10 + hashNoise(ovalIndex + 17, tileStyle.biomeSeed * 37) * 10;
          const ry = rx * 0.55;
          const angle = [0.28, -0.32, 0.18][ovalIndex];
          textureCtx.beginPath();
          textureCtx.ellipse(px, py, rx, ry, angle, 0, Math.PI * 2);
          textureCtx.fill();
        }

        if (riverMix > 0.05) {
          textureCtx.fillStyle = `rgba(84, 154, 194, ${(0.08 + riverMix * 0.14).toFixed(3)})`;
          textureCtx.beginPath();
          textureCtx.ellipse(
            spriteWidth * (0.32 + tileStyle.biomeSeed * 0.36),
            spriteHeight * 0.52,
            spriteWidth * 0.18,
            spriteHeight * 0.08,
            0,
            0,
            Math.PI * 2,
          );
          textureCtx.fill();
        }
      });

      const tileMinX = Math.min(top.x, right.x, bottom.x, left.x);
      const tileMaxX = Math.max(top.x, right.x, bottom.x, left.x);
      const tileMinY = Math.min(top.y, right.y, bottom.y, left.y);
      const tileMaxY = Math.max(top.y, right.y, bottom.y, left.y);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(right.x, right.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.lineTo(left.x, left.y);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(terrainTexture.canvas, tileMinX, tileMinY, Math.max(1, tileMaxX - tileMinX), Math.max(1, tileMaxY - tileMinY));
      ctx.restore();
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.07 + relief * 0.008).toFixed(3)})`;
      ctx.lineWidth = 1 + clamp(relief * 0.025, 0, 1.4);
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(right.x, right.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.lineTo(left.x, left.y);
      ctx.closePath();
      ctx.stroke();

      const slopeX = ((topRightHeight + bottomRightHeight) - (topLeftHeight + bottomLeftHeight)) * 0.5;
      const slopeY = ((bottomLeftHeight + bottomRightHeight) - (topLeftHeight + topRightHeight)) * 0.5;
      const light = clamp(0.52 + (-slopeX * 0.018) + (-slopeY * 0.014), 0.2, 0.82);
      const edgeHighlightAlpha = clamp(relief * 0.003 + light * 0.04, 0.02, 0.06);
      ctx.strokeStyle = `rgba(255, 255, 255, ${edgeHighlightAlpha.toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
      ctx.strokeStyle = `rgba(16, 24, 18, ${clamp(relief * 0.004 + (1 - light) * 0.05, 0.02, 0.07).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.stroke();

      const tuftSize = (6 + hashNoise(cellGridX + 14, cellGridY + 3) * 16) * scale * 0.8;
      void tuftSize;
      void center;
    }
  }

  if (speedFactor > TUNING.visuals.backgroundStreakThreshold) {
    ctx.save();
    ctx.strokeStyle = `rgba(190, 225, 255, ${0.04 + boostedSpeedFactor * 0.07})`;
    ctx.lineWidth = 0.9 + boostedSpeedFactor * 0.45;
    for (let index = 0; index < TUNING.visuals.backgroundStreakCount; index += 1) {
      const phase = index % 2 === 0 ? 1 : -1;
      const verticalOffset = Math.sin(state.distance * 0.012 + index * 0.9) * 10;
      const laneY = ((index * TUNING.visuals.backgroundStreakSpacing)
        + state.distance * TUNING.visuals.backgroundStreakTravel
        + verticalOffset) % (height + 120) - 60;
      const streakLength = TUNING.visuals.backgroundStreakBaseLength
        + boostedSpeedFactor * TUNING.visuals.backgroundStreakLengthBySpeed;
      const inset = 18 + index * 1.6;
      ctx.beginPath();
      ctx.moveTo(inset, laneY);
      ctx.lineTo(inset + streakLength, laneY - streakLength * (0.18 + boostedSpeedFactor * 0.08) * phase);
      ctx.moveTo(width - inset, laneY + 10);
      ctx.lineTo(width - inset - streakLength, laneY + 10 - streakLength * (0.18 + boostedSpeedFactor * 0.08) * phase);
      ctx.stroke();
    }
    ctx.restore();
  }

  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.58,
    Math.min(width, height) * 0.2,
    width * 0.5,
    height * 0.58,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(3, 8, 14, 0.34)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function getSceneryPoint(item) {
  const point = evaluateRoute(item.distance);
  const normalX = -Math.sin(point.heading);
  const normalY = Math.cos(point.heading);
  const worldX = point.x + normalX * item.offset;
  const worldY = point.y + normalY * item.offset;
  const visualElevation = getTerrainHeightAtWorld(worldX, worldY);

  return {
    x: worldX,
    y: worldY,
    elevation: visualElevation / Math.max(TUNING.visuals.terrainHeightExaggeration, 1e-6),
    visualElevation,
  };
}

function drawScenery(view, width, height) {
  const { scale } = view;

  route.scenery.forEach((item) => {
    if (item.distance < view.startDistance - 60 || item.distance > view.endDistance + 60) {
      return;
    }

    const point = getSceneryPoint(item);
    const biomeBlend = getBiomeBlendAtDistance(item.distance);
    const alpineBlend = biomeBlend.primary === "mountain" || biomeBlend.secondary === "mountain"
      ? Math.max(0.45, biomeBlend.mix > 0.5 ? biomeBlend.mix : 1 - biomeBlend.mix)
      : biomeBlend.primary === "canyon" || biomeBlend.secondary === "canyon"
        ? 0.2
        : 0;
    const elevationFactor = clamp((point.visualElevation + 36) / 120, 0, 1);
    const terrainAffinity = clamp(Math.abs(item.offset) / Math.max(TUNING.scenery.farOffsetMin, 1e-6), 0, 1);
    const mountainFactor = clamp(Math.max(elevationFactor * 0.85, alpineBlend) * terrainAffinity, 0, 1);
    const deterministicRoll = hashNoise(item.distance * 0.013, item.offset * 0.021);
    const screen = worldToScreenWithView(point, view, width);

    if (screen.y < -80 || screen.y > height + 80 || screen.x < -80 || screen.x > width + 80) {
      return;
    }

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(getProjectedAngle(item.rotation));

    const unitScale = scale * item.size;
    const foliage = mountainFactor > 0.52
      ? (item.tint > 0 ? "#6fa85e" : "#4f7f48")
      : item.tint > 0
        ? "#4f8a52"
        : "#427446";
    const alpinePalette = {
      top: mountainFactor > 0.72 ? "#d8c28e" : "#b9ae8b",
      left: mountainFactor > 0.72 ? "#8a7351" : "#6f6552",
      right: mountainFactor > 0.72 ? "#b18d58" : "#938060",
    };

    if (mountainFactor > 0.62 && deterministicRoll > 0.4 && item.kind !== "pond" && item.kind !== "billboard" && item.kind !== "windmill") {
      const mountainUnitScale = unitScale * (0.9 + mountainFactor * 0.7);
      const mountainScale = Math.max(0.25, Math.round(mountainUnitScale * 4) / 4);
      const mountainDrawScale = mountainUnitScale / mountainScale;
      const sprite = getScenerySprite(
        `mountain:${mountainScale}:${alpinePalette.top}:${alpinePalette.left}:${alpinePalette.right}:${mountainFactor > 0.78}:${deterministicRoll > 0.72}:${deterministicRoll < 0.58}`,
        (spriteCtx) => {
          drawMountainCluster(mountainScale, alpinePalette, mountainFactor > 0.78, spriteCtx);
          if (deterministicRoll > 0.72) {
            spriteCtx.save();
            spriteCtx.translate(-mountainScale * 7, mountainScale * 3);
            drawConiferTree(mountainScale * 0.72, "#63442f", "#4c7b43", spriteCtx);
            spriteCtx.restore();
          }
          if (deterministicRoll < 0.58) {
            spriteCtx.save();
            spriteCtx.translate(mountainScale * 8, mountainScale * 4);
            drawConiferTree(mountainScale * 0.64, "#63442f", "#567f48", spriteCtx);
            spriteCtx.restore();
          }
        },
      );
      ctx.restore();
      drawCachedScenerySprite(ctx, sprite, screen.x, screen.y, getProjectedAngle(item.rotation), mountainDrawScale);
      return;
    }

    const spriteScale = Math.max(0.25, Math.round(unitScale * 4) / 4);
    const spriteDrawScale = unitScale / spriteScale;
    const spriteKeyBase = `${item.kind}:${spriteScale}:${item.tint > 0 ? 1 : 0}:${Math.round(mountainFactor * 10)}:${Math.round(deterministicRoll * 10)}`;

    if (item.kind === "tree") {
      const sprite = getScenerySprite(
        `${spriteKeyBase}:tree:${foliage}`,
        (spriteCtx) => {
          if (mountainFactor > 0.34 || deterministicRoll > 0.64) {
            drawConiferTree(spriteScale, "#694732", shadeColor(foliage, 4), spriteCtx);
          } else {
            drawIsoPrism(Math.max(6, spriteScale * 2.2), Math.max(5, spriteScale * 1.8), Math.max(10, spriteScale * 8), "#6a4b38", "#523827", "#7a5843", "rgba(255,255,255,0.35)", spriteCtx);
            spriteCtx.translate(0, -Math.max(10, spriteScale * 8));
            drawIsoPrism(Math.max(18, spriteScale * 7.2), Math.max(14, spriteScale * 5.8), Math.max(18, spriteScale * 7.8), shadeColor(foliage, 12), shadeColor(foliage, -16), shadeColor(foliage, -6), "rgba(255,255,255,0.35)", spriteCtx);
          }
        },
      );
      ctx.restore();
      drawCachedScenerySprite(ctx, sprite, screen.x, screen.y, getProjectedAngle(item.rotation), spriteDrawScale);
      return;
    } else if (item.kind === "bush") {
      const sprite = getScenerySprite(
        `${spriteKeyBase}:bush:${foliage}`,
        (spriteCtx) => {
          drawIsoPrism(Math.max(16, spriteScale * 6.6), Math.max(12, spriteScale * 5.2), Math.max(9, spriteScale * 3.4), shadeColor(foliage, 10), shadeColor(foliage, -14), shadeColor(foliage, -6), "rgba(255,255,255,0.35)", spriteCtx);
        },
      );
      ctx.restore();
      drawCachedScenerySprite(ctx, sprite, screen.x, screen.y, getProjectedAngle(item.rotation), spriteDrawScale);
      return;
    } else if (item.kind === "rock") {
      const sprite = getScenerySprite(
        `${spriteKeyBase}:rock:${alpinePalette.top}`,
        (spriteCtx) => {
          if (mountainFactor > 0.42) {
            drawMountainCluster(spriteScale * 0.66, alpinePalette, mountainFactor > 0.8, spriteCtx);
          } else {
            drawIsoPrism(Math.max(14, spriteScale * 5.5), Math.max(10, spriteScale * 4.2), Math.max(8, spriteScale * 3), "#8b97a2", "#67727d", "#7a8792", "rgba(255,255,255,0.35)", spriteCtx);
          }
        },
      );
      ctx.restore();
      drawCachedScenerySprite(ctx, sprite, screen.x, screen.y, getProjectedAngle(item.rotation), spriteDrawScale);
      return;
    } else if (item.kind === "hut") {
      drawIsoPrism(Math.max(18, unitScale * 6.5), Math.max(14, unitScale * 5), Math.max(14, unitScale * 5.4), "#d0a16e", "#a77445", "#be8d60");
      ctx.translate(0, -Math.max(14, unitScale * 5.4));
      drawIsoPrism(Math.max(20, unitScale * 7.2), Math.max(16, unitScale * 5.7), Math.max(6, unitScale * 2.2), "#7d5539", "#643f2a", "#8c6041");
    } else if (item.kind === "barn") {
      drawIsoPrism(Math.max(24, unitScale * 8.5), Math.max(18, unitScale * 6.5), Math.max(16, unitScale * 6), "#c55f53", "#913a31", "#ab4b40");
      ctx.translate(0, -Math.max(16, unitScale * 6));
      drawIsoPrism(Math.max(26, unitScale * 9), Math.max(20, unitScale * 7), Math.max(7, unitScale * 2.6), "#8d3b33", "#6f2a24", "#7e312a");
    } else if (item.kind === "billboard") {
      drawIsoPrism(Math.max(3, unitScale * 1.1), Math.max(3, unitScale * 1.1), Math.max(18, unitScale * 8), "#5c4638", "#48362c", "#654d3e");
      ctx.translate(0, -Math.max(18, unitScale * 8));
      drawIsoPrism(Math.max(22, unitScale * 8.6), Math.max(5, unitScale * 1.9), Math.max(10, unitScale * 3.8), item.tint > 0 ? "#ffe28a" : "#9ad7ff", "#d0b56c", "#87b9da");
    } else if (item.kind === "pond") {
      ctx.fillStyle = "rgba(92, 177, 221, 0.72)";
      ctx.beginPath();
      ctx.moveTo(0, -unitScale * 2.2);
      ctx.lineTo(unitScale * 3.2, 0);
      ctx.lineTo(0, unitScale * 2.2);
      ctx.lineTo(-unitScale * 3.2, 0);
      ctx.closePath();
      ctx.fill();
    } else if (item.kind === "ruins") {
      drawIsoPrism(Math.max(18, unitScale * 7), Math.max(14, unitScale * 5.2), Math.max(11, unitScale * 4.2), "#9b8a79", "#776756", "#897866");
    } else if (item.kind === "cactus") {
      drawIsoPrism(Math.max(7, unitScale * 2.5), Math.max(6, unitScale * 2.2), Math.max(18, unitScale * 8.6), "#4c8b5c", "#346844", "#3f7850");
    } else if (item.kind === "stump") {
      drawIsoPrism(Math.max(10, unitScale * 4.1), Math.max(8, unitScale * 3.1), Math.max(6, unitScale * 2.2), "#8b6744", "#6d4f32", "#7b5a3b");
    } else if (item.kind === "hayBale") {
      drawIsoPrism(Math.max(12, unitScale * 4.8), Math.max(9, unitScale * 3.6), Math.max(7, unitScale * 2.8), "#e0be66", "#ba9647", "#cfae5c");
    } else if (item.kind === "silo") {
      drawIsoPrism(Math.max(13, unitScale * 4.8), Math.max(13, unitScale * 4.8), Math.max(20, unitScale * 9), "#bcc5cd", "#8e989f", "#a2adb4");
    } else if (item.kind === "windmill") {
      drawIsoPrism(Math.max(4, unitScale * 1.2), Math.max(4, unitScale * 1.2), Math.max(22, unitScale * 10), "#d7dee4", "#9aa8b1", "#b5c1c9");
      ctx.translate(0, -Math.max(22, unitScale * 10));
      ctx.strokeStyle = "#e9f0f5";
      ctx.lineWidth = Math.max(1, unitScale * 0.35);
      for (let bladeIndex = 0; bladeIndex < 4; bladeIndex += 1) {
        const angle = bladeIndex * Math.PI * 0.5 + item.rotation * 2.4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * unitScale * 4.2, Math.sin(angle) * unitScale * 2.2);
        ctx.stroke();
      }
    } else {
      drawIsoPrism(Math.max(16, unitScale * 6), Math.max(12, unitScale * 4.8), Math.max(12, unitScale * 4.4), "#c8b18f", "#9d8666", "#b39a79");
    }

    ctx.restore();
  });
}

function drawTrack(width, height) {
  const view = getViewMetrics(width, height);
  const { scale, startDistance, endDistance } = view;

  drawScenery(view, width, height);

  const centerPoints = [];
  const leftRail = [];
  const rightRail = [];
  const sampleStep = TUNING.visuals.trackSampleStep;
  const sampleStart = Math.max(0, Math.floor(startDistance / sampleStep) * sampleStep);
  const sleeperWorldStep = sampleStep * TUNING.visuals.sleeperStep;
  const sleeperStart = Math.max(0, Math.floor(startDistance / sleeperWorldStep) * sleeperWorldStep);

  for (let sample = sampleStart; sample <= endDistance; sample += sampleStep) {
    const point = evaluateRoute(sample);
    const normalX = -Math.sin(point.heading);
    const normalY = Math.cos(point.heading);
    centerPoints.push(worldToScreenWithView(point, view, width));
    leftRail.push(
      worldToScreenWithView({
        x: point.x + normalX * TRACK_WIDTH * 0.5,
        y: point.y + normalY * TRACK_WIDTH * 0.5,
        visualElevation: point.visualElevation,
      }, view, width),
    );
    rightRail.push(
      worldToScreenWithView({
        x: point.x - normalX * TRACK_WIDTH * 0.5,
        y: point.y - normalY * TRACK_WIDTH * 0.5,
        visualElevation: point.visualElevation,
      }, view, width),
    );
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "rgba(194, 176, 132, 0.46)";
  ctx.lineWidth = Math.max(
    TUNING.visuals.terrainClearWidthMin,
    TRACK_WIDTH * scale * TUNING.visuals.terrainClearWidthScale,
  );
  ctx.beginPath();
  centerPoints.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  ctx.strokeStyle = "rgba(17, 23, 31, 0.9)";
  ctx.lineWidth = Math.max(
    TUNING.visuals.trackBedWidthMin,
    TRACK_WIDTH * scale * TUNING.visuals.trackBedWidthScale,
  );
  ctx.beginPath();
  centerPoints.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();

  ctx.strokeStyle = "#9bb4c6";
  ctx.lineWidth = Math.max(
    TUNING.visuals.railWidthMin,
    TRACK_WIDTH * scale * TUNING.visuals.railWidthScale,
  );
  [leftRail, rightRail].forEach((rail) => {
    ctx.beginPath();
    rail.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
  });

  ctx.strokeStyle = "rgba(224, 191, 125, 0.35)";
  ctx.lineWidth = Math.max(
    TUNING.visuals.sleeperWidthMin,
    TRACK_WIDTH * scale * TUNING.visuals.sleeperWidthScale,
  );
  for (let sample = sleeperStart; sample <= endDistance; sample += sleeperWorldStep) {
    const point = evaluateRoute(sample);
    const normalX = -Math.sin(point.heading);
    const normalY = Math.cos(point.heading);
    const leftPoint = worldToScreenWithView({
      x: point.x + normalX * TRACK_WIDTH * 0.5,
      y: point.y + normalY * TRACK_WIDTH * 0.5,
      visualElevation: point.visualElevation,
    }, view, width);
    const rightPoint = worldToScreenWithView({
      x: point.x - normalX * TRACK_WIDTH * 0.5,
      y: point.y - normalY * TRACK_WIDTH * 0.5,
      visualElevation: point.visualElevation,
    }, view, width);
    ctx.beginPath();
    ctx.moveTo(leftPoint.x, leftPoint.y);
    ctx.lineTo(rightPoint.x, rightPoint.y);
    ctx.stroke();
  }

  drawRouteMarkers(view, width, height);
}

function drawRouteMarkers(view, width, height) {
  const { scale } = view;
  route.stations.slice(1).forEach((station, index) => {
    const point = evaluateRoute(station.distance);
    const screen = worldToScreenWithView(point, view, width);
    if (screen.y < -50 || screen.y > height + 50) {
      return;
    }

    const isActive = index + 1 === state.stationIndex;
    const markerWidth = clamp(STATION_WINDOW * scale * 2, 34, 132);
    const markerHeight = clamp(TRACK_WIDTH * scale * 2.4, 12, 20);
    const markerRadius = Math.min(markerHeight * 0.5, 10);
    const centerMarkerHeight = markerHeight + clamp(TRACK_WIDTH * scale * 3.8, 16, 30);
    const platformLength = markerWidth + clamp(26 * scale, 12, 36);
    const platformWidth = clamp(TRACK_WIDTH * scale * 1.7, 8, 14);
    const platformOffset = clamp(TRACK_WIDTH * scale * 1.85, 11, 20);
    const buildingWidth = clamp(28 * scale, 18, 38);
    const buildingDepth = clamp(18 * scale, 12, 24);
    const buildingOffset = platformOffset + platformWidth * 0.5 + buildingDepth * 0.8;
    const platformStartX = -platformLength;
    const buildingTrackOffset = platformStartX + platformLength * 0.3;
    const stationVisual = station.visual || createStationVisual();
    const labelTrackOffset = buildingTrackOffset;
    const labelSideOffset = stationVisual.buildingSide === -1 ? -(buildingOffset + buildingDepth + 12) : buildingOffset + buildingDepth + 12;
    const projectedAngle = getProjectedAngle(point.heading);

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(projectedAngle);

    ctx.fillStyle = isActive ? "rgba(224, 232, 238, 0.92)" : "rgba(205, 214, 220, 0.84)";
    ctx.strokeStyle = isActive ? "rgba(248, 252, 255, 0.9)" : "rgba(228, 236, 242, 0.68)";
    ctx.lineWidth = 1.5;
    [-1, 1].forEach((side) => {
      const platformY = side * platformOffset - platformWidth * 0.5;
      ctx.beginPath();
      ctx.roundRect(platformStartX, platformY, platformLength, platformWidth, Math.min(platformWidth * 0.45, 6));
      ctx.fill();
      ctx.stroke();
    });

    const buildingY = stationVisual.buildingSide * buildingOffset - buildingDepth * 0.5;
    ctx.fillStyle = stationVisual.buildingColor;
    ctx.strokeStyle = isActive ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.58)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(buildingTrackOffset - buildingWidth * 0.5, buildingY, buildingWidth, buildingDepth, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = stationVisual.roofColor;
    ctx.beginPath();
    ctx.roundRect(
      buildingTrackOffset - buildingWidth * 0.58,
      buildingY - buildingDepth * 0.22,
      buildingWidth * 1.16,
      Math.max(4, buildingDepth * 0.3),
      4,
    );
    ctx.fill();

    ctx.fillStyle = isActive ? "rgba(133, 255, 182, 0.18)" : "rgba(133, 255, 182, 0.1)";
    ctx.strokeStyle = isActive ? "rgba(133, 255, 182, 0.95)" : "rgba(133, 255, 182, 0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-markerWidth * 0.5, -markerHeight * 0.5, markerWidth, markerHeight, markerRadius);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = isActive ? "rgba(217, 255, 231, 0.98)" : "rgba(217, 255, 231, 0.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -centerMarkerHeight * 0.5);
    ctx.lineTo(0, centerMarkerHeight * 0.5);
    ctx.stroke();
    ctx.restore();

    const labelX = screen.x + Math.cos(projectedAngle) * labelTrackOffset - Math.sin(projectedAngle) * labelSideOffset;
    const labelY = screen.y + Math.sin(projectedAngle) * labelTrackOffset + Math.cos(projectedAngle) * labelSideOffset;
    ctx.fillStyle = "#101010";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.textAlign = stationVisual.buildingSide > 0 ? "left" : "right";
    ctx.textBaseline = "middle";
    ctx.fillText(station.name, labelX, labelY);
    ctx.textBaseline = "alphabetic";
  });

  route.segments.forEach((segment) => {
    if (segment.speedLimit == null) {
      return;
    }

    const signPoint = evaluateRoute(segment.start + 12);
    const normalX = -Math.sin(signPoint.heading);
    const normalY = Math.cos(signPoint.heading);
    const markerPoint = {
      x: signPoint.x - normalX * (TRACK_WIDTH * 0.9 + 14),
      y: signPoint.y - normalY * (TRACK_WIDTH * 0.9 + 14),
    };
    const screen = worldToScreenWithView({
      x: markerPoint.x,
      y: markerPoint.y,
      visualElevation: signPoint.visualElevation,
    }, view, width);
    if (screen.y < -40 || screen.y > height + 40 || screen.x < -40 || screen.x > width + 40) {
      return;
    }

    ctx.fillStyle = "rgba(255, 191, 82, 0.16)";
    ctx.strokeStyle = "rgba(255, 191, 82, 0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(screen.x - 18, screen.y - 16, 36, 24, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffe5b0";
    ctx.font = "700 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(segment.speedLimit * 3.6)}`, screen.x, screen.y + 2);
  });

  route.gradientMarkers.forEach((marker) => {
    const signPoint = evaluateRoute(marker.distance);
    const normalX = -Math.sin(signPoint.heading);
    const normalY = Math.cos(signPoint.heading);
    const markerPoint = {
      x: signPoint.x + normalX * (TRACK_WIDTH * 0.9 + 14),
      y: signPoint.y + normalY * (TRACK_WIDTH * 0.9 + 14),
    };
    const screen = worldToScreenWithView({
      x: markerPoint.x,
      y: markerPoint.y,
      visualElevation: signPoint.visualElevation,
    }, view, width);
    if (screen.y < -44 || screen.y > height + 44 || screen.x < -44 || screen.x > width + 44) {
      return;
    }

    const uphill = marker.grade >= 0;
    ctx.fillStyle = uphill ? "rgba(255, 162, 102, 0.16)" : "rgba(114, 212, 255, 0.16)";
    ctx.strokeStyle = uphill ? "rgba(255, 162, 102, 0.92)" : "rgba(114, 212, 255, 0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(screen.x - 20, screen.y - 18, 40, 26, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = uphill ? "#fff0de" : "#ddf6ff";
    ctx.font = "700 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${uphill ? "+" : "-"}${Math.abs(marker.percent).toFixed(1)}%`, screen.x, screen.y - 1);
    ctx.fillText(uphill ? "UP" : "DN", screen.x, screen.y + 10);
  });

  route.signals.forEach((signal) => {
    const basePoint = evaluateRoute(signal.distance);
    const normalX = -Math.sin(basePoint.heading);
    const normalY = Math.cos(basePoint.heading);
    const signalPoint = {
      x: basePoint.x + normalX * signal.side * (TRACK_WIDTH * 0.8 + TUNING.signals.sideOffset),
      y: basePoint.y + normalY * signal.side * (TRACK_WIDTH * 0.8 + TUNING.signals.sideOffset),
    };
    const screen = worldToScreenWithView({
      x: signalPoint.x,
      y: signalPoint.y,
      visualElevation: basePoint.visualElevation,
    }, view, width);
    if (screen.y < -60 || screen.y > height + 60 || screen.x < -60 || screen.x > width + 60) {
      return;
    }

    const aspect = getSignalAspect(signal);
    const lightColor = aspect === "red" ? "#ff6a62" : aspect === "yellow" ? "#ffd85f" : "#7dff8e";
    const mastHeight = 24;
    ctx.save();
    ctx.strokeStyle = "rgba(210, 228, 240, 0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y + 12);
    ctx.lineTo(screen.x, screen.y - mastHeight);
    ctx.stroke();

    ctx.fillStyle = "rgba(9, 16, 24, 0.95)";
    ctx.beginPath();
    ctx.roundRect(screen.x - 9, screen.y - mastHeight - 16, 18, 24, 7);
    ctx.fill();

    ctx.shadowColor = lightColor;
    ctx.shadowBlur = 12;
    ctx.fillStyle = lightColor;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y - mastHeight - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (signal.kind === "yellow") {
      ctx.fillStyle = "rgba(255, 216, 95, 0.18)";
      ctx.strokeStyle = "rgba(255, 216, 95, 0.85)";
      ctx.beginPath();
      ctx.roundRect(screen.x - 19, screen.y - mastHeight + 12, 38, 18, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffeeb8";
      ctx.font = "700 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(signal.speedLimit * 3.6)}`, screen.x, screen.y - mastHeight + 25);
    }

    if (signal.kind === "red" && signal.aspect === "red") {
      const stopZone = getRedStopZone(signal);
      const stopCircleDistance = stopZone.centerDistance;
      const stopCirclePoint = evaluateRoute(stopCircleDistance);
      const stopCircleScreen = worldToScreenWithView(stopCirclePoint, view, width);
      const stopCircleRadius = Math.max(9, stopZone.radius * scale);
      ctx.fillStyle = "rgba(255, 106, 98, 0.1)";
      ctx.strokeStyle = "rgba(255, 146, 136, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(stopCircleScreen.x, stopCircleScreen.y, stopCircleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const gap = signal.distance - state.distance;
      if (gap >= 0 && gap <= TUNING.signals.redCountdownDisplayDistance) {
        const remaining = Math.max(0, signal.clearAfter - signal.waitTimer);
        ctx.fillStyle = "rgba(8, 14, 22, 0.88)";
        ctx.beginPath();
        ctx.roundRect(screen.x - 17, screen.y - mastHeight - 38, 34, 14, 6);
        ctx.fill();
        ctx.fillStyle = "#ffd7d1";
        ctx.font = "700 10px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${remaining.toFixed(1)}s`, screen.x, screen.y - mastHeight - 28);

        ctx.fillStyle = "rgba(255, 218, 213, 0.82)";
        ctx.font = "600 10px Inter, sans-serif";
        ctx.fillText("Stop here", stopCircleScreen.x, stopCircleScreen.y - stopCircleRadius - 8);
      }
    }
    ctx.restore();
  });
}

function drawTrain(width, height) {
  const view = getViewMetrics(width, height);
  const { scale } = view;
  const derailment = state.derailment;
  const renderUnits = getRenderedTrainUnits();

  function drawOrientedPanel(centerPoint, tangentX, tangentY, normalX, normalY, along, across, fillStyle) {
    const halfAlong = along * 0.5;
    const halfAcross = across * 0.5;
    const corners = [
      {
        x: centerPoint.x - tangentX * halfAlong - normalX * halfAcross,
        y: centerPoint.y - tangentY * halfAlong - normalY * halfAcross,
      },
      {
        x: centerPoint.x + tangentX * halfAlong - normalX * halfAcross,
        y: centerPoint.y + tangentY * halfAlong - normalY * halfAcross,
      },
      {
        x: centerPoint.x + tangentX * halfAlong + normalX * halfAcross,
        y: centerPoint.y + tangentY * halfAlong + normalY * halfAcross,
      },
      {
        x: centerPoint.x - tangentX * halfAlong + normalX * halfAcross,
        y: centerPoint.y - tangentY * halfAlong + normalY * halfAcross,
      },
    ];
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    corners.slice(1).forEach((corner) => ctx.lineTo(corner.x, corner.y));
    ctx.closePath();
    ctx.fill();
  }

  function interpolatePoint(a, b, t) {
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
    };
  }

  function fillQuad(points, fillStyle, strokeStyle = null) {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.fill();
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();
    }
  }

  function drawFaceBand(facePoints, alongStart, alongEnd, verticalStart, verticalEnd, fillStyle) {
    const [bottomStart, bottomEnd, topEnd, topStart] = facePoints;
    const bottomA = interpolatePoint(bottomStart, bottomEnd, alongStart);
    const bottomB = interpolatePoint(bottomStart, bottomEnd, alongEnd);
    const topA = interpolatePoint(topStart, topEnd, alongStart);
    const topB = interpolatePoint(topStart, topEnd, alongEnd);
    fillQuad(
      [
        interpolatePoint(bottomA, topA, verticalStart),
        interpolatePoint(bottomB, topB, verticalStart),
        interpolatePoint(bottomB, topB, verticalEnd),
        interpolatePoint(bottomA, topA, verticalEnd),
      ],
      fillStyle,
    );
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = Math.max(TUNING.train.couplerLineWidthMin, scale * TUNING.train.couplerLineWidthScale);
  for (let index = 0; index < renderUnits.length - 1; index += 1) {
    const currentUnit = renderUnits[index];
    const nextUnit = renderUnits[index + 1];
    const currentRear = derailment
      ? { x: currentUnit.rearX, y: currentUnit.rearY, visualElevation: currentUnit.visualElevation }
      : evaluateRoute(currentUnit.rearDistance);
    const nextFront = derailment
      ? { x: nextUnit.frontX, y: nextUnit.frontY, visualElevation: nextUnit.visualElevation }
      : evaluateRoute(nextUnit.frontDistance);
    const rearScreen = worldToScreenWithView(currentRear, view, width);
    const frontScreen = worldToScreenWithView(nextFront, view, width);
    ctx.beginPath();
    ctx.moveTo(rearScreen.x, rearScreen.y);
    ctx.lineTo(frontScreen.x, frontScreen.y);
    ctx.stroke();
  }
  ctx.restore();

  renderUnits.slice().reverse().forEach((unit) => {
    const frontScreen = worldToScreenWithView({
      x: unit.frontX,
      y: unit.frontY,
      visualElevation: unit.visualElevation,
    }, view, width);
    const rearScreen = worldToScreenWithView({
      x: unit.rearX,
      y: unit.rearY,
      visualElevation: unit.visualElevation,
    }, view, width);
    const axisX = frontScreen.x - rearScreen.x;
    const axisY = frontScreen.y - rearScreen.y;
    const axisLength = Math.hypot(axisX, axisY) || 1;
    const tangentX = axisX / axisLength;
    const tangentY = axisY / axisLength;
    const normalX = -tangentY;
    const normalY = tangentX;
    const pixelLength = Math.max(TUNING.train.minPixelLength, unit.length * scale);
    const pixelWidth = Math.max(TUNING.train.minPixelWidth, unit.width * scale);
    const bodyColor = (state.overspeedTimer > 0.2 || derailment) && unit.type === "locomotive" ? "#ff9b6d" : unit.bodyColor;
    const topColor = shadeColor(bodyColor, 12);
    const sideColor = shadeColor(bodyColor, -18);
    const endColor = shadeColor(bodyColor, -8);
    const roofColor = shadeColor(unit.roofColor, 8);
    const depthX = pixelWidth * 0.26;
    const depthY = pixelWidth * 0.36;
    const halfWidth = pixelWidth * 0.48;
    const roofLiftX = -depthX;
    const roofLiftY = -depthY;
    const frontInset = unit.type === "locomotive" ? pixelWidth * 0.16 : 0;
    const frontLeft = {
      x: frontScreen.x - normalX * (halfWidth - frontInset) + tangentX * (unit.type === "locomotive" ? pixelLength * 0.06 : 0),
      y: frontScreen.y - normalY * (halfWidth - frontInset) + tangentY * (unit.type === "locomotive" ? pixelLength * 0.06 : 0),
    };
    const frontRight = {
      x: frontScreen.x + normalX * (halfWidth - frontInset) + tangentX * (unit.type === "locomotive" ? pixelLength * 0.06 : 0),
      y: frontScreen.y + normalY * (halfWidth - frontInset) + tangentY * (unit.type === "locomotive" ? pixelLength * 0.06 : 0),
    };
    const midRight = {
      x: frontScreen.x + normalX * halfWidth - tangentX * pixelLength * 0.14,
      y: frontScreen.y + normalY * halfWidth - tangentY * pixelLength * 0.14,
    };
    const rearRight = {
      x: rearScreen.x + normalX * halfWidth,
      y: rearScreen.y + normalY * halfWidth,
    };
    const rearLeft = {
      x: rearScreen.x - normalX * halfWidth,
      y: rearScreen.y - normalY * halfWidth,
    };
    const midLeft = {
      x: frontScreen.x - normalX * halfWidth - tangentX * pixelLength * 0.14,
      y: frontScreen.y - normalY * halfWidth - tangentY * pixelLength * 0.14,
    };
    const base = unit.type === "locomotive"
      ? [frontLeft, frontRight, midRight, rearRight, rearLeft, midLeft]
      : [frontLeft, frontRight, rearRight, rearLeft];
    const top = base.map((point) => ({
      x: point.x + roofLiftX,
      y: point.y + roofLiftY,
    }));
    const roofFrontCenter = {
      x: frontScreen.x - tangentX * pixelLength * 0.14,
      y: frontScreen.y - tangentY * pixelLength * 0.14,
    };
    const roofRearCenter = {
      x: rearScreen.x + tangentX * pixelLength * 0.24,
      y: rearScreen.y + tangentY * pixelLength * 0.24,
    };
    const roofHalfWidth = halfWidth * (unit.type === "locomotive" ? 0.66 : 0.58);
    const roof = [
      {
        x: roofFrontCenter.x - normalX * roofHalfWidth + roofLiftX * 0.82,
        y: roofFrontCenter.y - normalY * roofHalfWidth + roofLiftY * 0.82,
      },
      {
        x: roofFrontCenter.x + normalX * roofHalfWidth + roofLiftX * 0.82,
        y: roofFrontCenter.y + normalY * roofHalfWidth + roofLiftY * 0.82,
      },
      {
        x: roofRearCenter.x + normalX * roofHalfWidth + roofLiftX * 0.82,
        y: roofRearCenter.y + normalY * roofHalfWidth + roofLiftY * 0.82,
      },
      {
        x: roofRearCenter.x - normalX * roofHalfWidth + roofLiftX * 0.82,
        y: roofRearCenter.y - normalY * roofHalfWidth + roofLiftY * 0.82,
      },
    ];

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(255,255,255,0.62)";
    ctx.lineWidth = 1.25;

    const faceStroke = "rgba(255,255,255,0.16)";
    const frontFace = [base[0], base[1], top[1], top[0]];

    if (unit.type === "locomotive") {
      const rightRearFace = [base[2], base[3], top[3], top[2]];
      const rightFrontFace = [base[1], base[2], top[2], top[1]];
      const leftRearFace = [base[4], base[5], top[5], top[4]];
      const leftFrontFace = [base[5], base[0], top[0], top[5]];
      const rearFace = [base[4], base[3], top[3], top[4]];

      fillQuad(rightRearFace, sideColor, faceStroke);
      fillQuad(rightFrontFace, shadeColor(bodyColor, -14), faceStroke);
      fillQuad(leftRearFace, shadeColor(bodyColor, -24), faceStroke);
      fillQuad(leftFrontFace, shadeColor(bodyColor, -20), faceStroke);
      fillQuad(frontFace, endColor, faceStroke);
      fillQuad(rearFace, shadeColor(bodyColor, -22), faceStroke);
    } else {
      const rightFace = [base[1], base[2], top[2], top[1]];
      const leftFace = [base[3], base[0], top[0], top[3]];
      const rearFace = [base[3], base[2], top[2], top[3]];

      fillQuad(rightFace, sideColor, faceStroke);
      fillQuad(leftFace, shadeColor(bodyColor, -24), faceStroke);
      fillQuad(frontFace, endColor, faceStroke);
      fillQuad(rearFace, shadeColor(bodyColor, -22), faceStroke);
    }

    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    top.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = roofColor;
    ctx.beginPath();
    ctx.moveTo(roof[0].x, roof[0].y);
    roof.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.fill();

    if (unit.type === "locomotive") {
      ctx.fillStyle = shadeColor(bodyColor, -28);
      ctx.beginPath();
      ctx.moveTo(base[0].x, base[0].y);
      ctx.lineTo(base[1].x, base[1].y);
      ctx.lineTo(base[2].x, base[2].y);
      ctx.lineTo(top[2].x, top[2].y);
      ctx.lineTo(top[1].x, top[1].y);
      ctx.lineTo(top[0].x, top[0].y);
      ctx.closePath();
      ctx.fill();
    }

    if (unit.type === "locomotive") {
      drawOrientedPanel(
        {
          x: frontScreen.x + tangentX * (pixelLength * 0.04) + roofLiftX * 0.78,
          y: frontScreen.y + tangentY * (pixelLength * 0.04) + roofLiftY * 0.78,
        },
        tangentX,
        tangentY,
        normalX,
        normalY,
        Math.max(5, pixelLength * 0.11),
        pixelWidth * 0.16,
        "rgba(255, 232, 160, 0.88)",
      );
      drawOrientedPanel(
        {
          x: (roofFrontCenter.x + roofRearCenter.x) * 0.5 + roofLiftX * 0.38,
          y: (roofFrontCenter.y + roofRearCenter.y) * 0.5 + roofLiftY * 0.38,
        },
        tangentX,
        tangentY,
        normalX,
        normalY,
        pixelLength * 0.24,
        pixelWidth * 0.32,
        "rgba(22, 29, 38, 0.95)",
      );
      drawOrientedPanel(
        {
          x: roofFrontCenter.x + tangentX * (pixelLength * 0.02) + roofLiftX * 0.56,
          y: roofFrontCenter.y + tangentY * (pixelLength * 0.02) + roofLiftY * 0.56,
        },
        tangentX,
        tangentY,
        normalX,
        normalY,
        pixelLength * 0.16,
        pixelWidth * 0.38,
        "rgba(7, 21, 36, 0.78)",
      );

      const cabSideFace = normalX + normalY > 0
        ? [base[1], base[2], top[2], top[1]]
        : [base[5], base[0], top[0], top[5]];
      drawFaceBand(
        cabSideFace,
        0.14,
        0.56,
        0.34,
        0.68,
        "rgba(245, 248, 255, 0.5)",
      );
    } else {
      const visibleSideFace = normalX + normalY > 0
        ? [base[1], base[2], top[2], top[1]]
        : [base[3], base[0], top[0], top[3]];
      drawFaceBand(
        visibleSideFace,
        0.18,
        0.82,
        0.28,
        0.7,
        "rgba(244, 248, 255, 0.58)",
      );
      drawFaceBand(
        visibleSideFace,
        0.2,
        0.8,
        0.42,
        0.58,
        "rgba(110, 134, 154, 0.42)",
      );
    }

    ctx.restore();
  });

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  state.exhaustPuffs.forEach((puff) => {
    const progress = puff.age / puff.life;
    const radius = Math.max(2.2, (puff.radius + puff.growth * progress) * scale);
    const opacity = Math.max(0, (1 - progress) * puff.opacity);
    if (opacity <= 0.002) {
      return;
    }

    const puffScreen = worldToScreenWithView({
      x: puff.x,
      y: puff.y,
      visualElevation: puff.visualElevation,
    }, view, width);
    const screenX = puffScreen.x;
    const screenY = puffScreen.y;
    if (screenX < -radius || screenX > width + radius || screenY < -radius || screenY > height + radius) {
      return;
    }

    const shade = Math.round(puff.shade + progress * 20);
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade + 5}, ${opacity.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawHudOverlay(width, height) {
  ctx.save();
  ctx.fillStyle = "rgba(7, 17, 31, 0.55)";
  ctx.beginPath();
  ctx.roundRect(18, 18, 246, 122, 20);
  ctx.fill();

  ctx.fillStyle = "#dff2ff";
  ctx.font = "700 13px Inter, sans-serif";
  ctx.textAlign = "left";
  const nextStation = route.stations[state.stationIndex];
  const gap = nextStation ? Math.max(0, nextStation.distance - state.distance) : 0;
  ctx.fillText(`Next stop: ${nextStation ? nextStation.name : "Done"}`, 34, 46);
  ctx.font = "500 12px Inter, sans-serif";
  ctx.fillStyle = "rgba(223, 242, 255, 0.78)";
  ctx.fillText(`Distance ${Math.max(0, roundDisplayDistance(gap))} m`, 34, 68);
  ctx.fillText(`Consist ${TRAIN_TOTAL_LENGTH.toFixed(0)} m`, 34, 88);
  ctx.fillText(`Scenery ${getCurrentBiomeLabel()}`, 34, 108);
  ctx.restore();

  drawRoutePredictor(width, height);
}

function drawCameraDebugOverlay(width, height) {
  if (!showCameraDebugOverlay) {
    return;
  }
  const view = getViewMetrics(width, height);
  const debug = view.debug;
  if (!debug) {
    return;
  }

  function drawWorldGuide(fromPose, toPose, color, label, emphasized = false) {
    const fromScreen = worldToScreenWithView(fromPose, view, width);
    const toScreen = worldToScreenWithView(toPose, view, width);
    const dx = toScreen.x - fromScreen.x;
    const dy = toScreen.y - fromScreen.y;
    const length = Math.hypot(dx, dy) || 1;
    const dirX = dx / length;
    const dirY = dy / length;
    const normalX = -dirY;
    const normalY = dirX;
    const arrowSize = emphasized ? 13 : 10;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = emphasized ? 3 : 2;
    ctx.globalAlpha = emphasized ? 0.95 : 0.82;
    ctx.beginPath();
    ctx.moveTo(fromScreen.x, fromScreen.y);
    ctx.lineTo(toScreen.x, toScreen.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toScreen.x, toScreen.y);
    ctx.lineTo(toScreen.x - dirX * arrowSize + normalX * arrowSize * 0.48, toScreen.y - dirY * arrowSize + normalY * arrowSize * 0.48);
    ctx.lineTo(toScreen.x - dirX * arrowSize - normalX * arrowSize * 0.48, toScreen.y - dirY * arrowSize - normalY * arrowSize * 0.48);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(toScreen.x, toScreen.y, emphasized ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(8, 14, 22, 0.9)";
    ctx.beginPath();
    ctx.roundRect(toScreen.x + 10, toScreen.y - 16, 24, 16, 6);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = "700 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, toScreen.x + 22, toScreen.y - 4.5);
    ctx.restore();
  }

  function drawPoseOrientation(pose, color) {
    const screen = worldToScreenWithView(pose, view, width);
    const projectedAngle = getProjectedAngle(pose.heading);
    const dirX = Math.cos(projectedAngle);
    const dirY = Math.sin(projectedAngle);
    const arrowLength = 22;
    const arrowWidth = 6;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screen.x, screen.y);
    ctx.lineTo(screen.x + dirX * arrowLength, screen.y + dirY * arrowLength);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(screen.x + dirX * arrowLength, screen.y + dirY * arrowLength);
    ctx.lineTo(
      screen.x + dirX * (arrowLength - 8) - dirY * arrowWidth,
      screen.y + dirY * (arrowLength - 8) + dirX * arrowWidth,
    );
    ctx.lineTo(
      screen.x + dirX * (arrowLength - 8) + dirY * arrowWidth,
      screen.y + dirY * (arrowLength - 8) - dirX * arrowWidth,
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawWorldGuide(debug.frontPose, debug.lengthTargetPose, "rgba(255, 191, 82, 0.95)", "L");
  drawWorldGuide(debug.frontPose, debug.speedTargetPose, "rgba(114, 212, 255, 0.95)", "S");
  drawWorldGuide(debug.frontPose, debug.centerTargetPose, "rgba(255, 255, 255, 0.98)", "C", true);
  drawPoseOrientation(debug.frontPose, "rgba(255, 140, 140, 0.95)");
  drawPoseOrientation(debug.lengthTargetPose, "rgba(255, 191, 82, 0.95)");
  drawPoseOrientation(debug.speedTargetPose, "rgba(114, 212, 255, 0.95)");
  drawPoseOrientation(debug.centerTargetPose, "rgba(255, 255, 255, 0.98)");

  const panelX = width - 312;
  const panelY = 18;
  const panelWidth = 286;
  const panelHeight = 124;
  ctx.save();
  ctx.fillStyle = "rgba(6, 16, 28, 0.72)";
  ctx.strokeStyle = "rgba(170, 222, 255, 0.18)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#dff2ff";
  ctx.font = "700 14px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Camera debug", panelX + 16, panelY + 24);

  const rows = [
    { label: "Train px", value: `${view.trainLengthPixels.toFixed(1)} px`, color: "rgba(255,255,255,0.92)" },
    { label: "Length", value: `${debug.lengthTargetDistance.toFixed(1)} m`, color: "rgba(255, 191, 82, 0.95)" },
    { label: "Speed", value: `${debug.speedTargetDistance.toFixed(1)} m`, color: "rgba(114, 212, 255, 0.95)" },
    { label: "Chosen", value: `${debug.chosenTargetDistance.toFixed(1)} m (${debug.chosenSource})`, color: "rgba(255,255,255,0.98)" },
  ];
  rows.forEach((row, index) => {
    const y = panelY + 48 + index * 18;
    ctx.fillStyle = row.color;
    ctx.fillRect(panelX + 16, y - 8, 8, 8);
    ctx.fillStyle = "rgba(223, 242, 255, 0.82)";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.fillText(row.label, panelX + 32, y);
    ctx.fillStyle = "#f5fbff";
    ctx.font = "700 12px Inter, sans-serif";
    ctx.fillText(row.value, panelX + 102, y);
  });
  ctx.restore();
}

function drawRoutePredictor(width, height) {
  const upcomingEntries = getUpcomingRouteEntries();
  const panelWidth = Math.min(TUNING.visuals.routePredictorWidth, width - 36);
  const panelHeight = Math.min(TUNING.visuals.routePredictorHeight, height - 36);
  const panelX = 18;
  const panelY = height - panelHeight - 18;
  const distColumnX = panelX + 18;
  const markerColumnX = panelX + 28;
  const distanceValueX = panelX + 42;
  const typeColumnX = panelX + 118;
  const actionColumnX = panelX + 252;

  ctx.save();
  ctx.fillStyle = "rgba(6, 16, 28, 0.58)";
  ctx.strokeStyle = "rgba(170, 222, 255, 0.16)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#dff2ff";
  ctx.font = "700 16px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Route ahead", panelX + 18, panelY + 28);

  if (upcomingEntries.length === 0) {
    ctx.fillStyle = "rgba(223, 242, 255, 0.62)";
    ctx.font = "600 14px Inter, sans-serif";
    ctx.fillText(`No curve or signal in the next ${roundDisplayDistance(TUNING.route.upcomingCurveLookahead)} m`, panelX + 18, panelY + 62);
    ctx.restore();
    return;
  }

  ctx.fillStyle = "rgba(223, 242, 255, 0.46)";
  ctx.font = "600 11px Inter, sans-serif";
  ctx.fillText("DIST", distColumnX, panelY + 52);
  ctx.fillText("TYPE", typeColumnX, panelY + 52);
  ctx.fillText("ACTION", actionColumnX, panelY + 52);

  ctx.font = "700 15px Inter, sans-serif";
  upcomingEntries.forEach((entry, index) => {
    const rowY = panelY + 80 + index * 22;
    const color = entry.type === "curve"
      ? "#ffbf52"
      : entry.type === "gradient"
        ? entry.direction === "Up"
          ? "#ff9d66"
          : "#7fd5ff"
      : entry.aspect === "red"
        ? "#ff6a62"
        : entry.aspect === "yellow"
          ? "#ffd85f"
          : "#7dff8e";
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(markerColumnX, rowY - 5, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(223, 242, 255, 0.78)";
    ctx.fillText(`${Math.round(entry.distance)} m`, distanceValueX, rowY);

    const typeLabel = entry.type === "curve"
      ? `${entry.direction} curve`
      : entry.type === "gradient"
        ? `${entry.direction} grade`
      : `${entry.aspect.toUpperCase()} signal`;
    ctx.fillText(typeLabel, typeColumnX, rowY);

    const actionLabel = entry.type === "curve"
      ? `${entry.limitKph} km/h`
      : entry.type === "gradient"
        ? `${entry.gradePercent.toFixed(1)}%`
      : entry.aspect === "yellow"
        ? `${entry.limitKph} km/h`
        : entry.aspect === "red"
          ? "Stop"
          : "Proceed";
    ctx.fillText(actionLabel, actionColumnX, rowY);
  });

  ctx.restore();
}

function drawSpeedEffects(width, height) {
  const speedFactor = clamp(state.speed / MAX_LINE_SPEED, 0, TUNING.visuals.speedEffectMaxFactor);
  if (speedFactor < TUNING.visuals.speedEffectThreshold) {
    return;
  }

  const boostedSpeedFactor = Math.pow(speedFactor, 0.7);

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(120, 215, 255, ${0.04 + boostedSpeedFactor * 0.08})`;
  ctx.lineWidth = TUNING.visuals.speedEffectLineWidthBase
    + boostedSpeedFactor * TUNING.visuals.speedEffectLineWidthBySpeed;
  const bandTop = height * TUNING.visuals.speedEffectBandTop;
  for (let index = 0; index < TUNING.visuals.speedEffectCount; index += 1) {
    const offset = ((state.distance * TUNING.visuals.speedEffectTravel)
      + index * TUNING.visuals.speedEffectSpacing) % (width + 120) - 60;
    const streakLength = TUNING.visuals.speedEffectBaseLength
      + boostedSpeedFactor * TUNING.visuals.speedEffectLengthBySpeed;
    const laneY = bandTop + index * TUNING.visuals.speedEffectBandStep + Math.sin(state.distance * 0.018 + index) * 5;
    ctx.beginPath();
    ctx.moveTo(offset, laneY);
    ctx.lineTo(offset + streakLength, laneY - streakLength * (0.08 + boostedSpeedFactor * 0.04));
    ctx.moveTo(width - offset, laneY + 6);
    ctx.lineTo(width - offset - streakLength * 0.82, laneY + 6 - streakLength * (0.06 + boostedSpeedFactor * 0.035));
    ctx.stroke();
  }
  ctx.restore();
}

function render() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  drawBackground(width, height);
  drawTrack(width, height);
  drawTrain(width, height);
  drawCameraDebugOverlay(width, height);
  drawSpeedEffects(width, height);
  drawHudOverlay(width, height);
}

function update(dt) {
  if (!state.started || state.finished) {
    updateUi();
    return;
  }

  if (state.derailment) {
    updateDerailment(dt);
    updateUi();
    return;
  }

  state.elapsed += dt;
  updateControls(dt);
  updatePhysics(dt);
  updateDieselExhaust(dt);
  if (processSignalPasses()) {
    updateUi();
    return;
  }
  if (processSignals(dt)) {
    updateUi();
    return;
  }
  if (checkFailureConditions()) {
    updateUi();
    return;
  }
  updatePenalties(dt);
  updateStations();
  updateUi();
}

function loop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function startRun() {
  if (!state) {
    return;
  }

  appShell.classList.remove("hidden");
  state = createInitialState();
  state.started = true;
  introCard.classList.add("hidden");
  finishCard.classList.add("hidden");
  document.body.classList.remove("cover-active");
  resizeCanvas();
  state.message = "Departing Origin";
  state.detail = "The 100 m consist accelerates hard enough, but brake lag still demands planning.";
  updateUi();
}

startButton.addEventListener("click", startRun);
restartButton.addEventListener("click", startRun);
cameraDebugToggle.addEventListener("change", () => {
  showCameraDebugOverlay = cameraDebugToggle.checked;
});

function initializeGame() {
  document.body.classList.add("cover-active");
  statusText.textContent = "Loading settings";
  subStatus.textContent = "Applying built-in game tuning.";

  applyTuning();

  state = createInitialState();
  showCameraDebugOverlay = false;
  cameraDebugToggle.checked = false;
  syncAssistLegend();
  updateUi();
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

initializeGame();
