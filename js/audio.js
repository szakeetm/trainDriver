function configureAudioSession() {
  const session = navigator.audioSession || navigator.webkitAudioSession || null;
  if (!session) {
    return;
  }

  try {
    if (session.type !== "playback") {
      session.type = "playback";
    }
  } catch (error) {
    console.warn("[audio] Failed to configure audioSession.", error);
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

// Diesel-electric locomotive model. Engine speed follows the throttle notch
// (simulated from TUNING.engine), not road speed; road speed drives traction
// motors, wheels, and rail joints.
const AUDIO_ENGINE = {
  cylinders: 12, // Four-stroke V12: one firing per cylinder every two revolutions.
  idleRpm: DEFAULT_TUNING.engine.idleRpm,
};
const AUDIO_RAIL_JOINT_SPACING = 25; // Classic jointed rail length in meters.
const AUDIO_AXLE_HALF_WHEELBASE = 1.3; // Half the axle spacing within one bogie.
const AUDIO_GEAR_MESH_HZ_PER_MPS = 24; // Traction gear mesh frequency per m/s.
const AUDIO_MAX_PENDING_ONE_SHOTS = 48;

function createNoiseBuffer(context, durationSeconds = 6, color = "white") {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let brown = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const white = Math.random() * 2 - 1;
    if (color === "brown") {
      brown = (brown + 0.02 * white) / 1.02;
      channel[index] = brown * 3.5;
    } else {
      channel[index] = white;
    }
  }
  return buffer;
}

function startLoopedNoise(context, buffer) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  // Different offsets keep layers sharing one buffer decorrelated.
  source.start(0, Math.random() * buffer.duration);
  return source;
}

function createFilter(context, type, frequency, q) {
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  return filter;
}

function createSilentGain(context, destination) {
  const gain = context.createGain();
  gain.gain.value = 0;
  if (destination) {
    gain.connect(destination);
  }
  return gain;
}

// One period is a full four-stroke cycle (two crank revolutions). Firing
// harmonics dominate; small per-cylinder differences add the uneven diesel lope.
function createEngineCycleWave(context) {
  const harmonicCount = 240;
  const firingOrder = AUDIO_ENGINE.cylinders;
  const real = new Float32Array(harmonicCount + 1);
  const imag = new Float32Array(harmonicCount + 1);
  for (let k = 1; k <= harmonicCount; k += 1) {
    const envelope = 1 / (1 + Math.pow(k / (firingOrder * 3), 1.4));
    let amplitude;
    if (k % firingOrder === 0) {
      amplitude = 1;
    } else if (k % (firingOrder / 2) === 0) {
      amplitude = 0.38;
    } else {
      amplitude = (0.07 + Math.random() * 0.13) * (k < firingOrder ? 2.2 : 1);
    }
    const phase = Math.random() * Math.PI * 2;
    real[k] = amplitude * envelope * Math.cos(phase);
    imag[k] = amplitude * envelope * Math.sin(phase);
  }
  return context.createPeriodicWave(real, imag);
}

// Narrow positive pulse, one per firing event, used to gate combustion noise.
function createPulseWave(context, harmonicCount = 10) {
  const real = new Float32Array(harmonicCount + 1);
  const imag = new Float32Array(harmonicCount + 1);
  for (let k = 1; k <= harmonicCount; k += 1) {
    real[k] = 1;
  }
  return context.createPeriodicWave(real, imag);
}

function createHarmonicWave(context, amplitudes) {
  const real = new Float32Array(amplitudes.length + 1);
  const imag = new Float32Array(amplitudes.length + 1);
  amplitudes.forEach((amplitude, index) => {
    imag[index + 1] = amplitude;
  });
  return context.createPeriodicWave(real, imag);
}

function normalizeChannel(channel, peak = 0.95) {
  let max = 0;
  for (let index = 0; index < channel.length; index += 1) {
    max = Math.max(max, Math.abs(channel[index]));
  }
  if (max > 0) {
    const scale = peak / max;
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] *= scale;
    }
  }
}

