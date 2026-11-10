/** Sentence building (pure): slot templates from the self-introduction skeleton, and chunk-ordering tasks. */
import { blankify } from './content';
import type { ContentPack, Item, Sentence } from './types';

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}
/** Deterministic shuffle (so tests and replays are stable). */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  return arr.map((v, i) => ({ v, k: hash(`${seed}:${i}:${JSON.stringify(v)}`) })).sort((a, b) => a.k - b.k).map((x) => x.v);
}

// ---------- 骨架加槽 ----------
export type TPart = { text: string } | { slot: number };
export interface SlotTemplate { parts: TPart[]; answers: string[] }
const PUNCT_TAIL = /([.,;:!?]+)$/;
/** Turns a sentence into text + slots, using the Owner's own blank_keys as the slot positions. Adjacent blank words form one slot. */
export function slotTemplate(s: Sentence): SlotTemplate {
  const segs = blankify(s.en, s.blank_keys);
  const parts: TPart[] = [];
  const answers: string[] = [];
  let i = 0;
  while (i < segs.length) {
    if (!segs[i].blank) { parts.push({ text: segs[i].text }); i++; continue; }
    const words: string[] = [];
    let tail = '';
    let j = i;
    while (j < segs.length && (segs[j].blank || (/^\s+$/.test(segs[j].text) && j + 1 < segs.length && segs[j + 1].blank))) {
      if (segs[j].blank) words.push(segs[j].text);
      j++;
    }
    const last = words[words.length - 1];
    const m = last.match(PUNCT_TAIL);
    if (m) { words[words.length - 1] = last.slice(0, -m[1].length); tail = m[1]; }
    parts.push({ slot: answers.length });
    answers.push(words.join(' '));
    if (tail) parts.push({ text: tail });
    i = j;
  }
  return { parts, answers };
}
/** The right word plus up to two wrong ones from other slots of the same script. */
export function slotOptions(pool: string[], answer: string, seed: string): string[] {
  const wrong = [...new Set(pool.filter((w) => w.toLowerCase() !== answer.toLowerCase()))];
  const pick = seededShuffle(wrong, seed).slice(0, 2);
  return seededShuffle([answer, ...pick], `${seed}:o`);
}
export interface SlotTask { kind: 'slots'; id: string; sentence: Sentence; step: number; label: string; tpl: SlotTemplate }
export function slotTasks(pack: ContentPack): SlotTask[] {
  const scr = pack.real_tasks.self_intro;
  const labels = scr.skeleton_steps ?? {};
  return scr.sentences
    .filter((s) => s.blank_keys.length > 0)
    .map((s) => ({ s, tpl: slotTemplate(s) }))
    .filter((x) => x.tpl.answers.length > 0)
    .sort((a, b) => (a.s.skeleton_step ?? 99) - (b.s.skeleton_step ?? 99) || a.s.no - b.s.no)
    .map(({ s, tpl }) => ({ kind: 'slots' as const, id: `self_intro-${s.no}`, sentence: s, step: s.skeleton_step ?? 0, label: s.skeleton_label ?? labels[String(s.skeleton_step)] ?? '', tpl }));
}
export const slotPool = (pack: ContentPack): string[] => slotTasks(pack).flatMap((t) => t.tpl.answers);

// ---------- 拼句 ----------
export interface ArrangeTask { kind: 'arrange'; id: string; en: string; zh: string; chunks: string[]; source: 'script' | 'vocab' }
/** Chunks for a sentence that has none (vocabulary example sentences): one word per block, punctuation stays attached. */
export function wordChunks(en: string): string[] {
  return en.split(/\s+/).filter(Boolean);
}
export function arrangeTasks(pack: ContentPack): ArrangeTask[] {
  const out: ArrangeTask[] = [];
  for (const id of ['self_intro', 'speech_4104'] as const) {
    for (const s of pack.real_tasks[id].sentences) {
      const chunks = s.chunks.map((c) => c.en);
      if (chunks.length < 2 || chunks.some((c) => /_{3,}/.test(c))) continue; // one block, or has name blanks → nothing to arrange
      out.push({ kind: 'arrange', id: `${id}-${s.no}`, en: s.en, zh: s.zh, chunks, source: 'script' });
    }
  }
  for (const it of pack.items as Item[]) {
    if (it.type !== 'sentence' || !it.example_en) continue;
    const chunks = wordChunks(it.example_en);
    if (chunks.length >= 3 && chunks.length <= 12) out.push({ kind: 'arrange', id: `${it.part}-${it.no}`, en: it.example_en, zh: it.example_zh ?? it.zh, chunks, source: 'vocab' });
  }
  return out;
}
/** Shuffled order of block indices that is never the solved order. */
export function shuffledOrder(n: number, seed: string): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  let out = seededShuffle(idx, seed);
  for (let k = 1; out.every((v, i) => v === i) && k < 20; k++) out = seededShuffle(idx, `${seed}#${k}`);
  return out;
}
/** For each position of the learner's attempt: is it the right block? (blocks identified by index; equal text counts as equal) */
export function checkArrangement(chunks: string[], attempt: number[]): { correct: boolean; marks: boolean[] } {
  const marks = attempt.map((ci, pos) => chunks[ci] === chunks[pos]);
  return { correct: attempt.length === chunks.length && marks.every(Boolean), marks };
}
