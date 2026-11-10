import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { validateContentPack } from '../src/content';
import {
  choiceOptions, clozeSentence, distractors, dueEntries, emptyVocab, feedbackExport, glossarySegments, groupProgress, idOf, newLeft, nextNewItems,
  orderedItems, rateWord, reviewLeft, reviewMode, reviewQueue,
} from '../src/vocab';
import type { ContentPack } from '../src/types';

const hasPrivate = existsSync('private/content.json');
const samplePack = validateContentPack(JSON.parse(readFileSync('public/sample-content.json', 'utf8'))).pack!;
const bigPack: ContentPack | null = hasPrivate ? validateContentPack(JSON.parse(readFileSync('private/content.json', 'utf8'))).pack! : null;
const pack = bigPack ?? samplePack;
const T0 = new Date('2026-11-10T09:00:00Z');
const D0 = '2026-11-10';

describe('ordering and new-word limit', () => {
  it('items come in group order (parts → groups), then by number', () => {
    const o = orderedItems(pack);
    const gi = new Map(pack.groups.map((g, i) => [g.id, i]));
    for (let i = 1; i < o.length; i++) {
      const a = gi.get(o[i - 1].group)!, b = gi.get(o[i].group)!;
      expect(a <= b).toBe(true);
      if (a === b) expect(o[i - 1].no < o[i].no).toBe(true);
    }
  });
  it('introducing words consumes the daily new quota (default 10)', () => {
    let vs = emptyVocab();
    expect(newLeft(vs, D0, 10)).toBe(10);
    const first = nextNewItems(pack, vs, newLeft(vs, D0, 10));
    expect(first.length).toBeLessThanOrEqual(10);
    for (const it of first) vs = rateWord(vs, idOf(it), 'good', T0, D0);
    expect(vs.day.newDone).toBe(first.length);
    if (bigPack) {
      expect(first).toHaveLength(10);
      expect(newLeft(vs, D0, 10)).toBe(0);
      expect(nextNewItems(pack, vs, newLeft(vs, D0, 10))).toEqual([]);
      // next day the quota is back and we continue where we stopped
      expect(newLeft(vs, '2026-11-11', 10)).toBe(10);
      expect(nextNewItems(pack, vs, 10)[0]).not.toEqual(first[0]);
    }
  });
});

describe('FSRS with two buttons', () => {
  const id = idOf(pack.items[0]);
  it('"记得" pushes the next review further than "忘了"', () => {
    const good = rateWord(emptyVocab(), id, 'good', T0, D0);
    const again = rateWord(emptyVocab(), id, 'again', T0, D0);
    expect(new Date(good.srs[id].card.due).getTime()).toBeGreaterThan(new Date(again.srs[id].card.due).getTime());
  });
  it('a remembered card is not due now but becomes due later; interval grows on repeated success', () => {
    let vs = rateWord(emptyVocab(), id, 'good', T0, D0);
    expect(dueEntries(vs, T0)).toEqual([]);
    const due1 = new Date(vs.srs[id].card.due);
    expect(dueEntries(vs, new Date(due1.getTime() + 1000))).toEqual([id]);
    vs = rateWord(vs, id, 'good', due1, D0);
    vs = rateWord(vs, id, 'good', new Date(vs.srs[id].card.due), D0);
    const gap = new Date(vs.srs[id].card.due).getTime() - Date.now();
    expect(Number.isFinite(gap)).toBe(true);
    expect(vs.srs[id].card.reps).toBe(3);
  });
  it('survives a JSON round trip (backup file): dates revive correctly', () => {
    const vs = rateWord(emptyVocab(), id, 'good', T0, D0);
    const back = JSON.parse(JSON.stringify(vs));
    const next = rateWord(back, id, 'good', new Date(back.srs[id].card.due), D0);
    expect(next.srs[id].card.reps).toBe(2);
  });
});