// Wheel striking a rail joint: dull low-passed impact, short low rail ring,
// and a heavy body thump. Low frequencies keep it from sounding tinny.
function createRailJointBuffer(context) {
  const duration = 0.18;
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
  const channel = buffer.getChannelData(0);
  const ringA = 380 + Math.random() * 90;
  const ringB = 820 + Math.random() * 160;
  const ringC = 190 + Math.random() * 40;
  const thump = 48 + Math.random() * 12;
  const impactSmoothing = 1 - Math.exp(-2 * Math.PI * 900 / sampleRate);
  let impactFiltered = 0;
  for (let index = 0; index < channel.length; index += 1) {
    const t = index / sampleRate;
    impactFiltered += ((Math.random() * 2 - 1) - impactFiltered) * impactSmoothing;
    const impact = impactFiltered * Math.exp(-t / 0.004) * 1.6;
    const ring = (
      Math.sin(2 * Math.PI * ringA * t) * 0.5
      + Math.sin(2 * Math.PI * ringB * t + 1) * 0.16
      + Math.sin(2 * Math.PI * ringC * t + 2) * 0.5
    ) * Math.exp(-t / 0.012) * 0.3;
    const body = Math.sin(2 * Math.PI * thump * t * (1 - t * 1.5)) * Math.exp(-t / 0.05) * 1.1;
    channel[index] = impact + ring + body;
  }
  normalizeChannel(channel);
  return buffer;
}

// Coupler slack running in or out.
function createCouplerClunkBuffer(context) {
  const duration = 0.4;
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) {
    const t = index / sampleRate;
    const impact = (Math.random() * 2 - 1) * Math.exp(-t / 0.006) * 0.6;
    const ring = (Math.sin(2 * Math.PI * 410 * t) * 0.6 + Math.sin(2 * Math.PI * 770 * t + 0.7) * 0.35)
      * Math.exp(-t / 0.06) * 0.5;
    const body = Math.sin(2 * Math.PI * 52 * t) * Math.exp(-t / 0.09);
    channel[index] = impact + ring + body;
  }
  normalizeChannel(channel);
  return buffer;
}

// Derailment: heavy impact followed by decaying grinding and metal scrapes.
function createCrashBuffer(context) {
  const duration = 1.8;
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
  const channel = buffer.getChannelData(0);
  const rings = Array.from({ length: 5 }, () => ({
    frequency: 300 + Math.random() * 2200,
    start: Math.random() * 0.9,
    decay: 0.05 + Math.random() * 0.2,
  }));
  let lowpassed = 0;
  let burst = 1;
  for (let index = 0; index < channel.length; index += 1) {
    const t = index / sampleRate;
    if (index % 512 === 0) {
      burst = 0.4 + Math.random() * 0.9;
    }
    lowpassed += ((Math.random() * 2 - 1) - lowpassed) * 0.18;
    let value = lowpassed * Math.exp(-t / 0.7) * burst * 1.6;
    value += Math.sin(2 * Math.PI * 38 * t) * Math.exp(-t / 0.25) * 1.2;
    value += (Math.random() * 2 - 1) * Math.exp(-t / 0.01);
    rings.forEach((ring) => {
      if (t >= ring.start) {
        const local = t - ring.start;
        value += Math.sin(2 * Math.PI * ring.frequency * local) * Math.exp(-local / ring.decay) * 0.35;
      }
    });
    channel[index] = value;
  }
  normalizeChannel(channel);
  return buffer;
}

function createGameAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  configureAudioSession();
  const context = new AudioContextClass();
  const master = context.createGain();
  const mix = context.createGain();
  const limiter = context.createDynamicsCompressor();

  master.gain.value = 0;
  mix.gain.value = 0.78;
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.2;

  mix.connect(master);
  master.connect(limiter);
  limiter.connect(context.destination);

  const whiteNoise = createNoiseBuffer(context, 6, "white");
  const brownNoise = createNoiseBuffer(context, 6, "brown");
  const noise = (buffer) => startLoopedNoise(context, buffer);
  const oscillator = (type, frequency, wave = null) => {
    const osc = context.createOscillator();
    if (wave) {
      osc.setPeriodicWave(wave);
    } else {
      osc.type = type;
    }
    osc.frequency.value = frequency;
    osc.start();
    return osc;
  };

  // Prime mover: periodic cycle tone plus firing-gated combustion noise.
  const engineMix = createSilentGain(context, mix);
  const engineFilter = createFilter(context, "lowpass", 300, 0.7);
  engineFilter.connect(engineMix);
  const engineCycle = oscillator("sine", AUDIO_ENGINE.idleRpm / 120, createEngineCycleWave(context));
  const engineCycleGain = context.createGain();
  engineCycleGain.gain.value = 0.22;
  engineCycle.connect(engineCycleGain);
  engineCycleGain.connect(engineFilter);

  const combustionFilter = createFilter(context, "bandpass", 600, 0.8);
  const combustionGain = createSilentGain(context, engineFilter);
  const firingPulse = oscillator("sine", AUDIO_ENGINE.idleRpm / 10, createPulseWave(context));
  const firingPulseDepth = context.createGain();
  firingPulseDepth.gain.value = 0;
  noise(brownNoise).connect(combustionFilter);
  combustionFilter.connect(combustionGain);
  firingPulse.connect(firingPulseDepth);
  firingPulseDepth.connect(combustionGain.gain);

  // Turbocharger: lagging whine and intake rush.
  const turboMix = createSilentGain(context, mix);
  const turboTone = oscillator("sine", 1400);
  const turboToneGain = createSilentGain(context, turboMix);
  turboTone.connect(turboToneGain);
  const turboNoiseFilter = createFilter(context, "bandpass", 1200, 2.5);
  const turboNoiseGain = createSilentGain(context, turboMix);
  noise(whiteNoise).connect(turboNoiseFilter);
  turboNoiseFilter.connect(turboNoiseGain);

  // Traction motor gear whine, pitched by road speed.
  const motorMix = createSilentGain(context, mix);
  const motorTone = oscillator("sine", 0, createHarmonicWave(context, [1, 0.35, 0.18, 0.08]));
  motorTone.connect(motorMix);

  // Wheel/rail rolling noise, rail roar, and wind.
  const rumbleMix = createSilentGain(context, mix);
  const rumbleFilter = createFilter(context, "lowpass", 120, 0.6);
  noise(brownNoise).connect(rumbleFilter);
  rumbleFilter.connect(rumbleMix);
  const railMix = createSilentGain(context, mix);
  const railFilter = createFilter(context, "bandpass", 600, 0.6);
  noise(whiteNoise).connect(railFilter);
  railFilter.connect(railMix);
  const windMix = createSilentGain(context, mix);
  const windFilter = createFilter(context, "bandpass", 1200, 0.4);
  noise(whiteNoise).connect(windFilter);
  windFilter.connect(windMix);

  // Flange squeal in tight curves: two inharmonic partials with slow wobble.
  const flangeMix = createSilentGain(context, mix);
  const flangeWobble = oscillator("sine", 5.3);
  const flangeWobbleDepth = context.createGain();
  flangeWobbleDepth.gain.value = 22;
  flangeWobble.connect(flangeWobbleDepth);
  [2900, 4370].forEach((frequency, index) => {
    const partial = oscillator("sine", frequency);
    const partialGain = context.createGain();
    partialGain.gain.value = index === 0 ? 1 : 0.45;
    flangeWobbleDepth.connect(partial.frequency);
    partial.connect(partialGain);
    partialGain.connect(flangeMix);
  });

  // Air brakes: shoe friction, low-speed squeal, and brake pipe/cylinder exhaust.
  const brakeMix = createSilentGain(context, mix);
  const brakeFilter = createFilter(context, "bandpass", 1400, 1.1);
  noise(whiteNoise).connect(brakeFilter);
  brakeFilter.connect(brakeMix);
  const brakeSquealMix = createSilentGain(context, mix);
  const brakeSqueal = oscillator("sine", 3300, createHarmonicWave(context, [1, 0.25, 0.12]));
  const brakeSquealWobble = oscillator("sine", 7.1);
  const brakeSquealWobbleDepth = context.createGain();
  brakeSquealWobbleDepth.gain.value = 35;
  brakeSquealWobble.connect(brakeSquealWobbleDepth);
  brakeSquealWobbleDepth.connect(brakeSqueal.frequency);
  brakeSqueal.connect(brakeSquealMix);
  const hissMix = createSilentGain(context, mix);
  const hissFilter = createFilter(context, "highpass", 3000, 0.7);
  noise(whiteNoise).connect(hissFilter);
  hissFilter.connect(hissMix);

  // Scheduled one-shots: rail joints, coupler slack, derailment.
  const oneShotMix = context.createGain();
  oneShotMix.gain.value = 1;
  oneShotMix.connect(mix);

  // Reward chimes bypass the run master so the final stop still rings out.
  const chimeMix = context.createGain();
  chimeMix.gain.value = 1;
  chimeMix.connect(limiter);

  return {
    context,
    master,
    limiter,
    engineMix,
    engineFilter,
    engineCycle,
    firingPulse,
    firingPulseDepth,
    combustionFilter,
    combustionGain,
    turboMix,
    turboTone,
    turboToneGain,
    turboNoiseFilter,
    turboNoiseGain,
    motorTone,
    motorMix,
    rumbleFilter,
    rumbleMix,
    railFilter,
    railMix,
    windFilter,
    windMix,
    flangeMix,
    brakeFilter,
    brakeMix,
    brakeSqueal,
    brakeSquealMix,
    hissFilter,
    hissMix,
    oneShotMix,
    railJointBuffers: [0, 1, 2].map(() => createRailJointBuffer(context)),
    couplerClunkBuffer: createCouplerClunkBuffer(context),
    crashBuffer: createCrashBuffer(context),
    chimeMix,
    stationResultCount: 0,
    carCount: 0,
    pendingOneShots: 0,
    stateRef: null,
    rpm: AUDIO_ENGINE.idleRpm,
    load: 0,
    turboSpool: 0,
    previousBrake: 0,
    hissLevel: 0,
    hissRelease: false,
    lastDistance: null,
    moving: false,
    derailmentHandled: false,
    roughness: 1,
    roughnessTarget: 1,
    roughnessTimer: 0,
    flangeGate: 0,
    flangeGateTarget: 0,
    flangeGateTimer: 0,
    brakeSquealGate: 1,
    brakeSquealGateTarget: 1,
    brakeSquealGateTimer: 0,
    curvatureSmoothed: 0,
    curveTightnessSmoothed: 0,
  };
}

