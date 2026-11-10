import { sectionSentences } from '../content';
import { todayStr } from '../dates';
import {
  allDueReviews, daysLeft, fullRunDoneToday, getSectionProgress, getSentenceProgress, nextReviewDate,
  sectionStatus, sprintMode, suggestedNewSections, targetDate,
} from '../schedule';
import type { SectionStatus } from '../schedule';
import { reviewOffsets, saveSettings, scripts, state } from '../store';
import type { Script, ScriptId } from '../types';
import { SCRIPT_IDS } from '../types';
import { dueEntries, introducedCount } from '../vocab';
import { btn, h, mount, pct, progressBar } from '../ui';
import { go, topbar } from './practice';
import { importCard } from './settings';

const root = () => document.getElementById('app')!;
export const SCRIPT_NAME: Record<ScriptId, string> = { self_intro: '面试自我介绍', speech_4104: '4104 演讲开头' };
const EVENT_NAME: Record<ScriptId, string> = { self_intro: '面试', speech_4104: '4104 展示' };
export const STATUS_LABEL: Record<SectionStatus, string> = { new: '没开始', learning: '学习中', unstable: '还不稳', solid: '会了' };

export function countdownText(id: ScriptId): string {
  const s = state.settings, today = todayStr();
  const d = daysLeft(s, id, today);
  const known = id === 'self_intro' ? s.interviewDate : s.presentDate;
  const base = d > 0 ? `离${EVENT_NAME[id]}还有 ${d} 天` : d === 0 ? `${EVENT_NAME[id]}就是今天！` : `${EVENT_NAME[id]}日期已过 ${-d} 天`;
  return known ? base : `${base}（日期还不知道，先按 14 天倒排）`;
}

function scriptProgress(id: ScriptId, scr: Script) {
  const total = scr.sections.length;
  const solid = scr.sections.filter((s) => sectionStatus(state.progress, id, scr, s.no) === 'solid').length;
  return { total, solid };
}

export function renderHome() {
  const sc = scripts();
  if (!sc) { return renderNoContent(); }
  const today = todayStr();
  const s = state.settings;
  const dues = allDueReviews(state.progress, sc, today, reviewOffsets());
  const tasks: Node[] = [];
  const sprint = sprintMode(s, today);

  for (const d of dues) {
    const sec = sc[d.script].sections.find((x) => x.no === d.secNo)!;
    tasks.push(taskRow(`复习：${SCRIPT_NAME[d.script]} · ${sec.name}`,
      d.overdueDays > 0 ? `已拖 ${d.overdueDays} 天，今天补上` : '今天该复习', '去复习', () => go(`/script/${d.script}/review/${d.secNo}/${d.offset}`)));
  }
  // new sections
  const order = [...SCRIPT_IDS].sort((a, b) => daysLeft(s, a, today) - daysLeft(s, b, today));
  for (const id of order) {
    const scr = sc[id];
    const n = suggestedNewSections(state.progress, id, scr, s, today);
    const pending = scr.sections.filter((x) => ['new', 'learning', 'unstable'].includes(sectionStatus(state.progress, id, scr, x.no)));
    pending.slice(0, n).forEach((sec) => {
      const st = sectionStatus(state.progress, id, scr, sec.no);
      tasks.push(taskRow(`${st === 'new' ? '新学' : '继续'}：${SCRIPT_NAME[id]} · ${sec.name}`, sec.meaning, st === 'new' ? '开始学' : '继续', () => go(`/script/${id}/learn/${sec.no}`)));
    });
  }
  for (const id of SCRIPT_IDS) {
    const d = daysLeft(s, id, today);
    const { total, solid } = scriptProgress(id, sc[id]);
    if (d >= 0 && solid === total && !fullRunDoneToday(state.progress, id, today)) {
      tasks.push(taskRow(`全文连说：${SCRIPT_NAME[id]}`, '考试前每天至少连说一次', '开始', () => go(`/script/${id}/full`)));
    }
  }

  const cards = SCRIPT_IDS.map((id) => {
    const { total, solid } = scriptProgress(id, sc[id]);
    const lvls = [0, 0, 0, 0];
    sc[id].sentences.forEach((x) => { const sp = getSentenceProgress(state.progress, id, x.no); lvls[(sp.passedL4 ? 4 : Math.min(sp.level, 4)) - 1]++; });
    return h('a', { class: 'card link-card', href: `#/script/${id}` },
      h('div', { class: 'card-title' }, SCRIPT_NAME[id]),
      h('div', { class: 'amber' }, countdownText(id)),
      h('div', { class: 'muted small' }, `小节 ${solid} / ${total} 会了 · 目标日 ${targetDate(s, id)}`),
      progressBar(solid, total),
      h('div', { class: 'muted small' }, `句子级别：L1 ${lvls[0]} · L2 ${lvls[1]} · L3 ${lvls[2]} · L4 ${lvls[3]}`));
  });

  mount(root(), topbar('EnglishLab 粤英学习舱', null, h('a', { class: 'back', href: '#/settings' }, '⚙ 设置')),
    h('div', { class: 'screen' },
      sprint ? h('div', { class: 'banner' }, '🔥 考前冲刺：离面试/展示不到 3 天，今天以稿子为主，每天至少全文连说一次。') : null,
      startCard(),
      h('details', { class: 'card' }, h('summary', {}, '今天要做的事（预览）'),
        tasks.length ? h('div', { class: 'task-list' }, tasks) : h('p', { class: 'muted' }, '今天的任务都做完了 👏 想多练可以进下面的稿子。')),
      h('h2', {}, '我的稿子'),
      h('div', { class: 'grid2' }, cards),
      state.pack && state.pack.items.length ? vocabCard() : null,
      h('div', { class: 'row-center' }, btn('📣 难读词跟读', () => go('/hard'), 'ghost'), btn('🧩 造句', () => go('/compose'), 'ghost'), btn('📎 参考页', () => go('/reference'), 'ghost'))));
  void pct;
}

