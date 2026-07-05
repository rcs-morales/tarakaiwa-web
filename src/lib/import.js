import { DEFAULT_QA } from './data.js';
import {
  parseJSON, parseCSV, parseExcel, ensureXLSXLoaded
} from './parser.js';
import {
  updateQACount, updateStartButton, showImportStatus
} from './ui.js';
import { set, remove, KEYS } from './settings.js';
import { setQA } from './session.js';
import { pushDeck } from './sync.js';

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

      setQA(qa);
      set(KEYS.QA_DATA, JSON.stringify(qa));
      // Mark the local deck as changed NOW, so sync never lets an older remote
      // deck overwrite this import even if the upload below is interrupted.
      localStorage.setItem(KEYS.DECK_UPDATED_AT, new Date().toISOString());
      updateQACount(qa.length);
      updateStartButton(qa.length);
      showImportStatus('✅ Successfully imported ' + qa.length + ' question' + (qa.length !== 1 ? 's' : '') + ' from ' + file.name, 'success');
      // Let app.js warm the Voicevox cache / refresh the voice-pack indicator
      // (dispatched as an event to avoid an import cycle with app.js).
      window.dispatchEvent(new CustomEvent('deck-imported'));

      // Dual-write to the cloud when signed in (null = logged out, fine).
      const pushed = await pushDeck(qa, file.name);
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

/**
 * Clear the imported Q&A database from localStorage and state.
 */
export function clearDatabase() {
  remove(KEYS.QA_DATA);
  setQA([]);
  updateQACount(0);
  updateStartButton(0);
  showImportStatus('🗑 Database cleared. Import a Q&A file to begin practice.', 'info');
  const fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.value = '';
}
