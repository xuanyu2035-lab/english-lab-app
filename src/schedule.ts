import { addDays, daysBetween } from './dates';
import type { Progress, Rating, ScriptId, Script, SectionProgress, SentenceProgress, Settings } from './types';
import { sectionKey, sentenceId } from './types';
import { sectionSentences } from './content';

export const DEFAULT_REVIEW_OFFSETS = [0, 1, 3, 6];

export function getSentenceProgress(p: Progress, script: ScriptId, no: number): SentenceProgress {
  return p.sentences[sentenceId(script, no)] ?? { level: 1, passedL4: false, n: 0 };
}
export function getSectionProgress(p: Progress, script: ScriptId, secNo: number): SectionProgress {
  return p.sections[sectionKey(script, secNo)] ?? { reviews: {} };
}

/**
 * Apply a self-rating given while practising at `level` (1..4).
 *  smooth → next level (after L4: passedL4)
 *  stuck  → stay on the same level
 *  blank  → drop one level (min 1); loses passedL4
 */
export function applyRating(sp: SentenceProgress, level: number, rating: Rating): SentenceProgress {
  const next: SentenceProgress = { ...sp, last: rating, n: sp.n + 1 };
  if (rating === 'smooth') {
    if (level >= 4) { next.passedL4 = true; next.level = 4; } else { next.level = Math.max(sp.level, level + 1); }
  } else if (rating === 'stuck') {
    next.level = level;
    if (level >= 4) next.passedL4 = false;
  } else {
    next.level = Math.max(1, level - 1);
    next.passedL4 = false;
  }
  return next;
}
/** A sentence the user marked as already familiar in setup starts at L3. */
export const FAMILIAR_START: SentenceProgress = { level: 3, passedL4: false, n: 0 };

export type SectionStatus = 'new' | 'learning' | 'unstable' | 'solid';
export function sectionStatus(p: Progress, script: ScriptId, scr: Script, secNo: number): SectionStatus {
  const sents = sectionSentences(scr, secNo);
  const sps = sents.map((s) => getSentenceProgress(p, script, s.no));
  const sec = getSectionProgress(p, script, secNo);
  if (sps.length && sps.every((x) => x.passedL4)) return 'solid';
  if (sec.learnedDay) return 'unstable';
  if (sps.some((x) => x.n > 0 || x.level > 1)) return 'learning';
  return 'new';
}

/** Stamp learnedDay (once) when every sentence in the section has passed L4. */
export function markLearnedIfDone(p: Progress, script: ScriptId, scr: Script, secNo: number, today: string): Progress {
  const sents = sectionSentences(scr, secNo);
  const done = sents.length > 0 && sents.every((s) => getSentenceProgress(p, script, s.no).passedL4);
  const key = sectionKey(script, secNo);
  const sec = getSectionProgress(p, script, secNo);
  if (done && !sec.learnedDay) return { ...p, sections: { ...p.sections, [key]: { ...sec, learnedDay: today } } };
  return p;
}

export interface DueReview { script: ScriptId; secNo: number; offset: number; dueDate: string; overdueDays: number }
/** The earliest pending review for one section if it is due (today or overdue), else null. */
export function dueReview(sec: SectionProgress, today: string, offsets: number[] = DEFAULT_REVIEW_OFFSETS): { offset: number; dueDate: string; overdueDays: number } | null {
  if (!sec.learnedDay) return null;
  for (const off of offsets) {
    if (sec.reviews[String(off)]) continue;
    const dueDate = addDays(sec.learnedDay, off);
    const over = daysBetween(dueDate, today);
    return over >= 0 ? { offset: off, dueDate, overdueDays: over } : null;
  }
  return null;
}
/** Next pending review date (for display), or null when all are done. */
export function nextReviewDate(sec: SectionProgress, offsets: number[] = DEFAULT_REVIEW_OFFSETS): string | null {
  if (!sec.learnedDay) return null;
  for (const off of offsets) if (!sec.reviews[String(off)]) return addDays(sec.learnedDay, off);
  return null;
}
export function allDueReviews(p: Progress, scripts: Record<ScriptId, Script>, today: string, offsets: number[]): DueReview[] {
  const out: DueReview[] = [];
  for (const id of Object.keys(scripts) as ScriptId[]) {
    for (const s of scripts[id].sections) {
      const d = dueReview(getSectionProgress(p, id, s.no), today, offsets);
      if (d) out.push({ script: id, secNo: s.no, ...d });
    }
  }
  return out.sort((a, b) => b.overdueDays - a.overdueDays);
}
export function completeReview(p: Progress, script: ScriptId, secNo: number, offset: number, today: string): Progress {
  const key = sectionKey(script, secNo);
  const sec = getSectionProgress(p, script, secNo);
  return { ...p, sections: { ...p.sections, [key]: { ...sec, reviews: { ...sec.reviews, [String(offset)]: today } } } };
}

// ---------- dates / countdown ----------
export function targetDate(s: Settings, script: ScriptId): string {
  const d = script === 'self_intro' ? s.interviewDate : s.presentDate;
  return d ?? addDays(s.setupDate, 14); // "还不知道" → 14 days after setup
}
export function daysLeft(s: Settings, script: ScriptId, today: string): number {
  return daysBetween(today, targetDate(s, script));
}
/** Within 3 days of the interview or presentation → sprint mode (script share ≥ 70%). */
export function sprintMode(s: Settings, today: string): boolean {
  return (['self_intro', 'speech_4104'] as ScriptId[]).some((id) => {
    const d = daysLeft(s, id, today);
    return d >= 0 && d <= 3;
  });
}
export function fullRunDoneToday(p: Progress, script: ScriptId, today: string): boolean {
  return (p.fullRuns[script] ?? []).includes(today);
}
/** Suggested number of NEW sections today, aiming to finish ~2 days before the target. */
export function suggestedNewSections(p: Progress, script: ScriptId, scr: Script, s: Settings, today: string): number {
  const remaining = scr.sections.filter((sec) => sectionStatus(p, script, scr, sec.no) !== 'solid').length;
  if (remaining === 0) return 0;
  const spare = Math.max(1, daysLeft(s, script, today) - 2);
  const byMinutes = Math.max(1, Math.floor(s.minutes / 30)) + 1; // 30 min ≈ 2 new sections, 60 ≈ 3 ...
  return Math.min(remaining, Math.max(1, Math.min(byMinutes, Math.ceil(remaining / spare))));
}
