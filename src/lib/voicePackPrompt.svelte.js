// Tiny cross-module bridge: startPractice() in session.svelte.js (not a
// component) needs to ask the user a yes/no question before proceeding when
// the Voicevox cache isn't fully warmed yet. The actual dialog lives in
// VoicePackWarningModal.svelte (mounted once in +page.svelte); this module
// is just the shared reactive state + the promise that lets startPractice()
// await the user's answer.
export const voicePackPrompt = $state({ open: false, cached: 0, total: 0 });

let pendingResolve = null;

/** Opens the prompt and resolves once the user answers (true = continue anyway). */
export function requestVoicePackConfirmation(cached, total) {
  return new Promise((resolve) => {
    voicePackPrompt.cached = cached;
    voicePackPrompt.total = total;
    voicePackPrompt.open = true;
    pendingResolve = resolve;
  });
}

export function answerVoicePackPrompt(continueAnyway) {
  voicePackPrompt.open = false;
  const resolve = pendingResolve;
  pendingResolve = null;
  if (resolve) resolve(continueAnyway);
}
