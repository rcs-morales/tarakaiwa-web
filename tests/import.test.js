import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleFileImport, clearDatabase } from '../src/import.js';
import * as ui from '../src/ui.js';
import * as settings from '../src/settings.js';
import * as session from '../src/session.js';
import * as parser from '../src/parser.js';

vi.mock('../src/ui.js', () => ({
  updateQACount: vi.fn(),
  updateStartButton: vi.fn(),
  updateSetupAccess: vi.fn(),
  showImportStatus: vi.fn(),
}));

vi.mock('../src/ai/index.js', () => ({
  hasGroqApiKey: vi.fn(() => false),
}));

vi.mock('../src/settings.js', () => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  KEYS: { QA_DATA: 'qa_data', SETUP_COMPLETE: 'setup_complete' }
}));

vi.mock('../src/session.js', () => ({
  setQA: vi.fn(),
}));

vi.mock('../src/parser.js', () => ({
  parseJSON: vi.fn(),
  parseCSV: vi.fn(),
  parseExcel: vi.fn(),
  ensureXLSXLoaded: vi.fn().mockResolvedValue(true),
}));

describe('Data Import/Export Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <div id="import-section"></div>
      <input id="file-input" type="file" />
    `;
  });

  function createMockEvent(fileName, content) {
    const file = new File([content], fileName, { type: 'text/plain' });
    return {
      target: {
        files: [file],
        value: ''
      }
    };
  }

  it('should successfully import a JSON file', async () => {
    const content = '[{"q": "Hi", "a": "Konnichiwa"}]';
    const event = createMockEvent('test.json', content);
    parser.parseJSON.mockReturnValue(JSON.parse(content));

    // Mock FileReader
    vi.stubGlobal('FileReader', class {
      constructor() {
        this.onload = null;
        this.onerror = null;
      }
      readAsText() {
        if (this.onload) {
          this.onload({ target: { result: content } });
        }
      }
    });

    await handleFileImport(event);

    expect(parser.parseJSON).toHaveBeenCalledWith(content);
    expect(session.setQA).toHaveBeenCalledWith(JSON.parse(content));
    expect(settings.set).toHaveBeenCalledWith(settings.KEYS.QA_DATA, JSON.stringify(JSON.parse(content)));
    expect(ui.showImportStatus).toHaveBeenCalledWith(expect.stringContaining('Successfully imported'), 'success');
  });

  it('should successfully import a CSV file', async () => {
    const content = 'q,a\\nHi,Konnichiwa';
    const event = createMockEvent('test.csv', content);
    const mockQA = [{ q: 'Hi', a: 'Konnichiwa' }];
    parser.parseCSV.mockReturnValue(mockQA);

    vi.stubGlobal('FileReader', class {
      constructor() {
        this.onload = null;
        this.onerror = null;
      }
      readAsText() {
        if (this.onload) {
          this.onload({ target: { result: content } });
        }
      }
    });

    await handleFileImport(event);

    expect(parser.parseCSV).toHaveBeenCalledWith(content);
    expect(session.setQA).toHaveBeenCalledWith(mockQA);
    expect(ui.showImportStatus).toHaveBeenCalledWith(expect.stringContaining('Successfully imported'), 'success');
  });

  it('should handle unsupported file formats', async () => {
    const event = createMockEvent('test.pdf', 'some content');

    vi.stubGlobal('FileReader', class {
      constructor() {
        this.onload = null;
        this.onerror = null;
      }
      readAsText() {
        if (this.onload) {
          this.onload({ target: { result: 'some content' } });
        }
      }
    });

    await handleFileImport(event);

    expect(ui.showImportStatus).toHaveBeenCalledWith(expect.stringContaining('Unsupported file format'), 'error');
  });

  it('should handle malformed data (empty array)', async () => {
    const content = '[]';
    const event = createMockEvent('test.json', content);
    parser.parseJSON.mockReturnValue([]);

    vi.stubGlobal('FileReader', class {
      constructor() {
        this.onload = null;
        this.onerror = null;
      }
      readAsText() {
        if (this.onload) {
          this.onload({ target: { result: content } });
        }
      }
    });

    await handleFileImport(event);

    expect(ui.showImportStatus).toHaveBeenCalledWith(expect.stringContaining('No valid Q&A data found'), 'error');
  });

  it('should clear the database and update UI', () => {
    clearDatabase();
    expect(settings.remove).toHaveBeenCalledWith(settings.KEYS.QA_DATA);
    expect(session.setQA).toHaveBeenCalledWith([]);
    expect(ui.updateQACount).toHaveBeenCalledWith(0);
    expect(ui.updateStartButton).toHaveBeenCalledWith(0);
    expect(ui.showImportStatus).toHaveBeenCalledWith(expect.stringContaining('Database cleared'), 'info');
  });
});
