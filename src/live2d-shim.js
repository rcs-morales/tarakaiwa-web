// ─────────────────────────────────────────────
// LIVE2D GLOBAL SHIM
// ─────────────────────────────────────────────
// Must import pixi-shim first: window.PIXI has to exist before
// pixi-live2d-display evaluates (it reads window.PIXI.Ticker).
import './pixi-shim.js';
import * as live2d from 'pixi-live2d-display/cubism4';

window.PIXI.live2d = live2d;
