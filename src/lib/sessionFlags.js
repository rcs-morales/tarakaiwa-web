/** Shared practice-session flags (kept separate to avoid circular imports with stt.js). */
let isChecking = false;

export function getIsChecking() {
  return isChecking;
}

export function setIsChecking(value) {
  isChecking = value;
}
