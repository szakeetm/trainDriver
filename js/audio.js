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
    return null;
  }

  configureAudioSession();
  const context = new AudioContextClass();
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
        speedNorm > 0.005
          ? Math.pow(speedNorm, 1.12) * (0.22 + curveTightnessSmooth * 0.14)
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
  } catch (error) {
    console.error("[audio] Audio update failed. Continuing without sound.", error);
    gameAudio = null;
  }
}

