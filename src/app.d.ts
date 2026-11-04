// Ambient types for the app. See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    interface Platform {
      // Cloudflare bindings exposed by adapter-cloudflare (absent in `vite dev`).
      env?: {
        GROQ_API_KEY?: string;
        SUPABASE_URL?: string;
        SUPABASE_SERVICE_ROLE_KEY?: string;
      };
    }
  }

  interface Window {
    // Web Speech API — not in TypeScript's DOM lib yet; Chrome/Edge ship it
    // prefixed. Typed loosely because only feature detection and a few calls
    // are used.
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
    // pixi.js v6 global that pixi-live2d-display expects (see pixi-shim.js).
    PIXI?: any;
  }

  // Set on window by pixi-shim.js and read as a bare global by avatar.js.
  var PIXI: any;
}

export {};
