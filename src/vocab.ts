/** Vocabulary logic (pure, no DOM): ordering, FSRS scheduling with two buttons, daily limits, review prompts. */
import { createEmptyCard, fsrs, Rating as FRating } from 'ts-fsrs';
import type { Card } from 'ts-fsrs';
import { itemId } from './content';
import type { ContentPack, Item } from './types';

export interface SrsEntry { card: Card; introduced: string }
export type Verdict = 'heard' | 'unheard' | 'wrong';
export interface Feedback { verdict: Verdict; note: string; at: string }
export interface DayCounts { date: string; newDone: number; reviewDone: number }
export interface VocabState {
  srs: Record<string, SrsEntry>;
  day: DayCounts;
  introSeen: Record<string, true>;
  feedback: Record<string, Feedback>;
}
export const emptyVocab = (): VocabState => ({ srs: {}, day: { date: '', newDone: 0, reviewDone: 0 }, introSeen: {}, feedback: {} });

export interface Images { [id: string]: { src: string; credit: string } }
export type Scenes = Record<string, string>;

const scheduler = fsrs();

/** Cards come back from IndexedDB / JSON backups: make sure date fields are Dates again. */
export function reviveCard(c: Card): Card {
  const x = { ...c } as Card;
  x.due = new Date(c.due);
  if (c.last_review) x.last_review = new Date(c.last_review);
  return x;
}

export const idOf = (it: Item) => itemId(it.part, it.no);

/** Items in learning order: group order first (parts → groups), then item number. */
export function orderedItems(pack: ContentPack): Item[] {
  const gi = new Map(pack.groups.map((g, i) => [g.id, i]));
  return [...pack.items].sort((a, b) => (gi.get(a.group) ?? 999) - (gi.get(b.group) ?? 999) || a.no - b.no);
}
export const itemById = (pack: ContentPack, id: string): Item | undefined => pack.items.find((i) => idOf(i) === id);

/** Counters reset on a new day. */
export function dayCounts(vs: VocabState, today: string): DayCounts {
  return vs.day.date === today ? vs.day : { date: today, newDone: 0, reviewDone: 0 };
}
export const newLeft = (vs: VocabState, today: string, limit: number) => Math.max(0, limit - dayCounts(vs, today).newDone);
export const reviewLeft = (vs: VocabState, today: string, limit: number) => Math.max(0, limit - dayCounts(vs, today).reviewDone);

/** Next unseen items (group order), at most `n`. */
export function nextNewItems(pack: ContentPack, vs: VocabState, n: number): Item[] {
  return orderedItems(pack).filter((it) => !vs.srs[idOf(it)]).slice(0, Math.max(0, n));
}
/** All cards due now, oldest first (not limited). */
export function dueEntries(vs: VocabState, now: Date): string[] {
  return Object.entries(vs.srs)
    .filter(([, e]) => new Date(e.card.due).getTime() <= now.getTime())
    .sort((a, b) => new Date(a[1].card.due).getTime() - new Date(b[1].card.due).getTime())
    .map(([id]) => id);
}
/** Today's review queue: due cards limited by what is left of the daily limit; the rest simply wait (no backlog nagging). */
export function reviewQueue(vs: VocabState, now: Date, today: string, limit: number): string[] {
  return dueEntries(vs, now).slice(0, reviewLeft(vs, today, limit));
}

export type Grade = 'good' | 'again';
/** Rate one word: "记得" → Good, "忘了" → Again. First rating introduces the card. */
export function rateWord(vs: VocabState, id: string, grade: Grade, now: Date, today: string): VocabState {
  const existing = vs.srs[id];
  const isNew = !existing;
  const card = existing ? reviveCard(existing.card) : createEmptyCard(now);
  const res = scheduler.next(card, now, grade === 'good' ? FRating.Good : FRating.Again);
  const d = dayCounts(vs, today);
  return {
    ...vs,
    srs: { ...vs.srs, [id]: { card: res.card, introduced: existing?.introduced ?? today } },
    day: { ...d, newDone: d.newDone + (isNew ? 1 : 0), reviewDone: d.reviewDone + (isNew ? 0 : 1) },
  };
}