function playAudioOneShot(audio, buffer, when, gain, playbackRate = 1) {
  if (!audio || !buffer || audio.pendingOneShots >= AUDIO_MAX_PENDING_ONE_SHOTS) {
    return;
  }

  const context = audio.context;
  const source = context.createBufferSource();
  const level = context.createGain();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  level.gain.value = gain;
  source.connect(level);
  level.connect(audio.oneShotMix);
  audio.pendingOneShots += 1;
  source.onended = () => {
    audio.pendingOneShots = Math.max(0, audio.pendingOneShots - 1);
    source.disconnect();
    level.disconnect();
  };
  source.start(Math.max(context.currentTime, when));
}

let audioAxleCache = { consist: null, axles: [] };

// Axle offsets behind the locomotive front, two two-axle bogies per vehicle.
function getAudioAxleOffsets() {
  if (audioAxleCache.consist === TRAIN_CONSIST) {
    return audioAxleCache.axles;
  }

  const axles = [];
  let frontOffset = 0;
  (TRAIN_CONSIST || []).forEach((unit) => {
    const bogieInset = Math.min(unit.length * 0.15, 4.5);
    [bogieInset, unit.length - bogieInset].forEach((bogieCenter) => {
      axles.push(frontOffset + bogieCenter - AUDIO_AXLE_HALF_WHEELBASE);
      axles.push(frontOffset + bogieCenter + AUDIO_AXLE_HALF_WHEELBASE);
    });
    frontOffset += unit.length + COUPLER_GAP;
  });
  audioAxleCache = { consist: TRAIN_CONSIST, axles };
  return axles;
}

function getAudioCouplerCount() {
  return Math.max(0, (TRAIN_CONSIST?.length || 1) - 1);
}