function vocabCard(): HTMLElement {
  const p = state.pack!;
  const n = introducedCount(state.vocab);
  const due = dueEntries(state.vocab, new Date()).length;
  return h('a', { class: 'card link-card', href: '#/vocab' },
    h('div', { class: 'card-title' }, '粤英夹杂词库'),
    h('div', { class: 'muted small' }, `已学 ${n} / ${p.items.length} 个 · 现在可复习 ${due} 张`),
    progressBar(n, p.items.length));
}

function startCard(): HTMLElement {
  let minutes = state.settings.minutes;
  const row = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '这节课多久' });
  const draw = () => row.replaceChildren(...([30, 60, 90, 120] as const).map((m) => {
    const b = h('button', { class: `seg-btn ${m === minutes ? 'on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(m === minutes) }, `${m} 分钟`);
    b.addEventListener('click', () => { minutes = m; draw(); });
    return b;
  }));
  draw();
  return h('div', { class: 'card start-card' },
    h('button', { class: 'btn primary big start-btn', type: 'button', onclick: () => { void saveSettings({ minutes }).then(() => go(`/session/${minutes}`)); } }, '▶ 开始今天的课'),
    row);
}

function taskRow(title: string, sub: string, cta: string, onClick: () => void): HTMLElement {
  return h('div', { class: 'task' },
    h('div', { class: 'task-main' }, h('div', { class: 'task-title' }, title), h('div', { class: 'muted small' }, sub)),
    btn(cta, onClick, 'primary'));
}

function renderNoContent() {
  mount(root(), topbar('EnglishLab 粤英学习舱', null, h('a', { class: 'back', href: '#/settings' }, '⚙ 设置')),
    h('div', { class: 'screen narrow' },
      h('h2', {}, '先导入内容包'),
      h('p', { class: 'muted' }, '这个应用本身不含你的稿子和词库。请选择你的 content.json 文件导入（每台设备导入一次）。想先看看长什么样，可以载入一个虚构的示例。'),
      importCard(() => go('/'))));
}

// ---------- 单篇稿子 ----------
export function renderScript(id: ScriptId) {
  const sc = scripts();
  if (!sc) return renderNoContent();
  const scr = sc[id];
  const today = todayStr();
  const offsets = reviewOffsets();
  const rows = scr.sections.map((sec) => {
    const st = sectionStatus(state.progress, id, scr, sec.no);
    const sp = getSectionProgress(state.progress, id, sec.no);
    const sents = sectionSentences(scr, sec.no);
    const dots = sents.map((x) => {
      const p = getSentenceProgress(state.progress, id, x.no);
      const lvl = p.passedL4 ? 'ok' : `l${Math.min(p.level, 4)}`;
      return h('span', { class: `dot ${lvl}`, title: `第 ${x.no} 句` }, p.passedL4 ? '✓' : `L${Math.min(p.level, 4)}`);
    });
    const next = nextReviewDate(sp, offsets);
    const dueNow = allDueReviews(state.progress, { [id]: scr } as unknown as Record<ScriptId, Script>, today, offsets).find((d) => d.secNo === sec.no);
    return h('div', { class: `card sec ${st}` },
      h('div', { class: 'sec-head' },
        h('div', {}, h('div', { class: 'card-title' }, `${sec.no}. ${sec.name}`), h('div', { class: 'muted small' }, sec.meaning)),
        h('span', { class: `status ${st}` }, STATUS_LABEL[st])),
      h('div', { class: 'dots' }, dots),
      next ? h('div', { class: 'muted small' }, dueNow ? '🔔 今天该复习这一节' : `下次复习：${next}`) : null,
      h('div', { class: 'row-wrap' },
        btn(st === 'new' ? '开始学' : st === 'solid' ? '再学一遍' : '继续学', () => go(`/script/${id}/learn/${sec.no}`), 'primary'),
        btn('连说', () => go(`/script/${id}/chain/${sec.no}`), 'ghost'),
        dueNow ? btn('复习', () => go(`/script/${id}/review/${sec.no}/${dueNow.offset}`), 'ghost') : null));
  });
  const tools = h('div', { class: 'row-wrap' },
    btn('🔁 全文连说', () => go(`/script/${id}/full`), 'primary'),
    id === 'speech_4104' ? btn('🆘 救场词', () => go('/script/speech_4104/rescue'), 'ghost') : null,
    btn('✅ 上台前确认清单', () => go(`/script/${id}/checklist`), 'ghost'),
    btn('📖 词汇与语法', () => go(`/script/${id}/notes`), 'ghost'),
    btn('📣 难读词', () => go('/hard'), 'ghost'));
  const { solid, total } = scriptProgress(id, scr);
  mount(root(), topbar(SCRIPT_NAME[id], '/'),
    h('div', { class: 'screen' },
      h('div', { class: 'card' },
        h('div', { class: 'amber' }, countdownText(id)),
        h('div', { class: 'muted' }, scr.used_for),
        h('div', { class: 'muted small' }, scr.goal === 'verbatim' ? '目标：一字不差背下来' : '目标：尽量背下来（忘词可用救场词）'),
        h('div', { class: 'muted small' }, `小节 ${solid} / ${total} 会了`), progressBar(solid, total)),
      tools, h('div', { class: 'sec-list' }, rows)));
}
