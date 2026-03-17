const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const appShell = document.getElementById("appShell");
const droneInset = document.getElementById("droneInset");
const droneInsetMount = document.getElementById("droneInsetMount");
const droneInsetStatus = document.getElementById("droneInsetStatus");
const droneInsetToggle = document.getElementById("droneInsetToggle");
const droneInsetResizeHandle = document.getElementById("droneInsetResizeHandle");
const finishCard = document.getElementById("finishCard");
const finishTitle = document.getElementById("finishTitle");
const finishStats = document.getElementById("finishStats");
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
const audioDebugStatus = document.getElementById("audioDebugStatus");
const lineLimitSecondary = lineLimitKph.parentElement;
const stationAssist = document.getElementById("stationAssist");
const assistScale = document.getElementById("assistScale");
const assistWindow = document.getElementById("assistWindow");
const assistStationTitle = document.getElementById("assistStationTitle");
const assistDistanceText = document.getElementById("assistDistanceText");
const assistFrontMarker = document.getElementById("assistFrontMarker");
const assistLegendMin = document.getElementById("assistLegendMin");
const assistLegendMax = document.getElementById("assistLegendMax");

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
    couplerGap: 4, // Gap in meters between each vehicle in the consist.
    maxPowerKw: 5500, // Full traction output represented when the power controller reaches 100%.
    maxBrakePressureBar: 6.5, // Full brake pipe pressure reduction represented when braking reaches 100%.
    // Vehicle definitions, front to back.
    consist: [
      {
        type: "locomotive", // Vehicle role used for rendering details.
        length: 24, // Vehicle length in meters along the track.
        width: 10, // Vehicle body width in meters for top-down rendering.
        bodyColor: "#53c8ff", // Main fill color of the vehicle body.
        roofColor: "rgba(255,255,255,0.9)", // Roof highlight color.
      },
      {
        type: "car", // Vehicle role used for rendering details.
        length: 34, // Vehicle length in meters along the track.
        width: 9, // Vehicle body width in meters for top-down rendering.
        bodyColor: "#8da4bc", // Main fill color of the vehicle body.
        roofColor: "rgba(232, 240, 248, 0.9)", // Roof highlight color.
      },
      {
        type: "car", // Vehicle role used for rendering details.
        length: 34, // Vehicle length in meters along the track.
        width: 9, // Vehicle body width in meters for top-down rendering.
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
    lookBehindMin: 150, // Distance in meters kept visible behind the train at zero speed.
    lookBehindBySpeed: 360, // Extra behind distance added as speed rises.
    lookAheadMin: 420, // Distance in meters kept visible ahead of the train at zero speed.
    lookAheadBySpeed: 1280, // Extra forward look-ahead added as speed rises.
    leadDistanceMin: 90, // Minimum distance in meters that the camera focus point leads the train along the route.
    leadDistanceBySpeed: 520, // Extra forward lead distance added as speed rises so the view looks into the curve.
    trainScreenMargin: 96, // Minimum screen-space margin in pixels kept around the train when the camera leads ahead.
    lateralSpanMin: 10, // Base side-to-side world span used for zoom when stopped.
    lateralSpanBySpeed: 280, // Extra side-to-side world span added as speed rises.
    stoppedZoomMultiplier: 3, // Extra zoom applied at zero speed after span-based scaling is computed.
    movingZoomMultiplier: 1.85, // Zoom multiplier once the train is up to speed, keeping more speed sensation at high velocity.
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
    redStopWindow: 100, // Distance in meters before a red signal where stopping counts as waiting at the signal.
    redStopSpeed: 0.25, // Maximum speed in m/s that still counts as stopped at a red signal.
    redHoldMin: 2.5, // Minimum seconds that a red signal stays at stop once the train is waiting.
    redHoldMax: 5.5, // Maximum seconds that a red signal stays at stop once the train is waiting.
    redPassMargin: 14, // Distance in meters past a red signal before it counts as a failure.
    sideOffset: 20, // Extra lateral offset in meters used to draw signals beside the track.
    redCountdownDisplayDistance: 220, // Distance in meters ahead of a red signal where the over-signal countdown becomes visible.
    redStopCircleScale: 0.7, // Legacy setting; red signals now use the full pre-signal stop zone.
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
    powerBuildRate: 0.48, // Rate actual power builds when requesting acceleration.
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
    routePredictorWidth: 360, // Width in pixels of the lower-left route predictor panel.
    routePredictorHeight: 172, // Height in pixels of the lower-left route predictor panel.
    routePredictorMaxEntries: 4, // Maximum number of upcoming curves and signals listed in the predictor.
    terrainCellSize: 74, // Base size in pixels of terrain texture cells in the world backdrop.
    terrainClearWidthMin: 36, // Minimum width in pixels of the cleared corridor around the track.
    terrainClearWidthScale: 7.6, // Cleared corridor width multiplier relative to zoom scale.
    backgroundGridStep: 48, // Vertical spacing in pixels between faint background scanlines.
    backgroundSpeedMaxFactor: 1.35, // Max normalized speed used by background motion effects.
    backgroundStreakThreshold: 0.12, // Minimum normalized speed before background streaks appear.
    backgroundStreakCount: 20, // Number of background streaks rendered per frame.
    backgroundStreakSpacing: 76, // Vertical spacing between successive background streaks.
    backgroundStreakTravel: 4.8, // How quickly background streaks advance with train distance.
    backgroundStreakBaseLength: 20, // Base length in pixels of each background streak.
    backgroundStreakLengthBySpeed: 42, // Extra streak length added as speed rises.
    trackSampleStep: 10, // Route sampling step in meters when drawing the track.
    trackBedWidthMin: 7, // Minimum width in pixels of the dark track bed.
    trackBedWidthScale: 1.25, // Track-bed width multiplier relative to zoom scale.
    railWidthMin: 1.6, // Minimum width in pixels of each rail line.
    railWidthScale: 0.34, // Rail width multiplier relative to zoom scale.
    sleeperStep: 2, // How many track samples to skip between sleeper lines.
    sleeperWidthMin: 2.2, // Minimum width in pixels of sleeper strokes.
    sleeperWidthScale: 0.24, // Sleeper width multiplier relative to zoom scale.
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

let TUNING = DEFAULT_TUNING;
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

const keys = {
  accelerate: false,
  brake: false,
};

let route = null;
let state = null;
let lastFrame = performance.now();
let isDroneInsetMinimized = true;
let droneInsetRenderer = null;
let gameAudio = null;
let audioDebugLogged = false;
let audioUnlockInitialized = false;
let audioUnlockPromise = null;
let audioEnvironmentDebugAttached = false;
let audioSessionDebugAttached = false;
const audioDebugHistory = [];

function logAudioDebug(message, details = null) {
  if (details == null) {
    console.info(`[audio] ${message}`);
    return;
  }
  console.info(`[audio] ${message}`, details);
}

function updateAudioDebugStatus(message, details = null) {
  if (!audioDebugStatus) {
    return;
  }

  const contextState = gameAudio?.context?.state || "none";
  const session = navigator.audioSession || navigator.webkitAudioSession || null;
  const bits = [`Audio: ${message}`, `ctx:${contextState}`];
  const envBits = [
    `vis:${document.visibilityState}`,
    `focus:${typeof document.hasFocus === "function" ? (document.hasFocus() ? "yes" : "no") : "n/a"}`,
  ];

  if (session?.type) {
    bits.push(`session:${session.type}`);
  }
  if (session?.state) {
    bits.push(`sessionState:${session.state}`);
  }

  if (details && typeof details === "object") {
    if (details.trigger) {
      bits.push(`trigger:${details.trigger}`);
    }
    if (details.reason) {
      bits.push(`reason:${details.reason}`);
    }
    if (details.userActivation) {
      bits.push(`user:${details.userActivation}`);
    }
  }

  const context = gameAudio?.context || null;
  if (context) {
    envBits.push(`t:${context.currentTime.toFixed(3)}`);
    if (typeof context.baseLatency === "number") {
      envBits.push(`base:${context.baseLatency.toFixed(3)}`);
    }
    if (typeof context.outputLatency === "number") {
      envBits.push(`out:${context.outputLatency.toFixed(3)}`);
    }
  }

  const historyLine = [bits.join(" | "), envBits.join(" | ")].join("\n");
  audioDebugHistory.push(historyLine);
  while (audioDebugHistory.length > 4) {
    audioDebugHistory.shift();
  }

  audioDebugStatus.textContent = audioDebugHistory.join("\n\n");
}

function setAudioDebug(message, details = null) {
  logAudioDebug(message, details);
  updateAudioDebugStatus(message, details);
}

function getAudioUserActivationState() {
  if (!navigator.userActivation) {
    return "n/a";
  }
  if (navigator.userActivation.isActive) {
    return "active";
  }
  if (navigator.userActivation.hasBeenActive) {
    return "used";
  }
  return "idle";
}

function scheduleAudioStateProbe(reason, trigger = "probe", delayMs = 120) {
  window.setTimeout(() => {
    updateAudioDebugStatus("state probe", {
      trigger,
      reason,
      userActivation: getAudioUserActivationState(),
    });
  }, delayMs);
}

function attachAudioEnvironmentDebug() {
  if (audioEnvironmentDebugAttached) {
    return;
  }

  audioEnvironmentDebugAttached = true;
  const handleEvent = (event) => {
    updateAudioDebugStatus("env event", {
      trigger: event.type,
      reason: gameAudio?.context?.state || "no-context",
      userActivation: getAudioUserActivationState(),
    });
  };

  document.addEventListener("visibilitychange", handleEvent, true);
  window.addEventListener("focus", handleEvent, true);
  window.addEventListener("blur", handleEvent, true);
  window.addEventListener("pageshow", handleEvent, true);
  window.addEventListener("pagehide", handleEvent, true);
}

function configureAudioSession() {
  const session = navigator.audioSession || navigator.webkitAudioSession || null;
  if (!session) {
    setAudioDebug("no audioSession API", { userActivation: getAudioUserActivationState() });
    return;
  }

  try {
    if (session.type !== "playback") {
      session.type = "playback";
    }
    if (!audioSessionDebugAttached && typeof session.addEventListener === "function") {
      session.addEventListener("statechange", () => {
        updateAudioDebugStatus("audioSession change", {
          reason: session.state || "unknown",
          userActivation: getAudioUserActivationState(),
        });
      });
      audioSessionDebugAttached = true;
    }
    setAudioDebug("audioSession ready", {
      reason: session.state || "ok",
      userActivation: getAudioUserActivationState(),
    });
  } catch (error) {
    console.warn("[audio] Failed to configure audioSession.", error);
    updateAudioDebugStatus("audioSession failed", {
      reason: error?.message || "error",
      userActivation: getAudioUserActivationState(),
    });
  }
}

function setAudioParam(audioParam, value, smoothing = 0.08) {
  if (!audioParam) {
    return;
  }

  try {
    const context = gameAudio?.context || null;
    if (context && typeof audioParam.setTargetAtTime === "function") {
      const now = context.currentTime;
      audioParam.setTargetAtTime(value, now, smoothing);
      return;
    }

    audioParam.value = value;
  } catch (error) {
    console.warn("[audio] Audio parameter update failed.", { value, smoothing, error });
  }
}

function createNoiseBuffer(context, durationSeconds = 2) {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    channel[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createGameAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    setAudioDebug("Web Audio unavailable");
    return null;
  }

  configureAudioSession();
  const context = new AudioContextClass();
  context.addEventListener("statechange", () => {
    setAudioDebug("context statechange", {
      reason: context.state,
      userActivation: getAudioUserActivationState(),
    });
  });
  setAudioDebug("Created audio context", {
    reason: `${context.state} @ ${context.sampleRate}Hz`,
    userActivation: getAudioUserActivationState(),
  });
  const master = context.createGain();
  const mix = context.createGain();
  const engineMix = context.createGain();
  const rollingMix = context.createGain();
  const brakeMix = context.createGain();
  const sleeperMix = context.createGain();

  master.gain.value = 0;
  mix.gain.value = 0.78;
  engineMix.gain.value = 0;
  rollingMix.gain.value = 0;
  brakeMix.gain.value = 0;
  sleeperMix.gain.value = 0;

  mix.connect(master);
  master.connect(context.destination);
  engineMix.connect(mix);
  rollingMix.connect(mix);
  brakeMix.connect(mix);
  sleeperMix.connect(mix);

  const engineLow = context.createOscillator();
  const engineHigh = context.createOscillator();
  const engineLowGain = context.createGain();
  const engineHighGain = context.createGain();
  const engineFilter = context.createBiquadFilter();

  engineLow.type = "sawtooth";
  engineHigh.type = "triangle";
  engineLow.frequency.value = 26;
  engineHigh.frequency.value = 43;
  engineHigh.detune.value = 7;
  engineLowGain.gain.value = 0.11;
  engineHighGain.gain.value = 0.055;
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 260;
  engineFilter.Q.value = 0.8;

  engineLow.connect(engineLowGain);
  engineHigh.connect(engineHighGain);
  engineLowGain.connect(engineFilter);
  engineHighGain.connect(engineFilter);
  engineFilter.connect(engineMix);

  const noiseBuffer = createNoiseBuffer(context);

  const rollingNoise = context.createBufferSource();
  const rollingFilter = context.createBiquadFilter();
  rollingNoise.buffer = noiseBuffer;
  rollingNoise.loop = true;
  rollingFilter.type = "bandpass";
  rollingFilter.frequency.value = 320;
  rollingFilter.Q.value = 0.5;
  rollingNoise.connect(rollingFilter);
  rollingFilter.connect(rollingMix);

  const brakeNoise = context.createBufferSource();
  const brakeFilter = context.createBiquadFilter();
  brakeNoise.buffer = noiseBuffer;
  brakeNoise.loop = true;
  brakeFilter.type = "bandpass";
  brakeFilter.frequency.value = 1800;
  brakeFilter.Q.value = 1.8;
  brakeNoise.connect(brakeFilter);
  brakeFilter.connect(brakeMix);

  const sleeperNoise = context.createBufferSource();
  const sleeperFilter = context.createBiquadFilter();
  sleeperNoise.buffer = noiseBuffer;
  sleeperNoise.loop = true;
  sleeperFilter.type = "highpass";
  sleeperFilter.frequency.value = 900;
  sleeperFilter.Q.value = 0.7;
  sleeperNoise.connect(sleeperFilter);
  sleeperFilter.connect(sleeperMix);

  engineLow.start();
  engineHigh.start();
  rollingNoise.start();
  brakeNoise.start();
  sleeperNoise.start();

  return {
    context,
    master,
    engineLow,
    engineHigh,
    engineFilter,
    engineMix,
    rollingFilter,
    rollingMix,
    brakeFilter,
    brakeMix,
    sleeperFilter,
    sleeperMix,
    sleeperPhase: 0,
    curveTightnessSmoothed: 0,
  };
}

function warmUpAudioContext(context) {
  if (!context) {
    return Promise.resolve(false);
  }

  try {
    const buffer = context.createBuffer(1, 1, Math.max(22050, context.sampleRate || 44100));
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = 0;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(context.destination);
    source.start(0);
    source.stop(0);
    setAudioDebug("warmed up", { userActivation: getAudioUserActivationState() });
    return Promise.resolve(true);
  } catch (error) {
    console.warn("[audio] Audio warm-up failed.", error);
    updateAudioDebugStatus("warm-up failed", {
      reason: error?.message || "error",
      userActivation: getAudioUserActivationState(),
    });
    return Promise.resolve(false);
  }
}

function ensureGameAudioReady() {
  try {
    if (!gameAudio) {
      setAudioDebug("initializing", { userActivation: getAudioUserActivationState() });
      gameAudio = createGameAudio();
      if (!gameAudio) {
        setAudioDebug("init returned no graph");
      }
    }
  } catch (error) {
    console.error("[audio] Audio initialization failed. Continuing without sound.", error);
    updateAudioDebugStatus("init failed", {
      reason: error?.message || "error",
      userActivation: getAudioUserActivationState(),
    });
    gameAudio = null;
  }

  return gameAudio;
}

async function rebuildGameAudioInGesture(trigger = "manual") {
  if (gameAudio?.context) {
    try {
      await gameAudio.context.close();
      setAudioDebug("closed suspended context", {
        trigger,
        userActivation: getAudioUserActivationState(),
      });
    } catch (error) {
      console.warn("[audio] Failed to close suspended context.", error);
    }
  }

  gameAudio = null;
  const audio = ensureGameAudioReady();
  if (!audio?.context) {
    return null;
  }

  try {
    await audio.context.resume();
    setAudioDebug("rebuilt context resumed", {
      trigger,
      reason: audio.context.state,
      userActivation: getAudioUserActivationState(),
    });
    await warmUpAudioContext(audio.context);
  } catch (error) {
    console.error("[audio] Rebuilt context resume failed.", error);
    updateAudioDebugStatus("rebuilt resume failed", {
      trigger,
      reason: error?.message || "error",
      userActivation: getAudioUserActivationState(),
    });
  }

  return audio;
}

async function unlockGameAudioFromGesture(event = null, options = {}) {
  const { forceRetry = false } = options;
  const trigger = event?.type || "manual";

  if (audioUnlockPromise) {
    updateAudioDebugStatus(forceRetry ? "unlock retry queued" : "unlock pending", {
      trigger,
      reason: gameAudio?.context?.state || "none",
      userActivation: getAudioUserActivationState(),
    });

    if (!forceRetry) {
      return audioUnlockPromise;
    }

    await audioUnlockPromise;
    if (gameAudio?.context?.state === "running") {
      return true;
    }
  }

  audioUnlockPromise = (async () => {
    setAudioDebug("gesture seen", {
      trigger,
      userActivation: getAudioUserActivationState(),
    });
    const audio = ensureGameAudioReady();
    if (!audio?.context) {
      updateAudioDebugStatus("no context", {
        trigger,
        userActivation: getAudioUserActivationState(),
      });
      return false;
    }

    try {
      if (audio.context.state !== "running") {
        setAudioDebug("unlock attempting", {
          trigger,
          reason: audio.context.state,
          userActivation: getAudioUserActivationState(),
        });
        await audio.context.resume();
        setAudioDebug("unlock resume resolved", {
          trigger,
          reason: audio.context.state,
          userActivation: getAudioUserActivationState(),
        });
        scheduleAudioStateProbe("after resume", trigger, 60);
        scheduleAudioStateProbe("after resume", trigger, 240);
      }

      await warmUpAudioContext(audio.context);
      scheduleAudioStateProbe("after warm-up", trigger, 60);

      if (audio.context.state !== "running") {
        setAudioDebug("rebuild requested", {
          trigger,
          reason: audio.context.state,
          userActivation: getAudioUserActivationState(),
        });
        await rebuildGameAudioInGesture(trigger);
      }

      if (gameAudio?.context?.state === "running") {
        window.removeEventListener("keydown", unlockGameAudioFromGesture, true);
        window.removeEventListener("touchend", unlockGameAudioFromGesture, true);
        window.removeEventListener("mouseup", unlockGameAudioFromGesture, true);
        window.removeEventListener("click", unlockGameAudioFromGesture, true);
        document.removeEventListener("touchend", unlockGameAudioFromGesture, true);
        document.removeEventListener("mouseup", unlockGameAudioFromGesture, true);
        document.removeEventListener("click", unlockGameAudioFromGesture, true);
        audioUnlockInitialized = false;
        setAudioDebug("unlocked", {
          trigger,
          userActivation: getAudioUserActivationState(),
        });
        return true;
      }
      updateAudioDebugStatus("not running after unlock", {
        trigger,
        reason: gameAudio?.context?.state || audio.context.state,
        userActivation: getAudioUserActivationState(),
      });
    } catch (error) {
      console.error("[audio] Gesture-driven audio unlock failed.", error);
      updateAudioDebugStatus("unlock failed", {
        trigger,
        reason: error?.message || "error",
        userActivation: getAudioUserActivationState(),
      });
    } finally {
      audioUnlockPromise = null;
    }

    return false;
  })();

  return audioUnlockPromise;
}

function initializeAudioUnlock() {
  if (audioUnlockInitialized) {
    return;
  }

  audioUnlockInitialized = true;
  attachAudioEnvironmentDebug();
  configureAudioSession();
  setAudioDebug("waiting for gesture", { userActivation: getAudioUserActivationState() });
  window.addEventListener("keydown", unlockGameAudioFromGesture, true);
  window.addEventListener("touchend", unlockGameAudioFromGesture, true);
  window.addEventListener("mouseup", unlockGameAudioFromGesture, true);
  window.addEventListener("click", unlockGameAudioFromGesture, true);
  document.addEventListener("touchend", unlockGameAudioFromGesture, true);
  document.addEventListener("mouseup", unlockGameAudioFromGesture, true);
  document.addEventListener("click", unlockGameAudioFromGesture, true);
}

function updateGameAudio(dt = 0) {
  if (!gameAudio || !state) {
    return;
  }

  try {
    const activeRun = state.started && !state.finished;
    const moving = state.speed > 0.12 || Math.abs(state.actualControl) > 0.03;
    const masterLevel = activeRun || moving ? 1 : 0;
    setAudioParam(gameAudio.master.gain, masterLevel, 0.2);

    const routeInfo = route ? evaluateRoute(state.distance) : null;
    const curvature = Math.abs(routeInfo?.curvature || 0);
    const curveRadius = curvature > 1e-6 ? 1 / curvature : Infinity;
    const curveTightness = Number.isFinite(curveRadius)
      ? clamp(
        (TUNING.route.broadCurveRadiusMax - curveRadius)
          / Math.max(TUNING.route.broadCurveRadiusMax - TUNING.route.sharpCurveRadiusMin, 1e-6),
        0,
        1,
      )
      : 0;
    const curveBlend = 1 - Math.exp(-dt / 0.28);
    gameAudio.curveTightnessSmoothed += (curveTightness - gameAudio.curveTightnessSmoothed) * curveBlend;
    const curveTightnessSmooth = gameAudio.curveTightnessSmoothed;

    const speedNorm = clamp(state.speed / Math.max(TUNING.physics.speedCap, 1e-6), 0, 1);
    const throttle = clamp(Math.max(0, state.actualControl), 0, 1);
    const brake = clamp(Math.max(0, -state.actualControl), 0, 1);
    const accelNorm = clamp(Math.max(0, state.acceleration || 0) / Math.max(TUNING.physics.tractionForce, 1e-6), 0, 1);
    const brakeLoad = clamp(Math.max(0, -(state.acceleration || 0)) / Math.max(TUNING.physics.brakingForce, 1e-6), 0, 1);

    const engineBase = activeRun ? 0.065 : 0;
    const engineGain = engineBase + throttle * 0.182 + accelNorm * 0.072 + speedNorm * 0.052;
    setAudioParam(gameAudio.engineMix.gain, engineGain, 0.12);
    setAudioParam(gameAudio.engineLow.frequency, 24 + throttle * 19 + speedNorm * 11, 0.1);
    setAudioParam(gameAudio.engineHigh.frequency, 39 + throttle * 32 + speedNorm * 19 + accelNorm * 7, 0.1);
    setAudioParam(gameAudio.engineFilter.frequency, 145 + throttle * 390 + speedNorm * 205 + accelNorm * 115, 0.14);

    const rollingGain = activeRun
      ? (
        speedNorm > 0.01
          ? 0.018 + Math.pow(speedNorm, 1.08) * (0.14 + curveTightnessSmooth * 0.14)
          : 0
      )
      : 0;
    setAudioParam(gameAudio.rollingMix.gain, rollingGain, 0.14);
    setAudioParam(gameAudio.rollingFilter.frequency, 180 + speedNorm * 1800 + curveTightnessSmooth * 900, 0.16);

    const brakeGain = activeRun ? brake * clamp(state.speed / 28, 0, 1) * (0.24 + brakeLoad * 0.9) * 0.336 : 0;
    setAudioParam(gameAudio.brakeMix.gain, brakeGain, 0.05);
    setAudioParam(gameAudio.brakeFilter.frequency, 1200 + speedNorm * 2200 + brake * 800, 0.06);

    const sleeperFrequency = clamp(state.speed / 0.72, 0, 90);
    gameAudio.sleeperPhase = (gameAudio.sleeperPhase + dt * sleeperFrequency * Math.PI * 2) % (Math.PI * 2);
    const sleeperPulse = Math.pow(Math.max(0, Math.sin(gameAudio.sleeperPhase)), 8);
    const sleeperBase = activeRun ? clamp(state.speed / 36, 0, 1) * 0.06 : 0;
    const sleeperGain = sleeperBase * (0.28 + sleeperPulse * 1.8);
    setAudioParam(gameAudio.sleeperMix.gain, sleeperGain, 0.03);
    setAudioParam(gameAudio.sleeperFilter.frequency, 950 + speedNorm * 2600, 0.08);
    if (!audioDebugLogged && activeRun) {
      setAudioDebug("update running", {
        reason: gameAudio.context.state,
        speed: state.speed,
        throttle,
        brake,
        curveRadius: Number.isFinite(curveRadius) ? curveRadius : null,
        curveTightnessSmooth,
      });
      audioDebugLogged = true;
    }
  } catch (error) {
    console.error("[audio] Audio update failed. Continuing without sound.", error);
    gameAudio = null;
  }
}

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
        <span>${formatDistanceKm(getStationStopMetrics(station).targetDistance - state.distance)}</span>
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

  const acceptancePercent = clamp((getStationStopTolerance() / STATION_ASSIST_ZOOM) * 100, 0, 100);
  const leftPercent = (100 - acceptancePercent) * 0.5;
  assistScale.style.setProperty("--assist-window-left", `${leftPercent}%`);
  assistScale.style.setProperty("--assist-window-width", `${acceptancePercent}%`);
}

function setButtonHold(button, key) {
  const engage = (event) => {
    updateAudioDebugStatus("control pressed", {
      trigger: event?.type || key,
      userActivation: getAudioUserActivationState(),
    });
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
    updateAudioDebugStatus("control mouseup", {
      trigger: event?.type || key,
      userActivation: getAudioUserActivationState(),
    });
    unlockGameAudioFromGesture(event, { forceRetry: true });
    release();
  });
  button.addEventListener("mouseleave", release);
  button.addEventListener("touchstart", engage, { passive: false });
  button.addEventListener("touchend", (event) => {
    updateAudioDebugStatus("control touchend", {
      trigger: event?.type || key,
      userActivation: getAudioUserActivationState(),
    });
    unlockGameAudioFromGesture(event, { forceRetry: true });
  }, { passive: true });
  button.addEventListener("touchend", release, { passive: true });
  button.addEventListener("touchcancel", release, { passive: true });
  button.addEventListener("click", (event) => {
    updateAudioDebugStatus("control click", {
      trigger: event?.type || key,
      userActivation: getAudioUserActivationState(),
    });
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

function renderDroneInset() {
  if (!droneInsetRenderer || !route || !state || appShell.classList.contains("hidden") || isDroneInsetMinimized) {
    return;
  }

  droneInsetRenderer.renderFrame({
    trainPose: evaluateRoute(state.distance),
    renderedUnits: getRenderedTrainUnits(),
    trainLength: TRAIN_TOTAL_LENGTH,
    activeStationIndex: state.stationIndex,
    overspeedTimer: state.overspeedTimer,
    derailment: state.derailment,
    maxLineSpeed: MAX_LINE_SPEED,
    powerOutput: Math.max(0, state.actualControl),
    acceleration: Math.max(0, state.acceleration || 0),
    speed: state.speed,
    biomeBlend: getBiomeBlendAtDistance(),
  });
}

function getViewMetrics(width, height) {
  const trainPose = evaluateRoute(state.distance);
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

function evaluateRoute(distance) {
  if (distance < 0) {
    const firstSegment = route.segments[0];
    return {
      x: firstSegment.x0 + Math.cos(firstSegment.heading0) * distance,
      y: firstSegment.y0 + Math.sin(firstSegment.heading0) * distance,
      heading: firstSegment.heading0,
      curvature: 0,
      speedLimit: firstSegment.speedLimit,
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
  const stationCurveClearDistance = getStationZoneLength() * 0.5;

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

    if (stationIndex < TOTAL_STATIONS - 1 && stationCurveClearDistance > 1) {
      const built = makeSegment(cursor, stationCurveClearDistance, 0, null);
      segments.push(built.segment);
      cursor = built.endState;
    }
  }

  const tail = makeSegment(cursor, TUNING.stations.tailLength, 0, null);
  segments.push(tail.segment);

  const totalLength = tail.segment.end;

  return {
    segments,
    stations,
    biomes: generateBiomes(totalLength),
    terrainCornerCache: new Map(),
    terrainTileCache: new Map(),
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
  const normalX = -Math.sin(heading);
  const normalY = Math.cos(heading);
  const sourceX = unit.renderX + normalX * unit.width * 0.08 - forwardX * unit.length * 0.08;
  const sourceY = unit.renderY + normalY * unit.width * 0.08 - forwardY * unit.length * 0.08;
  const sidewaysJitter = Math.random() * 0.18 - 0.09;

  state.exhaustPuffs.push({
    x: sourceX,
    y: sourceY,
    driftX: 0.18 - forwardX * (0.12 + intensity * 0.14) + normalX * sidewaysJitter,
    driftY: -0.08 - forwardY * (0.12 + intensity * 0.14) + normalY * sidewaysJitter,
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

  const signalEntries = route.signals
    .filter((signal) => signal.distance >= state.distance)
    .map((signal) => ({
      type: "signal",
      distance: roundDisplayDistance(signal.distance - state.distance),
      aspect: getSignalAspect(signal),
      limitKph: signal.kind === "yellow" ? Math.round(signal.speedLimit * 3.6) : null,
    }));

  return [...curveEntries, ...signalEntries]
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
  const stopMetrics = getRedStopMetrics(signal);
  return {
    startDistance: stopMetrics.zoneStart,
    endDistance: stopMetrics.zoneEnd,
  };
}

function isInsideRedStopZone(signal, distance = state.distance) {
  const stopZone = getRedStopZone(signal);
  return distance >= stopZone.startDistance && distance <= stopZone.endDistance;
}

function processSignals(dt) {
  state.signalStatus = null;
  const nextRed = route.signals.find(
    (signal) => signal.kind === "red" && signal.aspect === "red" && signal.distance >= state.distance,
  );

  if (!nextRed) {
    return false;
  }

  const gap = nextRed.distance - state.distance;
  const stopZone = getRedStopZone(nextRed);
  const inStopZone = isInsideRedStopZone(nextRed);
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
    } else if (state.distance <= stopZone.endDistance) {
      const zoneGap = stopZone.startDistance - state.distance;
      state.signalStatus = {
        message: "Red signal ahead",
        detail: zoneGap > 0 ? `Stop in the red zone in ${roundDisplayDistance(zoneGap)} m.` : "Hold the locomotive front inside the red zone.",
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

  const stopMetrics = getStationStopMetrics(nextStation);
  const gap = stopMetrics.targetDistance - state.distance;
  if (Math.abs(gap) > STATION_ASSIST_RANGE) {
    return null;
  }

  const frontOffset = state.distance - stopMetrics.targetDistance;
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

  let acceleration = traction - braking - drag;
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

  const stopMetrics = getStationStopMetrics(nextStation);
  const gap = stopMetrics.targetDistance - state.distance;

  if (Math.abs(gap) <= stopMetrics.tolerance && state.speed <= STATION_STOP_SPEED) {
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
    state.detail = "A 100 m train takes space. Start easing off well before the station target.";
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
  const shownLimit = upcomingLimit.limit;
  const shownUpcomingLimit = upcomingLimit.upcomingLimit;
  const gap = nextStation ? getStationStopMetrics(nextStation).targetDistance - state.distance : 0;
  const assist = getStopAssistData();
  const statusMessage = state.signalStatus ? state.signalStatus.message : state.message;
  const statusDetail = state.signalStatus ? state.signalStatus.detail : state.detail;

  statusText.textContent = statusMessage;
  subStatus.textContent = statusDetail;
  speedKph.textContent = Math.round(state.speed * 3.6);
  lineLimitKph.textContent = shownLimit == null ? "No limit" : Math.round(shownLimit * 3.6);
  lineLimitSecondary.textContent = shownLimit == null
    ? "Line unrestricted"
    : `Curve limit ${Math.round(shownLimit * 3.6)} km/h`;
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
  element.style.background = value >= 0
    ? "linear-gradient(90deg, #f6a23f, #ffc160)"
    : "linear-gradient(90deg, #58a8ff, #7ed3ff)";
}

function updateMarker(element, value) {
  element.style.left = `${50 + value * 50}%`;
}

function worldToScreen(point, camera, scale, width, height) {
  return {
    x: width * 0.5 + (point.x - camera.x) * scale,
    y: height * 0.5 + (point.y - camera.y) * scale,
  };
}

function drawBackground(width, height) {
  const view = getViewMetrics(width, height);
  const { camera, scale, anchorY } = view;
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
  const leftWorld = camera.x - width * 0.5 / scale;
  const rightWorld = camera.x + width * 0.5 / scale;
  const topWorld = camera.y - anchorY / scale;
  const bottomWorld = camera.y + (height - anchorY) / scale;
  const startWorldX = Math.floor((leftWorld - cellSize) / cellSize) * cellSize;
  const endWorldX = Math.ceil((rightWorld + cellSize) / cellSize) * cellSize;
  const startWorldY = Math.floor((topWorld - cellSize) / cellSize) * cellSize;
  const endWorldY = Math.ceil((bottomWorld + cellSize) / cellSize) * cellSize;

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

      let topColor = topEdgeBase;
      let bottomColor = bottomEdgeBase;
      if (tileStyle.biomeSeed > 0.72) {
        topColor = tileStyle.toneSeed > 0.5
          ? mixPaletteColor(topEdgeBase, topEdgeAlt, 0.55)
          : topEdgeAlt;
        bottomColor = tileStyle.toneSeed > 0.5
          ? mixPaletteColor(bottomEdgeBase, bottomEdgeAlt, 0.55)
          : bottomEdgeAlt;
      } else if (tileStyle.biomeSeed > 0.44) {
        topColor = tileStyle.toneSeed > 0.5
          ? mixPaletteColor(topEdgeAlt, topEdgeDetail, 0.35)
          : topEdgeAlt;
        bottomColor = tileStyle.toneSeed > 0.5
          ? mixPaletteColor(bottomEdgeAlt, bottomEdgeDetail, 0.35)
          : bottomEdgeAlt;
      } else {
        topColor = tileStyle.toneSeed > 0.45
          ? mixPaletteColor(topEdgeBase, topEdgeDetail, 0.25)
          : topEdgeBase;
        bottomColor = tileStyle.toneSeed > 0.45
          ? mixPaletteColor(bottomEdgeBase, bottomEdgeDetail, 0.25)
          : bottomEdgeBase;
      }
      const screenX = width * 0.5 + (worldX - camera.x) * scale;
      const screenY = anchorY + (worldY - camera.y) * scale;
      const pixelSize = cellSize * scale;
      const tileGradient = ctx.createLinearGradient(0, screenY, 0, screenY + pixelSize);
      tileGradient.addColorStop(0, paletteColorToCss(topColor));
      tileGradient.addColorStop(1, paletteColorToCss(bottomColor));
      ctx.fillStyle = tileGradient;
      ctx.fillRect(screenX, screenY, pixelSize + 1, pixelSize + 1);

      const tuftSize = (6 + hashNoise(cellGridX + 14, cellGridY + 3) * 16) * scale;
      const detailColor = mixPaletteColor(topEdgeDetail, bottomEdgeDetail, 0.5);
      ctx.fillStyle = paletteColorToCss(detailColor);
      ctx.beginPath();
      ctx.ellipse(
        screenX + hashNoise(cellGridX + 2, cellGridY + 5) * pixelSize,
        screenY + hashNoise(cellGridX + 8, cellGridY + 11) * pixelSize,
        tuftSize,
        tuftSize * 0.6,
        hashNoise(cellGridX + 12, cellGridY + 15) * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      const riverMix = lerp(topLeft.riverMix, bottomRight.riverMix, 0.5);
      if (riverMix > 0) {
        const waterMix = riverMix;
        const ribbon = Math.sin((worldY + worldX * 0.25) * 0.008) * cellSize * 0.36;
        const riverCenter = screenX + pixelSize * 0.5 + ribbon * scale;
        ctx.fillStyle = `rgba(84, 154, 194, ${(0.08 + waterMix * 0.14).toFixed(3)})`;
        ctx.fillRect(riverCenter - pixelSize * 0.18, screenY - 1, pixelSize * 0.36, pixelSize + 2);
      }
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

  return {
    x: point.x + normalX * item.offset,
    y: point.y + normalY * item.offset,
  };
}

function drawScenery(view, width, height) {
  const { camera, scale } = view;
  const animationTime = state.elapsed;

  route.scenery.forEach((item) => {
    if (item.distance < view.startDistance - 60 || item.distance > view.endDistance + 60) {
      return;
    }

    const point = getSceneryPoint(item);
    const screen = {
      x: width * 0.5 + (point.x - camera.x) * scale,
      y: view.anchorY + (point.y - camera.y) * scale,
    };

    if (screen.y < -80 || screen.y > height + 80 || screen.x < -80 || screen.x > width + 80) {
      return;
    }

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(item.rotation);

    if (item.kind === "tree") {
      const canopy = Math.max(10, scale * 10 * item.size);
      const trunkHeight = Math.max(7, scale * 7 * item.size);
      ctx.fillStyle = "rgba(15, 24, 32, 0.18)";
      ctx.beginPath();
      ctx.ellipse(0, canopy * 0.5, canopy * 0.9, canopy * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#5b4234";
      ctx.fillRect(-canopy * 0.12, canopy * 0.1, canopy * 0.24, trunkHeight);
      ctx.fillStyle = item.tint > 0 ? "#3c8054" : "#2f6f49";
      ctx.beginPath();
      ctx.arc(0, 0, canopy, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-canopy * 0.62, canopy * 0.1, canopy * 0.7, 0, Math.PI * 2);
      ctx.arc(canopy * 0.62, canopy * 0.12, canopy * 0.66, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === "bush") {
      const bush = Math.max(8, scale * 7.5 * item.size);
      ctx.fillStyle = item.tint > 0 ? "#4f8a52" : "#427446";
      ctx.beginPath();
      ctx.arc(-bush * 0.5, 0, bush * 0.72, 0, Math.PI * 2);
      ctx.arc(bush * 0.45, 0, bush * 0.78, 0, Math.PI * 2);
      ctx.arc(0, -bush * 0.18, bush * 0.86, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === "rock") {
      const rock = Math.max(9, scale * 7 * item.size);
      ctx.fillStyle = "#758392";
      ctx.beginPath();
      ctx.moveTo(-rock, rock * 0.4);
      ctx.lineTo(-rock * 0.45, -rock * 0.8);
      ctx.lineTo(rock * 0.7, -rock * 0.55);
      ctx.lineTo(rock, rock * 0.2);
      ctx.lineTo(rock * 0.16, rock);
      ctx.closePath();
      ctx.fill();
    } else if (item.kind === "hut") {
      const hutWidth = Math.max(13, scale * 12 * item.size);
      const hutHeight = Math.max(11, scale * 10 * item.size);
      ctx.fillStyle = "#c6935f";
      ctx.fillRect(-hutWidth / 2, -hutHeight / 2, hutWidth, hutHeight);
      ctx.fillStyle = "#71492f";
      ctx.beginPath();
      ctx.moveTo(-hutWidth * 0.62, -hutHeight / 2);
      ctx.lineTo(0, -hutHeight * 1.02);
      ctx.lineTo(hutWidth * 0.62, -hutHeight / 2);
      ctx.closePath();
      ctx.fill();
    } else if (item.kind === "barn") {
      const barnWidth = Math.max(18, scale * 18 * item.size);
      const barnHeight = Math.max(14, scale * 12 * item.size);
      ctx.fillStyle = "#b34f43";
      ctx.fillRect(-barnWidth / 2, -barnHeight / 2, barnWidth, barnHeight);
      ctx.fillStyle = "#7c2c24";
      ctx.beginPath();
      ctx.moveTo(-barnWidth * 0.58, -barnHeight / 2);
      ctx.lineTo(0, -barnHeight * 1.08);
      ctx.lineTo(barnWidth * 0.58, -barnHeight / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f0d9b0";
      ctx.fillRect(-barnWidth * 0.12, -barnHeight * 0.05, barnWidth * 0.24, barnHeight * 0.55);
    } else if (item.kind === "billboard") {
      const boardWidth = Math.max(16, scale * 18 * item.size);
      const boardHeight = Math.max(10, scale * 9 * item.size);
      ctx.fillStyle = "#3a2e27";
      ctx.fillRect(-boardWidth * 0.35, boardHeight * 0.05, boardWidth * 0.08, boardHeight * 0.9);
      ctx.fillRect(boardWidth * 0.27, boardHeight * 0.05, boardWidth * 0.08, boardHeight * 0.9);
      ctx.fillStyle = item.tint > 0 ? "#ffe28a" : "#9ad7ff";
      ctx.fillRect(-boardWidth / 2, -boardHeight / 2, boardWidth, boardHeight);
      ctx.fillStyle = "rgba(25, 40, 56, 0.75)";
      ctx.fillRect(-boardWidth * 0.34, -boardHeight * 0.18, boardWidth * 0.68, boardHeight * 0.18);
    } else if (item.kind === "pond") {
      const pondWidth = Math.max(18, scale * 20 * item.size);
      const pondHeight = Math.max(12, scale * 12 * item.size);
      ctx.fillStyle = "rgba(35, 98, 140, 0.24)";
      ctx.beginPath();
      ctx.ellipse(0, 0, pondWidth * 0.9, pondHeight * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(92, 177, 221, 0.72)";
      ctx.beginPath();
      ctx.ellipse(0, 0, pondWidth * 0.72, pondHeight * 0.64, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === "ruins") {
      const ruinWidth = Math.max(14, scale * 14 * item.size);
      const ruinHeight = Math.max(10, scale * 9 * item.size);
      ctx.fillStyle = "#8a7a6a";
      ctx.fillRect(-ruinWidth / 2, -ruinHeight / 2, ruinWidth, ruinHeight);
      ctx.clearRect(-ruinWidth * 0.14, -ruinHeight * 0.1, ruinWidth * 0.28, ruinHeight * 0.42);
      ctx.fillStyle = "#6b5c4f";
      ctx.fillRect(-ruinWidth * 0.54, -ruinHeight * 0.54, ruinWidth * 0.18, ruinHeight * 1.02);
      ctx.fillRect(ruinWidth * 0.28, -ruinHeight * 0.42, ruinWidth * 0.16, ruinHeight * 0.9);
    } else if (item.kind === "cactus") {
      const cactusHeight = Math.max(16, scale * 16 * item.size);
      const cactusWidth = Math.max(5, scale * 4 * item.size);
      ctx.fillStyle = "#3c7d4f";
      ctx.fillRect(-cactusWidth / 2, -cactusHeight / 2, cactusWidth, cactusHeight);
      ctx.fillRect(-cactusWidth * 1.35, -cactusHeight * 0.12, cactusWidth * 0.9, cactusHeight * 0.42);
      ctx.fillRect(cactusWidth * 0.45, -cactusHeight * 0.02, cactusWidth * 0.9, cactusHeight * 0.34);
    } else if (item.kind === "stump") {
      const stumpWidth = Math.max(7, scale * 6 * item.size);
      const stumpHeight = Math.max(5, scale * 4.5 * item.size);
      ctx.fillStyle = "#7b5a3d";
      ctx.beginPath();
      ctx.ellipse(0, 0, stumpWidth, stumpHeight, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(220, 190, 142, 0.55)";
      ctx.beginPath();
      ctx.ellipse(0, -stumpHeight * 0.1, stumpWidth * 0.58, stumpHeight * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === "hayBale") {
      const baleWidth = Math.max(10, scale * 10 * item.size);
      const baleHeight = Math.max(7, scale * 7 * item.size);
      ctx.fillStyle = "#d7b55a";
      ctx.beginPath();
      ctx.roundRect(-baleWidth / 2, -baleHeight / 2, baleWidth, baleHeight, baleHeight * 0.35);
      ctx.fill();
      ctx.strokeStyle = "rgba(132, 99, 43, 0.65)";
      ctx.lineWidth = Math.max(1, scale * 0.55);
      ctx.beginPath();
      ctx.moveTo(-baleWidth * 0.16, -baleHeight * 0.4);
      ctx.lineTo(-baleWidth * 0.16, baleHeight * 0.4);
      ctx.moveTo(baleWidth * 0.18, -baleHeight * 0.4);
      ctx.lineTo(baleWidth * 0.18, baleHeight * 0.4);
      ctx.stroke();
    } else if (item.kind === "silo") {
      const siloWidth = Math.max(10, scale * 10 * item.size);
      const siloHeight = Math.max(18, scale * 17 * item.size);
      ctx.fillStyle = "#aab4bc";
      ctx.fillRect(-siloWidth / 2, -siloHeight / 2, siloWidth, siloHeight);
      ctx.fillStyle = "#7f8a95";
      ctx.beginPath();
      ctx.ellipse(0, -siloHeight / 2, siloWidth * 0.5, siloWidth * 0.36, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === "windmill") {
      const mastHeight = Math.max(18, scale * 18 * item.size);
      const bladeLength = Math.max(9, scale * 8 * item.size);
      ctx.strokeStyle = "#c6d3db";
      ctx.lineWidth = Math.max(1.2, scale * 0.8);
      ctx.beginPath();
      ctx.moveTo(0, mastHeight * 0.5);
      ctx.lineTo(0, -mastHeight * 0.5);
      ctx.stroke();
      ctx.translate(0, -mastHeight * 0.48);
      ctx.rotate(item.rotation * 2.4);
      for (let bladeIndex = 0; bladeIndex < 4; bladeIndex += 1) {
        ctx.rotate(Math.PI * 0.5);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(bladeLength, 0);
        ctx.stroke();
      }
    }

    ctx.restore();
  });
}

function drawTrack(width, height) {
  const view = getViewMetrics(width, height);
  const { camera, scale, startDistance, endDistance } = view;

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
    centerPoints.push({
      x: width * 0.5 + (point.x - camera.x) * scale,
      y: view.anchorY + (point.y - camera.y) * scale,
    });
    leftRail.push(
      {
        x: width * 0.5 + (point.x + normalX * TRACK_WIDTH * 0.5 - camera.x) * scale,
        y: view.anchorY + (point.y + normalY * TRACK_WIDTH * 0.5 - camera.y) * scale,
      },
    );
    rightRail.push(
      {
        x: width * 0.5 + (point.x - normalX * TRACK_WIDTH * 0.5 - camera.x) * scale,
        y: view.anchorY + (point.y - normalY * TRACK_WIDTH * 0.5 - camera.y) * scale,
      },
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
    const leftPoint = {
      x: width * 0.5 + (point.x + normalX * TRACK_WIDTH * 0.5 - camera.x) * scale,
      y: view.anchorY + (point.y + normalY * TRACK_WIDTH * 0.5 - camera.y) * scale,
    };
    const rightPoint = {
      x: width * 0.5 + (point.x - normalX * TRACK_WIDTH * 0.5 - camera.x) * scale,
      y: view.anchorY + (point.y - normalY * TRACK_WIDTH * 0.5 - camera.y) * scale,
    };
    ctx.beginPath();
    ctx.moveTo(leftPoint.x, leftPoint.y);
    ctx.lineTo(rightPoint.x, rightPoint.y);
    ctx.stroke();
  }

  drawRouteMarkers(view, width, height);
}

function drawRouteMarkers(view, width, height) {
  const { camera, scale } = view;
  route.stations.slice(1).forEach((station, index) => {
    const point = evaluateRoute(station.distance);
    const stopMetrics = getStationStopMetrics(station);
    const targetOffset = stopMetrics.targetDistance - station.distance;
    const screen = {
      x: width * 0.5 + (point.x - camera.x) * scale,
      y: view.anchorY + (point.y - camera.y) * scale,
    };
    if (screen.y < -50 || screen.y > height + 50) {
      return;
    }

    const isActive = index + 1 === state.stationIndex;
    const markerWidth = Math.max(22, stopMetrics.tolerance * scale * 2);
    const markerHeight = clamp(TRACK_WIDTH * scale * 2.4, 12, 20);
    const markerRadius = Math.min(markerHeight * 0.5, 10);
    const centerMarkerHeight = markerHeight + clamp(TRACK_WIDTH * scale * 3.8, 16, 30);
    const platformLength = Math.max(markerWidth + clamp(26 * scale, 12, 36), stopMetrics.zoneLength * scale);
    const platformWidth = clamp(TRACK_WIDTH * scale * 1.7, 8, 14);
    const platformOffset = clamp(TRACK_WIDTH * scale * 1.85, 11, 20);
    const buildingWidth = clamp(28 * scale, 18, 38);
    const buildingDepth = clamp(18 * scale, 12, 24);
    const buildingOffset = platformOffset + platformWidth * 0.5 + buildingDepth * 0.8;
    const platformStartX = -platformLength * 0.5;
    const buildingTrackOffset = -platformLength * 0.2;
    const stationVisual = station.visual || createStationVisual();
    const labelTrackOffset = buildingTrackOffset;
    const labelSideOffset = stationVisual.buildingSide === -1 ? -(buildingOffset + buildingDepth + 12) : buildingOffset + buildingDepth + 12;

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(point.heading);

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
    ctx.roundRect(targetOffset * scale - markerWidth * 0.5, -markerHeight * 0.5, markerWidth, markerHeight, markerRadius);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = isActive ? "rgba(217, 255, 231, 0.98)" : "rgba(217, 255, 231, 0.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(targetOffset * scale, -centerMarkerHeight * 0.5);
    ctx.lineTo(targetOffset * scale, centerMarkerHeight * 0.5);
    ctx.stroke();
    ctx.restore();

    const labelX = screen.x + Math.cos(point.heading) * labelTrackOffset - Math.sin(point.heading) * labelSideOffset;
    const labelY = screen.y + Math.sin(point.heading) * labelTrackOffset + Math.cos(point.heading) * labelSideOffset;
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
    const screen = {
      x: width * 0.5 + (markerPoint.x - camera.x) * scale,
      y: view.anchorY + (markerPoint.y - camera.y) * scale,
    };
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

  route.signals.forEach((signal) => {
    const basePoint = evaluateRoute(signal.distance);
    const normalX = -Math.sin(basePoint.heading);
    const normalY = Math.cos(basePoint.heading);
    const signalPoint = {
      x: basePoint.x + normalX * signal.side * (TRACK_WIDTH * 0.8 + TUNING.signals.sideOffset),
      y: basePoint.y + normalY * signal.side * (TRACK_WIDTH * 0.8 + TUNING.signals.sideOffset),
    };
    const screen = {
      x: width * 0.5 + (signalPoint.x - camera.x) * scale,
      y: view.anchorY + (signalPoint.y - camera.y) * scale,
    };
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
      const stopMetrics = getRedStopMetrics(signal);
      const stopZoneCenterDistance = (stopMetrics.zoneStart + stopMetrics.zoneEnd) * 0.5;
      const stopZoneCenter = evaluateRoute(stopZoneCenterDistance);
      const stopZoneScreen = {
        x: width * 0.5 + (stopZoneCenter.x - camera.x) * scale,
        y: view.anchorY + (stopZoneCenter.y - camera.y) * scale,
      };
      const stopZoneLength = Math.max(26, stopMetrics.zoneLength * scale);
      const stopZoneHeight = clamp(TRACK_WIDTH * scale * 2.4, 12, 20);

      ctx.save();
      ctx.translate(stopZoneScreen.x, stopZoneScreen.y);
      ctx.rotate(stopZoneCenter.heading);
      ctx.fillStyle = "rgba(255, 106, 98, 0.1)";
      ctx.strokeStyle = "rgba(255, 146, 136, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-stopZoneLength * 0.5, -stopZoneHeight * 0.5, stopZoneLength, stopZoneHeight, stopZoneHeight * 0.5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

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
        ctx.fillText("Stop zone", stopZoneScreen.x, stopZoneScreen.y - stopZoneHeight * 0.5 - 8);
      }
    }
    ctx.restore();
  });
}

function drawTrain(width, height) {
  const view = getViewMetrics(width, height);
  const { camera, scale } = view;
  const derailment = state.derailment;
  const renderUnits = getRenderedTrainUnits();

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = Math.max(2, scale * 1.2);
  for (let index = 0; index < renderUnits.length - 1; index += 1) {
    const currentUnit = renderUnits[index];
    const nextUnit = renderUnits[index + 1];
    const currentRear = derailment
      ? { x: currentUnit.rearX, y: currentUnit.rearY }
      : evaluateRoute(currentUnit.rearDistance);
    const nextFront = derailment
      ? { x: nextUnit.frontX, y: nextUnit.frontY }
      : evaluateRoute(nextUnit.frontDistance);
    const rearScreen = {
      x: width * 0.5 + (currentRear.x - camera.x) * scale,
      y: view.anchorY + (currentRear.y - camera.y) * scale,
    };
    const frontScreen = {
      x: width * 0.5 + (nextFront.x - camera.x) * scale,
      y: view.anchorY + (nextFront.y - camera.y) * scale,
    };
    ctx.beginPath();
    ctx.moveTo(rearScreen.x, rearScreen.y);
    ctx.lineTo(frontScreen.x, frontScreen.y);
    ctx.stroke();
  }
  ctx.restore();

  renderUnits.slice().reverse().forEach((unit) => {
    const center = {
      x: width * 0.5 + (unit.renderX - camera.x) * scale,
      y: view.anchorY + (unit.renderY - camera.y) * scale,
    };
    const pixelLength = Math.max(TUNING.train.minPixelLength, unit.length * scale);
    const pixelWidth = Math.max(TUNING.train.minPixelWidth, unit.width * scale);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(unit.renderHeading + Math.PI / 2);
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = (state.overspeedTimer > 0.2 || derailment) && unit.type === "locomotive" ? "#ff9b6d" : unit.bodyColor;
    ctx.strokeStyle = "rgba(255,255,255,0.78)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-pixelWidth / 2, -pixelLength / 2, pixelWidth, pixelLength, Math.max(6, pixelWidth * 0.35));
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = unit.roofColor;
    ctx.fillRect(-pixelWidth * 0.28, -pixelLength * 0.32, pixelWidth * 0.56, pixelLength * 0.48);

    if (unit.type === "locomotive") {
      ctx.fillStyle = "rgba(255, 232, 160, 0.88)";
      ctx.fillRect(-pixelWidth * 0.18, -pixelLength * 0.54, pixelWidth * 0.36, Math.max(5, pixelLength * 0.14));
      ctx.fillStyle = "rgba(7, 21, 36, 0.78)";
      ctx.fillRect(-pixelWidth * 0.24, -pixelLength * 0.18, pixelWidth * 0.48, pixelLength * 0.18);
    } else {
      ctx.fillStyle = "rgba(50, 73, 92, 0.45)";
      ctx.fillRect(-pixelWidth * 0.16, -pixelLength * 0.42, pixelWidth * 0.32, pixelLength * 0.84);
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

    const screenX = width * 0.5 + (puff.x - camera.x) * scale;
    const screenY = view.anchorY + (puff.y - camera.y) * scale;
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
  const compactHud = width <= 820;
  drawRoutePredictor(width, height, compactHud);
}

function drawRoutePredictor(width, height, compactHud = false) {
  const upcomingEntries = getUpcomingRouteEntries();
  const baseWidth = compactHud ? 214 : TUNING.visuals.routePredictorWidth;
  const baseHeight = compactHud ? 120 : TUNING.visuals.routePredictorHeight;
  const panelWidth = Math.min(baseWidth, width - 24);
  const panelHeight = Math.min(baseHeight, height - 24);
  const panelX = 12;
  const panelY = 12;
  const distColumnX = panelX + (compactHud ? 14 : 18);
  const markerColumnX = panelX + (compactHud ? 22 : 28);
  const distanceValueX = panelX + (compactHud ? 34 : 42);
  const typeColumnX = panelX + (compactHud ? 72 : 118);
  const actionColumnX = panelX + (compactHud ? 146 : 252);
  const titleY = panelY + (compactHud ? 21 : 28);
  const headerY = panelY + (compactHud ? 37 : 52);
  const rowStartY = panelY + (compactHud ? 54 : 80);
  const rowStep = compactHud ? 14 : 22;
  const radius = compactHud ? 16 : 22;
  const titleFont = compactHud ? "700 12px Inter, sans-serif" : "700 16px Inter, sans-serif";
  const emptyFont = compactHud ? "600 11px Inter, sans-serif" : "600 14px Inter, sans-serif";
  const headerFont = compactHud ? "600 8px Inter, sans-serif" : "600 11px Inter, sans-serif";
  const rowFont = compactHud ? "700 9px Inter, sans-serif" : "700 15px Inter, sans-serif";

  ctx.save();
  ctx.fillStyle = compactHud ? "rgba(6, 16, 28, 0.42)" : "rgba(6, 16, 28, 0.58)";
  ctx.strokeStyle = "rgba(170, 222, 255, 0.16)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelWidth, panelHeight, radius);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#dff2ff";
  ctx.font = titleFont;
  ctx.textAlign = "left";
  ctx.fillText("Route ahead", panelX + (compactHud ? 14 : 18), titleY);

  if (upcomingEntries.length === 0) {
    ctx.fillStyle = "rgba(223, 242, 255, 0.62)";
    ctx.font = emptyFont;
    ctx.fillText(`No curve or signal in the next ${roundDisplayDistance(TUNING.route.upcomingCurveLookahead)} m`, panelX + (compactHud ? 14 : 18), panelY + (compactHud ? 49 : 62));
    ctx.restore();
    return;
  }

  ctx.fillStyle = "rgba(223, 242, 255, 0.46)";
  ctx.font = headerFont;
  ctx.fillText("DIST", distColumnX, headerY);
  ctx.fillText("TYPE", typeColumnX, headerY);
  ctx.fillText("ACTION", actionColumnX, headerY);

  ctx.font = rowFont;
  upcomingEntries.forEach((entry, index) => {
    const rowY = rowStartY + index * rowStep;
    const color = entry.type === "curve"
      ? "#ffbf52"
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
      : `${entry.aspect.toUpperCase()} signal`;
    ctx.fillText(typeLabel, typeColumnX, rowY);

    const actionLabel = entry.type === "curve"
      ? `${entry.limitKph} km/h`
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
  drawSpeedEffects(width, height);
  drawHudOverlay(width, height);
  renderDroneInset();
}

function update(dt) {
  if (!state.started || state.finished) {
    updateGameAudio(dt);
    updateUi();
    return;
  }

  if (state.derailment) {
    updateDerailment(dt);
    updateGameAudio(dt);
    updateUi();
    return;
  }

  state.elapsed += dt;
  updateControls(dt);
  updatePhysics(dt);
  updateDieselExhaust(dt);
  if (processSignalPasses()) {
    updateGameAudio(dt);
    updateUi();
    return;
  }
  if (processSignals(dt)) {
    updateGameAudio(dt);
    updateUi();
    return;
  }
  if (checkFailureConditions()) {
    updateGameAudio(dt);
    updateUi();
    return;
  }
  updatePenalties(dt);
  updateStations();
  updateGameAudio(dt);
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

  state = createInitialState();
  syncDroneInsetRoute();
  state.started = true;
  finishCard.classList.add("hidden");
  resizeCanvas();
  state.message = "Departing Origin";
  state.detail = "The 100 m consist accelerates hard enough, but brake lag still demands planning.";
  updateGameAudio(0);
  updateUi();
}

restartButton.addEventListener("click", () => {
  unlockGameAudioFromGesture();
  startRun();
});

function initializeGame() {
  initializeDroneInsetResizeHandle();
  initializeDroneInsetRenderer();
  initializeDroneInsetToggle();
  initializeAudioUnlock();

  applyTuning();
  syncAssistLegend();
  state = createInitialState();
  lastFrame = performance.now();
  startRun();
  requestAnimationFrame(loop);
}

initializeGame();
