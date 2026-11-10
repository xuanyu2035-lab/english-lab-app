import { canSpeak, speak } from '../media';
import { saveProgress, scripts, state, } from '../store';
import type { ScriptId } from '../types';
import { btn, h, mount } from '../ui';
import { SCRIPT_NAME } from './home';
import { audioTools, topbar } from './practice';

const root = () => document.getElementById('app')!;

export function renderRescue() {
  const scr = scripts()!.speech_4104;
  const rows = (scr.fallback_simple_words ?? []).map((w) =>
    h('div', { class: 'card rescue' },
      h('div', { class: 'muted small' }, '原稿里的词'), h('div', { class: 'en-mid' }, w.script),
      h('div', { class: 'muted small' }, '忘了就说'), h('div', { class: 'en-mid amber' }, w.say_instead),
      w.note ? h('div', { class: 'note' }, w.note) : null,
      canSpeak('en') ? btn('🔊 听', () => speak(w.say_instead), 'ghost') : null));
  const nums = (scr.numbers ?? []).map((n) =>
    h('tr', {}, h('td', {}, n.written), h('td', { class: 'amber' }, n.spoken), h('td', { class: 'muted small' }, n.where),
      h('td', {}, canSpeak('en') ? btn('🔊', () => speak(n.spoken), 'ghost') : null)));
  mount(root(), topbar('救场词（忘词时用）', '/script/speech_4104'),
    h('div', { class: 'screen narrow' },
      h('p', { class: 'muted' }, '台上忘了原稿的词？不用停，换成右边这个简单说法，意思一样，听众听得懂。'),
      ...rows,
      nums.length ? h('div', {}, h('h3', {}, '数字怎么读'), h('div', { class: 'card' }, h('table', { class: 'tbl' }, nums))) : null));
}

export function renderHard() {
  const words = state.pack!.real_tasks.hard_words_for_read_aloud;
  let i = 0;
  const draw = () => {
    const w = words[i];
    mount(root(), topbar('难读词：听 → 跟读', '/'),
      h('div', { class: 'screen narrow' },
        h('div', { class: 'muted small center' }, `${i + 1} / ${words.length}`),
        h('div', { class: 'card focus center' },
          h('div', { class: 'en-huge' }, w),
          h('div', { class: 'muted' }, '① 先听  ② 自己大声读  ③ 录音回放对比'),
          audioTools(`hard-${w}`, w)),
        h('div', { class: 'row-center' },
          btn('← 上一个', () => { i = Math.max(0, i - 1); draw(); }, 'ghost'),
          btn('下一个 →', () => { i = Math.min(words.length - 1, i + 1); draw(); }, 'primary'))));
  };
  if (!words.length) { mount(root(), topbar('难读词', '/'), h('div', { class: 'screen' }, '内容包里没有难读词。')); return; }
  draw();
}

export function renderChecklist(id: ScriptId) {
  const scr = scripts()![id];
  const items = scr.confirm_with_user ?? [];
  const rows = items.map((c, idx) => {
    const key = `${id}:${idx}`;
    const cb = h('input', { type: 'checkbox', id: `ck-${idx}`, checked: !!state.progress.checklist[key] });
    cb.addEventListener('change', () => {
      void saveProgress({ ...state.progress, checklist: { ...state.progress.checklist, [key]: cb.checked } });
    });
    return h('label', { class: 'card check', for: `ck-${idx}` }, cb,
      h('div', {}, h('div', { class: 'card-title' }, `${c.where}：${c.what}`), h('div', { class: 'muted' }, c.action)));
  });
  mount(root(), topbar(`上台前确认：${SCRIPT_NAME[id]}`, `/script/${id}`),
    h('div', { class: 'screen narrow' },
      h('p', { class: 'muted' }, '这些事要你自己确认，勾选只是给你自己记；App 不会改你的稿子。'),
      ...rows, items.length ? null : h('div', { class: 'card' }, '没有需要确认的事项。')));
}

export function renderNotes(id: ScriptId) {
  const scr = scripts()![id];
  const list = (title: string, rows: Node[]) => rows.length ? h('div', {}, h('h3', {}, title), h('div', { class: 'card' }, rows)) : null;
  mount(root(), topbar(`词汇与语法：${SCRIPT_NAME[id]}`, `/script/${id}`),
    h('div', { class: 'screen narrow' },
      list('骨架（每一步说什么）', Object.entries(scr.skeleton_steps ?? {}).map(([k, v]) => h('div', { class: 'line' }, `${k}. ${v}`))),
      list('词汇', (scr.vocab ?? []).map((v) => h('div', { class: 'line' }, h('b', {}, v.en), `  ${v.zh}`))),
      list('介词怎么选', (scr.preps ?? []).map((p) => h('div', { class: 'line' }, h('b', {}, p.phrase), `  → ${p.word}：${p.idea}`))),
      list('语法点', (scr.grammar ?? []).map((g) => h('div', { class: 'line' }, h('b', {}, g.pattern), h('div', { class: 'muted' }, g.plain))))));
}
