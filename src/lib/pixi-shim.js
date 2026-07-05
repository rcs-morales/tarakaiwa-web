// ─────────────────────────────────────────────
// PIXI GLOBAL SHIM
// ─────────────────────────────────────────────
// avatar.js uses the `PIXI` global (PIXI.Application, PIXI.live2d.Live2DModel),
// and pixi-live2d-display reads window.PIXI.Ticker for auto-updating models.
// A plain copy is used because module namespace objects are frozen and
// live2d-shim.js attaches the `live2d` namespace afterwards.
import * as PIXI from 'pixi.js';

window.PIXI = Object.assign({}, PIXI);
