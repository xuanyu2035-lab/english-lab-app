/** One lesson ("一节课"): auto-planned segments, 1-minute rests, immersive mode, closing summary card. */
import { todayStr } from '../dates';
import { noiseSupported, startNoise, stopNoise } from '../noise';
import { KIND_LABEL, planSession, totalMinutes } from '../plan';
import type { Block, BlockKind, Minutes } from '../plan';
import {
  allDueReviews, daysLeft, getSentenceProgress, sectionStatus, sprintMode,
} from '../schedule';
import { reviewOffsets, saveSettings, scripts, state } from '../store';
import { hooks } from '../sessionHooks';
import { SCRIPT_IDS } from '../types';
import type { ScriptId } from '../types';
import { btn, h, mount, toast } from '../ui';
import { introducedCount, newLeft, nextNewItems, reviewQueue, reviewTotal } from '../vocab';
import { arrangeTasks, slotTasks } from '../compose';
import { composeDone } from './compose';
import { fixesSeen } from './fixes';
import { SCRIPT_NAME } from './home';
import { go, topbar } from './practice';

const root = () => document.getElementById('app')!;

// ---------- extension points (vocabulary, composing, error→correct register themselves) ----------
type Builder = () => string[];
const extraBuilders: Partial<Record<BlockKind, Builder>> = {};
export function registerBuilder(kind: BlockKind, fn: Builder) { extraBuilders[kind] = fn; }
const statProviders: { label: string; get: () => number }[] = [];
export function registerStat(label: string, get: () => number) { statProviders.push({ label, get }); }

// ---------- queue builders ----------
function orderedScripts(): ScriptId[] {
  const today = todayStr();
  return [...SCRIPT_IDS].sort((a, b) => daysLeft(state.settings, a, today) - daysLeft(state.settings, b, today));
}
function lastSolid(id: ScriptId): number {
  const scr = scripts()![id];
  let last = 0;
  for (const sec of scr.sections) if (sectionStatus(state.progress, id, scr, sec.no) === 'solid') last = sec.no; else break;
  return last;
}
const scriptNew = (): string[] => {
  const out: string[] = [];
  for (const id of orderedScripts()) {
    const scr = scripts()![id];
    for (const sec of scr.sections) {
      if (sectionStatus(state.progress, id, scr, sec.no) !== 'solid') out.push(`/script/${id}/learn/${sec.no}`);
    }
  }
  return out.slice(0, 10);
};
const dueReviews = (): string[] =>
  allDueReviews(state.progress, scripts()!, todayStr(), reviewOffsets()).map((d) => `/script/${d.script}/review/${d.secNo}/${d.offset}`);
const chainLearned = (): string[] => orderedScripts().filter((id) => lastSolid(id) > 0).map((id) => `/script/${id}/chain/${lastSolid(id)}`);
const fullRuns = (): string[] => {
  const out: string[] = [];
  for (const id of orderedScripts()) {
    const n = scripts()![id].sections.length;
    const ls = lastSolid(id);
    if (ls === n) out.push(`/script/${id}/full`);
    else if (ls > 0) out.push(`/script/${id}/chain/${ls}`);
  }
  return out;
};
export function buildQueue(kind: BlockKind): string[] {
  const extra = extraBuilders[kind]?.() ?? [];
  switch (kind) {
    case 'script-new': { const q = scriptNew(); return q.length ? q : fullRuns(); }
    case 'script-review': { const q = dueReviews(); return q.length ? q : chainLearned(); }
    case 'full-run': return fullRuns();
    case 'review': { const q = [...dueReviews(), ...extra]; return q.length ? q : chainLearned(); }
    default: return extra;
  }
}

// ---------- session state ----------
interface Snapshot { passed: number; ratings: number; learned: number; reviews: number; fullRuns: number; extra: number[] }
interface Session {
  blocks: Block[]; segIdx: number; queue: string[]; segStart: number; startedAt: number; before: Snapshot; minutes: Minutes;
  restTimer: number | null;
}
let S: Session | null = null;
let ticker: number | null = null;

