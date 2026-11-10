/** 造句: 骨架加槽 (slots from the self-intro skeleton) and 拼句 (rebuild a sentence from chunks). No free writing. */
import {
  arrangeTasks, checkArrangement, shuffledOrder, slotOptions, slotPool, slotTasks,
} from '../compose';
import type { ArrangeTask, SlotTask } from '../compose';
import { canSpeak, speak, speakSentence } from '../media';
import { hooks } from '../sessionHooks';
import { state } from '../store';
import { btn, h, mount, progressBar } from '../ui';
import { exitTo, go, topbar } from './practice';

const root = () => document.getElementById('app')!;
let practiced = 0;
export const composeDone = () => practiced;

export function renderComposeHub() {
  const p = state.pack!;
  const nSlots = slotTasks(p).length, nArr = arrangeTasks(p).length;
  mount(root(), topbar('造句', '/'),
    h('div', { class: 'screen narrow' },
      h('p', { class: 'muted' }, '不用自己写，只换“槽”里的词、或把打散的词块排回原句。'),
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, '骨架加槽'),
        h('div', { class: 'muted small' }, `用自我介绍的骨架：句子固定，只换空格里的词。共 ${nSlots} 句。`),
        btn('开始', () => go('/compose/slots'), 'primary big')),
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, '拼句'),
        h('div', { class: 'muted small' }, `把打散的词块点回原来的顺序：先稿子里的句子，后词库例句。共 ${nArr} 句。`),
        btn('开始', () => go('/compose/arrange'), 'primary big')),
      h('div', { class: 'card' }, h('div', { class: 'card-title' }, '混合'), btn('两种轮流练', () => go('/compose/mix'), 'ghost big'))));
}

type Task = SlotTask | ArrangeTask;

export function runCompose(mode: 'slots' | 'arrange' | 'mix') {
  const p = state.pack!;
  const slots = slotTasks(p), arr = arrangeTasks(p);
  let tasks: Task[];
  if (mode === 'slots') tasks = slots;
  else if (mode === 'arrange') tasks = arr;
  else { tasks = []; const n = Math.max(slots.length, arr.length); for (let i = 0; i < n && tasks.length < 16; i++) { if (slots[i]) tasks.push(slots[i]); if (arr[i]) tasks.push(arr[i]); } }
  let i = 0;
  const back = '/compose';
  const finish = () => mount(root(), topbar('造句', back),
    h('div', { class: 'screen narrow' }, h('div', { class: 'card focus center' },
      h('div', { class: 'big-emoji' }, '🧩'), h('h2', {}, tasks.length ? '这一组练完了' : '这里还没有可以练的句子'),
      btn(hooks.active ? '继续 →' : '回到造句', () => exitTo(back), 'primary big'))));
  const next = () => {
    practiced++; i++;
    if (hooks.active && hooks.timeUp()) return finish();
    show();
  };
  const show = () => {
    if (i >= tasks.length) return finish();
    const t = tasks[i];
    const head = h('div', {}, h('div', { class: 'muted small' }, `${i + 1} / ${tasks.length}`), progressBar(i, tasks.length));
    mount(root(), topbar('造句', back), h('div', { class: 'screen narrow' }, head, t.kind === 'slots' ? slotCard(t, next) : arrangeCard(t, next)));
  };
  show();
}

