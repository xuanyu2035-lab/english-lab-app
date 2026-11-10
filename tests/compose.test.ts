import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { validateContentPack } from '../src/content';
import {
  arrangeTasks, checkArrangement, seededShuffle, shuffledOrder, slotOptions, slotPool, slotTasks, slotTemplate, wordChunks,
} from '../src/compose';
import type { ContentPack, Sentence } from '../src/types';

const sample = validateContentPack(JSON.parse(readFileSync('public/sample-content.json', 'utf8'))).pack!;
const hasPrivate = existsSync('private/content.json');
const big: ContentPack | null = hasPrivate ? validateContentPack(JSON.parse(readFileSync('private/content.json', 'utf8'))).pack! : null;

const sent = (en: string, keys: string[]): Sentence => ({ no: 1, section_no: 1, section: 'x', en, zh: '', chunks: [], cue: '', blank_keys: keys });

describe('slot templates', () => {
  it('replaces the blank_keys with slots and keeps everything else', () => {
    const t = slotTemplate(sent('We sail the little boat today.', ['sail', 'today']));
    expect(t.answers).toEqual(['sail', 'today']);
    const text = t.parts.map((p) => ('text' in p ? p.text : '▢')).join('');
    expect(text).toBe('We ▢ the little boat ▢.');
  });
  it('multi-word keys become one slot and punctuation stays outside the slot', () => {
    const t = slotTemplate(sent('I walk in the garden.', ['in the garden']));
    expect(t.answers).toEqual(['in the garden']);
    expect(t.parts.map((p) => ('text' in p ? p.text : '▢')).join('')).toBe('I walk ▢.');
  });
  it('filling the slots with the answers rebuilds the original sentence', () => {
    for (const task of slotTasks(big ?? sample)) {
      const rebuilt = task.tpl.parts.map((p) => ('text' in p ? p.text : task.tpl.answers[p.slot])).join('');
      expect(rebuilt).toBe(task.sentence.en);
    }
  });
  it('options contain the answer exactly once, at most 3 options, deterministic', () => {
    const pool = slotPool(big ?? sample);
    const a = slotOptions(pool, pool[0], 's');
    expect(a.filter((x) => x === pool[0])).toHaveLength(1);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(slotOptions(pool, pool[0], 's')).toEqual(a);
  });
  it('slot tasks follow the skeleton order', () => {
    const steps = slotTasks(big ?? sample).map((t) => t.step);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });
  it.skipIf(!big)('4104 sentences are never turned into slot tasks (no invented blanks)', () => {
    expect(slotTasks(big!).every((t) => t.id.startsWith('self_intro-'))).toBe(true);
  });
});

describe('arrange (拼句)', () => {
  it('a shuffle is never the solved order and uses every block once', () => {
    for (let n = 2; n <= 8; n++) {
      const o = shuffledOrder(n, `seed${n}`);
      expect([...o].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(o.every((v, i) => v === i)).toBe(false);
    }
  });
  it('seededShuffle is deterministic', () => {
    expect(seededShuffle([1, 2, 3, 4, 5], 'x')).toEqual(seededShuffle([1, 2, 3, 4, 5], 'x'));
  });
  it('checkArrangement marks wrong positions and accepts the right order', () => {
    const chunks = ['One day', 'we sailed', 'a paper boat.'];
    expect(checkArrangement(chunks, [0, 1, 2])).toEqual({ correct: true, marks: [true, true, true] });
    expect(checkArrangement(chunks, [0, 2, 1])).toEqual({ correct: false, marks: [true, false, false] });
    expect(checkArrangement(chunks, [0, 1]).correct).toBe(false);
  });
  it('duplicate blocks are interchangeable', () => {
    expect(checkArrangement(['a b', 'c', 'a b'], [2, 1, 0]).correct).toBe(true);
  });
  it('wordChunks splits on spaces and keeps punctuation attached', () => {
    expect(wordChunks('Dear friend, I am writing.')).toEqual(['Dear', 'friend,', 'I', 'am', 'writing.']);
  });
  it('script sentences come first, then vocabulary example sentences; every task rebuilds its sentence', () => {
    const tasks = arrangeTasks(big ?? sample);
    const firstVocab = tasks.findIndex((t) => t.source === 'vocab');
    expect(firstVocab).toBeGreaterThan(0);
    expect(tasks.slice(0, firstVocab).every((t) => t.source === 'script')).toBe(true);
    expect(tasks.slice(firstVocab).every((t) => t.source === 'vocab')).toBe(true);
    for (const t of tasks) expect(t.chunks.length).toBeGreaterThanOrEqual(2);
    for (const t of tasks.filter((x) => x.source === 'vocab')) expect(t.chunks.join(' ')).toBe(t.en);
  });
  it.skipIf(!big)('script tasks use the Owner chunks as-is and skip single-block / name-blank sentences', () => {
    const tasks = arrangeTasks(big!);
    const scriptTasks = tasks.filter((t) => t.source === 'script');
    expect(scriptTasks.length).toBeGreaterThan(20);
    expect(scriptTasks.some((t) => t.id === 'self_intro-1')).toBe(false); // a one-block sentence has nothing to arrange
    expect(scriptTasks.some((t) => t.id === 'speech_4104-3')).toBe(false); // has name blanks
    for (const t of scriptTasks) expect(t.chunks.join(' ')).toBe(t.en);
  });
});