function snapshot(): Snapshot {
  const sc = scripts()!;
  let passed = 0, ratings = 0, learned = 0, reviews = 0;
  for (const id of SCRIPT_IDS) {
    for (const s of sc[id].sentences) {
      const p = getSentenceProgress(state.progress, id, s.no);
      if (p.passedL4) passed++;
      ratings += p.n;
    }
  }
  for (const sec of Object.values(state.progress.sections)) {
    if (sec.learnedDay) learned++;
    reviews += Object.keys(sec.reviews).length;
  }
  const fullRunsN = Object.values(state.progress.fullRuns).reduce((a, d) => a + d.length, 0);
  return { passed, ratings, learned, reviews, fullRuns: fullRunsN, extra: statProviders.map((s) => s.get()) };
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const segBudget = () => (S ? S.blocks[Math.min(S.segIdx, S.blocks.length - 1)].minutes * 60000 : 0);
const segLeft = () => (S ? segBudget() - (Date.now() - S.segStart) : 0);

function installHooks() {
  hooks.active = true;
  hooks.immersive = state.settings.immersive;
  hooks.timeUp = () => !!S && segLeft() <= 0;
  hooks.advance = advance;
  hooks.skip = skipSegment;
  hooks.quit = quit;
  hooks.remaining = () => (S ? fmt(segLeft()) : '');
  document.body.classList.toggle('immersive', hooks.immersive);
  ticker = window.setInterval(() => {
    document.querySelectorAll('.session-timer').forEach((el) => {
      el.textContent = hooks.remaining();
      el.classList.toggle('over', hooks.timeUp());
    });
  }, 1000);
}
function removeHooks() {
  hooks.active = false; hooks.immersive = false;
  hooks.timeUp = () => false; hooks.advance = () => undefined; hooks.skip = () => undefined; hooks.quit = () => undefined; hooks.remaining = () => '';
  document.body.classList.remove('immersive');
  if (ticker) { clearInterval(ticker); ticker = null; }
  stopNoise();
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
}

export function startSession(minutes: Minutes) {
  const today = todayStr();
  const blocks = planSession(minutes, sprintMode(state.settings, today));
  S = { blocks, segIdx: 0, queue: [], segStart: Date.now(), startedAt: Date.now(), before: snapshot(), minutes, restTimer: null };
  installHooks();
  if (state.settings.immersive) void document.documentElement.requestFullscreen?.().catch(() => undefined);
  startNoise(state.settings.noise);
  beginSegment();
}

function beginSegment() {
  if (!S) return;
  while (S.segIdx < S.blocks.length) {
    const q = buildQueue(S.blocks[S.segIdx].kind);
    if (q.length) { S.queue = q; S.segStart = Date.now(); advance(); return; }
    S.segIdx++; // nothing to do for this segment (e.g. no vocabulary yet) → skip
  }
  showSummary();
}

function advance() {
  if (!S) return;
  if (S.queue.length && segLeft() > 0) { go(S.queue.shift()!); return; }
  S.segIdx++;
  if (S.segIdx >= S.blocks.length) return showSummary();
  showRest();
}

/** Skip what is left of this segment (the Owner is free to move on at any time). */
function skipSegment() {
  if (!S) return;
  S.queue = [];
  advance();
}

function showRest() {
  if (!S) return;
  const next = S.blocks[S.segIdx];
  const countdown = h('div', { class: 'rest-count', role: 'timer' }, '01:00');
  const end = Date.now() + 60000;
  const finish = () => { if (S?.restTimer) { clearInterval(S.restTimer); S.restTimer = null; } beginSegment(); };
  S.restTimer = window.setInterval(() => {
    const left = end - Date.now();
    countdown.textContent = fmt(left);
    if (left <= 0) finish();
  }, 500);
  mount(root(), topbar('休息一下', null),
    h('div', { class: 'screen narrow' },
      h('div', { class: 'card focus center' },
        h('div', { class: 'big-emoji' }, '☕'),
        h('h2', {}, '休息 1 分钟'),
        h('p', { class: 'muted' }, '站起来，喝口水，看看远处。'),
        countdown,
        h('p', {}, `接下来：${next.label}（${next.minutes} 分钟）`),
        btn('跳过休息，继续 →', finish, 'primary big'))));
}

function quit() {
  if (!S) return;
  if (!confirm('现在结束这节课吗？已经练过的进度都会保留。')) return;
  if (S.restTimer) { clearInterval(S.restTimer); S.restTimer = null; }
  showSummary();
}

function showSummary() {
  const s = S;
  if (s?.restTimer) clearInterval(s.restTimer);
  const after = s ? snapshot() : null;
  const minutes = s ? Math.max(1, Math.round((Date.now() - s.startedAt) / 60000)) : 0;
  S = null;
  removeHooks();
  const lines: string[] = [];
  if (s && after) {
    const d = (a: number, b: number) => a - b;
    if (d(after.passed, s.before.passed) > 0) lines.push(`新记牢（什么都不看也说得出）的句子：+${d(after.passed, s.before.passed)}`);
    if (d(after.learned, s.before.learned) > 0) lines.push(`新学会的小节：+${d(after.learned, s.before.learned)}`);
    if (d(after.reviews, s.before.reviews) > 0) lines.push(`完成的小节复习：${d(after.reviews, s.before.reviews)} 次`);
    if (d(after.fullRuns, s.before.fullRuns) > 0) lines.push('完成了全文连说');
    statProviders.forEach((p, i) => { const v = after.extra[i] - s.before.extra[i]; if (v > 0) lines.push(`${p.label}：+${v}`); });
    lines.push(`自评练习：${d(after.ratings, s.before.ratings)} 次`);
  }
  const sc = scripts()!;
  const shaky = SCRIPT_IDS.flatMap((id) => sc[id].sentences.filter((x) => {
    const p = getSentenceProgress(state.progress, id, x.no);
    return p.n > 0 && p.last && p.last !== 'smooth';
  }).slice(0, 4).map((x) => `${SCRIPT_NAME[id]} 第 ${x.no} 句：${x.cue}`));
  mount(root(), topbar('今天学会了什么', '/'),
    h('div', { class: 'screen narrow' },
      h('div', { class: 'card focus center' },
        h('div', { class: 'big-emoji' }, '🎓'),
        h('h2', {}, '这节课到这里结束'),
        h('p', { class: 'muted' }, `用时约 ${minutes} 分钟。你已经做完今天的事，可以放心休息。`),
        h('div', { class: 'summary-list' }, lines.map((l) => h('div', { class: 'line' }, l))),
        shaky.length ? h('div', { class: 'trouble' }, h('div', { class: 'muted small' }, '明天多留意这几句（还不太稳）：'), ...shaky.slice(0, 5).map((t) => h('div', { class: 'trouble-row' }, t))) : null,
        btn('回到首页', () => go('/'), 'primary big'))));
}

// ---------- vocabulary / error→correct segments ----------
const hasVocab = () => !!state.pack && state.pack.items.length > 0;
registerBuilder('vocab-new', () => {
  if (!hasVocab()) return [];
  const s = state.settings;
  return newLeft(state.vocab, todayStr(), s.newWordsPerDay) > 0 && nextNewItems(state.pack!, state.vocab, 1).length ? ['/vocab/learn'] : [];
});
const vocabReviewQueue = () => (hasVocab() && reviewQueue(state.vocab, new Date(), todayStr(), state.settings.reviewsPerDay).length ? ['/vocab/review'] : []);
registerBuilder('vocab-review', vocabReviewQueue);
registerBuilder('review', vocabReviewQueue);
registerBuilder('fixes', () => (state.pack && state.pack.grammar_fixes.length ? ['/fixes'] : []));
registerBuilder('compose', () => (state.pack && (slotTasks(state.pack).length || arrangeTasks(state.pack).length) ? ['/compose/mix'] : []));
registerStat('造句练习', () => composeDone());
registerStat('新学的词', () => introducedCount(state.vocab));
registerStat('词库复习', () => reviewTotal(state.vocab));
registerStat('看过的错→对卡片', () => fixesSeen());

// ---------- start screen ----------
export function renderSession(preset?: Minutes) {
  const today = todayStr();
  const sprint = sprintMode(state.settings, today);
  let minutes: Minutes = preset ?? state.settings.minutes;
  const list = h('div', { class: 'plan-list' });
  const minRow = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '这节课多久' });
  const draw = () => {
    minRow.replaceChildren(...([30, 60, 90, 120] as const).map((m) => {
      const b = h('button', { class: `seg-btn ${m === minutes ? 'on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(m === minutes) }, `${m} 分钟`);
      b.addEventListener('click', () => { minutes = m; draw(); });
      return b;
    }));
    const blocks = planSession(minutes, sprint);
    list.replaceChildren(...blocks.map((b, i) => h('div', { class: 'plan-row' }, h('span', {}, `${i + 1}. ${b.label}`), h('span', { class: 'muted' }, `${b.minutes} 分钟`))),
      h('div', { class: 'muted small' }, `共 ${totalMinutes(blocks)} 分钟，段落之间休息 1 分钟（可跳过）。`));
  };
  draw();
  const imm = h('input', { type: 'checkbox', id: 's-imm', checked: state.settings.immersive });
  imm.addEventListener('change', () => void saveSettings({ immersive: imm.checked }));
  const noise = h('select', { id: 's-noise', class: 'input' },
    h('option', { value: 'off' }, '关'), h('option', { value: 'brown' }, '棕噪音（低沉，像远处的雨声）'), h('option', { value: 'white' }, '白噪音（沙沙声）'));
  noise.value = state.settings.noise;
  noise.addEventListener('change', () => void saveSettings({ noise: noise.value as 'off' | 'white' | 'brown' }));
  mount(root(), topbar('开始今天的课', '/'),
    h('div', { class: 'screen narrow' },
      sprint ? h('div', { class: 'banner' }, '🔥 考前冲刺：稿子占 70% 以上。') : null,
      h('div', { class: 'field' }, h('div', { class: 'label' }, '这节课练多久'), minRow),
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, '今天的安排'), list),
      h('div', { class: 'field' }, h('label', { class: 'check-line', for: 's-imm' }, imm, '沉浸模式（全屏、隐藏导航、一次一件事）')),
      noiseSupported() ? h('div', { class: 'field' }, h('label', { class: 'label', for: 's-noise' }, '背景声'), noise) : null,
      btn('开始 ▶', () => { void saveSettings({ minutes }).then(() => startSession(minutes)); }, 'primary big')));
}
