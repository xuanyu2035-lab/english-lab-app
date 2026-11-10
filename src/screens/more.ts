/** "更多" menu: everything that is not the two scripts (lesson, vocabulary, composing, reference, settings, help). */
import { go, topbar } from './practice';
import { saveSettings, state } from '../store';
import { btn, h, mount, progressBar } from '../ui';
import { dueEntries, introducedCount } from '../vocab';

const root = () => document.getElementById('app')!;

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
    h('div', { class: 'card-title' }, '一节课（自动排好的一套练习）'),
    h('div', { class: 'muted small' }, '稿子 + 词库 + 造句混着练，每一段、休息、总结都可以跳过。'),
    h('button', { class: 'btn primary big start-btn', type: 'button', onclick: () => { void saveSettings({ minutes }).then(() => go(`/session/${minutes}`)); } }, '▶ 开始今天的课'),
    row);
}

function linkCard(href: string, title: string, sub: string, extra?: Node): HTMLElement {
  return h('a', { class: 'card link-card', href }, h('div', { class: 'card-title' }, title), h('div', { class: 'muted small' }, sub), extra ?? null);
}

export function renderMore() {
  const p = state.pack;
  const vocab = p && p.items.length
    ? linkCard('#/vocab', '粤英夹杂词库', `已学 ${introducedCount(state.vocab)} / ${p.items.length} 个 · 现在可复习 ${dueEntries(state.vocab, new Date()).length} 张`,
      progressBar(introducedCount(state.vocab), p.items.length))
    : null;
  mount(root(), topbar('更多', '/'),
    h('div', { class: 'screen narrow' },
      p ? startCard() : null,
      vocab,
      p ? linkCard('#/compose', '🧩 造句', '骨架加槽、拼句') : null,
      p && p.grammar_fixes.length ? linkCard('#/fixes', '错 → 对卡片', '常见的错句和正确说法') : null,
      p ? linkCard('#/hard', '📣 难读词跟读', '稿子里难读的词，一个一个跟读') : null,
      p ? linkCard('#/reference', '📎 参考页', '量词、BIM 流程、粤语小词典') : null,
      linkCard('#/settings', '⚙ 设置', '声音（美式英语、语速、重复次数）、日期、外观、备份'),
      linkCard('#/help', '❓ 帮助', '怎么用、怎么装更自然的美式声音（iPad / 安卓 / Windows）'),
      h('div', { class: 'row-center' }, btn('← 回首页', () => go('/'), 'ghost'))));
}
