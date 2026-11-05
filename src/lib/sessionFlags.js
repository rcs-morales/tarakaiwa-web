/** Shared practice-session flags (kept separate to avoid circular imports with stt.js). */
let isChecking = false;

export function getIsChecking() {
  return isChecking;
}

/** @param {boolean} value */
export function setIsChecking(value) {
  isChecking = value;
}
