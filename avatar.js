import { AVATAR_MODELS } from './data.js';

let live2dModel = null;
let live2dApp = null;
let isAvatarSpeaking = false;
let avatarMotionTimer = null;
let avatarMotionIndex = 0;
let originalShouldRequestIdleMotion = null;

export function getAvatarModelName() {
  return localStorage.getItem('avatar_model') || 'simple';
}

export function saveAvatarModel() {
  const select = document.getElementById('avatar-model-select');
  if (!select) return;
  localStorage.setItem('avatar_model', select.value);
}

export function getAvatarModelConfig(name = getAvatarModelName()) {
  return AVATAR_MODELS[name] || AVATAR_MODELS.simple;
}

export async function initLive2D() {
  const container = document.getElementById('avatar-container');
  if (!container) return;

  const avatarConfig = getAvatarModelConfig();

  try {
    if (live2dApp) {
      live2dApp.destroy(true, { children: true, texture: true, baseTexture: true });
    }
    container.innerHTML = '';

    live2dApp = new PIXI.Application({
      width: 400,
      height: 400,
      backgroundAlpha: 0,
      antialias: true,
    });
    container.appendChild(live2dApp.view);

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

    live2dModel = model;

    const motionManager = model.internalModel && model.internalModel.motionManager;
    if (motionManager && motionManager.state) {
      originalShouldRequestIdleMotion = motionManager.state.shouldRequestIdleMotion.bind(motionManager.state);
      motionManager.state.shouldRequestIdleMotion = () => !isAvatarSpeaking && originalShouldRequestIdleMotion();
    }
    motionManager && motionManager.stopAllMotions();

    live2dApp.stage.addChild(model);

    model.scale.set(0.32);
    model.anchor.set(0.5, 0.5);
    model.position.set(live2dApp.screen.width / 2, live2dApp.screen.height * 0.7);

    model.internalModel.on('beforeModelUpdate', () => {
      if (isAvatarSpeaking && live2dModel && live2dModel.internalModel && live2dModel.internalModel.coreModel) {
        const mouthOpen = Math.sin(Date.now() * 0.015) * 0.5 + 0.5;
        live2dModel.internalModel.coreModel.setParameterValueById('PARAM_MOUTH_OPEN_Y', mouthOpen);
      } else if (live2dModel && live2dModel.internalModel && live2dModel.internalModel.coreModel) {
        live2dModel.internalModel.coreModel.setParameterValueById('PARAM_MOUTH_OPEN_Y', 0);
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
    'PARAM_MOUTH_OPEN_Y'
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
  } catch (_) {}
}

export function startAvatarMotionLoop() {
  if (!live2dModel || !live2dModel.internalModel || !live2dModel.internalModel.motionManager) {
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

    live2dModel.motion(group, 0).catch((error) => {
      console.warn(`Failed to start avatar motion ${group}:`, error);
    });

    const intervalMs = 5000 + Math.floor(Math.random() * 3000);
    avatarMotionTimer = setTimeout(playNextMotion, intervalMs);
  };

  playNextMotion();
}

export function toggleSpeaking(speaking) {
  isAvatarSpeaking = speaking;

  const motionManager = live2dModel && live2dModel.internalModel && live2dModel.internalModel.motionManager;
  const state = motionManager && motionManager.state;

  if (state && originalShouldRequestIdleMotion) {
    state.shouldRequestIdleMotion = () => !isAvatarSpeaking && originalShouldRequestIdleMotion();
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
