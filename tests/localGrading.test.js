import { describe, it, expect } from 'vitest';
import { analyzeAnswerCompleteness, isCorrectLocal, normalizeForGradingComparison, detectProhibitionFormMismatch, hasMeaningfulBreakdownError, groundBreakdownItem, gradingTextsEquivalent } from '../src/ai/localGrading.js';
import { katakanaToHiragana, transcriptToFurigana } from '../src/parser.js';

const CLASS_ANSWER = 'はい。すこし はなすことが できます。まいにち クラスで かいわ れんしゅう していますから。';
const CLASS_TRANSCRIPT_HIRA = 'はい。すこし はなすことが できます。まいにち くらすで かいわ れんしゅう していますから。';

describe('analyzeAnswerCompleteness', () => {
  it('does not flag identical answers ending in から as incomplete', () => {
    const result = analyzeAnswerCompleteness(
      'test',
      CLASS_ANSWER,
      CLASS_TRANSCRIPT_HIRA,
      transcriptToFurigana,
      katakanaToHiragana
    );
    expect(result.incomplete).toBe(false);
    expect(result.reason).toBe('');
  });

  it('still flags answers that truly end on a dangling particle', () => {
    const result = analyzeAnswerCompleteness(
      'test',
      '学校に行きます。',
      '学校に',
      transcriptToFurigana,
      katakanaToHiragana
    );
    expect(result.incomplete).toBe(true);
  });
});

describe('normalizeForGradingComparison', () => {
  it('normalizes kanji and numeral variants to the same reading', () => {
    expect(normalizeForGradingComparison('一週間に、一回は')).toBe(
      normalizeForGradingComparison('いしゅうかんに　いっかいは')
    );
    expect(normalizeForGradingComparison('8つくらいの')).toBe(
      normalizeForGradingComparison('やっつくらいの')
    );
    expect(normalizeForGradingComparison('漢字のかきかた')).toBe(
      normalizeForGradingComparison('かんじのかきかた')
    );
  });

  it('treats STT vowel elongation and katakana loanwords as equivalent', () => {
    const answer = 'しゅみは イラストです。Stylizedのイラストを かくことができます。';
    const transcript = 'しゅうみはいらすとです。Stylizedのいらすとを かくことができます。';
    expect(gradingTextsEquivalent(answer, transcript)).toBe(true);
  });

  it('treats minute counters as equivalent across numeral and kana forms', () => {
    expect(normalizeForGradingComparison('3分')).toBe(normalizeForGradingComparison('三分'));
    expect(normalizeForGradingComparison('3分')).toBe(normalizeForGradingComparison('さんぶん'));
    expect(normalizeForGradingComparison('3分')).toBe(normalizeForGradingComparison('さんぷん'));
  });

  it('accepts convenience-store answer with hiragana minutes and omitted あるいて', () => {
    const answer = 'はい、あります。 うちから コンビニまで あるいて 3分かかります。 いつも たべものと のみものを かっています。';
    const transcript = 'はい、あります。 うちから こんびにまで さんぶんかかります。 いつも たべものと のみものを かっています。';
    expect(gradingTextsEquivalent(answer, transcript)).toBe(true);
  });
});

describe('groundBreakdownItem', () => {
  it('replaces hallucinated katakana with the student hiragana', () => {
    const transcript = 'しゅうみはいらすとです。Stylizedのいらすとを かくことができます。';
    const grounded = groundBreakdownItem({
      original: 'シュウミ',
      corrected: 'しゅみ',
      category: 'Vocabulary',
      explanation: 'Wrong hobby word.'
    }, transcript);
    expect(grounded?.original).toBe('しゅうみ');
  });
});

describe('isCorrectLocal', () => {
  it('accepts hiragana loanword when answer uses katakana', async () => {
    const result = await isCorrectLocal(CLASS_TRANSCRIPT_HIRA, CLASS_ANSWER, 'test');
    expect(result.correct).toBe(true);
    expect(result.score).toBe(100);
  });

  it('accepts STT vowel elongation and hiragana loanwords', async () => {
    const answer = 'しゅみは イラストです。Stylizedのイラストを かくことができます。';
    const transcript = 'しゅうみはいらすとです。Stylizedのいらすとを かくことができます。';
    const result = await isCorrectLocal(transcript, answer, 'しゅみは なんですか。');
    expect(result.correct).toBe(true);
  });

  it('accepts minute numeral variants in a full answer', async () => {
    const answer = 'はい、あります。 うちから コンビニまで あるいて 3分かかります。 いつも たべものと のみものを かっています。';
    const transcript = 'はい、あります。 うちから こんびにまで さんぷんかかります。 いつも たべものと のみものを かっています。';
    const result = await isCorrectLocal(transcript, answer, 'こんびには ありますか。');
    expect(result.correct).toBe(true);
  });

  it('rejects incorrect prohibition grammar', async () => {
    const answer = 'いいえ、じむしょは きんえんです。かいしゃのひとは すってはいけませんが そとで すってもいいです。';
    const transcript = 'いえ、じむしょは きえんです。かいしゃのひとは すってもいきませんが そとで すってもいいです。';
    const result = await isCorrectLocal(transcript, answer, 'たばこを すっても いいですか。');
    expect(result.correct).toBe(false);
    expect(result.grammarNotes).toMatch(/prohibition/i);
  });
});

describe('detectProhibitionFormMismatch', () => {
  it('flags てもいきません instead of てはいけません', () => {
    const answer = 'すってはいけません';
    const transcript = 'すってもいきません';
    expect(detectProhibitionFormMismatch(answer, transcript)).toBe(true);
  });
});

describe('hasMeaningfulBreakdownError', () => {
  const isScriptOnly = () => false;

  it('treats vocabulary kana errors as meaningful', () => {
    const breakdown = [{
      original: 'きえんです',
      corrected: 'きんえんです',
      category: 'Vocabulary',
      explanation: 'Wrong kana for non-smoking.'
    }];
    expect(hasMeaningfulBreakdownError(breakdown, isScriptOnly)).toBe(true);
  });
});