// ---------- review prompts ----------
/** The Cantonese-mixed example with the English word hidden, or null if the word is not in it. */
export function clozeSentence(it: Item): string | null {
  const s = it.example_yue_mixed;
  if (!s || it.type === 'sentence') return null;
  const i = s.toLowerCase().indexOf(it.en.toLowerCase());
  if (i < 0) return null;
  return `${s.slice(0, i)}＿＿＿${s.slice(i + it.en.length)}`;
}
function hash(s: string): number { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
/** Deterministic wrong options from the same group (then the same part). */
export function distractors(pack: ContentPack, it: Item, n: number, seed = ''): Item[] {
  const same = (x: Item) => x.type === it.type && idOf(x) !== idOf(it) && x.en.toLowerCase() !== it.en.toLowerCase();
  const pool = [...pack.items.filter((x) => same(x) && x.group === it.group), ...pack.items.filter((x) => same(x) && x.group !== it.group && x.part === it.part)];
  const uniq = [...new Map(pool.map((x) => [x.en.toLowerCase(), x])).values()];
  const front = uniq.slice(0, 12);
  return front.sort((a, b) => hash(idOf(a) + seed) - hash(idOf(b) + seed)).slice(0, n);
}
export type ReviewMode = 'say' | 'choose';
/** Alternate between "say it" and "pick it" so review is retrieval, not recognition of English. */
export function reviewMode(pack: ContentPack, it: Item, reps: number): ReviewMode {
  if (it.type === 'sentence') return 'say';
  if (distractors(pack, it, 3).length < 3) return 'say';
  return (it.no + reps) % 2 === 0 ? 'choose' : 'say';
}
export function choiceOptions(pack: ContentPack, it: Item, seed: string): Item[] {
  const opts = [...distractors(pack, it, 3, seed), it];
  return opts.sort((a, b) => hash(idOf(a) + seed + 'o') - hash(idOf(b) + seed + 'o'));
}

// ---------- Cantonese glossary (tap a Cantonese word → Mandarin meaning) ----------
export interface GSeg { text: string; zh?: string }
export function glossarySegments(text: string, glossary: { yue: string; zh: string }[]): GSeg[] {
  const entries = [...glossary].filter((g) => g.yue).sort((a, b) => b.yue.length - a.yue.length);
  const out: GSeg[] = [];
  let buf = '';
  let i = 0;
  while (i < text.length) {
    const hit = entries.find((g) => text.startsWith(g.yue, i));
    if (hit) {
      if (buf) { out.push({ text: buf }); buf = ''; }
      out.push({ text: hit.yue, zh: hit.zh });
      i += hit.yue.length;
    } else { buf += text[i]; i++; }
  }
  if (buf) out.push({ text: buf });
  return out;
}

// ---------- progress numbers ----------
export const introducedCount = (vs: VocabState) => Object.keys(vs.srs).length;
export const reviewTotal = (vs: VocabState) => Object.values(vs.srs).reduce((a, e) => a + (e.card.reps ?? 0), 0);
export function groupProgress(pack: ContentPack, vs: VocabState, groupId: string): { seen: number; total: number } {
  const items = pack.items.filter((i) => i.group === groupId);
  return { seen: items.filter((i) => vs.srs[idOf(i)]).length, total: items.length };
}

/** Text for the "耳朵复核" export (for the Owner to fix content). */
export function feedbackExport(pack: ContentPack, vs: VocabState) {
  return Object.entries(vs.feedback).map(([id, f]) => {
    const it = itemById(pack, id);
    return { id, en: it?.en ?? '', zh: it?.zh ?? '', example_yue_mixed: it?.example_yue_mixed ?? '', verdict: f.verdict, note: f.note, at: f.at };
  });
}
export const VERDICT_LABEL: Record<Verdict, string> = { heard: '我听过', unheard: '没听过', wrong: '说法不对' };
