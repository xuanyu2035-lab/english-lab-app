import { describe, expect, it } from 'vitest';
import { chooseEnglishVoice, listEnglishVoices, voiceScore } from '../src/media';
import type { VoiceLike } from '../src/media';
import { dueReview, nextReviewDate } from '../src/schedule';
import { DEFAULT_SETTINGS } from '../src/types';
import { phasesFor, resolvePhase } from '../src/screens/practice';
import type { Sentence } from '../src/types';

const v = (name: string, lang: string, uri = name): VoiceLike => ({ name, lang, voiceURI: uri });

describe('English voice choice: American first, natural-sounding first', () => {
  const all = [
    v('Daniel', 'en-GB'), v('Google UK English Female', 'en-GB'), v('Alex', 'en-US'),
    v('Microsoft Aria Online (Natural) - English (United States)', 'en-US'), v('Karen', 'en-AU'),
    v('Samantha (Enhanced)', 'en_US'), v('Google 普通话', 'zh-CN'),
  ];
  it('lists only English voices, US natural ones first, British last', () => {
    const names = listEnglishVoices(all).map((x) => x.name);
    expect(names).not.toContain('Google 普通话');
    expect(names.slice(0, 2).sort()).toEqual(['Microsoft Aria Online (Natural) - English (United States)', 'Samantha (Enhanced)'].sort());
    expect(names.indexOf('Alex')).toBe(2);
    expect(names.slice(-2).sort()).toEqual(['Daniel', 'Google UK English Female']);
  });
  it('automatic pick is a Natural/Neural/Enhanced/Premium US voice', () => {
    expect(chooseEnglishVoice(all, null)?.name).toMatch(/Natural|Enhanced/);
    expect(voiceScore(v('Ava (Premium)', 'en-US'))).toBeLessThan(voiceScore(v('Alex', 'en-US')));
    expect(voiceScore(v('Alex', 'en-US'))).toBeLessThan(voiceScore(v('Karen (Premium)', 'en-AU')));
    expect(voiceScore(v('Karen (Premium)', 'en-AU'))).toBeLessThan(voiceScore(v('Daniel (Premium)', 'en-GB')));
  });
  it('never prefers British when an American voice exists', () => {
    expect(chooseEnglishVoice([v('Serena (Premium)', 'en-GB'), v('Alex', 'en-US')], null)?.name).toBe('Alex');
  });
  it('uses British only when there is nothing else', () => {
    expect(chooseEnglishVoice([v('Daniel', 'en-GB')], null)?.name).toBe('Daniel');
    expect(chooseEnglishVoice([v('Google 普通话', 'zh-CN')], null)).toBeUndefined();
  });
  it('keeps a saved choice that still exists, falls back to automatic when it is gone', () => {
    expect(chooseEnglishVoice(all, 'Daniel')?.name).toBe('Daniel');
    expect(chooseEnglishVoice(all, 'Gone')?.name).toMatch(/Natural|Enhanced/);
  });
  it('default speech settings are inside the allowed ranges', () => {
    expect(DEFAULT_SETTINGS.speechRate).toBeGreaterThanOrEqual(0.6);
    expect(DEFAULT_SETTINGS.speechRate).toBeLessThanOrEqual(1.2);
    expect(DEFAULT_SETTINGS.repeatCount).toBe(1);
    expect(DEFAULT_SETTINGS.voiceURI).toBeNull();
  });
});

describe('jumping to any level', () => {
  const base: Sentence = { no: 1, section_no: 1, section: 'S', en: 'Hello there.', zh: '你好', chunks: [], cue: 'greet', blank_keys: ['there'] };
  const noBlank: Sentence = { ...base, blank_keys: [] };
  it('every level the Owner can ask for exists when the sentence has blanks', () => {
    expect(phasesFor(base, false)).toEqual(expect.arrayContaining(['L1', 'L2', 'L3', 'L4']));
    for (const l of ['understand', 'L1', 'L2', 'L3', 'L4'] as const) expect(resolvePhase(base, l, false)).toBe(l);
  });
  it('blank level falls forward to "only the cue" when there are no blanks', () => {
    expect(resolvePhase(noBlank, 'L2', false)).toBe('L3');
    expect(resolvePhase(noBlank, 'L4', false)).toBe('L4');
  });
});

describe('"I know it" sections get fewer reviews', () => {
  const learned = { learnedDay: '2026-05-01', reviews: {} as Record<string, string> };
  const offsets = [0, 1, 3, 6];
  it('normal section: first review is on the learned day', () => {
    expect(dueReview(learned, '2026-05-01', offsets)?.offset).toBe(0);
  });
  it('known section: only the last two review days, nothing on day 0 or 1', () => {
    const k = { ...learned, known: true };
    expect(dueReview(k, '2026-05-01', offsets)).toBeNull();
    expect(dueReview(k, '2026-05-02', offsets)).toBeNull();
    expect(dueReview(k, '2026-05-04', offsets)?.offset).toBe(3);
    expect(nextReviewDate(k, offsets)).toBe('2026-05-04');
    expect(nextReviewDate({ ...k, reviews: { '3': '2026-05-04', '6': '2026-05-07' } }, offsets)).toBeNull();
  });
});