// Schedule each axle crossing a rail joint during the last update, keeping the
// within-frame timing so the "da-dum ... da-dum" pattern stays even.
function scheduleRailJointClicks(audio, previousDistance, distance, dt) {
  const travel = distance - previousDistance;
  if (!(travel > 0) || travel > 60 || dt <= 0) {
    return;
  }

  const now = audio.context.currentTime;
  const speedFactor = clamp(state.speed / 30, 0, 1.4);
  const baseGain = 0.04 + 0.09 * Math.min(speedFactor, 1);
  const playbackBase = 0.9 + 0.12 * Math.min(speedFactor, 1);
  getAudioAxleOffsets().forEach((offset, axleIndex) => {
    const start = previousDistance - offset;
    const end = distance - offset;
    const firstJoint = Math.floor(start / AUDIO_RAIL_JOINT_SPACING) + 1;
    const lastJoint = Math.floor(end / AUDIO_RAIL_JOINT_SPACING);
    for (let joint = firstJoint; joint <= lastJoint; joint += 1) {
      if (joint * AUDIO_RAIL_JOINT_SPACING < 0) {
        continue;
      }
      const fraction = (joint * AUDIO_RAIL_JOINT_SPACING - start) / travel;
      const when = now + 0.06 - (1 - fraction) * dt;
      const attenuation = 1 / (1 + offset / 28);
      const buffer = audio.railJointBuffers[(joint + axleIndex) % audio.railJointBuffers.length];
      playAudioOneShot(
        audio,
        buffer,
        when,
        baseGain * attenuation * (0.85 + Math.random() * 0.3),
        playbackBase * (0.95 + Math.random() * 0.1),
      );
    }
  });
}

// Station chime: soft bell notes with quickly decaying upper partials.
// Excellent stops get a rising major triad, solid stops a rising fourth.
const AUDIO_CHIME_NOTES = {
  excellent: [1046.5, 1318.5, 1568],
  solid: [784, 1046.5],
};

function playStationChime(audio, grade) {
  const notes = AUDIO_CHIME_NOTES[grade];
  if (!audio?.chimeMix || !notes) {
    return;
  }

  const context = audio.context;
  const start = context.currentTime + 0.03;
  notes.forEach((frequency, noteIndex) => {
    const noteStart = start + noteIndex * 0.14;
    const level = noteIndex === notes.length - 1 ? 0.085 : 0.065;
    [[1, 1, 1.4], [2, 0.35, 0.5], [3.01, 0.12, 0.25]].forEach(([ratio, amplitude, decay]) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency * ratio;
      envelope.gain.setValueAtTime(0, noteStart);
      envelope.gain.linearRampToValueAtTime(level * amplitude, noteStart + 0.006);
      envelope.gain.setTargetAtTime(0, noteStart + 0.006, decay / 4);
      oscillator.connect(envelope);
      envelope.connect(audio.chimeMix);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
      };
      oscillator.start(noteStart);
      oscillator.stop(noteStart + decay * 1.6 + 0.05);
    });
  });
}

// Missed station: two short, harsh low buzzes from detuned sawtooths.
function playMissedStationBuzz(audio) {
  if (!audio?.chimeMix) {
    return;
  }

  const context = audio.context;
  const start = context.currentTime + 0.03;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 2;
  filter.connect(audio.chimeMix);
  const end = start + 0.62;
  [0, 0.3].forEach((offset) => {
    const pulseStart = start + offset;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, pulseStart);
    envelope.gain.linearRampToValueAtTime(0.07, pulseStart + 0.01);
    envelope.gain.setValueAtTime(0.07, pulseStart + 0.2);
    envelope.gain.linearRampToValueAtTime(0, pulseStart + 0.24);
    envelope.connect(filter);
    [110, 116.5].forEach((frequency) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = frequency;
      oscillator.connect(envelope);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
      };
      oscillator.start(pulseStart);
      oscillator.stop(pulseStart + 0.25);
    });
  });
  setTimeout(() => filter.disconnect(), (end - context.currentTime + 0.2) * 1000);
}

function playCouplerSlackRun(audio, gain) {
  const now = audio.context.currentTime;
  for (let index = 0; index < getAudioCouplerCount(); index += 1) {
    playAudioOneShot(
      audio,
      audio.couplerClunkBuffer,
      now + 0.18 + index * (0.22 + Math.random() * 0.08),
      gain / (1 + index * 0.5),
      0.9 + Math.random() * 0.2,
    );
  }
}

function stepAudioRandomWalk(audio, valueKey, targetKey, timerKey, dt, minTarget, maxTarget, minHold, maxHold, tau) {
  audio[timerKey] -= dt;
  if (audio[timerKey] <= 0) {
    audio[targetKey] = minTarget + Math.random() * (maxTarget - minTarget);
    audio[timerKey] = minHold + Math.random() * (maxHold - minHold);
  }
  audio[valueKey] += (audio[targetKey] - audio[valueKey]) * (1 - Math.exp(-dt / tau));
  return audio[valueKey];
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
    return Promise.resolve(true);
  } catch (error) {
    console.warn("[audio] Audio warm-up failed.", error);
    return Promise.resolve(false);
  }
}