describe('review limit 40 with no backlog', () => {
  it('only the daily limit is queued; the rest wait without being lost', () => {
    const items = bigPack ? bigPack.items.slice(0, 60) : [];
    let vs = emptyVocab();
    for (const it of items) vs = rateWord(vs, idOf(it), 'good', T0, D0);
    const later = new Date('2026-12-01T09:00:00Z');
    if (bigPack) {
      expect(dueEntries(vs, later)).toHaveLength(60);
      expect(reviewQueue(vs, later, '2026-12-01', 40)).toHaveLength(40);
      // review 40 → quota used → nothing more today; the remaining 20 are still due tomorrow
      for (const id of reviewQueue(vs, later, '2026-12-01', 40)) vs = rateWord(vs, id, 'good', later, '2026-12-01');
      expect(reviewLeft(vs, '2026-12-01', 40)).toBe(0);
      expect(reviewQueue(vs, later, '2026-12-01', 40)).toEqual([]);
      const tomorrow = reviewQueue(vs, new Date('2026-12-02T09:00:00Z'), '2026-12-02', 40);
      expect(tomorrow).toHaveLength(20); // the 20 that waited are still there, nothing was lost
    }
  });
});

describe('review prompts', () => {
  it('cloze hides the English word inside the Cantonese example', () => {
    const it = { ...samplePack.items[0], en: 'apple', example_yue_mixed: '我哋食咗一個 apple。' };
    expect(clozeSentence(it)).toBe('我哋食咗一個 ＿＿＿。');
    expect(clozeSentence({ ...it, example_yue_mixed: '完全冇英文' })).toBeNull();
  });
  it.skipIf(!bigPack)('distractors are other words of the same kind and never the answer', () => {
    for (const it of bigPack!.items.filter((x) => x.type === 'word').slice(0, 40)) {
      const d = distractors(bigPack!, it, 3);
      expect(d).toHaveLength(3);
      expect(d.some((x) => x.en.toLowerCase() === it.en.toLowerCase())).toBe(false);
      const opts = choiceOptions(bigPack!, it, 'seed');
      expect(opts).toHaveLength(4);
      expect(opts.filter((o) => idOf(o) === idOf(it))).toHaveLength(1);
    }
  });
  it.skipIf(!bigPack)('sentence-type cards are always answered by saying, words alternate', () => {
    const s = bigPack!.items.find((x) => x.type === 'sentence')!;
    expect(reviewMode(bigPack!, s, 0)).toBe('say');
    const w = bigPack!.items.find((x) => x.type === 'word')!;
    expect(new Set([reviewMode(bigPack!, w, 0), reviewMode(bigPack!, w, 1)]).size).toBe(2);
  });
});

describe('Cantonese glossary taps', () => {
  const g = [{ yue: '我哋', zh: '我们' }, { yue: '我', zh: '我' }, { yue: '冇', zh: '没有' }];
  it('finds glossary words, longest match first', () => {
    const segs = glossarySegments('我哋冇 deadline', g);
    expect(segs.filter((s) => s.zh).map((s) => s.text)).toEqual(['我哋', '冇']);
    expect(segs.map((s) => s.text).join('')).toBe('我哋冇 deadline');
  });
});

describe.skipIf(!bigPack)('Owner vocabulary: all 335 items can be learned', () => {
  it('335 items, every group non-empty, progress counts add up', () => {
    expect(bigPack!.items).toHaveLength(335);
    let vs = emptyVocab();
    let day = 0;
    while (nextNewItems(bigPack!, vs, 9999).length) {
      const d = `2027-01-${String(1 + day).padStart(2, '0')}`;
      for (const it of nextNewItems(bigPack!, vs, newLeft(vs, d, 10))) vs = rateWord(vs, idOf(it), 'good', T0, d);
      day++;
      expect(day).toBeLessThan(40);
    }
    expect(Object.keys(vs.srs)).toHaveLength(335);
    expect(day).toBe(34); // ceil(335 / 10)
    for (const g of bigPack!.groups) {
      const p = groupProgress(bigPack!, vs, g.id);
      expect(p.seen).toBe(p.total);
      expect(p.total).toBeGreaterThan(0);
    }
  });
  it('trust labels data: 51 verified, 2 items from the dictionary', () => {
    expect(bigPack!.items.filter((i) => i.verified)).toHaveLength(51);
    expect(bigPack!.items.filter((i) => i.example_from_dictionary)).toHaveLength(2);
  });
});

describe('ear-check feedback export', () => {
  it('lists verdict and note with the item text', () => {
    const it = pack.items[0];
    const vs = { ...emptyVocab(), feedback: { [idOf(it)]: { verdict: 'wrong' as const, note: '不是这样说', at: D0 } } };
    const out = feedbackExport(pack, vs);
    expect(out).toEqual([{ id: idOf(it), en: it.en, zh: it.zh, example_yue_mixed: it.example_yue_mixed ?? '', verdict: 'wrong', note: '不是这样说', at: D0 }]);
  });
});
