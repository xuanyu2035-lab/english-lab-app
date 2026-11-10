import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { blankify, firstLetters, sectionSentences, sentencesUpTo, validateContentPack } from '../src/content';

const sample = JSON.parse(readFileSync('public/sample-content.json', 'utf8'));
const privPath = 'private/content.json';
const origPath = 'private/英语农场_词库数据.json';
const hasPrivate = existsSync(privPath);

describe('content pack validation (sample)', () => {
  it('accepts the bundled fictional sample', () => {
    const v = validateContentPack(sample);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });
  it('rejects non-objects and missing real_tasks', () => {
    expect(validateContentPack(null).ok).toBe(false);
    expect(validateContentPack({}).ok).toBe(false);
  });
  it('rejects duplicate sentence numbers', () => {
    const bad = structuredClone(sample);
    bad.real_tasks.self_intro.sentences[1].no = 1;
    expect(validateContentPack(bad).ok).toBe(false);
  });
  it('rejects a section pointing at a missing sentence', () => {
    const bad = structuredClone(sample);
    bad.real_tasks.speech_4104.sections[0].sentence_nos.push(99);
    expect(validateContentPack(bad).ok).toBe(false);
  });
  it('rejects duplicate vocabulary IDs (part-no)', () => {
    const bad = structuredClone(sample);
    bad.items.push({ ...bad.items[0] });
    expect(validateContentPack(bad).errors.join()).toContain('school-1');
  });
  it('does not alter any text', () => {
    const v = validateContentPack(sample);
    expect(v.pack!.real_tasks.self_intro.sentences).toEqual(sample.real_tasks.self_intro.sentences);
    expect(v.pack!.items).toEqual(sample.items);
  });
});

describe.skipIf(!hasPrivate)('Owner private content pack', () => {
  const raw = hasPrivate ? JSON.parse(readFileSync(privPath, 'utf8')) : null;
  it('validates with no errors and no warnings', () => {
    const v = validateContentPack(raw);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });
  it('has 13 self-intro and 32 speech sentences, 335 items', () => {
    expect(raw.real_tasks.self_intro.sentences).toHaveLength(13);
    expect(raw.real_tasks.speech_4104.sentences).toHaveLength(32);
    expect(raw.items).toHaveLength(335);
  });
  it('item IDs (part-no) are unique', () => {
    const ids = raw.items.map((i: { part: string; no: number }) => `${i.part}-${i.no}`);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('sections cover every sentence exactly once', () => {
    for (const k of ['self_intro', 'speech_4104']) {
      const s = raw.real_tasks[k];
      const all = s.sections.flatMap((x: { sentence_nos: number[] }) => x.sentence_nos).sort((a: number, b: number) => a - b);
      expect(all).toEqual(s.sentences.map((x: { no: number }) => x.no).sort((a: number, b: number) => a - b));
    }
  });
  it('4104 has no blank_keys (we never invent any)', () => {
    expect(raw.real_tasks.speech_4104.sentences.every((s: { blank_keys: string[] }) => s.blank_keys.length === 0)).toBe(true);
  });
  it('import does not change the original text', () => {
    const v = validateContentPack(raw);
    expect(v.pack!.real_tasks.self_intro.sentences).toEqual(raw.real_tasks.self_intro.sentences);
    expect(v.pack!.real_tasks.speech_4104.sentences).toEqual(raw.real_tasks.speech_4104.sentences);
    expect(v.pack!.items).toEqual(raw.items);
  });
  it.skipIf(!existsSync(origPath))('content.json equals the untouched original file', () => {
    expect(raw).toEqual(JSON.parse(readFileSync(origPath, 'utf8')));
  });
  it('every blank key is found as a word in its sentence', () => {
    for (const s of raw.real_tasks.self_intro.sentences) {
      const blanks = blankify(s.en, s.blank_keys).filter((x) => x.blank).length;
      expect(blanks).toBeGreaterThanOrEqual(s.blank_keys.length);
    }
  });
});

describe('sentence helpers', () => {
  const pack = validateContentPack(sample).pack!;
  const si = pack.real_tasks.self_intro;
  it('sectionSentences / sentencesUpTo', () => {
    expect(sectionSentences(si, 2).map((s) => s.no)).toEqual([3, 4]);
    expect(sentencesUpTo(si, 2).map((s) => s.no)).toEqual([1, 2, 3, 4]);
    expect(sentencesUpTo(si, 1).map((s) => s.no)).toEqual([1, 2]);
  });
  it('blankify blanks listed words, keeps punctuation', () => {
    const segs = blankify('We sail the little boat today.', ['sail', 'today']);
    expect(segs.filter((s) => s.blank).map((s) => s.text)).toEqual(['sail', 'today.']);
    expect(segs.map((s) => s.text).join('')).toBe('We sail the little boat today.');
  });
  it('blankify handles phrases', () => {
    const segs = blankify('I walk in the garden.', ['in the garden']);
    expect(segs.filter((s) => s.blank).map((s) => s.text)).toEqual(['in', 'the', 'garden.']);
  });
  it('firstLetters keeps first letter and punctuation', () => {
    expect(firstLetters('Hello there, Sam.')).toBe('H____ t____, S__.');
  });
});
