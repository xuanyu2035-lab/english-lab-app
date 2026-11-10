import { sectionSentences } from '../content';
import { todayStr } from '../dates';
import {
  allDueReviews, daysLeft, fullRunDoneToday, getSectionProgress, getSentenceProgress, nextReviewDate,
  sectionStatus, sprintMode, suggestedNewSections, targetDate,
} from '../schedule';
import type { SectionStatus } from '../schedule';
import { reviewOffsets, saveSettings, scripts, state } from '../store';
import type { Script, ScriptId, Sentence } from '../types';
import { SCRIPT_IDS } from '../types';
import { btn, h, mount, pct, progressBar } from '../ui';
import { go, knowTest, topbar } from './practice';
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

  mount(root(), topbar('EnglishLab 粤英学习舱', null, h('a', { class: 'back', href: '#/more' }, '更多 ☰')),
    h('div', { class: 'screen' },
      sprint ? h('div', { class: 'banner' }, '🔥 考前冲刺：离面试/展示不到 3 天，稿子优先，每天至少全文连说一次。') : null,
      h('h2', {}, '我的两篇稿子'),
      h('p', { class: 'muted small' }, '想练哪篇、哪一节、从哪一句开始，都由你选。点进去就能挑。'),
      h('div', { class: 'grid2' }, cards),
      h('details', { class: 'card' }, h('summary', {}, '今日推荐（只是建议，不用照做）'),
        tasks.length ? h('div', { class: 'task-list' }, tasks) : h('p', { class: 'muted' }, '今天没有特别的建议 👏 想练哪篇都可以。')),
      h('div', { class: 'row-center' }, btn('更多：一节课、词库、设置、帮助 ☰', () => go('/more'), 'ghost'))));
  void pct;
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
        btn('✅ 这节我会了', () => knowTest(id, sents, `我会了：小节 ${sec.no} · ${sec.name}`, `/script/${id}`), 'ghost'),
        btn('连说', () => go(`/script/${id}/chain/${sec.no}`), 'ghost'),
        dueNow ? btn('复习', () => go(`/script/${id}/review/${sec.no}/${dueNow.offset}`), 'ghost') : null),
      pickPanel(id, sec.no, sents));
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

const LEVELS: [string, string][] = [['understand', '先看懂'], ['L1', '全文'], ['L2', '挖空'], ['L3', '只看线索'], ['L4', '什么都不看']];
/** Free choice inside one section: start at any level, or pick any sentence (with its own level and "I know it"). */
function pickPanel(id: ScriptId, secNo: number, sents: Sentence[]): HTMLElement {
  const lv = (startNo: number, level: string, label: string) =>
    h('a', { class: 'chip-btn', href: `#/script/${id}/learn/${secNo}/${startNo}/${level}` }, label);
  return h('details', { class: 'pick' },
    h('summary', {}, '自己选：从哪一级、哪一句开始'),
    h('div', { class: 'muted small' }, '整节都从这一级开始：'),
    h('div', { class: 'row-wrap tight' }, LEVELS.map(([lvl, label]) => lv(0, lvl, label))),
    h('div', { class: 'muted small' }, '或者挑一句（每句都能选级别，也能直接测“我会了”）：'),
    h('div', { class: 'pick-list' }, sents.map((x) => {
      const p = getSentenceProgress(state.progress, id, x.no);
      return h('div', { class: 'pick-row' },
        h('div', { class: 'pick-text' }, h('b', {}, `第 ${x.no} 句`), ` ${p.passedL4 ? '✓ ' : ''}${x.cue}`),
        h('div', { class: 'row-wrap tight' },
          LEVELS.filter(([l]) => l !== 'L2' || x.blank_keys.length > 0).map(([lvl, label]) => lv(x.no, lvl, label)),
          h('button', { class: 'chip-btn know', type: 'button', onclick: () => knowTest(id, [x], `我会了：第 ${x.no} 句`, `/script/${id}`) }, '✅ 我会了')));
    })));
}
