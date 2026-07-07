import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseJSON,
  parseCSV,
  katakanaToHiragana,
  toInt,
  numberToHiragana,
  transcriptToFurigana,
  applyKanjiMap,
  toFuriganaHtml,
} from '../src/lib/parser.js';

describe('parseJSON', () => {
  it('parses q/a objects', () => {
    const qa = parseJSON('[{"q": "Question?", "a": "Answer."}]');
    expect(qa).toEqual([{ q: 'Question?', a: 'Answer.' }]);
  });

  it('accepts question/answer field aliases', () => {
    const qa = parseJSON('[{"question": "Q", "answer": "A"}]');
    expect(qa).toEqual([{ q: 'Q', a: 'A' }]);
  });

  it('rejects non-array JSON', () => {
    expect(() => parseJSON('{"q":"x","a":"y"}')).toThrow(/array/i);
  });

  it('rejects items missing q or a', () => {
    expect(() => parseJSON('[{"q":"only question"}]')).toThrow(/q.*a/i);
  });
});

describe('parseCSV', () => {
  it('parses header and data rows', () => {
    const qa = parseCSV('question,answer\nWhat?,Reply.');
    expect(qa).toEqual([{ q: 'What?', a: 'Reply.' }]);
  });

  it('handles quoted commas', () => {
    const qa = parseCSV('q,a\n"Hello, world","Yes, please"');
    expect(qa).toEqual([{ q: 'Hello, world', a: 'Yes, please' }]);
  });

  it('requires at least one data row', () => {
    expect(() => parseCSV('q,a')).toThrow(/at least 2 rows/i);
  });
});

describe('katakanaToHiragana', () => {
  it('converts katakana to hiragana', () => {
    expect(katakanaToHiragana('ガッコウ')).toBe('がっこう');
  });

  it('leaves non-katakana unchanged', () => {
    expect(katakanaToHiragana('abc123')).toBe('abc123');
  });
});

describe('toInt', () => {
  it('parses arabic numerals', () => {
    expect(toInt('12')).toBe(12);
  });

  it('parses kanji numerals', () => {
    expect(toInt('十二')).toBe(12);
  });
});

describe('numberToHiragana', () => {
  it('converts small numbers', () => {
    expect(numberToHiragana(3)).toBe('さん');
  });

  it('converts teens', () => {
    expect(numberToHiragana(12)).toBe('じゅうに');
  });
});

describe('applyKanjiMap', () => {
  it('replaces known kanji phrases', () => {
    expect(applyKanjiMap('学校', 1)).toBe('がっこう');
  });
});

describe('transcriptToFurigana', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => 'N5',
      setItem: vi.fn(),
    });
  });

  it('converts common kanji in transcripts', () => {
    expect(transcriptToFurigana('学校')).toBe('がっこう');
  });

  it('converts date patterns', () => {
    expect(transcriptToFurigana('9月12日')).toBe('くがつじゅうににち');
  });

  it('converts hitotsu counters from arabic numerals', () => {
    expect(transcriptToFurigana('8つ')).toBe('やっつ');
  });
});

describe('toFuriganaHtml', () => {
  it('renders AI furigana markers as ruby tags', () => {
    expect(toFuriganaHtml('1日{いちにち}')).toBe('<ruby>1日<rt>いちにち</rt></ruby>');
  });

  it('renders romaji reading hints as plain text (romaji is shown separately)', () => {
    const html = toFuriganaHtml('電車', 'densha');
    expect(html).toContain('電車');
    expect(html).not.toContain('<ruby');
  });

  it('wraps purely Japanese furigana tokens in ruby', () => {
    expect(toFuriganaHtml('今日{きょう}')).toBe('<ruby>今日<rt>きょう</rt></ruby>');
  });

  it('keeps trailing particles inside the ruby base with their reading', () => {
    expect(toFuriganaHtml('日本語を{にほんごを}')).toBe('<ruby>日本語を<rt>にほんごを</rt></ruby>');
  });
});
