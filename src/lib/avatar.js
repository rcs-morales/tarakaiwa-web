// PIXI + Live2D (about 1 MB) load on demand in initAvatar() — only when the
// Live2D avatar is actually shown — so they stay out of the startup bundle.
import { AVATAR_MODELS } from './data.js';
import { get, KEYS } from './settings.js';
import { avatarView, voicevoxCharacterFor, getAvatarCanvasHost } from './avatarView.svelte.js';

// PIXI and pixi-live2d-display are untyped globals here (see app.d.ts).
/** @type {any} A Live2DModel */
let live2dModel = null;
/** @type {any} A PIXI.Application */
let live2dApp = null;
let isAvatarSpeaking = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let avatarMotionTimer = null;
let avatarMotionIndex = 0;
/** @type {(() => boolean) | null} */
let originalShouldRequestIdleMotion = null;
// Bumped by every initAvatar() call, so a slow Live2D load that a newer call
// (or a switch to VOICEVOX) superseded doesn't land on top of it.
let initGeneration = 0;

export function getAvatarModelName() {
  return get(KEYS.AVATAR_MODEL) ?? 'simple';
}

/** @param {string} [name] */
export function getAvatarModelConfig(name = getAvatarModelName()) {
  return AVATAR_MODELS[name] || AVATAR_MODELS.simple;
}

/** @param {number} value 0 (closed) – 1 (open) */
function setAvatarMouthOpen(value) {
  const avatarConfig = getAvatarModelConfig();
  const coreModel = live2dModel && live2dModel.internalModel && live2dModel.internalModel.coreModel;
  if (!coreModel) return;

  const mouthParamIds = avatarConfig.mouthParamIds || ['PARAM_MOUTH_OPEN_Y', 'ParamMouthOpenY'];
  for (const paramId of mouthParamIds) {
    try {
      coreModel.setParameterValueById(paramId, value);
    } catch (_) {
      // Some models use Cubism default IDs, others use PascalCase IDs.
    }
  }
}

function keepAvatarFocusCentered() {
  const avatarConfig = getAvatarModelConfig();
  if (!avatarConfig.disablePointerTracking || !live2dModel) return;

  try {
    if (typeof live2dModel.focus === 'function') {
      live2dModel.focus(0, 0);
    }
  } catch (_) { }

  const coreModel = live2dModel.internalModel && live2dModel.internalModel.coreModel;
  if (!coreModel) return;

  const focusParams = [
    'PARAM_ANGLE_X', 'PARAM_ANGLE_Y', 'PARAM_ANGLE_Z',
    'PARAM_BODY_ANGLE_X', 'PARAM_BODY_ANGLE_Y', 'PARAM_BODY_ANGLE_Z',
    'PARAM_EYE_BALL_X', 'PARAM_EYE_BALL_Y',
    'ParamAngleX', 'ParamAngleY', 'ParamAngleZ',
    'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ',
    'ParamEyeBallX', 'ParamEyeBallY'
  ];

  for (const paramId of focusParams) {
    try {
      coreModel.setParameterValueById(paramId, 0);
    } catch (_) { }
  }
}

/** @type {Promise<unknown> | null} */
let live2dRuntime = null;

/**
 * Load PIXI + Live2D, which set the PIXI / PIXI.live2d globals (see
 * live2d-shim.js). Overlapping callers share one load; a failed load (e.g.
 * offline) is forgotten so the next initAvatar() tries again.
 */
function loadLive2DRuntime() {
  live2dRuntime ??= import('./live2d-shim.js').catch((error) => {
    live2dRuntime = null;
    throw error;
  });
  return live2dRuntime;
}

function destroyLive2D() {
  if (live2dApp) {
    // removeView: true also takes the canvas out of the host element.
    live2dApp.destroy(true, { children: true, texture: true, baseTexture: true });
    live2dApp = null;
  }
  live2dModel = null;
}

