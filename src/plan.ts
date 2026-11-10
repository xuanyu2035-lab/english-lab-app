/** Pure session planning: which segments make up one lesson of 30 / 60 / 90 / 120 minutes. */
export type BlockKind =
  | 'script-new' | 'script-review' | 'full-run'
  | 'vocab-new' | 'vocab-review' | 'review' | 'compose' | 'fixes';
export interface Block { kind: BlockKind; minutes: number; label: string }
export type Minutes = 30 | 60 | 90 | 120;

export const KIND_LABEL: Record<BlockKind, string> = {
  'script-new': '稿子：新内容',
  'script-review': '稿子：复习',
  'full-run': '稿子：全文连说',
  'vocab-new': '词库：学新词',
  'vocab-review': '词库：复习',
  review: '复习（稿子和词库）',
  compose: '造句',
  fixes: '错 → 对卡片',
};
export const SCRIPT_KINDS: BlockKind[] = ['script-new', 'script-review', 'full-run'];

type Spec = [BlockKind, number][];
// Default layout (task book 4.1)
const NORMAL: Record<Minutes, Spec> = {
  30: [['script-new', 15], ['script-review', 10], ['vocab-new', 5]],
  60: [['script-new', 25], ['vocab-new', 15], ['review', 10], ['compose', 10]],
  90: [['script-new', 25], ['vocab-new', 15], ['review', 10], ['compose', 10], ['full-run', 10], ['vocab-review', 10], ['fixes', 10]],
  120: [['script-new', 30], ['vocab-new', 20], ['review', 15], ['compose', 15], ['full-run', 15], ['vocab-review', 15], ['fixes', 10]],
};
// Sprint layout (≤ 3 days before the interview / presentation): scripts ≥ 70 %
const SPRINT: Record<Minutes, Spec> = {
  30: [['full-run', 15], ['script-review', 10], ['vocab-review', 5]],
  60: [['script-new', 15], ['full-run', 15], ['script-review', 15], ['vocab-review', 10], ['compose', 5]],
  90: [['script-new', 20], ['full-run', 25], ['script-review', 20], ['vocab-review', 10], ['compose', 10], ['fixes', 5]],
  120: [['script-new', 25], ['full-run', 30], ['script-review', 30], ['vocab-review', 15], ['compose', 10], ['fixes', 10]],
};

/** Segments of at most `max` minutes: a long block is cut into equal parts. */
export function splitLong(blocks: Block[], max = 15): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const parts = Math.ceil(b.minutes / max);
    if (parts <= 1) { out.push(b); continue; }
    let left = b.minutes;
    for (let i = 0; i < parts; i++) {
      const m = Math.ceil(left / (parts - i));
      out.push({ ...b, minutes: m });
      left -= m;
    }
  }
  return out;
}

export function planSession(minutes: Minutes, sprint: boolean): Block[] {
  const spec = (sprint ? SPRINT : NORMAL)[minutes];
  return splitLong(spec.map(([kind, m]) => ({ kind, minutes: m, label: KIND_LABEL[kind] })));
}
export const totalMinutes = (blocks: Block[]) => blocks.reduce((a, b) => a + b.minutes, 0);
export const scriptShare = (blocks: Block[]) =>
  blocks.filter((b) => SCRIPT_KINDS.includes(b.kind)).reduce((a, b) => a + b.minutes, 0) / Math.max(1, totalMinutes(blocks));
