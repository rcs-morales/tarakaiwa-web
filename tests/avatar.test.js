import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';

// The real shim loads PIXI + Live2D (not available in jsdom); tests install a
// fake PIXI global instead.
vi.mock('../src/lib/live2d-shim.js', () => ({}));
vi.mock('$lib/session.svelte.js', () => ({
  session: { qa: [], current: 0 },
  endSession: vi.fn(), finishRecording: vi.fn(), checkAnswer: vi.fn(), editTranscript: vi.fn(),
  saveEditedTranscript: vi.fn(), cancelEditTranscript: vi.fn(), rerecordAnswer: vi.fn(),
  nextQuestion: vi.fn(), skipQuestion: vi.fn(), revealAnswerHint: vi.fn(),
  toggleQuestionText: vi.fn(), translateQuestion: vi.fn(), getQuestionRomaji: vi.fn(),
}));

import { initAvatar, toggleSpeaking } from '../src/lib/avatar.js';
import { avatarView, voicevoxCharacterFor } from '../src/lib/avatarView.svelte.js';
import { set, KEYS } from '../src/lib/settings.js';
import Practice from '../src/lib/components/Practice.svelte';

/** Live2DModel.from() calls, resolved by the test. */
let modelLoads = [];

function fakeModel() {
  const noop = () => {};
  return {
    destroy: vi.fn(),
    scale: { set: noop },
    anchor: { set: noop },
    position: { set: noop },
    internalModel: { on: noop, motionManager: null },
  };
}

class FakeApp {
  constructor() {
    this.view = document.createElement('canvas');
    this.stage = { addChild: vi.fn() };
    this.screen = { width: 400, height: 400 };
    FakeApp.instances.push(this);
  }
  destroy(removeView) {
    this.destroyed = true;
    if (removeView) this.view.remove();
  }
}
/** @type {FakeApp[]} */
FakeApp.instances = [];

function render_() {
  const { container } = render(Practice);
  return {
    frame: /** @type {HTMLElement} */ (container.querySelector('#avatar-container')),
    host: /** @type {HTMLElement} */ (container.querySelector('.avatar-canvas-host')),
  };
}

describe('avatar frame', () => {
  beforeEach(() => {
    localStorage.clear();
    modelLoads = [];
    FakeApp.instances = [];
    avatarView.speaking = false;
    globalThis.PIXI = {
      Application: FakeApp,
      live2d: {
        Live2DModel: {
          from: vi.fn(() => new Promise((resolve) => { modelLoads.push(resolve); })),
        },
      },
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    delete globalThis.PIXI;
    vi.restoreAllMocks();
  });

  it('maps VOICEVOX speakers to their character, Zundamon for unknown ones', () => {
    expect(voicevoxCharacterFor('2')).toBe('shikoku_metan');
    expect(voicevoxCharacterFor('999')).toBe('zundamon');
    expect(voicevoxCharacterFor(null)).toBe('zundamon');
  });

  it('shows the VOICEVOX character image, bouncing while speaking', async () => {
    set(KEYS.TTS_MODE, 'voicevox');
    set(KEYS.VOICEVOX_SPEAKER, '8');
    const { frame } = render_();
    await initAvatar();
    flushSync();

    expect(frame.classList.contains('voicevox-mode')).toBe(true);
    const img = /** @type {HTMLImageElement} */ (frame.querySelector('#vv-avatar-img'));
    expect(img.getAttribute('src')).toBe('assets/kasukabe_tsumugi.png');
    expect(img.alt).toBe('kasukabe_tsumugi');
    expect(img.classList.contains('bouncing')).toBe(false);

    toggleSpeaking(true);
    flushSync();
    expect(img.classList.contains('bouncing')).toBe(true);
    toggleSpeaking(false);
    flushSync();
    expect(img.classList.contains('bouncing')).toBe(false);
  });

  it('falls back to Zundamon when a character image is missing', async () => {
    set(KEYS.TTS_MODE, 'voicevox');
    set(KEYS.VOICEVOX_SPEAKER, '46');
    const { frame } = render_();
    await initAvatar();
    flushSync();
    const img = /** @type {HTMLImageElement} */ (frame.querySelector('#vv-avatar-img'));
    img.dispatchEvent(new Event('error'));
    expect(img.src).toMatch(/assets\/zundamon\.png$/);
  });

  it('mounts the Live2D canvas into the host, and removes it for VOICEVOX', async () => {
    set(KEYS.TTS_MODE, 'browser');
    const { frame, host } = render_();
    const loading = initAvatar();
    modelLoads[0](fakeModel());
    await loading;
    flushSync();

    expect(frame.classList.contains('voicevox-mode')).toBe(false);
    expect(frame.querySelector('#vv-avatar-img')).toBeNull();
    expect(host.querySelector('canvas')).toBe(FakeApp.instances[0].view);
    expect(FakeApp.instances[0].stage.addChild).toHaveBeenCalled();

    set(KEYS.TTS_MODE, 'voicevox');
    await initAvatar();
    flushSync();
    expect(FakeApp.instances[0].destroyed).toBe(true);
    expect(host.querySelector('canvas')).toBeNull();
    expect(frame.querySelector('#vv-avatar-img')).not.toBeNull();
  });

  it('drops a Live2D model that finishes loading after a switch to VOICEVOX', async () => {
    set(KEYS.TTS_MODE, 'browser');
    const { frame, host } = render_();
    const slow = initAvatar();

    set(KEYS.TTS_MODE, 'voicevox');
    await initAvatar();

    const model = fakeModel();
    modelLoads[0](model);
    await slow;
    flushSync();

    expect(model.destroy).toHaveBeenCalled();
    expect(FakeApp.instances[0].stage.addChild).not.toHaveBeenCalled();
    expect(host.querySelector('canvas')).toBeNull();
    expect(avatarView.mode).toBe('voicevox');
    expect(frame.querySelector('#vv-avatar-img')).not.toBeNull();
  });

  it('keeps only the newest of two overlapping Live2D loads', async () => {
    set(KEYS.TTS_MODE, 'browser');
    const { host } = render_();
    const first = initAvatar();
    const second = initAvatar();
    const stale = fakeModel();
    const fresh = fakeModel();
    modelLoads[1](fresh);
    await second;
    modelLoads[0](stale);
    await first;

    expect(stale.destroy).toHaveBeenCalled();
    expect(FakeApp.instances[0].destroyed).toBe(true);
    expect(FakeApp.instances[1].stage.addChild).toHaveBeenCalledWith(fresh);
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    expect(host.querySelector('canvas')).toBe(FakeApp.instances[1].view);
  });
});
