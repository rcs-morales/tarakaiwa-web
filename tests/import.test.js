import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleFileImport } from '../src/lib/import.js';
import * as ui from '../src/lib/ui.js';
import * as decksModule from '../src/lib/decks.svelte.js';
import * as parser from '../src/lib/parser.js';

vi.mock('../src/lib/ui.js', () => ({
  showImportStatus: vi.fn(),
}));

vi.mock('../src/lib/ai/index.js', () => ({
  hasGroqApiKey: vi.fn(() => false),
}));

vi.mock('../src/lib/decks.svelte.js', () => ({
  importDeck: vi.fn(async () => true),
  MAX_DECK_QUESTIONS: 23,
}));

vi.mock('../src/lib/parser.js', () => ({
  parseJSON: vi.fn(),
  parseCSV: vi.fn(),
  parseExcel: vi.fn(),
  ensureXLSXLoaded: vi.fn().mockResolvedValue(true),
}));

describe('Data Import Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
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
    expect(decksModule.importDeck).toHaveBeenCalledWith(JSON.parse(content), 'test.json');
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
    expect(decksModule.importDeck).toHaveBeenCalledWith(mockQA, 'test.csv');
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

  it('should reject a file with more than the 23-question cap', async () => {
    const qa = Array.from({ length: 24 }, (_, i) => ({ q: `q${i}`, a: `a${i}` }));
    const content = JSON.stringify(qa);
    const event = createMockEvent('big.json', content);
    parser.parseJSON.mockReturnValue(qa);

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

    expect(decksModule.importDeck).not.toHaveBeenCalled();
    expect(ui.showImportStatus).toHaveBeenCalledWith(expect.stringContaining('limited to 23 questions'), 'error');
  });

  it('should report an info status when the cloud push fails', async () => {
    const content = '[{"q": "Hi", "a": "Konnichiwa"}]';
    const event = createMockEvent('test.json', content);
    parser.parseJSON.mockReturnValue(JSON.parse(content));
    decksModule.importDeck.mockResolvedValueOnce(false);

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

    expect(ui.showImportStatus).toHaveBeenCalledWith(expect.stringContaining('cloud sync failed'), 'info');
  });
});