function ensureGameAudioReady() {
  try {
    if (!gameAudio) {
      gameAudio = createGameAudio();
    }
  } catch (error) {
    console.error("[audio] Audio initialization failed. Continuing without sound.", error);
    gameAudio = null;
  }

  return gameAudio;
}

async function rebuildGameAudioInGesture(trigger = "manual") {
  if (gameAudio?.context) {
    try {
      await gameAudio.context.close();
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
    await primeHtmlAudioUnlock(trigger);
    await audio.context.resume();
    await warmUpAudioContext(audio.context);
  } catch (error) {
    console.error("[audio] Rebuilt context resume failed.", error);
  }

  return audio;
}

async function unlockGameAudioFromGesture(event = null, options = {}) {
  const { forceRetry = false } = options;
  const trigger = event?.type || "manual";

  if (audioUnlockPromise) {
    if (!forceRetry) {
      return audioUnlockPromise;
    }

    await audioUnlockPromise;
    if (gameAudio?.context?.state === "running") {
      return true;
    }
  }

  audioUnlockPromise = (async () => {
    const audio = ensureGameAudioReady();
    if (!audio?.context) {
      return false;
    }

    try {
      if (audio.context.state !== "running") {
        await primeHtmlAudioUnlock(trigger);
        await audio.context.resume();
      }

      await warmUpAudioContext(audio.context);

      if (audio.context.state !== "running") {
        await rebuildGameAudioInGesture(trigger);
        if (gameAudio?.context?.state !== "running") {
          await primeHtmlAudioUnlock(`${trigger}-reprime`);
          await gameAudio?.context?.resume?.();
        }
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
        return true;
      }
    } catch (error) {
      console.error("[audio] Gesture-driven audio unlock failed.", error);
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
  configureAudioSession();
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
    const audio = gameAudio;
    const activeRun = state.started && !state.finished;
    const masterLevel = activeRun ? 1 : 0;
    setAudioParam(audio.master.gain, masterLevel, 0.2);

    if (audio.stateRef !== state) {
      // New run: reset transient history so restart does not click or hiss.
      audio.stateRef = state;
      audio.lastDistance = null;
      audio.rpm = AUDIO_ENGINE.idleRpm;
      audio.turboSpool = 0;
      audio.previousBrake = 0;
      audio.hissLevel = 0;
      audio.moving = false;
      audio.derailmentHandled = false;
      audio.stationResultCount = state.stationResults?.length || 0;
      audio.carCount = state.carCount || 0;
    }

    const contextRunning = audio.context.state === "running";
    // Newly coupled cars: one clunk per coupler, front to back.
    if ((state.carCount || 0) > audio.carCount) {
      const added = state.carCount - audio.carCount;
      audio.carCount = state.carCount;
      if (contextRunning) {
        const now = audio.context.currentTime;
        for (let index = 0; index < added; index += 1) {
          playAudioOneShot(audio, audio.couplerClunkBuffer, now + 0.45 + index * 0.35, 0.18, 0.85 + Math.random() * 0.2);
        }
      }
    }
    const stationResults = state.stationResults || [];
    if (stationResults.length > audio.stationResultCount) {
      const newResults = stationResults.slice(audio.stationResultCount);
      audio.stationResultCount = stationResults.length;
      const best = newResults
        .filter((result) => !result.missed)
        .map((result) => getStationStopGrade(result.error))
        .find((grade) => grade === "excellent" || grade === "solid");
      if (contextRunning && newResults.some((result) => result.missed)) {
        playMissedStationBuzz(audio);
      } else if (best && contextRunning) {
        playStationChime(audio, best);
      }
    }
    const derailed = Boolean(state.derailment);
    const speed = Math.max(0, state.speed || 0);
    const throttle = clamp(Math.max(0, state.actualControl), 0, 1);
    const brake = clamp(Math.max(0, -state.actualControl), 0, 1);
    const smoothing = (tau) => (dt > 0 ? 1 - Math.exp(-dt / tau) : 0);

    const routeInfo = route && !derailed ? evaluateRoute(state.distance) : null;
    const curvature = Math.abs(routeInfo?.curvature || 0);
    audio.curvatureSmoothed += (curvature - audio.curvatureSmoothed) * smoothing(0.28);
    const curveRadius = audio.curvatureSmoothed > 1e-6 ? 1 / audio.curvatureSmoothed : Infinity;
    const curveTightness = Number.isFinite(curveRadius)
      ? clamp(
        (TUNING.route.broadCurveRadiusMax - curveRadius)
          / Math.max(TUNING.route.broadCurveRadiusMax - TUNING.route.sharpCurveRadiusMin, 1e-6),
        0,
        1,
      )
      : 0;
    audio.curveTightnessSmoothed = curveTightness;

    // Prime mover and turbo are simulated (state.engineRpm/turboSpool) so the
    // turbo whine matches the top band of power it unlocks.
    const engine = TUNING.engine;
    audio.rpm = state.engineRpm ?? engine.idleRpm;
    const rpmNorm = (audio.rpm - engine.idleRpm) / (engine.fullRpm - engine.idleRpm);
    const load = state.engineLoad ?? 0;
    const cycleHz = audio.rpm / 120;
    const firingHz = cycleHz * AUDIO_ENGINE.cylinders;

    setAudioParam(audio.engineCycle.frequency, cycleHz, 0.05);
    setAudioParam(audio.firingPulse.frequency, firingHz, 0.05);
    setAudioParam(audio.engineMix.gain, activeRun ? 0.2 + rpmNorm * 0.1 + load * 0.14 : 0, 0.15);
    setAudioParam(audio.engineFilter.frequency, 240 + rpmNorm * 480 + load * 820, 0.15);
    const combustionLevel = 0.35 + load * 0.35 + rpmNorm * 0.1;
    setAudioParam(audio.combustionGain.gain, combustionLevel, 0.1);
    setAudioParam(audio.firingPulseDepth.gain, combustionLevel * 0.9, 0.1);
    setAudioParam(audio.combustionFilter.frequency, 420 + rpmNorm * 500 + load * 300, 0.15);

    // Turbo spools with exhaust energy and lags several seconds behind.
    audio.turboSpool = state.turboSpool ?? 0;
    const turboHz = 1300 + audio.turboSpool * 4300;
    setAudioParam(audio.turboTone.frequency, turboHz, 0.2);
    setAudioParam(audio.turboToneGain.gain, Math.pow(audio.turboSpool, 2) * 0.006, 0.2);
    setAudioParam(audio.turboNoiseFilter.frequency, turboHz * 0.55, 0.2);
    setAudioParam(audio.turboNoiseGain.gain, audio.turboSpool * 0.05, 0.2);
    setAudioParam(audio.turboMix.gain, activeRun ? 1 : 0, 0.2);

    // Traction motors: pitch follows wheel speed; louder under tractive load.
    const motorPresence = clamp(speed / 2.5, 0, 1);
    setAudioParam(audio.motorTone.frequency, Math.max(1, speed * AUDIO_GEAR_MESH_HZ_PER_MPS), 0.06);
    setAudioParam(
      audio.motorMix.gain,
      activeRun && !derailed ? motorPresence * (0.003 + load * 0.012) * (1 - clamp((speed - 60) / 60, 0, 0.6)) : 0,
      0.12,
    );

    // Rolling noise grows with speed; rail roughness drifts slowly.
    const roughness = stepAudioRandomWalk(
      audio, "roughness", "roughnessTarget", "roughnessTimer", dt, 0.75, 1.25, 0.8, 2.6, 0.6,
    );
    const rollSpeed = clamp(speed / 40, 0, 2.3);
    const rolling = activeRun && !derailed && speed > 0.05;
    setAudioParam(
      audio.rumbleMix.gain,
      rolling ? 0.2 * Math.pow(Math.min(rollSpeed, 1.6), 0.85) * roughness : 0,
      0.14,
    );
    setAudioParam(audio.rumbleFilter.frequency, 80 + Math.min(rollSpeed, 2) * 150, 0.2);
    setAudioParam(
      audio.railMix.gain,
      rolling ? 0.12 * Math.pow(Math.min(rollSpeed, 1.8), 1.3) * roughness * (1 + curveTightness * 0.4) : 0,
      0.14,
    );
    setAudioParam(audio.railFilter.frequency, 450 + speed * 18 + curveTightness * 500, 0.2);
    const windAmount = clamp((speed - 22) / 60, 0, 1);
    setAudioParam(audio.windMix.gain, rolling ? 0.12 * windAmount * windAmount : 0, 0.3);
    setAudioParam(audio.windFilter.frequency, 800 + speed * 14, 0.3);

    // Flange squeal: tight radius, moderate speed, intermittent.
    const flangeGate = stepAudioRandomWalk(
      audio, "flangeGate", "flangeGateTarget", "flangeGateTimer", dt, 0, 1, 0.25, 1.4, 0.12,
    );
    const flangeTightness = Number.isFinite(curveRadius) ? clamp((420 - curveRadius) / 260, 0, 1) : 0;
    const flangeSpeed = clamp(speed / 6, 0, 1) * clamp((50 - speed) / 25, 0, 1);
    setAudioParam(
      audio.flangeMix.gain,
      rolling ? 0.018 * Math.pow(flangeTightness, 1.5) * flangeSpeed * flangeGate * flangeGate : 0,
      0.08,
    );

    // Brake shoe friction and low-speed squeal just before stopping.
    const braking = activeRun && !derailed;
    setAudioParam(
      audio.brakeMix.gain,
      braking ? brake * clamp(speed / 4, 0, 1) * (0.06 + 0.1 * Math.min(speed / 40, 1.5)) : 0,
      0.06,
    );
    setAudioParam(audio.brakeFilter.frequency, 900 + Math.min(speed, 80) * 25, 0.1);
    const squealGate = stepAudioRandomWalk(
      audio, "brakeSquealGate", "brakeSquealGateTarget", "brakeSquealGateTimer", dt, 0.3, 1, 0.15, 0.6, 0.1,
    );
    const squealSpeed = clamp(speed / 0.4, 0, 1) * clamp((7 - speed) / 5, 0, 1);
    setAudioParam(
      audio.brakeSquealMix.gain,
      braking ? 0.02 * Math.pow(brake, 0.7) * squealSpeed * squealGate : 0,
      0.05,
    );
    setAudioParam(audio.brakeSqueal.frequency, 3150 + speed * 40, 0.2);

    // Air exhaust while brake cylinders fill (application) or vent (release).
    if (dt > 0) {
      const brakeRate = (brake - audio.previousBrake) / dt;
      const hissTarget = clamp(Math.abs(brakeRate) * 4, 0, 1);
      if (hissTarget > audio.hissLevel) {
        audio.hissLevel += (hissTarget - audio.hissLevel) * smoothing(0.05);
        audio.hissRelease = brakeRate < 0;
      } else {
        audio.hissLevel += (hissTarget - audio.hissLevel) * smoothing(0.6);
      }
    }
    audio.previousBrake = brake;
    setAudioParam(audio.hissMix.gain, braking ? audio.hissLevel * (audio.hissRelease ? 0.045 : 0.03) : 0, 0.05);
    setAudioParam(audio.hissFilter.frequency, audio.hissRelease ? 2200 : 3600, 0.1);

    // Discrete events only make sense while audio time is advancing.
    if (contextRunning && activeRun) {
      if (derailed && !audio.derailmentHandled) {
        audio.derailmentHandled = true;
        playAudioOneShot(audio, audio.crashBuffer, audio.context.currentTime, 0.9, 1);
      }

      if (!derailed) {
        if (audio.lastDistance !== null && speed > 0.3) {
          scheduleRailJointClicks(audio, audio.lastDistance, state.distance, dt);
        }

        // Slack runs out when pulling away and runs in when stopping.
        if (!audio.moving && speed > 0.15 && throttle > 0.05) {
          audio.moving = true;
          playCouplerSlackRun(audio, 0.16);
        } else if (audio.moving && speed < 0.02) {
          audio.moving = false;
          playCouplerSlackRun(audio, 0.1);
          audio.hissLevel = Math.max(audio.hissLevel, brake > 0.05 ? 0.5 : 0);
          audio.hissRelease = true;
        } else if (!audio.moving && speed > 0.15) {
          audio.moving = true;
        }
      }
    }
    audio.lastDistance = state.distance;
  } catch (error) {
    console.error("[audio] Audio update failed. Continuing without sound.", error);
    gameAudio = null;
  }
}
