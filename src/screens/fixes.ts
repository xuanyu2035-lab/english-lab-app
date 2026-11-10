/** 错 → 对 cards: see the wrong sentence, think where it is wrong, then see the right one and why. */
import { canSpeak, speak } from '../media';
import { hooks } from '../sessionHooks';
import { state } from '../store';
import { btn, h, mount, progressBar } from '../ui';
import { exitTo, topbar } from './practice';

let seenCount = 0;
export const fixesSeen = () => seenCount;

export function renderFixes() {
  const cards = state.pack!.grammar_fixes;
  let i = 0;
  const back = '/vocab';
  const finish = () => mount(document.getElementById('app')!, topbar('错 → 对', back),
    h('div', { class: 'screen narrow' }, h('div', { class: 'card focus center' },
      h('div', { class: 'big-emoji' }, '🎯'), h('h2', {}, cards.length ? '这一组看完了' : '内容包里没有错→对卡片'),
      btn(hooks.active ? '继续 →' : '回去', () => exitTo(back), 'primary big'))));
  const show = () => {
    if (i >= cards.length) return finish();
    const c = cards[i];
    let revealed = false;
    const draw = () => {
      const card = h('div', { class: 'card focus' },
        h('div', { class: 'muted small' }, '这句英文有问题：'),
        h('div', { class: 'en-big wrong-text' }, c.wrong));
      if (!revealed) card.append(h('p', { class: 'muted' }, '先想一想：哪里不对？'), btn('看答案', () => { revealed = true; draw(); }, 'primary big'));
      else {
        card.append(h('div', { class: 'muted small' }, '正确说法：'), h('div', { class: 'en-big right-text' }, c.right),
          ...(canSpeak('en') ? [btn('🔊 听', () => speak(c.right, 'en'), 'ghost')] : []),
          h('div', { class: 'note' }, c.why),
          btn(i + 1 >= cards.length ? '完成' : '下一张 →', () => {
            seenCount++; i++;
            if (hooks.active && hooks.timeUp()) return finish();
            show();
          }, 'primary big'));
      }
      mount(document.getElementById('app')!, topbar('错 → 对', back),
        h('div', { class: 'screen narrow' }, h('div', { class: 'muted small' }, `${i + 1} / ${cards.length}`), progressBar(i, cards.length), card));
    };
    draw();
  };
  if (!cards.length) return finish();
  show();
}
