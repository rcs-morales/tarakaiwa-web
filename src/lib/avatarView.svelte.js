// What the practice screen's avatar frame shows. In VOICEVOX mode it's a
// still character image (rendered by Practice.svelte from this state); in
// browser-voice mode avatar.js mounts a Live2D (PIXI) canvas into the host
// element Practice.svelte registers with the avatarCanvasHost action.

/** VOICEVOX speaker id → character image in public/assets/.
 * @type {Record<string, string>} */
export const VOICEVOX_CHARACTERS = {
  '3': 'zundamon',
  '2': 'shikoku_metan',
  '8': 'kasukabe_tsumugi',
  '46': 'sayo',
  '13': 'aoyama_ryusei',
  '12': 'shirakami_kotarou',
  '11': 'kurono_takehiro',
};

export const DEFAULT_VOICEVOX_CHARACTER = 'zundamon';

export const avatarView = $state({
  /** @type {'live2d' | 'voicevox'} */
  mode: 'live2d',
  /** VOICEVOX character image name (VOICEVOX mode). */
  character: DEFAULT_VOICEVOX_CHARACTER,
  /** Speech is playing — the VOICEVOX image bounces. */
  speaking: false,
});

/** @param {string | null | undefined} speakerId */
export function voicevoxCharacterFor(speakerId) {
  return VOICEVOX_CHARACTERS[speakerId ?? ''] ?? DEFAULT_VOICEVOX_CHARACTER;
}

/** @type {HTMLElement | null} */
let canvasHost = null;

/**
 * Svelte action for the element the Live2D canvas is mounted into. Svelte
 * never renders children into it — avatar.js owns its contents.
 * @param {HTMLElement} node
 */
export function avatarCanvasHost(node) {
  canvasHost = node;
  return {
    destroy() {
      if (canvasHost === node) canvasHost = null;
    },
  };
}

export function getAvatarCanvasHost() {
  return canvasHost;
}