// The avatar frame (Practice.svelte) renders from avatarView: the VOICEVOX
// character image, or the Live2D canvas this mounts into the canvas host.
export async function initAvatar() {
  const host = getAvatarCanvasHost();
  if (!host) return;
  const generation = ++initGeneration;

  const ttsMode = get(KEYS.TTS_MODE);

  if (ttsMode === 'voicevox') {
    destroyLive2D();
    avatarView.character = voicevoxCharacterFor(get(KEYS.VOICEVOX_SPEAKER));
    avatarView.mode = 'voicevox';
    return;
  }

  avatarView.mode = 'live2d';

  const avatarConfig = getAvatarModelConfig();

  try {
    destroyLive2D();
    host.replaceChildren();

    await loadLive2DRuntime();
    // A newer initAvatar() (or a switch to VOICEVOX) took over meanwhile.
    if (generation !== initGeneration) return;

    const app = new PIXI.Application({
      width: 400,
      height: 400,
      backgroundAlpha: 0,
      antialias: true,
    });
    live2dApp = app;
    host.appendChild(app.view);

    const modelPaths = avatarConfig.paths;

    let model = null;
    for (const modelPath of modelPaths) {
      try {
        model = await PIXI.live2d.Live2DModel.from(modelPath);
        break;
      } catch (pathError) {
        console.warn(`Live2D model path failed: ${modelPath}`, pathError);
      }
    }

    if (!model) {
      throw new Error('Failed to load Live2D model from all configured paths.');
    }

    if (generation !== initGeneration) {
      // A newer initAvatar() took over while this model loaded (and has
      // already torn down this call's app).
      model.destroy();
      return;
    }

    live2dModel = model;
    if (avatarConfig.disablePointerTracking) {
      model.autoInteract = false;
      model.interactive = false;
      model.interactiveChildren = false;
    }

    const motionManager = model.internalModel && model.internalModel.motionManager;
    if (motionManager && motionManager.state) {
      const original = motionManager.state.shouldRequestIdleMotion.bind(motionManager.state);
      originalShouldRequestIdleMotion = original;
      motionManager.state.shouldRequestIdleMotion = () => !isAvatarSpeaking && original();
    }
    motionManager && motionManager.stopAllMotions();

    app.stage.addChild(model);

    const scale = avatarConfig.scale || 0.32;
    const yOffset = avatarConfig.yOffset || 0.7;

    model.scale.set(scale);
    model.anchor.set(0.5, 0.5);
    model.position.set(app.screen.width / 2, app.screen.height * yOffset);

    model.internalModel.on('beforeModelUpdate', () => {
      keepAvatarFocusCentered();
      if (isAvatarSpeaking && live2dModel && live2dModel.internalModel && live2dModel.internalModel.coreModel) {
        const mouthOpen = Math.sin(Date.now() * 0.015) * 0.5 + 0.5;
        setAvatarMouthOpen(mouthOpen);
      } else if (live2dModel && live2dModel.internalModel && live2dModel.internalModel.coreModel) {
        setAvatarMouthOpen(0);
      }
    });

    console.log('Live2D Avatar initialized successfully');
  } catch (e) {
    console.error('Live2D initialization failed:', e);
  }
}

export function clearAvatarMotionLoop() {
  if (avatarMotionTimer) {
    clearTimeout(avatarMotionTimer);
    avatarMotionTimer = null;
  }
}

export function resetAvatarPose() {
  const coreModel = live2dModel && live2dModel.internalModel && live2dModel.internalModel.coreModel;
  if (!coreModel) return;

  const neutralParams = [
    'PARAM_ANGLE_X', 'PARAM_ANGLE_Y', 'PARAM_ANGLE_Z',
    'PARAM_BODY_ANGLE_X', 'PARAM_BODY_ANGLE_Y', 'PARAM_BODY_ANGLE_Z',
    'PARAM_EYE_BALL_X', 'PARAM_EYE_BALL_Y', 'PARAM_EYE_L_OPEN', 'PARAM_EYE_R_OPEN',
    'PARAM_MOUTH_OPEN_Y', 'ParamMouthOpenY'
  ];

  for (const paramId of neutralParams) {
    try {
      coreModel.setParameterValueById(paramId, 0);
    } catch (_) {
      // Ignore unsupported parameter IDs on some models.
    }
  }

  try {
    const motionManager = live2dModel && live2dModel.internalModel && live2dModel.internalModel.motionManager;
    motionManager && motionManager.stopAllMotions();
  } catch (_) { }
}

export function startAvatarMotionLoop() {
  if (!live2dModel || !live2dModel.internalModel || !live2dModel.internalModel.motionManager) {
    return;
  }

  const avatarConfig = getAvatarModelConfig();
  if (avatarConfig.disableRandomMotions) {
    return;
  }

  const motionManager = live2dModel.internalModel.motionManager;
  const motionGroups = Object.keys(motionManager.definitions || {});

  if (!motionGroups.length) {
    return;
  }

  clearAvatarMotionLoop();
  avatarMotionIndex = 0;

  const playNextMotion = () => {
    if (isAvatarSpeaking || !live2dModel || !live2dModel.internalModel || !live2dModel.internalModel.motionManager) {
      return;
    }

    const manager = live2dModel.internalModel.motionManager;
    const groups = Object.keys(manager.definitions || {});
    if (!groups.length) {
      return;
    }

    const group = groups[avatarMotionIndex % groups.length];
    avatarMotionIndex += 1;

    manager.stopAllMotions();

    live2dModel.motion(group, 0).catch((/** @type {unknown} */ error) => {
      console.warn(`Failed to start avatar motion ${group}:`, error);
    });

    const intervalMs = 5000 + Math.floor(Math.random() * 3000);
    avatarMotionTimer = setTimeout(playNextMotion, intervalMs);
  };

  playNextMotion();
}

/** @param {boolean} speaking */
export function toggleSpeaking(speaking) {
  isAvatarSpeaking = speaking;
  avatarView.speaking = !!speaking; // the VOICEVOX image bounces

  const motionManager = live2dModel && live2dModel.internalModel && live2dModel.internalModel.motionManager;
  const state = motionManager && motionManager.state;

  const original = originalShouldRequestIdleMotion;
  if (state && original) {
    state.shouldRequestIdleMotion = () => !isAvatarSpeaking && original();
  }

  if (!motionManager) {
    return;
  }

  if (speaking) {
    clearAvatarMotionLoop();
    motionManager.stopAllMotions();
    return;
  }

  startAvatarMotionLoop();
}
