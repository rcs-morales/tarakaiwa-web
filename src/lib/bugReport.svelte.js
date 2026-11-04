// Bug report modal: open state + submission to Supabase (bug_reports table,
// screenshots in the bug-screenshots storage bucket). Rendered by
// components/BugReportModal.svelte; opened from the "Report Bug" buttons.

import { supabaseClient } from './supabase.js';
import { get, KEYS } from './settings.js';

export const bugReport = $state({
  open: false,
  submitting: false,
});

export function openBugReport() {
  bugReport.open = true;
}

export function closeBugReport() {
  bugReport.open = false;
}

/**
 * Storage object path for a screenshot. Supabase Storage only accepts a
 * limited ASCII set in object keys, so the user's file name (often non-ASCII,
 * e.g. a Japanese-locale "スクリーンショット ….png") is reduced to safe
 * characters; the timestamp keeps it unique.
 * @param {string} fileName
 * @param {number} [now]
 */
export function screenshotStoragePath(fileName, now = Date.now()) {
  const safe = String(fileName || '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[_.]+/, '')
    .slice(-80);
  return `${now}-${safe || 'screenshot'}`;
}

/**
 * Submit a report. Feedback is shown with alert(), as before.
 * @param {{ message: string, file?: File | null }} report
 * @returns {Promise<boolean>} true when the report was saved
 */
export async function submitBugReport({ message, file }) {
  if (!supabaseClient) {
    alert('Bug reporting is unavailable — Supabase SDK did not load.');
    return false;
  }
  message = (message || '').trim();
  if (!message) {
    alert('Please provide a description of the bug.');
    return false;
  }
  if (bugReport.submitting) return false;

  bugReport.submitting = true;
  try {
    let screenshotUrl = null;
    if (file) {
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('bug-screenshots').upload(screenshotStoragePath(file.name), file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabaseClient.storage.from('bug-screenshots').getPublicUrl(uploadData.path);
      screenshotUrl = urlData.publicUrl;
    }

    const { error: insertError } = await supabaseClient.from('bug_reports').insert({
      message,
      user_agent: navigator.userAgent,
      jlpt_level: get(KEYS.JLPT_LEVEL) || 'Unknown',
      screenshot_url: screenshotUrl,
    });
    if (insertError) throw insertError;

    alert('Thank you! Your report has been submitted.');
    closeBugReport();
    return true;
  } catch (err) {
    console.error('Bug report submission error:', err);
    alert(`Error submitting report: ${err?.message || 'Unknown error'}. Please check your Supabase configuration.`);
    return false;
  } finally {
    bugReport.submitting = false;
  }
}