function slotCard(t: SlotTask, onNext: () => void): HTMLElement {
  const pool = slotPool(state.pack!);
  const filled: (string | null)[] = t.tpl.answers.map(() => null);
  let active = 0;
  let wrongTaps = 0;
  const card = h('div', { class: 'card focus' });
  const draw = () => {
    const line = h('div', { class: 'en-big slot-line' });
    t.tpl.parts.forEach((part) => {
      if ('text' in part) line.append(part.text);
      else {
        const k = part.slot;
        const b = h('button', { class: `slot ${filled[k] ? 'filled' : ''} ${k === active && !filled[k] ? 'active' : ''}`, type: 'button', 'aria-label': `第 ${k + 1} 个空` }, filled[k] ?? '＿＿＿＿');
        b.addEventListener('click', () => { if (!filled[k]) { active = k; draw(); } });
        line.append(b);
      }
    });
    card.replaceChildren(
      h('div', { class: 'chip-row' }, h('span', { class: 'chip amber' }, t.step ? `骨架第 ${t.step} 步${t.label ? `：${t.label}` : ''}` : '自我介绍句型')),
      line, h('div', { class: 'zh' }, t.sentence.zh));
    const done = filled.every((x) => x !== null);
    if (!done) {
      const k = filled.findIndex((x) => x === null);
      if (filled[active] !== null) active = k;
      const opts = slotOptions(pool, t.tpl.answers[active], `${t.id}:${active}`);
      card.append(h('div', { class: 'muted small' }, '点一个词，放进空格：'),
        h('div', { class: 'choices' }, opts.map((o) => {
          const b = h('button', { class: 'btn choice', type: 'button' }, o);
          b.addEventListener('click', () => {
            if (o.toLowerCase() === t.tpl.answers[active].toLowerCase()) { filled[active] = t.tpl.answers[active]; draw(); }
            else { wrongTaps++; b.classList.add('wrong'); b.setAttribute('disabled', ''); }
          });
          return b;
        })));
    } else {
      card.append(h('p', { class: wrongTaps ? 'muted' : 'good-text' }, wrongTaps ? `完成（选错 ${wrongTaps} 次）` : '全对！'),
        ...(canSpeak('en') ? [btn('🔊 听整句', () => speakSentence(t.sentence.en), 'ghost')] : []),
        btn('下一句 →', onNext, 'primary big'));
    }
  };
  draw();
  return card;
}

function arrangeCard(t: ArrangeTask, onNext: () => void): HTMLElement {
  const order = shuffledOrder(t.chunks.length, `${t.id}`);
  let attempt: number[] = [];
  let marks: boolean[] | null = null;
  let solved = false;
  const card = h('div', { class: 'card focus' });
  const draw = () => {
    const used = new Set(attempt);
    const ans = h('div', { class: 'answer-line', 'aria-label': '你排的句子' });
    attempt.forEach((ci, pos) => {
      const b = h('button', { class: `chunk lit ${marks ? (marks[pos] ? 'ok' : 'no') : ''}`, type: 'button' }, t.chunks[ci]);
      b.addEventListener('click', () => { if (solved) return; attempt = attempt.filter((x) => x !== ci); marks = null; draw(); });
      ans.append(b);
    });
    if (!attempt.length) ans.append(h('span', { class: 'muted' }, '点下面的词块，从第一块开始排'));
    const bank = h('div', { class: 'chunks' }, order.map((ci) => {
      const b = h('button', { class: `chunk ${used.has(ci) ? 'used' : ''}`, type: 'button' }, t.chunks[ci]);
      if (used.has(ci)) b.setAttribute('disabled', '');
      b.addEventListener('click', () => { if (solved) return; attempt = [...attempt, ci]; marks = null; draw(); });
      return b;
    }));
    card.replaceChildren(
      h('div', { class: 'chip-row' }, h('span', { class: 'chip amber' }, t.source === 'script' ? '稿子里的句子' : '词库例句')),
      h('div', { class: 'zh strong big' }, t.zh), ans, bank);
    if (solved) {
      card.append(h('div', { class: 'en-big right-text' }, t.en),
        ...(canSpeak('en') ? [btn('🔊 听', () => speak(t.en, 'en'), 'ghost')] : []),
        btn('下一句 →', onNext, 'primary big'));
    } else {
      card.append(h('div', { class: 'row-center' },
        btn('检查', () => {
          const r = checkArrangement(t.chunks, attempt);
          marks = r.marks;
          if (r.correct) solved = true;
          draw();
        }, 'primary'),
        btn('重来', () => { attempt = []; marks = null; draw(); }, 'ghost'),
        btn('看答案', () => { attempt = t.chunks.map((_, k) => k); marks = null; solved = true; draw(); }, 'ghost')));
      if (marks && !marks.every(Boolean)) card.append(h('div', { class: 'bad-text small center' }, '红色的块位置不对，点它拿回去再试。'));
    }
  };
  draw();
  return card;
}
