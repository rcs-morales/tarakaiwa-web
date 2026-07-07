// jsdom under Node 26 / vitest 4 does not expose Web Storage (window.localStorage
// is undefined even with a non-opaque origin). The app is local-first and reads
// localStorage everywhere, so provide a spec-compliant in-memory Storage when the
// environment is missing one. No-op when a real localStorage is present.
class MemoryStorage {
  #map = new Map();
  get length() { return this.#map.size; }
  key(i) { return [...this.#map.keys()][i] ?? null; }
  getItem(k) { return this.#map.has(String(k)) ? this.#map.get(String(k)) : null; }
  setItem(k, v) { this.#map.set(String(k), String(v)); }
  removeItem(k) { this.#map.delete(String(k)); }
  clear() { this.#map.clear(); }
}

function ensureStorage(target, name) {
  if (!target) return;
  let ok = false;
  try { ok = typeof target[name]?.getItem === 'function'; } catch { ok = false; }
  if (ok) return;
  Object.defineProperty(target, name, {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}

ensureStorage(globalThis, 'localStorage');
ensureStorage(globalThis, 'sessionStorage');
if (globalThis.window && globalThis.window !== globalThis) {
  ensureStorage(globalThis.window, 'localStorage');
  ensureStorage(globalThis.window, 'sessionStorage');
}
