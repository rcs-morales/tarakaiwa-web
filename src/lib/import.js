import {
  parseJSON, parseCSV, parseExcel, ensureXLSXLoaded
} from './parser.js';
import { showImportStatus } from './ui.js';
import { importDeck } from './decks.svelte.js';

/**
 * Handle the file import process.
 * @param {Event} event
 */
export async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  const fileName = file.name.toLowerCase();
  const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

  reader.onload = async (e) => {
    try {
      let qa;

      if (isExcel) {
        await ensureXLSXLoaded();
        qa = parseExcel(e.target.result);
      } else {
        const content = e.target.result;
        if (fileName.endsWith('.json')) {
          qa = parseJSON(content);
        } else if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
          qa = parseCSV(content);
        } else {
          throw new Error('Unsupported file format. Use JSON, CSV, or Excel.');
        }
      }

      if (!Array.isArray(qa) || qa.length === 0) {
        throw new Error('No valid Q&A data found in file');
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
      showImportStatus('❌ Import failed: ' + error.message, 'error');
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

  event.target.value = '';
}
