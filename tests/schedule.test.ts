import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateContentPack } from '../src/content';
import { addDays, daysBetween } from '../src/dates';
import {
  allDueReviews, applyRating, completeReview, daysLeft, dueReview, markLearnedIfDone, nextReviewDate, sectionStatus, sprintMode, suggestedNewSections,
} from '../src/schedule';
import { DEFAULT_SETTINGS, emptyProgress, sectionKey, sentenceId } from '../src/types';
import type { Progress, ScriptId } from '../src/types';

const pack = validateContentPack(JSON.parse(readFileSync('public/sample-content.json', 'utf8'))).pack!;
const scr = { self_intro: pack.real_tasks.self_intro, speech_4104: pack.real_tasks.speech_4104 };
const OFFS = [0, 1, 3, 6];

describe('dates', () => {
  it('addDays / daysBetween', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-10', '2026-11-24')).toBe(14);
  });
});

describe('script review schedule 0/1/3/6', () => {
  const learned = '2026-11-10';
  const sec = { learnedDay: learned, reviews: {} as Record<string, string> };
  it('day 0 review is due the same day', () => {
    expect(dueReview(sec, '2026-11-10', OFFS)).toMatchObject({ offset: 0, overdueDays: 0 });
  });
  it('next reviews fall on day+1, +3, +6 (2nd, 4th, 7th day)', () => {
    let s = { ...sec, reviews: { '0': '2026-11-10' } as Record<string, string> };
    expect(dueReview(s, '2026-11-10', OFFS)).toBeNull();
    expect(nextReviewDate(s, OFFS)).toBe('2026-11-11');
    expect(dueReview(s, '2026-11-11', OFFS)!.offset).toBe(1);
    s = { ...s, reviews: { ...s.reviews, '1': '2026-11-11' } };
    expect(nextReviewDate(s, OFFS)).toBe('2026-11-13');
    expect(dueReview(s, '2026-11-12', OFFS)).toBeNull();
    expect(dueReview(s, '2026-11-13', OFFS)!.offset).toBe(3);
    s = { ...s, reviews: { ...s.reviews, '3': '2026-11-13' } };
    expect(nextReviewDate(s, OFFS)).toBe('2026-11-16');
    expect(dueReview(s, '2026-11-16', OFFS)!.offset).toBe(6);
    s = { ...s, reviews: { ...s.reviews, '6': '2026-11-16' } };
    expect(dueReview(s, '2026-11-30', OFFS)).toBeNull();
    expect(nextReviewDate(s, OFFS)).toBeNull();
  });
  it('overdue reviews stay due and report how late', () => {
    expect(dueReview({ ...sec, reviews: { '0': learned } }, '2026-11-15', OFFS)).toMatchObject({ offset: 1, overdueDays: 4 });
  });
  it('not learned → nothing due', () => {
    expect(dueReview({ reviews: {} }, '2026-11-10', OFFS)).toBeNull();
  });
  it('completeReview records the date; allDueReviews lists due sections', () => {
    let p: Progress = { ...emptyProgress(), sections: { [sectionKey('self_intro', 1)]: { learnedDay: '2026-11-10', reviews: {} } } };
    expect(allDueReviews(p, scr, '2026-11-10', OFFS)).toHaveLength(1);
    p = completeReview(p, 'self_intro', 1, 0, '2026-11-10');
    expect(allDueReviews(p, scr, '2026-11-10', OFFS)).toHaveLength(0);
    expect(allDueReviews(p, scr, '2026-11-11', OFFS)[0].offset).toBe(1);
  });
});

describe('level ladder L1→L4', () => {
  const start = { level: 1, passedL4: false, n: 0 };
  it('smooth climbs, stuck stays, blank drops', () => {
    let sp = applyRating(start, 1, 'smooth'); expect(sp.level).toBe(2);
    sp = applyRating(sp, 2, 'stuck'); expect(sp.level).toBe(2);
    sp = applyRating(sp, 2, 'smooth'); expect(sp.level).toBe(3);
    sp = applyRating(sp, 3, 'blank'); expect(sp.level).toBe(2);
    sp = applyRating({ ...sp, level: 4 }, 4, 'smooth'); expect(sp.passedL4).toBe(true);
    sp = applyRating(sp, 4, 'blank'); expect(sp.passedL4).toBe(false); expect(sp.level).toBe(3);
  });
  it('never goes below L1', () => {
    expect(applyRating(start, 1, 'blank').level).toBe(1);
  });
});

describe('section status and learned stamp', () => {
  const pass = (p: Progress, id: ScriptId, no: number): Progress => ({ ...p, sentences: { ...p.sentences, [sentenceId(id, no)]: { level: 4, passedL4: true, n: 3 } } });
  it('new → learning → solid, learnedDay stamped once, then unstable on slip', () => {
    let p = emptyProgress();
    expect(sectionStatus(p, 'self_intro', scr.self_intro, 1)).toBe('new');
    p = { ...p, sentences: { [sentenceId('self_intro', 1)]: { level: 2, passedL4: false, n: 1 } } };
    expect(sectionStatus(p, 'self_intro', scr.self_intro, 1)).toBe('learning');
    p = pass(pass(p, 'self_intro', 1), 'self_intro', 2);
    p = markLearnedIfDone(p, 'self_intro', scr.self_intro, 1, '2026-11-10');
    expect(sectionStatus(p, 'self_intro', scr.self_intro, 1)).toBe('solid');
    p = markLearnedIfDone(p, 'self_intro', scr.self_intro, 1, '2026-11-20');
    expect(p.sections[sectionKey('self_intro', 1)].learnedDay).toBe('2026-11-10');
    p = { ...p, sentences: { ...p.sentences, [sentenceId('self_intro', 2)]: { level: 3, passedL4: false, n: 4 } } };
    expect(sectionStatus(p, 'self_intro', scr.self_intro, 1)).toBe('unstable');
  });
});

describe('countdown and sprint mode', () => {
  const base = { ...DEFAULT_SETTINGS, setupDate: '2026-11-10' };
  it('unknown dates default to 14 days after setup', () => {
    expect(daysLeft(base, 'self_intro', '2026-11-10')).toBe(14);
    expect(daysLeft(base, 'speech_4104', '2026-11-20')).toBe(4);
  });
  it('sprint mode within 3 days of either date', () => {
    expect(sprintMode(base, '2026-11-10')).toBe(false);
    expect(sprintMode(base, '2026-11-21')).toBe(true);
    expect(sprintMode({ ...base, interviewDate: '2026-12-01', presentDate: '2026-12-15' }, '2026-11-30')).toBe(true);
    expect(sprintMode({ ...base, interviewDate: '2026-12-01', presentDate: '2026-12-15' }, '2026-12-02')).toBe(false);
  });
  it('suggested new sections is between 1 and the number of sections', () => {
    const n = suggestedNewSections(emptyProgress(), 'self_intro', scr.self_intro, base, '2026-11-10');
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(scr.self_intro.sections.length);
  });
});
