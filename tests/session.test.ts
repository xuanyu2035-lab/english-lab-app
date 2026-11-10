import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBackup, importBackup, exportBackup, parseBackup } from '../src/backup';
import { kvAll, kvSet, resetDbHandle } from '../src/db';
import { KIND_LABEL, planSession, scriptShare, splitLong, totalMinutes } from '../src/plan';
import type { Minutes } from '../src/plan';
import { buildQueue } from '../src/screens/session';
import { loadState, saveContent, saveProgress, saveSettings, state } from '../src/store';
import { emptyProgress, sectionKey, sentenceId } from '../src/types';
import { todayStr } from '../src/dates';

const sample = JSON.parse(readFileSync('public/sample-content.json', 'utf8'));
const MINS: Minutes[] = [30, 60, 90, 120];

describe('session plan', () => {
  it('each length adds up exactly to the chosen minutes', () => {
    for (const m of MINS) {
      expect(totalMinutes(planSession(m, false))).toBe(m);
      expect(totalMinutes(planSession(m, true))).toBe(m);
    }
  });
  it('30 minutes: script new 15 → script review 10 → vocabulary 5', () => {
    expect(planSession(30, false).map((b) => [b.kind, b.minutes])).toEqual([['script-new', 15], ['script-review', 10], ['vocab-new', 5]]);
  });
  it('60 minutes: script 25 (split) → vocab new 15 → review 10 → compose 10', () => {
    const p = planSession(60, false);
    expect(p.filter((b) => b.kind === 'script-new').reduce((a, b) => a + b.minutes, 0)).toBe(25);
    expect(p.map((b) => b.kind)).toEqual(['script-new', 'script-new', 'vocab-new', 'review', 'compose']);
  });
  it('90/120 add full-run, vocab review and error→correct cards', () => {
    for (const m of [90, 120] as Minutes[]) {
      const kinds = planSession(m, false).map((b) => b.kind);
      expect(kinds).toContain('full-run');
      expect(kinds).toContain('vocab-review');
      expect(kinds).toContain('fixes');
    }
  });
  it('no segment is longer than 15 minutes', () => {
    for (const m of MINS) for (const sp of [false, true]) planSession(m, sp).forEach((b) => expect(b.minutes).toBeLessThanOrEqual(15));
  });
  it('splitLong keeps the total', () => {
    expect(totalMinutes(splitLong([{ kind: 'script-new', minutes: 30, label: '' }]))).toBe(30);
    expect(splitLong([{ kind: 'script-new', minutes: 25, label: '' }]).map((b) => b.minutes)).toEqual([13, 12]);
  });
  it('sprint (≤3 days) puts at least 70% on the scripts', () => {
    for (const m of MINS) expect(scriptShare(planSession(m, true))).toBeGreaterThanOrEqual(0.7);
  });
  it('normal plan is not a sprint', () => {
    expect(scriptShare(planSession(60, false))).toBeLessThan(0.7);
  });
  it('every kind has a label', () => {
    for (const m of MINS) planSession(m, false).forEach((b) => expect(KIND_LABEL[b.kind]).toBe(b.label));
  });
});

describe('segment queues', () => {
  beforeEach(async () => {
    resetDbHandle();
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
    await loadState();
    await saveContent(sample);
    await saveSettings({ onboarded: true, setupDate: todayStr() });
  });
  it('new-content queue lists unfinished sections, soonest deadline first', () => {
    const q = buildQueue('script-new');
    expect(q).toHaveLength(4);
    expect(q[0]).toMatch(/^\/script\/(self_intro|speech_4104)\/learn\/1$/);
  });
  it('review queue lists due reviews, otherwise falls back to chaining what is learned', async () => {
    const today = todayStr();
    expect(buildQueue('script-review')).toEqual([]);
    const p = {
      ...emptyProgress(),
      sentences: { [sentenceId('self_intro', 1)]: { level: 4, passedL4: true, n: 3 }, [sentenceId('self_intro', 2)]: { level: 4, passedL4: true, n: 3 } },
      sections: { [sectionKey('self_intro', 1)]: { learnedDay: today, reviews: {} } },
    };
    await saveProgress(p);
    expect(buildQueue('script-review')).toEqual(['/script/self_intro/review/1/0']);
    await saveProgress({ ...p, sections: { [sectionKey('self_intro', 1)]: { learnedDay: today, reviews: { '0': today } } } });
    expect(buildQueue('script-review')).toEqual(['/script/self_intro/chain/1']);
  });
  it('full-run uses the whole script once every section is solid', async () => {
    const sentences: Record<string, { level: number; passedL4: boolean; n: number }> = {};
    for (const n of [1, 2, 3, 4]) sentences[sentenceId('self_intro', n)] = { level: 4, passedL4: true, n: 1 };
    await saveProgress({ ...emptyProgress(), sentences });
    expect(buildQueue('full-run')).toEqual(['/script/self_intro/full']);
  });
  it('segments with nothing to do give an empty queue (they are skipped)', () => {
    expect(buildQueue('vocab-review')).toEqual([]); // nothing learned yet → nothing due
    expect(buildQueue('compose')).toEqual(['/compose/mix']);
    void state;
  });
});

describe('progress export / import', () => {
  beforeEach(() => { resetDbHandle(); (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory(); });
  it('round trip restores progress and settings exactly, never the content pack', async () => {
    await loadState();
    await saveContent(sample);
    await saveSettings({ minutes: 120, interviewDate: '2026-12-05', onboarded: true });
    const p = { ...emptyProgress(), sentences: { 'self_intro-2': { level: 3, passedL4: false, n: 5 } }, checklist: { 'self_intro:0': true } };
    await saveProgress(p);
    const backup = await exportBackup();
    expect(Object.keys(backup.data)).not.toContain('content');
    const before = await kvAll();
    // wipe and restore on a "new device"
    resetDbHandle(); (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
    await kvSet('progress', emptyProgress());
    await importBackup(JSON.parse(JSON.stringify(backup)));
    const after = await kvAll();
    expect(after.progress).toEqual(before.progress);
    expect(after.settings).toEqual(before.settings);
    expect(after.content).toBeUndefined();
  });
  it('rejects files that are not EnglishLab backups', async () => {
    expect(parseBackup({ foo: 1 }).ok).toBe(false);
    expect(parseBackup(null).ok).toBe(false);
    expect(parseBackup({ app: 'english-lab', version: 99, data: {} }).ok).toBe(false);
    await expect(importBackup({ app: 'other' })).rejects.toThrow();
  });
  it('buildBackup drops the content key', () => {
    expect(buildBackup({ content: { a: 1 }, progress: { b: 2 } }).data).toEqual({ progress: { b: 2 } });
  });
});
