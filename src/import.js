import { DEFAULT_QA } from './data.js';
import {
  parseJSON, parseCSV, parseExcel, ensureXLSXLoaded
} from './parser.js';
import { hasGroqApiKey } from './ai/index.js';
import {
  updateQACount, updateStartButton, updateSetupAccess, showImportStatus
} from './ui.js';
import { set, remove, KEYS } from './settings.js';
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
      updateSetupAccess(hasGroqApiKey() && qa.length > 0);
      showImportStatus('✅ Successfully imported ' + qa.length + ' question' + (qa.length !== 1 ? 's' : '') + ' from ' + file.name, 'success');

      // Setup flow "Next" button logic
      const importSection = document.getElementById('import-section');
      if (importSection && !importSection.classList.contains('hidden')) {
        const btnContainer = document.createElement('div');
        btnContainer.id = 'setup-next-import-container';
        btnContainer.style.marginTop = '20px';
        btnContainer.style.textAlign = 'right';
        btnContainer.innerHTML = `<button class="btn btn-primary" id="btn-setup-next-import">Next: AI Settings →</button>`;

        const existing = document.getElementById('setup-next-import-container');
        if (existing) existing.remove();

        importSection.appendChild(btnContainer);

        // We'll need to bind the click event to nextSetupStep
        // Since we are removing inline handlers, we'll do it via an event listener
        // We'll let app.js handle this if it's a bootstrap function, or we can import it here.
        // For now, I'll leave the ID and let app.js bind it.
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
  updateSetupAccess(false);
  showImportStatus('🗑 Database cleared. Import a Q&A file to begin practice.', 'info');
  const fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.value = '';
}
