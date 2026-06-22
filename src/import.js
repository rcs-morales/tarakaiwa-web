import { DEFAULT_QA } from './data.js';
import {
  parseJSON, parseCSV, parseExcel, ensureXLSXLoaded
} from './parser.js';
import { hasGroqApiKey } from './ai/index.js';
import {
  updateQACount, updateStartButton, updateSetupAccess, showImportStatus
} from './ui.js';
import { get, set, remove, KEYS } from './settings.js';
import { setQA } from './session.js';

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
      updateQACount(qa.length);
      updateStartButton(qa.length);
      updateSetupAccess(get(KEYS.SETUP_COMPLETE) === '1');
      showImportStatus('✅ Successfully imported ' + qa.length + ' question' + (qa.length !== 1 ? 's' : '') + ' from ' + file.name, 'success');


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
  updateSetupAccess(get(KEYS.SETUP_COMPLETE) === '1');
  showImportStatus('🗑 Database cleared. Import a Q&A file to begin practice.', 'info');
  const fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.value = '';
}
