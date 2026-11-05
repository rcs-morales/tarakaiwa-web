import {
  parseJSON, parseCSV, parseExcel
} from './parser.js';
import { showImportStatus } from './ui.js';
import { importDeck, MAX_DECK_QUESTIONS } from './decks.svelte.js';
import { errorMessage } from './errors.js';

/**
 * Handle the file import process.
 * @param {Event} event
 */
export async function handleFileImport(event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  const fileName = file.name.toLowerCase();
  const isExcel = fileName.endsWith('.xlsx');
  const isLegacyExcel = fileName.endsWith('.xls');

  if (isLegacyExcel) {
    showImportStatus('❌ Import failed: old .xls files aren\'t supported. In Excel, use File → Save As → Excel Workbook (.xlsx) or CSV, then import that file.', 'error');
    input.value = '';
    return;
  }

  reader.onload = async (e) => {
    try {
      const result = e.target?.result ?? null;
      let qa;

      if (isExcel) {
        qa = await parseExcel(/** @type {ArrayBuffer} */ (result));
      } else {
        const content = String(result ?? '');
        if (fileName.endsWith('.json')) {
          qa = parseJSON(content);
        } else if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
          qa = parseCSV(content);
        } else {
          throw new Error('Unsupported file format. Use JSON, CSV, or Excel (.xlsx).');
        }
      }

      if (!Array.isArray(qa) || qa.length === 0) {
        throw new Error('No valid Q&A data found in file');
      }
      if (qa.length > MAX_DECK_QUESTIONS) {
        throw new Error('Decks are limited to ' + MAX_DECK_QUESTIONS + ' questions — this file has ' + qa.length + '. Please split it into smaller decks.');
      }

      showImportStatus('✅ Successfully imported ' + qa.length + ' question' + (qa.length !== 1 ? 's' : '') + ' from ' + file.name, 'success');
      // Let app.js warm the Voicevox cache / refresh the voice-pack indicator
      // (dispatched as an event to avoid an import cycle with app.js).
      window.dispatchEvent(new CustomEvent('deck-imported'));

      // Adds it as a new deck, makes it active, and dual-writes to the cloud
      // when signed in (null = logged out, fine).
      const pushed = await importDeck(qa, file.name);
      if (pushed === false) {
        showImportStatus('✅ Imported ' + qa.length + ' questions (⚠️ cloud sync failed — the deck is saved on this device and will sync on your next sign-in)', 'info');
      }

    } catch (error) {
      showImportStatus('❌ Import failed: ' + errorMessage(error), 'error');
    }
  };

  reader.onerror = () => {
    showImportStatus('❌ Error reading file', 'error');
  };

  if (isExcel) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }

  input.value = '';
}
