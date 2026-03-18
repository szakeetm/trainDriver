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
const lineLimitSecondary = lineLimitKph.parentElement;
const stationAssist = document.getElementById("stationAssist");
const assistScale = document.getElementById("assistScale");
const assistWindow = document.getElementById("assistWindow");
const assistStationTitle = document.getElementById("assistStationTitle");
const assistDistanceText = document.getElementById("assistDistanceText");
const assistFrontMarker = document.getElementById("assistFrontMarker");
const assistLegendMin = document.getElementById("assistLegendMin");
const assistLegendMax = document.getElementById("assistLegendMax");

const UI_REFRESH_INTERVAL = 0.06;
const KPH_PER_MPS = 3.6;

let uiRefreshCarry = UI_REFRESH_INTERVAL;
let remainingStationsKey = "";
let remainingStationEntries = [];

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
    lookAheadMin: 500, // Distance in meters kept visible ahead of the train at zero speed.
    lookAheadBySpeed: 1800, // Extra forward look-ahead added as speed rises.
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
let audioUnlockInitialized = false;
let audioUnlockPromise = null;
const SILENT_WAV_DATA_URI = "data:audio/wav;base64,UklGRl4AAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YToAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

async function primeHtmlAudioUnlock(trigger = "manual") {
  try {
    const audio = new Audio(SILENT_WAV_DATA_URI);
    audio.preload = "auto";
    audio.playsInline = true;
    audio.muted = true;
    audio.volume = 0;
    const playResult = audio.play();
    if (playResult && typeof playResult.then === "function") {
      await playResult;
    }
    audio.pause();
    audio.currentTime = 0;
    return true;
  } catch (error) {
    console.warn("[audio] HTML audio prime failed.", error, trigger);
    return false;
  }
}

